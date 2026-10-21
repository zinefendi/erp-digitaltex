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

## Prochaine : 0.8.0 — produit fini + clients Local/Export (migration 007)
Voir la spec validée dans la compétence `erp-digitaltex` (SPEC-PRODUIT-FINI-v2.md).
