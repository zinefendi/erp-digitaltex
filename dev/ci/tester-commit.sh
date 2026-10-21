#!/bin/sh
# Tests automatiques sur le VPS, lancés par le hook post-receive du dépôt /opt/erp/code-source/erp.git.
# Base PostgreSQL JETABLE dans un conteneur à part (port 127.0.0.1:5433) — ne touche jamais la base de production.
# Usage : tester-commit.sh <sha>   → résultat dans /opt/erp/journaux/tests/<sha>.txt et dernier.txt
set -u
SHA=$1; DEPOT=/opt/erp/code-source/erp.git; OUT=/opt/erp/journaux/tests; mkdir -p "$OUT"
W=$(mktemp -d /tmp/erp-ci.XXXXXX); DB=erp-ci-db-$$; LOG="$OUT/$SHA.txt"
nettoyer() { docker rm -f "$DB" >/dev/null 2>&1; docker run --rm -v "$W:/w" alpine:3 rm -rf /w/api >/dev/null 2>&1; rm -rf "$W"; }
trap nettoyer EXIT
{
  echo "Commit $SHA — $(git --git-dir="$DEPOT" log -1 --format=%s "$SHA" | cut -c1-120)"
  echo "Début : $(date '+%F %T')"
  git --git-dir="$DEPOT" archive "$SHA" api | tar -x -C "$W"
  docker run -d --rm --name "$DB" -p 127.0.0.1:5433:5432 -e POSTGRES_USER=erp -e POSTGRES_PASSWORD=x -e POSTGRES_DB=erp \
    --memory 512m postgres:16-alpine >/dev/null
  for i in $(seq 1 30); do docker exec "$DB" pg_isready -q -U erp && break; sleep 1; done
  docker run --rm --network host --memory 768m --cpus 1 -v "$W/api:/app" -u "$(id -u):$(id -g)" -e HOME=/tmp -w /app \
    -e PGHOST=127.0.0.1 -e PGPORT=5433 -e POSTGRES_USER=erp -e POSTGRES_PASSWORD=x -e POSTGRES_DB=erp node:22-alpine \
    sh -c 'npm ci --no-audit --no-fund --silent && node --test --test-concurrency=1 tests/*.test.js 2>&1 | tail -12'
  echo "Fin : $(date '+%F %T')"
} > "$LOG" 2>&1
if grep -q '^# fail 0' "$LOG"; then V="VERT"; else V="ROUGE"; fi
sed -i "1i RÉSULTAT : $V" "$LOG"
cp "$LOG" "$OUT/dernier.txt"
