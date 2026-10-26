'use strict';
/* Coquille de l'ERP DIGITAL-TEX : même ergonomie que le Studio 3D (barre 56 px, rail d'icônes, panneau, zone de travail),
   aux couleurs de vethypro.com. Routes « #module/fonction ». Le Studio 3D, la Gestion et le Catalogue de l'application 3.3.0
   tournent dans des cadres persistants (jamais détruits en changeant d'écran : une composition en cours n'est pas perdue). */

/* ================================================================ icônes */
const SVG = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICO = {
  accueil: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  infographie: '<path d="M8 3L3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>',
  commercial: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>',
  compta_clients: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M17 4a4 4 0 0 1 0 8M22 21c0-3-2-6-5-6.5"/>',
  compta_fournisseurs: '<path d="M1 6h13v10H1zM14 10h4l4 4v2h-8"/><circle cx="5" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  paie: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 15h2M6 6V4h12v2"/>',
  production: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  bom: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 12l10 5 10-5M2 17l10 5 10-5"/>',
  stock_mp: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  stock_pf: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 7l3-4h12l3 4M9 14l2 2 4-4"/>',
  compta_generale: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11M14 13h3M14 16h3"/>',
  parametres: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  cube: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  doc: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  truck: '<path d="M1 6h13v10H1zM14 10h4l4 4v2h-8"/><circle cx="5" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  euro: '<circle cx="12" cy="12" r="9"/><path d="M15 9a3.5 3.5 0 1 0 0 6M7.5 11h6M7.5 13h6"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  down: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/>',
  in: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  out: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 21h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0zM19 7l-3 7a4 4 0 0 0 6 0z"/>',
};

/* ================================================================ modules et fonctions (affichage) */
// t : 'cadre' (écran de l'application 3.3.0), 'natif' (écran ERP), 'futur' (lot à venir, texte du cahier des charges)
const MODS = {
  infographie: { court: 'Infographie', desc: 'Studio 3D, fiches techniques et catalogue, partagés par tous les postes.', f: {
    studio: { t: 'cadre', page: 'studio', ico: 'cube', d: 'Composer les tenues en 3D, couleurs, logos, marquage' },
    fiches: { t: 'cadre', page: 'studio', ico: 'doc', d: 'Fiche technique DIGITAL-TEX générée depuis le Studio 3D' },
    catalogue: { t: 'cadre', page: 'catalogue', ico: 'grid', d: 'Produits, modèles 3D, couleurs, staff, tarifs' },
    lookbook: { t: 'futur', lot: 10, ico: 'image', d: 'Mannequins réalistes portant les tenues, par service',
      cdc: ['Choisir le client et créer les services (Accueil, Cuisine, Maintenance…), le nombre de personnes et le genre des mannequins.',
        'Pour chaque service : produits de l’ERP, tissu, couleur Pantone TPX / TCX, col, poignets, logos et marquage repris du Studio 3D.',
        'Génération d’une photo réaliste par service (service d’images IA appelé par le serveur), validation ou régénération.',
        'Export du lookbook en PDF à l’en-tête DIGITAL-TEX : couverture, une page par service, légende par produit.',
        'Compteur d’images par mois avec plafond paramétrable ; historique conservé pour régénérer.'] },
  } },
  commercial: { court: 'Commercial', desc: 'Clients, commandes, bons de livraison et factures, en réseau.', f: {
    tableau: { t: 'cadre', page: 'gestion', onglet: 'dash', ico: 'chart', libelle: 'Tableau de bord', d: 'Chiffres clés de la gestion', prix: true, droit: 'commercial.commandes' },
    clients: { t: 'cadre', page: 'gestion', onglet: 'clients', ico: 'user', d: 'Fiches clients et historique', sansPrix: 'clients' },
    devis: { t: 'natif', ecran: 'devis', ico: 'doc', d: 'Devis (DEV) → proforma ou commande en un clic' },
    proformas: { t: 'natif', ecran: 'proformas', ico: 'doc', d: 'Factures proforma (PRO), export FR / EN, Incoterms' },
    commandes: { t: 'cadre', page: 'gestion', onglet: 'orders', ico: 'list', d: 'Commandes, avances, fiches, suivi', sansPrix: 'commandes' },
    bl: { t: 'cadre', page: 'gestion', onglet: 'bls', ico: 'truck', d: 'Livraisons totales ou partielles', sansPrix: 'bl' },
    factures: { t: 'cadre', page: 'gestion', onglet: 'invoices', ico: 'euro', d: 'Factures, TVA, timbre, règlements', sansPrix: 'interdit' },
    avoirs: { t: 'natif', ecran: 'avoirs', ico: 'doc', d: 'Avoirs (AV) partiels ou totaux sur facture' },
    export: { t: 'natif', ecran: 'colisage', fonction: 'factures', prix: true, ico: 'truck', libelle: 'Documents export', d: 'Colisage (packing list) des factures export' },
    reglements: { t: 'cadre', page: 'gestion', onglet: 'invoices', ico: 'check', d: 'Avances (commande) et règlements (facture)', sansPrix: 'interdit' },
    moyens_paiement: { t: 'natif', ecran: 'moyensPaiement', fonction: 'reglements', prix: true, ico: 'search', libelle: 'Moyens de paiement', d: 'Chèques, effets, virements par client : recherche et scans' },
    produits_finis: { t: 'cadre', page: 'produits', ico: 'box', libelle: 'Produits finis', d: 'Références, BOM, gamme, prix de revient et prix' },
    articles: { t: 'natif', ecran: 'articlesVente', ico: 'box', libelle: 'Articles et prestations', d: 'Vendus hors Studio : transport, réassort, services' },
  } },
  compta_clients: { court: 'Clients', desc: 'Encours, encaissements et lettrage, chèques et effets, relances, exports CSV ou Excel.', f: {
    comptes: { t: 'natif', ecran: 'encours', ico: 'euro', d: 'Solde par client, échéances, retards' },
    lettrage: { t: 'natif', ecran: 'encaissements', ico: 'link', libelle: 'Encaissements et lettrage', d: 'Un paiement → une ou plusieurs factures' },
    relances: { t: 'natif', ecran: 'relances', ico: 'bell', d: 'Rappel, relance, mise en demeure' },
    exports: { t: 'natif', ecran: 'journalVentes', ico: 'down', d: 'Journal des ventes, balance âgée' },
  } },
  compta_fournisseurs: { court: 'Fournis.', desc: 'Fournisseurs, factures, règlements avec retenue à la source, balance âgée, exports.', f: {
    fournisseurs: { t: 'natif', ecran: 'registre', reg: 'fournisseurs', ico: 'building', d: 'Fiches fournisseurs' },
    achats: { t: 'futur', lot: 6, ico: 'list', d: 'Demande d’achat → commande → réception', cdc: ['Demande d’achat → bon de commande fournisseur → réception (entrée en stock matières) → facture, avec rapprochement commande / réception / facture.', 'Arrive avec les mouvements de stock (lot 6) : la réception alimente le stock matières, valorisé au CMUP.'] },
    factures: { t: 'natif', ecran: 'facturesF', ico: 'euro', d: 'Saisie, validation, échéances' },
    reglements: { t: 'natif', ecran: 'reglementsF', ico: 'check', d: 'Paiements, retenue à la source, certificat' },
    retenues: { t: 'natif', ecran: 'retenues', ico: 'percent', d: 'Certificats émis (voir Compta générale)' },
    exports: { t: 'natif', ecran: 'exportsF', ico: 'down', d: 'Journal des achats, balance âgée' },
  } },
  paie: { court: 'Paie', desc: 'Paie tunisienne au lot 9 : barème libre, convention collective de la bonneterie et de la confection affichée à titre indicatif.', f: {
    salaries: { t: 'futur', lot: 9, ico: 'user', d: 'Dossiers salariés', cdc: ['Identité, CIN, n° CNSS, contrat (CDI, CDD, SIVP…), catégorie et échelon, convention collective, situation familiale, RIB.'] },
    elements: { t: 'futur', lot: 9, ico: 'list', d: 'Primes, heures, absences', cdc: ['Éléments paramétrables et datés : salaire de base, primes, heures supplémentaires, absences, congés, avances et prêts.'] },
    bulletins: { t: 'futur', lot: 9, ico: 'doc', d: 'Bulletins de paie PDF', cdc: ['Cotisations CNSS, IRPP selon le barème en vigueur : tables paramétrables par date, à valider par le comptable.'] },
    declarations: { t: 'futur', lot: 9, ico: 'shield', d: 'CNSS et déclarations fiscales', cdc: ['États préparatoires (formats exacts à obtenir auprès du comptable et des organismes).'] },
    journal: { t: 'futur', lot: 9, ico: 'chart', d: 'Journal et livre de paie', cdc: ['Journal de paie, livre de paie, état des virements bancaires.'] },
  } },
  production: { court: 'Production', desc: 'OF en 3 parties (0.11.0), affectation et pointage version simple (0.12.0), BOM et gammes versionnées.', f: {
    of: { t: 'natif', ecran: 'planCharge', ico: 'list', libelle: 'Plan de charge', d: 'Commandes à produire, délais, retards' },
    etapes: { t: 'natif', ecran: 'of', ico: 'check', libelle: 'Ordres de fabrication', d: '3 parties : coupe, marquage, assemblage' },
    taches: { t: 'natif', ecran: 'taches', ico: 'user', libelle: 'Affectation', d: 'Ouvriers affectés aux parties des OF ; ouvriers de l’atelier' },
    pointage: { t: 'natif', ecran: 'pointage', ico: 'clock', libelle: 'Pointage', d: 'Début / fin des tâches par ouvrier, temps prévu vs réel' },
  } },
  bom: { court: 'BOM', desc: 'Nomenclatures et gammes versionnées par produit (0.11.0) ; calcul des besoins.', f: {
    nomenclatures: { t: 'natif', ecran: 'bomVersions', ico: 'grid', libelle: 'Nomenclatures (BOM)', d: 'Matières par produit, versions datées' },
    gammes: { t: 'natif', ecran: 'gammeVersions', ico: 'clock', libelle: 'Gammes', d: 'Opérations, temps standard, versions' },
  } },
  stock_mp: { court: 'Stock MP', desc: 'Matières : réceptions par lot et rouleau, sorties, inventaires, valorisation FIFO (0.10.0).', f: {
    articles: { t: 'natif', ecran: 'etatMP', ico: 'box', libelle: 'État du stock', d: 'Physique, réservé, disponible, alertes' },
    fiches: { t: 'natif', ecran: 'registre', reg: 'articles_mp', fonction: 'articles', ico: 'list', libelle: 'Articles matières', d: 'Tissus, fils, accessoires, emballages' },
    entrees: { t: 'natif', ecran: 'receptionsMP', ico: 'in', libelle: 'Réceptions', d: 'Entrées fournisseurs, lots et rouleaux' },
    sorties: { t: 'natif', ecran: 'mouvementsMP', ico: 'out', libelle: 'Mouvements', d: 'Sorties, retours, transferts, ajustements' },
    inventaires: { t: 'natif', ecran: 'inventaires', stock: 'mp', ico: 'scale', d: 'Comptage, écarts justifiés' },
  } },
  stock_pf: { court: 'Stock PF', desc: 'Produits finis par référence, taille et couleur ; sortie automatique à la livraison (BL).', f: {
    stock: { t: 'natif', ecran: 'etatPF', ico: 'box', libelle: 'État du stock', d: 'Par produit, taille, couleur' },
    entrees: { t: 'natif', ecran: 'mouvementsPF', ico: 'in', libelle: 'Mouvements', d: 'Entrées, sorties, retours, BL' },
    sorties: { t: 'natif', ecran: 'mouvementsPF', ico: 'out', libelle: 'Entrées / sorties', d: 'Automatiques : OF (0.11.0) et BL' },
    reservations: { t: 'natif', ecran: 'etatMP', ico: 'lock', libelle: 'Réservations MP', d: 'Engagé aux OF ; dispo = physique − réservé' },
    inventaires: { t: 'natif', ecran: 'inventaires', stock: 'pf', ico: 'scale', d: 'Comptage, écarts justifiés' },
  } },
  parametres: { court: 'Paramètres', desc: 'Comptes, rôles, société, fiscalité, numérotation, journal et sauvegardes.', f: {
    utilisateurs: { t: 'natif', ecran: 'comptes', ico: 'user', d: 'Un compte par personne' },
    roles: { t: 'natif', ecran: 'roles', ico: 'shield', d: 'Droits par module et par action' },
    societe: { t: 'natif', ecran: 'onglet', onglet: 'societe', ico: 'building', d: 'Coordonnées, MF, RC, RIB, logo' },
    fiscalite: { t: 'natif', ecran: 'onglet', onglet: 'fiscalite', ico: 'percent', d: 'TVA, timbre, datés' },
    baremes_paie: { t: 'futur', lot: 9, ico: 'scale', d: 'Barèmes CNSS et IRPP datés', cdc: ['Réponse du comptable (21/10/2026) : barème de paie libre, saisi par la société ; la grille de la convention collective sectorielle de la bonneterie et de la confection est affichée à titre indicatif seulement.', 'Tous les taux et barèmes sont des tables datées : une nouvelle valeur ne modifie jamais un bulletin déjà validé.'] },
    numerotation: { t: 'natif', ecran: 'onglet', onglet: 'numerotation', ico: 'hash', d: 'Préfixes et compteurs' },
    factures_param: { t: 'natif', ecran: 'onglet', onglet: 'factures', fonction: 'societe', ico: 'doc', libelle: 'Factures', d: 'Facturation multi-BL (activer / désactiver)' },
    audit: { t: 'natif', ecran: 'journal', ico: 'list', d: 'Qui a fait quoi, et quand' },
    sauvegardes: { t: 'natif', ecran: 'sauvegardes', ico: 'save', d: 'Copies de chaque nuit' },
  } },
  compta_generale: { court: 'Compta G.', desc: 'Retenues à la source (subies et opérées), journaux et balance, plan comptable, valorisation des stocks.', f: {
    retenues: { t: 'natif', ecran: 'retenues', ico: 'percent', libelle: 'Retenues à la source', d: 'Subies (clients) et opérées (fournisseurs)' },
    journaux: { t: 'natif', ecran: 'journaux', ico: 'list', libelle: 'Journaux et balance', d: 'Ventes, achats, banque, caisse' },
    plan: { t: 'natif', ecran: 'plan', ico: 'hash', d: 'Comptes utilisés pour les écritures' },
    valorisation: { t: 'natif', ecran: 'valorisation', ico: 'scale', d: 'Valeur des stocks (FIFO) et coûts d’achat' },
  } },
};
const ORDRE = ['infographie', 'commercial', 'compta_clients', 'compta_fournisseurs', 'compta_generale', 'paie', 'production', 'bom', 'stock_mp', 'stock_pf', 'parametres'];
const PAGES_CADRE = {
  studio: { src: '/studio/index.html', titre: 'Studio 3D' },
  gestion: { src: '/studio/gestion.html', titre: 'Gestion' },
  catalogue: { src: '/studio/parametres.html', titre: 'Catalogue' },
  produits: { src: '/studio/produits-finis.html', titre: 'Produits finis' },
};
const ONGLET_FONCTION = { dash: 'tableau', orders: 'commandes', bls: 'bl', invoices: 'factures', clients: 'clients' };

/* ================================================================ outils */
let ACC = null, GEST = null, CAT_ERP = null, ROUTE = { mod: 'accueil', fn: null }, PANNEAU_FORCE = {};
const voit = (v) => !!DROITS && (DROITS.super_admin || (DROITS.visibilites || []).includes(v));
const r3 = (v) => Math.round((+v || 0) * 1000) / 1000;
const dt = (v) => (+v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const jour = (v) => v ? new Date(String(v).length === 10 ? v + 'T12:00:00' : v).toLocaleDateString('fr-FR') : '—';
const aujourdhui = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const ecartJours = (v) => v ? Math.round((new Date(v + 'T12:00:00') - aujourdhui()) / 86400000) : null;
const taille = (o) => o < 1024 ? o + ' o' : o < 1048576 ? (o / 1024).toFixed(0) + ' Ko' : (o / 1048576).toFixed(1).replace('.', ',') + ' Mo';
const lien = (mod, fn) => `#${mod}${fn ? '/' + fn : ''}`;
const libFonction = (mod, code) => MODS[mod].f[code]?.libelle || ACC?.modules.find((m) => m.code === mod)?.fonctions.find((f) => f.code === mod + '.' + code)?.libelle || code;

function csv(nom, lignes) {
  const cel = (v) => { const s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const txt = '\ufeff' + lignes.map((l) => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = nom; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}
const nombreCsv = (v) => String(r3(v)).replace('.', ',');

// 0.10.1 : grandes fenêtres de saisie en plein écran, barre ─ (réduire) ☐ (fenêtre / plein écran) ✕ (fermer)
let FEN_MINI = false;
// passe la fenêtre de modale à non modale (ou l'inverse) sans déclencher ses écouteurs « close » (verrous, nettoyage)
// (l'événement « close » est envoyé plus tard, de façon asynchrone : on compte les fermetures techniques à ignorer)
function basculerSansFermer(d, modale) {
  if (!d.__garde) { d.__garde = true; d.__saut = 0; d.addEventListener('close', (e) => { if (d.__saut > 0) { d.__saut--; e.stopImmediatePropagation(); } }, { capture: true }); }
  d.__saut++; d.close();
  if (modale) d.showModal(); else d.show();
}
function grandeFenetre(html, onValider) {
  if (FEN_MINI) { toast('Une fenêtre est réduite en bas de l’écran : reprenez-la ou fermez-la d’abord.', true); $('#fen-mini')?.classList.add('flash'); return; }
  const d = $('#fen'); d.classList.add('grande', 'plein');
  d.addEventListener('close', () => { d.classList.remove('grande', 'plein'); FEN_MINI = false; $('#fen-mini')?.remove(); }, { once: true });
  fenetre(html, onValider);
  const f = $('#fen-form'), h = f.querySelector('h3'); if (!h) return;
  const titre = h.textContent;
  const barre = document.createElement('div'); barre.className = 'fen-barre';
  barre.innerHTML = '<button type="button" data-w="min" title="Réduire">─</button><button type="button" data-w="max" title="Fenêtre">❐</button><button type="button" data-w="x" class="wx" title="Fermer">✕</button>';
  h.classList.add('fen-titre'); h.appendChild(barre);
  barre.onclick = (e) => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    if (b.dataset.w === 'x') { if (confirm('Fermer sans enregistrer ?')) d.close(); }
    else if (b.dataset.w === 'max') { const p = d.classList.toggle('plein'); b.textContent = p ? '❐' : '☐'; b.title = p ? 'Fenêtre' : 'Plein écran'; }
    else {
      // réduire : la fenêtre reste ouverte (saisie conservée) mais devient non modale et cachée
      FEN_MINI = true; d.classList.add('mini'); basculerSansFermer(d, false);
      const m = document.createElement('button'); m.id = 'fen-mini'; m.type = 'button'; m.innerHTML = `<span>▲</span> ${esc(titre)} <small>(réduite — cliquez pour reprendre)</small>`;
      m.onclick = () => { FEN_MINI = false; d.classList.remove('mini'); basculerSansFermer(d, true); m.remove(); };
      document.body.appendChild(m);
    }
  };
}

// totaux d'une facture : même calcul que l'application 3.3.0 (docs-pdf.js · invoiceTotals)
function totauxFacture(inv) {
  // 0.9.1 : FODEC compris (même calcul que le serveur, api/lib/calculs.js)
  const t = (+inv.tva || 0) / 100, f = (+inv.fodec || 0) / 100, ttcMode = inv.pricesTTC !== false;
  const rem = (l) => Math.min(100, Math.max(0, +l.remise || 0)) / 100, presta = (l) => !!(l.service || l.artType === 'prestation');
  const L = inv.lines || [];
  let ht, fodec = 0, tva, ttc;
  if (ttcMode) {
    const ex = (arr) => arr.reduce((s, l) => s + (+l.qty || 0) * (+l.pu || 0) * (1 - rem(l)), 0);
    ttc = r3(ex(L));
    if (!f) ht = r3(ttc / (1 + t));
    else { const htP = r3(ex(L.filter((l) => !presta(l))) / ((1 + t) * (1 + f))); ht = r3(htP + ex(L.filter(presta)) / (1 + t)); fodec = r3(htP * f); }
    tva = r3(ttc - ht - fodec);
  } else {
    const tot = L.map((l) => r3((+l.qty || 0) * (+l.pu || 0) * (1 - rem(l))));
    ht = r3(tot.reduce((s, v) => s + v, 0));
    fodec = r3(L.reduce((s, l, i) => s + (presta(l) ? 0 : tot[i]), 0) * f);
    tva = r3((ht + fodec) * t); ttc = r3(ht + fodec + tva);
  }
  return { ht, fodec, tva, ttc, timbre: r3(inv.timbre || 0), net: r3(ttc + r3(inv.timbre || 0)) };
}
const regleFacture = (inv) => r3((+inv.advance || 0) + (inv.payments || []).reduce((s, p) => s + (+p.amount || 0), 0));

// avancement de livraison d'une commande (quantités, sans montants)
function avancement(o, bls) {
  const livre = {};
  for (const b of bls) if (b.orderId === o.id && !String(b.status || '').startsWith('annul')) for (const l of b.lines || []) livre[l.lineId] = (livre[l.lineId] || 0) + (+l.qty || 0);
  const lignes = (o.lines || []).filter((l) => !l.service);
  const tot = lignes.reduce((s, l) => s + (+l.qty || 0), 0);
  const fait = lignes.reduce((s, l) => s + Math.min(+l.qty || 0, livre[l.id] || 0), 0);
  const etat = o.status === 'annulee' ? 'annulee' : !tot ? 'sans' : fait >= tot ? 'livree' : fait > 0 ? 'partielle' : 'a_produire';
  return { tot, fait, reste: Math.max(0, tot - fait), etat, livre };
}
const ETAT_CMD = { a_produire: ['À produire', 'fut'], partielle: ['Livrée en partie', 'fut'], livree: ['Livrée', 'vig'], annulee: ['Annulée', 'anc'], sans: ['Services', 'anc'] };
const MARQUAGE = { serigraphie: 'Sérigraphie', broderie: 'Broderie', flex: 'Flex', dtf: 'DTF', sublimation: 'Sublimation', impression: 'Impression', aucun: 'Sans marquage' };

async function gestion(force) {
  if (!GEST || force) GEST = await api('GET', '/api/commercial/gestion');
  return GEST;
}

/* ================================================================ connexion au serveur */
const SERVEUR = { ok: null, ms: null, info: null, vu: null };
async function testerServeur() {
  const el = $('#serveur'); const t0 = performance.now();
  try {
    const r = await fetch('/api/sante', { cache: 'no-store', credentials: 'same-origin' });
    const d = await r.json();
    SERVEUR.ms = Math.round(performance.now() - t0); SERVEUR.ok = r.ok && d.statut === 'ok'; SERVEUR.info = d; SERVEUR.vu = new Date();
  } catch (_) { SERVEUR.ok = false; SERVEUR.ms = null; }
  if (el) {
    el.className = 'serveur ' + (SERVEUR.ok ? 'ok' : 'ko');
    el.textContent = SERVEUR.ok ? `serveur · ${SERVEUR.ms} ms` : 'serveur injoignable';
    el.title = SERVEUR.ok ? `app.vethypro.com — API ${SERVEUR.info.version}, base ${SERVEUR.info.base}, ${SERVEUR.info.postgres || ''}. Vérifié à ${SERVEUR.vu.toLocaleTimeString('fr-FR')}` : 'Le serveur ne répond pas : vérifiez la connexion Internet. Vos saisies non enregistrées restent à l’écran.';
  }
  const carte = $('#carte-serveur'); if (carte) carte.outerHTML = carteServeur();
  return SERVEUR.ok;
}
setInterval(() => { if (!document.hidden && MOI) testerServeur(); }, 30000);
addEventListener('online', testerServeur); addEventListener('offline', testerServeur);
function carteServeur() {
  const s = SERVEUR;
  return `<div class="chiffre ${s.ok === false ? 'alerte' : ''}" id="carte-serveur"><b>${s.ok == null ? '…' : s.ok ? s.ms + ' ms' : 'Hors ligne'}</b>
    <span>${s.ok ? `Serveur en ligne · API ${esc(s.info.version)} · base ${esc(s.info.base)}` : s.ok === false ? 'Serveur injoignable' : 'Test de la connexion…'}</span></div>`;
}

/* ================================================================ cadres persistants (Studio 3D, Gestion, Catalogue) */
const CADRES = {}; let CADRES_UTIL = null;
function viderCadres() { for (const k of Object.keys(CADRES)) { CADRES[k].remove(); delete CADRES[k]; } $('#cadres')?.querySelector('.charge')?.remove(); CADRES_UTIL = null; }
window.viderCadres = viderCadres;
function montrerCadre(page, onglet) {
  const zone = $('#cadres');
  if (CADRES_UTIL !== null && CADRES_UTIL !== MOI.id) viderCadres();
  CADRES_UTIL = MOI.id;
  let f = CADRES[page];
  if (!f) {
    const q = new URLSearchParams(); if (onglet) q.set('onglet', onglet); q.set('prix', voit('prix') ? '1' : '0');
    f = document.createElement('iframe');
    f.src = PAGES_CADRE[page].src + '?' + q; f.title = PAGES_CADRE[page].titre; f.dataset.page = page;
    f.setAttribute('allow', 'clipboard-write; fullscreen');
    const ch = document.createElement('div'); ch.className = 'charge'; ch.dataset.page = page; ch.innerHTML = `<i></i><span>${esc(PAGES_CADRE[page].titre)} — chargement…</span>`;
    zone.appendChild(ch); zone.appendChild(f); CADRES[page] = f;
    f.addEventListener('load', () => setTimeout(() => zone.querySelector(`.charge[data-page="${page}"]`)?.remove(), 400));
  } else if (onglet) {
    f.contentWindow?.postMessage({ erp: true, type: 'onglet', onglet }, location.origin);
  }
  for (const [k, x] of Object.entries(CADRES)) x.classList.toggle('cache', k !== page);
  zone.querySelectorAll('.charge').forEach((c) => { c.hidden = c.dataset.page !== page; });
  zone.classList.remove('cache'); $('#contenu').hidden = true;
}
function cacherCadres() { $('#cadres').classList.add('cache'); $('#contenu').hidden = false; }
const versCadres = (msg, sauf) => { for (const f of Object.values(CADRES)) if (f.contentWindow && f.contentWindow !== sauf) f.contentWindow.postMessage({ erp: true, ...msg }, location.origin); };

addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data || !e.data.erp) return;
  const m = e.data;
  switch (m.type) {
    case 'ouvrir': location.hash = m.page === 'gestion' ? lien('commercial', voit('prix') ? 'commandes' : 'commandes') : m.page === 'parametres' ? lien('infographie', 'catalogue') : lien('infographie', 'studio'); break;
    case 'notify':
      versCadres({ type: 'notify', ch: m.ch, data: m.data }, e.source);
      if (m.ch === 'catalogue-saved') { CAT_ERP = null; if (CADRES.studio && e.source !== CADRES.studio.contentWindow) toast('Catalogue enregistré. Le Studio 3D l’utilisera à sa prochaine ouverture (bouton « Recharger le studio »).'); }
      break;
    case 'catalogue-enregistre': CAT_ERP = null; break;
    case 'donnees-modifiees': GEST = null; versCadres({ type: 'rafraichir' }, e.source); break;
    case 'session-expiree': if (MOI) { MOI = null; afficher('connexion'); erreurDans($('#connexion-err'), 'Votre session a expiré : reconnectez-vous. Le travail en cours dans le studio est conservé.'); } break;
    case 'onglet-actif':
      if (m.page === 'gestion.html' && ONGLET_FONCTION[m.onglet] && ROUTE.mod === 'commercial') {
        const fn = ONGLET_FONCTION[m.onglet];
        if (fn !== ROUTE.fn && !(fn === 'factures' && ROUTE.fn === 'reglements')) { history.replaceState(null, '', lien('commercial', fn)); ROUTE.fn = fn; dessinerPanneau(); dessinerFil(); }
      }
      break;
  }
});

/* ================================================================ rail, panneau, fil */
const modulesVus = () => (ACC?.modules || []).slice().sort((a, b) => ORDRE.indexOf(a.code) - ORDRE.indexOf(b.code));
const fonctionsVues = (mod) => {
  const m = ACC?.modules.find((x) => x.code === mod); if (!m) return [];
  const lisibles = new Set(m.fonctions.map((f) => f.code.split('.')[1]));
  return Object.entries(MODS[mod].f).filter(([k, d]) => {
    if (k === 'tableau') return voit('prix') && lisibles.has('commandes');
    if (d.prix && !voit('prix')) return false;
    return lisibles.has(d.fonction || k);
  }).map(([k, d]) => ({ code: k, ...d, libelle: d.libelle || libFonction(mod, k) }));
};
function dessinerRail() {
  const mods = modulesVus();
  $('#rail').innerHTML = `<a href="#accueil" class="${ROUTE.mod === 'accueil' ? 'on' : ''}" title="Accueil">${SVG(ICO.accueil)}<span>Accueil</span></a><hr>` +
    mods.map((m) => {
      const fs = fonctionsVues(m.code); const actif = fs.some((f) => f.t !== 'futur');
      return `<a href="${lien(m.code, (fs.find((f) => f.t !== 'futur') || fs[0] || {}).code)}" class="${ROUTE.mod === m.code ? 'on' : ''} ${actif ? '' : 'futur'}" title="${String(m.numero).padStart(2, '0')} · ${esc(m.libelle)}${actif ? '' : ' (prévu au lot ' + m.lot + ')'}">${SVG(ICO[m.code])}<span>${esc(MODS[m.code].court)}</span></a>`;
    }).join('');
}
function dessinerPanneau() {
  const p = $('#panneau-f');
  if (ROUTE.mod === 'accueil') {
    p.innerHTML = `<div class="tete"><span class="n">ERP · DIGITAL-TEX</span><h2>Accueil</h2><p>Vos modules et vos chiffres du jour.</p></div>
      <nav class="fonctions">${modulesVus().map((m) => `<a href="${lien(m.code, (fonctionsVues(m.code).find((f) => f.t !== 'futur') || fonctionsVues(m.code)[0] || {}).code)}"><span class="ico">${SVG(ICO[m.code])}</span><span class="tx">${esc(m.libelle)}<small>${esc(m.etat || '')}</small></span></a>`).join('')}</nav>`;
    return;
  }
  const m = ACC.modules.find((x) => x.code === ROUTE.mod);
  const fs = fonctionsVues(ROUTE.mod);
  const enService = fs.filter((f) => f.t !== 'futur'), aVenir = fs.filter((f) => f.t === 'futur');
  const item = (f) => `<a title="${esc(f.libelle + ' — ' + (f.d || ''))}" href="${lien(ROUTE.mod, f.code)}" class="${f.code === ROUTE.fn ? 'on' : ''} ${f.t === 'futur' ? 'futur' : ''}"><span class="ico">${SVG(ICO[f.ico] || ICO.doc)}</span><span class="tx">${esc(f.libelle)}<small>${esc(f.d || '')}</small></span>${f.t === 'futur' ? `<span class="lotb">lot ${f.lot}</span>` : ''}</a>`;
  p.innerHTML = `<div class="tete"><button class="mode-pan" data-act="mode-panneau" title="${modeIcones() ? 'Affichage détaillé (icônes + libellés)' : 'Affichage icônes (bande étroite)'}">${modeIcones() ? '»' : '«'}</button><span class="n">MODULE ${String(m.numero).padStart(2, '0')}</span><h2>${esc(m.libelle)}</h2><p>${esc(MODS[ROUTE.mod].desc)}</p></div>
    <nav class="fonctions">${enService.length ? `<h4>En service</h4>${enService.map(item).join('')}` : ''}${aVenir.length ? `<h4>Prévu</h4>${aVenir.map(item).join('')}` : ''}</nav>`;
}
function dessinerFil() {
  const el = $('#fil');
  if (ROUTE.mod === 'accueil') { el.innerHTML = '<b>Accueil</b>'; document.title = 'Accueil · ERP DIGITAL-TEX'; return; }
  const m = ACC.modules.find((x) => x.code === ROUTE.mod);
  const f = libFonction(ROUTE.mod, ROUTE.fn);
  el.innerHTML = `<span>${esc(m.libelle)}</span><span class="sep">›</span><b>${esc(f)}</b>`;
  document.title = f + ' · ERP DIGITAL-TEX';
}

/* ================================================================ routage */
async function route() {
  if (!MOI || MOI.doit_changer_mdp) return;
  if (!ACC) { try { ACC = await api('GET', '/api/accueil'); } catch (x) { $('#contenu').innerHTML = `<div class="vide">${esc(x.message)}</div>`; return; } }
  if (CADRES_UTIL !== null && CADRES_UTIL !== MOI.id) viderCadres();
  const [modH, fnH] = (location.hash.slice(1) || 'accueil').split('/');
  let mod = modH, fn = fnH;
  // anciennes adresses de l'étape 15
  const ANC = { comptes: ['parametres', 'utilisateurs'], roles: ['parametres', 'roles'], journal: ['parametres', 'audit'] };
  if (ANC[mod]) [mod, fn] = ANC[mod];
  if (mod !== 'accueil') {
    const fs = ACC.modules.some((x) => x.code === mod) ? fonctionsVues(mod) : [];
    if (!fs.length) mod = 'accueil';
    else if (!fs.some((f) => f.code === fn)) fn = (fs.find((f) => f.t !== 'futur') || fs[0]).code;
    if (mod !== modH || fn !== fnH) history.replaceState(null, '', mod === 'accueil' ? '#accueil' : lien(mod, fn));
  }
  ROUTE = { mod, fn: mod === 'accueil' ? null : fn };
  $('#v-app').classList.remove('ouvert');
  dessinerRail(); dessinerPanneau(); dessinerFil();
  const m = $('#contenu');
  if (mod === 'accueil') { appliquerPanneau(false); cacherCadres(); m.scrollTop = 0; return ecranAccueil(m); }
  const d = MODS[mod].f[fn];
  if (d.t === 'cadre' && !(d.page === 'gestion' && !voit('prix'))) { appliquerPanneau(d.page === 'studio'); return montrerCadre(d.page, d.onglet); }
  appliquerPanneau(false); cacherCadres(); m.scrollTop = 0;
  try {
    if (d.t === 'futur') return ecranFutur(m, mod, fn, d);
    if (d.t === 'cadre') return ECRANS.sansPrix(m, d.sansPrix, fn);
    if (d.ecran === 'onglet') return ecranOngletParam(m, d.onglet);
    return await ECRANS[d.ecran](m, d, mod, fn);
  } catch (x) { m.innerHTML = `<div class="vide">${esc(x.message)}</div>`; }
}
// Le panneau des fonctions reste ouvert partout (Commercial : Devis, Proformas, Avoirs, Produits finis… ne sont que là) ;
// seul le Studio 3D, qui a besoin de toute la largeur, le replie par défaut.
function appliquerPanneau(cadre) {
  const cle = cadre ? 'cadre' : 'page';
  const replie = PANNEAU_FORCE[cle] ?? cadre;
  $('#v-app').classList.toggle('replie', replie);
  $('#v-app').classList.toggle('icones', !replie && modeIcones());
}
// 0.10.1 : bande de gauche en mode « icônes » (étroite, libellé au survol) ou « détaillé » (icône + libellé + description) — mémorisé sur ce poste
const modeIcones = () => { try { return localStorage.getItem('erp.panneau') === 'icones'; } catch (_) { return false; } };
function basculerModePanneau() {
  const v = !modeIcones(); try { localStorage.setItem('erp.panneau', v ? 'icones' : 'detail'); } catch (_) { /* */ }
  $('#v-app').classList.toggle('icones', v); dessinerPanneau();
}
addEventListener('hashchange', () => {
  if (RS.modifie && !confirm('Des changements de droits ne sont pas enregistrés. Quitter la page ?')) { history.back(); return; }
  RS.modifie = false; route();
});
addEventListener('beforeunload', (e) => { if (RS.modifie || CADRES.studio) e.preventDefault(); });

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'mode-panneau') { basculerModePanneau(); return; }
  if (b.dataset.act === 'panneau') {
    const mobile = matchMedia('(max-width:860px)').matches;
    if (mobile) { $('#v-app').classList.toggle('ouvert'); return; }
    const cadre = MODS[ROUTE.mod]?.f?.[ROUTE.fn]?.page === 'studio'; const cle = cadre ? 'cadre' : 'page';
    PANNEAU_FORCE[cle] = !$('#v-app').classList.contains('replie');
    $('#v-app').classList.toggle('replie', PANNEAU_FORCE[cle]);
  }
  if (b.dataset.act === 'deconnexion' && Object.keys(CADRES).length) {
    if (!confirm('Se déconnecter ? Ce qui n’est pas enregistré dans le Studio 3D, la Gestion ou le Catalogue sera perdu.')) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    viderCadres(); ACC = null; GEST = null;
  } else if (b.dataset.act === 'deconnexion') { ACC = null; GEST = null; }
  if (b.dataset.act === 'recharger-studio' && CADRES.studio) { if (confirm('Recharger le studio ? La composition en cours non enregistrée sera perdue.')) { CADRES.studio.remove(); delete CADRES.studio; location.hash = '#infographie/studio'; route(); } }
}, true);

/* ================================================================ écrans */
const ECRANS = {};
const entete = (titre, sous, droite = '') => `<div class="entete"><div><h2>${esc(titre)}</h2>${sous ? `<p>${sous}</p>` : ''}</div><span class="spacer"></span>${droite}</div>`;

/* ---------- Accueil ---------- */
async function ecranAccueil(m) {
  const prenom = esc(MOI.nom_complet.split(' ')[0]);
  m.innerHTML = entete('Bonjour ' + prenom, 'Chargement de vos chiffres…');
  let a; try { a = ACC = await api('GET', '/api/accueil'); } catch (x) { m.innerHTML = `<div class="vide">${esc(x.message)}</div>`; return; }
  dessinerRail(); dessinerPanneau();
  testerServeur();
  const ch = [];
  const lit = (f) => peut(f);
  if (lit('commercial.commandes') || lit('production.of')) {
    try {
      const g = await gestion(true);
      const cmds = g.orders.map((o) => ({ o, a: avancement(o, g.bls) })).filter((x) => x.a.etat === 'a_produire' || x.a.etat === 'partielle');
      const retard = cmds.filter((x) => (ecartJours(x.o.delivery) ?? 1) < 0).length;
      const semaine = cmds.filter((x) => { const j = ecartJours(x.o.delivery); return j !== null && j >= 0 && j <= 7; }).length;
      const cible = lit('production.of') ? lien('production', 'of') : lien('commercial', 'commandes');
      ch.push(['', cmds.length, cmds.length > 1 ? 'commandes à produire ou livrer' : 'commande à produire ou livrer', cible],
        ['', cmds.reduce((s, x) => s + x.a.reste, 0), 'pièces restant à livrer', cible],
        [retard ? 'alerte' : '', retard, 'commande(s) en retard de livraison', cible],
        ['', semaine, 'livraison(s) promise(s) sous 7 jours', cible]);
      if (voit('prix') && g.invoices.length) {
        const imp = g.invoices.filter((f) => f.status !== 'annulee').map((f) => r3(totauxFacture(f).net - regleFacture(f))).filter((r) => r > 0.0005);
        ch.push(['', dt(imp.reduce((s, r) => s + r, 0)) + ' DT', `reste à encaisser (${imp.length} facture${imp.length > 1 ? 's' : ''})`, peut('compta_clients.comptes') && voit('encours') ? lien('compta_clients', 'comptes') : lien('commercial', 'factures')]);
      }
    } catch (_) { /* la gestion n'est pas lisible : pas de chiffres */ }
  }
  if (a.comptes) ch.push(['', a.comptes.actifs, a.comptes.actifs > 1 ? 'comptes actifs' : 'compte actif', lien('parametres', 'utilisateurs')]);
  if (a.comptes?.provisoires) ch.push(['', a.comptes.provisoires, 'compte(s) en attente de 1re connexion', lien('parametres', 'utilisateurs')]);
  if (a.comptes?.verrouilles) ch.push(['alerte', a.comptes.verrouilles, 'compte(s) verrouillé(s)', lien('parametres', 'utilisateurs')]);
  if (a.securite) ch.push([a.securite.refus_24h >= 10 ? 'alerte' : '', a.securite.refus_24h, 'connexions refusées (24 h)', lien('parametres', 'audit')]);
  const comp = a.societe_a_completer?.length ? `<div class="msg info" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span><b>À compléter avant les premières factures :</b> ${a.societe_a_completer.map(esc).join(', ')}.</span><span class="spacer"></span>${peut('parametres.societe', 'modifier') ? `<a class="btn sm" href="${lien('parametres', 'societe')}">Compléter</a>` : ''}</div>` : '';
  const raccourcis = [];
  if (peut('infographie.studio')) raccourcis.push([lien('infographie', 'studio'), 'cube', 'Ouvrir le Studio 3D', 'Composer une tenue, sortir la fiche technique']);
  if (peut('commercial.commandes')) raccourcis.push([lien('commercial', 'commandes'), 'list', 'Commandes', voit('prix') ? 'Créer, suivre, encaisser une avance' : 'Consulter les commandes (sans prix)']);
  if (peut('production.of')) raccourcis.push([lien('production', 'of'), 'clock', 'Plan de charge', 'Ce qu’il faut produire, par date promise']);
  if (peut('commercial.factures') && voit('prix')) raccourcis.push([lien('commercial', 'factures'), 'euro', 'Factures', 'Émettre, encaisser, imprimer']);
  m.innerHTML = entete('Bonjour ' + prenom, `${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${a.modules.length} module${a.modules.length > 1 ? 's' : ''} ouvert${a.modules.length > 1 ? 's' : ''} pour votre compte`) + comp +
    `<div class="chiffres">${carteServeur()}${ch.map(([c, v, l, h]) => `<a class="chiffre ${c}" href="${h}"><b>${v}</b><span>${esc(l)}</span></a>`).join('')}</div>` +
    (raccourcis.length ? `<div class="raccourcis">${raccourcis.map(([h, i, t, s]) => `<a class="raccourci" href="${h}"><span class="ico">${SVG(ICO[i])}</span><span><b>${esc(t)}</b><small>${esc(s)}</small></span></a>`).join('')}</div>` : '') +
    `<h3 class="titre-bloc">Les modules</h3><div class="modules">${modulesVus().map((mo) => {
      const fs = fonctionsVues(mo.code); const svc = fs.filter((f) => f.t !== 'futur').length;
      const h = lien(mo.code, (fs.find((f) => f.t !== 'futur') || fs[0] || {}).code);
      return `<a class="module ${svc ? 'actif' : 'futur'}" href="${h}"><span class="lot">${svc ? `${svc}/${fs.length} en service` : 'lot ' + mo.lot}</span>
        <span class="mi">${SVG(ICO[mo.code])}</span><span class="n">${String(mo.numero).padStart(2, '0')}</span><h3>${esc(mo.libelle)}</h3><p>${esc(mo.etat || '')}</p></a>`;
    }).join('')}</div>
    ${a.modules.length ? '' : '<div class="vide">Aucun module ne vous est encore attribué. Demandez au Super administrateur de régler votre rôle.</div>'}`;
}

/* ---------- Fonction prévue (lot à venir) ---------- */
function ecranFutur(m, mod, fn, d) {
  const mo = ACC.modules.find((x) => x.code === mod);
  const deja = fonctionsVues(mod).filter((f) => f.t !== 'futur');
  m.innerHTML = `<div class="futur-ecran">
    <div class="futur-tete"><span class="ico">${SVG(ICO[d.ico] || ICO.doc)}</span><div><span class="n">MODULE ${String(mo.numero).padStart(2, '0')} · ${esc(mo.libelle)}</span><h2>${esc(libFonction(mod, fn))}</h2><p>${esc(d.d || '')}</p></div><span class="spacer"></span><span class="lotg">Prévu au lot ${d.lot}</span></div>
    <div class="panneau form-pan"><h3 class="section-t" style="padding:0 0 8px">Ce que fera cet écran (cahier des charges)</h3>
      <ul class="cdc">${(d.cdc || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="mute small" style="margin:12px 0 0">L’écran est déjà prévu dans les droits : ce que vous réglez aujourd’hui dans <b>Paramètres › Rôles et droits</b> s’appliquera tel quel à sa mise en service. Les dates de chaque lot sont fixées à la validation du lot précédent.</p></div>
    ${deja.length ? `<h3 class="titre-bloc">Déjà en service dans ce module</h3><div class="raccourcis">${deja.map((f) => `<a class="raccourci" href="${lien(mod, f.code)}"><span class="ico">${SVG(ICO[f.ico] || ICO.doc)}</span><span><b>${esc(f.libelle)}</b><small>${esc(f.d || '')}</small></span></a>`).join('')}</div>` : ''}
  </div>`;
}

/* ---------- Paramètres : société, fiscalité, numérotation (écrans de l'étape 15) ---------- */
async function ecranOngletParam(m, o) {
  const t = { societe: ['Société', 'Ces informations figurent sur les devis, BL et factures émis par tous les postes, et dans le Studio 3D.'],
    fiscalite: ['Fiscalité', 'Valeurs datées : une nouvelle valeur ne modifie jamais les documents déjà émis.'],
    numerotation: ['Numérotation', 'Un seul compteur par type de document et par année, partagé par tous les postes.'],
    factures: ['Factures', 'Réglages de facturation de l’administrateur, valables pour tous les postes.'] }[o];
  m.innerHTML = entete(t[0], t[1]) + '<div id="p-param"><div class="vide">Chargement…</div></div>';
  await ({ societe: ongletSociete, fiscalite: ongletFiscalite, numerotation: ongletNumerotation, factures: ongletFactures })[o]($('#p-param'));
}
ECRANS.comptes = (m) => pageComptes(m);
ECRANS.roles = (m) => pageRoles(m);
ECRANS.journal = (m) => pageJournal(m);

/* ---------- Commercial sans le droit « prix » (production, infographie, magasin…) ---------- */
ECRANS.sansPrix = async (m, quoi) => {
  if (quoi === 'interdit') { m.innerHTML = entete(libFonction('commercial', ROUTE.fn), '') + '<div class="panneau"><div class="vide">Cet écran contient des montants : il est réservé aux comptes autorisés à voir les prix.<br>Les commandes et les bons de livraison restent consultables sans prix.</div></div>'; return; }
  const g = await gestion(true);
  if (quoi === 'clients') {
    m.innerHTML = entete('Clients', `${g.clients.length} client${g.clients.length > 1 ? 's' : ''} · consultation`, rechercheHtml()) + `<div class="panneau" id="liste"></div>`;
    const dess = (q) => {
      const l = g.clients.filter((c) => !q || JSON.stringify(c).toLowerCase().includes(q));
      $('#liste').innerHTML = l.length ? `<table><thead><tr><th>Client</th><th>Contact</th><th class="masque-mobile">Téléphone</th><th class="masque-mobile">Ville</th><th class="masque-mobile">MF</th><th class="n">Commandes</th></tr></thead><tbody>
        ${l.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.contact || '—')}</td><td class="masque-mobile">${esc(c.phone || '—')}</td><td class="masque-mobile">${esc(c.city || '—')}</td><td class="masque-mobile mono small">${esc(c.mf || '—')}</td><td class="n">${g.orders.filter((o) => o.client?.id === c.id).length}</td></tr>`).join('')}</tbody></table>` : '<div class="vide">Aucun client.</div>';
    };
    brancherRecherche(dess); return;
  }
  if (quoi === 'bl') {
    m.innerHTML = entete('Bons de livraison', 'Quantités livrées, sans montants', rechercheHtml()) + `<div class="panneau" id="liste"></div>`;
    const dess = (q) => {
      const l = g.bls.slice().reverse().filter((b) => !q || JSON.stringify([b.number, b.orderNumber, b.client?.name, b.clientPO]).toLowerCase().includes(q));
      $('#liste').innerHTML = l.length ? `<table><thead><tr><th>BL</th><th>Date</th><th>Commande</th><th>Client</th><th class="n">Pièces</th><th>État</th></tr></thead><tbody>
        ${l.map((b) => `<tr><td class="mono"><b>${esc(b.number)}</b></td><td>${jour(b.date)}</td><td class="mono small">${esc(b.orderNumber || '')}</td><td>${esc(b.client?.name || '')}</td><td class="n">${(b.lines || []).reduce((s, x) => s + (+x.qty || 0), 0)}</td><td>${String(b.status || '').startsWith('annul') ? '<span class="badge anc">Annulé</span>' : '<span class="badge vig">Livré</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="vide">Aucun bon de livraison.</div>';
    };
    brancherRecherche(dess); return;
  }
  return ECRANS.planCharge(m, { tout: true });
};
const rechercheHtml = (ph = 'Rechercher…') => `<div class="champ" style="margin:0;min-width:240px"><input id="recherche" type="search" placeholder="${esc(ph)}" autocomplete="off"></div>`;
function brancherRecherche(dess) { const i = $('#recherche'); dess(''); i.oninput = () => dess(i.value.trim().toLowerCase()); }

/* ---------- Production : plan de charge (et liste des commandes sans prix) ---------- */
ECRANS.planCharge = async (m, d = {}) => {
  const g = await gestion(true);
  const tout = !!d.tout;
  const lignes = g.orders.map((o) => ({ o, a: avancement(o, g.bls), j: ecartJours(o.delivery) }));
  const enCours = lignes.filter((x) => x.a.etat === 'a_produire' || x.a.etat === 'partielle');
  const retard = enCours.filter((x) => x.j !== null && x.j < 0);
  const k7 = enCours.filter((x) => x.j !== null && x.j >= 0 && x.j <= 7);
  m.innerHTML = entete(tout ? 'Commandes' : 'Plan de charge', tout ? 'Consultation sans prix : quantités, tailles, couleurs, délais.' : 'Commandes à produire, classées par date de livraison promise. Les ordres de fabrication en 3 parties arrivent au lot 7.',
    `<div class="row-f">${rechercheHtml('Client, n° de commande, produit…')}<div class="champ" style="margin:0"><select id="filtre">${tout ? '<option value="tout">Toutes</option>' : ''}<option value="encours">À produire / livrer</option><option value="retard">En retard</option><option value="7j">Sous 7 jours</option>${tout ? '' : '<option value="tout">Toutes</option>'}</select></div></div>`) +
    `<div class="chiffres"><div class="chiffre"><b>${enCours.length}</b><span>commandes en cours</span></div><div class="chiffre"><b>${enCours.reduce((s, x) => s + x.a.reste, 0)}</b><span>pièces restant à livrer</span></div>
      <div class="chiffre ${retard.length ? 'alerte' : ''}"><b>${retard.length}</b><span>en retard</span></div><div class="chiffre"><b>${k7.length}</b><span>à livrer sous 7 jours</span></div></div>
    <div class="panneau" id="liste"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), f = $('#filtre').value;
    let l = f === 'tout' ? lignes : f === 'retard' ? retard : f === '7j' ? k7 : enCours;
    if (q) l = l.filter((x) => JSON.stringify([x.o.number, x.o.client?.name, x.o.clientPO, (x.o.lines || []).map((y) => [y.designation, y.staff, y.color])]).toLowerCase().includes(q));
    l = l.slice().sort((a, b) => (a.o.delivery || '9999').localeCompare(b.o.delivery || '9999'));
    $('#liste').innerHTML = l.length ? `<table><thead><tr><th>Commande</th><th>Client</th><th>Livraison promise</th><th class="masque-mobile">Marquage</th><th class="masque-mobile">Services</th><th>Avancement</th><th>État</th></tr></thead><tbody>
      ${l.map(({ o, a, j }) => {
        const pct = a.tot ? Math.round(a.fait / a.tot * 100) : 0;
        const del = o.delivery ? `${jour(o.delivery)}${a.etat === 'a_produire' || a.etat === 'partielle' ? (j < 0 ? ` <span class="badge ret">${-j} j de retard</span>` : j <= 7 ? ` <span class="badge fut">J-${j}</span>` : '') : ''}` : '<span class="mute">non fixée</span>';
        const staff = [...new Set((o.lines || []).map((y) => y.staff).filter(Boolean))];
        return `<tr data-cmd="${esc(o.id)}" class="cliquable"><td class="mono"><b>${esc(o.number)}</b>${o.clientPO ? `<div class="mute small">${esc(o.clientPO)}</div>` : ''}</td><td>${esc(o.client?.name || '')}</td><td>${del}</td>
          <td class="masque-mobile">${esc(MARQUAGE[o.printBox] || o.printBox || '—')}</td><td class="masque-mobile small">${staff.map((s) => `<span class="etiq">${esc(s)}</span>`).join('') || '—'}</td>
          <td><div class="jauge" title="${a.fait} livrées sur ${a.tot}"><i style="width:${pct}%"></i></div><span class="small mute">${a.fait} / ${a.tot} pièces</span></td>
          <td><span class="badge ${ETAT_CMD[a.etat][1]}">${ETAT_CMD[a.etat][0]}</span></td></tr>`;
      }).join('')}</tbody></table>` : '<div class="vide">Aucune commande pour ce filtre.</div>';
  };
  $('#recherche').oninput = dess; $('#filtre').onchange = dess; dess();
  $('#liste').onclick = (e) => { const tr = e.target.closest('[data-cmd]'); if (tr) detailCommande(g, g.orders.find((o) => o.id === tr.dataset.cmd)); };
};
function detailCommande(g, o) {
  const a = avancement(o, g.bls);
  const prods = (o.products || []).filter((p) => p.thumb);
  const lignes = (o.lines || []).filter((l) => !l.service);
  grandeFenetre(`<h3>Commande ${esc(o.number)} · ${esc(o.client?.name || '')}</h3>
    <div class="kv-g"><span>Date</span><b>${jour(o.date)}</b><span>Livraison promise</span><b>${jour(o.delivery)}</b><span>BC client</span><b>${esc(o.clientPO || '—')}</b><span>Marquage</span><b>${esc(MARQUAGE[o.printBox] || o.printBox || '—')}</b></div>
    ${prods.length ? `<div class="vignettes">${prods.map((p) => `<figure><img src="${esc(p.thumb)}" alt=""><figcaption><b>${esc(p.garment || p.name || '')}</b><span>${esc(p.staff || '')} · ${+p.qty || 0} pcs</span></figcaption></figure>`).join('')}</div>` : ''}
    <div class="panneau" style="max-height:46vh;overflow:auto"><p class="mute small">Double-cliquez une ligne pour ouvrir la fiche technique (PDF du Studio 3D ou fichier joint).</p><table><thead><tr><th>Article</th><th>Service</th><th>Couleur</th><th>Taille</th><th class="n">Qté</th><th class="n">Livrée</th></tr></thead><tbody>
      ${lignes.map((l) => `<tr data-fiche="${esc(l.article || '')}" data-fo="${esc(o.id)}" title="Double-clic : fiche technique"><td>${esc(l.designation)}</td><td>${esc(l.staff || '')}</td><td>${esc(l.color || '')}</td><td class="mono">${esc(l.size || '')}</td><td class="n">${+l.qty || 0}</td><td class="n">${Math.min(+l.qty || 0, a.livre[l.id] || 0)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="4"><b>Total</b></td><td class="n"><b>${a.tot}</b></td><td class="n"><b>${a.fait}</b></td></tr></tfoot></table></div>
    <p class="mute small" style="margin:10px 0 0">La fiche technique se génère depuis le Studio 3D ou la Gestion. Au lot 7, chaque commande validée donnera son ordre de fabrication (coupe → marquage → assemblage).</p>
    <div class="pied"><button class="btn" value="ok">Fermer</button></div>`, () => true);
}

/* ---------- Comptabilité clients : encours, échéances, balance âgée ---------- */
const TRANCHES = [['non_echu', 'Non échu'], ['t30', '1–30 j'], ['t60', '31–60 j'], ['t90', '61–90 j'], ['t90p', '+ 90 j']];
ECRANS.encours = async (m) => {
  if (!voit('prix') || !voit('encours')) { m.innerHTML = entete('Comptes clients', '') + '<div class="panneau"><div class="vide">Cet écran demande les droits de visibilité « Prix » et « Encours clients ».</div></div>'; return; }
  const g = await gestion(true);
  const parClient = new Map();
  const factures = g.invoices.filter((f) => f.status !== 'annulee' && devF(f) === 'DT').map((f) => {
    const t = totauxFacture(f), regle = regleFacture(f), reste = r3(Math.max(0, t.net - regle)), j = ecartJours(f.due || f.date);
    const tranche = reste <= 0.0005 ? null : j >= 0 ? 'non_echu' : -j <= 30 ? 't30' : -j <= 60 ? 't60' : -j <= 90 ? 't90' : 't90p';
    return { f, net: t.net, regle, reste, j, tranche };
  });
  for (const x of factures) {
    const k = x.f.client?.id || x.f.client?.name || '?';
    if (!parClient.has(k)) parClient.set(k, { nom: x.f.client?.name || '?', mf: x.f.client?.mf || '', nb: 0, facture: 0, regle: 0, reste: 0, non_echu: 0, t30: 0, t60: 0, t90: 0, t90p: 0, lignes: [] });
    const c = parClient.get(k); c.nb++; c.facture = r3(c.facture + x.net); c.regle = r3(c.regle + Math.min(x.regle, x.net)); c.reste = r3(c.reste + x.reste); if (x.tranche) c[x.tranche] = r3(c[x.tranche] + x.reste); c.lignes.push(x);
  }
  const cl = [...parClient.values()].sort((a, b) => b.reste - a.reste);
  const tot = (k) => r3(cl.reduce((s, c) => s + c[k], 0));
  const echu = r3(tot('t30') + tot('t60') + tot('t90') + tot('t90p'));
  const exp = peut('compta_clients.comptes', 'exporter');
  m.innerHTML = entete('Comptes clients et échéances', 'Calculé à partir des factures émises (hors annulées), des avances, des règlements et des encaissements. Montants en DT, 3 décimales.',
    boutonsExport('bal', '/api/compta/export/balance-clients', exp)) +
    `<div class="chiffres"><div class="chiffre"><b>${dt(tot('reste'))}</b><span>reste à encaisser (DT)</span></div><div class="chiffre ${echu > 0 ? 'alerte' : ''}"><b>${dt(echu)}</b><span>dont échu (DT)</span></div>
      <div class="chiffre ${tot('t60') + tot('t90') + tot('t90p') > 0 ? 'alerte' : ''}"><b>${dt(r3(tot('t60') + tot('t90') + tot('t90p')))}</b><span>échu depuis plus de 30 jours (DT)</span></div><div class="chiffre"><b>${factures.filter((x) => x.reste > 0.0005).length}</b><span>facture(s) non soldée(s)</span></div></div>
    <div class="panneau" style="overflow:auto">${cl.length ? `<table class="nombres"><thead><tr><th>Client</th><th class="n">Factures</th><th class="n">Facturé</th><th class="n">Réglé</th><th class="n">Reste dû</th>${TRANCHES.map(([, l]) => `<th class="n">${l}</th>`).join('')}</tr></thead><tbody>
      ${cl.map((c, i) => `<tr class="cliquable" data-cl="${i}"><td><b>${esc(c.nom)}</b>${c.mf ? `<div class="mute small mono">${esc(c.mf)}</div>` : ''}</td><td class="n">${c.nb}</td><td class="n">${dt(c.facture)}</td><td class="n">${dt(c.regle)}</td><td class="n"><b>${dt(c.reste)}</b></td>${TRANCHES.map(([k]) => `<td class="n ${k !== 'non_echu' && c[k] > 0 ? 'rouge' : ''}">${c[k] ? dt(c[k]) : '—'}</td>`).join('')}</tr>`).join('')}
      </tbody><tfoot><tr><td><b>Total</b></td><td class="n">${factures.length}</td><td class="n">${dt(tot('facture'))}</td><td class="n">${dt(tot('regle'))}</td><td class="n"><b>${dt(tot('reste'))}</b></td>${TRANCHES.map(([k]) => `<td class="n">${dt(tot(k))}</td>`).join('')}</tr></tfoot></table>` : '<div class="vide">Aucune facture émise pour l’instant.</div>'}</div>
    <p class="mute small">Échéance : date d’échéance de la facture (sinon sa date). Montants en DT : les factures export (EUR / USD) sont dans le journal des ventes, dans leur devise. Encaissements, lettrage et relances : écrans voisins de ce module.</p>`;
  m.onclick = (e) => {
    const tr = e.target.closest('[data-cl]'); if (!tr) return;
    const c = cl[+tr.dataset.cl];
    grandeFenetre(`<h3>${esc(c.nom)} · relevé</h3><div class="panneau" style="max-height:56vh;overflow:auto"><table><thead><tr><th>Facture</th><th>Date</th><th>Échéance</th><th class="n">Net (DT)</th><th class="n">Réglé</th><th class="n">Reste</th><th>Retard</th></tr></thead><tbody>
      ${c.lignes.sort((a, b) => (a.f.date || '').localeCompare(b.f.date || '')).map((x) => `<tr><td class="mono"><b>${esc(x.f.number)}</b> <button type="button" class="btn ghost sm" data-pdf="${esc(x.f.id)}" title="Imprimer au format DIGITAL-TEX">PDF</button></td><td>${jour(x.f.date)}</td><td>${jour(x.f.due)}</td><td class="n">${dt(x.net)}</td><td class="n">${dt(x.regle)}</td><td class="n"><b>${dt(x.reste)}</b></td><td>${x.reste > 0.0005 && x.j < 0 ? `<span class="badge ret">${-x.j} j</span>` : x.reste > 0.0005 ? '<span class="badge fut">à échoir</span>' : '<span class="badge vig">soldée</span>'}</td></tr>`).join('')}
      </tbody></table></div><div class="pied"><button class="btn" value="ok">Fermer</button></div>`, () => true);
    $('#fen-form').addEventListener('click', (ev) => { const b = ev.target.closest('[data-pdf]'); if (b) imprimerFactureDT(g.invoices.find((f) => f.id === b.dataset.pdf)); });
  };
};

// 0.9.1 : facture imprimée au format DIGITAL-TEX depuis la comptabilité (même gabarit que la Gestion)
async function imprimerFactureDT(f) {
  try {
    if (!f) return;
    if (!window.DocsDT) throw new Error('Module d’impression non chargé : rechargez la page (Ctrl+F5).');
    const G = await gestion(), cl = (G.clients || []).find((c) => c.id === f.client?.id);
    const bytes = await window.DocsDT.buildDocDT(window.DocsDT.dataFacture(f, { clientCode: (cl && cl.code) || '' }));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (!window.open(url, '_blank')) { const a = document.createElement('a'); a.href = url; a.download = f.number + '.pdf'; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (x) { toast(x.message, true); }
}

/* ---------- 0.10.1 : moyens de paiement — recherche par client (avances + règlements, chèques, effets, virements, scans) ---------- */
let BANQUES = null;
const banques = async () => BANQUES || (BANQUES = await api('GET', '/api/parametres/banques').catch(() => []));
ECRANS.moyensPaiement = async (m) => {
  if (exigeVis(m, 'Moyens de paiement', ['prix'])) return;
  const [L, B] = await Promise.all([api('GET', '/api/reglements/recherche'), banques()]);
  const clients = [...new Set(L.map((x) => x.client).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const modes = [...new Set(L.map((x) => x.mode).filter(Boolean))].sort();
  const F = { client: '', type: '', mode: '', banque: '', num: '', du: '', au: '', edu: '', eau: '', min: '', max: '', scan: '' };
  const sel = (k, opts, tout) => `<select data-f="${k}"><option value="">${tout}</option>${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
  m.innerHTML = entete('Moyens de paiement', 'Toutes les avances (commandes) et tous les règlements (factures) : chèques, effets, virements, espèces. Filtrez par client, banque, n° de document, dates, échéance ou montant ; double-cliquez une ligne pour voir le scan.',
    '<button class="btn ghost" data-act="mp-csv">Exporter (CSV)</button>') +
    `<div class="panneau filtres-mp"><div class="grille-f">
      <label>Client${sel('client', clients.map((c) => [c, c]), 'Tous les clients')}</label>
      <label>Type${sel('type', [['avance', 'Avance (commande)'], ['reglement', 'Règlement (facture)']], 'Tous')}</label>
      <label>Mode${sel('mode', modes.map((x) => [x, x]), 'Tous les modes')}</label>
      <label>Banque${sel('banque', B.map((b) => [b.code, b.nom]), 'Toutes les banques')}</label>
      <label>N° document<input data-f="num" type="search" placeholder="N° chèque, effet, virement, facture…"></label>
      <label>Date du<input data-f="du" type="date"></label><label>au<input data-f="au" type="date"></label>
      <label>Échéance du<input data-f="edu" type="date"></label><label>au<input data-f="eau" type="date"></label>
      <label>Montant min.<input data-f="min" type="number" step="0.001" min="0"></label><label>max.<input data-f="max" type="number" step="0.001" min="0"></label>
      <label>Scan${sel('scan', [['oui', 'Avec scan'], ['non', 'Sans scan']], 'Tous')}</label>
      <div class="pied-f"><button class="btn ghost sm" data-act="mp-raz">Effacer les filtres</button></div></div></div>
    <div id="mp-chiffres"></div><div class="panneau" style="overflow:auto" id="mp-liste"></div>`;
  const filtre = () => L.filter((x) => (!F.client || x.client === F.client) && (!F.type || x.type === F.type) && (!F.mode || x.mode === F.mode) && (!F.banque || x.banque === F.banque)
    && (!F.num || [x.numero_doc, x.doc_numero, x.recu].join(' ').toLowerCase().includes(F.num.toLowerCase()))
    && (!F.du || x.date >= F.du) && (!F.au || x.date <= F.au) && (!F.edu || (x.echeance && x.echeance >= F.edu)) && (!F.eau || (x.echeance && x.echeance <= F.eau))
    && (F.min === '' || x.montant >= +F.min) && (F.max === '' || x.montant <= +F.max) && (!F.scan || (F.scan === 'oui') === !!x.scan));
  let V = [];
  const dessiner = () => {
    V = filtre();
    const parDev = {}; for (const x of V) parDev[x.devise] = r3((parDev[x.devise] || 0) + x.montant);
    $('#mp-chiffres').innerHTML = `<div class="chiffres"><div class="chiffre"><b>${V.length}</b><span>moyen(s) de paiement</span></div>${Object.entries(parDev).map(([d, v]) => `<div class="chiffre"><b>${dt(v)}</b><span>total ${esc(d)}</span></div>`).join('')}
      <div class="chiffre ${V.some((x) => x.echeance && x.echeance > new Date().toISOString().slice(0, 10)) ? 'alerte' : ''}"><b>${V.filter((x) => x.echeance && x.echeance > new Date().toISOString().slice(0, 10)).length}</b><span>à échéance future</span></div><div class="chiffre"><b>${V.filter((x) => !x.scan).length}</b><span>sans scan</span></div></div>`;
    $('#mp-liste').innerHTML = V.length ? `<table class="nombres"><thead><tr><th>Date</th><th>Client</th><th>Type</th><th>Document</th><th>Mode</th><th>N° document</th><th>Banque</th><th>Échéance</th><th class="n">Montant</th><th>Scan</th></tr></thead><tbody>
      ${V.map((x, i) => `<tr class="cliquable" data-i="${i}"><td>${jour(x.date)}</td><td><b>${esc(x.client)}</b></td><td>${x.type === 'avance' ? 'Avance' : 'Règlement'}${x.origine === 'compta' ? ' <span class="mute small">(compta)</span>' : ''}</td><td class="mono small">${esc(x.doc_numero)}${x.recu ? `<div class="mute">reçu ${esc(x.recu)}</div>` : ''}</td>
        <td>${esc(x.mode)}</td><td class="mono small">${esc(x.numero_doc || '—')}</td><td>${esc(x.banque_nom || '—')}</td><td>${x.echeance ? jour(x.echeance) : '—'}</td><td class="n"><b>${dt(x.montant)}</b> ${x.devise !== 'DT' ? esc(x.devise) : ''}</td>
        <td>${x.scan ? `<button class="btn ghost sm" data-scan="${x.scan.id}" title="${esc(x.scan.nom)}">Voir</button>` : '<span class="mute small">—</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="vide">Aucun moyen de paiement ne correspond aux filtres.</div>';
  };
  const ouvrirScan = (id) => window.open('/api/fichiers/' + id, '_blank');
  m.oninput = m.onchange = (e) => { const k = e.target.dataset.f; if (k === undefined) return; F[k] = e.target.value; dessiner(); };
  m.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.scan) return ouvrirScan(b.dataset.scan);
    if (b.dataset.act === 'mp-raz') { for (const k of Object.keys(F)) F[k] = ''; m.querySelectorAll('[data-f]').forEach((x) => { x.value = ''; }); dessiner(); }
    if (b.dataset.act === 'mp-csv') csv('moyens-de-paiement.csv', [['Date', 'Client', 'Type', 'Document', 'Reçu', 'Mode', 'N° document', 'Banque', 'Échéance', 'Montant', 'Devise', 'Scan'],
      ...V.map((x) => [x.date, x.client, x.type === 'avance' ? 'Avance' : 'Règlement', x.doc_numero, x.recu || '', x.mode, x.numero_doc, x.banque_nom, x.echeance, nombreCsv(x.montant), x.devise, x.scan ? 'oui' : 'non'])]);
  };
  m.ondblclick = (e) => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const x = V[+tr.dataset.i]; if (x.scan) ouvrirScan(x.scan.id); else toast('Aucun scan pour ce moyen de paiement : ajoutez-le depuis la facture ou la commande (bouton « Scan »).', true); };
  dessiner();
};

/* ---------- BOM : produits du catalogue ---------- */
ECRANS.articles = async (m) => {
  if (!CAT_ERP) CAT_ERP = (await api('GET', '/api/infographie/catalogue')).catalogue;
  const c = CAT_ERP; const prods = c.catalog || [];
  const sections = {}; for (const p of prods) (sections[p.section || 'autre'] ||= []).push(p);
  const libSec = { haut: 'Hauts', bas: 'Bas', tete: 'Tête', accessoire: 'Accessoires', autre: 'Autres' };
  m.innerHTML = entete('Produits du catalogue', `${prods.length} produits · ${Object.keys(c.models || {}).length} modèles 3D. Chaque produit recevra sa nomenclature (tissus, fils, accessoires, marquage) au lot 7.`,
    peut('infographie.catalogue') ? `<a class="btn ghost" href="${lien('infographie', 'catalogue')}">Ouvrir le catalogue</a>` : '') +
    Object.entries(sections).map(([s, l]) => `<h3 class="titre-bloc">${esc(libSec[s] || s)}</h3><div class="panneau"><table><thead><tr><th>Produit</th><th>Famille</th><th class="masque-mobile">Modèle 3D</th><th class="masque-mobile">Zones de marquage</th><th>Nomenclature</th></tr></thead><tbody>
      ${l.map((p) => `<tr><td><b>${esc(p.name)}</b><div class="mute small mono">${esc(p.id)}</div></td><td>${esc(p.familyLabel || p.family || '—')}</td><td class="masque-mobile">${c.models?.[p.base] ? `<span class="etiq">${esc(p.base)}</span>` : '<span class="mute">—</span>'}</td>
        <td class="masque-mobile small">${Object.keys(p.print || {}).map((z) => `<span class="etiq">${esc({ front: 'devant', back: 'dos', left: 'manche G', right: 'manche D' }[z] || z)}</span>`).join('') || '—'}</td><td><span class="badge anc">lot 7</span></td></tr>`).join('')}
    </tbody></table></div>`).join('');
};

/* ---------- Registres : fournisseurs, articles matières ---------- */
const REG = {
  fournisseurs: { titre: 'Fournisseurs', droit: 'compta_fournisseurs.fournisseurs', un: 'fournisseur',
    sous: 'Fichier partagé : il servira aux commandes d’achat et aux factures fournisseurs (lot 8).',
    cols: [['code', 'Code', 'mono'], ['nom', 'Nom', 'b'], ['categorie', 'Catégorie'], ['contact', 'Contact'], ['telephone', 'Téléphone', 'mm'], ['ville', 'Ville', 'mm']],
    champs: [['nom', 'Raison sociale', { req: 1, w2: 1 }], ['code', 'Code (facultatif)', { ph: 'F001' }], ['categorie', 'Catégorie', { liste: ['Tissus', 'Fils', 'Accessoires', 'Emballages', 'Sous-traitance', 'Services', 'Autre'] }],
      ['contact', 'Contact'], ['telephone', 'Téléphone'], ['email', 'E-mail', { type: 'email' }], ['mf', 'Matricule fiscal'], ['adresse', 'Adresse', { w2: 1 }], ['ville', 'Ville'],
      ['conditions', 'Conditions de paiement', { ph: 'Ex. : 60 jours fin de mois' }], ['note', 'Note', { w2: 1 }]] },
  articles_mp: { titre: 'Articles matières', droit: 'stock_mp.articles', un: 'article',
    sous: 'Tissus, fils, accessoires et emballages. Les entrées, sorties et inventaires arrivent au lot 6.',
    cols: [['code', 'Code', 'mono'], ['designation', 'Désignation', 'b'], ['famille', 'Famille'], ['couleur', 'Couleur', 'mm'], ['unite', 'Unité'], ['stock_mini', 'Seuil mini', 'n'], ['fournisseur', 'Fournisseur', 'mm'], ['prix_achat', 'Prix d’achat (DT)', 'n prix']],
    champs: [['designation', 'Désignation', { req: 1, w2: 1, ph: 'Ex. : Sergé 65/35 240 g/m² laize 150' }], ['code', 'Code (facultatif)', { ph: 'MP001' }], ['famille', 'Famille', { liste: ['Tissu', 'Fil', 'Accessoire', 'Fermeture', 'Étiquette', 'Emballage', 'Autre'] }],
      ['unite', 'Unité', { req: 1, liste: ['m', 'kg', 'pièce', 'cône', 'rouleau', 'boîte'] }], ['couleur', 'Couleur / référence Pantone'], ['fournisseur', 'Fournisseur', { fourn: 1 }],
      ['stock_mini', 'Seuil minimum', { type: 'number' }], ['emplacement', 'Emplacement'], ['prix_achat', 'Prix d’achat (DT)', { type: 'number', vis: 'achats' }], ['note', 'Note', { w2: 1 }]] },
};
ECRANS.registre = async (m, d) => {
  const R = REG[d.reg];
  const lignes = await api('GET', '/api/registres/' + d.reg);
  let fourn = [];
  if (d.reg === 'articles_mp' && peut('compta_fournisseurs.fournisseurs')) { try { fourn = (await api('GET', '/api/registres/fournisseurs')).filter((x) => x.actif).map((x) => x.nom); } catch (_) { /* */ } }
  const cols = R.cols.filter((c) => !c[2]?.includes('prix') || voit('achats'));
  const cree = peut(R.droit, 'creer'), modif = peut(R.droit, 'modifier'), exp = peut(R.droit, 'exporter');
  m.innerHTML = entete(R.titre, `${lignes.filter((x) => x.actif).length} fiche(s) active(s). ${R.sous}`,
    `<div class="row-f">${rechercheHtml()}${exp ? '<button class="btn ghost" data-rg="csv">CSV</button>' : ''}${cree ? `<button class="btn cta" data-rg="nouveau">+ Nouveau ${R.un}</button>` : ''}</div>`) +
    `<label class="chk-l"><input type="checkbox" id="inactifs"> Afficher les fiches désactivées</label><div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), ina = $('#inactifs').checked;
    const l = lignes.filter((x) => (ina || x.actif) && (!q || JSON.stringify(x).toLowerCase().includes(q)));
    $('#liste').innerHTML = l.length ? `<table><thead><tr>${cols.map((c) => `<th class="${c[2]?.includes('n') && !c[2]?.includes('mono') ? 'n' : ''} ${c[2]?.includes('mm') ? 'masque-mobile' : ''}">${esc(c[1])}</th>`).join('')}<th></th></tr></thead><tbody>
      ${l.map((x) => `<tr class="cliquable ${x.actif ? '' : 'inactif-l'}" data-id="${x.id}">${cols.map((c) => { const v = x[c[0]]; const cl = c[2] || ''; return `<td class="${cl.includes('mono') ? 'mono small' : ''} ${cl.includes('n') && !cl.includes('mono') ? 'n' : ''} ${cl.includes('mm') ? 'masque-mobile' : ''}">${v === undefined || v === '' ? '<span class="mute">—</span>' : cl.includes('prix') ? dt(v) : cl.includes('b') ? `<b>${esc(v)}</b>` : esc(v)}</td>`; }).join('')}
        <td>${x.actif ? '' : '<span class="badge anc">désactivé</span>'}</td></tr>`).join('')}</tbody></table>` : `<div class="vide">${lignes.length ? 'Aucune fiche ne correspond.' : `Aucune fiche pour l’instant.${cree ? ' Cliquez sur « + Nouveau ».' : ''}`}</div>`;
  };
  $('#recherche').oninput = dess; $('#inactifs').onchange = dess; dess();
  const formulaire = (x) => {
    const ro = x ? !modif : !cree;
    const ch = R.champs.filter(([, , o = {}]) => !o.vis || voit(o.vis));
    grandeFenetre(`<h3>${x ? esc(x.nom || x.designation) : 'Nouveau ' + R.un}</h3><div class="msg err" hidden role="alert"></div>
      <div class="grille2">${ch.map(([k, l, o = {}]) => {
        const v = x?.[k] ?? '';
        const liste = o.fourn ? fourn : o.liste;
        const inp = `<input id="rg-${k}" name="${k}" ${o.type ? `type="${o.type}" ${o.type === 'number' ? 'step="any" min="0" inputmode="decimal"' : ''}` : ''} value="${esc(v)}" ${o.req ? 'required' : ''} maxlength="300" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${liste ? `list="dl-${k}"` : ''} ${ro ? 'disabled' : ''}>${liste ? `<datalist id="dl-${k}">${liste.map((z) => `<option value="${esc(z)}">`).join('')}</datalist>` : ''}`;
        return `<div class="champ" ${o.w2 ? 'style="grid-column:1/-1"' : ''}><label for="rg-${k}">${esc(l)}${o.req ? ' *' : ''}</label>${inp}</div>`;
      }).join('')}</div>
      ${x && !ro ? `<label class="chk-l"><input type="checkbox" name="actif" ${x.actif ? 'checked' : ''}> Fiche active (décochez pour la désactiver : elle reste dans l’historique)</label>` : ''}
      ${x ? `<p class="mute small">Modifiée le ${date(x.maj_le)} · version ${x.version}</p>` : ''}
      <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>${ro ? 'Fermer' : 'Annuler'}</button>${ro ? '' : '<button class="btn" value="ok">Enregistrer</button>'}</div>`, async (f) => {
      if (ro) return true;
      const body = {};
      for (const [k, , o = {}] of ch) { const v = f[k].value.trim(); if (o.type === 'number') { if (v !== '') body[k] = Number(v.replace(',', '.')); } else body[k] = v; }
      if (x) { body.version = x.version; body.actif = f.actif.checked; await api('PUT', `/api/registres/${d.reg}/${x.id}`, body); toast('Fiche enregistrée.'); }
      else { await api('POST', '/api/registres/' + d.reg, body); toast('Fiche créée.'); }
      route(); return true;
    });
  };
  m.onclick = (e) => {
    const a = e.target.closest('[data-rg]');
    if (a?.dataset.rg === 'nouveau') return formulaire(null);
    if (a?.dataset.rg === 'csv') return csv(`${d.reg}-${new Date().toISOString().slice(0, 10)}.csv`, [[...R.champs.filter(([, , o = {}]) => !o.vis || voit(o.vis)).map((c) => c[1]), 'Active'], ...lignes.map((x) => [...R.champs.filter(([, , o = {}]) => !o.vis || voit(o.vis)).map(([k]) => x[k] ?? ''), x.actif ? 'oui' : 'non'])]);
    const tr = e.target.closest('tr[data-id]'); if (tr) formulaire(lignes.find((x) => x.id === +tr.dataset.id));
  };
};

/* ---------- Sauvegardes ---------- */
ECRANS.sauvegardes = async (m) => {
  const s = await api('GET', '/api/sauvegardes');
  const derniere = s.base[0];
  const age = derniere ? (Date.now() - new Date(derniere.date)) / 3600000 : null;
  const bloc = (t, l) => `<h3 class="titre-bloc">${t}</h3><div class="panneau">${l.length ? `<table><thead><tr><th>Fichier</th><th>Date</th><th class="n">Taille</th></tr></thead><tbody>${l.slice(0, 10).map((x) => `<tr><td class="mono small">${esc(x.nom)}</td><td>${date(x.date)}</td><td class="n">${taille(x.taille)}</td></tr>`).join('')}</tbody></table>${l.length > 10 ? `<p class="mute small" style="padding:8px 14px;margin:0">… et ${l.length - 10} plus ancienne(s).</p>` : ''}` : '<div class="vide">Aucune copie trouvée.</div>'}</div>`;
  m.innerHTML = entete('Sauvegardes', `Copie automatique chaque nuit à ${esc(s.heure)} · conservation ${s.conservation_jours} jours · restauration testée ${esc(s.restauration_testee)}.`) +
    `<div class="chiffres"><div class="chiffre ${age === null || age > 30 ? 'alerte' : ''}"><b>${derniere ? date(derniere.date) : 'aucune'}</b><span>dernière copie de la base</span></div>
      <div class="chiffre"><b>${s.base.length}</b><span>copies de la base</span></div><div class="chiffre"><b>${s.fichiers.length}</b><span>copies des fichiers (modèles 3D…)</span></div><div class="chiffre"><b>${s.code.length}</b><span>copies du code source</span></div></div>
    <div class="msg info">Les copies sont sur le serveur. La copie hors du serveur (second site) reste à mettre en place : c’est noté dans les points en attente. La restauration se fait par le Super administrateur, en suivant le guide serveur.</div>` +
    bloc('Base de données', s.base) + bloc('Fichiers', s.fichiers) + bloc('Code source', s.code);
};

/* ================================================================ 0.7.0 — COMPTABILITÉ (réponses du comptable du 21/10/2026)
   Exports au choix CSV ou Excel · factures export en EUR / USD (TVA 0 %) · retenue à la source à part (module 11) · CMUP. */
const DEV_DEC = (d) => (d === 'EUR' || d === 'USD' ? 2 : 3);
const md = (v, d = 'DT') => (+v || 0).toLocaleString('fr-FR', { minimumFractionDigits: DEV_DEC(d), maximumFractionDigits: DEV_DEC(d) }) + ' ' + d;
const devF = (f) => (f.currency === 'EUR' || f.currency === 'USD' ? f.currency : 'DT');
const iso = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const debutAnnee = () => new Date().getFullYear() + '-01-01';
const NATURES_RAS = { achats: 'Achats de biens et services', honoraires: 'Honoraires (sociétés / régime réel)', honoraires_autres: 'Honoraires (autres)', loyers: 'Loyers', autre: 'Autre (taux saisi)', ventes: 'Ventes (retenue subie)' };
const CATEG_FF = { achats: 'Achats matières', services: 'Services extérieurs', honoraires: 'Honoraires', loyers: 'Loyers', autres_charges: 'Autres charges' };
let OPTIONS_C = null;
async function optionsCompta() { if (!OPTIONS_C) OPTIONS_C = await api('GET', '/api/compta/options'); return OPTIONS_C; }

// Export : téléchargement direct (cookie de session) au format choisi
function boutonsExport(cle, url, droitOk = true) {
  if (!droitOk) return '';
  return `<div class="exp-g" data-exp="${cle}" data-url="${esc(url)}"><span class="mute small">Exporter</span><button class="btn ghost sm" data-fmt="xlsx">Excel</button><button class="btn ghost sm" data-fmt="csv">CSV</button></div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.exp-g [data-fmt]'); if (!b) return;
  const g = b.closest('.exp-g'); let u = g.dataset.url;
  const du = $('#per-du')?.value, au = $('#per-au')?.value;
  const q = new URLSearchParams({ format: b.dataset.fmt }); if (du) q.set('du', du); if (au) q.set('au', au);
  const a = document.createElement('a'); a.href = u + (u.includes('?') ? '&' : '?') + q; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  toast('Export ' + (b.dataset.fmt === 'csv' ? 'CSV' : 'Excel') + ' en cours de téléchargement.');
});
const periodeHtml = (du = debutAnnee(), au = iso()) => `<div class="champ" style="margin:0"><input type="date" id="per-du" value="${du}" aria-label="Du"></div><span class="mute">→</span><div class="champ" style="margin:0"><input type="date" id="per-au" value="${au}" aria-label="Au"></div>`;
const exigeVis = (m, titre, vis) => { const manque = vis.filter((v) => !voit(v)); if (!manque.length) return false; m.innerHTML = entete(titre, '') + `<div class="panneau"><div class="vide">Cet écran contient des montants : il demande le droit de voir ${manque.map((v) => ({ prix: 'les prix', encours: 'les encours clients', achats: 'les prix d’achat', couts: 'les coûts de revient' }[v])).join(' et ')}.</div></div>`; return true; };
const bandeauComptable = (t) => `<div class="msg info small" style="margin-bottom:14px">${t}</div>`;

/* ---------- Articles et prestations hors Studio (Commercial, Comptabilité) ---------- */
ECRANS.articlesVente = async (m) => {
  const L = await api('GET', '/api/commercial/articles');
  const cree = peut('commercial.articles', 'creer') && voit('prix'), modif = peut('commercial.articles', 'modifier') && voit('prix');
  m.innerHTML = entete('Articles et prestations', `${L.filter((x) => x.actif).length} actif(s). Produits et prestations vendus <b>sans passer par le Studio 3D ni par une fiche technique</b> : transport, réassort, articles neutres, retouches… Ils se choisissent dans les lignes de commande et de facture de la Gestion.`,
    `<div class="row-f">${rechercheHtml()}${cree ? '<button class="btn cta" data-av="nouveau">+ Nouvel article</button>' : ''}</div>`) +
    `<label class="chk-l"><input type="checkbox" id="inactifs"> Afficher les articles désactivés</label><div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), ina = $('#inactifs').checked;
    const l = L.filter((x) => (ina || x.actif) && (!q || JSON.stringify(x).toLowerCase().includes(q)));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>Code</th><th>Désignation</th><th>Type</th><th>Unité</th>${voit('prix') ? '<th class="n">Prix HT</th><th class="n">TVA</th><th class="n">Prix TTC</th>' : ''}<th class="masque-mobile">Compte</th><th></th></tr></thead><tbody>
      ${l.map((a) => `<tr class="cliquable ${a.actif ? '' : 'inactif-l'}" data-id="${a.id}"><td class="mono small"><b>${esc(a.code)}</b></td><td>${esc(a.designation)}</td><td><span class="etiq">${a.type === 'prestation' ? 'Prestation' : 'Produit'}</span></td><td>${esc(a.unite)}</td>
        ${voit('prix') ? `<td class="n">${dt(a.prix_ht)}</td><td class="n">${a.tva} %</td><td class="n"><b>${dt(r3(a.prix_ht * (1 + a.tva / 100)))}</b></td>` : ''}<td class="masque-mobile mono small">${esc(a.compte || '—')}</td><td>${a.actif ? '' : '<span class="badge anc">désactivé</span>'}</td></tr>`).join('')}</tbody></table>`
      : `<div class="vide">${L.length ? 'Aucun article ne correspond.' : 'Aucun article pour l’instant.' + (cree ? ' Cliquez sur « + Nouvel article ».' : '')}</div>`;
  };
  $('#recherche').oninput = dess; $('#inactifs').onchange = dess; dess();
  const form = (a) => {
    const ro = a ? !modif : !cree;
    grandeFenetre(`<h3>${a ? esc(a.designation) : 'Nouvel article ou prestation'}</h3><div class="msg err" hidden role="alert"></div>
      <div class="grille2">
        <div class="champ"><label for="av-code">Code *</label><input id="av-code" name="code" required maxlength="30" value="${esc(a?.code || '')}" placeholder="TRANSP" ${ro ? 'disabled' : ''}></div>
        <div class="champ"><label for="av-type">Type</label><select id="av-type" name="type" ${ro ? 'disabled' : ''}><option value="produit">Produit (se livre)</option><option value="prestation" ${a?.type === 'prestation' ? 'selected' : ''}>Prestation (ne se livre pas)</option></select></div>
        <div class="champ" style="grid-column:1/-1"><label for="av-des">Désignation *</label><input id="av-des" name="designation" required maxlength="200" value="${esc(a?.designation || '')}" placeholder="Ex. : Transport Sousse, Polo blanc sans marquage" ${ro ? 'disabled' : ''}></div>
        <div class="champ"><label for="av-un">Unité</label><input id="av-un" name="unite" maxlength="20" value="${esc(a?.unite || 'pièce')}" list="dl-un" ${ro ? 'disabled' : ''}><datalist id="dl-un">${['pièce', 'forfait', 'heure', 'm', 'kg', 'lot'].map((x) => `<option value="${x}">`).join('')}</datalist></div>
        <div class="champ"><label for="av-cpt">Compte de produit (facultatif)</label><input id="av-cpt" name="compte" maxlength="10" inputmode="numeric" value="${esc(a?.compte || '')}" placeholder="706" ${ro ? 'disabled' : ''}></div>
        <div class="champ"><label for="av-pht">Prix unitaire HT (DT)</label><input id="av-pht" name="prix_ht" type="number" step="0.001" min="0" value="${a?.prix_ht ?? ''}" ${ro ? 'disabled' : ''}></div>
        <div class="champ"><label for="av-tva">TVA (%)</label><input id="av-tva" name="tva" type="number" step="0.5" min="0" max="100" value="${a?.tva ?? 19}" ${ro ? 'disabled' : ''}></div>
        <div class="champ" style="grid-column:1/-1"><label for="av-note">Note</label><input id="av-note" name="note" maxlength="300" value="${esc(a?.note || '')}" ${ro ? 'disabled' : ''}></div></div>
      ${a && !ro ? `<label class="chk-l"><input type="checkbox" name="actif" ${a.actif ? 'checked' : ''}> Article actif (décochez pour le retirer des listes : il reste sur les documents déjà émis)</label>` : ''}
      <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>${ro ? 'Fermer' : 'Annuler'}</button>${ro ? '' : '<button class="btn" value="ok">Enregistrer</button>'}</div>`, async (f) => {
      if (ro) return true;
      const body = { code: f.code.value.trim(), designation: f.designation.value.trim(), type: f.type.value, unite: f.unite.value.trim() || 'pièce', compte: f.compte.value.trim(),
        prix_ht: Number(String(f.prix_ht.value || 0).replace(',', '.')), tva: Number(String(f.tva.value || 0).replace(',', '.')), note: f.note.value.trim() };
      if (a) { body.version = a.version; body.actif = f.actif.checked; await api('PUT', '/api/commercial/articles/' + a.id, body); toast('Article enregistré.'); }
      else { await api('POST', '/api/commercial/articles', body); toast('Article créé : il est disponible dans la Gestion (« + Ajouter une ligne »).'); }
      route(); return true;
    });
  };
  m.onclick = (e) => { if (e.target.closest('[data-av=nouveau]')) return form(null); const tr = e.target.closest('tr[data-id]'); if (tr) form(L.find((x) => x.id === +tr.dataset.id)); };
};

/* ---------- Comptabilité clients : encaissements et lettrage ---------- */
const ST_ENC = { valide: ['Encaissé', 'vig'], portefeuille: ['En portefeuille', 'fut'], remis: ['Remis en banque', 'vig'], impaye: ['Impayé', 'ret'], annule: ['Annulé', 'anc'] };
ECRANS.encaissements = async (m) => {
  if (exigeVis(m, 'Encaissements et lettrage', ['prix', 'encours'])) return;
  const [L, g, opt] = await Promise.all([api('GET', '/api/compta/encaissements'), gestion(true), optionsCompta(), banques()]);
  const cree = peut('compta_clients.lettrage', 'creer'), ann = peut('compta_clients.lettrage', 'annuler');
  const pf = L.filter((x) => x.statut === 'portefeuille');
  m.innerHTML = entete('Encaissements et lettrage', 'Un paiement du client solde une ou plusieurs factures. La part retenue à la source par le client est enregistrée à part (Comptabilité générale › Retenues). Les règlements apparaissent aussi dans la facture (Gestion).',
    `<div class="row-f">${rechercheHtml('Client, n°, référence…')}<div class="champ" style="margin:0"><select id="filtre"><option value="">Tous</option>${Object.entries(ST_ENC).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select></div>${cree ? '<button class="btn cta" data-en="nouveau">+ Encaissement</button>' : ''}</div>`) +
    `<div class="chiffres"><div class="chiffre"><b>${L.filter((x) => !['annule', 'impaye'].includes(x.statut)).length}</b><span>encaissement(s) enregistrés</span></div>
      <div class="chiffre ${pf.length ? 'alerte' : ''}"><b>${pf.length}</b><span>chèque(s) / effet(s) en portefeuille</span></div>
      <div class="chiffre"><b>${md(pf.filter((x) => x.devise === 'DT').reduce((s, x) => s + x.montant, 0))}</b><span>à remettre en banque</span></div>
      <div class="chiffre ${L.some((x) => x.statut === 'impaye') ? 'alerte' : ''}"><b>${L.filter((x) => x.statut === 'impaye').length}</b><span>impayé(s)</span></div></div>
    <div class="panneau" id="liste" style="overflow:auto"></div>`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), f = $('#filtre').value;
    const l = L.filter((x) => (!f || x.statut === f) && (!q || JSON.stringify([x.numero, x.client_nom, x.reference, x.affectations.map((a) => a.numero)]).toLowerCase().includes(q)));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Mode</th><th class="masque-mobile">Factures lettrées</th><th class="n">Montant</th><th class="n masque-mobile">Retenue</th><th>État</th><th></th></tr></thead><tbody>
      ${l.map((x) => { const ras = x.affectations.reduce((s, a) => s + a.retenue, 0); return `<tr><td class="mono small"><b>${esc(x.numero)}</b></td><td>${jour(x.date)}</td><td>${esc(x.client_nom)}</td>
        <td>${esc(x.mode)}${x.reference ? `<div class="mute small">${esc(x.reference)}</div>` : ''}${x.echeance ? `<div class="mute small">échéance ${jour(x.echeance)}</div>` : ''}</td>
        <td class="masque-mobile small">${x.affectations.map((a) => `<span class="etiq">${esc(a.numero)}</span>`).join(' ') || '<span class="mute">—</span>'}</td>
        <td class="n"><b>${md(x.montant, x.devise)}</b></td><td class="n masque-mobile">${ras ? md(ras, x.devise) : '—'}</td>
        <td><span class="badge ${ST_ENC[x.statut][1]}">${ST_ENC[x.statut][0]}</span>${x.motif ? `<div class="mute small">${esc(x.motif)}</div>` : ''}</td>
        <td>${ann ? `<div class="actions">${x.statut === 'portefeuille' ? `<button class="btn ghost sm" data-en="remis" data-id="${x.id}">Remis en banque</button>` : ''}${['valide', 'portefeuille', 'remis'].includes(x.statut) ? `${['Chèque', 'Traite', 'Effet'].includes(x.mode) ? `<button class="btn ghost sm" data-en="impaye" data-id="${x.id}">Impayé</button>` : ''}<button class="btn ghost sm" data-en="annule" data-id="${x.id}">Annuler</button>` : ''}</div>` : ''}</td></tr>`; }).join('')}</tbody></table>`
      : `<div class="vide">${L.length ? 'Aucun encaissement pour ce filtre.' : 'Aucun encaissement enregistré pour l’instant.'}</div>`;
  };
  $('#recherche').oninput = dess; $('#filtre').onchange = dess; dess();
  const nouveau = async () => {
    const clients = g.clients.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const avecDu = clients.filter((c) => g.invoices.some((f) => f.status !== 'annulee' && f.client?.id === c.id && r3(totauxFacture(f).net - regleFacture(f)) > 0.0005));
    grandeFenetre(`<h3>Nouvel encaissement</h3><div class="msg err" hidden role="alert"></div>
      <div class="grille2"><div class="champ" style="grid-column:1/-1"><label for="en-cl">Client</label><select id="en-cl" name="client" required><option value="">— Choisir (clients avec un reste à payer) —</option>${avecDu.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="champ"><label for="en-date">Date</label><input type="date" id="en-date" name="date" value="${iso()}" required></div>
        <div class="champ"><label for="en-mode">Mode</label><select id="en-mode" name="mode">${opt.modes.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div>
        <div class="champ"><label for="en-ref">Référence (n° chèque, virement…)</label><input id="en-ref" name="reference" maxlength="60"></div>
        <div class="champ"><label for="en-bq">Banque du client</label><input id="en-bq" name="banque" maxlength="60" list="en-bql" autocomplete="off"><datalist id="en-bql">${(BANQUES || []).map((b) => `<option value="${esc(b.nom)}">`).join('')}</datalist></div>
        <div class="champ" id="en-ech-c" hidden><label for="en-ech">Échéance du chèque / de l’effet</label><input type="date" id="en-ech" name="echeance"></div></div>
      <div id="en-f"><div class="vide small">Choisissez le client pour voir ses factures à régler.</div></div>
      <div class="pied"><span class="mute small" id="en-tot" style="margin-right:auto"></span><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer l’encaissement</button></div>`, async (f) => {
      const aff = [...f.querySelectorAll('tr[data-fac]')].map((tr) => ({ facture_id: tr.dataset.fac, montant: Number(tr.querySelector('[data-k=m]').value || 0), retenue: Number(tr.querySelector('[data-k=r]').value || 0) })).filter((a) => a.montant + a.retenue > 0);
      if (!f.client.value) throw new Error('Choisissez le client.');
      if (!aff.length) throw new Error('Indiquez au moins un montant à affecter.');
      const body = { client_id: f.client.value, date: f.date.value, mode: f.mode.value, reference: f.reference.value.trim(), banque: f.banque.value.trim(), affectations: aff };
      if (f.echeance.value) body.echeance = f.echeance.value;
      const r = await api('POST', '/api/compta/encaissements', body);
      toast(`Encaissement ${r.numero} enregistré${r.retenue ? ` (dont retenue à la source ${dt(r.retenue)})` : ''}${r.statut === 'portefeuille' ? ' · en portefeuille jusqu’à l’échéance' : ''}.`);
      GEST = null; versCadres({ type: 'rafraichir' }); route(); return true;
    });
    const fm = $('#fen-form');
    const tauxRas = (opt.options.find((x) => x.code === 'ras_achats') || {}).valeur;
    fm.mode.onchange = () => { $('#en-ech-c').hidden = !['Chèque', 'Traite', 'Effet'].includes(fm.mode.value); };
    const total = () => { let s = 0, r = 0; fm.querySelectorAll('tr[data-fac]').forEach((tr) => { s += +tr.querySelector('[data-k=m]').value || 0; r += +tr.querySelector('[data-k=r]').value || 0; }); $('#en-tot').innerHTML = `Montant encaissé : <b>${dt(r3(s))}</b>${r ? ` · retenue : <b>${dt(r3(r))}</b>` : ''}`; };
    fm.client.onchange = async () => {
      const z = $('#en-f'); if (!fm.client.value) { z.innerHTML = ''; return; }
      const F = (await api('GET', `/api/compta/clients/${encodeURIComponent(fm.client.value)}/factures`)).filter((x) => x.reste > 0.0005);
      z.innerHTML = F.length ? `<div class="panneau" style="max-height:40vh;overflow:auto;margin-bottom:10px"><table class="nombres"><thead><tr><th>Facture</th><th>Échéance</th><th class="n">Reste</th><th class="n">Payé</th><th class="n">Retenue à la source</th><th></th></tr></thead><tbody>
        ${F.map((x) => `<tr data-fac="${esc(x.id)}" data-reste="${x.reste}" data-net="${x.net}"><td class="mono small"><b>${esc(x.numero)}</b><div class="mute">${esc(x.devise)}</div></td><td>${jour(x.echeance)}</td><td class="n">${md(x.reste, x.devise)}</td>
          <td class="n"><input data-k="m" type="number" step="0.001" min="0" max="${x.reste}" value="0" style="width:110px"></td><td class="n"><input data-k="r" type="number" step="0.001" min="0" value="0" style="width:96px"></td>
          <td><div class="actions"><button type="button" class="btn ghost sm" data-tout>Tout</button><button type="button" class="btn ghost sm" data-ras title="Le client retient ${tauxRas || 1.5} % sur le TTC">− RAS ${tauxRas || 1.5} %</button></div></td></tr>`).join('')}</tbody></table></div>
        <p class="mute small">« Tout » solde la facture. « − RAS » : le client a retenu ${tauxRas || 1.5} % du montant TTC (taux de Paramètres › Fiscalité) ; réclamez-lui le certificat de retenue.</p>` : '<div class="vide small">Ce client n’a aucune facture à régler.</div>';
      z.oninput = total;
      z.onclick = (e) => {
        const tr = e.target.closest('tr[data-fac]'); if (!tr) return;
        const reste = +tr.dataset.reste, net = +tr.dataset.net;
        if (e.target.closest('[data-tout]')) { const r = +tr.querySelector('[data-k=r]').value || 0; tr.querySelector('[data-k=m]').value = r3(Math.max(0, reste - r)); }
        if (e.target.closest('[data-ras]')) { const r = Math.min(reste, r3(net * (+tauxRas || 1.5) / 100)); tr.querySelector('[data-k=r]').value = r; tr.querySelector('[data-k=m]').value = r3(Math.max(0, reste - r)); }
        total();
      };
      total();
    };
  };
  m.onclick = async (e) => {
    const b = e.target.closest('[data-en]'); if (!b) return;
    if (b.dataset.en === 'nouveau') return nouveau();
    const x = L.find((y) => y.id === +b.dataset.id), st = b.dataset.en;
    let motif = '';
    if (st !== 'remis') {
      grandeFenetre(`<h3>${st === 'impaye' ? 'Déclarer un impayé' : 'Annuler l’encaissement'} ${esc(x.numero)}</h3><div class="msg err" hidden role="alert"></div>
        <p>${md(x.montant, x.devise)} · ${esc(x.client_nom)}. Les factures lettrées redeviennent dues et la retenue éventuelle est annulée. L’encaissement reste dans l’historique.</p>
        <div class="champ"><label for="en-mot">Motif *</label><input id="en-mot" name="motif" required maxlength="300" placeholder="${st === 'impaye' ? 'Ex. : chèque rejeté, provision insuffisante' : 'Ex. : erreur de saisie'}"></div>
        <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Retour</button><button class="btn danger" value="ok">Confirmer</button></div>`, async (f) => {
        motif = f.motif.value.trim(); if (!motif) throw new Error('Le motif est obligatoire.');
        await api('POST', `/api/compta/encaissements/${x.id}/statut`, { statut: st, motif, version: x.version });
        toast(st === 'impaye' ? 'Impayé enregistré : pensez à relancer le client.' : 'Encaissement annulé.'); GEST = null; versCadres({ type: 'rafraichir' }); route(); return true;
      });
      return;
    }
    try { await api('POST', `/api/compta/encaissements/${x.id}/statut`, { statut: 'remis', version: x.version }); toast('Remise en banque enregistrée.'); route(); } catch (x2) { toast(x2.message, true); }
  };
};

/* ---------- Comptabilité clients : relances ---------- */
const NIVEAUX = { 1: 'Rappel amiable', 2: 'Relance', 3: 'Mise en demeure' };
ECRANS.relances = async (m) => {
  if (exigeVis(m, 'Relances', ['prix', 'encours'])) return;
  const [H, g] = await Promise.all([api('GET', '/api/compta/relances'), gestion(true)]);
  const cree = peut('compta_clients.relances', 'creer');
  const auj = iso();
  const par = new Map();
  for (const f of g.invoices.filter((x) => x.status !== 'annulee')) {
    const reste = r3(totauxFacture(f).net - regleFacture(f)); const ech = f.due || f.date;
    if (reste <= 0.0005 || ech >= auj) continue;
    const k = f.client?.id; if (!par.has(k)) par.set(k, { id: k, nom: f.client?.name || '?', fs: [], max: 0 });
    const c = par.get(k); c.fs.push({ f, reste, j: Math.round((new Date(auj) - new Date(ech)) / 86400000) }); c.max = Math.max(c.max, c.fs.at(-1).j);
  }
  const L = [...par.values()].sort((a, b) => b.max - a.max);
  const dern = (id) => H.find((h) => h.client_id === id);
  m.innerHTML = entete('Relances', 'Clients ayant des factures échues non soldées. Niveaux : 1 rappel amiable, 2 relance, 3 mise en demeure. Chaque relance est conservée dans l’historique.') +
    `<div class="panneau" style="overflow:auto">${L.length ? `<table class="nombres"><thead><tr><th>Client</th><th class="n">Factures échues</th><th class="n">Reste dû</th><th class="n">Retard max.</th><th>Dernière relance</th><th></th></tr></thead><tbody>
      ${L.map((c) => { const d = dern(c.id); const devs = [...new Set(c.fs.map((x) => devF(x.f)))]; return `<tr><td><b>${esc(c.nom)}</b></td><td class="n">${c.fs.length}</td><td class="n"><b>${devs.map((dv) => md(c.fs.filter((x) => devF(x.f) === dv).reduce((s, x) => s + x.reste, 0), dv)).join('<br>')}</b></td>
        <td class="n rouge">${c.max} j</td><td>${d ? `<span class="badge ${d.niveau === 3 ? 'ret' : 'fut'}">${NIVEAUX[d.niveau]}</span> <span class="mute small">${jour(d.date)} · ${esc(d.canal)}</span>` : '<span class="mute">aucune</span>'}</td>
        <td>${cree ? `<button class="btn ghost sm" data-rl="${esc(c.id)}" data-niv="${Math.min(3, (d?.niveau || 0) + 1)}">Relancer (niveau ${Math.min(3, (d?.niveau || 0) + 1)})</button>` : ''}</td></tr>`; }).join('')}</tbody></table>` : '<div class="vide">Aucune facture échue non soldée. Rien à relancer.</div>'}</div>
    <h3 class="titre-bloc">Historique des relances</h3><div class="panneau" style="overflow:auto">${H.length ? `<table class="nombres"><thead><tr><th>Date</th><th>Client</th><th>Niveau</th><th>Canal</th><th class="masque-mobile">Factures</th><th class="n">Montant</th><th class="masque-mobile">Par</th></tr></thead><tbody>
      ${H.map((h) => `<tr><td>${jour(h.date)}</td><td>${esc(h.client_nom)}</td><td>${NIVEAUX[h.niveau]}</td><td>${esc(h.canal)}</td><td class="masque-mobile small">${h.factures.map((x) => esc(x.numero)).join(', ')}</td><td class="n">${md(h.montant, h.devise === 'mixte' ? 'DT' : h.devise)}</td><td class="masque-mobile mono small">${esc(h.cree_par || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="vide">Aucune relance enregistrée.</div>'}</div>`;
  m.onclick = (e) => {
    const b = e.target.closest('[data-rl]'); if (!b) return;
    const c = L.find((x) => x.id === b.dataset.rl), niv = +b.dataset.niv;
    const lettre = `Madame, Monsieur,\n\nSauf erreur de notre part, les factures suivantes restent impayées à ce jour :\n${c.fs.map((x) => `- ${x.f.number} du ${jour(x.f.date)}, échue le ${jour(x.f.due || x.f.date)} : ${md(x.reste, devF(x.f))}`).join('\n')}\n\n${niv === 3 ? 'À défaut de règlement sous huit jours, nous nous verrons contraints d’engager une procédure de recouvrement.' : niv === 2 ? 'Nous vous remercions de procéder au règlement dans les meilleurs délais.' : 'Nous vous remercions de bien vouloir vérifier et procéder au règlement.'}\nSi votre paiement est en cours, merci de ne pas tenir compte de ce message.\n\nCordialement,\nDIGITAL-TEX S.A.`;
    grandeFenetre(`<h3>${NIVEAUX[niv]} · ${esc(c.nom)}</h3><div class="msg err" hidden role="alert"></div>
      <div class="grille2"><div class="champ"><label for="rl-niv">Niveau</label><select id="rl-niv" name="niveau">${[1, 2, 3].map((n) => `<option value="${n}" ${n === niv ? 'selected' : ''}>${n} · ${NIVEAUX[n]}</option>`).join('')}</select></div>
        <div class="champ"><label for="rl-can">Canal</label><select id="rl-can" name="canal"><option value="email">E-mail</option><option value="courrier">Courrier</option><option value="telephone">Téléphone</option><option value="visite">Visite</option></select></div></div>
      <div class="champ"><label for="rl-txt">Texte proposé (à copier dans votre e-mail ou courrier)</label><textarea id="rl-txt" rows="10" style="width:100%;border:1px solid var(--rule);border-radius:10px;padding:10px 12px;font:inherit">${esc(lettre)}</textarea></div>
      <div class="champ"><label for="rl-note">Note interne (facultatif)</label><input id="rl-note" name="note" maxlength="500" placeholder="Ex. : promesse de paiement pour le 30"></div>
      <div class="pied"><button type="button" class="btn ghost" id="rl-copier">Copier le texte</button><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer la relance</button></div>`, async (f) => {
      await api('POST', '/api/compta/relances', { client_id: c.id, niveau: +f.niveau.value, canal: f.canal.value, note: f.note.value.trim() });
      toast('Relance enregistrée dans l’historique.'); route(); return true;
    });
    $('#rl-copier').onclick = async () => { try { await navigator.clipboard.writeText($('#rl-txt').value); toast('Texte copié.'); } catch (_) { $('#rl-txt').select(); toast('Sélectionnez le texte puis Ctrl+C.'); } };
  };
};

/* ---------- Comptabilité clients : exports (remplace l'écran CSV de la 0.5.0) ---------- */
ECRANS.journalVentes = async (m) => {
  if (exigeVis(m, 'Exports comptables', ['prix'])) return;
  const g = await gestion(true);
  const exp = peut('compta_clients.exports', 'exporter'), expB = peut('compta_clients.comptes', 'exporter') && voit('encours');
  m.innerHTML = entete('Journal des ventes', 'Une ligne par facture : HT, FODEC, TVA, timbre, net, réglé, reste. Bouton « PDF » : facture au format DIGITAL-TEX. Les factures export (EUR / USD, TVA 0 %) gardent leur devise : pas d’écart de change (réponse du comptable).',
    `<div class="row-f">${periodeHtml()}${boutonsExport('ventes', '/api/compta/export/ventes', exp)}</div>`) +
    (expB ? `<div class="row-f" style="margin:-6px 0 14px"><span class="mute small">Balance âgée clients :</span>${boutonsExport('bal', '/api/compta/export/balance-clients')}</div>` : '') +
    '<div class="panneau" id="liste" style="overflow:auto"></div>';
  const dess = () => {
    const du = $('#per-du').value, au = $('#per-au').value;
    const l = g.invoices.filter((f) => (!du || f.date >= du) && (!au || f.date <= au)).sort((a, b) => (a.number || '').localeCompare(b.number || '')).map((f) => ({ f, t: totauxFacture(f), d: devF(f) }));
    const ok = l.filter((x) => x.f.status !== 'annulee'); const devs = [...new Set(ok.map((x) => x.d))];
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>Date</th><th>Facture</th><th>Client</th><th class="masque-mobile">MF client</th><th class="n">HT</th><th class="n">FODEC</th><th class="n">TVA</th><th class="n">Timbre</th><th class="n">Net</th><th>État</th></tr></thead><tbody>
      ${l.map(({ f, t, d }) => `<tr class="${f.status === 'annulee' ? 'barre-l' : ''}"><td>${jour(f.date)}</td><td class="mono"><b>${esc(f.number)}</b>${f.export ? ' <span class="etiq">export</span>' : ''} <button type="button" class="btn ghost sm" data-pdf="${esc(f.id)}" title="Imprimer au format DIGITAL-TEX">PDF</button></td><td>${esc(f.client?.name || '')}</td><td class="masque-mobile mono small">${esc(f.client?.mf || '—')}</td><td class="n">${md(t.ht, d)}</td><td class="n">${md(t.fodec, d)}</td><td class="n">${md(t.tva, d)}</td><td class="n">${md(t.timbre, d)}</td><td class="n"><b>${md(t.net, d)}</b></td><td>${f.status === 'annulee' ? '<span class="badge anc">Annulée</span>' : '<span class="badge vig">Émise</span>'}</td></tr>`).join('')}
      </tbody><tfoot>${devs.map((dv) => { const s = (k) => ok.filter((x) => x.d === dv).reduce((a, x) => a + x.t[k], 0); return `<tr><td colspan="4"><b>Total ${dv} (hors annulées)</b></td><td class="n">${md(s('ht'), dv)}</td><td class="n">${md(s('fodec'), dv)}</td><td class="n">${md(s('tva'), dv)}</td><td class="n">${md(s('timbre'), dv)}</td><td class="n"><b>${md(s('net'), dv)}</b></td><td></td></tr>`; }).join('')}</tfoot></table>` : '<div class="vide">Aucune facture sur cette période.</div>';
  };
  $('#per-du').onchange = dess; $('#per-au').onchange = dess; dess();
  $('#liste').onclick = (e) => { const b = e.target.closest('[data-pdf]'); if (b) imprimerFactureDT(g.invoices.find((f) => f.id === b.dataset.pdf)); };
};

/* ---------- Comptabilité fournisseurs : factures ---------- */
const ST_FF = { saisie: ['Saisie', 'fut'], validee: ['Validée', 'vig'], annulee: ['Annulée', 'anc'] };
ECRANS.facturesF = async (m) => {
  if (exigeVis(m, 'Factures fournisseurs', ['achats'])) return;
  const [L, fourn, comptes] = await Promise.all([api('GET', '/api/compta/fournisseurs/factures'), api('GET', '/api/registres/fournisseurs'), api('GET', '/api/compta/fournisseurs/comptes')]);
  const cree = peut('compta_fournisseurs.factures', 'creer'), val = peut('compta_fournisseurs.factures', 'valider'), ann = peut('compta_fournisseurs.factures', 'annuler');
  const totDu = comptes.filter((c) => c.devise === 'DT').reduce((s, c) => s + c.reste, 0), echu = comptes.filter((c) => c.devise === 'DT').reduce((s, c) => s + c.t30 + c.t60 + c.t90 + c.t90p, 0);
  m.innerHTML = entete('Factures fournisseurs', 'Saisie de la facture reçue (n° interne FF + n° du fournisseur), puis validation par la comptabilité. Seule une facture validée se règle et entre dans le journal des achats.',
    `<div class="row-f">${rechercheHtml('Fournisseur, n°…')}<div class="champ" style="margin:0"><select id="filtre"><option value="">Toutes</option><option value="saisie">À valider</option><option value="du">Restant dues</option><option value="validee">Validées</option><option value="annulee">Annulées</option></select></div>${cree ? '<button class="btn cta" data-ff="nouveau">+ Facture fournisseur</button>' : ''}</div>`) +
    `<div class="chiffres"><div class="chiffre"><b>${md(totDu)}</b><span>reste à payer aux fournisseurs</span></div><div class="chiffre ${echu > 0 ? 'alerte' : ''}"><b>${md(echu)}</b><span>dont échu</span></div>
      <div class="chiffre ${L.some((x) => x.statut === 'saisie') ? 'alerte' : ''}"><b>${L.filter((x) => x.statut === 'saisie').length}</b><span>facture(s) à valider</span></div><div class="chiffre"><b>${comptes.length}</b><span>fournisseur(s) avec factures</span></div></div>
    <div class="panneau" id="liste" style="overflow:auto"></div>
    ${comptes.length ? `<h3 class="titre-bloc">Balance âgée fournisseurs</h3><div class="panneau" style="overflow:auto"><table class="nombres"><thead><tr><th>Fournisseur</th><th class="n">Factures</th><th class="n">Facturé</th><th class="n">Réglé</th><th class="n">Reste dû</th>${TRANCHES.map(([, l]) => `<th class="n">${l}</th>`).join('')}</tr></thead><tbody>
      ${comptes.map((c) => `<tr><td><b>${esc(c.nom)}</b> <span class="mute small">${c.devise}</span></td><td class="n">${c.factures}</td><td class="n">${md(c.facture, c.devise)}</td><td class="n">${md(c.regle, c.devise)}</td><td class="n"><b>${md(c.reste, c.devise)}</b></td>${TRANCHES.map(([k]) => `<td class="n ${k !== 'non_echu' && c[k] > 0 ? 'rouge' : ''}">${c[k] ? md(c[k], c.devise) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}`;
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase(), f = $('#filtre').value;
    const l = L.filter((x) => (!f || (f === 'du' ? x.statut === 'validee' && x.reste > 0.0005 : x.statut === f)) && (!q || JSON.stringify([x.numero, x.reference, x.fournisseur_nom]).toLowerCase().includes(q)));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>N° interne</th><th>Fournisseur</th><th>N° fournisseur</th><th>Date</th><th>Échéance</th><th class="n">Net</th><th class="n">Reste</th><th>État</th><th></th></tr></thead><tbody>
      ${l.map((x) => `<tr class="cliquable" data-id="${x.id}"><td class="mono small"><b>${esc(x.numero)}</b></td><td>${esc(x.fournisseur_nom)}<div class="mute small">${esc(CATEG_FF[x.categorie])}</div></td><td class="mono small">${esc(x.reference)}</td><td>${jour(x.date)}</td>
        <td class="${x.statut === 'validee' && x.reste > 0.0005 && x.echeance && x.echeance < iso() ? 'rouge' : ''}">${jour(x.echeance)}</td><td class="n"><b>${md(x.net, x.devise)}</b></td><td class="n">${x.statut === 'validee' ? md(x.reste, x.devise) : '—'}</td>
        <td><span class="badge ${ST_FF[x.statut][1]}">${ST_FF[x.statut][0]}</span></td>
        <td><div class="actions">${x.statut === 'saisie' && val ? `<button class="btn sm" data-ff="valider" data-id="${x.id}">Valider</button>` : ''}${x.statut !== 'annulee' && ann && x.regle === 0 ? `<button class="btn ghost sm" data-ff="annuler" data-id="${x.id}">Annuler</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
      : `<div class="vide">${L.length ? 'Aucune facture pour ce filtre.' : 'Aucune facture fournisseur saisie pour l’instant.'}</div>`;
  };
  $('#recherche').oninput = dess; $('#filtre').onchange = dess; dess();
  const form = (x) => {
    const ro = x ? !(x.statut === 'saisie' && peut('compta_fournisseurs.factures', 'modifier')) : !cree;
    const actifs = fourn.filter((f) => f.actif || f.id === x?.fournisseur_id);
    let lignes = x ? x.lignes.map((l) => ({ designation: l.designation, qte: l.qte, pu_ht: l.pu_ht, tva: l.tva })) : [{ designation: '', qte: 1, pu_ht: 0, tva: 19 }];
    const tot = () => { let h = 0, v = 0; for (const l of lignes) { const a = r3((+l.qte || 0) * (+l.pu_ht || 0)); h = r3(h + a); v = r3(v + r3(a * (+l.tva || 0) / 100)); } const t = +$('#ff-tim')?.value || 0; return { h, v, t, n: r3(h + v + t) }; };
    const dessL = () => {
      const d = $('#ff-dev')?.value || 'DT';
      $('#ff-l').innerHTML = `<table class="nombres"><thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">P.U. HT</th><th class="n">TVA %</th><th class="n">Total HT</th><th></th></tr></thead><tbody>
        ${lignes.map((l, i) => `<tr><td><input data-l="${i}" data-c="designation" value="${esc(l.designation)}" maxlength="200" style="width:100%" ${ro ? 'disabled' : ''}></td><td class="n"><input data-l="${i}" data-c="qte" type="number" step="any" min="0" value="${l.qte}" style="width:80px" ${ro ? 'disabled' : ''}></td>
          <td class="n"><input data-l="${i}" data-c="pu_ht" type="number" step="0.001" min="0" value="${l.pu_ht}" style="width:100px" ${ro ? 'disabled' : ''}></td><td class="n"><input data-l="${i}" data-c="tva" type="number" step="0.5" min="0" value="${l.tva}" style="width:66px" ${ro ? 'disabled' : ''}></td>
          <td class="n">${md(r3((+l.qte || 0) * (+l.pu_ht || 0)), d)}</td><td>${ro || lignes.length < 2 ? '' : `<button type="button" class="btn ghost sm" data-del="${i}">✕</button>`}</td></tr>`).join('')}</tbody></table>
        <div class="row-f" style="justify-content:space-between;padding:8px 0">${ro ? '<span></span>' : '<button type="button" class="btn ghost sm" data-add>+ Ligne</button>'}<span class="small" id="ff-tot"></span></div>`;
      const t = tot(); $('#ff-tot').innerHTML = `HT <b>${md(t.h, d)}</b> · TVA <b>${md(t.v, d)}</b> · timbre <b>${md(t.t, d)}</b> · <b>Net ${md(t.n, d)}</b>`;
    };
    grandeFenetre(`<h3>${x ? `Facture ${esc(x.numero)} · ${esc(x.fournisseur_nom)}` : 'Nouvelle facture fournisseur'}</h3><div class="msg err" hidden role="alert"></div>
      ${x ? `<div class="kv-g"><span>État</span><b>${ST_FF[x.statut][0]}</b><span>Saisie par</span><b>${esc(x.cree_par || '—')}</b>${x.valide_par ? `<span>Validée par</span><b>${esc(x.valide_par)}</b>` : ''}${x.motif ? `<span>Motif</span><b>${esc(x.motif)}</b>` : ''}</div>` : ''}
      <div class="grille2"><div class="champ" style="grid-column:1/-1"><label for="ff-fo">Fournisseur *</label><select id="ff-fo" name="fo" required ${ro ? 'disabled' : ''}><option value="">— Choisir —</option>${actifs.map((f) => `<option value="${f.id}" ${f.id === x?.fournisseur_id ? 'selected' : ''}>${esc(f.nom)}${f.mf ? ' · MF ' + esc(f.mf) : ''}</option>`).join('')}</select>${actifs.length ? '' : '<span class="aide">Créez d’abord le fournisseur (Comptabilité fournisseurs › Fournisseurs).</span>'}</div>
        <div class="champ"><label for="ff-ref">N° de la facture du fournisseur *</label><input id="ff-ref" name="reference" required maxlength="60" value="${esc(x?.reference || '')}" ${ro ? 'disabled' : ''}></div>
        <div class="champ"><label for="ff-cat">Catégorie</label><select id="ff-cat" name="categorie" ${ro ? 'disabled' : ''}>${Object.entries(CATEG_FF).map(([k, l]) => `<option value="${k}" ${k === (x?.categorie || 'achats') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="champ"><label for="ff-date">Date de facture</label><input type="date" id="ff-date" name="date" value="${x?.date || iso()}" required ${ro ? 'disabled' : ''}></div>
        <div class="champ"><label for="ff-ech">Échéance</label><input type="date" id="ff-ech" name="echeance" value="${x?.echeance || ''}" ${ro ? 'disabled' : ''}></div>
        <div class="champ"><label for="ff-dev">Devise</label><select id="ff-dev" name="devise" ${ro ? 'disabled' : ''}>${['DT', 'EUR', 'USD'].map((d) => `<option ${d === (x?.devise || 'DT') ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="champ"><label for="ff-tim">Droit de timbre</label><input type="number" id="ff-tim" name="timbre" step="0.001" min="0" value="${x?.timbre ?? 1}" ${ro ? 'disabled' : ''}></div></div>
      <div id="ff-l" class="panneau" style="padding:6px 10px;margin-bottom:10px;overflow:auto"></div>
      <div class="champ"><label for="ff-note">Note</label><input id="ff-note" name="note" maxlength="300" value="${esc(x?.note || '')}" ${ro ? 'disabled' : ''}></div>
      <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>${ro ? 'Fermer' : 'Annuler'}</button>${ro ? '' : '<button class="btn" value="ok">Enregistrer</button>'}</div>`, async (f) => {
      if (ro) return true;
      const body = { fournisseur_id: +f.fo.value, reference: f.reference.value.trim(), categorie: f.categorie.value, date: f.date.value, devise: f.devise.value, timbre: +f.timbre.value || 0, note: f.note.value.trim(),
        lignes: lignes.filter((l) => String(l.designation).trim()).map((l) => ({ designation: String(l.designation).trim(), qte: +l.qte || 0, pu_ht: +l.pu_ht || 0, tva: +l.tva || 0 })) };
      if (!body.fournisseur_id) throw new Error('Choisissez le fournisseur.');
      if (f.echeance.value) body.echeance = f.echeance.value;
      if (x) { body.version = x.version; await api('PUT', '/api/compta/fournisseurs/factures/' + x.id, body); toast('Facture enregistrée.'); }
      else { const r = await api('POST', '/api/compta/fournisseurs/factures', body); toast(`Facture ${r.numero} enregistrée : elle doit être validée avant d’être réglée.`); }
      route(); return true;
    });
    dessL();
    const z = $('#fen-form');
    // mise à jour sur place (jamais de redessin pendant la saisie : le champ suivant garderait sa valeur)
    const majTot = () => { const tt = tot(); const d = $('#ff-dev').value; $('#ff-tot').innerHTML = `HT <b>${md(tt.h, d)}</b> · TVA <b>${md(tt.v, d)}</b> · timbre <b>${md(tt.t, d)}</b> · <b>Net ${md(tt.n, d)}</b>`;
      z.querySelectorAll('#ff-l tbody tr').forEach((tr, i) => { const l = lignes[i]; if (l) tr.children[4].textContent = md(r3((+l.qte || 0) * (+l.pu_ht || 0)), d); }); };
    z.addEventListener('input', (e) => { const t = e.target; if (t.dataset.l !== undefined) { lignes[+t.dataset.l][t.dataset.c] = t.value; majTot(); } if (t.id === 'ff-tim') majTot(); });
    z.addEventListener('change', (e) => { if (e.target.id === 'ff-dev') majTot(); });
    z.addEventListener('click', (e) => { if (e.target.closest('[data-add]')) { lignes.push({ designation: '', qte: 1, pu_ht: 0, tva: 19 }); dessL(); } const d = e.target.closest('[data-del]'); if (d) { lignes.splice(+d.dataset.del, 1); dessL(); } });
  };
  m.onclick = async (e) => {
    const b = e.target.closest('[data-ff]');
    if (b?.dataset.ff === 'nouveau') return form(null);
    if (b) {
      const x = L.find((y) => y.id === +b.dataset.id);
      if (b.dataset.ff === 'valider') { if (!confirm(`Valider la facture ${x.numero} (${md(x.net, x.devise)}) ? Elle ne sera plus modifiable.`)) return; try { await api('POST', `/api/compta/fournisseurs/factures/${x.id}/valider`, { version: x.version }); toast('Facture validée.'); route(); } catch (x2) { toast(x2.message, true); } return; }
      if (b.dataset.ff === 'annuler') {
        grandeFenetre(`<h3>Annuler la facture ${esc(x.numero)}</h3><div class="msg err" hidden role="alert"></div><p>Elle reste dans l’historique avec le statut « annulée ».</p>
          <div class="champ"><label for="ff-mot">Motif *</label><input id="ff-mot" name="motif" required maxlength="300"></div>
          <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Retour</button><button class="btn danger" value="ok">Annuler la facture</button></div>`, async (f) => {
          await api('POST', `/api/compta/fournisseurs/factures/${x.id}/annuler`, { version: x.version, motif: f.motif.value.trim() }); toast('Facture annulée.'); route(); return true;
        });
        return;
      }
    }
    const tr = e.target.closest('tr[data-id]'); if (tr) form(L.find((y) => y.id === +tr.dataset.id));
  };
};

/* ---------- Comptabilité fournisseurs : règlements avec retenue à la source ---------- */
ECRANS.reglementsF = async (m) => {
  if (exigeVis(m, 'Règlements fournisseurs', ['achats'])) return;
  const [L, FF, opt, fisc] = await Promise.all([api('GET', '/api/compta/fournisseurs/reglements'), api('GET', '/api/compta/fournisseurs/factures'), optionsCompta(), api('GET', '/api/parametres/fiscalite')]);
  const tx = (c) => fisc.find((x) => x.code === c && x.en_vigueur)?.valeur;
  const cree = peut('compta_fournisseurs.reglements', 'creer'), ann = peut('compta_fournisseurs.reglements', 'annuler');
  m.innerHTML = entete('Règlements fournisseurs', `Paiement d’une ou plusieurs factures validées. Retenue à la source opérée selon les taux de Paramètres › Fiscalité (achats ${tx('ras_achats') ?? '—'} % à partir de ${dt(tx('ras_seuil') ?? 0)} DT TTC, honoraires ${tx('ras_honoraires') ?? '—'} %, loyers ${tx('ras_loyers') ?? '—'} %) : le certificat RAS est numéroté et imprimable.`,
    `<div class="row-f">${rechercheHtml()}${cree ? '<button class="btn cta" data-rg="nouveau">+ Règlement</button>' : ''}</div>`) + '<div class="panneau" id="liste" style="overflow:auto"></div>';
  const dess = () => {
    const q = $('#recherche').value.trim().toLowerCase();
    const l = L.filter((x) => !q || JSON.stringify([x.numero, x.fournisseur_nom, x.reference, x.certificat]).toLowerCase().includes(q));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>N°</th><th>Date</th><th>Fournisseur</th><th>Mode</th><th class="masque-mobile">Factures</th><th class="n">Brut</th><th class="n">Retenue</th><th class="n">Net payé</th><th>État</th><th></th></tr></thead><tbody>
      ${l.map((x) => `<tr class="${x.statut === 'annule' ? 'barre-l' : ''}"><td class="mono small"><b>${esc(x.numero)}</b></td><td>${jour(x.date)}</td><td>${esc(x.fournisseur_nom)}</td><td>${esc(x.mode)}${x.reference ? `<div class="mute small">${esc(x.reference)}</div>` : ''}</td>
        <td class="masque-mobile small">${x.factures.map((f) => `<span class="etiq" title="${esc(f.numero)}">${esc(f.reference)}</span>`).join(' ')}</td><td class="n">${md(x.brut, x.devise)}</td><td class="n">${x.retenue ? md(x.retenue, x.devise) : '—'}</td><td class="n"><b>${md(x.net, x.devise)}</b></td>
        <td>${x.statut === 'annule' ? `<span class="badge anc">Annulé</span><div class="mute small">${esc(x.motif)}</div>` : '<span class="badge vig">Payé</span>'}</td>
        <td><div class="actions">${x.certificat && x.statut !== 'annule' ? `<button class="btn ghost sm" data-rg="cert" data-num="${esc(x.certificat)}">Certificat ${esc(x.certificat)}</button>` : ''}${ann && x.statut !== 'annule' ? `<button class="btn ghost sm" data-rg="annuler" data-id="${x.id}">Annuler</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
      : '<div class="vide">Aucun règlement fournisseur pour l’instant.</div>';
  };
  $('#recherche').oninput = dess; dess();
  const nouveau = () => {
    const dues = FF.filter((f) => f.statut === 'validee' && f.reste > 0.0005);
    const fos = [...new Map(dues.map((f) => [f.fournisseur_id, f.fournisseur_nom])).entries()];
    grandeFenetre(`<h3>Nouveau règlement fournisseur</h3><div class="msg err" hidden role="alert"></div>
      <div class="grille2"><div class="champ" style="grid-column:1/-1"><label for="rg-fo">Fournisseur</label><select id="rg-fo" name="fo" required><option value="">— Choisir (factures validées restant dues) —</option>${fos.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select></div>
        <div class="champ"><label for="rg-date">Date</label><input type="date" id="rg-date" name="date" value="${iso()}" required></div>
        <div class="champ"><label for="rg-mode">Mode</label><select id="rg-mode" name="mode">${opt.modes.map((x) => `<option ${x === 'Virement' ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="champ"><label for="rg-ref">Référence (n° chèque, virement)</label><input id="rg-ref" name="reference" maxlength="60"></div>
        <div class="champ"><label for="rg-ras">Retenue à la source</label><select id="rg-ras" name="ras"><option value="">Aucune</option>${Object.entries(NATURES_RAS).filter(([k]) => k !== 'ventes').map(([k, l]) => `<option value="${k}">${l}${tx({ achats: 'ras_achats', honoraires: 'ras_honoraires', honoraires_autres: 'ras_honoraires_autres', loyers: 'ras_loyers' }[k]) !== undefined ? ' · ' + tx({ achats: 'ras_achats', honoraires: 'ras_honoraires', honoraires_autres: 'ras_honoraires_autres', loyers: 'ras_loyers' }[k]) + ' %' : ''}</option>`).join('')}</select></div>
        <div class="champ" id="rg-tx-c" hidden><label for="rg-tx">Taux de retenue (%)</label><input type="number" id="rg-tx" name="taux" step="0.01" min="0" max="100"></div></div>
      <div id="rg-f"><div class="vide small">Choisissez le fournisseur.</div></div>
      <div class="pied"><span class="small" id="rg-tot" style="margin-right:auto"></span><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer le règlement</button></div>`, async (f) => {
      const fac = [...f.querySelectorAll('tr[data-ff]')].map((tr) => ({ facture_id: +tr.dataset.ff, montant: +tr.querySelector('input').value || 0 })).filter((a) => a.montant > 0);
      if (!fac.length) throw new Error('Indiquez au moins un montant à régler.');
      const body = { fournisseur_id: +f.fo.value, date: f.date.value, mode: f.mode.value, reference: f.reference.value.trim(), factures: fac };
      if (f.ras.value) { body.retenue = { nature: f.ras.value }; if (f.taux.value !== '') body.retenue.taux = +f.taux.value; }
      const r = await api('POST', '/api/compta/fournisseurs/reglements', body);
      toast(`Règlement ${r.numero} : net payé ${dt(r.net)}${r.certificat ? ` · certificat de retenue ${r.certificat} (${dt(r.retenue)})` : ''}.`);
      route(); if (r.certificat) setTimeout(() => certificatRAS(r.certificat), 400); return true;
    });
    const z = $('#fen-form');
    const total = () => { let b = 0; z.querySelectorAll('tr[data-ff] input').forEach((i) => { b += +i.value || 0; }); const k = z.ras.value; let t = z.taux.value !== '' ? +z.taux.value : tx({ achats: 'ras_achats', honoraires: 'ras_honoraires', honoraires_autres: 'ras_honoraires_autres', loyers: 'ras_loyers' }[k]) || 0; if (!k) t = 0; const r = r3(b * t / 100); $('#rg-tot').innerHTML = `Brut <b>${dt(r3(b))}</b>${r ? ` · retenue ${String(t).replace(".", ",")} % <b>${dt(r)}</b>` : ''} · <b>net à payer ${dt(r3(b - r))}</b>${k === 'achats' && z.taux.value === '' && b < (tx('ras_seuil') || 0) ? ' <span class="rouge">· sous le seuil de retenue</span>' : ''}`; };
    z.ras.onchange = () => { $('#rg-tx-c').hidden = !z.ras.value; z.taux.placeholder = z.ras.value === 'autre' ? 'obligatoire' : 'taux des Paramètres'; total(); };
    z.taux.oninput = total;
    z.fo.onchange = () => {
      const F = dues.filter((f) => f.fournisseur_id === +z.fo.value);
      $('#rg-f').innerHTML = F.length ? `<div class="panneau" style="max-height:38vh;overflow:auto;margin-bottom:10px"><table class="nombres"><thead><tr><th>Facture</th><th>Échéance</th><th class="n">Reste</th><th class="n">À régler</th></tr></thead><tbody>
        ${F.map((f) => `<tr data-ff="${f.id}"><td class="mono small"><b>${esc(f.reference)}</b><div class="mute">${esc(f.numero)} · ${f.devise}</div></td><td>${jour(f.echeance)}</td><td class="n">${md(f.reste, f.devise)}</td><td class="n"><input type="number" step="0.001" min="0" max="${f.reste}" value="${f.reste}" style="width:120px"></td></tr>`).join('')}</tbody></table></div>` : '';
      $('#rg-f').oninput = total; total();
    };
  };
  m.onclick = (e) => {
    const b = e.target.closest('[data-rg]'); if (!b) return;
    if (b.dataset.rg === 'nouveau') return nouveau();
    if (b.dataset.rg === 'cert') return certificatRAS(b.dataset.num);
    const x = L.find((y) => y.id === +b.dataset.id);
    grandeFenetre(`<h3>Annuler le règlement ${esc(x.numero)}</h3><div class="msg err" hidden role="alert"></div><p>${md(x.net, x.devise)} · ${esc(x.fournisseur_nom)}. Les factures redeviennent dues${x.certificat ? ` et le certificat ${esc(x.certificat)} est annulé` : ''}.</p>
      <div class="champ"><label for="rg-mot">Motif *</label><input id="rg-mot" name="motif" required maxlength="300"></div>
      <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Retour</button><button class="btn danger" value="ok">Annuler le règlement</button></div>`, async (f) => {
      await api('POST', `/api/compta/fournisseurs/reglements/${x.id}/annuler`, { motif: f.motif.value.trim() }); toast('Règlement annulé.'); route(); return true;
    });
  };
};

// Certificat de retenue à la source (art. 55 du Code de l'IRPP et de l'IS) : page imprimable
async function certificatRAS(numero) {
  const [R, soc] = await Promise.all([api('GET', '/api/compta/retenues'), api('GET', '/api/parametres/societe')]);
  const r = R.find((x) => x.numero === numero); if (!r) return toast('Certificat introuvable.', true);
  const w = window.open('', '_blank'); if (!w) return toast('Autorisez les fenêtres pour imprimer le certificat.', true);
  const ligne = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Certificat ${esc(r.numero)}</title><style>
    body{font:13px/1.5 Arial,sans-serif;color:#14263a;margin:32px auto;max-width:720px}h1{font-size:19px;color:#1f4f7d;margin:0 0 4px}.s{color:#6b7885;margin:0 0 22px}
    table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #d1dbe5;padding:8px 10px;text-align:left;vertical-align:top}th{background:#eef2f7;width:42%;font-weight:600}
    .b{display:flex;justify-content:space-between;gap:20px}.b div{flex:1;border:1px solid #d1dbe5;border-radius:8px;padding:10px 12px}.sig{margin-top:40px;display:flex;justify-content:flex-end}.sig div{width:46%;border:1px solid #d1dbe5;height:90px;padding:8px;color:#6b7885}
    .n{font-size:11px;color:#6b7885;margin-top:24px}@media print{button{display:none}}</style></head><body>
    <button onclick="print()" style="float:right;padding:8px 14px">Imprimer</button>
    <h1>CERTIFICAT DE RETENUE À LA SOURCE</h1><p class="s">N° ${esc(r.numero)} — article 55 du Code de l’IRPP et de l’IS${r.statut === 'annule' ? ' — <b style="color:#c0392b">ANNULÉ</b>' : ''}</p>
    <div class="b"><div><b>Payeur (retenue opérée par)</b><br>${esc(soc.nom)}<br>${esc(soc.adresse)} ${esc(soc.ville)}<br>MF : ${esc(soc.mf || '—')}</div>
      <div><b>Bénéficiaire</b><br>${esc(r.tiers_nom)}<br>${esc(r.tiers_adresse || '')}<br>MF : ${esc(r.tiers_mf || '—')}</div></div>
    <table>${ligne('Date du paiement', jour(r.date))}${ligne('Facture(s) concernée(s)', esc(r.document || '—'))}${ligne('Nature de l’opération', esc(NATURES_RAS[r.nature] || r.nature))}
      ${ligne('Montant brut payé (base, TTC)', md(r.base, r.devise))}${ligne('Taux de la retenue', String(r.taux).replace('.', ',') + ' %')}${ligne('Montant de la retenue', '<b>' + md(r.montant, r.devise) + '</b>')}${ligne('Montant net payé', md(r.base - r.montant, r.devise))}</table>
    <div class="sig"><div>Cachet et signature du payeur</div></div>
    <p class="n">Document établi par l’ERP DIGITAL-TEX. Selon le Code, le certificat est aussi à établir sur la plateforme électronique du ministère des Finances lorsque celle-ci s’applique : votre comptable vous indique la marche à suivre.</p></body></html>`);
  w.document.close();
}

/* ---------- Retenues à la source (Comptabilité générale, et Fournisseurs › Retenues) ---------- */
ECRANS.retenues = async (m) => {
  if (exigeVis(m, 'Retenues à la source', ['prix'])) return;
  const R = await api('GET', '/api/compta/retenues');
  const val = peut('compta_generale.retenues', 'valider'), exp = peut('compta_generale.retenues', 'exporter') && voit('achats');
  const ok = R.filter((x) => x.statut === 'valide');
  const sub = ok.filter((x) => x.sens === 'subie'), op = ok.filter((x) => x.sens === 'operee');
  const somme = (l) => l.filter((x) => x.devise === 'DT').reduce((s, x) => s + x.montant, 0);
  m.innerHTML = entete('Retenues à la source', 'Gérées à part, comme demandé par le comptable. <b>Subies</b> : retenues par nos clients sur leurs paiements (acompte sur notre impôt — réclamer le certificat). <b>Opérées</b> : retenues sur nos paiements aux fournisseurs (à reverser à l’État, certificat remis au fournisseur).',
    `<div class="row-f">${periodeHtml()}${boutonsExport('ras', '/api/compta/export/retenues', exp)}</div>`) +
    `<div class="chiffres"><div class="chiffre"><b>${md(somme(sub))}</b><span>retenues subies (acomptes d’impôt)</span></div><div class="chiffre ${sub.some((x) => !x.certificat_recu) ? 'alerte' : ''}"><b>${sub.filter((x) => !x.certificat_recu).length}</b><span>certificat(s) client à réclamer</span></div>
      ${voit('achats') ? `<div class="chiffre"><b>${md(somme(op))}</b><span>retenues opérées (à reverser)</span></div><div class="chiffre"><b>${op.length}</b><span>certificat(s) émis</span></div>` : ''}</div>
    <nav class="onglets"><a href="#" data-sens="subie" class="on">Subies (clients)</a>${voit('achats') ? '<a href="#" data-sens="operee">Opérées (fournisseurs)</a>' : ''}</nav><div class="panneau" id="liste" style="overflow:auto"></div>`;
  let sens = ROUTE.mod === 'compta_fournisseurs' && voit('achats') ? 'operee' : 'subie';
  const dess = () => {
    m.querySelectorAll('[data-sens]').forEach((a) => a.classList.toggle('on', a.dataset.sens === sens));
    const du = $('#per-du').value, au = $('#per-au').value;
    const l = R.filter((x) => x.sens === sens && (!du || x.date >= du) && (!au || x.date <= au));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>Date</th><th>${sens === 'operee' ? 'Certificat' : 'Certificat du client'}</th><th>${sens === 'operee' ? 'Fournisseur' : 'Client'}</th><th class="masque-mobile">MF</th><th class="masque-mobile">Facture(s)</th><th class="n">Base</th><th class="n">Taux</th><th class="n">Retenue</th><th>État</th><th></th></tr></thead><tbody>
      ${l.map((x) => `<tr class="${x.statut === 'annule' ? 'barre-l' : ''}"><td>${jour(x.date)}</td><td class="mono small">${sens === 'operee' ? `<b>${esc(x.numero)}</b>` : x.certificat_recu ? `<b>${esc(x.certificat_ref)}</b>` : '<span class="badge fut">à réclamer</span>'}</td><td>${esc(x.tiers_nom)}</td>
        <td class="masque-mobile mono small">${esc(x.tiers_mf || '—')}</td><td class="masque-mobile small">${esc(x.document)}</td><td class="n">${md(x.base, x.devise)}</td><td class="n">${String(x.taux).replace('.', ',')} %</td><td class="n"><b>${md(x.montant, x.devise)}</b></td>
        <td>${x.statut === 'annule' ? '<span class="badge anc">Annulée</span>' : '<span class="badge vig">Valide</span>'}</td>
        <td>${sens === 'operee' ? `<button class="btn ghost sm" data-cert="${esc(x.numero)}">Imprimer</button>` : x.statut === 'valide' && !x.certificat_recu && val ? `<button class="btn ghost sm" data-recu="${x.id}">Certificat reçu</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<div class="vide">Aucune retenue ${sens === 'operee' ? 'opérée' : 'subie'} sur cette période.${sens === 'subie' ? ' Elles s’enregistrent à l’encaissement (bouton « − RAS »).' : ' Elles s’enregistrent au règlement d’un fournisseur.'}</div>`;
  };
  $('#per-du').onchange = dess; $('#per-au').onchange = dess; dess();
  m.onclick = (e) => {
    const s = e.target.closest('[data-sens]'); if (s) { e.preventDefault(); sens = s.dataset.sens; dess(); return; }
    const c = e.target.closest('[data-cert]'); if (c) return certificatRAS(c.dataset.cert);
    const r = e.target.closest('[data-recu]'); if (!r) return;
    const x = R.find((y) => y.id === +r.dataset.recu);
    grandeFenetre(`<h3>Certificat reçu · ${esc(x.tiers_nom)}</h3><div class="msg err" hidden role="alert"></div><p>Retenue de ${md(x.montant, x.devise)} sur ${esc(x.document)}. Gardez l’original : il justifie l’acompte d’impôt.</p>
      <div class="champ"><label for="ce-ref">Numéro ou référence du certificat *</label><input id="ce-ref" name="ref" required maxlength="60"></div>
      <div class="pied"><button class="btn ghost" value="annuler" formnovalidate>Annuler</button><button class="btn" value="ok">Enregistrer</button></div>`, async (f) => {
      await api('POST', `/api/compta/retenues/${x.id}/certificat`, { reference: f.ref.value.trim() }); toast('Certificat enregistré.'); route(); return true;
    });
  };
};

/* ---------- Fournisseurs : exports ---------- */
ECRANS.exportsF = async (m) => {
  if (exigeVis(m, 'Exports fournisseurs', ['achats'])) return;
  const ex = peut('compta_fournisseurs.exports', 'exporter');
  m.innerHTML = entete('Exports fournisseurs', 'Au choix CSV (séparateur « ; », virgule décimale, s’ouvre dans Excel) ou Excel (.xlsx). Chaque export est noté dans le journal d’audit.', `<div class="row-f">${periodeHtml()}</div>`) +
    `<div class="raccourcis">${[['Journal des achats', 'Factures fournisseurs de la période', '/api/compta/export/achats'], ['Balance âgée fournisseurs', 'Reste dû par fournisseur et par tranche de retard', '/api/compta/export/balance-fournisseurs']].map(([t, d, u]) => `<div class="raccourci"><span class="ico">${SVG(ICO.down)}</span><span style="flex:1"><b>${t}</b><small>${d}</small></span>${boutonsExport(t, u, ex)}</div>`).join('')}</div>`;
};

/* ---------- Comptabilité générale : journaux et balance ---------- */
const JOURNAUX = { VE: 'Ventes', AC: 'Achats', BQ: 'Banque', CA: 'Caisse' };
ECRANS.journaux = async (m) => {
  if (exigeVis(m, 'Journaux et balance', ['prix', 'achats'])) return;
  const exp = peut('compta_generale.journaux', 'exporter');
  m.innerHTML = entete('Journaux et balance', 'Écritures générées automatiquement depuis les factures clients, les encaissements, les factures et les règlements fournisseurs. Comptes du plan comptable (modifiable). À transmettre au comptable en CSV ou en Excel.',
    `<div class="row-f">${periodeHtml()}<div class="champ" style="margin:0"><select id="jr"><option value="">Tous les journaux</option>${Object.entries(JOURNAUX).map(([k, l]) => `<option value="${k}">${k} · ${l}</option>`).join('')}</select></div>${boutonsExport('jx', '/api/compta/export/journaux', exp)}</div>`) +
    '<div id="jx"><div class="vide">Chargement…</div></div>';
  const dess = async () => {
    const r = await api('GET', `/api/compta/ecritures?du=${$('#per-du').value}&au=${$('#per-au').value}${$('#jr').value ? '&journal=' + $('#jr').value : ''}`);
    const nb = r.ecritures.reduce((s, e) => s + e.lignes.length, 0);
    $('#jx').innerHTML = (r.desequilibres.length ? `<div class="msg err">Écritures déséquilibrées : ${r.desequilibres.map(esc).join(', ')}. Prévenez l’administrateur.</div>` : '') +
      `<div class="chiffres">${Object.entries(JOURNAUX).map(([k, l]) => `<div class="chiffre"><b>${r.ecritures.filter((e) => e.journal === k).length}</b><span>écriture(s) ${l.toLowerCase()}</span></div>`).join('')}</div>
      <h3 class="titre-bloc">Balance</h3><div class="panneau" style="overflow:auto">${r.balance.length ? `<table class="nombres"><thead><tr><th>Compte</th><th>Devise</th><th class="n">Débit</th><th class="n">Crédit</th><th class="n">Solde</th></tr></thead><tbody>
        ${r.balance.map((b) => `<tr><td class="mono"><b>${esc(b.compte)}</b></td><td>${b.devise}</td><td class="n">${md(b.debit, b.devise)}</td><td class="n">${md(b.credit, b.devise)}</td><td class="n"><b>${md(b.solde, b.devise)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="vide">Aucune écriture sur la période.</div>'}</div>
      <h3 class="titre-bloc">Écritures (${r.ecritures.length} · ${nb} lignes)</h3><div class="panneau" style="overflow:auto;max-height:60vh">${r.ecritures.length ? `<table class="nombres"><thead><tr><th>Jnl</th><th>Date</th><th>Pièce</th><th>Compte</th><th class="masque-mobile">Libellé</th><th class="n">Débit</th><th class="n">Crédit</th></tr></thead><tbody>
        ${r.ecritures.slice(0, 600).map((e) => e.lignes.map((l, i) => `<tr${i ? '' : ' style="border-top:2px solid var(--rule)"'}><td class="mono small">${i ? '' : e.journal}</td><td>${i ? '' : jour(e.date)}</td><td class="mono small">${i ? '' : esc(e.piece)}</td><td class="mono"><b>${esc(l.compte)}</b>${l.tiers ? ` <span class="mute small">${esc(l.tiers)}</span>` : ''}</td><td class="masque-mobile small">${i ? '' : esc(e.libelle)}</td><td class="n">${l.debit ? md(l.debit, l.devise) : ''}</td><td class="n">${l.credit ? md(l.credit, l.devise) : ''}</td></tr>`).join('')).join('')}</tbody></table>${r.ecritures.length > 600 ? '<p class="mute small" style="padding:8px 14px">Affichage limité aux 600 premières écritures : l’export contient tout.</p>' : ''}` : '<div class="vide">Aucune écriture.</div>'}</div>`;
  };
  $('#per-du').onchange = dess; $('#per-au').onchange = dess; $('#jr').onchange = dess; await dess();
};

/* ---------- Comptabilité générale : plan comptable ---------- */
ECRANS.plan = async (m) => {
  const L = await api('GET', '/api/compta/plan');
  const ro = !peut('compta_generale.plan', 'modifier');
  m.innerHTML = entete('Plan comptable', 'Comptes utilisés pour générer les écritures. Proposition selon la nomenclature tunisienne (NC 01) : <b>à faire vérifier par votre comptable</b> et à ajuster à son plan de comptes.') +
    `<div class="panneau"><table><thead><tr><th>Usage</th><th>Compte</th><th></th></tr></thead><tbody>${L.map((x) => `<tr><td><b>${esc(x.libelle)}</b><div class="mono small mute">${esc(x.cle)}</div></td>
      <td>${ro ? `<span class="mono">${esc(x.compte)}</span>` : `<input class="court" data-cle="${esc(x.cle)}" value="${esc(x.compte)}" maxlength="10" inputmode="numeric" aria-label="Compte ${esc(x.libelle)}">`}</td>
      <td>${ro ? '' : `<button class="btn ghost sm" data-pl="${esc(x.cle)}">Enregistrer</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  m.onclick = async (e) => {
    const b = e.target.closest('[data-pl]'); if (!b) return;
    const v = m.querySelector(`input[data-cle="${b.dataset.pl}"]`).value.trim();
    if (!/^[0-9]{1,10}$/.test(v)) return toast('Le compte ne contient que des chiffres.', true);
    try { await api('PUT', '/api/compta/plan/' + b.dataset.pl, { compte: v }); toast('Compte enregistré : les prochaines écritures et exports l’utilisent.'); } catch (x) { toast(x.message, true); }
  };
};

/* ---------- Comptabilité générale : valorisation CMUP ---------- */
ECRANS.valorisation = async (m) => {
  if (exigeVis(m, 'Valorisation des stocks', ['couts'])) return;
  const v = await api('GET', '/api/compta/valorisation');
  m.innerHTML = entete('Valorisation des stocks — CMUP', esc(v.explication) + ' Méthode retenue par l’ERP, le comptable ayant laissé le choix (21/10/2026).') +
    `<div class="panneau" style="overflow:auto">${v.articles.length ? `<table class="nombres"><thead><tr><th>Article (désignation des factures d’achat)</th><th>Devise</th><th class="n">Entrées</th><th class="n">Quantité achetée</th><th class="n">Valeur</th><th class="n">CMUP</th><th>Dernière entrée</th></tr></thead><tbody>
      ${v.articles.map((a) => `<tr><td><b>${esc(a.designation)}</b></td><td>${a.devise}</td><td class="n">${a.entrees}</td><td class="n">${a.quantite.toLocaleString('fr-FR')}</td><td class="n">${md(a.valeur, a.devise)}</td><td class="n"><b>${md(a.cmup, a.devise)}</b></td><td>${jour(a.derniere_entree)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="vide">Aucune facture d’achat de matières validée : le CMUP se calculera dès les premières factures (catégorie « Achats matières »).</div>'}</div>
    <p class="mute small">Au lot 6, les réceptions et les sorties de stock remplaceront ce calcul provisoire fondé sur les factures d’achat.</p>`;
};

/* ================================================================ démarrage */
testerServeur();
