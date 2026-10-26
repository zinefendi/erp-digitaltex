'use strict';
// Tests de l'étape 14 : droits par module / fonction / action, rôles personnalisés, masquage des montants.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../lib/db');
const { migrer } = require('../lib/migrations');
const mdp = require('../lib/mdp');
const D = require('../lib/droits');
const C = require('../lib/droits-catalogue');
const { construire } = require('../server');

let app;
const appel = (method, url, { jeton, body } = {}) => app.inject({ method, url, payload: body, headers: jeton ? { authorization: 'Bearer ' + jeton } : {} });
const MDP = 'Atelier-Polo-2026';

async function compte(cle, roles) {
  const identifiant = 'test.' + cle;
  const h = await mdp.hacher(MDP);
  const r = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ($1, $1, $2, false) returning id`, [identifiant, h]);
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code = any($2)`, [r.rows[0].id, roles]);
  const c = await appel('POST', '/api/auth/connexion', { body: { identifiant, mot_de_passe: MDP } });
  return { id: r.rows[0].id, jeton: c.json().jeton };
}

const J = {};
test.before(async () => {
  await require('./_base').viderBase();
  await migrer(pool, { info: () => {} });
  D._viderCache();
  app = construire({ logger: false, limiteConnexion: 1000 });
  await app.ready();
  for (const [k, roles] of Object.entries({ admin: ['super_admin'], direction: ['direction'], commercial: ['commercial'], infographie: ['infographie'],
    compta: ['comptabilite'], atelier: ['production'], magasin: ['magasin'], rh: ['rh_paie'], double: ['infographie', 'magasin'] })) J[k] = await compte(k, roles);
});
test.after(async () => { await app.close(); await pool.end(); });

const mesDroits = async (k) => (await appel('GET', '/api/droits/moi', { jeton: J[k].jeton })).json();

test('catalogue : 11 modules, 61 fonctions, matrice en base = matrice du code', async () => {
  const cat = (await appel('GET', '/api/droits/catalogue', { jeton: J.admin.jeton })).json();
  assert.equal(cat.modules.length, 11);
  assert.deepEqual(cat.modules.map((m) => m.numero), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(cat.modules.flatMap((m) => m.fonctions).length, 61);
  assert.equal(cat.actions.length, 7);
  for (const role of Object.keys(C.MATRICE)) {
    const id = (await pool.query('select id from noyau.roles where code = $1', [role])).rows[0].id;
    const r = (await appel('GET', '/api/roles/' + id, { jeton: J.admin.jeton })).json();
    const attendu = C.defautRole(role);
    for (const k of Object.keys(attendu)) attendu[k].sort();
    const recu = Object.fromEntries(Object.entries(r.droits).map(([k, v]) => [k, v.slice().sort()]));
    assert.deepEqual(recu, attendu, 'matrice différente pour ' + role);
    assert.deepEqual(r.visibilites.slice().sort(), C.MATRICE[role].visibilites.slice().sort());
  }
});

test('matrice CDC § 5.2 : modules visibles par rôle', async () => {
  const mods = async (k) => (await mesDroits(k)).modules;
  assert.equal((await mods('admin')).length, 11);
  assert.equal((await mods('direction')).length, 11);
  assert.ok((await mods('compta')).includes('compta_generale'));
  assert.ok(!(await mods('commercial')).includes('compta_generale'));
  assert.deepEqual(await mods('rh'), ['paie', 'production', 'parametres']);
  assert.ok(!(await mods('commercial')).includes('paie'));
  assert.ok(!(await mods('commercial')).includes('parametres'));
  assert.ok(!(await mods('infographie')).includes('compta_clients'));
  assert.ok(!(await mods('atelier')).includes('compta_clients'));
  assert.ok(!(await mods('magasin')).includes('paie'));
  for (const k of ['commercial', 'infographie', 'compta', 'atelier', 'magasin']) assert.ok(!(await mods(k)).includes('paie') || k === 'compta', k);
});

test('matrice CDC § 5.2 : actions clés', async () => {
  const p = async (k, f, a) => D.peut(await mesDroits(k), f, a);
  // Direction : lecture seule partout, paie en synthèse seulement
  assert.equal(await p('direction', 'commercial.factures', 'lire'), true);
  assert.equal(await p('direction', 'commercial.factures', 'creer'), false);
  assert.equal(await p('direction', 'paie.journal', 'lire'), true);
  assert.equal(await p('direction', 'paie.bulletins', 'lire'), false);
  // Commercial : gère devis/commandes, ne peut pas annuler une facture
  assert.equal(await p('commercial', 'commercial.devis', 'creer'), true);
  assert.equal(await p('commercial', 'commercial.factures', 'creer'), true);
  assert.equal(await p('commercial', 'commercial.factures', 'annuler'), false);
  assert.equal(await p('commercial', 'infographie.lookbook', 'modifier'), true);
  assert.equal(await p('commercial', 'infographie.studio', 'modifier'), false);
  // Comptabilité : annule les factures, lit la fiscalité
  assert.equal(await p('compta', 'commercial.factures', 'annuler'), true);
  assert.equal(await p('compta', 'commercial.devis', 'creer'), false);
  assert.equal(await p('compta', 'parametres.fiscalite', 'lire'), true);
  assert.equal(await p('compta', 'parametres.fiscalite', 'modifier'), false);
  // 0.7.0 : la Comptabilité crée des articles hors Studio et gère les retenues à la source à part
  assert.equal(await p('compta', 'commercial.articles', 'creer'), true);
  assert.equal(await p('commercial', 'commercial.articles', 'creer'), true);
  assert.equal(await p('infographie', 'commercial.articles', 'creer'), false);
  assert.equal(await p('compta', 'compta_generale.retenues', 'valider'), true);
  assert.equal(await p('direction', 'compta_generale.journaux', 'lire'), true);
  assert.equal(await p('direction', 'compta_generale.journaux', 'exporter'), false);
  // Infographie : studio et BOM en gestion
  assert.equal(await p('infographie', 'infographie.studio', 'modifier'), true);
  assert.equal(await p('infographie', 'bom.nomenclatures', 'creer'), true);
  // 0.6.0 : commandes créées depuis le Studio (sans prix) ; ni validation, ni annulation, ni BL / factures
  assert.equal(await p('infographie', 'commercial.commandes', 'creer'), true);
  assert.equal(await p('infographie', 'commercial.commandes', 'modifier'), true);
  assert.equal(await p('infographie', 'commercial.commandes', 'annuler'), false);
  assert.equal(await p('infographie', 'commercial.commandes', 'valider'), false);
  assert.equal(await p('infographie', 'commercial.bl', 'creer'), false);
  assert.equal(await p('infographie', 'commercial.factures', 'creer'), false);
  // Atelier : valide les 3 parties, sorties MP, entrées PF ; ne voit ni devis ni factures
  assert.equal(await p('atelier', 'production.etapes', 'valider'), true);
  assert.equal(await p('atelier', 'stock_mp.sorties', 'creer'), true);
  assert.equal(await p('atelier', 'stock_pf.entrees', 'creer'), true);
  assert.equal(await p('atelier', 'stock_mp.entrees', 'creer'), false);
  assert.equal(await p('atelier', 'commercial.factures', 'lire'), false);
  assert.equal(await p('atelier', 'commercial.commandes', 'lire'), true);
  // Magasin
  assert.equal(await p('magasin', 'stock_mp.entrees', 'creer'), true);
  assert.equal(await p('magasin', 'compta_fournisseurs.achats', 'lire'), true);
  assert.equal(await p('magasin', 'compta_fournisseurs.factures', 'lire'), false);
  // RH / Paie
  assert.equal(await p('rh', 'paie.bulletins', 'valider'), true);
  assert.equal(await p('rh', 'production.pointage', 'lire'), true);
  assert.equal(await p('rh', 'parametres.baremes_paie', 'lire'), true);
  assert.equal(await p('rh', 'parametres.baremes_paie', 'modifier'), false);
  // Personne d'autre que Super admin ne modifie les Paramètres
  for (const k of ['direction', 'commercial', 'infographie', 'compta', 'atelier', 'magasin', 'rh']) {
    for (const f of ['parametres.utilisateurs', 'parametres.roles', 'parametres.societe', 'parametres.fiscalite', 'parametres.numerotation']) {
      assert.equal(await p(k, f, 'modifier'), false, `${k} ${f}`);
    }
  }
});

test('salaires : visibles seulement par Super admin et RH / Paie', async () => {
  for (const [k, attendu] of Object.entries({ admin: true, rh: true, direction: false, compta: false, commercial: false, infographie: false, atelier: false, magasin: false })) {
    assert.equal(D.voit(await mesDroits(k), 'salaires'), attendu, k);
  }
});

test('plusieurs rôles : les droits s’additionnent', async () => {
  const d = await mesDroits('double');
  assert.equal(D.peut(d, 'infographie.studio', 'modifier'), true);
  assert.equal(D.peut(d, 'stock_mp.entrees', 'creer'), true);
  assert.equal(D.voit(d, 'prix'), false);
});

const COMMANDE = {
  id: 'o1', number: 'CMD-2026-0001', status: 'en_cours', total: 209.95, client: { name: 'Hôtel Test', mf: '123' },
  advances: [{ amount: 100, date: '2026-10-01', mode: 'espèces' }],
  lines: [{ designation: 'Polo', qty: 5, size: 'M', color: 'Bleu', pu: 41.99, staff: 'JARDIN' }],
  products: [{ name: 'Polo', qty: 5, total: 209.95, staff: 'JARDIN' }],
};

test('masquage : sans droit « prix », aucun montant ne sort (L* du CDC)', async () => {
  const atelier = await mesDroits('atelier');
  const m = D.masquer(atelier, COMMANDE);
  const texte = JSON.stringify(m);
  for (const v of ['209.95', '41.99', 'advances', '"total"', '"pu"']) assert.ok(!texte.includes(v), 'fuite : ' + v);
  assert.equal(m.lines[0].qty, 5); assert.equal(m.lines[0].size, 'M'); assert.equal(m.lines[0].staff, 'JARDIN');
  assert.equal(m.client.name, 'Hôtel Test'); assert.equal(m.number, 'CMD-2026-0001');
  assert.equal(COMMANDE.total, 209.95, 'l’original n’est pas modifié');
  // liste de documents
  const liste = D.masquer(atelier, [COMMANDE, COMMANDE]);
  assert.ok(!JSON.stringify(liste).includes('209.95'));
  // avec le droit : tout reste
  assert.deepEqual(D.masquer(await mesDroits('commercial'), COMMANDE), COMMANDE);
  assert.deepEqual(D.masquer(await mesDroits('admin'), COMMANDE), COMMANDE);
  assert.ok(!JSON.stringify(D.masquer(await mesDroits('infographie'), COMMANDE)).includes('209.95'));
  assert.ok(!JSON.stringify(D.masquer(await mesDroits('magasin'), COMMANDE)).includes('41.99'));
});

test('rôle personnalisé : démarre sans aucun droit, se règle, s’applique immédiatement', async () => {
  let r = await appel('POST', '/api/roles', { jeton: J.admin.jeton, body: { libelle: 'Chef d’équipe coupe', description: 'Atelier coupe' } });
  assert.equal(r.statusCode, 201);
  const role = r.json();
  assert.equal(role.code, 'p_chef_d_equipe_coupe');
  assert.deepEqual(role.droits, {}); assert.deepEqual(role.visibilites, []);
  assert.equal((await appel('POST', '/api/roles', { jeton: J.admin.jeton, body: { libelle: 'chef d’équipe coupe' } })).statusCode, 409);
  // utilisateur avec ce seul rôle : aucun module
  const h = await mdp.hacher(MDP);
  const u = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ('chef', 'Chef', $1, false) returning id`, [h]);
  await pool.query('insert into noyau.utilisateur_roles values ($1, $2)', [u.rows[0].id, role.id]);
  J.chef = { jeton: (await appel('POST', '/api/auth/connexion', { body: { identifiant: 'chef', mot_de_passe: MDP } })).json().jeton };
  assert.deepEqual((await mesDroits('chef')).modules, []);
  // on règle : OF en lecture + validation des étapes ; « lire » ajouté automatiquement
  r = await appel('PUT', '/api/roles/' + role.id, { jeton: J.admin.jeton, body: { version: role.version, droits: { 'production.of': ['lire'], 'production.etapes': ['valider'] } } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().droits['production.etapes'].sort(), ['lire', 'valider']);
  const d = await mesDroits('chef');
  assert.deepEqual(d.modules, ['production']);
  assert.equal(D.peut(d, 'production.etapes', 'valider'), true);
  assert.equal(D.peut(d, 'production.of', 'creer'), false);
  // version périmée refusée
  r = await appel('PUT', '/api/roles/' + role.id, { jeton: J.admin.jeton, body: { version: role.version, droits: {} } });
  assert.equal(r.json().erreur, 'conflit_version');
  // droit inexistant ou non applicable refusé
  const v = (await appel('GET', '/api/roles/' + role.id, { jeton: J.admin.jeton })).json().version;
  for (const droits of [{ 'production.inexistant': ['lire'] }, { 'parametres.societe': ['supprimer'] }]) {
    r = await appel('PUT', '/api/roles/' + role.id, { jeton: J.admin.jeton, body: { version: v, droits } });
    assert.equal(r.json().erreur, 'droit_inconnu');
  }
  r = await appel('PUT', '/api/roles/' + role.id, { jeton: J.admin.jeton, body: { version: v, visibilites: ['salaires_secrets'] } });
  assert.equal(r.json().erreur, 'droit_inconnu');
  // suppression refusée tant qu'il est attribué
  r = await appel('DELETE', '/api/roles/' + role.id, { jeton: J.admin.jeton });
  assert.equal(r.json().erreur, 'role_attribue');
  J.roleChef = role.id;
});

test('copie d’un rôle fourni, puis suppression d’un rôle non attribué', async () => {
  const id = (await pool.query(`select id from noyau.roles where code = 'commercial'`)).rows[0].id;
  let r = await appel('POST', '/api/roles', { jeton: J.admin.jeton, body: { libelle: 'Commercial export', copier_de: id } });
  const copie = r.json();
  assert.equal(copie.droits['commercial.devis'].length, 7);
  assert.deepEqual(copie.visibilites.sort(), ['encours', 'prix']);
  const sa = (await pool.query(`select id from noyau.roles where code = 'super_admin'`)).rows[0].id;
  r = await appel('POST', '/api/roles', { jeton: J.admin.jeton, body: { libelle: 'Faux admin', copier_de: sa } });
  assert.equal(r.json().erreur, 'copie_interdite');
  assert.equal((await pool.query(`select count(*)::int n from noyau.roles where libelle = 'Faux admin'`)).rows[0].n, 0);
  r = await appel('DELETE', '/api/roles/' + copie.id, { jeton: J.admin.jeton });
  assert.equal(r.statusCode, 200);
});

test('rôles protégés : Super admin intouchable, rôle fourni non renommable ni supprimable, réinitialisable', async () => {
  const roles = (await appel('GET', '/api/roles', { jeton: J.admin.jeton })).json();
  const sa = roles.find((x) => x.code === 'super_admin'), com = roles.find((x) => x.code === 'commercial');
  assert.equal((await appel('PUT', '/api/roles/' + sa.id, { jeton: J.admin.jeton, body: { version: sa.version, droits: {} } })).json().erreur, 'role_protege');
  assert.equal((await appel('PUT', '/api/roles/' + com.id, { jeton: J.admin.jeton, body: { version: com.version, libelle: 'Vendeur' } })).json().erreur, 'role_fourni');
  assert.equal((await appel('DELETE', '/api/roles/' + com.id, { jeton: J.admin.jeton })).json().erreur, 'role_fourni');
  // on retire le droit prix au Commercial, puis on revient au défaut du CDC
  let r = await appel('PUT', '/api/roles/' + com.id, { jeton: J.admin.jeton, body: { version: com.version, visibilites: ['encours'] } });
  assert.equal(D.voit(await mesDroits('commercial'), 'prix'), false);
  r = await appel('POST', `/api/roles/${com.id}/reinitialiser`, { jeton: J.admin.jeton });
  assert.equal(r.statusCode, 200);
  assert.equal(D.voit(await mesDroits('commercial'), 'prix'), true);
});

test('seul le Super admin modifie les rôles et les comptes ; la Direction lit', async () => {
  const roles = (await appel('GET', '/api/roles', { jeton: J.direction.jeton })).json();
  assert.equal(roles.length >= 8, true);
  const com = roles.find((x) => x.code === 'commercial');
  assert.equal((await appel('GET', '/api/roles/' + com.id, { jeton: J.direction.jeton })).statusCode, 200);
  assert.equal((await appel('GET', '/api/utilisateurs', { jeton: J.direction.jeton })).statusCode, 200);
  assert.equal((await appel('GET', '/api/audit', { jeton: J.direction.jeton })).statusCode, 200);
  assert.equal((await appel('PUT', '/api/roles/' + com.id, { jeton: J.direction.jeton, body: { version: com.version, visibilites: [] } })).statusCode, 403);
  assert.equal((await appel('POST', '/api/roles', { jeton: J.direction.jeton, body: { libelle: 'Pirate' } })).statusCode, 403);
  assert.equal((await appel('POST', '/api/utilisateurs', { jeton: J.direction.jeton, body: { identifiant: 'pirate', nom_complet: 'Pirate', roles: ['super_admin'] } })).statusCode, 403);
  for (const k of ['commercial', 'atelier', 'rh', 'compta']) {
    assert.equal((await appel('GET', '/api/audit', { jeton: J[k].jeton })).statusCode, 403, k);
    assert.equal((await appel('GET', '/api/droits/catalogue', { jeton: J[k].jeton })).statusCode, 403, k);
  }
  // chacun peut toujours lire ses propres droits
  for (const k of ['commercial', 'atelier', 'rh']) assert.equal((await appel('GET', '/api/droits/moi', { jeton: J[k].jeton })).statusCode, 200);
});

test('audit des changements de droits', async () => {
  const a = (await appel('GET', '/api/audit?limite=500', { jeton: J.admin.jeton })).json().lignes;
  const actions = new Set(a.map((x) => x.action));
  for (const x of ['role_cree', 'role_modifie', 'role_supprime', 'role_reinitialise']) assert.ok(actions.has(x), x);
  const modif = a.find((x) => x.action === 'role_modifie' && x.entite_id === String(J.roleChef));
  assert.ok(modif.avant && modif.apres);
});
