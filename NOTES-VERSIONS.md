# Notes de version — ERP DIGITAL-TEX

Une courte note par version (ce qui change pour l'utilisateur, migration, points à vérifier).
Le guide PDF complet n'est refait qu'aux grandes étapes (fin d'un module majeur) ou à la demande.

## Outillage (21/10/2026) — sans changement fonctionnel
- `dev/preparer-env.sh` : remet en place l'environnement de développement en une commande (`--tests`, `--serveur`).
- `dev/tester.sh` : tests de l'API, bilan court ; `dev/relancer.sh` : serveur de dev (port 8092) avec données de démonstration dans `dev/donnees/`.
- Tests automatiques sur le VPS à chaque envoi (`dev/ci/`) : résultat dans `/opt/erp/journaux/tests/dernier.txt`, sur une base jetable séparée de la production.

## 0.7.0 (21/10/2026) — migration 006
Comptabilité générale (module 11) : retenues à la source à part, journaux, plan NC 01, CMUP ; encaissements et relances clients ;
factures et règlements fournisseurs ; articles créés par le comptable ; exports CSV/Excel ; factures export EUR/USD TVA 0 %, mentions art. 18.
Guide v1.5.

## 0.8.0 (21/10/2026) — migration 007
Produit fini : référence attribuée par le serveur (ex. P00126H), BOM, gamme, marquages, prix de revient (PRI) et prix de vente
(marge 40 %) ; contrôle « vente à perte » confirmé et tracé ; masquage des prix et coûts selon les droits ; 40 codes article ;
conversion des articles 0.7.0 ; clients Local / Export avec devise ; journaux et tableau de bord par devise ; écran « Produits finis ».

## 0.9.0 (21/10/2026) — Ventes complètes, migration 008
- **Devis (DEV)** et **proformas (PRO)** : nouveaux écrans dans Commercial ; numéro donné par le serveur (sans doublon ni trou) ;
  statuts émis / envoyé / accepté / refusé / expiré (validité dépassée) / transformé / annulé (motif obligatoire).
- **Transformation en un clic**, sans ressaisie : devis → proforma, devis ou proforma → commande (la commande arrive dans la Gestion,
  avec la référence du document d'origine). Un document transformé ne peut plus l'être une seconde fois.
- **Avoirs (AV)** partiels (quelques lignes, quelques pièces) ou totaux, rattachés à la facture ; impossible de créditer plus que facturé ;
  l'avoir est imputé sur le reste dû, le surplus est affiché « à rembourser ». Une facture qui a un avoir ne peut plus être annulée.
  Annulation d'un avoir : comptabilité seulement, avec motif. Les avoirs passent au journal des ventes (écriture inverse) et sont
  déduits du chiffre d'affaires dans le tableau de bord et l'export comptable.
- **Export** : devise du client (EUR / USD), TVA 0 %, sans timbre, taux de change mémorisé, Incoterms 2020 avec lieu, document en
  français ou en anglais (QUOTATION, PROFORMA INVOICE, CREDIT NOTE), **liste de colisage** (packing list) sur proforma et sur
  facture export (nouvel écran « Documents export »).
- **Vente à perte** : contrôle ligne par ligne sur chaque produit fini, y compris en devise (prix × taux de change) ; confirmation
  tracée à l'audit. Le contrôle s'applique aussi aux commandes en devise de la Gestion.
- **Modification sur plusieurs postes** : un devis ou une proforma ouvert est réservé 30 minutes à la personne qui l'a ouvert ;
  les autres le voient en lecture seule avec son nom. Un enregistrement fait sur une version ancienne est refusé.
- Menu Commercial : ajout de « Produits finis » (écran 0.8.0 qui n'était pas encore relié au menu) et « Documents export ».
- Sans le droit « voir les prix », le serveur n'envoie aucun montant (quantités seulement).
- **À faire confirmer par le comptable** : pas de droit de timbre sur un avoir ; texte de la mention légale export (champ
  « Mentions » de Paramètres › Société). **Hors périmètre** : facture électronique TEIF / TTN.
- Tests automatiques : 80 (dont 9 nouveaux sur les ventes).

## 0.9.1 (22/10/2026) — lignes modifiables, impression DIGITAL-TEX, FODEC, migration 009
- **Facture** : bouton « Modifier les lignes » dans la Gestion — désignation, quantité (par taille), prix, remise, suppression d'une ligne.
  Autorisé **tant que la facture n'est pas réglée** (aucun règlement, aucun avoir, aucun encaissement comptable, pas de référence TTN).
  Le numéro, la date, le client, les taux et le timbre ne changent pas ; une ligne issue d'une commande ne dépasse jamais le reste à facturer ;
  au moins une ligne ; contrôle vente à perte ; chaque modification est tracée (lignes avant / après, action `facture_lignes_modifiees`).
- **BL** : quantité modifiable et ligne supprimable **tant que le BL n'est pas facturé** (plafond : commandé − livré par les autres BL).
  Un BL facturé ne s'annule plus (annuler d'abord la facture) — contrôlé par le serveur.
- **Avoir** : bouton « Modifier » (Commercial › Avoirs) — quantités, prix baissé (erreur de prix, jamais au-dessus du prix facturé), ligne retirée ;
  montant recalculé, imputation sur la facture refaite, verrou 30 min + version, audit `avoir_modifie`. Un avoir annulé ne se modifie plus.
- **Impression au format DIGITAL-TEX** (modèle WinDev fourni) dans tous les modules : factures et BL (Gestion), devis, proformas et avoirs (Ventes),
  bouton « PDF » dans le journal des ventes et le relevé client (Comptabilité). Pagination automatique (folio 1/2…), montant en lettres,
  nombre total de pièces, BC client, Livreur / Matricule sur le BL, filigrane « ANNULÉ ». La liste de colisage garde sa mise en page.
- **FODEC 1 %** sur les ventes locales en dinars (produits, hors prestations), ajouté avant la TVA (TVA sur HT + FODEC), jamais à l'export.
  Taux daté dans Paramètres › Fiscalité (1 % au 01/01/2026), figé sur chaque facture à sa création ; les factures déjà émises ne changent pas.
  Compte proposé 4471 (Comptabilité générale › Plan). Colonne FODEC dans le journal des ventes. **À confirmer par le comptable** (taux, assiette, compte).

## 0.9.2 (22/10/2026) — timbre sur les avoirs, sans migration
- **L'avoir comporte le timbre et le FODEC de sa facture** (décision de l'utilisateur du 22/10/2026) : net de l'avoir = HT + FODEC + TVA + timbre.
  Facture export : ni timbre ni FODEC. Un avoir total solde donc exactement la facture.
- Écriture de l'avoir : timbre au débit du compte timbre (4472), à côté du FODEC (4471) et de la TVA ; colonne Timbre négative dans le journal des ventes.
- Écrans « Nouvel avoir » et « Modifier l'avoir » : FODEC et timbre indiqués dans l'estimation (montant exact calculé par le serveur).
- Les avoirs déjà émis ne sont pas recalculés (ils gardent leur montant d'origine).
- Confirmé par l'utilisateur : la modification d'une facture émise non réglée reste autorisée telle quelle.

## 0.10.0 (22/10/2026) — migration 010
Stocks (modules 8 et 9, lot 6 du CDC). Décisions de l'utilisateur : valorisation FIFO (à confirmer par le comptable),
lots et rouleaux de tissu dès maintenant, sortie automatique du stock PF à la validation d'un BL.
- Stock MP : état (physique, réservé, disponible, seuil, alertes), réceptions numérotées RMP (un lot par ligne, une ligne par
  rouleau pour le tissu : n° de lot, bain, métrage), sorties rouleau par rouleau ou FIFO, retours, transferts d'emplacement,
  ajustements justifiés ; jamais de stock matières négatif ; annulation d'une réception tant que rien n'en est sorti.
- Stock PF : par référence, taille et couleur ; entrées manuelles, retours clients, sorties, ajustements. Un BL créé, modifié
  ou annulé met le stock à jour dans la même transaction ; stock insuffisant → le BL passe, alerte affichée et `stock_pf_negatif` au journal.
- Inventaires MP et PF (INV), périodiques ou tournants : écart justifié obligatoire, passé en mouvement « Inventaire ».
- Valeurs (coûts FIFO) visibles seulement avec le droit « coûts de revient » ; le magasin voit les quantités.
- Compta générale › Valorisation : valeur des stocks MP + PF (FIFO). Exports CSV/Excel. Mouvements jamais supprimés ni modifiés.
- Non fait dans ce lot : écritures comptables de variation de stock (comptes à valider), réservations (lot 7 avec les OF).

## 0.10.1 (22/10/2026) — corrections Gestion commerciale, migration 011
Demandes de l'utilisateur du 22/10/2026 (module 02).
- **Bande de gauche** : bouton « « / » » pour passer en mode icônes (bande étroite, libellé au survol) ou détaillé ; mémorisé sur le poste.
- **Fenêtres de saisie** plein écran avec ─ (réduire en bas de l'écran, saisie conservée), ☐ (fenêtre / plein écran), ✕ (fermer). Le mot « libre » disparaît (« + Facture »).
- **Saisie par référence** : tableau Réf | Désignation | Service | Qté | PRIX H.T. | Remise % | Total H.T. ; en tapant une référence ou un mot, liste des produits finis et articles (Réf, désignation, type, PRIX H.T.).
- **PRIX H.T. partout** (commandes, BL, factures, devis, proformas, avoirs). Nouveaux documents saisis H.T. ; les documents déjà émis gardent leur mode (affichage converti en H.T.). Les commandes restent stockées TTC (format Studio), affichées H.T.
- **Remise par ligne** sur facture, devis, proforma.
- **Convertir en facture** : depuis un devis, une proforma (la commande est créée en même temps, le stock sort au BL) et depuis un BL.
- **Facture directe** et **BL direct** (la commande est créée automatiquement, origine « BL direct »). Lignes venant d'une commande saisie en **Infographie** : seuls le prix et la remise se modifient (contrôlé aussi par le serveur).
- **Fiches techniques** : double-clic sur une ligne (commande, BL, facture, devis, proforma, avoir, écrans sans prix) → PDF des fiches du Studio 3D (enregistré automatiquement à la génération) ou PDF / JPEG joint à la commande (« Joindre une fiche technique ») ou au produit fini, sinon l'illustration du produit fini.
- **Règlements et avances** : n° de document (chèque, effet, virement), banque (liste BCT 2026 : 25 établissements + Autre), échéance, **scan** (photo ou PDF, appareil photo sur tablette/téléphone).
- **Nouvel écran Commercial › Moyens de paiement** : recherche par client, type, mode, banque, n° de document, dates, échéance, montants, avec/sans scan ; totaux, export CSV, ouverture du scan.
- Migration 011 : `parametres.banques`, `commercial.fichiers` (fichiers stockés dans `/data/fichiers`, jamais effacés : retrait tracé au journal d'audit).

## 0.11.0 — 23/10/2026 — Production : OF en 3 parties + BOM versionnée (lot 7, partie web)
- BOM et gammes versionnées (pf.boms/pf.bom_lignes, pf.gammes/pf.gamme_operations) : modifier crée une nouvelle version, les OF lancés gardent la leur ; les BOM/gammes jsonb existantes sont reprises en version 1 (migration 012). Le PRI du produit est recalculé quand son prix est « calculé ».
- Ordres de fabrication (schéma prod) : création depuis une commande validée, numéro OF-AAAA-NNNN en transaction, quantités par taille/couleur, fiche technique figée SANS aucun prix ; signal « fiche modifiée » si le produit évolue après lancement.
- Réservations de matières au lancement de l'OF (stocks.reservations_mp) ; disponible = physique − réservé.
- 3 parties validées dans l'ordre (coupe → marquage → assemblage et finition), validation partielle possible ; OF sans marquage : partie 2 sans objet. Coupe validée = sorties MP réelles (rouleau/FIFO) + consommation des réservations ; assemblage validé = entrée PF au PRI. Annulation d'une validation par un responsable autorisé avec motif : mouvements inverses dans la même transaction. Tout est tracé à l'audit.
- Calcul des besoins (commande ou produit) : besoin (perte 9 % incluse) vs stock, « à commander » mis en évidence.
- Écrans web : Production › Ordres de fabrication + Calcul des besoins ; BOM › Nomenclatures versionnées + Gammes versionnées ; menus Stock mis à jour (entrées OF automatiques, réservations MP).
- Décisions du 23/10/2026 : lot 7 découpé — tablette PWA + pointage des heures + affectation simple au lot 0.12.0. Photos des validations : envoi prévu avec la tablette (le champ est prêt côté serveur).
- Tests : 105/105 (11 nouveaux). Prochaine migration : 013.
