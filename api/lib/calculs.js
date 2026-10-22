'use strict';
// Calculs partagés avec l'application 3.3.0 (docs-pdf.js · invoiceTotals) : mêmes arrondis, au millime.
const r3 = (v) => Math.round((+v || 0) * 1000) / 1000;
const rem = (l) => Math.min(100, Math.max(0, +l.remise || 0)) / 100;
const presta = (l) => !!(l.service || l.artType === 'prestation');

/** Totaux d'une facture client : { ht, remise, fodec, tva, ttc, timbre, net, lignes:[{totHT, puHT, prestation}] }
 *  0.9.1 : FODEC (taux figé sur la facture, `inv.fodec` en %) sur le HT des produits (hors prestations),
 *  ajouté avant la TVA : TVA = (HT + FODEC) × taux. Sans FODEC, calcul identique aux versions précédentes. */
function totauxFacture(inv) {
  const t = (+inv.tva || 0) / 100, f = (+inv.fodec || 0) / 100, ttcMode = inv.pricesTTC !== false;
  const L = inv.lines || [];
  const lignes = L.map((l) => {
    const q = +l.qty || 0, k = ttcMode ? (1 + t) * (presta(l) ? 1 : 1 + f) : 1, puHT = (+l.pu || 0) / k;
    return { totHT: r3(q * puHT * (1 - rem(l))), brutHT: r3(q * puHT), puHT: r3(puHT), prestation: presta(l) };
  });
  const remise = r3(lignes.reduce((s, l) => s + l.brutHT - l.totHT, 0));
  let ht, fodec = 0, tva, ttc;
  if (ttcMode) {
    const ex = (arr) => arr.reduce((s, l) => s + (+l.qty || 0) * (+l.pu || 0) * (1 - rem(l)), 0);
    ttc = r3(ex(L));
    if (!f) ht = r3(ttc / (1 + t));
    else {
      const htP = r3(ex(L.filter((l) => !presta(l))) / ((1 + t) * (1 + f)));
      ht = r3(htP + ex(L.filter(presta)) / (1 + t)); fodec = r3(htP * f);
    }
    tva = r3(ttc - ht - fodec);
  } else {
    ht = r3(lignes.reduce((s, l) => s + l.totHT, 0));
    fodec = r3(lignes.filter((l) => !l.prestation).reduce((s, l) => s + l.totHT, 0) * f);
    tva = r3((ht + fodec) * t); ttc = r3(ht + fodec + tva);
  }
  const timbre = r3(inv.timbre || 0);
  return { lignes, ht, remise, fodec, tva, ttc, timbre, net: r3(ttc + timbre) };
}
const regleFacture = (inv) => r3((+inv.advance || 0) + (inv.payments || []).reduce((s, p) => s + (+p.amount || 0), 0));
const resteFacture = (inv) => r3(Math.max(0, totauxFacture(inv).net - regleFacture(inv)));

/** Facture fournisseur : lignes [{designation, qte, pu_ht, tva}] → totaux recalculés par le serveur */
function totauxFF(lignes, timbre) {
  let ht = 0, tva = 0;
  const L = lignes.map((l) => {
    const h = r3((+l.qte || 0) * (+l.pu_ht || 0)), v = r3(h * (+l.tva || 0) / 100);
    ht = r3(ht + h); tva = r3(tva + v);
    return { ...l, qte: +l.qte || 0, pu_ht: r3(l.pu_ht), tva: +l.tva || 0, total_ht: h, total_tva: v };
  });
  return { lignes: L, ht, tva, timbre: r3(timbre), net: r3(ht + tva + r3(timbre)) };
}

/** Coût moyen unitaire pondéré (CMUP) après chaque entrée : mouvements [{qte, pu}] (qte < 0 = sortie au CMUP courant) */
function cmup(mouvements) {
  let q = 0, v = 0;
  for (const m of mouvements) {
    const qt = +m.qte || 0;
    if (qt >= 0) { q += qt; v = r3(v + qt * (+m.pu || 0)); }
    else { const c = q ? v / q : 0; q += qt; v = r3(v + qt * c); }
  }
  return { quantite: r3(q), valeur: r3(v), cmup: q ? r3(v / q) : 0 };
}
module.exports = { r3, totauxFacture, regleFacture, resteFacture, totauxFF, cmup };
