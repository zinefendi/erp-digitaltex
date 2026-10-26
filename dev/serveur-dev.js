// Serveur de test local : API + fichiers web (remplace Nginx)
// Base de TEST uniquement (remise à zéro à chaque lancement). Lancer via dev/relancer.sh.
const path = require('path'), fs = require('fs');
const RACINE = path.join(__dirname, '..'), API = path.join(RACINE, 'api'), DON = path.join(__dirname, 'donnees');
if (process.env.PGHOST !== '/tmp' || process.env.PGPORT !== '5433') throw new Error('Serveur de dev réservé à la base locale de test');
process.chdir(API);
for (const d of ['/tmp/glb', '/tmp/sauv']) fs.mkdirSync(d, { recursive: true });
process.env.ERP_CATALOGUE_REPRISE = path.join(DON, 'catalogue-reprise.json');
process.env.ERP_CATALOGUE_USINE = path.join(DON, 'catalogue-usine.json');
process.env.ERP_GLB_DIR = '/tmp/glb'; process.env.ERP_SAUVEGARDES = '/tmp/sauv';
const { construire } = require(path.join(API, 'server.js'));
const { pool } = require(path.join(API, 'lib/db'));
const { migrer } = require(path.join(API, 'lib/migrations'));
require(path.join(API, 'lib/droits'))._viderCache();
const mdp = require(path.join(API, 'lib/mdp'));
(async () => {
  await pool.query(`drop schema if exists stocks cascade; drop schema if exists prod cascade; drop schema if exists ventes cascade; drop schema if exists pf cascade; drop schema if exists compta cascade; drop schema if exists registres cascade; drop schema if exists commercial cascade; drop schema if exists infographie cascade; drop schema if exists parametres cascade; drop schema if exists noyau cascade; drop schema if exists reprise cascade; drop table if exists public.migrations;
    create schema reprise; create table reprise.enregistrements (id bigserial primary key, collection text not null, id_origine text not null, donnees jsonb not null, unique (collection, id_origine));`);
  const logo = 'data:image/png;base64,' + require('fs').readFileSync(path.join(RACINE, 'web/studio/icon.png')).toString('base64');
  await pool.query(`insert into reprise.enregistrements (collection, id_origine, donnees) values
     ('parametres','societe',$1), ('parametres','gestion','{"blPrefix":"BL","orderPrefix":"CMD","invoicePrefix":"FAC","receiptPrefix":"REC"}'),
     ('compteurs','order:2026','{"dernier_numero":3}'), ('compteurs','invoice:2026','{"dernier_numero":2}'), ('compteurs','bl:2026','{"dernier_numero":1}'), ('compteurs','receipt:2026','{"dernier_numero":2}')`,
    [JSON.stringify({ mf: '1062705C/A/M/000', rc: '', rib: '', web: 'www.digital-tex-tunisie.com', bank: 'ATB', city: '4180', name: 'DIGITAL-TEX S.A.', email: 'contact@digital-tex-tunisie.com', phone: '+216 75 623 791', address: '2 rue thouraya', logo })]);
  const G = JSON.parse(fs.readFileSync(path.join(DON, 'gestion.json'), 'utf8'));
  for (const col of ['clients', 'orders', 'bls', 'invoices']) for (const d of G[col]) await pool.query('insert into reprise.enregistrements (collection, id_origine, donnees) values ($1,$2,$3)', [col, d.id, d]);
  // une commande en retard et une à livrer sous 7 jours, pour voir les alertes
  const o2 = structuredClone(G.orders[0]); o2.id = 'mvtestretard01'; o2.number = 'CMD-2026-0003'; o2.delivery = '2026-10-15'; o2.client = G.clients[0];
  await pool.query('insert into reprise.enregistrements (collection, id_origine, donnees) values ($1,$2,$3)', ['orders', o2.id, o2]);
  await migrer(pool, { info: () => {} });
  for (const [nom, d] of [['Tissage du Sahel', { code: 'F001', categorie: 'Tissus', telephone: '+216 73 000 000', ville: 'Monastir' }], ['Fils & Co', { code: 'F002', categorie: 'Fils', ville: 'Sousse' }]])
    await pool.query("insert into registres.fiches (registre, donnees) values ('fournisseurs', $1)", [{ nom, ...d }]);
  await pool.query("insert into registres.fiches (registre, donnees) values ('articles_mp', $1)", [{ code: 'MP001', designation: 'Sergé 65/35 240 g/m² laize 150', famille: 'Tissu', unite: 'm', couleur: 'Bleu marine', fournisseur: 'Tissage du Sahel', stock_mini: 200, prix_achat: 12.5 }]);
  // comptes de test : un infographiste et un responsable production (sans prix)
  for (const [id, nom, role] of [['dali', 'Med Ali Mhaya', 'infographie'], ['prod', 'Chef Atelier', 'production'], ['compta', 'Comptable', 'comptabilite']]) {
    const u = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ($1,$2,$3,false) returning id`, [id, nom, await mdp.hacher('Provisoire-1234')]);
    await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code=$2`, [u.rows[0].id, role]);
  }
  const h = await mdp.hacher('Provisoire-1234');
  const r = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash) values ('zine','Zine Fourati',$1) returning id`, [h]);
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code='super_admin'`, [r.rows[0].id]);
  // deux factures de démonstration : une impayée en DT, une export en EUR
  const r0 = (await pool.query("select donnees from commercial.documents where collection='invoices' order by id limit 1")).rows[0];
  if (r0) {
    const b = r0.donnees;
    for (const f of [{ ...b, id: 'mvtestimpaye01', number: 'FAC-2026-0003', date: '2026-09-01', due: '2026-09-30', payments: [], advance: 0 },
      { ...b, id: 'mvtestexport01', number: 'FAC-2026-0004', date: '2026-10-10', due: '2026-11-10', payments: [], advance: 0, currency: 'EUR', export: true, tva: 0, timbre: 0, pricesTTC: false, incoterm: 'FOB', lines: [{ designation: 'Tablier cuisine', qty: 200, pu: 7.5 }] }])
      await pool.query("insert into commercial.documents (collection,id,donnees) values ('invoices',$1,$2) on conflict do nothing", [f.id, f]);
  }
  const app = construire({ logger: false, limiteConnexion: 1000 });
  const WEB = path.join(RACINE, 'web');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.pdf': 'application/pdf', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
  app.get('/*', async (req, reply) => {
    let p = path.normalize(req.url.split('?')[0]); p = decodeURIComponent(p); if (p === '/' || !path.extname(p)) p = '/index.html';
    if (p.startsWith('/studio/')) { const S = require(path.join(API, 'lib/securite')); if (!(await S.chargerSession(req))) return reply.code(401).send('connexion requise'); }
    if (p === '/studio/catalogue.json') { const r = await app.inject({ method: 'GET', url: '/api/infographie/catalogue-brut', headers: { cookie: req.headers.cookie || '' } }); reply.code(r.statusCode).type('application/json'); return r.body; }
    const f = path.join(WEB, p); if (!f.startsWith(WEB) || !fs.existsSync(f)) return reply.code(404).send('');
    reply.type(types[path.extname(f)] || 'application/octet-stream'); return fs.readFileSync(f);
  });
  await app.listen({ host: '127.0.0.1', port: 8092 });
  console.log('pret');
})();
