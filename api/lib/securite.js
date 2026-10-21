'use strict';
// Sessions, contrôle d'accès et journal d'audit.
const crypto = require('crypto');
const { pool } = require('./db');
const { droitsEffectifs, peut } = require('./droits');

const COOKIE = 'erp_session';
const INACTIVITE_MAX_MS = 12 * 3600 * 1000;      // session fermée après 12 h sans activité
const DUREE_MAX_MS = 7 * 24 * 3600 * 1000;       // et au plus tard 7 jours après la connexion
const ECHECS_AVANT_VERROU = 5;
const VERROU_MS = 15 * 60 * 1000;

const empreinte = (jeton) => crypto.createHash('sha256').update(jeton).digest('hex');

function contexte(req) {
  return {
    ip: req.ip,
    poste: String(req.headers['x-erp-poste'] || '').slice(0, 80) || null,
    agent: String(req.headers['user-agent'] || '').slice(0, 200) || null,
  };
}

/** Écrit une ligne dans le journal d'audit (ajout seul). `db` = pool ou client de transaction. */
async function auditer(db, req, action, { utilisateur, entite, entiteId, avant, apres, details } = {}) {
  const u = utilisateur || req?.utilisateur || null;
  const cx = req ? contexte(req) : {};
  await db.query(
    `insert into noyau.audit (utilisateur_id, identifiant, poste, ip, action, entite, entite_id, avant, apres, details)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [u?.id || null, u?.identifiant || null, cx.poste || null, cx.ip || null, action, entite || null,
      entiteId == null ? null : String(entiteId), avant ?? null, apres ?? null, details ?? null]);
}

async function creerSession(db, req, utilisateurId) {
  const jeton = crypto.randomBytes(32).toString('base64url');
  const cx = contexte(req);
  await db.query(
    `insert into noyau.sessions (jeton_empreinte, utilisateur_id, expire_le, ip, poste, agent)
     values ($1, $2, now() + make_interval(secs => $3), $4, $5, $6)`,
    [empreinte(jeton), utilisateurId, DUREE_MAX_MS / 1000, cx.ip, cx.poste, cx.agent]);
  return jeton;
}

function jetonDe(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return req.cookies?.[COOKIE] || null;
}

/** Charge l'utilisateur de la session ; null si absente, expirée, révoquée ou compte désactivé. */
async function chargerSession(req) {
  const jeton = jetonDe(req);
  if (!jeton || jeton.length > 100) return null;
  const r = await pool.query(
    `update noyau.sessions s set derniere_activite = now()
       from noyau.utilisateurs u
      where s.jeton_empreinte = $1 and s.utilisateur_id = u.id
        and s.revoquee_le is null and s.expire_le > now()
        and s.derniere_activite > now() - make_interval(secs => $2)
        and u.actif
     returning s.id as session_id, u.id, u.identifiant, u.nom_complet, u.email, u.doit_changer_mdp,
       array(select ro.code from noyau.utilisateur_roles ur join noyau.roles ro on ro.id = ur.role_id
              where ur.utilisateur_id = u.id order by ro.id) as roles`,
    [empreinte(jeton), INACTIVITE_MAX_MS / 1000]);
  return r.rows[0] || null;
}

/** Hook Fastify : exige une session valide. Si le mot de passe est provisoire, seules
 *  les routes marquées `config.mdpProvisoireOk` restent accessibles. */
function exigerConnexion(opts = {}) {
  return async (req, reply) => {
    const u = await chargerSession(req);
    if (!u) return reply.code(401).send({ erreur: 'non_connecte', message: 'Session absente ou expirée : reconnectez-vous.' });
    if (u.doit_changer_mdp && !req.routeOptions.config?.mdpProvisoireOk) {
      return reply.code(403).send({ erreur: 'mdp_a_changer', message: 'Changez votre mot de passe provisoire pour continuer.' });
    }
    req.utilisateur = u;
    if (opts.roles && !opts.roles.some((r) => u.roles.includes(r))) {
      return reply.code(403).send({ erreur: 'interdit', message: 'Votre rôle ne permet pas cette action.' });
    }
    req.droits = await droitsEffectifs(u.id, u.roles);
    if (opts.droit && !peut(req.droits, opts.droit[0], opts.droit[1])) {
      return reply.code(403).send({ erreur: 'interdit', message: 'Vos droits ne permettent pas cette action.' });
    }
  };
}

module.exports = {
  COOKIE, INACTIVITE_MAX_MS, DUREE_MAX_MS, ECHECS_AVANT_VERROU, VERROU_MS,
  empreinte, contexte, auditer, creerSession, jetonDe, chargerSession, exigerConnexion,
};
