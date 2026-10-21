#!/bin/sh
# (Re)lance le serveur de dev sur 127.0.0.1:8092 avec les données de démonstration (base de test remise à zéro).
RACINE=$(cd "$(dirname "$0")/.." && pwd)
for p in $(ss -ltnp | grep ':8092 ' | grep -o 'pid=[0-9]*' | cut -d= -f2); do kill "$p"; done
sleep 1
cd "$RACINE/api" && PGHOST=/tmp PGPORT=5433 POSTGRES_USER=erp POSTGRES_PASSWORD=x POSTGRES_DB=erp \
  setsid nohup node "$RACINE/dev/serveur-dev.js" > /tmp/dev.log 2>&1 < /dev/null &
for i in $(seq 1 20); do grep -q pret /tmp/dev.log 2>/dev/null && break; sleep 1; done
cat /tmp/dev.log
echo "Jeton : curl -s -XPOST localhost:8092/api/auth/connexion -H 'content-type: application/json' -d '{\"identifiant\":\"compta\",\"mot_de_passe\":\"Provisoire-1234\"}'"
echo "Comptes de test (dev seulement) : zine (super admin), dali (infographie), prod (production), compta (comptabilité) — mot de passe Provisoire-1234"
