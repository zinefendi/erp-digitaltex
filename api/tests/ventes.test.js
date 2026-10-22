'use strict';
// Tests ventes (lot 0.9.0) : devis → proforma → commande, numéros sans doublon ni trou (concurrence),
// statuts, verrou 30 min et version, vente à perte (DT et devise), masquage des montants,
// avoirs (partiel, total, plafond, imputation, annulation), export FR/EN et colisage, comptabilité.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-'));
process.env.ERP_GLB_DIR = path.join(TMP, 'glb');
process.env.ERP_CATALOGUE_REPRISE = path.join(TMP, 'reprise.json');
process.env.ERP_CATALOGUE_USINE = path.join(TMP, 'usine.json');
process.env.ERP_SAUVEGARDES = path.join(TMP, 'sauv');
process.env.ERP_FICHIERS_DIR = path.join(TMP, 'fichiers');
fs.writeFileSync(process.env.ERP_CATALOGUE_USINE, JSON.stringify({ catalog: [], shop: { articles: {} }, models: {} }));

const { pool } = require('../lib/db');
const { migrer } = require('../lib/migrations');
const mdp = require('../lib/mdp');
const D = require('../lib/droits');
const { construire } = require('../server');
let app;
const appel = (method, url, { jeton, body } = {}) => app.inject({ method, url, payload: body, headers: jeton ? { authorization: 'Bearer ' + jeton } : {} });
const J = {};
async function compte(cle, roles) {
  const h = await mdp.hacher('Atelier-Polo-2026');
  const r = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ($1, $1, $2, false) returning id`, ['v.' + cle, h]);
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code = any($2)`, [r.rows[0].id, roles]);
  J[cle] = (await appel('POST', '/api/auth/connexion', { body: { identifiant: 'v.' + cle, mot_de_passe: 'Atelier-Polo-2026' } })).json().jeton;
}
const AN = new Date().getFullYear();
let PF; // produit fini de test : PRI 10,355 DT, prix 14,497 DT HT

test.before(async () => {
  await require('./_base').viderBase();
  await migrer(pool, { info: () => {} });
  D._viderCache();
  app = construire({ logger: false, limiteConnexion: 1000 }); await app.ready();
  for (const [k, r] of Object.entries({ admin: ['super_admin'], commercial: ['commercial'], infographie: ['infographie'], compta: ['comptabilite'], atelier: ['production'], direction: ['direction'] })) await compte(k, r);
  for (const c of [{ id: 'cl-local', name: 'Hôtel Sousse', mf: '123A', type_client: 'local', devise: 'DT' }, { id: 'cl-export', name: 'Hotel Lyon SARL', type_client: 'export', devise: 'EUR', country: 'France' }])
    await pool.query(`insert into commercial.documents (collection, id, donnees) values ('clients', $1, $2)`, [c.id, c]);
  PF = (await appel('POST', '/api/produits', { jeton: J.admin, body: { code_article: 'P', sexe: 'H', bom: [{ designation: 'Piqué', qte: 0.4, pu: 12.5 }], gamme: [{ operation: 'Assemblage', temps_min: 30 }] } })).json();
});
test.after(async () => { await app.close(); await pool.end(); fs.rmSync(TMP, { recursive: true, force: true }); });

const ligne = (pu, extra = {}) => ({ produit: PF.reference, designation: 'Polo homme', couleur: 'Bleu', taille: 'M', qte: 10, pu, ...extra });

test('devis : numéro serveur, totaux recalculés (TVA en vigueur, TTC), statuts', async () => {
  // 20 DT TTC > PRI 10,355 × 1,19 : pas de perte
  let r = await appel('POST', '/api/ventes/devis', { jeton: J.commercial, body: { client_id: 'cl-local', lignes: [ligne(20), { designation: 'Transport', qte: 1, pu: 50, service: true }], ht: 1 } });
  assert.equal(r.statusCode, 400, 'champ inconnu refusé (montants calculés par le serveur)');
  r = await appel('POST', '/api/ventes/devis', { jeton: J.commercial, body: { client_id: 'cl-local', lignes: [ligne(20), { designation: 'Transport', qte: 1, pu: 50, service: true }] } });
  assert.equal(r.statusCode, 201, r.body);
  const d = r.json();
  assert.equal(d.numero, `DEV-${AN}-0001`); assert.equal(d.statut, 'emis'); assert.equal(d.tva, 19); assert.equal(d.prix_ttc, true);
  // 0.9.1 : FODEC 1 % sur les produits (pas sur le transport) : HT = 200 / (1,19 × 1,01) + 50 / 1,19
  assert.equal(d.ttc, 250); assert.equal(d.fodec, 1); assert.equal(d.ht, 208.42); assert.equal(d.montant_fodec, 1.664); assert.equal(d.montant_tva, 39.916); assert.equal(d.devise, 'DT');
  assert.ok(d.validite > d.date, 'validité 30 jours par défaut');
  // passage envoyé → accepté ; refus sans motif refusé
  r = await appel('POST', `/api/ventes/devis/${d.id}/statut`, { jeton: J.commercial, body: { statut: 'envoye', version: d.version } });
  assert.equal(r.statusCode, 200);
  r = await appel('POST', `/api/ventes/devis/${d.id}/statut`, { jeton: J.commercial, body: { statut: 'refuse', version: d.version + 1 } });
  assert.equal(r.json().erreur, 'motif_requis');
  r = await appel('POST', `/api/ventes/devis/${d.id}/statut`, { jeton: J.commercial, body: { statut: 'transforme', version: d.version + 1 } });
  assert.equal(r.json().erreur, 'statut_invalide', 'transformé seulement par la transformation');
  // suppression impossible, même en base
  await assert.rejects(pool.query('delete from ventes.documents'), /Suppression interdite/);
});

test('vente à perte : refus 409 sans confirmation, audit si confirmée, contrôle aussi en devise', async () => {
  // 11 DT TTC → 9,244 HT < PRI 10,355
  let r = await appel('POST', '/api/ventes/devis', { jeton: J.commercial, body: { client_id: 'cl-local', lignes: [ligne(11)] } });
  assert.equal(r.statusCode, 409); assert.equal(r.json().erreur, 'vente_a_perte'); assert.match(r.json().message, /P00126H/);
  // aucun numéro consommé par l'échec (transaction annulée) : le suivant est 0002
  r = await appel('POST', '/api/ventes/devis', { jeton: J.commercial, body: { client_id: 'cl-local', lignes: [ligne(11)], confirmer_perte: true } });
  assert.equal(r.statusCode, 201); assert.equal(r.json().numero, `DEV-${AN}-0002`); assert.equal(r.json().vente_perte, true);
  const a = (await pool.query(`select details from noyau.audit where action = 'vente_a_perte_confirmee' and entite = 'devis' order by id desc limit 1`)).rows[0];
  assert.equal(a.details.lignes[0].ref, PF.reference);
  // export EUR : taux de change obligatoire dès qu'il y a un produit fini ; 3 EUR × 3,3 = 9,9 DT < PRI → perte
  r = await appel('POST', '/api/ventes/proformas', { jeton: J.commercial, body: { client_id: 'cl-export', lignes: [ligne(3)] } });
  assert.equal(r.json().erreur, 'taux_change_requis');
  r = await appel('POST', '/api/ventes/proformas', { jeton: J.commercial, body: { client_id: 'cl-export', lignes: [ligne(3)], taux_change: 3.3 } });
  assert.equal(r.json().erreur, 'vente_a_perte');
  r = await appel('POST', '/api/ventes/proformas', { jeton: J.commercial, body: { client_id: 'cl-export', lignes: [ligne(5)], taux_change: 3.3, langue: 'en', incoterm: 'fob', lieu_incoterm: 'Port de Sousse',
    colisage: [{ colis: '1', contenu: 'Polos M', quantite: 10, poids_net: 2.5, poids_brut: 3 }] } });
  assert.equal(r.statusCode, 201, r.body);
  const p = r.json();
  assert.equal(p.numero, `PRO-${AN}-0001`); assert.equal(p.devise, 'EUR'); assert.equal(p.tva, 0); assert.equal(p.prix_ttc, false);
  assert.equal(p.net, 50); assert.equal(p.incoterm, 'FOB'); assert.equal(p.langue, 'en'); assert.equal(p.colisage.length, 1); assert.equal(p.taux_change, 3.3);
});

test('numérotation : 12 devis en parallèle → 12 numéros distincts et consécutifs', async () => {
  const rs = await Promise.all(Array.from({ length: 12 }, () => appel('POST', '/api/ventes/devis', { jeton: J.commercial, body: { client_id: 'cl-local', lignes: [ligne(20)] } })));
  const nums = rs.map((r) => { assert.equal(r.statusCode, 201, r.body); return Number(r.json().numero.slice(-4)); }).sort((a, b) => a - b);
  assert.deepEqual(nums, Array.from({ length: 12 }, (_, i) => i + 3));
});

test('verrou 30 min et version : un autre poste est refusé avec le nom de la personne', async () => {
  const d = (await appel('POST', '/api/ventes/devis', { jeton: J.commercial, body: { client_id: 'cl-local', lignes: [ligne(20)] } })).json();
  assert.equal((await appel('POST', `/api/verrous/devis/${d.id}`, { jeton: J.commercial })).statusCode, 200);
  let r = await appel('POST', `/api/verrous/devis/${d.id}`, { jeton: J.admin });
  assert.equal(r.statusCode, 423); assert.match(r.json().message, /v\.commercial/);
  r = await appel('PUT', `/api/ventes/devis/${d.id}`, { jeton: J.admin, body: { version: d.version, note: 'x' } });
  assert.equal(r.statusCode, 423);
  r = await appel('GET', `/api/ventes/devis/${d.id}`, { jeton: J.admin });
  assert.equal(r.json().verrou.par, 'v.commercial');
  // le détenteur enregistre ; une version périmée est refusée
  r = await appel('PUT', `/api/ventes/devis/${d.id}`, { jeton: J.commercial, body: { version: d.version, note: 'Livraison sous 3 semaines', lignes: [ligne(25)] } });
  assert.equal(r.statusCode, 200, r.body); assert.equal(r.json().ttc, 250); assert.equal(r.json().version, d.version + 1);
  r = await appel('PUT', `/api/ventes/devis/${d.id}`, { jeton: J.commercial, body: { version: d.version, note: 'ancienne' } });
  assert.equal(r.json().erreur, 'conflit_version');
  // bail expiré → un autre peut prendre la main
  await pool.query(`update noyau.verrous set expire_le = now() - interval '1 minute'`);
  assert.equal((await appel('POST', `/api/verrous/devis/${d.id}`, { jeton: J.admin })).statusCode, 200);
  await appel('DELETE', `/api/verrous/devis/${d.id}`, { jeton: J.admin });
});

test('transformation : devis → proforma → commande (Gestion), traçabilité amont ↔ aval', async () => {
  const d = (await appel('POST', '/api/ventes/devis', { jeton: J.commercial, body: { client_id: 'cl-local', ref_client: 'DA-77', lignes: [ligne(20, { remise: 10 }), { designation: 'Transport', qte: 1, pu: 50, service: true }] } })).json();
  let r = await appel('POST', `/api/ventes/devis/${d.id}/proforma`, { jeton: J.commercial, body: { version: d.version } });
  assert.equal(r.statusCode, 201, r.body);
  const p = r.json();
  assert.equal(p.origine_num, d.numero); assert.equal(p.lignes.length, 2); assert.equal(p.ttc, d.ttc);
  const d2 = (await appel('GET', `/api/ventes/devis/${d.id}`, { jeton: J.commercial })).json();
  assert.equal(d2.statut, 'transforme'); assert.equal(d2.suites[0].numero, p.numero);
  // un devis transformé ne se retransforme pas
  assert.equal((await appel('POST', `/api/ventes/devis/${d.id}/proforma`, { jeton: J.commercial, body: { version: d2.version } })).json().erreur, 'transition_interdite');
  r = await appel('POST', `/api/ventes/proformas/${p.id}/commande`, { jeton: J.commercial, body: { version: p.version, livraison: '2026-12-15' } });
  assert.equal(r.statusCode, 201, r.body);
  const cmd = r.json().commande;
  assert.match(cmd.numero, new RegExp(`^CMD-${AN}-`));
  const g = (await appel('GET', '/api/commercial/gestion', { jeton: J.commercial })).json();
  const o = g.orders.find((x) => x.id === cmd.id);
  assert.equal(o.clientPO, 'DA-77'); assert.equal(o.lines.length, 2); assert.equal(o.lines[0].article, PF.reference);
  assert.equal(o.lines[0].pu, 18); assert.equal(o.lines[1].service, true); assert.equal(o.origine.numero, p.numero); assert.equal(o.delivery, '2026-12-15');
  const p2 = (await appel('GET', `/api/ventes/proformas/${p.id}`, { jeton: J.commercial })).json();
  assert.equal(p2.statut, 'transformee'); assert.equal(p2.commande_num, cmd.numero);
  assert.equal((await appel('GET', `/api/ventes/devis/${d.id}`, { jeton: J.commercial })).json().commande_num, cmd.numero);
});

test('droits et masquage : sans « prix », aucun montant ne sort ; atelier sans accès aux devis', async () => {
  for (const k of ['infographie', 'atelier']) {
    const r = await appel('GET', '/api/ventes/devis', { jeton: J[k] });
    if (k === 'atelier') { assert.equal(r.statusCode, 403); continue; }
    assert.equal(r.statusCode, 200);
    const t = r.body;
    for (const champ of ['"ht"', '"net"', '"ttc"', '"pu"', '"montant_tva"', '"vente_perte"', '"taux_change"']) assert.ok(!t.includes(champ), `${k} : fuite ${champ}`);
    assert.ok(r.json()[0].lignes[0].qte > 0, 'quantités visibles');
    assert.equal((await appel('POST', '/api/ventes/devis', { jeton: J[k], body: { client_id: 'cl-local', lignes: [ligne(20)] } })).statusCode, 403);
  }
  // direction : lecture seule
  assert.equal((await appel('GET', '/api/ventes/proformas', { jeton: J.direction })).statusCode, 200);
  assert.equal((await appel('POST', '/api/ventes/devis', { jeton: J.direction, body: { client_id: 'cl-local', lignes: [ligne(20)] } })).statusCode, 403);
  // le commercial ne peut pas annuler un avoir (réservé à la comptabilité, CDC § 5.2)
  const r = await appel('POST', '/api/ventes/avoirs/1/statut', { jeton: J.commercial, body: { statut: 'annule', motif: 'x', version: 1 } });
  assert.equal(r.statusCode, 403);
});

test('avoirs : partiel puis total, plafond par ligne, imputation sur la facture, annulation', async () => {
  // facture locale 10 × 23,8 TTC = 238 + timbre 1 = 239
  const f = { id: 'fac-av', number: `FAC-${AN}-0900`, date: `${AN}-01-10`, client: { id: 'cl-local', name: 'Hôtel Sousse' }, tva: 19, timbre: 1, pricesTTC: true,
    lines: [{ designation: 'Polo homme', article: PF.reference, qty: 10, pu: 23.8 }, { designation: 'Transport', qty: 1, pu: 59.5, service: true }], payments: [], status: 'validee' };
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('invoices', $1, $2)`, [f.id, f]);
  let r = await appel('POST', '/api/ventes/avoirs', { jeton: J.compta, body: { facture_id: f.id, motif: 'Retour 2 polos', lignes: [{ index: 0, qte: 2 }] } });
  assert.equal(r.statusCode, 201, r.body);
  const a1 = r.json();
  // 0.9.2 : l'avoir comporte le timbre de la facture (1 DT)
  assert.equal(a1.numero, `AV-${AN}-0001`); assert.equal(a1.net, 48.6); assert.equal(a1.timbre, 1); assert.equal(a1.ht, 40); assert.equal(a1.a_rembourser, 0);
  let fac = (await appel('GET', '/api/commercial/gestion', { jeton: J.compta })).json().invoices.find((x) => x.id === f.id);
  assert.equal(fac.payments[0].mode, 'Avoir'); assert.equal(fac.payments[0].amount, 48.6);
  // plafond : il reste 8 polos créditables
  r = await appel('POST', '/api/ventes/avoirs', { jeton: J.compta, body: { facture_id: f.id, motif: 'trop', lignes: [{ index: 0, qte: 9 }] } });
  assert.equal(r.json().erreur, 'trop_credite');
  const cr = (await appel('GET', `/api/ventes/factures/${f.id}/creditable`, { jeton: J.compta })).json();
  assert.equal(cr.lignes[0].creditable, 8); assert.equal(cr.reste, r3(298.5 - 48.6));
  // la Gestion ne peut ni retirer l'imputation de l'avoir ni annuler la facture
  r = await appel('PUT', '/api/commercial/invoices', { jeton: J.compta, body: { ...fac, payments: [] } });
  assert.equal(r.statusCode, 200); assert.equal(r.json().payments.length, 1, 'imputation d’avoir conservée');
  r = await appel('PUT', '/api/commercial/invoices', { jeton: J.compta, body: { ...fac, status: 'annulee' } });
  assert.equal(r.json().erreur, 'facture_avec_avoir');
  // un règlement de 200 DT puis avoir total du reste : l'excédent devient « à rembourser »
  fac = (await appel('GET', '/api/commercial/gestion', { jeton: J.compta })).json().invoices.find((x) => x.id === f.id);
  await appel('PUT', '/api/commercial/invoices', { jeton: J.compta, body: { ...fac, payments: [...fac.payments, { id: 'p1', date: `${AN}-01-12`, amount: 200, mode: 'Virement' }] } });
  r = await appel('POST', '/api/ventes/avoirs', { jeton: J.compta, body: { facture_id: f.id, motif: 'Annulation de la vente', total: true } });
  assert.equal(r.statusCode, 201, r.body);
  const a2 = r.json();
  assert.equal(a2.net, r3(8 * 23.8 + 59.5 + 1)); assert.equal(a2.a_rembourser, r3(a2.net - (298.5 - 48.6 - 200)));
  r = await appel('POST', '/api/ventes/avoirs', { jeton: J.compta, body: { facture_id: f.id, motif: 'encore', total: true } });
  assert.equal(r.json().erreur, 'rien_a_crediter');
  // annulation d'un avoir : motif obligatoire, imputation retirée de la facture
  r = await appel('POST', `/api/ventes/avoirs/${a1.id}/statut`, { jeton: J.compta, body: { statut: 'annule', version: a1.version } });
  assert.equal(r.json().erreur, 'motif_requis');
  r = await appel('POST', `/api/ventes/avoirs/${a1.id}/statut`, { jeton: J.compta, body: { statut: 'annule', motif: 'Erreur de saisie', version: a1.version } });
  assert.equal(r.statusCode, 200);
  fac = (await appel('GET', '/api/commercial/gestion', { jeton: J.compta })).json().invoices.find((x) => x.id === f.id);
  assert.ok(!fac.payments.some((p) => p.id === a1.numero));
  // écritures : l'avoir émis passe au journal des ventes, équilibré
  const e = (await appel('GET', `/api/compta/ecritures?du=${AN}-01-01&au=${AN}-12-31`, { jeton: J.compta })).json();
  const ecr = e.ecritures.find((x) => x.piece === a2.numero);
  assert.ok(ecr, 'avoir au journal'); assert.equal(ecr.journal, 'VE');
  assert.ok(!e.ecritures.some((x) => x.piece === a1.numero), 'avoir annulé non comptabilisé');
  assert.ok(!e.desequilibres.includes(a2.numero));
  assert.ok(ecr.lignes.some((l) => l.compte === '4472' && l.debit === 1), 'timbre de l’avoir au débit du compte timbre');
  const tb = (await appel('GET', `/api/compta/tableau-de-bord?du=${AN}-01-01&au=${AN}-12-31`, { jeton: J.compta })).json();
  assert.equal(tb.ventes.find((v) => v.devise === 'DT').avoirs, 1);
});

test('colisage d’une facture export : enregistrement versionné', async () => {
  const f = { id: 'fac-exp', number: `FAC-${AN}-0901`, date: `${AN}-02-01`, client: { id: 'cl-export', name: 'Hotel Lyon SARL' }, tva: 0, timbre: 0, pricesTTC: false, currency: 'EUR', export: true, lines: [{ designation: 'Polo', qty: 100, pu: 6 }], payments: [], status: 'validee' };
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('invoices', $1, $2)`, [f.id, f]);
  let r = await appel('PUT', `/api/ventes/colisage/${f.id}`, { jeton: J.compta, body: { version: 0, colis: [{ colis: '1', contenu: 'Polos S-M', quantite: 50, poids_net: 12, poids_brut: 13.5, dimensions: '60×40×40' }, { colis: '2', contenu: 'Polos L-XL', quantite: 50, poids_net: 13, poids_brut: 14.2 }] } });
  assert.equal(r.statusCode, 200, r.body); assert.equal(r.json().version, 1);
  r = await appel('PUT', `/api/ventes/colisage/${f.id}`, { jeton: J.compta, body: { version: 0, colis: [] } });
  assert.equal(r.json().erreur, 'conflit_version');
  assert.equal((await appel('GET', `/api/ventes/colisage/${f.id}`, { jeton: J.commercial })).json().colis.length, 2);
});

test('commande Gestion : vente à perte contrôlée aussi en devise (taux de change mémorisé)', async () => {
  const n = (await appel('POST', '/api/commercial/numero', { jeton: J.commercial, body: { kind: 'order' } })).json().numero;
  const o = { number: n, status: 'en_cours', client: { id: 'cl-export', name: 'Hotel Lyon SARL' }, currency: 'EUR', export: true, pricesTTC: false, taux_change: 3.3, lines: [{ id: 'l1', article: PF.reference, designation: 'Polo', qty: 5, pu: 3 }] };
  let r = await appel('PUT', '/api/commercial/orders', { jeton: J.commercial, body: o });
  assert.equal(r.json().erreur, 'vente_a_perte');
  r = await appel('PUT', '/api/commercial/orders', { jeton: J.commercial, body: { ...o, lines: [{ ...o.lines[0], pu: 5 }] } });
  assert.equal(r.statusCode, 200);
});

const r3 = (v) => Math.round(v * 1000) / 1000;

// ============================================================ 0.9.1
const gestionDe = async (jeton) => (await appel('GET', '/api/commercial/gestion', { jeton })).json();
const putG = (col, body, jeton = J.compta) => appel('PUT', '/api/commercial/' + col, { jeton, body });

test('0.9.1 FODEC : facture locale au taux en vigueur (figé), export sans FODEC, calcul du modèle DIGITAL-TEX', async () => {
  const C = require('../lib/calculs');
  // facture du modèle (HT) : 5 × 28 + 7 × 26 = 322 ; FODEC 1 % = 3,220 ; TVA 19 % sur 325,22 = 61,792 ; TTC 387,012 ; + timbre = 388,012
  const t = C.totauxFacture({ tva: 19, fodec: 1, timbre: 1, pricesTTC: false, lines: [{ qty: 5, pu: 28 }, { qty: 7, pu: 26 }] });
  assert.deepEqual([t.ht, t.fodec, t.tva, t.ttc, t.net], [322, 3.22, 61.792, 387.012, 388.012]);
  const n = (await appel('POST', '/api/commercial/numero', { jeton: J.compta, body: { kind: 'invoice', date: `${AN}-03-01` } })).json().numero;
  let r = await putG('invoices', { number: n, date: `${AN}-03-01`, client: { id: 'cl-local', name: 'Hôtel Sousse' }, tva: 19, timbre: 1, pricesTTC: false, fodec: 7, lines: [{ designation: 'T-shirt', qty: 5, pu: 28 }], payments: [], status: 'validee' });
  assert.equal(r.statusCode, 200, r.body); assert.equal(r.json().fodec, 1, 'taux fixé par le serveur, pas par le poste');
  const id = r.json().id;
  r = await putG('invoices', { ...r.json(), fodec: 0 });
  assert.equal(r.json().fodec, 1, 'le taux FODEC d’une facture émise ne change pas');
  const n2 = (await appel('POST', '/api/commercial/numero', { jeton: J.compta, body: { kind: 'invoice' } })).json().numero;
  r = await putG('invoices', { number: n2, date: `${AN}-03-02`, client: { id: 'cl-export', name: 'Hotel Lyon SARL' }, currency: 'EUR', export: true, tva: 0, timbre: 0, pricesTTC: false, lines: [{ designation: 'Polo', qty: 10, pu: 6 }], payments: [], status: 'validee' });
  assert.equal(r.json().fodec, 0, 'export : pas de FODEC');
  // écriture équilibrée avec une ligne FODEC (compte du plan, à confirmer par le comptable)
  const e = (await appel('GET', `/api/compta/ecritures?du=${AN}-03-01&au=${AN}-03-01`, { jeton: J.compta })).json();
  const ecr = e.ecritures.find((x) => x.piece === n);
  assert.ok(ecr.lignes.some((l) => l.compte === '4471' && l.credit === 1.4), JSON.stringify(ecr.lignes));
  assert.ok(!e.desequilibres.includes(n));
  await pool.query(`update commercial.documents set donnees = jsonb_set(donnees, '{status}', '"annulee"') where id = $1`, [id]);
});

test('0.9.1 facture : lignes modifiables / supprimables tant qu’elle n’est pas réglée, plafond commande, audit', async () => {
  const no = (await appel('POST', '/api/commercial/numero', { jeton: J.commercial, body: { kind: 'order' } })).json().numero;
  const o = (await putG('orders', { number: no, status: 'en_cours', client: { id: 'cl-local', name: 'Hôtel Sousse' }, lines: [
    { id: 'a1', designation: 'Polo', size: 'M', qty: 10, pu: 23.8 }, { id: 'a2', designation: 'Polo', size: 'L', qty: 4, pu: 23.8 }, { id: 'a3', designation: 'Transport', qty: 1, pu: 59.5, service: true }] }, J.commercial)).json();
  const nf = (await appel('POST', '/api/commercial/numero', { jeton: J.compta, body: { kind: 'invoice' } })).json().numero;
  const base = { number: nf, date: `${AN}-04-01`, orderId: o.id, orderNumber: o.number, client: { id: 'cl-local', name: 'Hôtel Sousse' }, tva: 19, timbre: 1, pricesTTC: true, advance: 0, payments: [], status: 'validee', blIds: [] };
  let f = (await putG('invoices', { ...base, lines: [{ designation: 'Polo (M×6, L×4)', qty: 10, pu: 23.8, remise: 0, lineIds: ['a1', 'a2'], qtyBy: { a1: 6, a2: 4 } }, { designation: 'Transport', qty: 1, pu: 59.5, lineIds: ['a3'], qtyBy: { a3: 1 }, service: true }] })).json();
  // modifier la quantité (8 M) : accepté, plafond = 10 M commandés
  let r = await putG('invoices', { ...f, lines: [{ ...f.lines[0], qty: 12, qtyBy: { a1: 8, a2: 4 } }, f.lines[1]] });
  assert.equal(r.statusCode, 200, r.body); f = r.json();
  r = await putG('invoices', { ...f, lines: [{ ...f.lines[0], qty: 15, qtyBy: { a1: 11, a2: 4 } }, f.lines[1]] });
  assert.equal(r.json().erreur, 'trop_facture');
  r = await putG('invoices', { ...f, lines: [{ ...f.lines[0], qty: 13, qtyBy: { a1: 8, a2: 4 } }, f.lines[1]] });
  assert.equal(r.json().erreur, 'ligne_invalide', 'quantité = somme des tailles');
  // supprimer la ligne transport + changer prix et remise
  r = await putG('invoices', { ...f, lines: [{ ...f.lines[0], pu: 22, remise: 5, designation: 'Polo brodé' }] });
  assert.equal(r.statusCode, 200, r.body); f = r.json();
  assert.equal(f.lines.length, 1); assert.equal(f.number, nf, 'le numéro ne change pas');
  r = await putG('invoices', { ...f, lines: [] });
  assert.equal(r.json().erreur, 'lignes_absentes');
  r = await putG('invoices', { ...f, tva: 7 });
  assert.equal(r.json().erreur, 'champ_fige');
  const a = (await pool.query(`select avant, apres from noyau.audit where action = 'facture_lignes_modifiees' and entite_id = $1 order by id desc limit 1`, [nf])).rows[0];
  assert.ok(a && a.avant.lignes.length === 2 && a.apres.lignes.length === 1, 'audit avant / après');
  // le commercial (droit prix mais pas « modifier facture » ?) — l'infographe sans prix : refusé
  assert.equal((await putG('invoices', f, J.infographie)).statusCode, 403);
  // après un règlement : figée
  f = (await putG('invoices', { ...f, payments: [{ id: 'p', date: `${AN}-04-02`, amount: 10, mode: 'Espèces' }] })).json();
  r = await putG('invoices', { ...f, lines: [{ ...f.lines[0], pu: 20 }] });
  assert.equal(r.json().erreur, 'facture_reglee');
  // règlement retiré puis avoir : figée aussi
  f = (await putG('invoices', { ...f, payments: [] })).json();
  const av = (await appel('POST', '/api/ventes/avoirs', { jeton: J.compta, body: { facture_id: f.id, motif: 'Retour', lignes: [{ index: 0, qte: 1 }] } })).json();
  f = (await gestionDe(J.compta)).invoices.find((x) => x.id === f.id);
  r = await putG('invoices', { ...f, lines: [{ ...f.lines[0], pu: 20 }] });
  assert.equal(r.json().erreur, 'facture_reglee', 'l’imputation de l’avoir compte comme un règlement');
  assert.ok(av.numero);
});

test('0.9.1 BL : quantités modifiables et lignes supprimables tant qu’il n’est pas facturé', async () => {
  const no = (await appel('POST', '/api/commercial/numero', { jeton: J.commercial, body: { kind: 'order' } })).json().numero;
  const o = (await putG('orders', { number: no, status: 'en_cours', client: { id: 'cl-local', name: 'Hôtel Sousse' }, lines: [{ id: 'b1', designation: 'Polo', size: 'M', qty: 10, pu: 20 }, { id: 'b2', designation: 'Polo', size: 'L', qty: 5, pu: 20 }] }, J.commercial)).json();
  const mk = async (lines) => (await putG('bls', { number: (await appel('POST', '/api/commercial/numero', { jeton: J.commercial, body: { kind: 'bl' } })).json().numero, date: `${AN}-05-01`, orderId: o.id, orderNumber: o.number, client: o.client, lines, status: 'livre' }, J.commercial)).json();
  const bl1 = await mk([{ lineId: 'b1', designation: 'Polo', size: 'M', qty: 6 }, { lineId: 'b2', designation: 'Polo', size: 'L', qty: 5 }]);
  await mk([{ lineId: 'b1', designation: 'Polo', size: 'M', qty: 3 }]);
  let r = await putG('bls', { ...bl1, lines: [{ ...bl1.lines[0], qty: 8 }, bl1.lines[1]] }, J.commercial);
  assert.equal(r.json().erreur, 'trop_livre', '10 commandés − 3 livrés par l’autre BL = 7 au plus');
  r = await putG('bls', { ...bl1, lines: [{ ...bl1.lines[0], qty: 7 }] }, J.commercial);
  assert.equal(r.statusCode, 200, r.body); assert.equal(r.json().lines.length, 1);
  r = await putG('bls', { ...bl1, lines: [] }, J.commercial);
  assert.equal(r.json().erreur, 'lignes_absentes');
  r = await putG('bls', { ...bl1, lines: [{ lineId: 'zz', designation: 'X', qty: 1 }] }, J.commercial);
  assert.equal(r.json().erreur, 'ligne_invalide');
  // facturé → figé, et ne s'annule plus
  const nf = (await appel('POST', '/api/commercial/numero', { jeton: J.compta, body: { kind: 'invoice' } })).json().numero;
  await putG('invoices', { number: nf, date: `${AN}-05-02`, orderId: o.id, client: o.client, blIds: [bl1.id], tva: 19, timbre: 1, pricesTTC: true, lines: [{ designation: 'Polo', qty: 7, pu: 20, lineIds: ['b1'], qtyBy: { b1: 7 } }], payments: [], status: 'validee' });
  const b = (await gestionDe(J.commercial)).bls.find((x) => x.id === bl1.id);
  r = await putG('bls', { ...b, lines: [{ ...b.lines[0], qty: 6 }] }, J.commercial);
  assert.equal(r.json().erreur, 'bl_facture');
  r = await putG('bls', { ...b, status: 'annule' }, J.commercial);
  assert.equal(r.json().erreur, 'bl_facture');
});

test('0.9.1 avoir : modification des quantités et du prix, suppression de ligne, imputation refaite, verrou et version', async () => {
  const f = { id: 'fac-av2', number: `FAC-${AN}-0950`, date: `${AN}-06-10`, client: { id: 'cl-local', name: 'Hôtel Sousse' }, tva: 19, timbre: 1, pricesTTC: true,
    lines: [{ designation: 'Polo homme', qty: 10, pu: 23.8 }, { designation: 'Casquette', qty: 5, pu: 11.9 }], payments: [], status: 'validee' };
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('invoices', $1, $2)`, [f.id, f]);
  let a = (await appel('POST', '/api/ventes/avoirs', { jeton: J.compta, body: { facture_id: f.id, motif: 'Retour', lignes: [{ index: 0, qte: 2 }, { index: 1, qte: 1 }] } })).json();
  assert.equal(a.net, r3(2 * 23.8 + 11.9 + 1));
  // 3 polos, casquette supprimée
  let r = await appel('PUT', `/api/ventes/avoirs/${a.id}`, { jeton: J.compta, body: { version: a.version, lignes: [{ index: 0, qte: 3 }] } });
  assert.equal(r.statusCode, 200, r.body); a = r.json();
  assert.equal(a.lignes.length, 1); assert.equal(a.net, 72.4);
  let fac = (await gestionDe(J.compta)).invoices.find((x) => x.id === f.id);
  assert.equal(fac.payments.length, 1); assert.equal(fac.payments[0].amount, 72.4, 'imputation refaite');
  // erreur de prix : avoir de 2 DT par polo sur 10 polos ; prix > facturé refusé ; quantité > facturée refusée
  r = await appel('PUT', `/api/ventes/avoirs/${a.id}`, { jeton: J.compta, body: { version: a.version, lignes: [{ index: 0, qte: 10, pu: 30 }] } });
  assert.equal(r.json().erreur, 'prix_trop_eleve');
  r = await appel('PUT', `/api/ventes/avoirs/${a.id}`, { jeton: J.compta, body: { version: a.version, lignes: [{ index: 0, qte: 11 }] } });
  assert.equal(r.json().erreur, 'trop_credite');
  r = await appel('PUT', `/api/ventes/avoirs/${a.id}`, { jeton: J.compta, body: { version: a.version, motif: 'Erreur de prix', lignes: [{ index: 0, qte: 10, pu: 2 }] } });
  assert.equal(r.statusCode, 200, r.body); a = r.json(); assert.equal(a.net, 21); assert.equal(a.motif, 'Erreur de prix');
  r = await appel('PUT', `/api/ventes/avoirs/${a.id}`, { jeton: J.compta, body: { version: a.version - 1, lignes: [{ index: 0, qte: 1 }] } });
  assert.equal(r.json().erreur, 'conflit_version');
  r = await appel('PUT', `/api/ventes/avoirs/${a.id}`, { jeton: J.compta, body: { version: a.version, lignes: [{ index: 0, qte: 0 }] } });
  assert.equal(r.json().erreur, 'lignes_absentes');
  // verrou tenu par un autre compte
  await appel('POST', `/api/verrous/avoir/${a.id}`, { jeton: J.admin });
  r = await appel('PUT', `/api/ventes/avoirs/${a.id}`, { jeton: J.compta, body: { version: a.version, lignes: [{ index: 0, qte: 1 }] } });
  assert.equal(r.statusCode, 423);
  await appel('DELETE', `/api/verrous/avoir/${a.id}`, { jeton: J.admin });
  // l'écran « modifier » voit ses propres quantités comme créditables
  const cr = (await appel('GET', `/api/ventes/factures/${f.id}/creditable?sauf=${a.id}`, { jeton: J.compta })).json();
  assert.equal(cr.lignes[0].creditable, 10); assert.equal(cr.reste, r3(238 + 59.5 + 1));
  // sans droit prix : refusé ; annulé : figé
  assert.equal((await appel('PUT', `/api/ventes/avoirs/${a.id}`, { jeton: J.infographie, body: { version: a.version, lignes: [{ index: 0, qte: 1 }] } })).statusCode, 403);
  await appel('POST', `/api/ventes/avoirs/${a.id}/statut`, { jeton: J.compta, body: { statut: 'annule', motif: 'test', version: a.version } });
  r = await appel('PUT', `/api/ventes/avoirs/${a.id}`, { jeton: J.compta, body: { version: a.version + 1, lignes: [{ index: 0, qte: 1 }] } });
  assert.equal(r.json().erreur, 'non_modifiable');
  const au = (await pool.query(`select 1 from noyau.audit where action = 'avoir_modifie' and entite_id = $1`, [a.numero])).rowCount;
  assert.ok(au >= 2);
});

test('0.9.2 avoir : timbre et FODEC de la facture repris ; facture export sans timbre ni FODEC', async () => {
  const f = { id: 'fac-av3', number: `FAC-${AN}-0960`, date: `${AN}-07-01`, client: { id: 'cl-local', name: 'Hôtel Sousse' }, tva: 19, fodec: 1, timbre: 1, pricesTTC: false,
    lines: [{ designation: 'T-shirt', qty: 5, pu: 28 }, { designation: 'T-shirt Pantone', qty: 7, pu: 26 }], payments: [], status: 'validee' };
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('invoices', $1, $2)`, [f.id, f]);
  const a = (await appel('POST', '/api/ventes/avoirs', { jeton: J.compta, body: { facture_id: f.id, date: `${AN}-07-05`, motif: 'Annulation', total: true } })).json();
  // avoir total = facture du modèle DIGITAL-TEX : 322 HT + FODEC 3,220 + TVA 61,792 + timbre 1 = 388,012
  assert.deepEqual([a.ht, a.montant_fodec, a.montant_tva, a.timbre, a.net], [322, 3.22, 61.792, 1, 388.012]);
  const fac = (await appel('GET', '/api/commercial/gestion', { jeton: J.compta })).json().invoices.find((x) => x.id === f.id);
  assert.equal(fac.payments[0].amount, 388.012, 'facture entièrement soldée par l’avoir total');
  const e = (await appel('GET', `/api/compta/ecritures?du=${AN}-07-01&au=${AN}-07-31`, { jeton: J.compta })).json();
  const ecr = e.ecritures.find((x) => x.piece === a.numero);
  assert.ok(ecr.lignes.some((l) => l.compte === '4471' && l.debit === 3.22)); assert.ok(ecr.lignes.some((l) => l.compte === '4472' && l.debit === 1));
  assert.ok(!e.desequilibres.includes(a.numero));
  const fx = { id: 'fac-av4', number: `FAC-${AN}-0961`, date: `${AN}-07-02`, client: { id: 'cl-export', name: 'Hotel Lyon SARL' }, currency: 'EUR', export: true, tva: 0, fodec: 0, timbre: 0, pricesTTC: false,
    lines: [{ designation: 'Polo', qty: 10, pu: 6 }], payments: [], status: 'validee' };
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('invoices', $1, $2)`, [fx.id, fx]);
  const ax = (await appel('POST', '/api/ventes/avoirs', { jeton: J.compta, body: { facture_id: fx.id, motif: 'Retour', lignes: [{ index: 0, qte: 2 }] } })).json();
  assert.deepEqual([ax.timbre, ax.montant_fodec, ax.net], [0, 0, 12]);
});

test('0.10.1 conversion en facture : devis local (TTC) et proforma saisie en PRIX H.T., commande + facture tracées', async () => {
  let d = (await appel('POST', '/api/ventes/devis', { jeton: J.commercial, body: { client_id: 'cl-local', lignes: [ligne(20, { remise: 10, staff: 'RECEPTION' }), { designation: 'Transport', qte: 1, pu: 11.9, service: true }] } })).json();
  assert.equal(d.lignes[0].staff, 'RECEPTION', 'le service (staff) de la ligne est conservé');
  let r = await appel('POST', `/api/ventes/devis/${d.id}/facture`, { jeton: J.atelier, body: { version: d.version } });
  assert.equal(r.statusCode, 403, 'l’atelier ne convertit pas en facture');
  r = await appel('POST', `/api/ventes/devis/${d.id}/facture`, { jeton: J.commercial, body: { version: d.version, echeance: `${AN}-12-31` } });
  assert.equal(r.statusCode, 201, r.body);
  const { commande, facture } = r.json();
  assert.match(facture.numero, /^FAC-/);
  const G = await gestionDe(J.admin);
  const f = G.invoices.find((x) => x.id === facture.id), o = G.orders.find((x) => x.id === commande.id);
  assert.equal(f.orderId, o.id); assert.equal(f.origine.numero, d.numero); assert.equal(f.due, `${AN}-12-31`);
  assert.equal(f.lines[0].remise, 10, 'la remise reste sur la ligne'); assert.equal(f.lines[0].pu, 20);
  assert.equal(f.lines[0].qtyBy[o.lines[0].id], 10, 'la facture couvre toute la commande');
  assert.equal(r3(f.lines.reduce((s, l) => s + l.qty * l.pu * (1 - l.remise / 100), 0)), r3(10 * 18 + 11.9));
  d = (await appel('GET', `/api/ventes/devis/${d.id}`, { jeton: J.admin })).json();
  assert.equal(d.statut, 'transforme');
  assert.equal((await appel('POST', `/api/ventes/devis/${d.id}/facture`, { jeton: J.admin, body: { version: d.version } })).json().erreur, 'transition_interdite');
  // proforma en PRIX H.T. → la commande reçoit des prix TTC (TVA + FODEC sur les produits), la facture garde le H.T.
  const p = (await appel('POST', '/api/ventes/proformas', { jeton: J.admin, body: { client_id: 'cl-local', prix_ttc: false, lignes: [ligne(15)] } })).json();
  assert.equal(p.prix_ttc, false);
  r = await appel('POST', `/api/ventes/proformas/${p.id}/facture`, { jeton: J.admin, body: { version: p.version } });
  assert.equal(r.statusCode, 201, r.body);
  const G2 = await gestionDe(J.admin), f2 = G2.invoices.find((x) => x.id === r.json().facture.id), o2 = G2.orders.find((x) => x.id === r.json().commande.id);
  assert.equal(f2.pricesTTC, false); assert.equal(f2.lines[0].pu, 15);
  assert.ok(Math.abs(o2.lines[0].pu - 15 * (1 + p.tva / 100) * (1 + (p.fodec || 0) / 100)) < 0.0011, 'commande en TTC (format Gestion)');
});

test('0.10.1 facture issue d’une commande Infographie : seuls le prix et la remise se modifient', async () => {
  const no = (await appel('POST', '/api/commercial/numero', { jeton: J.commercial, body: { kind: 'order' } })).json().numero;
  const o = (await putG('orders', { number: no, status: 'en_cours', client: { id: 'cl-local', name: 'Hôtel Sousse' }, lines: [
    { id: 's1', src: 'studio', designation: 'Polo « Accueil »', size: 'M', qty: 5, pu: 30 }, { id: 'm1', designation: 'Transport', qty: 1, pu: 10, service: true }] }, J.commercial)).json();
  const nf = (await appel('POST', '/api/commercial/numero', { jeton: J.compta, body: { kind: 'invoice' } })).json().numero;
  let f = (await putG('invoices', { number: nf, date: `${AN}-05-01`, orderId: o.id, orderNumber: o.number, client: { id: 'cl-local', name: 'Hôtel Sousse' }, tva: 19, timbre: 1, pricesTTC: true, advance: 0, payments: [], status: 'validee', blIds: [],
    lines: [{ designation: 'Polo « Accueil » (M×5)', qty: 5, pu: 30, remise: 0, lineIds: ['s1'], qtyBy: { s1: 5 } }, { designation: 'Transport', qty: 1, pu: 10, lineIds: ['m1'], qtyBy: { m1: 1 }, service: true }] })).json();
  let r = await putG('invoices', { ...f, lines: [{ ...f.lines[0], pu: 28, remise: 5 }, f.lines[1]] });
  assert.equal(r.statusCode, 200, r.body); f = r.json();
  r = await putG('invoices', { ...f, lines: [{ ...f.lines[0], qty: 4, qtyBy: { s1: 4 } }, f.lines[1]] });
  assert.equal(r.json().erreur, 'ligne_infographie');
  r = await putG('invoices', { ...f, lines: [{ ...f.lines[0], designation: 'Autre' }, f.lines[1]] });
  assert.equal(r.json().erreur, 'ligne_infographie');
  r = await putG('invoices', { ...f, lines: [f.lines[0], { ...f.lines[1], qty: 2, qtyBy: undefined, lineIds: undefined }] });
  assert.equal(r.statusCode, 200, 'une ligne ajoutée à la main reste libre : ' + r.body);
});

test('0.10.1 banques, scans des moyens de paiement, fiches techniques, recherche des règlements', async () => {
  const B = (await appel('GET', '/api/parametres/banques', { jeton: J.commercial })).json();
  assert.ok(B.length >= 25 && B.some((b) => b.code === 'BIAT') && B.some((b) => b.code === 'ONP'));
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
  const PDF = Buffer.from('%PDF-1.4\n%fiche technique de test\n%%EOF\n');
  const env = (q, body, jeton, type = 'application/octet-stream') => app.inject({ method: 'POST', url: '/api/fichiers?' + new URLSearchParams(q), payload: body, headers: { authorization: 'Bearer ' + jeton, 'content-type': type } });
  // contenu contrôlé
  let r = await env({ nature: 'scan_paiement', cible_type: 'reglement', nom: 'cheque.exe' }, Buffer.from('MZ\x90\x00 pas une image du tout'), J.commercial);
  assert.equal(r.json().erreur, 'fichier_invalide');
  r = await env({ nature: 'scan_paiement', cible_type: 'reglement', nom: 'cheque.png' }, PNG, J.infographie);
  assert.equal(r.statusCode, 403, 'sans le droit prix : pas de scan');
  r = await env({ nature: 'scan_paiement', cible_type: 'reglement', nom: 'cheque 1234567.png' }, PNG, J.commercial, 'image/png');
  assert.equal(r.statusCode, 201, r.body);
  const scan = r.json(); assert.equal(scan.mime, 'image/png');
  // règlement de facture avec banque, n° du document et scan
  const no = (await appel('POST', '/api/commercial/numero', { jeton: J.commercial, body: { kind: 'order' } })).json().numero;
  const o = (await putG('orders', { number: no, status: 'en_cours', client: { id: 'cl-local', name: 'Hôtel Sousse' }, lines: [{ id: 'x1', src: 'studio', designation: 'Polo', size: 'L', qty: 2, pu: 50 }],
    advances: [{ id: 'av1', date: `${AN}-06-01`, amount: 20, mode: 'Chèque', ref: '7654321', bank: 'STB', due: `${AN}-06-30`, scan: scan.id }] }, J.commercial)).json();
  const nf = (await appel('POST', '/api/commercial/numero', { jeton: J.compta, body: { kind: 'invoice' } })).json().numero;
  await putG('invoices', { number: nf, date: `${AN}-06-02`, orderId: o.id, orderNumber: o.number, client: { id: 'cl-local', name: 'Hôtel Sousse' }, tva: 19, timbre: 1, pricesTTC: true, advance: 0, status: 'validee', blIds: [],
    lines: [{ designation: 'Polo', qty: 2, pu: 50, remise: 0, lineIds: ['x1'], qtyBy: { x1: 2 } }], payments: [{ id: 'p1', date: `${AN}-06-03`, amount: 30, mode: 'Chèque', ref: '1234567', bank: 'BIAT', scan: scan.id }] });
  r = await appel('GET', '/api/reglements/recherche', { jeton: J.commercial });
  assert.equal(r.statusCode, 200, r.body);
  const L = r.json().filter((x) => x.doc_numero === nf || x.doc_numero === no);
  const reg = L.find((x) => x.type === 'reglement'), avc = L.find((x) => x.type === 'avance');
  assert.equal(reg.banque_nom, 'Banque Internationale Arabe de Tunisie (BIAT)'); assert.equal(reg.numero_doc, '1234567'); assert.equal(reg.scan.id, scan.id);
  assert.equal(avc.banque, 'STB'); assert.equal(avc.echeance, `${AN}-06-30`);
  assert.equal((await appel('GET', '/api/reglements/recherche', { jeton: J.infographie })).statusCode, 403, 'aucun montant sans le droit prix');
  // le scan s'ouvre (droit prix) ; pas pour l'infographiste
  r = await appel('GET', `/api/fichiers/${scan.id}`, { jeton: J.commercial });
  assert.equal(r.statusCode, 200); assert.equal(r.headers['content-type'], 'image/png'); assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal((await appel('GET', `/api/fichiers/${scan.id}`, { jeton: J.infographie })).statusCode, 403);
  // fiche technique : PDF du Studio rattaché par le n° de commande (nom « fiches-techniques-<n°>-<client> »), ouverte par double-clic
  r = await env({ nature: 'fiche_technique', cible_type: 'commande', commande_slug: `fiches-techniques-${no}-hotel-sousse`, nom: 'fiches.pdf' }, PDF, J.infographie, 'application/pdf');
  assert.equal(r.statusCode, 201, 'l’infographiste joint les fiches de ses commandes : ' + r.body);
  assert.equal(r.json().cible_id, o.id);
  r = await appel('GET', `/api/fichiers/fiche?commande=${encodeURIComponent(o.id)}&reference=XXX`, { jeton: J.commercial });
  assert.equal(r.statusCode, 200, r.body); assert.equal(r.json().fichier.mime, 'application/pdf');
  // fiche d'un produit fini (JPEG) prioritaire sur celle de la commande
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]);
  r = await env({ nature: 'fiche_technique', cible_type: 'produit', cible_id: PF.reference, nom: 'fiche.jpg' }, JPG, J.admin, 'image/jpeg');
  assert.equal(r.statusCode, 201, r.body);
  const fj = r.json();
  r = await appel('GET', `/api/fichiers/fiche?commande=${encodeURIComponent(o.id)}&reference=${PF.reference}`, { jeton: J.commercial });
  assert.equal(r.json().fichier.id, fj.id);
  assert.equal((await appel('GET', '/api/fichiers/fiche?reference=P99926H', { jeton: J.commercial })).json().erreur, 'fiche_absente');
  // retrait = masqué, jamais effacé, tracé
  r = await appel('POST', `/api/fichiers/${fj.id}/annuler`, { jeton: J.admin, body: { motif: 'mauvaise version' } });
  assert.equal(r.statusCode, 200);
  assert.equal((await appel('GET', `/api/fichiers/${fj.id}`, { jeton: J.admin })).statusCode, 404);
  assert.ok((await pool.query(`select 1 from commercial.fichiers where id = $1 and annule`, [fj.id])).rowCount);
  assert.ok((await pool.query(`select 1 from noyau.audit where action = 'fichier_retire' and entite_id = $1`, [String(fj.id)])).rowCount);
});
