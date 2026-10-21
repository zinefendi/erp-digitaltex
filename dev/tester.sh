#!/bin/sh
# Lance les tests de l'API sur la base de test locale. Usage : sh dev/tester.sh [tests/x.test.js…]
# Affiche seulement le bilan (et le détail des échecs) ; journal complet dans /tmp/tests.log.
RACINE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RACINE/api" || exit 1
[ $# -gt 0 ] || set -- tests/*.test.js
PGHOST=/tmp PGPORT=5433 POSTGRES_USER=erp POSTGRES_PASSWORD=x POSTGRES_DB=erp \
  node --test --test-concurrency=1 "$@" > /tmp/tests.log 2>&1
CODE=$?
grep -E '^not ok|^# (tests|pass|fail)' /tmp/tests.log
[ $CODE -eq 0 ] && echo "TESTS VERTS" || { echo "TESTS ROUGES — détail : grep -A30 'not ok' /tmp/tests.log"; }
exit $CODE
