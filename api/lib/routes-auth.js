'use strict';
// Connexion, déconnexion, profil, changement de mot de passe.
const { pool, transaction } = require('./db');
const mdp = require('./mdp');
const S = require('./securite');

// Empreinte factice : vérifiée quand l'identifiant n'existe pas, pour que la réponse
// prenne le même temps (on ne révèle pas quels identifiants existent).
let empreinteFactice = null;
const factice = async () => (empreinteFactice ||= await mdp.hacher('compte-inexistant-' + Date.now()));

const REFUS = { erreur: 'identifiants', message: 'Identifiant ou mot de passe incorrect.' };

module.exports = async function routesAuth(app, opts) {
  const LIMITE = opts.limiteConnexion ?? 10;
  app.post('/api/auth/connexion', {
    config: { rateLimit: { max: LIMITE, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object', required: ['identifiant', 'mot_de_passe'], additionalProperties: false,
        properties: { identifiant: { type: 'string', minLength: 1, maxLength: 60 }, mot_de_passe: { type: 'string', minLength: 1, maxLength: 200 } },
      },
    },
  }, async (req, reply) => {
    const identifiant = req.body.identifiant.trim().toLowerCase();
    const r = await pool.query(
      `select id, identifiant, nom_complet, mot_de_passe_hash, actif, doit_changer_mdp, echecs_connexion,
              verrouille_jusqu, verrouille_jusqu > now() as verrouille
         from noyau.utilisateurs where identifiant = $1`, [identifiant]);
    const u = r.rows[0];
    if (!u) {
      await mdp.verifier(req.body.mot_de_passe, await factice());
      await S.auditer(pool, req, 'connexion_refusee', { details: { identifiant, motif: 'inconnu' } });
      return reply.code(401).send(REFUS);
    }
    if (u.verrouille) {
      await S.auditer(pool, req, 'connexion_refusee', { utilisateur: u, details: { motif: 'verrouille' } });
      return reply.code(423).send({ erreur: 'verrouille', message: 'Compte verrouillé après plusieurs erreurs. Réessayez dans 15 minutes ou demandez au Super administrateur de le déverrouiller.' });
    }
    const ok = await mdp.verifier(req.body.mot_de_passe, u.mot_de_passe_hash);
    if (!ok || !u.actif) {
      if (!ok) {
        const echecs = u.echecs_connexion + 1;
        const verrou = echecs >= S.ECHECS_AVANT_VERROU;
        await pool.query(
          `update noyau.utilisateurs set echecs_connexion = $2,
             verrouille_jusqu = case when $3 then now() + make_interval(secs => $4) else verrouille_jusqu end
           where id = $1`, [u.id, verrou ? 0 : echecs, verrou, S.VERROU_MS / 1000]);
        await S.auditer(pool, req, verrou ? 'compte_verrouille' : 'connexion_refusee', { utilisateur: u, details: { motif: 'mot_de_passe', echecs } });
      } else {
        await S.auditer(pool, req, 'connexion_refusee', { utilisateur: u, details: { motif: 'desactive' } });
      }
      return reply.code(401).send(REFUS);
    }
    const jeton = await transaction(async (c) => {
      await c.query('update noyau.utilisateurs set echecs_connexion = 0, verrouille_jusqu = null, derniere_connexion = now() where id = $1', [u.id]);
      const j = await S.creerSession(c, req, u.id);
      await S.auditer(c, req, 'connexion', { utilisateur: u });
      return j;
    });
    reply.setCookie(S.COOKIE, jeton, { path: '/', httpOnly: true, secure: true, sameSite: 'strict', maxAge: S.DUREE_MAX_MS / 1000 });
    const session = await S.chargerSession({ headers: { authorization: 'Bearer ' + jeton } });
    return { jeton, utilisateur: profil(session) };
  });

  app.post('/api/auth/deconnexion', { config: { mdpProvisoireOk: true }, preHandler: S.exigerConnexion() }, async (req, reply) => {
    await pool.query('update noyau.sessions set revoquee_le = now() where id = $1', [req.utilisateur.session_id]);
    await S.auditer(pool, req, 'deconnexion');
    reply.clearCookie(S.COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/moi', { config: { mdpProvisoireOk: true }, preHandler: S.exigerConnexion() }, async (req) => profil(req.utilisateur));

  app.post('/api/auth/mot-de-passe', {
    config: { mdpProvisoireOk: true, rateLimit: { max: LIMITE, timeWindow: '1 minute' } },
    preHandler: S.exigerConnexion(),
    schema: {
      body: {
        type: 'object', required: ['actuel', 'nouveau'], additionalProperties: false,
        properties: { actuel: { type: 'string', maxLength: 200 }, nouveau: { type: 'string', maxLength: 200 } },
      },
    },
  }, async (req, reply) => {
    const u = req.utilisateur;
    const { rows: [row] } = await pool.query('select mot_de_passe_hash from noyau.utilisateurs where id = $1', [u.id]);
    if (!(await mdp.verifier(req.body.actuel, row.mot_de_passe_hash))) {
      await S.auditer(pool, req, 'mdp_change_refuse', { entite: 'utilisateur', entiteId: u.id, details: { motif: 'actuel_incorrect' } });
      return reply.code(400).send({ erreur: 'actuel_incorrect', message: 'Le mot de passe actuel est incorrect.' });
    }
    const motif = mdp.motifRefus(req.body.nouveau, u.identifiant);
    if (motif) return reply.code(400).send({ erreur: 'mdp_faible', message: motif });
    if (await mdp.verifier(req.body.nouveau, row.mot_de_passe_hash)) {
      return reply.code(400).send({ erreur: 'mdp_identique', message: 'Choisissez un mot de passe différent de l’actuel.' });
    }
    const h = await mdp.hacher(req.body.nouveau);
    await transaction(async (c) => {
      await c.query('update noyau.utilisateurs set mot_de_passe_hash = $2, doit_changer_mdp = false, mdp_change_le = now(), maj_le = now(), version = version + 1 where id = $1', [u.id, h]);
      // les autres sessions de ce compte sont fermées ; celle-ci reste ouverte
      await c.query('update noyau.sessions set revoquee_le = now() where utilisateur_id = $1 and id <> $2 and revoquee_le is null', [u.id, u.session_id]);
      await S.auditer(c, req, 'mdp_change', { entite: 'utilisateur', entiteId: u.id });
    });
    return { ok: true, message: 'Mot de passe changé.' };
  });
};

function profil(u) {
  return { id: u.id, identifiant: u.identifiant, nom_complet: u.nom_complet, email: u.email, roles: u.roles, doit_changer_mdp: u.doit_changer_mdp };
}
module.exports.profil = profil;
