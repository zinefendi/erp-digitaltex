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
