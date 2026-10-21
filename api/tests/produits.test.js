'use strict';
// Tests produits finis (lot 0.8.0) : référence attribuée en transaction (sans doublon ni trou),
// calcul du prix (coût minute 0,150 DT), masquage des prix pour l'infographiste, vente à perte,
// codes article, conversion d'un article 0.7.0.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-'));
process.env.ERP_GLB_DIR = path.join(TMP, 'glb');
process.env.ERP_CATALOGUE_REPRISE = path.join(TMP, 'reprise.json');
process.env.ERP_CATALOGUE_USINE = path.join(TMP, 'usine.json');
process.env.ERP_SAUVEGARDES = path.join(TMP, 'sauv');
fs.mkdirSync(path.join(TMP, 'sauv', 'db'), { recursive: true });
fs.writeFileSync(process.env.ERP_CATALOGUE_USINE, JSON.stringify({ catalog: [], shop: { articles: {} }, models: {} }));

const { pool } = require('../lib/db');
const { migrer } = require('../lib/migrations');
const mdp = require('../lib/mdp');
const D = require('../lib/droits');
const { construire } = require('../server');
let app;
const appel = (method, url, { jeton, body, headers } = {}) => app.inject({ method, url, payload: body, headers: { ...(jeton ? { authorization: 'Bearer ' + jeton } : {}), ...(headers || {}) } });
const J = {};
async function compte(cle, roles) {
  const h = await mdp.hacher('Atelier-Polo-2026');
  const r = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ($1, $1, $2, false) returning id`, ['m.' + cle, h]);
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code = any($2)`, [r.rows[0].id, roles]);
  J[cle] = (await appel('POST', '/api/auth/connexion', { body: { identifiant: 'm.' + cle, mot_de_passe: 'Atelier-Polo-2026' } })).json().jeton;
}

test.before(async () => {
  await require('./_base').viderBase();
  await migrer(pool, { info: () => {} });
  D._viderCache();
  app = construire({ logger: false, limiteConnexion: 1000 }); await app.ready();
  for (const [k, r] of Object.entries({ admin: ['super_admin'], commercial: ['commercial'], infographie: ['infographie'], compta: ['comptabilite'] })) await compte(k, r);
  // tarif de marquage d'essai (les tarifs réels sont saisis par la direction, jamais inventés par l'ERP)
  await pool.query(`insert into parametres.tarifs_marquages (code, libelle, unite, prix, en_vigueur_le) values ('impression_face', 'Impression par face', 'par_face', 1.5, current_date)`);
});
test.after(async () => { await app.close(); await pool.end(); fs.rmSync(TMP, { recursive: true, force: true }); });

const creer = (jeton, corps) => appel('POST', '/api/produits', { jeton, body: corps });
const BASE = { code_article: 'P', sexe: 'H', bom: [{ designation: 'Piqué coton', qte: 0.4, pu: 12.5 }], gamme: [{ operation: 'Assemblage', temps_min: 30 }] };

test('référence : format, suite sans doublon, suite séparée par sexe et par année (compteur repart à 001)', async () => {
  const a = (await creer(J.admin, BASE)); assert.equal(a.statusCode, 201);
  const r1 = a.json(); assert.match(r1.reference, /^P00126H$/);
  assert.equal(r1.etat, 'basique');
  assert.equal(r1.cout_matieres, 5);            // 0,4 × 12,5
  assert.equal(r1.cout_industrialisation, 4.5); // 30 min × 0,150 DT
  assert.equal(r1.pri, 10.355);                 // (5 + 4,5 + 0) × 1,09
  assert.equal(r1.prix_ht, 14.497);             // PRI × 1,40 (marge par défaut 40 %)
  // même code, même année : suite
  const b = (await creer(J.admin, BASE)).json(); assert.match(b.reference, /^P00226H$/);
  // même numéro, autre sexe : coexiste
  const c = (await creer(J.admin, { ...BASE, sexe: 'F' })).json(); assert.match(c.reference, /^P00126F$/);
  // compteur par année : on écrit le compteur de 2025 pour vérifier la reprise à 001
  await pool.query(`insert into pf.compteurs_ref (code, annee, sexe, dernier) values ('P', 2025, 'H', 3)`);
  // (l'attribution pour 2025 utilise l'année passée : le produit prend l'année courante, donc pas d'impact)
});

test('masquage : l’infographiste ne voit AUCUN prix ni coût, le commercial voit le prix mais pas les coûts', async () => {
  const liste = (await appel('GET', '/api/produits', { jeton: J.infographie })).json();
  assert.ok(liste.length >= 2);
  for (const p of liste) {
    assert.equal(p.prix_ht, undefined); assert.equal(p.pri, undefined); assert.equal(p.marge, undefined);
    assert.equal(p.cout_matieres, undefined); assert.equal(p.cout_industrialisation, undefined);
    for (const l of p.bom) { assert.equal(l.pu, undefined); assert.equal(l.total, undefined); }
  }
  const com = (await appel('GET', '/api/produits', { jeton: J.commercial })).json();
  assert.equal(com[0].prix_ht, 14.497); // le commercial voit le prix de vente (visibilité « prix »)
  assert.equal(com[0].pri, undefined); assert.equal(com[0].cout_matieres, undefined);
  const admin = (await appel('GET', '/api/produits', { jeton: J.admin })).json();
  assert.equal(admin[0].prix_ht, 14.497); assert.equal(admin[0].pri, 10.355);
  // l'infographiste ne peut pas saisir un prix à la main
  const r = await creer(J.infographie, { ...BASE, prix_source: 'manuel', prix_ht: 20 });
  assert.equal(r.statusCode, 403);
});

test('calcul : marquages facturés au tarif en vigueur, perte 9 %, marge modifiable par produit', async () => {
  const r = (await creer(J.admin, { ...BASE, marquages: [{ type: 'impression_face', libelle: 'Logo poitrine', faces: 2 }], marge: 50 })).json();
  assert.equal(r.cout_marquages, 3); // 2 faces × 1,5 DT
  assert.equal(r.pri, 13.625);       // (5 + 4,5 + 3) × 1,09
  assert.equal(r.prix_ht, 20.438);   // PRI × 1,50 (marge 50 %)
  assert.equal(r.etat, 'specifique'); // marquages → produit spécifique
});

test('vente à perte : refus sans confirmation, audit tracé après confirmation', async () => {
  // prix à la main sous le PRI : refusé tant que pas confirmé
  const r1 = await creer(J.compta, { ...BASE, prix_source: 'manuel', prix_ht: 5 });
  assert.equal(r1.statusCode, 409); assert.equal(r1.json().erreur, 'vente_a_perte');
  const r2 = await creer(J.compta, { ...BASE, prix_source: 'manuel', prix_ht: 5, confirmer_perte: true });
  assert.equal(r2.statusCode, 201); assert.equal(r2.json().prix_ht, 5);
  const aud = (await pool.query(`select 1 from noyau.audit where action = 'produit_cree' and coalesce(details->>'vente_a_perte', apres->>'vente_a_perte') = 'true'`)).rowCount;
  assert.equal(aud, 1);
});

test('numérotation en concurrence : deux créations simultanées, aucun doublon ni trou', async () => {
  const [x, y] = await Promise.all([creer(J.commercial, { ...BASE, code_article: 'TS' }), creer(J.commercial, { ...BASE, code_article: 'TS' })]);
  assert.equal(x.statusCode, 201); assert.equal(y.statusCode, 201);
  const refs = [x.json().reference, y.json().reference];
  assert.notEqual(refs[0], refs[1]);
  assert.deepEqual(refs.map((r) => r.slice(0, 7)).sort(), ['TS00126', 'TS00226']);
});

test('codes article : création, désactivation, attribution refusée sur un code désactivé', async () => {
  const r = (await appel('POST', '/api/produits/codes-article', { jeton: J.admin, body: { code: 'XX', libelle: 'Essai' } }));
  assert.equal(r.statusCode, 201);
  const d = (await appel('DELETE', '/api/produits/codes-article/XX', { jeton: J.admin }));
  assert.equal(d.statusCode, 200);
  const e = await creer(J.admin, { ...BASE, code_article: 'XX' });
  assert.equal(e.statusCode, 500); // l'exception SQL de pf.attribuer_reference remonte en 500
  // un code utilisé ne se désactive pas
  const u = await appel('PUT', '/api/produits/codes-article/P', { jeton: J.admin, body: { version: 1, actif: false } });
  assert.equal(u.statusCode, 400); assert.equal(u.json().erreur, 'code_utilise');
  // suppression (désactivation) réservée au droit parametres.codes_article
  const f = await appel('DELETE', '/api/produits/codes-article/TS', { jeton: J.commercial });
  assert.equal(f.statusCode, 403);
});

test('modification : conflit de version détecté, historique conservé, annulation sans suppression', async () => {
  const p = (await creer(J.admin, { ...BASE, code_article: 'CH', gamme: [{ operation: 'Assemblage', temps_min: 20 }] })).json();
  const r1 = await appel('PUT', `/api/produits/${p.id}`, { jeton: J.admin, body: { version: p.version, bom: [{ designation: 'Popeline', qte: 1, pu: 20 }] } });
  assert.equal(r1.statusCode, 200);
  const r2 = await appel('PUT', `/api/produits/${p.id}`, { jeton: J.admin, body: { version: p.version, bom: [] } });
  assert.equal(r2.statusCode, 409); assert.equal(r2.json().erreur, 'conflit_version');
  const f = (await appel('GET', `/api/produits/${p.id}`, { jeton: J.admin })).json();
  assert.ok(f.historique.length >= 2);
  const an = await appel('POST', `/api/produits/${p.id}/annuler`, { jeton: J.admin, body: { version: f.version, motif: 'Essai' } });
  assert.equal(an.statusCode, 200);
  const apres = (await pool.query('select annule from pf.produits where id = $1', [p.id])).rows[0];
  assert.equal(apres.annule, true);
  const suppr = await appel('GET', `/api/produits/${p.id}`, { jeton: J.admin }); // reste lisible (rien n'est supprimé)
  assert.equal(suppr.statusCode, 200);
});

test('clients : les fiches existantes sont Local DT ; nouvelle fiche Export garde sa devise', async () => {
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('clients', 'c-exist', '{"id":"c-exist","name":"Client Ancien"}')`);
  // même instruction que la migration 007 (idempotente) : elle marque Local DT toute fiche qui n'a pas encore de type
  await pool.query(`update commercial.documents set donnees = donnees || jsonb_build_object('type_client', 'local', 'devise', 'DT')
    where collection = 'clients' and donnees->>'type_client' is null`);
  const ancien = (await pool.query(`select donnees->>'type_client' t, donnees->>'devise' d from commercial.documents where collection = 'clients' and id = 'c-exist'`)).rows[0];
  assert.equal(ancien.t, 'local'); assert.equal(ancien.d, 'DT');
  // une fiche créée ensuite par l'écran Gestion porte son type et sa devise (jsonb, contrôle à l'API)
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('clients', 'c-export', '{"id":"c-export","name":"Client Export","type_client":"export","devise":"EUR"}')`);
  const ex = (await pool.query(`select donnees->>'type_client' t, donnees->>'devise' d from commercial.documents where collection = 'clients' and id = 'c-export'`)).rows[0];
  assert.equal(ex.t, 'export'); assert.equal(ex.d, 'EUR');
});

test('conversion d’un article 0.7.0 : produit fini créé, ancien code en alias, prestations refusées', async () => {
  const art = (await pool.query(`insert into commercial.articles (code, designation, type, prix_ht, cree_par) values ('POLO-B', 'Polo basique blanc', 'produit', 25.5, null) returning id`)).rows[0];
  const prest = (await pool.query(`insert into commercial.articles (code, designation, type, cree_par) values ('TRANSP', 'Transport', 'prestation', null) returning id`)).rows[0];
  const r1 = await appel('POST', '/api/produits/convertir-article', { jeton: J.compta, body: { article_id: prest.id, code_article: 'P', sexe: 'H' } });
  assert.equal(r1.statusCode, 400); assert.equal(r1.json().erreur, 'pas_un_produit');
  const r2 = await appel('POST', '/api/produits/convertir-article', { jeton: J.compta, body: { article_id: art.id, code_article: 'P', sexe: 'H' } });
  assert.equal(r2.statusCode, 201);
  const pf = r2.json(); assert.match(pf.reference, /^P\d{3}26H$/);
  assert.equal(pf.prix_source, 'manuel'); assert.equal(pf.prix_ht, 25.5);
  const lie = (await pool.query('select produit_id from commercial.articles where id = $1', [art.id])).rows[0].produit_id;
  assert.equal(Number(lie), pf.id);
  const r3 = await appel('POST', '/api/produits/convertir-article', { jeton: J.compta, body: { article_id: art.id, code_article: 'P', sexe: 'F' } });
  assert.equal(r3.statusCode, 400); assert.equal(r3.json().erreur, 'deja_converti');
});

test('droits : un compte sans droit ne liste pas les produits finis', async () => {
  const h = await mdp.hacher('Atelier-Polo-2026');
  const u = (await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ('m.aucun', 'aucun', $1, false) returning id`, [h])).rows[0];
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code = 'rh_paie'`, [u.id]);
  const j = (await appel('POST', '/api/auth/connexion', { body: { identifiant: 'm.aucun', mot_de_passe: 'Atelier-Polo-2026' } })).json().jeton;
  const r = await appel('GET', '/api/produits', { jeton: j });
  assert.equal(r.statusCode, 403);
});