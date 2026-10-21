'use strict';
// Moteur de droits : droits effectifs d'un utilisateur = union des droits de ses rôles.
// Le Super administrateur a tout, par construction. Règle transverse (CDC § 5.2) :
// un montant non autorisé n'est jamais envoyé au poste → masquer() avant chaque réponse.
const { pool } = require('./db');

let CATALOGUE = null;
async function catalogue(db = pool) {
  if (CATALOGUE) return CATALOGUE;
  const [m, f, fa, a, v] = await Promise.all([
    db.query('select code, numero, libelle from noyau.modules order by numero'),
    db.query('select code, module, libelle, ordre from noyau.fonctions order by module, ordre'),
    db.query('select fonction, action from noyau.fonction_actions'),
    db.query('select code, libelle from noyau.actions order by ordre'),
    db.query('select code, libelle, description from noyau.visibilites order by ordre'),
  ]);
  const acts = {};
  for (const r of fa.rows) (acts[r.fonction] ||= []).push(r.action);
  const ordreA = a.rows.map((x) => x.code);
  for (const k of Object.keys(acts)) acts[k].sort((x, y) => ordreA.indexOf(x) - ordreA.indexOf(y));
  CATALOGUE = {
    actions: a.rows,
    visibilites: v.rows,
    modules: m.rows.map((mo) => ({ ...mo, fonctions: f.rows.filter((x) => x.module === mo.code).map((x) => ({ code: x.code, libelle: x.libelle, actions: acts[x.code] || [] })) })),
    actionsDe: acts,
  };
  return CATALOGUE;
}

/** Droits effectifs : { super_admin, droits: {fonction: [actions]}, visibilites: [codes] } */
async function droitsEffectifs(utilisateurId, roles, db = pool) {
  const cat = await catalogue(db);
  if (roles.includes('super_admin')) {
    return { super_admin: true, droits: { ...cat.actionsDe }, visibilites: cat.visibilites.map((x) => x.code) };
  }
  const [d, v] = await Promise.all([
    db.query(`select distinct rd.fonction, rd.action from noyau.role_droits rd
      join noyau.utilisateur_roles ur on ur.role_id = rd.role_id where ur.utilisateur_id = $1`, [utilisateurId]),
    db.query(`select distinct rv.visibilite from noyau.role_visibilites rv
      join noyau.utilisateur_roles ur on ur.role_id = rv.role_id where ur.utilisateur_id = $1`, [utilisateurId]),
  ]);
  const droits = {};
  for (const r of d.rows) (droits[r.fonction] ||= []).push(r.action);
  return { super_admin: false, droits, visibilites: v.rows.map((x) => x.visibilite) };
}

const peut = (eff, fonction, action) => eff.super_admin || (eff.droits[fonction] || []).includes(action);
const voit = (eff, visibilite) => eff.super_admin || eff.visibilites.includes(visibilite);

// ---------------------------------------------------------------- masquage des montants
// Champs retirés selon le droit de visibilité manquant. Les chemins suivent la structure
// des documents (commandes, BL, factures, devis…) ; `x[]` = chaque élément du tableau x.
const CHAMPS_MASQUES = {
  prix: ['total', 'totalHT', 'totalTTC', 'tva', 'timbre', 'remise', 'pricesTTC', 'advance', 'advances', 'payments', 'paymentMode', 'due',
    'pu', 'prix', 'price', 'montant', 'amount', 'solde', 'reste',
    'lines[].pu', 'lines[].remise', 'lines[].total', 'lines[].prix', 'products[].total', 'products[].pu', 'sp'],
  encours: ['encours', 'solde_client', 'echeances', 'retard'],
  achats: ['prix_achat', 'cout_achat', 'montant_achat'],
  couts: ['cout_revient', 'valorisation', 'cmup'],
  masse_salariale: ['masse_salariale'],
  salaires: ['salaire', 'salaire_base', 'brut', 'net', 'bulletins'],
};

function retirer(obj, chemin) {
  if (!obj || typeof obj !== 'object') return;
  const i = chemin.indexOf('[].');
  if (i < 0) { delete obj[chemin]; return; }
  const tab = obj[chemin.slice(0, i)];
  if (Array.isArray(tab)) for (const el of tab) retirer(el, chemin.slice(i + 3));
}

/** Copie profonde de `doc` sans les champs que l'utilisateur n'a pas le droit de voir. */
function masquer(eff, doc) {
  if (eff.super_admin || doc == null) return doc;
  const copie = structuredClone(doc);
  const liste = Array.isArray(copie) ? copie : [copie];
  for (const [vis, champs] of Object.entries(CHAMPS_MASQUES)) {
    if (voit(eff, vis)) continue;
    for (const d of liste) for (const c of champs) retirer(d, c);
  }
  return copie;
}

module.exports = { catalogue, droitsEffectifs, peut, voit, masquer, CHAMPS_MASQUES, _viderCache: () => { CATALOGUE = null; } };
