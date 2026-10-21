'use strict';
// Applique dans l'ordre les fichiers migrations/NNN_*.sql pas encore appliqués.
// Chaque fichier passe dans sa propre transaction ; un verrou empêche deux lancements simultanés.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function migrer(pool, log = console) {
  const dir = path.join(__dirname, '..', 'migrations');
  const fichiers = fs.readdirSync(dir).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const c = await pool.connect();
  try {
    await c.query('select pg_advisory_lock(727001)');
    await c.query(`create table if not exists public.migrations (
      fichier text primary key, empreinte text not null, appliquee_le timestamptz not null default now())`);
    const deja = new Map((await c.query('select fichier, empreinte from public.migrations')).rows.map((r) => [r.fichier, r.empreinte]));
    const appliquees = [];
    for (const f of fichiers) {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      const emp = crypto.createHash('sha256').update(sql).digest('hex');
      if (deja.has(f)) {
        if (deja.get(f) !== emp) throw new Error(`Migration ${f} modifiée après application : créer une nouvelle migration au lieu de la changer.`);
        continue;
      }
      await c.query('begin');
      try {
        await c.query(sql);
        await c.query('insert into public.migrations (fichier, empreinte) values ($1, $2)', [f, emp]);
        await c.query('commit');
      } catch (e) {
        await c.query('rollback');
        throw new Error(`Migration ${f} en échec : ${e.message}`);
      }
      appliquees.push(f);
      log.info(`Migration appliquée : ${f}`);
    }
    return appliquees;
  } finally {
    try { await c.query('select pg_advisory_unlock(727001)'); } catch (_) { /* ignore */ }
    c.release();
  }
}

module.exports = { migrer };
