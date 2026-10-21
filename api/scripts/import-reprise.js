'use strict';
// Étape 12 — Import des données locales Uniform Studio 3D (catalogue.json + gestion.json) dans la base ERP.
// - Données conservées à l'identique (JSONB) dans le schéma « reprise », une ligne par enregistrement d'origine.
// - Idempotent : relancer l'import ne crée aucun doublon (clé unique collection + identifiant d'origine) ;
//   une ligne n'est mise à jour que si son contenu a changé.
// - Produit un rapport par collection (source / insérés / mis à jour / inchangés / total en base).
// Usage : node import-reprise.js <dossier contenant catalogue/ et gestion/>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const DIR = process.argv[2] || '/reprise';
const pool = new Pool({ host: process.env.PGHOST || 'db', user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB });
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS reprise;
CREATE TABLE IF NOT EXISTS reprise.imports (
  id          bigserial PRIMARY KEY,
  importe_le  timestamptz NOT NULL DEFAULT now(),
  fichiers    jsonb NOT NULL,
  rapport     jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS reprise.enregistrements (
  id           bigserial PRIMARY KEY,
  collection   text NOT NULL,
  id_origine   text NOT NULL,
  numero       text,
  donnees      jsonb NOT NULL,
  empreinte    text NOT NULL,
  importe_le   timestamptz NOT NULL DEFAULT now(),
  maj_le       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection, id_origine)
);
CREATE INDEX IF NOT EXISTS enregistrements_numero_idx ON reprise.enregistrements (numero);
`;

function lireJSON(f) { const b = fs.readFileSync(f); return { data: JSON.parse(b.toString('utf8')), sha256: sha(b), octets: b.length }; }

function collections(cat, ges) {
  const out = {};
  const add = (col, id, rec, numero) => { (out[col] ||= []).push({ id: String(id), rec, numero: numero || null }); };
  // --- gestion
  for (const k of ['clients', 'orders', 'bls', 'invoices']) for (const r of ges[k] || []) add(k, r.id, r, r.number || r.name);
  for (const [k, v] of Object.entries(ges.counters || {})) add('compteurs', k, { cle: k, dernier_numero: v }, k);
  // --- catalogue
  for (const p of cat.catalog || []) add('produits', p.id, p, p.name);
  for (const [id, m] of Object.entries(cat.models || {})) add('modeles_3d', id, m, id);
  for (const s of cat.sections || []) add('sections', s.key, s, s.label);
  for (const f of cat.families || []) add('familles', f.key, f, f.label);
  (cat.staff || []).forEach((s, i) => add('staff', s, { libelle: s, ordre: i }, s));
  const shop = cat.shop || {};
  const each = (v, f) => Array.isArray(v) ? v.forEach((x, i) => f(x, i)) : Object.entries(v || {}).forEach(([k, x]) => f(x, k));
  each(shop.articles, (a, k) => add('articles_tarifs', typeof k === 'string' ? k : (a.id || k), a, a.name || k));
  each(shop.colors, (c, k) => { const o = Array.isArray(c) ? { nom: c[0], hex: c[1] } : c; add('couleurs', o.hex || o.nom || k, o, o.nom || o.hex); });
  const { articles, colors, ...tarifs } = shop;
  add('parametres', 'tarifs', tarifs, 'tarifs');
  add('parametres', 'societe', cat.company || {}, 'societe');
  add('parametres', 'gestion', cat.gestion || {}, 'gestion');
  add('parametres', 'atelier', cat.atelier || {}, 'atelier');
  const { catalog, models, sections, families, staff, shop: _s, company, gestion, atelier, ...general } = cat;
  add('parametres', 'general', general, 'general');
  return out;
}

(async () => {
  const fc = path.join(DIR, 'catalogue', 'catalogue.json');
  const fg = path.join(DIR, 'gestion', 'gestion.json');
  const C = lireJSON(fc), G = lireJSON(fg);
  const cols = collections(C.data, G.data);
  const client = await pool.connect();
  const rapport = {};
  try {
    await client.query('BEGIN');
    await client.query(SCHEMA);
    for (const [col, recs] of Object.entries(cols)) {
      const r = { source: recs.length, inseres: 0, mis_a_jour: 0, inchanges: 0 };
      const vus = new Set();
      for (const { id, rec, numero } of recs) {
        let key = id; let n = 2; while (vus.has(key)) key = id + '#' + n++; vus.add(key);
        const json = JSON.stringify(rec); const emp = sha(Buffer.from(json));
        const q = await client.query(
          `INSERT INTO reprise.enregistrements (collection, id_origine, numero, donnees, empreinte)
           VALUES ($1,$2,$3,$4::jsonb,$5)
           ON CONFLICT (collection, id_origine) DO UPDATE
             SET donnees = EXCLUDED.donnees, numero = EXCLUDED.numero, empreinte = EXCLUDED.empreinte, maj_le = now()
             WHERE reprise.enregistrements.empreinte <> EXCLUDED.empreinte
           RETURNING (xmax = 0) AS insere`, [col, key, numero, json, emp]);
        if (q.rowCount === 0) r.inchanges++; else if (q.rows[0].insere) r.inseres++; else r.mis_a_jour++;
      }
      r.total_en_base = +(await client.query('SELECT count(*) FROM reprise.enregistrements WHERE collection=$1', [col])).rows[0].count;
      rapport[col] = r;
    }
    const fichiers = { catalogue: { sha256: C.sha256, octets: C.octets }, gestion: { sha256: G.sha256, octets: G.octets } };
    await client.query('INSERT INTO reprise.imports (fichiers, rapport) VALUES ($1::jsonb,$2::jsonb)', [JSON.stringify(fichiers), JSON.stringify(rapport)]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); console.error('ÉCHEC — aucune donnée modifiée :', e.message); process.exit(1); }
  finally { client.release(); await pool.end(); }
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('collection', 18) + pad('source', 8) + pad('inseres', 9) + pad('maj', 6) + pad('inchanges', 11) + 'en_base');
  let ok = true;
  for (const [c, r] of Object.entries(rapport)) {
    if (r.total_en_base < r.source) ok = false;
    console.log(pad(c, 18) + pad(r.source, 8) + pad(r.inseres, 9) + pad(r.mis_a_jour, 6) + pad(r.inchanges, 11) + r.total_en_base);
  }
  console.log(ok ? 'IMPORT-OK' : 'IMPORT-INCOMPLET');
})();
