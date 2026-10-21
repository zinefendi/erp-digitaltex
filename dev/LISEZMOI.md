# Développement — reprise rapide
1. `sh dev/preparer-env.sh --tests` (PostgreSQL de test sur /tmp:5433 + npm + tests)
2. `sh dev/relancer.sh` → http://127.0.0.1:8092 (comptes de test : zine, dali, prod, compta / Provisoire-1234 — dev seulement)
3. Envoi : `git push vps main` puis `sh dev/ci/resultat-tests.sh` (tests rejoués sur le VPS, base jetable)
Navigateur (Playwright) : `mkdir -p /tmp/pw && cp dev/pw-package.json /tmp/pw/package.json && cd /tmp/pw && npm i && npx playwright install chromium`
