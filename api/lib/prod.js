'use strict';
// Production (lot 0.11.0) — moteur des ordres de fabrication : besoins calculés depuis la BOM
// versionnée, réservations de matières au lancement, validations des 3 parties (coupe → marquage
// → assemblage et finition) avec sorties MP à la coupe et entrées PF à la partie 3 (CDC §4.6).
// Toutes les fonctions reçoivent le client de la transaction : OF et mouvements de stock sont
// enregistrés ensemble ou pas du tout. Aucun montant n'entre dans les données vues par l'atelier.
const ST = require('./stocks');
const PF = require('./produits-finis');
const { r3 } = require('./calculs');

const r4 = (v) => Math.round((+v || 0) * 10000) / 10000;
const EPS = 0.0005;
const leve = ST.leve;

/** BOM active d'un produit (null si le produit n'en a pas encore). */
async function bomActive(c, produit_id, bom_version_id = null) {
  const b = bom_version_id
    ? (await c.query('select id, version, statut from pf.boms where id = $1', [bom_version_id])).rows[0]
    : (await c.query(`select id, version, statut from pf.boms where produit_id = $1 and statut = 'active' order by version desc limit 1`, [produit_id])).rows[0];
  if (!b) return null;
  const lignes = (await c.query(`select l.id, l.article_id, l.designation, l.unite, l.qte_base::float8 qte_base, l.par_taille, l.pu::float8 pu, l.ordre
      from pf.bom_lignes l where l.bom_id = $1 order by l.ordre, l.id`, [b.id])).rows
    .map((l) => ({ ...l, id: Number(l.id), article_id: l.article_id ? Number(l.article_id) : null, qte_base: r3(l.qte_base), pu: r3(l.pu), par_taille: l.par_taille || {} }));
  return { id: Number(b.id), version: b.version, lignes };
}

/** Gamme active d'un produit (null si le produit n'en a pas encore). */
async function gammeActive(c, produit_id, gamme_version_id = null) {
  const g = gamme_version_id
    ? (await c.query('select id, version from pf.gammes where id = $1', [gamme_version_id])).rows[0]
    : (await c.query(`select id, version from pf.gammes where produit_id = $1 and statut = 'active' order by version desc limit 1`, [produit_id])).rows[0];
  if (!g) return null;
  const operations = (await c.query(`select operation, temps_min::float8 temps_min, poste from pf.gamme_operations where gamme_id = $1 order by ordre, id`, [g.id])).rows
    .map((o) => ({ ...o, temps_min: r3(o.temps_min) }));
  return { id: Number(g.id), version: g.version, operations };
}

/** Besoins matières d'un OF : BOM (qte de base, ou métrage par taille du tissu) × quantités,
 *  perte matière générale appliquée (paramètre daté). Lignes sans article rattaché = informatives. */
async function construireBesoins(c, { produit_id, tailles_couleurs, bom_version_id = null }) {
  const bom = await bomActive(c, produit_id, bom_version_id);
  if (!bom || !bom.lignes.length) return { bom_version_id: bom ? bom.id : null, lignes: [] };
  const couts = await PF.lireCouts(c);
  const perte = Number(couts.perte_matiere || 0);
  const parTaille = new Map(); // taille -> qte totale commandée
  for (const t of tailles_couleurs || []) parTaille.set(String(t.taille || '').trim(), r3((parTaille.get(String(t.taille || '').trim()) || 0) + (+t.qte || 0)));
  const parArticle = new Map(), informatives = [];
  for (const l of bom.lignes) {
    let qte = 0;
    const par_piece = {};
    for (const [taille, qteTaille] of parTaille) {
      if (!(qteTaille > EPS)) continue;
      const p = l.par_taille && l.par_taille[taille] !== undefined && l.par_taille[taille] !== null ? +l.par_taille[taille] : l.qte_base;
      par_piece[taille] = r4(p * (1 + perte / 100));
      qte = r3(qte + p * qteTaille);
    }
    if (qte <= EPS && !l.article_id && !l.designation) continue;
    const qtePerte = r3(qte * (1 + perte / 100));
    if (!l.article_id) { informatives.push({ article_id: null, designation: l.designation, unite: l.unite || '', qte_totale: qtePerte }); continue; }
    const acc = parArticle.get(l.article_id) || { article_id: l.article_id, designation: l.designation || '', unite: l.unite || '', qte_totale: 0, par_piece: {} };
    acc.qte_totale = r3(acc.qte_totale + qtePerte);
    for (const [t, v] of Object.entries(par_piece)) acc.par_piece[t] = r3((acc.par_piece[t] || 0) + v);
    parArticle.set(l.article_id, acc);
  }
  const lignes = [];
  for (const a of parArticle.values()) {
    const f = await c.query(`select donnees->>'designation' d, donnees->>'unite' u, donnees->>'famille' fam from registres.fiches where id = $1`, [a.article_id]).then((r) => r.rows[0]);
    lignes.push({ ...a, designation: a.designation || f?.d || '', unite: a.unite || f?.u || '', famille: f?.fam || '' });
  }
  lignes.push(...informatives);
  return { bom_version_id: bom.id, lignes };
}

/** Compare les besoins au stock : physique, réservé (autres OF), disponible, à commander. Sans valeurs. */
async function besoinsVsStock(c, lignes, numeroExclu = null) {
  const out = [];
  for (const l of lignes) {
    if (!l.article_id) { out.push({ ...l, physique: null, reserve: null, disponible: null, a_commander: null }); continue; }
    const r = (await c.query(`select
        coalesce((select sum(qte_restante) from stocks.lots_mp where article_id = $1), 0)::float8 physique,
        coalesce((select sum(qte) from stocks.reservations_mp where article_id = $1 and actif and ($2::text is null or ref_doc <> $2)), 0)::float8 reserve`,
      [l.article_id, numeroExclu])).rows[0];
    const dispo = r3(r.physique - r.reserve);
    out.push({ ...l, physique: r3(r.physique), reserve: r3(r.reserve), disponible: dispo, a_commander: Math.max(0, r3(l.qte_totale - dispo)) });
  }
  return out;
}

/** Réservation des matières au lancement de l'OF (décision utilisateur du 23/10/2026). */
async function reserverPourOF(c, u, numero, lignes) {
  const faites = [];
  for (const l of lignes) {
    if (!l.article_id || !(l.qte_totale > EPS)) continue;
    await c.query(`insert into stocks.reservations_mp (article_id, qte, ref_doc, actif, cree_par) values ($1, $2, $3, true, $4)`, [l.article_id, l.qte_totale, numero, u?.id || null]);
    faites.push({ article_id: l.article_id, qte: l.qte_totale });
  }
  return faites;
}

/** Annule les réservations d'un OF (référence = n° OF). */
async function annulerReservations(c, numero) {
  await c.query(`update stocks.reservations_mp set actif = false where ref_doc = $1 and actif`, [numero]);
}

/** Consomme les réservations après les sorties réelles de la coupe (qte décrémentée, ligne soldée à 0). */
async function consommerReservations(c, numero, parArticle) {
  for (const [article_id, qteSortie] of Object.entries(parArticle)) {
    let reste = +qteSortie;
    const rows = (await c.query(`select id, qte from stocks.reservations_mp where ref_doc = $1 and article_id = $2 and actif order by id for update`, [numero, article_id])).rows;
    for (const r of rows) {
      if (reste <= EPS) break;
      const dec = Math.min(r3(reste), r3(r.qte));
      if (dec <= EPS) continue;
      const apres = r3(r.qte - dec);
      await c.query(`update stocks.reservations_mp set qte = $2, actif = ($2 > 0.0005) where id = $1`, [r.id, apres]);
      reste = r3(reste - dec);
    }
  }
}

/** Remet en réservation ce qui avait été consommé (annulation d'une validation de coupe). */
async function reconstituerReservations(c, u, numero, parArticle) {
  for (const [article_id, qte] of Object.entries(parArticle)) {
    if (!(+qte > EPS)) continue;
    const ex = (await c.query(`select id from stocks.reservations_mp where ref_doc = $1 and article_id = $2 and actif limit 1`, [numero, article_id])).rows[0];
    if (ex) await c.query(`update stocks.reservations_mp set qte = qte + $2 where id = $1`, [ex.id, r3(qte)]);
    else await c.query(`insert into stocks.reservations_mp (article_id, qte, ref_doc, actif, cree_par) values ($1, $2, $3, true, $4)`, [article_id, r3(qte), numero, u?.id || null]);
  }
}

/** Fiche technique figée pour l'OF — SANS AUCUN MONTANT (CDC §4.6.1 : affichée sans prix). */
function ficheSansPrix(produit, articleLibelle) {
  return {
    reference: produit.reference, code_article: produit.code_article, article: articleLibelle || '',
    illustration: produit.illustration || '', taillant: produit.taillant || [], note: produit.note || '',
    marquages: (produit.marquages || []).map(({ montant, ...m }) => m),
    bom: (produit.bom || []).map(({ pu, total, ...b }) => b),
    gamme: produit.gamme || [], client_nom: produit.client_nom || '',
  };
}

module.exports = { r4, EPS, leve, bomActive, gammeActive, construireBesoins, besoinsVsStock, reserverPourOF, annulerReservations, consommerReservations, reconstituerReservations, ficheSansPrix };
