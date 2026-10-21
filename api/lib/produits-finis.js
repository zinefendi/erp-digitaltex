'use strict';
// Produits finis — calcul du prix de revient et de vente (spec v2 § 3, lot 0.8.0).
// Matières = Σ (quantité BOM × prix unitaire CMUP) · Industrialisation = minutes de gamme × coût minute
// · Marquages = tarifs Paramètres · PRI = (matières + industrialisation + marquages) × (1 + perte)
// · Prix de vente HT = PRI × (1 + marge). Toutes les valeurs des Paramètres sont datées :
// on prend la dernière valeur en vigueur (en_vigueur_le <= aujourd'hui).
const { r3 } = require('./calculs');

async function lireCouts(db) {
  const r = await db.query(`select distinct on (code) code, valeur::float8 as valeur
    from parametres.couts where en_vigueur_le <= current_date order by code, en_vigueur_le desc`);
  return Object.fromEntries(r.rows.map((x) => [x.code, x.valeur]));
}

async function lireTarifsMarquages(db) {
  const r = await db.query(`select distinct on (code) code, libelle, unite, prix::float8 as prix
    from parametres.tarifs_marquages where en_vigueur_le <= current_date order by code, en_vigueur_le desc`);
  return Object.fromEntries(r.rows.map((x) => [x.code, x]));
}

/** Montant d'une ligne de marquage d'après le tarif en vigueur. */
function montantMarquage(m, tarifs) {
  const t = tarifs[m.type];
  if (!t) return null; // tarif non configuré : erreur, jamais un prix inventé
  const n = (m.type === 'impression_face') ? (+m.faces || 0)
    : (m.type === 'broderie_1000') ? ((+m.points || 0) / 1000)
    : 1; // par_piece
  return r3(n * t.prix);
}

/** Arrondit proprement les listes saisies (BOM, gamme, marquages) — retour {lignes, erreurs}. */
function nettoyerBom(bom) {
  const L = [], e = [];
  for (const x of Array.isArray(bom) ? bom : []) {
    const designation = String(x.designation || '').trim().slice(0, 200);
    const qte = +x.qte || 0, pu = +x.pu || 0;
    if (!designation) { e.push('Une ligne de BOM n’a pas de désignation.'); continue; }
    if (qte <= 0) { e.push(`BOM « ${designation} » : la quantité doit être supérieure à 0.`); continue; }
    if (pu < 0) { e.push(`BOM « ${designation} » : le prix unitaire ne peut pas être négatif.`); continue; }
    L.push({ matiere: String(x.matiere || '').trim().slice(0, 60), designation, qte: r3(qte), pu: r3(pu), total: r3(qte * pu) });
  }
  return { lignes: L, erreurs: e };
}
function nettoyerGamme(gamme) {
  const L = [], e = [];
  for (const x of Array.isArray(gamme) ? gamme : []) {
    const operation = String(x.operation || '').trim().slice(0, 120);
    const temps = +x.temps_min || 0;
    if (!operation) { e.push('Une opération de gamme n’a pas de nom.'); continue; }
    if (temps < 0) { e.push(`Gamme « ${operation} » : le temps ne peut pas être négatif.`); continue; }
    L.push({ operation, temps_min: r3(temps) });
  }
  return { lignes: L, erreurs: e };
}
function nettoyerMarquages(marquages, tarifs) {
  const L = [], e = [];
  for (const x of Array.isArray(marquages) ? marquages : []) {
    const type = String(x.type || '').trim();
    if (!tarifs[type]) { e.push('Marquage : choisissez un tarif existant dans Paramètres.'); continue; }
    const faces = +x.faces || 0, points = +x.points || 0;
    if (type === 'impression_face' && faces <= 0) { e.push('Impression : indiquez le nombre de faces.'); continue; }
    if (type === 'broderie_1000' && points <= 0) { e.push('Broderie : indiquez le nombre de points.'); continue; }
    const montant = montantMarquage({ type, faces, points }, tarifs);
    L.push({ type, libelle: String(x.libelle || '').trim().slice(0, 120), faces: type === 'impression_face' ? Math.round(faces) : undefined,
      points: type === 'broderie_1000' ? Math.round(points) : undefined, montant });
  }
  return { lignes: L, erreurs: e };
}

/** Calcul complet d'après les listes nettoyées. Retourne aussi prix_source recalculé. */
function calculer({ bom, gamme, marquages }, marge, couts, tarifs) {
  const matieres = r3(bom.reduce((s, l) => s + l.total, 0));
  const minutes = r3(gamme.reduce((s, l) => s + l.temps_min, 0));
  const industrialisation = r3(minutes * (couts.cout_minute ?? 0));
  const marq = r3(marquages.reduce((s, l) => s + (l.montant || 0), 0));
  const perte = couts.perte_matiere ?? 0;
  const pri = r3((matieres + industrialisation + marq) * (1 + perte / 100));
  const margeF = marge ?? couts.marge_defaut ?? 0;
  const prix = r3(pri * (1 + margeF / 100));
  return { cout_matieres: matieres, cout_industrialisation: industrialisation, cout_marquages: marq,
    minutes_gamme: minutes, pri, marge: r3(margeF), prix_ht: prix };
}

/** État dérivé : basique = sans marquage ni client (spec § 1). */
const etatDe = (marquages, clientId) => ((marquages && marquages.length) || clientId ? 'specifique' : 'basique');

module.exports = { lireCouts, lireTarifsMarquages, montantMarquage, nettoyerBom, nettoyerGamme, nettoyerMarquages, calculer, etatDe };