'use strict';
// Remise à zéro de la base de TEST (jamais utilisée sur le serveur).
const { pool } = require('../lib/db');
async function viderBase() {
  if (!/^(\/tmp|localhost|127\.0\.0\.1)$/.test(process.env.PGHOST || '') || process.env.PGPORT !== '5433') throw new Error('Tests réservés à la base locale de test (PGHOST=/tmp PGPORT=5433)');
  await pool.query('drop schema if exists infographie cascade; drop schema if exists commercial cascade; drop schema if exists registres cascade; drop schema if exists parametres cascade; drop schema if exists noyau cascade; drop schema if exists reprise cascade; drop table if exists public.migrations');
}
module.exports = { viderBase };
