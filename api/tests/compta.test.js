'use strict';
// Tests 0.7.0 : comptabilité clients (encaissements, lettrage, retenue subie, relances), fournisseurs (factures,
// règlements, retenue opérée et certificat), comptabilité générale (écritures équilibrées, exports CSV / Excel), articles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-c-'));
process.env.ERP_CATALOGUE_REPRISE = path.join(TMP, 'r.json'); process.env.ERP_CATALOGUE_USINE = path.join(TMP, 'u.json');
fs.writeFileSync(process.env.ERP_CATALOGUE_REPRISE, JSON.stringify({ catalog: [], models: {}, shop: { articles: {} } }));

const { pool } = require('../lib/db');
const { migrer } = require('../lib/migrations');
const mdp = require('../lib/mdp');
const D = require('../lib/droits');
const { construire } = require('../server');
let app;
const J = {};
const appel = (method, url, { jeton, body } = {}) => app.inject({ method, url, payload: body, headers: jeton ? { authorization: 'Bearer ' + jeton } : {} });
async function compte(cle, roles) {
  const h = await mdp.hacher('Atelier-Polo-2026');
  const r = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ($1, $1, $2, false) returning id`, ['c.' + cle, h]);
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code = any($2)`, [r.rows[0].id, roles]);
  J[cle] = (await appel('POST', '/api/auth/connexion', { body: { identifiant: 'c.' + cle, mot_de_passe: 'Atelier-Polo-2026' } })).json().jeton;
}
const CLIENT = { id: 'c1', name: 'Hôtel Test', mf: '1234567A/A/M/000', address: 'Av. Habib Bourguiba', city: 'Sousse' };
// F1 : 5 × 41,99 TTC + timbre 1 = 210,950 · F2 : 1 000 HT + 19 % + 1 = 1 191,000 · F3 : export EUR, TVA 0 %
const F1 = { id: 'fac1', number: 'FAC-2026-0001', date: '2026-09-01', due: '2026-09-15', status: 'validee', client: CLIENT, lines: [{ designation: 'Polo', qty: 5, pu: 41.99 }], tva: 19, timbre: 1, pricesTTC: true, advance: 0, payments: [] };
const F2 = { id: 'fac2', number: 'FAC-2026-0002', date: '2026-10-01', due: '2026-12-31', status: 'validee', client: CLIENT, lines: [{ designation: 'Veste', qty: 10, pu: 100 }], tva: 19, timbre: 1, pricesTTC: false, advance: 0, payments: [] };
const F3 = { id: 'fac3', number: 'FAC-2026-0003', date: '2026-10-05', due: '2026-11-05', status: 'validee', client: { id: 'c2', name: 'Hotel Paris' }, currency: 'EUR', export: true, lines: [{ designation: 'Tablier', qty: 100, pu: 8 }], tva: 0, timbre: 0, pricesTTC: false, advance: 0, payments: [] };

test.before(async () => {
  await require('./_base').viderBase();
  await migrer(pool, { info: () => {} });
  D._viderCache();
  for (const f of [F1, F2, F3]) await pool.query(`insert into commercial.documents (collection, id, donnees) values ('invoices', $1, $2)`, [f.id, f]);
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('clients', 'c1', $1)`, [CLIENT]);
  app = construire({ logger: false, limiteConnexion: 1000 }); await app.ready();
  for (const [k, r] of Object.entries({ admin: ['super_admin'], compta: ['comptabilite'], commercial: ['commercial'], infographie: ['infographie'], magasin: ['magasin'], direction: ['direction'] })) await compte(k, r);
});
test.after(async () => { await app.close(); await pool.end(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('réponses du comptable : taux, options, mention légale, préfixes', async () => {
  const f = (await appel('GET', '/api/parametres/fiscalite', { jeton: J.compta })).json();
  const v = (c) => f.find((x) => x.code === c && x.en_vigueur);
  assert.equal(v('tva_normale').valeur, 19); assert.match(v('tva_normale').commentaire, /Confirmé par le comptable/);
  assert.equal(v('timbre_fiscal').valeur, 1);
  assert.equal(v('tva_export').valeur, 0);
  assert.equal(v('ras_achats').valeur, 1.5); assert.equal(v('ras_seuil').valeur, 1000);
  const o = (await appel('GET', '/api/compta/options', { jeton: J.compta })).json().options;
  assert.equal(o.find((x) => x.code === 'methode_stock').valeur, 'CMUP');
  assert.equal(o.find((x) => x.code === 'facture_electronique').valeur, 'oui');
  assert.equal(o.find((x) => x.code === 'ecarts_change').valeur, 'aucun');
  const s = (await appel('GET', '/api/parametres/societe', { jeton: J.compta })).json();
  assert.match(s.mentions, /article 18 du Code de la TVA/);
  const n = (await appel('GET', '/api/parametres/numerotation', { jeton: J.admin })).json().map((x) => x.prefixe);
  for (const p of ['ENC', 'FF', 'RGF', 'RAS']) assert.ok(n.includes(p), p);
});

test('articles hors Studio : le comptable et le commercial créent, sans passer par l’infographie', async () => {
  let r = await appel('POST', '/api/commercial/articles', { jeton: J.compta, body: { code: 'TRANSP', designation: 'Transport Sousse', type: 'prestation', prix_ht: 30, tva: 19 } });
  assert.equal(r.statusCode, 201);
  r = await appel('POST', '/api/commercial/articles', { jeton: J.commercial, body: { code: 'POLO-B', designation: 'Polo blanc sans marquage', prix_ht: 25.5 } });
  assert.equal(r.statusCode, 201);
  assert.equal((await appel('POST', '/api/commercial/articles', { jeton: J.commercial, body: { code: 'transp', designation: 'Doublon' } })).statusCode, 409, 'code unique sans casse');
  assert.equal((await appel('POST', '/api/commercial/articles', { jeton: J.infographie, body: { code: 'X1', designation: 'X' } })).statusCode, 403);
  const l = (await appel('GET', '/api/commercial/articles', { jeton: J.infographie })).json();
  assert.equal(l.length, 2); assert.ok(l.every((a) => a.prix_ht === undefined), 'aucun prix sans le droit');
  const a = (await appel('GET', '/api/commercial/articles', { jeton: J.compta })).json().find((x) => x.code === 'TRANSP');
  assert.equal(a.prix_ht, 30);
  assert.equal((await appel('PUT', '/api/commercial/articles/' + a.id, { jeton: J.compta, body: { ...a, prix_ht: 35 } })).statusCode, 400, 'champs inconnus refusés');
  const { id, maj_le, ...corps } = a;
  assert.equal((await appel('PUT', '/api/commercial/articles/' + a.id, { jeton: J.compta, body: { ...corps, prix_ht: 35, version: 99 } })).statusCode, 409);
  assert.equal((await appel('PUT', '/api/commercial/articles/' + a.id, { jeton: J.compta, body: { ...corps, prix_ht: 35 } })).statusCode, 200);
});

test('encaissement : lettrage de deux factures, règlements écrits dans la Gestion, retenue subie', async () => {
  let r = (await appel('GET', '/api/compta/clients/c1/factures', { jeton: J.compta })).json();
  assert.deepEqual(r.map((x) => [x.numero, x.reste]), [['FAC-2026-0001', 210.95], ['FAC-2026-0002', 1191]]);
  // F1 soldée, F2 : le client retient 1,5 % (17,865) et paie le reste
  const res = await appel('POST', '/api/compta/encaissements', { jeton: J.compta, body: { client_id: 'c1', date: '2026-10-20', mode: 'Virement', reference: 'VIR 778', montant: 1384.085,
    affectations: [{ facture_id: 'fac1' }, { facture_id: 'fac2', taux_retenue: 1.5 }] } });
  assert.equal(res.statusCode, 201, res.body);
  const e = res.json(); assert.match(e.numero, /^ENC-2026-0001$/); assert.equal(e.montant, 1384.085); assert.equal(e.retenue, 17.865);
  r = (await appel('GET', '/api/compta/clients/c1/factures', { jeton: J.compta })).json();
  assert.deepEqual(r.map((x) => x.reste), [0, 0]);
  const g = (await appel('GET', '/api/commercial/gestion', { jeton: J.compta })).json();
  const f2 = g.invoices.find((x) => x.id === 'fac2');
  assert.equal(f2.payments.length, 2); assert.ok(f2.payments.some((p) => p.mode === 'Retenue à la source' && p.amount === 17.865));
  const ras = (await appel('GET', '/api/compta/retenues', { jeton: J.compta })).json();
  assert.equal(ras.length, 1); assert.equal(ras[0].sens, 'subie'); assert.equal(ras[0].montant, 17.865); assert.equal(ras[0].tiers_mf, CLIENT.mf); assert.equal(ras[0].certificat_recu, false);
  // double paiement refusé
  const t = await appel('POST', '/api/compta/encaissements', { jeton: J.compta, body: { client_id: 'c1', date: '2026-10-21', mode: 'Espèces', affectations: [{ facture_id: 'fac1', montant: 1 }] } });
  assert.equal(t.statusCode, 400); assert.equal(t.json().erreur, 'trop_percu');
  // montant annoncé ≠ somme affectée
  assert.equal((await appel('POST', '/api/compta/encaissements', { jeton: J.compta, body: { client_id: 'c2', date: '2026-10-21', mode: 'Virement', montant: 10, affectations: [{ facture_id: 'fac3', montant: 20 }] } })).json().erreur, 'montant_incoherent');
  // facture d'un autre client
  assert.equal((await appel('POST', '/api/compta/encaissements', { jeton: J.compta, body: { client_id: 'c1', date: '2026-10-21', mode: 'Virement', affectations: [{ facture_id: 'fac3', montant: 20 }] } })).json().erreur, 'autre_client');
  // la Gestion ne peut ni effacer ces règlements ni annuler la facture lettrée
  const put = await appel('PUT', '/api/commercial/invoices', { jeton: J.compta, body: { ...f2, payments: [] } });
  assert.equal(put.statusCode, 200); assert.equal(put.json().payments.length, 2, 'règlements de la comptabilité conservés');
  assert.equal((await appel('PUT', '/api/commercial/invoices', { jeton: J.compta, body: { ...f2, status: 'annulee' } })).json().erreur, 'facture_lettree');
  // certificat du client reçu
  assert.equal((await appel('POST', `/api/compta/retenues/${ras[0].id}/certificat`, { jeton: J.compta, body: { reference: 'CERT-HT-0045' } })).statusCode, 200);
});

test('chèque en portefeuille, remise en banque, impayé : le lettrage est défait', async () => {
  const e = (await appel('POST', '/api/compta/encaissements', { jeton: J.compta, body: { client_id: 'c2', date: '2026-10-20', mode: 'Chèque', reference: 'CHQ 1234', echeance: '2026-11-20', affectations: [{ facture_id: 'fac3', montant: 300 }] } })).json();
  assert.equal(e.statut, 'portefeuille');
  let l = (await appel('GET', '/api/compta/encaissements', { jeton: J.compta })).json().find((x) => x.id === e.id);
  assert.equal(l.devise, 'EUR'); assert.equal(l.affectations[0].numero, 'FAC-2026-0003');
  assert.equal((await appel('POST', `/api/compta/encaissements/${e.id}/statut`, { jeton: J.compta, body: { statut: 'remis', version: l.version } })).statusCode, 200);
  l = (await appel('GET', '/api/compta/encaissements', { jeton: J.compta })).json().find((x) => x.id === e.id);
  assert.equal((await appel('POST', `/api/compta/encaissements/${e.id}/statut`, { jeton: J.compta, body: { statut: 'impaye', version: l.version } })).json().erreur, 'motif_requis');
  assert.equal((await appel('POST', `/api/compta/encaissements/${e.id}/statut`, { jeton: J.compta, body: { statut: 'impaye', version: l.version, motif: 'Chèque rejeté : provision insuffisante' } })).statusCode, 200);
  const r = (await appel('GET', '/api/compta/clients/c2/factures', { jeton: J.compta })).json();
  assert.equal(r[0].reste, 800, 'la facture redevient due');
  assert.throws !== undefined;
  await assert.rejects(pool.query('delete from compta.encaissements where id = $1', [e.id]), /Suppression interdite/);
});

test('relances : seulement les factures échues non soldées', async () => {
  assert.equal((await appel('POST', '/api/compta/relances', { jeton: J.compta, body: { client_id: 'c1', niveau: 1, canal: 'email', date: '2026-10-21' } })).json().erreur, 'rien_a_relancer');
  const r = await appel('POST', '/api/compta/relances', { jeton: J.compta, body: { client_id: 'c2', niveau: 2, canal: 'courrier', date: '2026-11-10', note: 'Relance après impayé' } });
  assert.equal(r.statusCode, 201); assert.equal(r.json().montant, 800);
  const h = (await appel('GET', '/api/compta/relances', { jeton: J.compta })).json();
  assert.equal(h[0].niveau, 2); assert.equal(h[0].factures[0].numero, 'FAC-2026-0003');
  assert.equal((await appel('GET', '/api/compta/relances', { jeton: J.commercial })).statusCode, 403);
});

test('fournisseurs : facture → validation → règlement avec retenue opérée et certificat RAS', async () => {
  const fo = (await pool.query(`insert into registres.fiches (registre, donnees) values ('fournisseurs', $1) returning id`, [{ nom: 'Tissage du Sahel', mf: '7654321B/A/M/000', adresse: 'Zone industrielle', ville: 'Monastir' }])).rows[0].id;
  const body = { fournisseur_id: Number(fo), reference: 'TS-2026-118', date: '2026-10-02', echeance: '2026-11-01', categorie: 'achats', timbre: 1,
    lignes: [{ designation: 'Sergé 65/35 240 g', qte: 500, pu_ht: 12.5, tva: 19 }, { designation: 'Fil polyester', qte: 20, pu_ht: 6, tva: 19 }] };
  let r = await appel('POST', '/api/compta/fournisseurs/factures', { jeton: J.compta, body });
  assert.equal(r.statusCode, 201, r.body);
  const ff = r.json(); assert.equal(ff.ht, 6370); assert.equal(ff.tva, 1210.3); assert.equal(ff.net, 7581.3); assert.equal(ff.numero, 'FF-2026-0001');
  assert.equal((await appel('POST', '/api/compta/fournisseurs/factures', { jeton: J.compta, body: { ...body, reference: 'ts-2026-118' } })).json().erreur, 'facture_deja_saisie');
  // pas de règlement avant validation
  assert.equal((await appel('POST', '/api/compta/fournisseurs/reglements', { jeton: J.compta, body: { fournisseur_id: Number(fo), date: '2026-10-25', mode: 'Virement', factures: [{ facture_id: ff.id, montant: 100 }] } })).json().erreur, 'facture_non_validee');
  let l = (await appel('GET', '/api/compta/fournisseurs/factures', { jeton: J.compta })).json()[0];
  assert.equal((await appel('POST', `/api/compta/fournisseurs/factures/${ff.id}/valider`, { jeton: J.commercial, body: { version: l.version } })).statusCode, 403);
  assert.equal((await appel('POST', `/api/compta/fournisseurs/factures/${ff.id}/valider`, { jeton: J.compta, body: { version: l.version } })).statusCode, 200);
  l = (await appel('GET', '/api/compta/fournisseurs/factures', { jeton: J.compta })).json()[0];
  assert.equal((await appel('PUT', `/api/compta/fournisseurs/factures/${ff.id}`, { jeton: J.compta, body: { ...body, version: l.version } })).json().erreur, 'facture_figee');
  // règlement total avec retenue 1,5 % (taux des Paramètres)
  r = await appel('POST', '/api/compta/fournisseurs/reglements', { jeton: J.compta, body: { fournisseur_id: Number(fo), date: '2026-10-25', mode: 'Virement', reference: 'VIR 91', retenue: { nature: 'achats' }, factures: [{ facture_id: ff.id, montant: 7581.3 }] } });
  assert.equal(r.statusCode, 201, r.body);
  const g = r.json(); assert.equal(g.retenue, 113.72); assert.equal(g.net, 7467.58); assert.equal(g.certificat, 'RAS-2026-0001');
  const ras = (await appel('GET', '/api/compta/retenues', { jeton: J.compta })).json().find((x) => x.sens === 'operee');
  assert.equal(ras.base, 7581.3); assert.equal(ras.taux, 1.5); assert.equal(ras.tiers_mf, '7654321B/A/M/000');
  assert.equal((await appel('POST', '/api/compta/fournisseurs/reglements', { jeton: J.compta, body: { fournisseur_id: Number(fo), date: '2026-10-26', mode: 'Virement', factures: [{ facture_id: ff.id, montant: 1 }] } })).json().erreur, 'trop_paye');
  const c = (await appel('GET', '/api/compta/fournisseurs/comptes', { jeton: J.compta })).json();
  assert.equal(c[0].reste, 0); assert.equal(c[0].regle, 7581.3);
  // facture réglée : annulation refusée ; on annule d'abord le règlement
  assert.equal((await appel('POST', `/api/compta/fournisseurs/factures/${ff.id}/annuler`, { jeton: J.compta, body: { version: l.version, motif: 'erreur' } })).json().erreur, 'facture_reglee');
  // seuil : petit achat avec retenue « achats » refusé
  const p = (await appel('POST', '/api/compta/fournisseurs/factures', { jeton: J.compta, body: { ...body, reference: 'TS-2026-119', lignes: [{ designation: 'Boutons', qte: 100, pu_ht: 0.5, tva: 19 }] } })).json();
  const pl = (await appel('GET', '/api/compta/fournisseurs/factures', { jeton: J.compta })).json().find((x) => x.id === p.id);
  await appel('POST', `/api/compta/fournisseurs/factures/${p.id}/valider`, { jeton: J.compta, body: { version: pl.version } });
  assert.equal((await appel('POST', '/api/compta/fournisseurs/reglements', { jeton: J.compta, body: { fournisseur_id: Number(fo), date: '2026-10-26', mode: 'Espèces', retenue: { nature: 'achats' }, factures: [{ facture_id: p.id, montant: 60.5 }] } })).json().erreur, 'sous_le_seuil');
  // le magasin ne voit pas les factures fournisseurs ; la direction lit sans modifier
  assert.equal((await appel('GET', '/api/compta/fournisseurs/factures', { jeton: J.magasin })).statusCode, 403);
  assert.equal((await appel('GET', '/api/compta/fournisseurs/factures', { jeton: J.direction })).statusCode, 200);
  assert.equal((await appel('POST', '/api/compta/fournisseurs/factures', { jeton: J.direction, body })).statusCode, 403);
});

test('comptabilité générale : écritures équilibrées, balance, exports CSV et Excel', async () => {
  const r = (await appel('GET', '/api/compta/ecritures?du=2026-01-01&au=2026-12-31', { jeton: J.compta })).json();
  assert.deepEqual(r.desequilibres, [], 'toutes les écritures sont équilibrées');
  const j = (k) => r.ecritures.filter((e) => e.journal === k).length;
  assert.equal(j('VE'), 3); assert.equal(j('AC'), 2, 'les deux factures fournisseurs validées'); assert.ok(j('BQ') >= 2);
  const ve = r.ecritures.find((e) => e.piece === 'FAC-2026-0002');
  assert.deepEqual(ve.lignes.map((l) => [l.compte, l.debit, l.credit]), [['411', 1191, 0], ['701', 0, 1000], ['4367', 0, 190], ['4472', 0, 1]]);
  const ex = r.ecritures.find((e) => e.piece === 'FAC-2026-0003');
  assert.equal(ex.lignes[0].devise, 'EUR'); assert.equal(ex.lignes.length, 2, 'export : pas de TVA ni de timbre');
  const rg = r.ecritures.find((e) => e.piece.startsWith('RGF'));
  assert.ok(rg.lignes.some((l) => l.compte === '4353' && l.credit === 113.72));
  const enc = r.ecritures.find((e) => e.piece === 'ENC-2026-0001');
  assert.ok(enc.lignes.some((l) => l.compte === '4351' && l.debit === 17.865));
  assert.ok(!r.ecritures.some((e) => e.piece === 'ENC-2026-0002'), 'chèque impayé : pas d’écriture');
  const s = r.balance.filter((b) => b.devise === 'DT').reduce((a, b) => a + b.solde, 0);
  assert.ok(Math.abs(s) < 0.001, 'balance équilibrée');
  // exports
  const x = await appel('GET', '/api/compta/export/journaux?du=2026-01-01&au=2026-12-31&format=xlsx', { jeton: J.compta });
  assert.equal(x.statusCode, 200); assert.match(x.headers['content-type'], /spreadsheetml/); assert.equal(x.rawPayload.slice(0, 2).toString(), 'PK');
  const c = await appel('GET', '/api/compta/export/ventes?du=2026-01-01&au=2026-12-31&format=csv', { jeton: J.compta });
  assert.match(c.headers['content-type'], /text\/csv/); assert.ok(c.body.startsWith('\ufeffDate;Facture;'));
  assert.match(c.body, /FAC-2026-0002;Hôtel Test;1234567A\/A\/M\/000;DT;1000;0;19;190;1;1191;/);
  for (const u of ['achats', 'retenues', 'balance-clients', 'balance-fournisseurs']) {
    const y = await appel('GET', `/api/compta/export/${u}?format=xlsx`, { jeton: J.compta });
    assert.equal(y.statusCode, 200, u); assert.equal(y.rawPayload.slice(0, 2).toString(), 'PK', u);
  }
  assert.equal((await appel('GET', '/api/compta/export/journaux', { jeton: J.direction })).statusCode, 403, 'direction : lecture sans export');
  const a = (await pool.query(`select count(*)::int n from noyau.audit where action = 'export_comptable'`)).rows[0].n;
  assert.ok(a >= 6, 'chaque export est tracé');
});

test('plan comptable modifiable par la comptabilité, valorisation CMUP', async () => {
  assert.equal((await appel('PUT', '/api/compta/plan/ventes_produits', { jeton: J.commercial, body: { compte: '7011' } })).statusCode, 403);
  assert.equal((await appel('PUT', '/api/compta/plan/ventes_produits', { jeton: J.compta, body: { compte: '7011' } })).statusCode, 200);
  const r = (await appel('GET', '/api/compta/ecritures?du=2026-10-01&au=2026-10-01', { jeton: J.compta })).json();
  assert.equal(r.ecritures[0].lignes[1].compte, '7011');
  const v = (await appel('GET', '/api/compta/valorisation', { jeton: J.compta })).json();
  assert.equal(v.methode, 'CMUP');
  const s = v.articles.find((x) => x.designation.startsWith('Sergé'));
  assert.equal(s.cmup, 12.5); assert.equal(s.quantite, 500);
  assert.equal((await appel('GET', '/api/compta/valorisation', { jeton: J.commercial })).statusCode, 403);
});

test('sans droit : aucun montant comptable ne sort', async () => {
  for (const u of ['/api/compta/encaissements', '/api/compta/retenues', '/api/compta/ecritures', '/api/compta/fournisseurs/comptes', '/api/compta/clients/c1/factures']) {
    for (const k of ['infographie', 'magasin']) assert.equal((await appel('GET', u, { jeton: J[k] })).statusCode, 403, `${k} ${u}`);
  }
  assert.equal((await appel('GET', '/api/compta/retenues')).statusCode, 401);
});
