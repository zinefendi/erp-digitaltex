'use strict';
// Tests de l'étape 15 : société, fiscalité datée, numérotation sans doublon ni trou, accueil.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../lib/db');
const { migrer } = require('../lib/migrations');
const mdp = require('../lib/mdp');
const D = require('../lib/droits');
const { construire } = require('../server');

let app;
const appel = (method, url, { jeton, body } = {}) => app.inject({ method, url, payload: body, headers: jeton ? { authorization: 'Bearer ' + jeton } : {} });
const MDP = 'Atelier-Polo-2026';
const J = {};
async function compte(cle, roles) {
  const h = await mdp.hacher(MDP);
  const r = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ($1, $1, $2, false) returning id`, ['t.' + cle, h]);
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code = any($2)`, [r.rows[0].id, roles]);
  J[cle] = (await appel('POST', '/api/auth/connexion', { body: { identifiant: 't.' + cle, mot_de_passe: MDP } })).json().jeton;
}

test.before(async () => {
  await require('./_base').viderBase();
  // données de reprise comme sur le serveur (application 3.3.0)
  await pool.query(`create schema reprise; create table reprise.enregistrements (id bigserial primary key, collection text not null, id_origine text not null, donnees jsonb not null, unique (collection, id_origine));
    insert into reprise.enregistrements (collection, id_origine, donnees) values
     ('parametres','societe','{"mf":"1062705C/A/M/000","rc":"","rib":"","web":"www.digital-tex-tunisie.com","bank":"ATB","city":"4180","name":"DIGITAL-TEX S.A.","email":"contact@exemple.tn","phone":"+216 75 623 791","address":"2 rue thouraya","logo":"data:image/jpeg;base64,AAAA"}'),
     ('parametres','gestion','{"tva":19,"timbre":1,"blPrefix":"BL","orderPrefix":"CMD","invoicePrefix":"FAC","receiptPrefix":"REC"}'),
     ('compteurs','order:2026','{"cle":"order:2026","dernier_numero":2}'),
     ('compteurs','invoice:2026','{"cle":"invoice:2026","dernier_numero":2}'),
     ('compteurs','bl:2026','{"cle":"bl:2026","dernier_numero":1}'),
     ('compteurs','receipt:2026','{"cle":"receipt:2026","dernier_numero":2}')`);
  await migrer(pool, { info: () => {} });
  D._viderCache();
  app = construire({ logger: false, limiteConnexion: 1000 }); await app.ready();
  await compte('admin', ['super_admin']); await compte('compta', ['comptabilite']); await compte('atelier', ['production']); await compte('direction', ['direction']);
});
test.after(async () => { await app.close(); await pool.end(); });

test('reprise : société, préfixes et compteurs de l’application 3.3.0', async () => {
  const s = (await appel('GET', '/api/parametres/societe', { jeton: J.admin })).json();
  assert.equal(s.nom, 'DIGITAL-TEX S.A.'); assert.equal(s.mf, '1062705C/A/M/000'); assert.equal(s.banque, 'ATB');
  assert.equal(s.logo, 'data:image/jpeg;base64,AAAA');
  assert.deepEqual(s.a_completer, ['registre de commerce', 'RIB']);
  const n = (await appel('GET', '/api/parametres/numerotation', { jeton: J.admin })).json();
  const par = Object.fromEntries(n.map((x) => [x.type, x]));
  assert.equal(n.length, 12); // 8 + 4 ajoutés en 0.7.0 (encaissement, facture fournisseur, règlement fournisseur, certificat RAS)
  assert.equal(par.commande.prochain, `CMD-${new Date().getFullYear()}-0003`);
  assert.equal(par.facture.prochain, `FAC-${new Date().getFullYear()}-0003`);
  assert.equal(par.bl.prochain, `BL-${new Date().getFullYear()}-0002`);
  assert.equal(par.devis.prochain, `DEV-${new Date().getFullYear()}-0001`);
  const f = (await appel('GET', '/api/parametres/fiscalite', { jeton: J.admin })).json();
  assert.equal(f.find((x) => x.code === 'tva_normale').valeur, 19);
  assert.equal(f.find((x) => x.code === 'timbre_fiscal').valeur, 1);
});

test('numérotation : 50 attributions simultanées → 50 numéros consécutifs, aucun doublon', async () => {
  const an = new Date().getFullYear();
  const r = await Promise.all(Array.from({ length: 50 }, () => pool.query(`select parametres.attribuer_numero('devis') n`)));
  const nums = r.map((x) => x.rows[0].n).sort();
  assert.equal(new Set(nums).size, 50);
  assert.equal(nums[0], `DEV-${an}-0001`); assert.equal(nums[49], `DEV-${an}-0050`);
});

test('numérotation : transaction annulée → numéro non consommé (pas de trou)', async () => {
  const c = await pool.connect();
  await c.query('begin'); const n1 = (await c.query(`select parametres.attribuer_numero('avoir') n`)).rows[0].n; await c.query('rollback'); c.release();
  const n2 = (await pool.query(`select parametres.attribuer_numero('avoir') n`)).rows[0].n;
  assert.equal(n1, n2);
});

test('numérotation : nouvelle année → repart à 0001 ; type inconnu refusé', async () => {
  assert.equal((await pool.query(`select parametres.attribuer_numero('facture', '2027-01-02') n`)).rows[0].n, 'FAC-2027-0001');
  await assert.rejects(pool.query(`select parametres.attribuer_numero('pirate')`), /inconnu/);
});

test('numérotation : préfixe modifiable, unique, compteur intouchable', async () => {
  let n = (await appel('GET', '/api/parametres/numerotation', { jeton: J.admin })).json().find((x) => x.type === 'proforma');
  let r = await appel('PUT', '/api/parametres/numerotation/proforma', { jeton: J.admin, body: { version: n.version, prefixe: 'fac' } });
  assert.equal(r.json().erreur, 'prefixe_pris');
  r = await appel('PUT', '/api/parametres/numerotation/proforma', { jeton: J.admin, body: { version: n.version, prefixe: 'PF-1' } });
  assert.equal(r.json().erreur, 'prefixe_invalide');
  r = await appel('PUT', '/api/parametres/numerotation/proforma', { jeton: J.admin, body: { version: n.version, prefixe: 'pf' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().find((x) => x.type === 'proforma').prochain, `PF-${new Date().getFullYear()}-0001`);
  r = await appel('PUT', '/api/parametres/numerotation/proforma', { jeton: J.admin, body: { version: n.version, prefixe: 'PX' } });
  assert.equal(r.json().erreur, 'conflit_version');
  const dev = (await appel('GET', '/api/parametres/numerotation', { jeton: J.admin })).json().find((x) => x.type === 'devis');
  await pool.query(`update parametres.compteurs set dernier = 999 where type = 'devis'`);
  r = await appel('PUT', '/api/parametres/numerotation/devis', { jeton: J.admin, body: { version: dev.version, chiffres: 3 } });
  assert.equal(r.json().erreur, 'chiffres_insuffisants');
  r = await appel('PUT', '/api/parametres/numerotation/devis', { jeton: J.admin, body: { version: dev.version, dernier: 0 } });
  assert.equal(r.statusCode, 400, 'le compteur ne se modifie pas par l’API');
});

test('fiscalité : valeurs datées, la valeur en vigueur dépend de la date du document', async () => {
  let r = await appel('POST', '/api/parametres/fiscalite', { jeton: J.admin, body: { code: 'tva_normale', valeur: 20, en_vigueur_le: '2030-01-01', commentaire: 'test' } });
  assert.equal(r.statusCode, 201); assert.equal(r.json().avertissement, null);
  assert.equal(Number((await pool.query(`select parametres.taux_a('tva_normale') v`)).rows[0].v), 19);
  assert.equal(Number((await pool.query(`select parametres.taux_a('tva_normale', '2030-06-01') v`)).rows[0].v), 20);
  assert.equal((await pool.query(`select parametres.taux_a('tva_normale', '2010-01-01') v`)).rows[0].v, null);
  const f = r.json().fiscalite.filter((x) => x.code === 'tva_normale');
  assert.equal(f.find((x) => x.valeur === 19).en_vigueur, true); assert.equal(f.find((x) => x.valeur === 20).a_venir, true);
  r = await appel('POST', '/api/parametres/fiscalite', { jeton: J.admin, body: { code: 'tva_normale', valeur: 21, en_vigueur_le: '2030-01-01' } });
  assert.equal(r.json().erreur, 'date_prise');
  r = await appel('POST', '/api/parametres/fiscalite', { jeton: J.admin, body: { code: 'tva_normale', valeur: 7, unite: 'DT', en_vigueur_le: '2031-01-01' } });
  assert.equal(r.json().erreur, 'unite_differente');
  r = await appel('POST', '/api/parametres/fiscalite', { jeton: J.admin, body: { code: 'tva_normale', valeur: 150, en_vigueur_le: '2031-01-01' } });
  assert.equal(r.json().erreur, 'valeur_invalide');
  r = await appel('POST', '/api/parametres/fiscalite', { jeton: J.admin, body: { code: 'retenue_source', valeur: 1, en_vigueur_le: '2031-01-01' } });
  assert.equal(r.json().erreur, 'incomplet');
  r = await appel('POST', '/api/parametres/fiscalite', { jeton: J.admin, body: { code: 'timbre_fiscal', valeur: 1, en_vigueur_le: '2020-01-01' } });
  assert.match(r.json().avertissement, /passé/);
  // valeur en vigueur : non supprimable ; valeur à venir : supprimable
  const toutes = (await appel('GET', '/api/parametres/fiscalite', { jeton: J.admin })).json();
  const enVig = toutes.find((x) => x.code === 'tva_normale' && x.valeur === 19), futur = toutes.find((x) => x.code === 'tva_normale' && x.valeur === 20);
  assert.equal((await appel('DELETE', '/api/parametres/fiscalite/' + enVig.id, { jeton: J.admin })).json().erreur, 'deja_en_vigueur');
  assert.equal((await appel('DELETE', '/api/parametres/fiscalite/' + futur.id, { jeton: J.admin })).statusCode, 200);
});

test('société : contrôles (RIB 20 chiffres, logo image, e-mail), version, audit sans le logo', async () => {
  let s = (await appel('GET', '/api/parametres/societe', { jeton: J.admin })).json();
  let r = await appel('PUT', '/api/parametres/societe', { jeton: J.admin, body: { version: s.version, rib: '1234' } });
  assert.equal(r.json().erreur, 'rib_invalide');
  r = await appel('PUT', '/api/parametres/societe', { jeton: J.admin, body: { version: s.version, logo: 'data:text/html;base64,PHNjcmlwdD4=' } });
  assert.equal(r.json().erreur, 'logo_invalide');
  r = await appel('PUT', '/api/parametres/societe', { jeton: J.admin, body: { version: s.version, email: 'pas-un-mail' } });
  assert.equal(r.json().erreur, 'email_invalide');
  r = await appel('PUT', '/api/parametres/societe', { jeton: J.admin, body: { version: s.version, rib: '0100 1234 5678 9012 3456', rc: 'B0123452020', logo: 'data:image/png;base64,' + 'A'.repeat(5000) } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().rib, '01001234567890123456'); assert.deepEqual(r.json().a_completer, []);
  r = await appel('PUT', '/api/parametres/societe', { jeton: J.admin, body: { version: s.version, nom: 'Ancienne' } });
  assert.equal(r.json().erreur, 'conflit_version');
  const a = (await appel('GET', '/api/audit?action=societe_modifiee', { jeton: J.admin })).json().lignes[0];
  assert.equal(a.avant.rc, ''); assert.equal(a.apres.rc, 'B0123452020');
  assert.ok(!JSON.stringify(a).includes('AAAAAAAAAA'), 'le logo n’est pas copié dans le journal');
});

test('droits : tous lisent, seul le Super admin modifie ; la Comptabilité lit la fiscalité', async () => {
  for (const k of ['compta', 'atelier', 'direction']) {
    assert.equal((await appel('GET', '/api/parametres/societe', { jeton: J[k] })).statusCode, 200, k);
    assert.equal((await appel('GET', '/api/parametres/numerotation', { jeton: J[k] })).statusCode, 200, k);
    const s = (await appel('GET', '/api/parametres/societe', { jeton: J[k] })).json();
    assert.equal((await appel('PUT', '/api/parametres/societe', { jeton: J[k], body: { version: s.version, nom: 'Pirate' } })).statusCode, 403, k);
    assert.equal((await appel('POST', '/api/parametres/fiscalite', { jeton: J[k], body: { code: 'tva_normale', valeur: 0, en_vigueur_le: '2032-01-01' } })).statusCode, 403, k);
    assert.equal((await appel('PUT', '/api/parametres/numerotation/devis', { jeton: J[k], body: { version: 1, prefixe: 'X' } })).statusCode, 403, k);
  }
  assert.equal((await appel('GET', '/api/parametres/societe')).statusCode, 401);
});

test('accueil : modules selon les droits, chiffres d’administration réservés', async () => {
  const a = (await appel('GET', '/api/accueil', { jeton: J.admin })).json();
  assert.equal(a.modules.length, 11);
  assert.deepEqual(a.modules.map((m) => m.numero), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(a.modules.find((m) => m.code === 'parametres').actif, true);
  assert.equal(a.comptes.actifs, 4); assert.ok(a.securite);
  const at = (await appel('GET', '/api/accueil', { jeton: J.atelier })).json();
  assert.deepEqual(at.modules.map((m) => m.code), ['infographie', 'commercial', 'production', 'bom', 'stock_mp', 'stock_pf']);
  assert.equal(at.comptes, undefined); assert.equal(at.securite, undefined); assert.equal(at.societe_a_completer, undefined);
  const co = (await appel('GET', '/api/accueil', { jeton: J.compta })).json();
  assert.ok(co.modules.some((m) => m.code === 'paie'), 'journal de paie en lecture');
});
