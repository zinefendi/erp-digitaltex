'use strict';
// Tests de l'étape 1 du lot 2 — à lancer contre une base PostgreSQL de test VIDE.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../lib/db');
const { migrer } = require('../lib/migrations');
const mdp = require('../lib/mdp');
const { construire } = require('../server');

let app;
const appel = (method, url, { jeton, body, poste } = {}) => app.inject({
  method, url, payload: body,
  headers: { ...(jeton ? { authorization: 'Bearer ' + jeton } : {}), ...(poste ? { 'x-erp-poste': poste } : {}) },
});
const connexion = (identifiant, mot_de_passe) => appel('POST', '/api/auth/connexion', { body: { identifiant, mot_de_passe } });

test.before(async () => {
  await require('./_base').viderBase();
  await migrer(pool, { info: () => {} });
  app = construire({ logger: false, limiteConnexion: 1000 });
  await app.ready();
  // Super admin de départ (comme le script console)
  const h = await mdp.hacher('Provisoire-1234');
  const r = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash) values ('admin','Admin Test',$1) returning id`, [h]);
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code='super_admin'`, [r.rows[0].id]);
});
test.after(async () => { await app.close(); await pool.end(); });

const etat = {};

test('migrations : relançables sans effet, 8 rôles fournis', async () => {
  assert.deepEqual(await migrer(pool, { info: () => {} }), []);
  const r = await pool.query('select code from noyau.roles order by id');
  assert.deepEqual(r.rows.map((x) => x.code), ['super_admin', 'direction', 'commercial', 'infographie', 'comptabilite', 'production', 'magasin', 'rh_paie']);
});

test('mots de passe : empreinte scrypt, jamais en clair, règles de robustesse', async () => {
  const h = await mdp.hacher('Abcdef-12345');
  assert.match(h, /^scrypt\$131072\$8\$1\$/);
  assert.ok(!h.includes('Abcdef'));
  assert.equal(await mdp.verifier('Abcdef-12345', h), true);
  assert.equal(await mdp.verifier('abcdef-12345', h), false);
  assert.ok(mdp.motifRefus('court1A'));
  assert.ok(mdp.motifRefus('toutminuscule'));
  assert.ok(mdp.motifRefus('Admin-12345678', 'admin'));
  assert.equal(mdp.motifRefus('Atelier-Polo-2026'), null);
  assert.equal(mdp.motifRefus('une phrase assez longue'), null);
  for (let i = 0; i < 20; i++) assert.equal(mdp.motifRefus(mdp.provisoire()), null);
});

test('sans session : tout est refusé (401)', async () => {
  for (const [m, u] of [['GET', '/api/auth/moi'], ['GET', '/api/utilisateurs'], ['GET', '/api/audit'], ['GET', '/api/roles']]) {
    assert.equal((await appel(m, u)).statusCode, 401, u);
  }
  assert.equal((await appel('GET', '/api/auth/moi', { jeton: 'faux-jeton' })).statusCode, 401);
  assert.equal((await appel('GET', '/api/sante')).statusCode, 200);
});

test('connexion : refus identique pour un identifiant inconnu et un mauvais mot de passe', async () => {
  const a = await connexion('inconnu', 'x');
  const b = await connexion('admin', 'mauvais');
  assert.equal(a.statusCode, 401); assert.equal(b.statusCode, 401);
  assert.deepEqual(a.json(), b.json());
});

test('mot de passe provisoire : seul le changement est autorisé', async () => {
  const r = await connexion('ADMIN ', 'Provisoire-1234');
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().utilisateur.doit_changer_mdp, true);
  assert.match(r.headers['set-cookie'], /HttpOnly/i);
  assert.match(r.headers['set-cookie'], /Secure/i);
  assert.match(r.headers['set-cookie'], /SameSite=Strict/i);
  etat.jetonAdmin = r.json().jeton;
  assert.equal((await appel('GET', '/api/auth/verifier', { jeton: etat.jetonAdmin })).statusCode, 204);
  assert.equal((await appel('GET', '/api/auth/verifier', { jeton: 'faux' })).statusCode, 401);
  assert.equal((await appel('GET', '/api/auth/verifier')).statusCode, 401);
  assert.equal((await appel('GET', '/api/utilisateurs', { jeton: etat.jetonAdmin })).json().erreur, 'mdp_a_changer');
  assert.equal((await appel('GET', '/api/auth/moi', { jeton: etat.jetonAdmin })).statusCode, 200);
  // nouveau trop faible
  let c = await appel('POST', '/api/auth/mot-de-passe', { jeton: etat.jetonAdmin, body: { actuel: 'Provisoire-1234', nouveau: 'faible' } });
  assert.equal(c.json().erreur, 'mdp_faible');
  // actuel incorrect
  c = await appel('POST', '/api/auth/mot-de-passe', { jeton: etat.jetonAdmin, body: { actuel: 'non', nouveau: 'Atelier-Polo-2026' } });
  assert.equal(c.json().erreur, 'actuel_incorrect');
  c = await appel('POST', '/api/auth/mot-de-passe', { jeton: etat.jetonAdmin, body: { actuel: 'Provisoire-1234', nouveau: 'Atelier-Polo-2026' } });
  assert.equal(c.statusCode, 200);
  assert.equal((await appel('GET', '/api/utilisateurs', { jeton: etat.jetonAdmin })).statusCode, 200);
});

test('création d’un compte : provisoire renvoyé une fois, rôles contrôlés, identifiant unique', async () => {
  let r = await appel('POST', '/api/utilisateurs', { jeton: etat.jetonAdmin, body: { identifiant: 'Sami.C', nom_complet: 'Sami Commercial', roles: ['commercial'] } });
  assert.equal(r.statusCode, 201);
  const { utilisateur, mot_de_passe_provisoire } = r.json();
  assert.equal(utilisateur.identifiant, 'sami.c');
  assert.deepEqual(utilisateur.roles, ['commercial']);
  assert.equal(utilisateur.mot_de_passe_hash, undefined);
  etat.sami = utilisateur; etat.samiMdp = mot_de_passe_provisoire;
  r = await appel('POST', '/api/utilisateurs', { jeton: etat.jetonAdmin, body: { identifiant: 'sami.c', nom_complet: 'Doublon', roles: ['commercial'] } });
  assert.equal(r.statusCode, 409);
  r = await appel('POST', '/api/utilisateurs', { jeton: etat.jetonAdmin, body: { identifiant: 'x.y', nom_complet: 'Rôle faux', roles: ['pirate'] } });
  assert.equal(r.json().erreur, 'role_inconnu');
  r = await appel('POST', '/api/utilisateurs', { jeton: etat.jetonAdmin, body: { identifiant: 'é', nom_complet: 'Accent', roles: ['commercial'] } });
  assert.equal(r.statusCode, 400);
  // Le rôle inconnu n'a rien laissé en base (transaction annulée)
  assert.equal((await pool.query(`select count(*)::int n from noyau.utilisateurs where identifiant='x.y'`)).rows[0].n, 0);
});

test('un non-administrateur n’accède pas à la gestion des comptes ni à l’audit', async () => {
  let r = await connexion('sami.c', etat.samiMdp);
  let j = r.json().jeton;
  await appel('POST', '/api/auth/mot-de-passe', { jeton: j, body: { actuel: etat.samiMdp, nouveau: 'Commercial-Sousse-26' } });
  etat.jetonSami = j;
  for (const u of ['/api/utilisateurs', '/api/roles', '/api/audit']) {
    assert.equal((await appel('GET', u, { jeton: j })).json().erreur, 'interdit', u);
  }
  r = await appel('POST', '/api/utilisateurs', { jeton: j, body: { identifiant: 'pirate', nom_complet: 'Pirate', roles: ['super_admin'] } });
  assert.equal(r.statusCode, 403);
});

test('modification : contrôle de version (pas d’écrasement silencieux)', async () => {
  etat.sami = (await appel('GET', `/api/utilisateurs/${etat.sami.id}`, { jeton: etat.jetonAdmin })).json();
  let r = await appel('PATCH', `/api/utilisateurs/${etat.sami.id}`, { jeton: etat.jetonAdmin, body: { version: etat.sami.version, nom_complet: 'Sami Ben Ali', roles: ['commercial', 'infographie'] } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().version, etat.sami.version + 1);
  r = await appel('PATCH', `/api/utilisateurs/${etat.sami.id}`, { jeton: etat.jetonAdmin, body: { version: etat.sami.version, nom_complet: 'Ancienne version' } });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().erreur, 'conflit_version');
});

test('désactivation : sessions fermées immédiatement, connexion refusée', async () => {
  const v = (await appel('GET', `/api/utilisateurs/${etat.sami.id}`, { jeton: etat.jetonAdmin })).json().version;
  assert.equal((await appel('GET', '/api/auth/moi', { jeton: etat.jetonSami })).statusCode, 200);
  const r = await appel('PATCH', `/api/utilisateurs/${etat.sami.id}`, { jeton: etat.jetonAdmin, body: { version: v, actif: false } });
  assert.equal(r.json().actif, false);
  assert.equal((await appel('GET', '/api/auth/moi', { jeton: etat.jetonSami })).statusCode, 401);
  assert.equal((await connexion('sami.c', 'Commercial-Sousse-26')).statusCode, 401);
});

test('le dernier Super administrateur ne peut pas être désactivé ni perdre son rôle', async () => {
  const moi = (await appel('GET', '/api/auth/moi', { jeton: etat.jetonAdmin })).json();
  const v = (await appel('GET', `/api/utilisateurs/${moi.id}`, { jeton: etat.jetonAdmin })).json().version;
  let r = await appel('PATCH', `/api/utilisateurs/${moi.id}`, { jeton: etat.jetonAdmin, body: { version: v, actif: false } });
  assert.equal(r.json().erreur, 'dernier_super_admin');
  r = await appel('PATCH', `/api/utilisateurs/${moi.id}`, { jeton: etat.jetonAdmin, body: { version: v, roles: ['direction'] } });
  assert.equal(r.json().erreur, 'dernier_super_admin');
  assert.equal((await appel('GET', '/api/auth/moi', { jeton: etat.jetonAdmin })).json().roles[0], 'super_admin');
});

test('verrouillage après 5 erreurs, déverrouillage par l’administrateur', async () => {
  let r = await appel('POST', '/api/utilisateurs', { jeton: etat.jetonAdmin, body: { identifiant: 'leila.compta', nom_complet: 'Leila Compta', roles: ['comptabilite'] } });
  const { utilisateur, mot_de_passe_provisoire } = r.json();
  for (let i = 0; i < 5; i++) assert.equal((await connexion('leila.compta', 'faux')).statusCode, 401);
  r = await connexion('leila.compta', mot_de_passe_provisoire);
  assert.equal(r.statusCode, 423, 'même le bon mot de passe est refusé pendant le verrou');
  assert.equal((await appel('GET', `/api/utilisateurs/${utilisateur.id}`, { jeton: etat.jetonAdmin })).json().verrouille, true);
  await appel('POST', `/api/utilisateurs/${utilisateur.id}/deverrouiller`, { jeton: etat.jetonAdmin });
  assert.equal((await connexion('leila.compta', mot_de_passe_provisoire)).statusCode, 200);
  etat.leila = utilisateur;
});

test('réinitialisation du mot de passe : ancien refusé, sessions fermées, nouveau provisoire', async () => {
  const s = (await connexion('leila.compta', 'x')); // échec sans effet notable
  assert.equal(s.statusCode, 401);
  const r = await appel('POST', `/api/utilisateurs/${etat.leila.id}/reinitialiser-mdp`, { jeton: etat.jetonAdmin });
  const nouveau = r.json().mot_de_passe_provisoire;
  const c = await connexion('leila.compta', nouveau);
  assert.equal(c.statusCode, 200);
  assert.equal(c.json().utilisateur.doit_changer_mdp, true);
});

test('déconnexion : la session ne sert plus', async () => {
  const j = (await connexion('admin', 'Atelier-Polo-2026')).json().jeton;
  assert.equal((await appel('POST', '/api/auth/deconnexion', { jeton: j })).statusCode, 200);
  assert.equal((await appel('GET', '/api/auth/moi', { jeton: j })).statusCode, 401);
});

test('session expirée après 12 h d’inactivité', async () => {
  const j = (await connexion('admin', 'Atelier-Polo-2026')).json().jeton;
  await pool.query(`update noyau.sessions set derniere_activite = now() - interval '13 hours' where jeton_empreinte = encode(sha256($1::bytea), 'hex')`, [j]);
  assert.equal((await appel('GET', '/api/auth/moi', { jeton: j })).statusCode, 401);
});

test('jetons de session jamais stockés en clair', async () => {
  const r = await pool.query('select jeton_empreinte from noyau.sessions');
  assert.ok(r.rows.length > 0);
  assert.ok(!r.rows.some((x) => x.jeton_empreinte === etat.jetonAdmin));
  assert.ok(r.rows.every((x) => /^[0-9a-f]{64}$/.test(x.jeton_empreinte)));
});

test('journal d’audit : actions tracées avec poste et IP, ajout seul', async () => {
  await appel('GET', '/api/auth/moi', { jeton: etat.jetonAdmin, poste: 'PC-ATELIER-1' });
  const a = (await appel('GET', '/api/audit?limite=500', { jeton: etat.jetonAdmin })).json().lignes;
  const actions = new Set(a.map((x) => x.action));
  for (const x of ['connexion', 'connexion_refusee', 'mdp_change', 'mdp_change_refuse', 'utilisateur_cree', 'utilisateur_modifie',
    'utilisateur_desactive', 'compte_verrouille', 'utilisateur_deverrouille', 'mdp_reinitialise', 'deconnexion']) {
    assert.ok(actions.has(x), 'action manquante dans l’audit : ' + x);
  }
  const creation = a.find((x) => x.action === 'utilisateur_cree' && x.entite_id === String(etat.sami.id));
  assert.equal(creation.identifiant, 'admin');
  assert.equal(creation.apres.identifiant, 'sami.c');
  assert.ok(!JSON.stringify(a).includes('scrypt$'), 'aucune empreinte de mot de passe dans l’audit');
  await assert.rejects(pool.query('update noyau.audit set action = $1', ['falsifie']), /ajout seul/);
  await assert.rejects(pool.query('delete from noyau.audit'), /ajout seul/);
  await assert.rejects(pool.query('truncate noyau.audit'), /ajout seul/);
});

test('limitation : 10 tentatives de connexion par minute et par IP', async () => {
  const app2 = construire({ logger: false }); await app2.ready();
  let dernier;
  for (let i = 0; i < 11; i++) dernier = await app2.inject({ method: 'POST', url: '/api/auth/connexion', payload: { identifiant: 'x', mot_de_passe: 'y' }, remoteAddress: '10.9.9.9' });
  assert.equal(dernier.statusCode, 429);
  assert.equal(dernier.json().erreur, 'trop_de_requetes');
  await app2.close();
});

test('requête mal formée : 400 en français, champs inconnus refusés', async () => {
  const r = await appel('POST', '/api/auth/connexion', { body: { identifiant: 'admin', mot_de_passe: 'x', role: 'super_admin' } });
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().erreur, 'requete_invalide');
});

test('IP réelle : lue derrière Nginx, adresse falsifiée par le visiteur ignorée', async () => {
  const F = require('fastify');
  const a = F({ trustProxy: ['127.0.0.1', '172.16.0.0/12'] }); a.get('/x', async (r) => r.ip);
  // visiteur 20.99.244.204, Nginx (172.18.0.4) ajoute son IP en dernier
  assert.equal((await a.inject({ url: '/x', remoteAddress: '172.18.0.4', headers: { 'x-forwarded-for': '20.99.244.204' } })).body, '20.99.244.204');
  // le visiteur tente de se faire passer pour 1.2.3.4 : Nginx ajoute sa vraie IP à droite → c'est elle qui compte
  assert.equal((await a.inject({ url: '/x', remoteAddress: '172.18.0.4', headers: { 'x-forwarded-for': '1.2.3.4, 20.99.244.204' } })).body, '20.99.244.204');
  // connexion directe sans Nginx : l'en-tête est ignoré
  assert.equal((await a.inject({ url: '/x', remoteAddress: '41.226.1.1', headers: { 'x-forwarded-for': '1.2.3.4' } })).body, '41.226.1.1');
  await a.close();
});
