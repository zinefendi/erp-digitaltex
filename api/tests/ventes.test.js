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
  assert.equal(d.ttc, 250); assert.equal(d.ht, 210.084); assert.equal(d.montant_tva, 39.916); assert.equal(d.devise, 'DT');
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
  assert.equal(a1.numero, `AV-${AN}-0001`); assert.equal(a1.net, 47.6); assert.equal(a1.ht, 40); assert.equal(a1.a_rembourser, 0);
  let fac = (await appel('GET', '/api/commercial/gestion', { jeton: J.compta })).json().invoices.find((x) => x.id === f.id);
  assert.equal(fac.payments[0].mode, 'Avoir'); assert.equal(fac.payments[0].amount, 47.6);
  // plafond : il reste 8 polos créditables
  r = await appel('POST', '/api/ventes/avoirs', { jeton: J.compta, body: { facture_id: f.id, motif: 'trop', lignes: [{ index: 0, qte: 9 }] } });
  assert.equal(r.json().erreur, 'trop_credite');
  const cr = (await appel('GET', `/api/ventes/factures/${f.id}/creditable`, { jeton: J.compta })).json();
  assert.equal(cr.lignes[0].creditable, 8); assert.equal(cr.reste, r3(298.5 - 47.6));
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
  assert.equal(a2.net, r3(8 * 23.8 + 59.5)); assert.equal(a2.a_rembourser, r3(a2.net - (298.5 - 47.6 - 200)));
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
