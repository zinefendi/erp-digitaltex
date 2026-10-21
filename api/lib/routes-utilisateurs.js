'use strict';
// Gestion des comptes (Super administrateur) + lecture du journal d'audit.
const { pool, transaction } = require('./db');
const mdp = require('./mdp');
const S = require('./securite');

const ADMIN = S.exigerConnexion({ roles: ['super_admin'] });
const LECTURE_AUDIT = S.exigerConnexion({ roles: ['super_admin', 'direction'] });

const COLONNES = `u.id, u.identifiant, u.nom_complet, u.email, u.actif, u.doit_changer_mdp,
  u.verrouille_jusqu > now() as verrouille, u.derniere_connexion, u.cree_le, u.maj_le, u.version,
  array(select ro.code from noyau.utilisateur_roles ur join noyau.roles ro on ro.id = ur.role_id
         where ur.utilisateur_id = u.id order by ro.id) as roles`;

const lire = async (db, id) => (await db.query(`select ${COLONNES} from noyau.utilisateurs u where u.id = $1`, [id])).rows[0];

const erreur = (reply, code, err, message) => reply.code(code).send({ erreur: err, message });

/** Vérifie qu'il reste au moins un Super administrateur actif (sinon plus personne ne peut administrer). */
async function resteUnSuperAdmin(c) {
  const r = await c.query(`select count(*)::int n from noyau.utilisateurs u
    join noyau.utilisateur_roles ur on ur.utilisateur_id = u.id join noyau.roles ro on ro.id = ur.role_id
    where ro.code = 'super_admin' and u.actif`);
  return r.rows[0].n > 0;
}

async function poserRoles(c, id, codes) {
  const r = await c.query('select id, code from noyau.roles where code = any($1)', [codes]);
  if (r.rows.length !== new Set(codes).size) {
    const connus = r.rows.map((x) => x.code);
    const e = new Error('Rôle inconnu : ' + codes.filter((x) => !connus.includes(x)).join(', '));
    e.statusCode = 400; e.code = 'role_inconnu'; throw e;
  }
  await c.query('delete from noyau.utilisateur_roles where utilisateur_id = $1', [id]);
  for (const ro of r.rows) await c.query('insert into noyau.utilisateur_roles values ($1, $2)', [id, ro.id]);
}

const proprietesCompte = {
  nom_complet: { type: 'string', minLength: 2, maxLength: 120 },
  email: { type: ['string', 'null'], maxLength: 200 },
  roles: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 20, uniqueItems: true },
};

module.exports = async function routesUtilisateurs(app) {
  app.get('/api/roles', { preHandler: ADMIN }, async () =>
    (await pool.query('select id, code, libelle, description, systeme from noyau.roles order by id')).rows);

  app.get('/api/utilisateurs', { preHandler: ADMIN }, async () =>
    (await pool.query(`select ${COLONNES} from noyau.utilisateurs u order by u.actif desc, u.nom_complet`)).rows);

  app.get('/api/utilisateurs/:id', { preHandler: ADMIN, schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req, reply) => {
    const u = await lire(pool, req.params.id);
    return u || erreur(reply, 404, 'introuvable', 'Utilisateur introuvable.');
  });

  // Création : le mot de passe provisoire est renvoyé UNE seule fois ; il doit être changé à la 1re connexion.
  app.post('/api/utilisateurs', {
    preHandler: ADMIN,
    schema: { body: { type: 'object', required: ['identifiant', 'nom_complet', 'roles'], additionalProperties: false,
      properties: { identifiant: { type: 'string', minLength: 3, maxLength: 40 }, ...proprietesCompte } } },
  }, async (req, reply) => {
    const identifiant = req.body.identifiant.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(identifiant)) {
      return erreur(reply, 400, 'identifiant_invalide', 'Identifiant : 3 à 40 caractères, lettres minuscules sans accent, chiffres, point, tiret ou souligné.');
    }
    if (!req.body.roles.length) return erreur(reply, 400, 'roles_vides', 'Choisissez au moins un rôle.');
    const provisoire = mdp.provisoire();
    const h = await mdp.hacher(provisoire);
    try {
      const u = await transaction(async (c) => {
        const r = await c.query(
          `insert into noyau.utilisateurs (identifiant, nom_complet, email, mot_de_passe_hash, cree_par)
           values ($1, $2, $3, $4, $5) returning id`,
          [identifiant, req.body.nom_complet.trim(), (req.body.email || '').trim() || null, h, req.utilisateur.id]);
        await poserRoles(c, r.rows[0].id, req.body.roles);
        const cree = await lire(c, r.rows[0].id);
        await S.auditer(c, req, 'utilisateur_cree', { entite: 'utilisateur', entiteId: cree.id, apres: cree });
        return cree;
      });
      reply.code(201);
      return { utilisateur: u, mot_de_passe_provisoire: provisoire };
    } catch (e) {
      if (e.code === '23505') return erreur(reply, 409, 'identifiant_pris', 'Cet identifiant est déjà utilisé.');
      if (e.code === '23514') return erreur(reply, 400, 'donnee_invalide', 'Donnée invalide (vérifiez l’adresse e-mail).');
      throw e;
    }
  });

  // Modification : version obligatoire (pas d'écrasement silencieux si quelqu'un a modifié entre-temps).
  app.patch('/api/utilisateurs/:id', {
    preHandler: ADMIN,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: { type: 'object', required: ['version'], additionalProperties: false,
        properties: { version: { type: 'integer' }, actif: { type: 'boolean' }, ...proprietesCompte } },
    },
  }, async (req, reply) => {
    const b = req.body;
    try {
      return await transaction(async (c) => {
        const avant = (await c.query(`select ${COLONNES} from noyau.utilisateurs u where u.id = $1 for update`, [req.params.id])).rows[0];
        if (!avant) return erreur(reply, 404, 'introuvable', 'Utilisateur introuvable.');
        if (avant.version !== b.version) return erreur(reply, 409, 'conflit_version', 'Ce compte a été modifié par quelqu’un d’autre entre-temps. Rechargez la fiche avant de modifier.');
        if (b.roles && !b.roles.length) return erreur(reply, 400, 'roles_vides', 'Choisissez au moins un rôle.');
        await c.query(
          `update noyau.utilisateurs set
             nom_complet = coalesce($2, nom_complet),
             email = case when $3::boolean then $4 else email end,
             actif = coalesce($5, actif),
             maj_le = now(), version = version + 1
           where id = $1`,
          [avant.id, b.nom_complet?.trim() ?? null, 'email' in b, (b.email || '').trim() || null, b.actif ?? null]);
        if (b.roles) await poserRoles(c, avant.id, b.roles);
        if (!(await resteUnSuperAdmin(c))) {
          const e = new Error('Impossible : il doit rester au moins un Super administrateur actif.'); e.statusCode = 400; e.code = 'dernier_super_admin'; throw e;
        }
        if (b.actif === false) await c.query('update noyau.sessions set revoquee_le = now() where utilisateur_id = $1 and revoquee_le is null', [avant.id]);
        const apres = await lire(c, avant.id);
        await S.auditer(c, req, b.actif === false && avant.actif ? 'utilisateur_desactive' : b.actif === true && !avant.actif ? 'utilisateur_reactive' : 'utilisateur_modifie',
          { entite: 'utilisateur', entiteId: avant.id, avant, apres });
        return apres;
      });
    } catch (e) {
      if (e.statusCode === 400) return erreur(reply, 400, e.code, e.message);
      if (e.code === '23514') return erreur(reply, 400, 'donnee_invalide', 'Donnée invalide (vérifiez l’adresse e-mail).');
      throw e;
    }
  });

  // Réinitialisation du mot de passe par l'administrateur : nouveau provisoire, sessions fermées, compte déverrouillé.
  app.post('/api/utilisateurs/:id/reinitialiser-mdp', { preHandler: ADMIN, schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req, reply) => {
    const provisoire = mdp.provisoire();
    const h = await mdp.hacher(provisoire);
    const r = await transaction(async (c) => {
      const u = await c.query(
        `update noyau.utilisateurs set mot_de_passe_hash = $2, doit_changer_mdp = true, echecs_connexion = 0, verrouille_jusqu = null,
           mdp_change_le = now(), maj_le = now(), version = version + 1 where id = $1 returning id, identifiant`, [req.params.id, h]);
      if (!u.rows[0]) return null;
      await c.query('update noyau.sessions set revoquee_le = now() where utilisateur_id = $1 and revoquee_le is null', [req.params.id]);
      await S.auditer(c, req, 'mdp_reinitialise', { entite: 'utilisateur', entiteId: req.params.id });
      return u.rows[0];
    });
    if (!r) return erreur(reply, 404, 'introuvable', 'Utilisateur introuvable.');
    return { identifiant: r.identifiant, mot_de_passe_provisoire: provisoire };
  });

  app.post('/api/utilisateurs/:id/deverrouiller', { preHandler: ADMIN, schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req, reply) => {
    const r = await pool.query('update noyau.utilisateurs set echecs_connexion = 0, verrouille_jusqu = null where id = $1 returning id', [req.params.id]);
    if (!r.rows[0]) return erreur(reply, 404, 'introuvable', 'Utilisateur introuvable.');
    await S.auditer(pool, req, 'utilisateur_deverrouille', { entite: 'utilisateur', entiteId: req.params.id });
    return { ok: true };
  });

  // Sessions ouvertes d'un compte + fermeture à distance (poste perdu, départ d'un salarié…)
  app.get('/api/utilisateurs/:id/sessions', { preHandler: ADMIN, schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req) =>
    (await pool.query(`select id, cree_le, derniere_activite, ip, poste, agent from noyau.sessions
       where utilisateur_id = $1 and revoquee_le is null and expire_le > now()
         and derniere_activite > now() - make_interval(secs => $2) order by derniere_activite desc`,
    [req.params.id, S.INACTIVITE_MAX_MS / 1000])).rows);

  app.post('/api/utilisateurs/:id/fermer-sessions', { preHandler: ADMIN, schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req) => {
    const r = await pool.query('update noyau.sessions set revoquee_le = now() where utilisateur_id = $1 and revoquee_le is null and id <> $2', [req.params.id, req.utilisateur.session_id]);
    await S.auditer(pool, req, 'sessions_fermees', { entite: 'utilisateur', entiteId: req.params.id, details: { nombre: r.rowCount } });
    return { fermees: r.rowCount };
  });

  // Journal d'audit : lecture filtrée et paginée (Super admin et Direction)
  app.get('/api/audit', {
    preHandler: LECTURE_AUDIT,
    schema: { querystring: { type: 'object', additionalProperties: false, properties: {
      depuis: { type: 'string', format: 'date-time' }, jusqu: { type: 'string', format: 'date-time' },
      utilisateur_id: { type: 'integer' }, action: { type: 'string', maxLength: 60 }, entite: { type: 'string', maxLength: 60 },
      avant_id: { type: 'integer' }, limite: { type: 'integer', minimum: 1, maximum: 500, default: 100 } } } },
  }, async (req) => {
    const q = req.query;
    const r = await pool.query(
      `select id, horodatage, utilisateur_id, identifiant, poste, ip, action, entite, entite_id, avant, apres, details
         from noyau.audit
        where ($1::timestamptz is null or horodatage >= $1) and ($2::timestamptz is null or horodatage < $2)
          and ($3::int is null or utilisateur_id = $3) and ($4::text is null or action = $4)
          and ($5::text is null or entite = $5) and ($6::bigint is null or id < $6)
        order by id desc limit $7`,
      [q.depuis || null, q.jusqu || null, q.utilisateur_id ?? null, q.action || null, q.entite || null, q.avant_id ?? null, q.limite]);
    return { lignes: r.rows, suite: r.rows.length === q.limite ? r.rows[r.rows.length - 1].id : null };
  });
};
