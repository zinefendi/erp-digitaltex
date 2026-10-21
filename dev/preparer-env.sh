#!/bin/sh
# Remet en place l'environnement de développement en UNE commande (bac à sable recyclé).
#   sh dev/preparer-env.sh            → PostgreSQL de test + dépendances npm
#   sh dev/preparer-env.sh --tests    → idem + lance tous les tests
#   sh dev/preparer-env.sh --serveur  → idem + serveur de dev (port 8092)
# Base de TEST uniquement : socket /tmp, port 5433, utilisateur erp (aucun mot de passe réel).
set -e
RACINE=$(cd "$(dirname "$0")/.." && pwd)
PORT=${PGDEV_PORT:-5433}
DATA=${PGDEV_DIR:-/tmp/pgt}
PGBIN=/usr/lib/postgresql/16/bin
if ! "$PGBIN/pg_isready" -q -h /tmp -p "$PORT" 2>/dev/null; then
  [ -x "$PGBIN/postgres" ] || { sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-16 >/dev/null; }
  sudo mkdir -p "$DATA" && sudo chown postgres "$DATA" && sudo chmod 700 "$DATA"
  sudo -u postgres test -f "$DATA/PG_VERSION" || sudo -u postgres "$PGBIN/initdb" -D "$DATA" -A trust -U erp --no-instructions >/dev/null
  sudo -u postgres "$PGBIN/pg_ctl" -s -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA.log" start
  for i in 1 2 3 4 5 6 7 8 9 10; do "$PGBIN/pg_isready" -q -h /tmp -p "$PORT" && break; sleep 1; done
fi
"$PGBIN/psql" -h /tmp -p "$PORT" -U erp -d postgres -Atqc "select 1 from pg_database where datname='erp'" | grep -q 1 \
  || "$PGBIN/createdb" -h /tmp -p "$PORT" -U erp erp
echo "PostgreSQL de test prêt (port $PORT)"
[ -d "$RACINE/api/node_modules" ] || (cd "$RACINE/api" && npm ci --no-audit --no-fund --silent)
echo "Dépendances API prêtes"
case "$1" in
  --tests) sh "$RACINE/dev/tester.sh" ;;
  --serveur) sh "$RACINE/dev/relancer.sh" ;;
esac
