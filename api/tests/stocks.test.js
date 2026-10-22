'use strict';
// Tests stocks (lot 0.10.0) : réceptions et rouleaux, FIFO multi-couches, refus d'une sortie > rouleau,
// BL → sortie PF automatique, stock négatif autorisé + alerte + audit, modification et annulation de BL,
// masquage des valeurs par rôle, numérotation concurrente, inventaire (écart justifié obligatoire).
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
  const r = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ($1, $1, $2, false) returning id`, ['s.' + cle, h]);
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code = any($2)`, [r.rows[0].id, roles]);
  J[cle] = (await appel('POST', '/api/auth/connexion', { body: { identifiant: 's.' + cle, mot_de_passe: 'Atelier-Polo-2026' } })).json().jeton;
}
const AN = new Date().getFullYear();
let TISSU, FIL, PF;

test.before(async () => {
  await require('./_base').viderBase();
  await migrer(pool, { info: () => {} });
  D._viderCache();
  app = construire({ logger: false, limiteConnexion: 1000 }); await app.ready();
  for (const [k, r] of Object.entries({ admin: ['super_admin'], magasin: ['magasin'], compta: ['comptabilite'], commercial: ['commercial'], infographie: ['infographie'], atelier: ['production'] })) await compte(k, r);
  TISSU = (await appel('POST', '/api/registres/articles_mp', { jeton: J.admin, body: { code: 'T01', designation: 'Piqué 220 g', famille: 'Tissu', unite: 'm', stock_mini: 100, prix_achat: 10 } })).json().id;
  FIL = (await appel('POST', '/api/registres/articles_mp', { jeton: J.admin, body: { code: 'F01', designation: 'Fil polyester', famille: 'Fil', unite: 'cône', prix_achat: 2 } })).json().id;
  PF = (await appel('POST', '/api/produits', { jeton: J.admin, body: { code_article: 'P', sexe: 'H', bom: [{ designation: 'Piqué', qte: 0.4, pu: 12.5 }], gamme: [{ operation: 'Assemblage', temps_min: 30 }] } })).json();
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('clients', 'cl1', $1)`, [{ id: 'cl1', name: 'Hôtel Sousse', type_client: 'local', devise: 'DT' }]);
});
test.after(async () => { await app.close(); await pool.end(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('réception : numéro RMP, rouleaux obligatoires pour le tissu, prix d’achat non saisi par le magasin', async () => {
  let r = await appel('POST', '/api/stocks/mp/receptions', { jeton: J.magasin, body: { fournisseur: 'Tissage du Sahel', lignes: [{ article_id: TISSU, qte: 50 }] } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'rouleau_requis');
  // le magasin ne voit pas les prix d'achat : coût pris sur la fiche (10), même s'il envoie 999
  r = await appel('POST', '/api/stocks/mp/receptions', { jeton: J.magasin, body: { fournisseur: 'Tissage du Sahel', lignes: [{ article_id: TISSU, qte: 50, n_lot: 'L1', bain: 'B7', rouleau: 'R1', cout_unitaire: 999 }] } });
  assert.equal(r.statusCode, 201, r.body); assert.equal(r.json().numero, `RMP-${AN}-0001`);
  // le comptable saisit le coût réel : 2e rouleau plus cher (couche FIFO distincte)
  r = await appel('POST', '/api/stocks/mp/receptions', { jeton: J.compta, body: { fournisseur: 'Tissage du Sahel', lignes: [{ article_id: TISSU, qte: 80, n_lot: 'L2', bain: 'B8', rouleau: 'R2', cout_unitaire: 12 }, { article_id: FIL, qte: 20, cout_unitaire: 2.5 }] } });
  assert.equal(r.statusCode, 403, 'le comptable n’a pas le droit de créer une réception');
  r = await appel('POST', '/api/stocks/mp/receptions', { jeton: J.admin, body: { fournisseur: 'Tissage du Sahel', lignes: [{ article_id: TISSU, qte: 80, n_lot: 'L2', bain: 'B8', rouleau: 'R2', cout_unitaire: 12 }, { article_id: FIL, qte: 20, cout_unitaire: 2.5 }] } });
  assert.equal(r.statusCode, 201); assert.equal(r.json().numero, `RMP-${AN}-0002`);
  const etat = (await appel('GET', '/api/stocks/mp/etat', { jeton: J.compta })).json();
  const t = etat.find((a) => a.id === TISSU);
  assert.equal(t.physique, 130); assert.equal(t.lots, 2); assert.equal(t.valeur, 50 * 10 + 80 * 12); assert.equal(t.alerte, false);
});

test('masquage : le magasin voit les quantités, jamais les valeurs', async () => {
  const etat = (await appel('GET', '/api/stocks/mp/etat', { jeton: J.magasin })).json();
  const t = etat.find((a) => a.id === TISSU);
  assert.equal(t.physique, 130); assert.equal(t.valeur, undefined); assert.equal(t.cout_moyen, undefined);
  const lots = (await appel('GET', `/api/stocks/mp/articles/${TISSU}/lots`, { jeton: J.magasin })).json();
  assert.equal(lots.length, 2); assert.equal(lots[0].cout_unitaire, undefined);
  const recs = (await appel('GET', '/api/stocks/mp/receptions', { jeton: J.magasin })).json();
  assert.ok(recs.every((x) => x.valeur === undefined && x.lignes.every((l) => l.cout_unitaire === undefined)));
  const mv = await appel('GET', '/api/stocks/mp/mouvements', { jeton: J.magasin });
  assert.ok(!mv.body.includes('cout_unitaire') && !mv.body.includes('"valeur"'));
  assert.equal((await appel('GET', '/api/stocks/mp/etat', { jeton: J.infographie })).json()[0].valeur, undefined);
});

test('rouleaux et FIFO : sortie tissu par rouleau, refus au-delà du métrage restant ; FIFO multi-couches', async () => {
  const lots = (await appel('GET', `/api/stocks/mp/articles/${TISSU}/lots`, { jeton: J.admin })).json();
  let r = await appel('POST', '/api/stocks/mp/mouvements', { jeton: J.magasin, body: { type: 'sortie', article_id: TISSU, qte: 10 } });
  assert.equal(r.json().erreur, 'rouleau_requis');
  r = await appel('POST', '/api/stocks/mp/mouvements', { jeton: J.magasin, body: { type: 'sortie', article_id: TISSU, lot_id: lots[0].id, qte: 51 } });
  assert.equal(r.json().erreur, 'stock_insuffisant'); assert.match(r.json().message, /50/);
  r = await appel('POST', '/api/stocks/mp/mouvements', { jeton: J.magasin, body: { type: 'sortie', article_id: TISSU, lot_id: lots[0].id, qte: 20, ref_doc: 'OF-test' } });
  assert.equal(r.statusCode, 201, r.body); assert.equal(r.json().valeur, undefined, 'valeur masquée pour le magasin');
  // FIFO sur le fil : 2 couches (20 × 2,5 puis 10 × 4) ; sortie de 25 = 20 × 2,5 + 5 × 4 = 70
  await appel('POST', '/api/stocks/mp/receptions', { jeton: J.admin, body: { lignes: [{ article_id: FIL, qte: 10, cout_unitaire: 4 }] } });
  r = await appel('POST', '/api/stocks/mp/mouvements', { jeton: J.admin, body: { type: 'sortie', article_id: FIL, qte: 25 } });
  assert.equal(r.statusCode, 201); assert.equal(r.json().valeur, 70); assert.equal(r.json().detail.length, 2);
  r = await appel('POST', '/api/stocks/mp/mouvements', { jeton: J.admin, body: { type: 'sortie', article_id: FIL, qte: 6 } });
  assert.equal(r.json().erreur, 'stock_insuffisant', 'jamais de stock matières négatif');
  // ajustement sans motif refusé ; seuil d'alerte : tissu 110 m ≥ 100 → pas d'alerte, après sortie de 15 → alerte
  r = await appel('POST', '/api/stocks/mp/mouvements', { jeton: J.magasin, body: { type: 'ajustement', article_id: TISSU, lot_id: lots[1].id, qte: -15 } });
  assert.equal(r.json().erreur, 'motif_requis');
  r = await appel('POST', '/api/stocks/mp/mouvements', { jeton: J.magasin, body: { type: 'ajustement', article_id: TISSU, lot_id: lots[1].id, qte: -15, motif: 'Défaut de tissage' } });
  assert.equal(r.statusCode, 201);
  const al = (await appel('GET', '/api/stocks/mp/alertes', { jeton: J.magasin })).json();
  assert.deepEqual(al.map((a) => a.id), [TISSU]); assert.equal(al[0].disponible, 95);
  // transfert partiel : rouleau scindé, même coût
  r = await appel('POST', '/api/stocks/mp/mouvements', { jeton: J.magasin, body: { type: 'transfert', article_id: TISSU, lot_id: lots[1].id, qte: 5, emplacement: 'Atelier coupe' } });
  assert.equal(r.statusCode, 201);
  const apres = (await appel('GET', `/api/stocks/mp/articles/${TISSU}/lots`, { jeton: J.admin })).json();
  assert.equal(apres.length, 3); assert.equal(apres.find((l) => l.emplacement === 'Atelier coupe').cout_unitaire, 12);
  assert.ok((await pool.query(`select 1 from noyau.audit where action = 'mouvement_mp'`)).rowCount >= 3);
  await assert.rejects(pool.query('delete from stocks.mouvements_mp'), /Suppression interdite/);
});

test('produits finis : entrée FIFO, BL → sortie automatique, négatif autorisé avec alerte, modification et annulation', async () => {
  let r = await appel('POST', '/api/stocks/pf/mouvements', { jeton: J.magasin, body: { type: 'entree_manuelle', reference: PF.reference, taille: 'M', couleur: 'Bleu', qte: 10, motif: 'Stock initial' } });
  assert.equal(r.statusCode, 201, r.body);
  // commande avec une ligne produit fini (référence) et une prestation (pas de stock)
  const num = (await appel('POST', '/api/commercial/numero', { jeton: J.commercial, body: { kind: 'order' } })).json().numero;
  const o = (await appel('PUT', '/api/commercial/orders', { jeton: J.commercial, body: { number: num, status: 'en_cours', client: { id: 'cl1', name: 'Hôtel Sousse' },
    lines: [{ id: 'l1', src: 'produit_fini', article: PF.reference, designation: 'Polo', color: 'Bleu', size: 'M', qty: 15, pu: 30 }, { id: 'l2', designation: 'Transport', qty: 1, pu: 20, service: true }] } })).json();
  const nbl = (await appel('POST', '/api/commercial/numero', { jeton: J.commercial, body: { kind: 'bl' } })).json().numero;
  r = await appel('PUT', '/api/commercial/bls', { jeton: J.commercial, body: { number: nbl, date: new Date().toISOString().slice(0, 10), orderId: o.id, orderNumber: num, client: o.client, status: 'livre',
    lines: [{ lineId: 'l1', designation: 'Polo', color: 'Bleu', size: 'M', qty: 8 }] } });
  assert.equal(r.statusCode, 200, r.body); assert.equal(r.json().alertes_stock, undefined);
  const bl = r.json();
  let etat = (await appel('GET', '/api/stocks/pf/etat', { jeton: J.compta })).json();
  assert.equal(etat[0].qte, 2); assert.equal(etat[0].valeur, 2 * PF.pri);
  // modification : 8 → 14 pièces : stock 2 → −4, le BL passe, alerte + audit
  r = await appel('PUT', '/api/commercial/bls', { jeton: J.commercial, body: { ...bl, lines: [{ ...bl.lines[0], qty: 14 }] } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().alertes_stock.length, 1); assert.equal(r.json().alertes_stock[0].stock_apres, -4);
  assert.equal((await pool.query(`select 1 from noyau.audit where action = 'stock_pf_negatif' and entite_id = $1`, [nbl])).rowCount, 1);
  etat = (await appel('GET', '/api/stocks/pf/etat', { jeton: J.magasin })).json();
  assert.equal(etat[0].qte, -4); assert.equal(etat[0].negatif, true); assert.equal(etat[0].valeur, undefined);
  // une entrée de 10 couvre d'abord le négatif : stock 6, couche FIFO de 6 seulement
  await appel('POST', '/api/stocks/pf/mouvements', { jeton: J.magasin, body: { type: 'entree_manuelle', reference: PF.reference, taille: 'M', couleur: 'Bleu', qte: 10 } });
  etat = (await appel('GET', '/api/stocks/pf/etat', { jeton: J.compta })).json();
  assert.equal(etat[0].qte, 6); assert.equal(etat[0].valeur, 6 * PF.pri);
  // annulation du BL : les 14 pièces reviennent → 20
  r = await appel('PUT', '/api/commercial/bls', { jeton: J.commercial, body: { ...bl, lines: [{ ...bl.lines[0], qty: 14 }], status: 'annule' } });
  assert.equal(r.statusCode, 200, r.body);
  etat = (await appel('GET', '/api/stocks/pf/etat', { jeton: J.compta })).json();
  assert.equal(etat[0].qte, 20);
  const mv = (await appel('GET', `/api/stocks/pf/mouvements?produit_id=${PF.id}`, { jeton: J.magasin })).json();
  assert.deepEqual(mv.map((m) => m.type).reverse(), ['entree_manuelle', 'sortie_bl', 'sortie_bl', 'entree_manuelle', 'retour_bl']);
  assert.ok(mv.some((m) => m.alerte_negatif));
  // sortie manuelle : jamais en négatif
  r = await appel('POST', '/api/stocks/pf/mouvements', { jeton: J.magasin, body: { type: 'sortie', produit_id: PF.id, taille: 'M', couleur: 'Bleu', qte: 21 } });
  assert.equal(r.json().erreur, 'stock_insuffisant');
  // droits : le commercial lit les quantités mais ne passe pas de mouvement
  assert.equal((await appel('POST', '/api/stocks/pf/mouvements', { jeton: J.commercial, body: { type: 'entree_manuelle', produit_id: PF.id, qte: 1 } })).statusCode, 403);
  assert.equal((await appel('GET', '/api/stocks/pf/etat', { jeton: J.commercial })).json()[0].valeur, undefined);
});

test('numérotation concurrente des réceptions : ni doublon ni trou', async () => {
  const rs = await Promise.all(Array.from({ length: 8 }, () => appel('POST', '/api/stocks/mp/receptions', { jeton: J.magasin, body: { lignes: [{ article_id: FIL, qte: 1 }] } })));
  const nums = rs.map((r) => r.json().numero).sort();
  assert.equal(new Set(nums).size, 8);
  const n = nums.map((x) => +x.slice(-4));
  assert.equal(Math.max(...n) - Math.min(...n), 7);
});

test('inventaire : écart justifié obligatoire, mouvements d’écart, clos après validation', async () => {
  let r = await appel('POST', '/api/stocks/inventaires', { jeton: J.magasin, body: { stock: 'mp', type: 'tournant' } });
  assert.equal(r.json().erreur, 'filtre_requis');
  r = await appel('POST', '/api/stocks/inventaires', { jeton: J.magasin, body: { stock: 'mp', type: 'tournant', filtre: [TISSU] } });
  assert.equal(r.statusCode, 201, r.body); assert.equal(r.json().numero, `INV-${AN}-0001`);
  let inv = (await appel('GET', `/api/stocks/inventaires/${r.json().id}`, { jeton: J.magasin })).json();
  assert.equal(inv.lignes.length, 3);
  r = await appel('POST', `/api/stocks/inventaires/${inv.id}/valider`, { jeton: J.magasin, body: { version: inv.version } });
  assert.equal(r.json().erreur, 'lignes_non_comptees');
  // rouleau 1 : 30 m théoriques, 28 comptés (écart −2 non justifié) ; autres : conformes
  const L = inv.lignes.map((l, index) => ({ index, compte: l.theorique - (index === 0 ? 2 : 0) }));
  r = await appel('PUT', `/api/stocks/inventaires/${inv.id}`, { jeton: J.magasin, body: { version: inv.version, lignes: L } });
  assert.equal(r.statusCode, 200, r.body);
  r = await appel('POST', `/api/stocks/inventaires/${inv.id}/valider`, { jeton: J.magasin, body: { version: inv.version + 1 } });
  assert.equal(r.json().erreur, 'justification_requise');
  await appel('PUT', `/api/stocks/inventaires/${inv.id}`, { jeton: J.magasin, body: { version: inv.version + 1, lignes: [{ index: 0, justification: 'Chutes de coupe non déclarées' }] } });
  r = await appel('POST', `/api/stocks/inventaires/${inv.id}/valider`, { jeton: J.magasin, body: { version: inv.version + 2 } });
  assert.equal(r.statusCode, 200, r.body); assert.equal(r.json().ecarts, 1); assert.equal(r.json().valeur_ecart, undefined);
  const lots = (await appel('GET', `/api/stocks/mp/articles/${TISSU}/lots`, { jeton: J.admin })).json();
  assert.equal(lots[0].qte_restante, 28);
  inv = (await appel('GET', `/api/stocks/inventaires/${inv.id}`, { jeton: J.compta })).json();
  assert.equal(inv.statut, 'valide'); assert.equal(inv.lignes[0].valeur_ecart, -20);
  r = await appel('PUT', `/api/stocks/inventaires/${inv.id}`, { jeton: J.magasin, body: { version: inv.version, lignes: [] } });
  assert.equal(r.json().erreur, 'inventaire_clos');
  // inventaire PF périodique sans écart
  r = await appel('POST', '/api/stocks/inventaires', { jeton: J.magasin, body: { stock: 'pf' } });
  assert.equal(r.statusCode, 201);
  inv = (await appel('GET', `/api/stocks/inventaires/${r.json().id}`, { jeton: J.magasin })).json();
  await appel('PUT', `/api/stocks/inventaires/${inv.id}`, { jeton: J.magasin, body: { version: inv.version, lignes: inv.lignes.map((l, index) => ({ index, compte: l.theorique })) } });
  r = await appel('POST', `/api/stocks/inventaires/${inv.id}/valider`, { jeton: J.magasin, body: { version: inv.version + 1 } });
  assert.equal(r.json().ecarts, 0);
  // export Excel/CSV de l'état
  r = await appel('GET', '/api/stocks/mp/etat?format=csv', { jeton: J.magasin });
  assert.equal(r.statusCode, 200); assert.match(r.body, /Piqué 220 g/); assert.doesNotMatch(r.body, /Valeur/);
});
