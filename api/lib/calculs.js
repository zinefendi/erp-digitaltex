'use strict';
// Calculs partagés avec l'application 3.3.0 (docs-pdf.js · invoiceTotals) : mêmes arrondis, au millime.
const r3 = (v) => Math.round((+v || 0) * 1000) / 1000;
const rem = (l) => Math.min(100, Math.max(0, +l.remise || 0)) / 100;

/** Totaux d'une facture client : { ht, tva, ttc, timbre, net, lignes:[{totHT, prestation}] } */
function totauxFacture(inv) {
  const t = (+inv.tva || 0) / 100, ttcMode = inv.pricesTTC !== false;
  const lignes = (inv.lines || []).map((l) => {
    const q = +l.qty || 0, pu = +l.pu || 0;
    return { totHT: r3(q * (ttcMode ? pu / (1 + t) : pu) * (1 - rem(l))), prestation: !!(l.service || l.artType === 'prestation') };
  });
  if (ttcMode) {
    const exact = r3((inv.lines || []).reduce((s, l) => s + (+l.qty || 0) * (+l.pu || 0) * (1 - rem(l)), 0));
    const ht = r3(exact / (1 + t));
    return { lignes, ht, tva: r3(exact - ht), ttc: exact, timbre: r3(inv.timbre || 0), net: r3(exact + (+inv.timbre || 0)) };
  }
  const ht = r3(lignes.reduce((s, l) => s + l.totHT, 0)), tva = r3(ht * t), ttc = r3(ht + tva);
  return { lignes, ht, tva, ttc, timbre: r3(inv.timbre || 0), net: r3(ttc + (+inv.timbre || 0)) };
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
