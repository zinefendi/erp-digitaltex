'use strict';
// Catalogue des droits : 10 modules → fonctions → actions applicables, + droits de visibilité.
// Matrice par défaut = CDC v1.1 § 5.2. Source unique : sert à générer la migration 002 et aux tests.

const ACTIONS = [
  ['lire', 'Lire'], ['creer', 'Créer'], ['modifier', 'Modifier'], ['valider', 'Valider'],
  ['annuler', 'Annuler'], ['supprimer', 'Supprimer un brouillon'], ['exporter', 'Exporter'],
];
const TOUT = ACTIONS.map((a) => a[0]);
const SANS = (...x) => TOUT.filter((a) => !x.includes(a));

const MODULES = [
  [1, 'infographie', 'Infographie', [
    ['studio', 'Studio 3D', SANS('valider', 'annuler')],
    ['fiches', 'Fiches techniques', SANS('annuler')],
    ['catalogue', 'Catalogue et modèles 3D', SANS('valider', 'annuler')],
    ['lookbook', 'Lookbook vêtements de travail', SANS('annuler')],
  ]],
  [2, 'commercial', 'Gestion commerciale', [
    ['clients', 'Clients', SANS('valider', 'annuler')],
    ['devis', 'Devis', TOUT],
    ['proformas', 'Factures proforma', TOUT],
    ['commandes', 'Commandes', TOUT],
    ['bl', 'Bons de livraison', TOUT],
    ['factures', 'Factures', TOUT],
    ['avoirs', 'Avoirs', TOUT],
    ['reglements', 'Avances et règlements', SANS('supprimer')],
  ]],
  [3, 'compta_clients', 'Comptabilité clients', [
    ['comptes', 'Comptes clients et échéances', ['lire', 'modifier', 'exporter']],
    ['lettrage', 'Lettrage', ['lire', 'creer', 'annuler']],
    ['relances', 'Relances', ['lire', 'creer', 'valider', 'exporter']],
    ['exports', 'Exports comptables', ['lire', 'exporter']],
  ]],
  [4, 'compta_fournisseurs', 'Comptabilité fournisseurs', [
    ['fournisseurs', 'Fournisseurs', SANS('valider', 'annuler')],
    ['achats', 'Commandes fournisseurs', TOUT],
    ['factures', 'Factures fournisseurs', TOUT],
    ['reglements', 'Règlements fournisseurs', SANS('supprimer')],
    ['retenues', 'Retenues à la source', ['lire', 'creer', 'valider', 'annuler', 'exporter']],
    ['exports', 'Exports comptables', ['lire', 'exporter']],
  ]],
  [5, 'paie', 'Paie', [
    ['salaries', 'Dossiers salariés', SANS('valider', 'annuler')],
    ['elements', 'Éléments variables', ['lire', 'creer', 'modifier', 'valider', 'supprimer']],
    ['bulletins', 'Bulletins de paie', TOUT],
    ['declarations', 'Déclarations', ['lire', 'creer', 'valider', 'exporter']],
    ['journal', 'Journal de paie et états de synthèse', ['lire', 'exporter']],
  ]],
  [6, 'production', 'Gestion de production', [
    ['of', 'Ordres de fabrication', TOUT],
    ['etapes', 'Validation des 3 parties (coupe, marquage, assemblage)', ['lire', 'valider', 'annuler']],
    ['taches', 'Tâches et affectations', ['lire', 'creer', 'modifier', 'valider', 'supprimer']],
    ['pointage', 'Pointage des temps', ['lire', 'creer', 'modifier', 'valider', 'exporter']],
  ]],
  [7, 'bom', 'Produits finis (BOM)', [
    ['nomenclatures', 'Nomenclatures (matières)', SANS('annuler')],
    ['gammes', 'Gammes (opérations)', SANS('annuler')],
  ]],
  [8, 'stock_mp', 'Stock matières premières', [
    ['articles', 'Articles matières', SANS('valider', 'annuler')],
    ['entrees', 'Entrées et réceptions', SANS('supprimer')],
    ['sorties', 'Sorties vers la production', SANS('supprimer')],
    ['inventaires', 'Inventaires', ['lire', 'creer', 'modifier', 'valider', 'exporter']],
  ]],
  [9, 'stock_pf', 'Stock produits finis', [
    ['stock', 'Stock par produit, taille et couleur', ['lire', 'modifier', 'exporter']],
    ['entrees', 'Entrées depuis la production', SANS('supprimer')],
    ['sorties', 'Sorties et livraisons', SANS('supprimer')],
    ['reservations', 'Réservations', ['lire', 'creer', 'annuler']],
    ['inventaires', 'Inventaires', ['lire', 'creer', 'modifier', 'valider', 'exporter']],
  ]],
  [10, 'parametres', 'Paramètres', [
    ['utilisateurs', 'Utilisateurs', ['lire', 'creer', 'modifier', 'exporter']],
    ['roles', 'Rôles et droits', ['lire', 'creer', 'modifier', 'supprimer']],
    ['societe', 'Société', ['lire', 'modifier']],
    ['fiscalite', 'Fiscalité (TVA, timbre, retenue)', ['lire', 'modifier']],
    ['baremes_paie', 'Barèmes de paie', ['lire', 'modifier']],
    ['numerotation', 'Numérotation', ['lire', 'modifier']],
    ['audit', 'Journal d’audit', ['lire', 'exporter']],
    ['sauvegardes', 'Sauvegardes et restauration', ['lire', 'valider']],
  ]],
];

const VISIBILITES = [
  ['prix', 'Prix et montants de vente', 'Prix, totaux, remises, avances et règlements des devis, commandes, BL et factures'],
  ['encours', 'Encours clients', 'Soldes, échéances et retards des comptes clients'],
  ['achats', 'Prix d’achat', 'Prix et montants des commandes et factures fournisseurs'],
  ['couts', 'Coûts de revient', 'Coûts de revient et valorisation des stocks'],
  ['masse_salariale', 'Masse salariale', 'Totaux de paie (sans le détail par salarié)'],
  ['salaires', 'Salaires individuels', 'Salaire et bulletin de chaque salarié'],
];

// Raccourcis de la matrice CDC : T = tout, G = gestion (toutes les actions applicables), L = lecture.
// L* = lecture sans prix : c'est l'absence de droit de visibilité qui retire les montants.
const MATRICE = {
  direction: {
    modules: { '*': 'L' },
    visibilites: ['prix', 'encours', 'achats', 'couts', 'masse_salariale'],
    // paie : synthèse seulement
    remplace: { 'paie.*': null, 'paie.journal': 'L' },
  },
  commercial: {
    modules: { infographie: 'L', commercial: 'G', production: 'L', bom: 'L', stock_mp: 'L', stock_pf: 'L' },
    remplace: { 'infographie.lookbook': 'G', 'compta_clients.comptes': 'L',
      // les factures et avoirs émis ne s'annulent que par la Comptabilité
      'commercial.factures': SANS('annuler'), 'commercial.avoirs': SANS('annuler') },
    visibilites: ['prix', 'encours'],
  },
  infographie: {
    modules: { infographie: 'G', commercial: 'L', production: 'L', bom: 'G', stock_mp: 'L', stock_pf: 'L' },
    // 0.6.0 (migration 005) : commandes et clients créés depuis le Studio, toujours sans voir les prix
    remplace: { 'commercial.commandes': ['lire', 'creer', 'modifier'], 'commercial.clients': ['lire', 'creer', 'modifier'] },
    visibilites: [],
  },
  comptabilite: {
    modules: { infographie: 'L', commercial: 'L', compta_clients: 'G', compta_fournisseurs: 'G', production: 'L', bom: 'L', stock_mp: 'L', stock_pf: 'L' },
    remplace: { 'commercial.factures': 'G', 'commercial.avoirs': 'G', 'commercial.reglements': 'G', 'paie.journal': 'L', 'parametres.fiscalite': 'L' },
    visibilites: ['prix', 'encours', 'achats', 'couts', 'masse_salariale'],
  },
  production: {
    modules: { infographie: 'L', commercial: 'L', production: 'G', bom: 'L', stock_mp: 'L', stock_pf: 'L' },
    remplace: { 'commercial.*': null, 'commercial.commandes': 'L', 'commercial.bl': 'L',
      'stock_mp.sorties': 'G', 'stock_pf.entrees': 'G' },
    visibilites: [],
  },
  magasin: {
    modules: { infographie: 'L', production: 'L', bom: 'L', stock_mp: 'G', stock_pf: 'G' },
    remplace: { 'commercial.bl': 'L', 'compta_fournisseurs.achats': 'L' },
    visibilites: [],
  },
  rh_paie: {
    modules: { paie: 'G' },
    remplace: { 'production.pointage': 'L', 'parametres.baremes_paie': 'L' },
    visibilites: ['salaires', 'masse_salariale'],
  },
};

const FONCTIONS = MODULES.flatMap(([, m, , fs]) => fs.map(([f, lib, acts], i) => ({ code: `${m}.${f}`, module: m, libelle: lib, ordre: i + 1, actions: acts })));
const PAR_CODE = Object.fromEntries(FONCTIONS.map((f) => [f.code, f]));

function droitsDe(niveau, fonction) {
  if (niveau === null || niveau === undefined) return [];
  if (Array.isArray(niveau)) return niveau.filter((a) => fonction.actions.includes(a));
  if (niveau === 'L') return ['lire'];
  if (niveau === 'G' || niveau === 'T') return fonction.actions.slice();
  throw new Error('Niveau inconnu : ' + niveau);
}

/** Matrice par défaut d'un rôle → { 'module.fonction': [actions] } */
function defautRole(role) {
  const def = MATRICE[role];
  if (!def) return {};
  const r = {};
  for (const f of FONCTIONS) {
    const n = def.modules[f.module] ?? def.modules['*'];
    const acts = droitsDe(n, f);
    if (acts.length) r[f.code] = acts;
  }
  for (const [cle, n] of Object.entries(def.remplace || {})) {
    const cibles = cle.endsWith('.*') ? FONCTIONS.filter((f) => f.module === cle.slice(0, -2)) : [PAR_CODE[cle]];
    if (!cibles[0]) throw new Error('Fonction inconnue dans la matrice : ' + cle);
    for (const f of cibles) {
      const acts = droitsDe(n, f);
      if (acts.length) r[f.code] = acts; else delete r[f.code];
    }
  }
  return r;
}

module.exports = { ACTIONS, MODULES, FONCTIONS, VISIBILITES, MATRICE, defautRole };
