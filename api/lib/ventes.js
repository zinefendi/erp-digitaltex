'use strict';
// Ventes (lot 0.9.0) — calculs partagés : totaux des devis / proformas / avoirs (mêmes arrondis que les
// factures, lib/calculs.js), contrôle « vente à perte » ligne par ligne (spec produit fini § 3),
// verrous de modification (bail de 30 minutes, CDC § 6).
const C = require('./calculs');
const r3 = C.r3;
const REF_PF = /^[A-Z]+[0-9]{3}[0-9]{2}[BEFHU]$/;
const BAIL_MIN = 30;

/** Totaux d'un document de vente au format facture (lib/calculs.totauxFacture). */
function totaux(doc) {
  const t = C.totauxFacture({
    tva: doc.tva, timbre: doc.timbre, pricesTTC: doc.prix_ttc,
    lines: (doc.lignes || []).map((l) => ({ qty: l.qte, pu: l.pu, remise: l.remise, service: l.service })),
  });
  return { ...t, lignes: (doc.lignes || []).map((l, i) => ({ ...l, total_ht: t.lignes[i].totHT })) };
}

/** Prix unitaire HT en dinars d'une ligne (après remise), pour la comparer au prix de revient (PRI, en DT).
 *  Devise : prix × taux de change mémorisé ; sans taux, le contrôle est impossible → null. */
function puHtDinars(l, { ttc, tva, devise, taux }) {
  const pu = (+l.pu || 0) * (1 - Math.min(100, Math.max(0, +l.remise || 0)) / 100);
  const ht = ttc ? pu / (1 + (+tva || 0) / 100) : pu;
  if (!devise || devise === 'DT') return ht;
  return taux > 0 ? ht * taux : null;
}

/** Lignes vendues sous le prix de revient : [{ref, pri, pu_ht_dt}]. `refDe(l)` donne la référence produit fini. */
async function lignesEnPerte(db, lignes, opts, refDe = (l) => l.produit) {
  const refs = [...new Set(lignes.map((l) => String(refDe(l) || '')).filter((r) => REF_PF.test(r)))];
  if (!refs.length) return [];
  const pf = (await db.query('select reference, pri::float8 pri from pf.produits where reference = any($1) and annule = false', [refs])).rows;
  const pris = Object.fromEntries(pf.map((p) => [p.reference, p.pri]));
  const out = [];
  for (const l of lignes) {
    const ref = String(refDe(l) || ''); const pri = pris[ref];
    if (!pri) continue;
    const ht = puHtDinars(l, opts);
    if (ht !== null && ht < pri - 0.0005) out.push({ ref, pri, pu_ht_dt: r3(ht) });
  }
  return out;
}

// ------------------------------------------------------------------ verrous de modification
/** Prend ou renouvelle le verrou ; renvoie null si accordé, sinon { par, jusqu } (verrou d'un autre compte). */
async function prendreVerrou(db, entite, id, utilisateur, poste) {
  const r = (await db.query(`insert into noyau.verrous (entite, entite_id, utilisateur_id, poste, expire_le)
      values ($1, $2, $3, $4, now() + make_interval(mins => $5))
    on conflict (entite, entite_id) do update set utilisateur_id = excluded.utilisateur_id, poste = excluded.poste,
      pris_le = case when noyau.verrous.utilisateur_id = excluded.utilisateur_id then noyau.verrous.pris_le else now() end,
      expire_le = excluded.expire_le
      where noyau.verrous.utilisateur_id = excluded.utilisateur_id or noyau.verrous.expire_le < now()
    returning utilisateur_id`, [entite, String(id), utilisateur.id, poste || null, BAIL_MIN])).rows[0];
  if (r) return null;
  return verrouAutre(db, entite, id, utilisateur.id);
}
/** Verrou valide tenu par un AUTRE compte, sinon null. */
async function verrouAutre(db, entite, id, utilisateurId) {
  const v = (await db.query(`select coalesce(u.nom_complet, u.identifiant) par, v.poste, v.expire_le from noyau.verrous v
      join noyau.utilisateurs u on u.id = v.utilisateur_id
     where v.entite = $1 and v.entite_id = $2 and v.utilisateur_id <> $3 and v.expire_le > now()`, [entite, String(id), utilisateurId])).rows[0];
  return v ? { par: v.par, poste: v.poste, jusqu: v.expire_le } : null;
}
const libererVerrou = (db, entite, id, utilisateurId) =>
  db.query('delete from noyau.verrous where entite = $1 and entite_id = $2 and utilisateur_id = $3', [entite, String(id), utilisateurId]);

module.exports = { r3, REF_PF, BAIL_MIN, totaux, puHtDinars, lignesEnPerte, prendreVerrou, verrouAutre, libererVerrou };
