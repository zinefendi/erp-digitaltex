'use strict';
// Prix des commandes enregistrées par un compte SANS le droit de visibilité « prix » (infographistes).
// Le poste n'a reçu aucun tarif : c'est le serveur qui fixe chaque prix, avec les mêmes règles que le
// Studio 3D 3.3.0 (build/src/app.js : sizePrice, marks, unitPrice). Rien de ce que le poste envoie
// comme montant n'est conservé.
const D = require('./droits');

const r3 = (v) => Math.round((+v || 0) * 1000) / 1000;
class ErreurPrix extends Error { constructor(code, message) { super(message); this.code = code; } }
const err = (code, m) => { throw new ErreurPrix(code, m); };

// Champs d'en-tête d'une commande qui portent des montants : toujours repris de la version serveur.
const CHAMPS_MONTANTS = D.CHAMPS_MASQUES.prix.filter((c) => !c.includes('[]'));
// Champs qu'un compte sans prix ne change pas (statut et liens gérés par la Gestion commerciale).
const CHAMPS_FIGES = ['status', 'number', 'blIds', 'invoiceIds', 'createdAt'];

function tarifs(catalogue) {
  const S = (catalogue && catalogue.shop) || {};
  return {
    articles: S.articles || {},
    surcharge: S.surcharge && !Array.isArray(S.surcharge) ? S.surcharge : {},
    print: S.printPrice !== undefined ? +S.printPrice : 4,
    setup: S.embSetup !== undefined ? +S.embSetup : 10,
    piece: S.embPiece !== undefined ? +S.embPiece : 0.5,
  };
}
const prixTaille = (T, A, z) => (A.sp && A.sp[z] !== undefined ? +A.sp[z] : +A.price + (+T.surcharge[String(z).toUpperCase()] || 0));

/** Marquage d'un produit : supplément par pièce et programme de broderie (une fois). */
function marquage(T, marks) {
  let parPiece = 0, programme = 0;
  for (const m of Object.values(marks || {})) {
    if (!m || typeof m !== 'object') continue;
    if (m.mode === 'embroidery') {
      const pts = Number(m.stitches);
      if (m.stitches != null && !(pts >= 0 && pts <= 2e6)) err('marquage_invalide', 'Nombre de points de broderie invalide.');
      const k = (pts || 0) / 1000; parPiece += k * T.piece; programme += k * T.setup;
    } else parPiece += T.print;
  }
  return { parPiece, programme };
}

/**
 * Fusionne la commande envoyée par un compte sans prix avec la version serveur (non masquée) :
 * - montants, avances, règlements, statut, numéro et liens : ceux du serveur ;
 * - lignes ajoutées à la main dans la Gestion : celles du serveur, inchangées ;
 * - lignes du Studio : prix déjà fixé par le serveur conservé, sinon calculé depuis le catalogue.
 */
function fusionnerCommande(recu, avant, catalogue) {
  if (avant && ['annulee', 'facturee', 'soldee'].includes(avant.status)) err('commande_figee', 'Cette commande est annulée ou facturée : elle ne se modifie plus depuis le Studio.');
  if (avant && avant.number && recu.number && recu.number !== avant.number) err('numero_fige', 'Le numéro d’une commande ne change pas.');
  const T = tarifs(catalogue);
  const rec = { ...structuredClone(recu) };
  for (const c of CHAMPS_MONTANTS) delete rec[c];
  for (const c of CHAMPS_FIGES) delete rec[c];
  const out = { ...(avant ? structuredClone(avant) : {}), ...rec };
  if (avant) { for (const c of [...CHAMPS_MONTANTS, ...CHAMPS_FIGES]) if (avant[c] !== undefined) out[c] = structuredClone(avant[c]); }
  else { out.number = recu.number; out.status = 'en_cours'; out.advances = []; }

  const produits = Array.isArray(recu.products) ? recu.products : [];
  if (produits.length > 500) err('trop_de_produits', 'Trop de produits dans la commande.');
  const parUid = new Map(produits.map((p) => [String(p && p.uid), p]));
  const lignesAvant = new Map((avant?.lines || []).map((l) => [l.id, l]));
  const lignes = [];
  const recues = Array.isArray(recu.lines) ? recu.lines : [];
  if (recues.length > 5000) err('trop_de_lignes', 'Trop de lignes dans la commande.');
  for (const l of recues) {
    if (!l || l.src !== 'studio') continue; // lignes « à la main » : seules celles du serveur comptent (ci-dessous)
    const qty = Number(l.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) err('quantite_invalide', 'Quantité invalide sur une ligne du Studio.');
    const id = String(l.id || '').slice(0, 200);
    const p = parUid.get(String(l.item));
    const prec = lignesAvant.get(id);
    // signature article + marquage : le prix déjà fixé est conservé tant que le produit ne change pas
    const sig = p ? JSON.stringify([p.article, Object.entries(p.marks || {}).sort().map(([k, m]) => [k, m && m.mode, m && m.stitches])]) : null;
    let pu;
    if (prec && prec.src === 'studio' && prec.pu !== undefined && (!p || !prec.sig || prec.sig === sig)) pu = +prec.pu;
    else {
      if (!p) err('produit_introuvable', 'Ligne du Studio sans produit correspondant.');
      const A = T.articles[p.article];
      if (!A || !(+A.price >= 0)) err('article_sans_tarif', `L’article « ${p.garment || p.article || '?'} » n’a pas de tarif dans le catalogue : un commercial doit fixer le prix.`);
      const m = marquage(T, p.marks);
      if (l.service) pu = m.programme;
      else {
        if (!Array.isArray(A.sizes) || (A.sizes.length && !A.sizes.includes(l.size) && !(A.sp && A.sp[l.size] !== undefined))) err('taille_inconnue', `Taille « ${l.size} » inconnue pour ${A.name || p.article}.`);
        pu = prixTaille(T, A, l.size) + m.parPiece;
      }
    }
    const { pu: _pu, total: _t, remise: _r, prix: _p, ...reste } = l;
    lignes.push({ ...reste, id, qty: l.service ? 1 : qty, pu: r3(pu), ...(sig ? { sig } : {}) });
  }
  for (const l of avant?.lines || []) if (l.src !== 'studio') lignes.push(structuredClone(l));
  out.lines = lignes;
  // produits : sans montant envoyé par le poste ; total recalculé à partir des lignes
  out.products = produits.map((p) => {
    const { total, pu, ...x } = p || {};
    return { ...x, total: r3(lignes.filter((l) => l.item === x.uid).reduce((s, l) => s + l.qty * l.pu, 0)) };
  });
  out.total = r3(lignes.reduce((s, l) => s + (+l.qty || 0) * (+l.pu || 0), 0));
  return out;
}

module.exports = { fusionnerCommande, marquage, tarifs, ErreurPrix, r3 };
