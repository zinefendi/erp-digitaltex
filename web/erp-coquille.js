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
    devis: { t: 'futur', lot: 4, ico: 'doc', d: 'Devis (DEV), transformés en commande en un clic',
      cdc: ['Circuit : Devis (DEV) → Proforma (PRO) → Commande (CMD) → BL → Facture (FAC) → Règlements (REC).', 'Transformation en un clic, sans ressaisie, avec traçabilité amont ↔ aval.', 'Statuts : brouillon, envoyé, accepté, refusé, expiré.'] },
    proformas: { t: 'futur', lot: 4, ico: 'doc', d: 'Factures proforma (PRO)', cdc: ['Proforma issue du devis accepté, transformable en commande.', 'Export : USD / EUR avec taux de change mémorisé, Incoterms 2020, documents en français ou en anglais.'] },
    commandes: { t: 'cadre', page: 'gestion', onglet: 'orders', ico: 'list', d: 'Commandes, avances, fiches, suivi', sansPrix: 'commandes' },
    bl: { t: 'cadre', page: 'gestion', onglet: 'bls', ico: 'truck', d: 'Livraisons totales ou partielles', sansPrix: 'bl' },
    factures: { t: 'cadre', page: 'gestion', onglet: 'invoices', ico: 'euro', d: 'Factures, TVA, timbre, règlements', sansPrix: 'interdit' },
    avoirs: { t: 'futur', lot: 4, ico: 'doc', d: 'Avoirs (AV) partiels ou totaux', cdc: ['Avoir partiel ou total rattaché à la facture d’origine, numérotation AV.', 'Une facture émise n’est jamais supprimée : elle est annulée par un avoir.'] },
    reglements: { t: 'cadre', page: 'gestion', onglet: 'invoices', ico: 'check', d: 'Avances (commande) et règlements (facture)', sansPrix: 'interdit' },
  } },
  compta_clients: { court: 'Clients', desc: 'Encours, échéances et balance âgée calculés à partir des factures.', f: {
    comptes: { t: 'natif', ecran: 'encours', ico: 'euro', d: 'Solde par client, échéances, retards' },
    lettrage: { t: 'futur', lot: 8, ico: 'link', d: 'Rapprocher règlements et factures', cdc: ['Lettrage automatique et manuel (règlement ↔ factures), règlements partiels, imputation d’acomptes.', 'Effets et chèques : portefeuille, remise en banque, impayés et rejets.'] },
    relances: { t: 'futur', lot: 8, ico: 'bell', d: 'Relances à plusieurs niveaux', cdc: ['Échéancier, retards, relances à plusieurs niveaux (modèles d’e-mail et de courrier), historique des relances.'] },
    exports: { t: 'natif', ecran: 'journalVentes', ico: 'down', d: 'Journal des ventes (CSV)' },
  } },
  compta_fournisseurs: { court: 'Fournis.', desc: 'Fichier fournisseurs aujourd’hui ; achats et règlements au lot 8.', f: {
    fournisseurs: { t: 'natif', ecran: 'registre', reg: 'fournisseurs', ico: 'building', d: 'Fiches fournisseurs' },
    achats: { t: 'futur', lot: 8, ico: 'list', d: 'Demande d’achat → commande → réception', cdc: ['Demande d’achat → bon de commande fournisseur → réception (entrée en stock matières) → facture, avec rapprochement commande / réception / facture.', 'Importations : frais d’approche, taux de change, coût de revient des matières.'] },
    factures: { t: 'futur', lot: 8, ico: 'euro', d: 'Factures fournisseurs', cdc: ['Saisie et rapprochement avec la commande et la réception.'] },
    reglements: { t: 'futur', lot: 8, ico: 'check', d: 'Règlements et échéancier', cdc: ['Règlements fournisseurs, échéancier, lettrage, prévision de trésorerie.'] },
    retenues: { t: 'futur', lot: 8, ico: 'percent', d: 'Retenue à la source opérée', cdc: ['Calcul paramétrable, certificats de retenue, états pour la déclaration (taux et cas à valider avec le comptable).'] },
    exports: { t: 'futur', lot: 8, ico: 'down', d: 'Exports comptables', cdc: ['Balance âgée et grand livre fournisseurs, journal des achats, exports au format du comptable.'] },
  } },
  paie: { court: 'Paie', desc: 'Paie tunisienne complète, au lot 9. Visible seulement par le Super administrateur et RH / Paie.', f: {
    salaries: { t: 'futur', lot: 9, ico: 'user', d: 'Dossiers salariés', cdc: ['Identité, CIN, n° CNSS, contrat (CDI, CDD, SIVP…), catégorie et échelon, convention collective, situation familiale, RIB.'] },
    elements: { t: 'futur', lot: 9, ico: 'list', d: 'Primes, heures, absences', cdc: ['Éléments paramétrables et datés : salaire de base, primes, heures supplémentaires, absences, congés, avances et prêts.'] },
    bulletins: { t: 'futur', lot: 9, ico: 'doc', d: 'Bulletins de paie PDF', cdc: ['Cotisations CNSS, IRPP selon le barème en vigueur : tables paramétrables par date, à valider par le comptable.'] },
    declarations: { t: 'futur', lot: 9, ico: 'shield', d: 'CNSS et déclarations fiscales', cdc: ['États préparatoires (formats exacts à obtenir auprès du comptable et des organismes).'] },
    journal: { t: 'futur', lot: 9, ico: 'chart', d: 'Journal et livre de paie', cdc: ['Journal de paie, livre de paie, état des virements bancaires.'] },
  } },
  production: { court: 'Production', desc: 'Plan de charge des commandes aujourd’hui ; OF en 3 parties et tablette atelier au lot 7.', f: {
    of: { t: 'natif', ecran: 'planCharge', ico: 'list', libelle: 'Plan de charge', d: 'Commandes à produire, délais, retards' },
    etapes: { t: 'futur', lot: 7, ico: 'check', d: 'Coupe → Marquage → Assemblage', cdc: ['Les 3 parties de l’OF se valident dans l’ordre : coupe, marquage (impression ou broderie), assemblage et finition.', 'Validation partielle possible, avec date, validateur, quantités, remarques et photo prise à la tablette.', 'Coupe validée : sortie des matières du stock ; assemblage validé : entrée en stock produits finis.'] },
    taches: { t: 'futur', lot: 7, ico: 'user', d: 'Affectation aux ouvriers', cdc: ['Planning visuel, charge par ouvrier, priorités, retards.'] },
    pointage: { t: 'futur', lot: 7, ico: 'clock', d: 'Temps prévus et réels', cdc: ['Pointage début / fin de tâche depuis la tablette, temps prévu comparé au temps réel, heures transmissibles à la paie.'] },
  } },
  bom: { court: 'BOM', desc: 'Les produits du catalogue, base des nomenclatures matières (lot 7).', f: {
    nomenclatures: { t: 'natif', ecran: 'articles', ico: 'grid', libelle: 'Produits du catalogue', d: 'Un produit du catalogue = une BOM' },
    gammes: { t: 'futur', lot: 7, ico: 'clock', d: 'Opérations et temps standard', cdc: ['Gamme opératoire : opérations, temps standard, poste ou compétence.', 'Coût de revient standard (matières + main-d’œuvre + marquage) comparé au coût réel de l’OF.'] },
  } },
  stock_mp: { court: 'Stock MP', desc: 'Fichier des matières aujourd’hui ; mouvements de stock au lot 6.', f: {
    articles: { t: 'natif', ecran: 'registre', reg: 'articles_mp', ico: 'box', d: 'Tissus, fils, accessoires, emballages' },
    entrees: { t: 'futur', lot: 6, ico: 'in', d: 'Réceptions fournisseurs', cdc: ['Réception fournisseur, lots et rouleaux de tissu (n° de lot, bain de teinture, métrage restant).'] },
    sorties: { t: 'futur', lot: 6, ico: 'out', d: 'Sorties vers les OF', cdc: ['Sortie vers OF, retour, transfert, ajustement ; chaque mouvement est tracé.', 'Réservations pour les OF, seuils minimum et alertes de réapprovisionnement.'] },
    inventaires: { t: 'futur', lot: 6, ico: 'scale', d: 'Inventaires et valorisation', cdc: ['Inventaire périodique ou tournant, écarts justifiés, valorisation (méthode à valider avec le comptable).'] },
  } },
  stock_pf: { court: 'Stock PF', desc: 'Stock produits finis par produit, taille et couleur, au lot 6.', f: {
    stock: { t: 'futur', lot: 6, ico: 'box', d: 'Par produit, taille, couleur', cdc: ['Stock par produit, taille et couleur ; emplacements.'] },
    entrees: { t: 'futur', lot: 6, ico: 'in', d: 'Entrées depuis la production', cdc: ['Entrée automatique à la validation de l’assemblage de l’OF.'] },
    sorties: { t: 'futur', lot: 6, ico: 'out', d: 'Sorties par BL, retours', cdc: ['Sorties par bon de livraison, retours clients, préparation et colisage.'] },
    reservations: { t: 'futur', lot: 6, ico: 'lock', d: 'Réservations pour les commandes', cdc: ['Réservation pour les commandes et disponibilités.'] },
    inventaires: { t: 'futur', lot: 6, ico: 'scale', d: 'Inventaires', cdc: ['Inventaire et valorisation au coût de revient.'] },
  } },
  parametres: { court: 'Paramètres', desc: 'Comptes, rôles, société, fiscalité, numérotation, journal et sauvegardes.', f: {
    utilisateurs: { t: 'natif', ecran: 'comptes', ico: 'user', d: 'Un compte par personne' },
    roles: { t: 'natif', ecran: 'roles', ico: 'shield', d: 'Droits par module et par action' },
    societe: { t: 'natif', ecran: 'onglet', onglet: 'societe', ico: 'building', d: 'Coordonnées, MF, RC, RIB, logo' },
    fiscalite: { t: 'natif', ecran: 'onglet', onglet: 'fiscalite', ico: 'percent', d: 'TVA, timbre, datés' },
    baremes_paie: { t: 'futur', lot: 9, ico: 'scale', d: 'Barèmes CNSS et IRPP datés', cdc: ['Tous les taux et barèmes de paie sont des tables datées, à faire valider par le comptable à chaque loi de finances.'] },
    numerotation: { t: 'natif', ecran: 'onglet', onglet: 'numerotation', ico: 'hash', d: 'Préfixes et compteurs' },
    audit: { t: 'natif', ecran: 'journal', ico: 'list', d: 'Qui a fait quoi, et quand' },
    sauvegardes: { t: 'natif', ecran: 'sauvegardes', ico: 'save', d: 'Copies de chaque nuit' },
  } },
};
const ORDRE = ['infographie', 'commercial', 'compta_clients', 'compta_fournisseurs', 'paie', 'production', 'bom', 'stock_mp', 'stock_pf', 'parametres'];
const PAGES_CADRE = {
  studio: { src: '/studio/index.html', titre: 'Studio 3D' },
  gestion: { src: '/studio/gestion.html', titre: 'Gestion' },
  catalogue: { src: '/studio/parametres.html', titre: 'Catalogue' },
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

function grandeFenetre(html, onValider) {
  const d = $('#fen'); d.style.width = 'min(940px, calc(100% - 24px))';
  d.addEventListener('close', () => { d.style.width = ''; }, { once: true });
  fenetre(html, onValider);
}

// totaux d'une facture : même calcul que l'application 3.3.0 (docs-pdf.js · invoiceTotals)
function totauxFacture(inv) {
  const t = (+inv.tva || 0) / 100, ttcMode = inv.pricesTTC !== false;
  let ht = 0;
  for (const l of inv.lines || []) {
    const q = +l.qty || 0, pu = +l.pu || 0, rem = Math.min(100, Math.max(0, +l.remise || 0)) / 100;
    ht += r3(q * (ttcMode ? pu / (1 + t) : pu) * (1 - rem));
  }
  ht = r3(ht);
  if (ttcMode) {
    const exact = r3((inv.lines || []).reduce((s, l) => s + (+l.qty || 0) * (+l.pu || 0) * (1 - Math.min(100, Math.max(0, +l.remise || 0)) / 100), 0));
    return { ht: r3(exact / (1 + t)), tva: r3(exact - r3(exact / (1 + t))), ttc: exact, timbre: r3(inv.timbre || 0), net: r3(exact + (+inv.timbre || 0)) };
  }
  const tva = r3(ht * t), ttc = r3(ht + tva);
  return { ht, tva, ttc, timbre: r3(inv.timbre || 0), net: r3(ttc + (+inv.timbre || 0)) };
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
const modulesVus = () => (ACC?.modules || []).slice().sort((a, b) => a.numero - b.numero);
const fonctionsVues = (mod) => {
  const m = ACC?.modules.find((x) => x.code === mod); if (!m) return [];
  const lisibles = new Set(m.fonctions.map((f) => f.code.split('.')[1]));
  return Object.entries(MODS[mod].f).filter(([k, d]) => {
    if (k === 'tableau') return voit('prix') && lisibles.has('commandes');
    return lisibles.has(k);
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
  const item = (f) => `<a href="${lien(ROUTE.mod, f.code)}" class="${f.code === ROUTE.fn ? 'on' : ''} ${f.t === 'futur' ? 'futur' : ''}"><span class="ico">${SVG(ICO[f.ico] || ICO.doc)}</span><span class="tx">${esc(f.libelle)}<small>${esc(f.d || '')}</small></span>${f.t === 'futur' ? `<span class="lotb">lot ${f.lot}</span>` : ''}</a>`;
  p.innerHTML = `<div class="tete"><span class="n">MODULE ${String(m.numero).padStart(2, '0')}</span><h2>${esc(m.libelle)}</h2><p>${esc(MODS[ROUTE.mod].desc)}</p></div>
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
  if (d.t === 'cadre' && !(d.page === 'gestion' && !voit('prix'))) { appliquerPanneau(true); return montrerCadre(d.page, d.onglet); }
  appliquerPanneau(false); cacherCadres(); m.scrollTop = 0;
  try {
    if (d.t === 'futur') return ecranFutur(m, mod, fn, d);
    if (d.t === 'cadre') return ECRANS.sansPrix(m, d.sansPrix, fn);
    if (d.ecran === 'onglet') return ecranOngletParam(m, d.onglet);
    return await ECRANS[d.ecran](m, d, mod, fn);
  } catch (x) { m.innerHTML = `<div class="vide">${esc(x.message)}</div>`; }
}
function appliquerPanneau(cadre) {
  const cle = cadre ? 'cadre' : 'page';
  const replie = PANNEAU_FORCE[cle] ?? cadre;
  $('#v-app').classList.toggle('replie', replie);
}
addEventListener('hashchange', () => {
  if (RS.modifie && !confirm('Des changements de droits ne sont pas enregistrés. Quitter la page ?')) { history.back(); return; }
  RS.modifie = false; route();
});
addEventListener('beforeunload', (e) => { if (RS.modifie || CADRES.studio) e.preventDefault(); });

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'panneau') {
    const mobile = matchMedia('(max-width:860px)').matches;
    if (mobile) { $('#v-app').classList.toggle('ouvert'); return; }
    const cadre = !$('#cadres').classList.contains('cache'); const cle = cadre ? 'cadre' : 'page';
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
    numerotation: ['Numérotation', 'Un seul compteur par type de document et par année, partagé par tous les postes.'] }[o];
  m.innerHTML = entete(t[0], t[1]) + '<div id="p-param"><div class="vide">Chargement…</div></div>';
  await ({ societe: ongletSociete, fiscalite: ongletFiscalite, numerotation: ongletNumerotation })[o]($('#p-param'));
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
    <div class="panneau" style="max-height:46vh;overflow:auto"><table><thead><tr><th>Article</th><th>Service</th><th>Couleur</th><th>Taille</th><th class="n">Qté</th><th class="n">Livrée</th></tr></thead><tbody>
      ${lignes.map((l) => `<tr><td>${esc(l.designation)}</td><td>${esc(l.staff || '')}</td><td>${esc(l.color || '')}</td><td class="mono">${esc(l.size || '')}</td><td class="n">${+l.qty || 0}</td><td class="n">${Math.min(+l.qty || 0, a.livre[l.id] || 0)}</td></tr>`).join('')}
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
  const factures = g.invoices.filter((f) => f.status !== 'annulee').map((f) => {
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
  m.innerHTML = entete('Comptes clients et échéances', 'Calculé à partir des factures émises (hors annulées) et des avances et règlements saisis. Montants en DT, 3 décimales.',
    exp ? '<button class="btn ghost" data-ec="csv">Exporter la balance âgée (CSV)</button>' : '') +
    `<div class="chiffres"><div class="chiffre"><b>${dt(tot('reste'))}</b><span>reste à encaisser (DT)</span></div><div class="chiffre ${echu > 0 ? 'alerte' : ''}"><b>${dt(echu)}</b><span>dont échu (DT)</span></div>
      <div class="chiffre ${tot('t60') + tot('t90') + tot('t90p') > 0 ? 'alerte' : ''}"><b>${dt(r3(tot('t60') + tot('t90') + tot('t90p')))}</b><span>échu depuis plus de 30 jours (DT)</span></div><div class="chiffre"><b>${factures.filter((x) => x.reste > 0.0005).length}</b><span>facture(s) non soldée(s)</span></div></div>
    <div class="panneau" style="overflow:auto">${cl.length ? `<table class="nombres"><thead><tr><th>Client</th><th class="n">Factures</th><th class="n">Facturé</th><th class="n">Réglé</th><th class="n">Reste dû</th>${TRANCHES.map(([, l]) => `<th class="n">${l}</th>`).join('')}</tr></thead><tbody>
      ${cl.map((c, i) => `<tr class="cliquable" data-cl="${i}"><td><b>${esc(c.nom)}</b>${c.mf ? `<div class="mute small mono">${esc(c.mf)}</div>` : ''}</td><td class="n">${c.nb}</td><td class="n">${dt(c.facture)}</td><td class="n">${dt(c.regle)}</td><td class="n"><b>${dt(c.reste)}</b></td>${TRANCHES.map(([k]) => `<td class="n ${k !== 'non_echu' && c[k] > 0 ? 'rouge' : ''}">${c[k] ? dt(c[k]) : '—'}</td>`).join('')}</tr>`).join('')}
      </tbody><tfoot><tr><td><b>Total</b></td><td class="n">${factures.length}</td><td class="n">${dt(tot('facture'))}</td><td class="n">${dt(tot('regle'))}</td><td class="n"><b>${dt(tot('reste'))}</b></td>${TRANCHES.map(([k]) => `<td class="n">${dt(tot(k))}</td>`).join('')}</tr></tfoot></table>` : '<div class="vide">Aucune facture émise pour l’instant.</div>'}</div>
    <p class="mute small">Échéance : date d’échéance de la facture (sinon sa date). Le lettrage, les relances et le portefeuille d’effets arrivent au lot 8.</p>`;
  m.onclick = (e) => {
    if (e.target.closest('[data-ec=csv]')) {
      csv(`balance-agee-clients-${new Date().toISOString().slice(0, 10)}.csv`, [['Client', 'MF', 'Factures', 'Facturé (DT)', 'Réglé (DT)', 'Reste dû (DT)', ...TRANCHES.map(([, l]) => l + ' (DT)')],
        ...cl.map((c) => [c.nom, c.mf, c.nb, nombreCsv(c.facture), nombreCsv(c.regle), nombreCsv(c.reste), ...TRANCHES.map(([k]) => nombreCsv(c[k]))])]);
      return;
    }
    const tr = e.target.closest('[data-cl]'); if (!tr) return;
    const c = cl[+tr.dataset.cl];
    grandeFenetre(`<h3>${esc(c.nom)} · relevé</h3><div class="panneau" style="max-height:56vh;overflow:auto"><table><thead><tr><th>Facture</th><th>Date</th><th>Échéance</th><th class="n">Net (DT)</th><th class="n">Réglé</th><th class="n">Reste</th><th>Retard</th></tr></thead><tbody>
      ${c.lignes.sort((a, b) => (a.f.date || '').localeCompare(b.f.date || '')).map((x) => `<tr><td class="mono"><b>${esc(x.f.number)}</b></td><td>${jour(x.f.date)}</td><td>${jour(x.f.due)}</td><td class="n">${dt(x.net)}</td><td class="n">${dt(x.regle)}</td><td class="n"><b>${dt(x.reste)}</b></td><td>${x.reste > 0.0005 && x.j < 0 ? `<span class="badge ret">${-x.j} j</span>` : x.reste > 0.0005 ? '<span class="badge fut">à échoir</span>' : '<span class="badge vig">soldée</span>'}</td></tr>`).join('')}
      </tbody></table></div><div class="pied"><button class="btn" value="ok">Fermer</button></div>`, () => true);
  };
};

/* ---------- Comptabilité clients : journal des ventes (CSV) ---------- */
ECRANS.journalVentes = async (m) => {
  if (!voit('prix')) { m.innerHTML = entete('Exports comptables', '') + '<div class="panneau"><div class="vide">Cet écran demande le droit de visibilité « Prix ».</div></div>'; return; }
  const g = await gestion(true);
  const mois = [...new Set(g.invoices.map((f) => (f.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const exp = peut('compta_clients.exports', 'exporter');
  m.innerHTML = entete('Journal des ventes', 'Une ligne par facture : HT, TVA, timbre, net. Le format exact attendu par votre comptable sera ajusté au lot 8.',
    `<div class="row-f"><div class="champ" style="margin:0"><select id="mois"><option value="">Toutes les périodes</option>${mois.map((x) => `<option value="${x}">${new Date(x + '-15').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</option>`).join('')}</select></div>${exp ? '<button class="btn" data-jv="csv">Exporter (CSV)</button>' : ''}</div>`) +
    '<div class="panneau" id="liste" style="overflow:auto"></div>';
  const lignes = () => g.invoices.filter((f) => !$('#mois').value || (f.date || '').startsWith($('#mois').value)).sort((a, b) => (a.number || '').localeCompare(b.number || '')).map((f) => ({ f, t: totauxFacture(f) }));
  const dess = () => {
    const l = lignes(); const ok = l.filter((x) => x.f.status !== 'annulee');
    const s = (k) => r3(ok.reduce((a, x) => a + x.t[k], 0));
    $('#liste').innerHTML = l.length ? `<table class="nombres"><thead><tr><th>Date</th><th>Facture</th><th>Client</th><th class="masque-mobile">MF client</th><th class="n">HT</th><th class="n">TVA</th><th class="n">Timbre</th><th class="n">Net</th><th>État</th></tr></thead><tbody>
      ${l.map(({ f, t }) => `<tr class="${f.status === 'annulee' ? 'barre-l' : ''}"><td>${jour(f.date)}</td><td class="mono"><b>${esc(f.number)}</b></td><td>${esc(f.client?.name || '')}</td><td class="masque-mobile mono small">${esc(f.client?.mf || '—')}</td><td class="n">${dt(t.ht)}</td><td class="n">${dt(t.tva)}</td><td class="n">${dt(t.timbre)}</td><td class="n"><b>${dt(t.net)}</b></td><td>${f.status === 'annulee' ? '<span class="badge anc">Annulée</span>' : '<span class="badge vig">Émise</span>'}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="4"><b>Total (hors annulées)</b></td><td class="n">${dt(s('ht'))}</td><td class="n">${dt(s('tva'))}</td><td class="n">${dt(s('timbre'))}</td><td class="n"><b>${dt(s('net'))}</b></td><td></td></tr></tfoot></table>` : '<div class="vide">Aucune facture sur cette période.</div>';
  };
  $('#mois').onchange = dess; dess();
  m.onclick = (e) => {
    if (!e.target.closest('[data-jv=csv]')) return;
    csv(`journal-ventes-${$('#mois').value || 'complet'}.csv`, [['Date', 'Facture', 'Client', 'MF client', 'HT (DT)', 'TVA (DT)', 'Taux TVA (%)', 'Timbre (DT)', 'Net (DT)', 'État'],
      ...lignes().map(({ f, t }) => [f.date, f.number, f.client?.name || '', f.client?.mf || '', nombreCsv(t.ht), nombreCsv(t.tva), f.tva, nombreCsv(t.timbre), nombreCsv(t.net), f.status === 'annulee' ? 'annulée' : 'émise'])]);
  };
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

/* ================================================================ démarrage */
testerServeur();
