'use strict';
// Rôles et droits (module 10). Lecture : droit parametres.roles/lire. Écriture : Super administrateur seulement.
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');
const { defautRole } = require('./droits-catalogue');

const ADMIN = S.exigerConnexion({ roles: ['super_admin'] });
const LECTURE = S.exigerConnexion({ droit: ['parametres.roles', 'lire'] });
const idParam = { params: { type: 'object', properties: { id: { type: 'integer' } } } };
const erreur = (reply, code, err, message) => reply.code(code).send({ erreur: err, message });

async function lireRole(db, id) {
  const r = (await db.query(`select ro.id, ro.code, ro.libelle, ro.description, ro.systeme, ro.version, ro.maj_le,
      (select count(*)::int from noyau.utilisateur_roles ur join noyau.utilisateurs u on u.id = ur.utilisateur_id
        where ur.role_id = ro.id and u.actif) as nb_utilisateurs
    from noyau.roles ro where ro.id = $1`, [id])).rows[0];
  if (!r) return null;
  const [d, v] = await Promise.all([
    db.query('select fonction, action from noyau.role_droits where role_id = $1 order by fonction, action', [id]),
    db.query('select visibilite from noyau.role_visibilites where role_id = $1 order by visibilite', [id]),
  ]);
  const droits = {};
  for (const x of d.rows) (droits[x.fonction] ||= []).push(x.action);
  return { ...r, droits: r.code === 'super_admin' ? 'tout' : droits, visibilites: r.code === 'super_admin' ? 'tout' : v.rows.map((x) => x.visibilite) };
}

/** Valide et écrit la matrice d'un rôle (remplacement complet). */
async function ecrireDroits(c, roleId, droits, visibilites) {
  const cat = await D.catalogue(c);
  const inconnus = [];
  for (const [f, acts] of Object.entries(droits)) {
    const ok = cat.actionsDe[f];
    if (!ok) { inconnus.push(f); continue; }
    for (const a of acts) if (!ok.includes(a)) inconnus.push(`${f}/${a}`);
  }
  const visOk = cat.visibilites.map((x) => x.code);
  for (const v of visibilites) if (!visOk.includes(v)) inconnus.push('visibilité ' + v);
  if (inconnus.length) { const e = new Error('Droit inconnu ou non applicable : ' + inconnus.slice(0, 5).join(', ')); e.statusCode = 400; e.code = 'droit_inconnu'; throw e; }
  // « lire » est la base : une action sans lecture n'a pas de sens
  for (const [f, acts] of Object.entries(droits)) if (acts.length && !acts.includes('lire')) acts.unshift('lire');
  await c.query('delete from noyau.role_droits where role_id = $1', [roleId]);
  await c.query('delete from noyau.role_visibilites where role_id = $1', [roleId]);
  const paires = Object.entries(droits).flatMap(([f, acts]) => [...new Set(acts)].map((a) => [f, a]));
  if (paires.length) {
    await c.query('insert into noyau.role_droits select $1, f, a from unnest($2::text[], $3::text[]) t(f, a)',
      [roleId, paires.map((p) => p[0]), paires.map((p) => p[1])]);
  }
  if (visibilites.length) await c.query('insert into noyau.role_visibilites select $1, unnest($2::text[])', [roleId, [...new Set(visibilites)]]);
}

const schemaDroits = {
  droits: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string', maxLength: 20 }, maxItems: 10 }, maxProperties: 200 },
  visibilites: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 20 },
};

module.exports = async function routesRoles(app) {
  // Mes droits : utilisé par les postes pour afficher seulement les modules et boutons autorisés.
  app.get('/api/droits/moi', { config: { mdpProvisoireOk: true }, preHandler: S.exigerConnexion() }, async (req) => {
    const cat = await D.catalogue();
    const eff = req.droits;
    return {
      super_admin: eff.super_admin, droits: eff.droits, visibilites: eff.visibilites,
      modules: cat.modules.filter((m) => m.fonctions.some((f) => D.peut(eff, f.code, 'lire'))).map((m) => m.code),
    };
  });

  app.get('/api/droits/catalogue', { preHandler: LECTURE }, async () => {
    const cat = await D.catalogue();
    return { actions: cat.actions, visibilites: cat.visibilites, modules: cat.modules };
  });

  app.get('/api/roles', { preHandler: S.exigerConnexion({ droit: ['parametres.utilisateurs', 'lire'] }) }, async () =>
    (await pool.query(`select ro.id, ro.code, ro.libelle, ro.description, ro.systeme, ro.version,
       (select count(*)::int from noyau.utilisateur_roles ur join noyau.utilisateurs u on u.id = ur.utilisateur_id where ur.role_id = ro.id and u.actif) as nb_utilisateurs
       from noyau.roles ro order by ro.systeme desc, ro.id`)).rows);

  app.get('/api/roles/:id', { preHandler: LECTURE, schema: idParam }, async (req, reply) =>
    (await lireRole(pool, req.params.id)) || erreur(reply, 404, 'introuvable', 'Rôle introuvable.'));

  // Rôle personnalisé : démarre sans aucun droit (CDC § 4.10), ou copie d'un rôle existant.
  app.post('/api/roles', {
    preHandler: ADMIN,
    schema: { body: { type: 'object', required: ['libelle'], additionalProperties: false, properties: {
      libelle: { type: 'string', minLength: 2, maxLength: 60 }, description: { type: 'string', maxLength: 300 },
      copier_de: { type: 'integer' } } } },
  }, async (req, reply) => {
    const libelle = req.body.libelle.trim();
    const base = libelle.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'role';
    try {
      const role = await transaction(async (c) => {
        let code = 'p_' + base, n = 1;
        while ((await c.query('select 1 from noyau.roles where code = $1', [code])).rowCount) code = `p_${base}_${++n}`;
        const r = await c.query('insert into noyau.roles (code, libelle, description, systeme) values ($1, $2, $3, false) returning id',
          [code, libelle, (req.body.description || '').trim()]);
        const id = r.rows[0].id;
        if (req.body.copier_de) {
          const src = await lireRole(c, req.body.copier_de);
          if (!src) { const e = new Error('Rôle à copier introuvable.'); e.statusCode = 400; e.code = 'introuvable'; throw e; }
          if (src.code === 'super_admin') { const e = new Error('Le rôle Super administrateur ne peut pas être copié.'); e.statusCode = 400; e.code = 'copie_interdite'; throw e; }
          await ecrireDroits(c, id, src.droits, src.visibilites);
        }
        const cree = await lireRole(c, id);
        await S.auditer(c, req, 'role_cree', { entite: 'role', entiteId: id, apres: cree, details: req.body.copier_de ? { copie_de: req.body.copier_de } : null });
        return cree;
      });
      reply.code(201); return role;
    } catch (e) {
      if (e.code === '23505') return erreur(reply, 409, 'libelle_pris', 'Un rôle porte déjà ce nom.');
      throw e;
    }
  });

  // Modification : nom/description (rôles personnalisés), matrice de droits (tous sauf Super admin).
  app.put('/api/roles/:id', {
    preHandler: ADMIN,
    schema: { ...idParam, body: { type: 'object', required: ['version'], additionalProperties: false, properties: {
      version: { type: 'integer' }, libelle: { type: 'string', minLength: 2, maxLength: 60 }, description: { type: 'string', maxLength: 300 }, ...schemaDroits } } },
  }, async (req, reply) => transaction(async (c) => {
    const avant = await lireRole(c, req.params.id);
    if (!avant) return erreur(reply, 404, 'introuvable', 'Rôle introuvable.');
    await c.query('select 1 from noyau.roles where id = $1 for update', [avant.id]);
    if (avant.version !== req.body.version) return erreur(reply, 409, 'conflit_version', 'Ce rôle a été modifié par quelqu’un d’autre entre-temps. Rechargez-le avant de modifier.');
    if (avant.code === 'super_admin') return erreur(reply, 400, 'role_protege', 'Le Super administrateur a tous les droits : ce rôle ne se modifie pas.');
    if (avant.systeme && (req.body.libelle || req.body.description !== undefined)) return erreur(reply, 400, 'role_fourni', 'Le nom d’un rôle fourni ne se change pas. Créez un rôle personnalisé si besoin.');
    if (req.body.droits || req.body.visibilites) {
      await ecrireDroits(c, avant.id, req.body.droits ?? avant.droits, req.body.visibilites ?? avant.visibilites);
    }
    await c.query(`update noyau.roles set libelle = coalesce($2, libelle), description = coalesce($3, description),
      version = version + 1, maj_le = now() where id = $1`, [avant.id, req.body.libelle?.trim() ?? null, req.body.description?.trim() ?? null]);
    const apres = await lireRole(c, avant.id);
    await S.auditer(c, req, 'role_modifie', { entite: 'role', entiteId: avant.id, avant, apres });
    return apres;
  }));

  // Remet un rôle fourni à la matrice du cahier des charges.
  app.post('/api/roles/:id/reinitialiser', { preHandler: ADMIN, schema: idParam }, async (req, reply) => transaction(async (c) => {
    const avant = await lireRole(c, req.params.id);
    if (!avant) return erreur(reply, 404, 'introuvable', 'Rôle introuvable.');
    if (!avant.systeme || avant.code === 'super_admin') return erreur(reply, 400, 'non_applicable', 'Seuls les rôles fournis ont une matrice par défaut.');
    const { MATRICE } = require('./droits-catalogue');
    await ecrireDroits(c, avant.id, defautRole(avant.code), MATRICE[avant.code].visibilites.slice());
    await c.query('update noyau.roles set version = version + 1, maj_le = now() where id = $1', [avant.id]);
    const apres = await lireRole(c, avant.id);
    await S.auditer(c, req, 'role_reinitialise', { entite: 'role', entiteId: avant.id, avant, apres });
    return apres;
  }));

  // Suppression : rôles personnalisés non attribués seulement.
  app.delete('/api/roles/:id', { preHandler: ADMIN, schema: idParam }, async (req, reply) => transaction(async (c) => {
    const avant = await lireRole(c, req.params.id);
    if (!avant) return erreur(reply, 404, 'introuvable', 'Rôle introuvable.');
    if (avant.systeme) return erreur(reply, 400, 'role_fourni', 'Un rôle fourni ne se supprime pas.');
    const n = (await c.query('select count(*)::int n from noyau.utilisateur_roles where role_id = $1', [avant.id])).rows[0].n;
    if (n) return erreur(reply, 400, 'role_attribue', `Ce rôle est attribué à ${n} compte(s) : retirez-le d’abord.`);
    await c.query('delete from noyau.roles where id = $1', [avant.id]);
    await S.auditer(c, req, 'role_supprime', { entite: 'role', entiteId: avant.id, avant });
    return { ok: true };
  }));
};
