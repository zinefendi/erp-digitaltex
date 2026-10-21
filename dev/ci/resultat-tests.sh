#!/bin/sh
# Depuis le bac à sable : affiche le résultat des tests du VPS pour le dernier envoi (attend s'il n'est pas prêt).
SHA=${1:-$(git -C "$(dirname "$0")/../.." rev-parse HEAD)}
K="-i $HOME/.ssh/erp_agent -o IdentitiesOnly=yes -o BatchMode=yes"
for i in $(seq 1 24); do
  ssh $K digitaltex@2.24.44.233 "cat /opt/erp/journaux/tests/$SHA.txt 2>/dev/null" && exit 0
  sleep 10
done
echo "Pas encore de résultat pour $SHA"; exit 1
