'use strict';
// Tests lot 0.15.0 : fiches techniques versionnées (jamais d'écrasement), « Basique », proposition → commande à compléter
// sans numéro ni prix, validation commerciale (numéro à la validation, tampon, versions), OF bloqués sans BOM/gamme,
// codes-barres (taille × couleur, sachet), fibres / entretien, étiquettes (une par pièce, codes stables), Excel,
// traçabilité (connecté, sans montant), droits.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-'));
process.env.ERP_GLB_DIR = path.join(TMP, 'glb');
process.env.ERP_CATALOGUE_REPRISE = path.join(TMP, 'reprise.json');
process.env.ERP_CATALOGUE_USINE = path.join(TMP, 'usine.json');
process.env.ERP_SAUVEGARDES = path.join(TMP, 'sauv');
process.env.ERP_FICHIERS_DIR = path.join(TMP, 'fichiers');
fs.writeFileSync(process.env.ERP_CATALOGUE_USINE, JSON.stringify({ catalog: [], shop: { articles: {} }, models: {} }));

const { pool } = require('../lib/db');
const { migrer } = require('../lib/migrations');
const mdp = require('../lib/mdp');
const D = require('../lib/droits');
const E = require('../lib/etiquetage');
const { construire } = require('../server');
let app;
const appel = (method, url, { jeton, body, headers } = {}) => app.inject({ method, url, payload: body, headers: { ...(jeton ? { authorization: 'Bearer ' + jeton } : {}), ...(headers || {}) } });
const J = {};
async function compte(cle, roles) {
  const h = await mdp.hacher('Fiche-Polo-2026');
  const r = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ($1, $2, $3, false) returning id`, ['f.' + cle, 'Compte ' + cle, h]);
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code = any($2)`, [r.rows[0].id, roles]);
  J[cle] = (await appel('POST', '/api/auth/connexion', { body: { identifiant: 'f.' + cle, mot_de_passe: 'Fiche-Polo-2026' } })).json().jeton;
}
const AN = new Date().getFullYear();
let TISSU, CLIENT, FICHE, V1, BR, CMD;

test.before(async () => {
  await require('./_base').viderBase();
  await migrer(pool, { info: () => {} });
  D._viderCache();
  app = construire({ logger: false, limiteConnexion: 1000 }); await app.ready();
  for (const [k, r] of Object.entries({ admin: ['super_admin'], infographie: ['infographie'], commercial: ['commercial'], atelier: ['production'], magasin: ['magasin'] })) await compte(k, r);
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('clients', 'magic', $1), ('clients', 'autre', $2)`,
    [{ id: 'magic', name: 'Magic Life' }, { id: 'autre', name: 'Hôtel Sousse' }]);
  CLIENT = 'magic';
  TISSU = (await appel('POST', '/api/registres/articles_mp', { jeton: J.admin, body: { code: 'T65', designation: 'Polycoton 65/35', famille: 'Tissu', unite: 'm', prix_achat: 9 } })).json().id;
  await appel('POST', '/api/stocks/mp/receptions', { jeton: J.admin, body: { fournisseur: 'Tissage', lignes: [{ article_id: TISSU, qte: 200, n_lot: 'L9', bain: 'B1', rouleau: 'R7', cout_unitaire: 9 }] } });
});
test.after(async () => { await app.close(); await pool.end(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('étiquetage : clé EAN-13, Code 128, arabe en formes de présentation, fibres à 100 %', () => {
  assert.equal(E.cleEan13('619123456789'), String(E.cleEan13('619123456789')));
  assert.ok(E.eanValide('4006381333931'));
  assert.equal(E.modulesEan13('4006381333931').length, 95);
  assert.ok(E.modules128('DT00000001').startsWith('11010010000')); // Start B
  assert.equal(E.formerArabe('قطن'), '\uFED7\uFEC4\uFEE6');
  assert.equal(E.formerArabe('لا'), '\uFEFB');
  // dessin arabe : les nombres restent dans l'ordre (« 65% » et non « %56 »), segments posés de droite à gauche
  const traces = []; const page = { drawText: (t, o) => traces.push([t, o.x]) }; const font = { widthOfTextAtSize: (t) => [...t].length };
  E.dessinerArabe(page, 'بوليستر 65%', 100, 0, 6, font);
  assert.deepEqual(traces.map((x) => x[0]), ['بوليستر', '65%']); assert.ok(traces[1][1] < traces[0][1]);
  assert.throws(() => E.nettoyerFibres([{ fibre: 'coton', pct: 60 }]), /100 %/);
  assert.deepEqual(E.nettoyerFibres([{ fibre: 'coton', pct: 35 }, { fibre: 'polyester', pct: 65 }]).map((f) => f.fibre), ['polyester', 'coton']);
  assert.throws(() => E.nettoyerEntretien({ lavage: 'lav40' }), /incomplet/);
  assert.match(E.codeEtiquette(), /^[A-Z2-7]{10}$/);
});

test('Basique en premier ; fiche créée avec un produit spécifique (client sans marquage) ; aucun prix pour l’infographiste', async () => {
  const cl = (await appel('GET', '/api/fiches/clients', { jeton: J.infographie })).json();
  assert.deepEqual(cl[0], { id: '', nom: 'Basique', basique: true });
  const r = await appel('POST', '/api/fiches', { jeton: J.infographie, body: { code_article: 'P', sexe: 'H', taillant: ['S', 'M', 'L'], client_id: CLIENT, designation: 'Polo piqué MC', config_studio: { article: 'polo', couleurs: ['Blanc'] } } });
  assert.equal(r.statusCode, 201, r.body);
  FICHE = r.json();
  assert.equal(FICHE.ref_produit, `P001${String(AN).slice(2)}H`);
  assert.equal(FICHE.etat, 'specifique', 'client sans marquage → spécifique');
  assert.equal(FICHE.versions.length, 1); assert.equal(FICHE.versions[0].statut, 'brouillon');
  V1 = FICHE.versions[0].id;
  // codes-barres créés par taille (Code 128 interne, pas de préfixe GS1)
  const cb = (await appel('GET', `/api/produits/${FICHE.produit_id}/codes-barres`, { jeton: J.commercial })).json();
  assert.equal(cb.length, 3); assert.ok(cb.every((x) => x.type === 'CODE128' && /^DT\d{8}$/.test(x.code)));
  assert.ok(!JSON.stringify(await appel('GET', `/api/produits/${FICHE.produit_id}`, { jeton: J.infographie }).then((x) => x.json())).includes('prix_ht'));
});

test('versions : brouillon modifiable, verrou 30 min, conflit refusé ; une version proposée est figée (trigger)', async () => {
  let r = await appel('PUT', `/api/fiches/versions/${V1}`, { jeton: J.infographie, body: { version_ligne: 1, config_studio: { article: 'polo', couleurs: ['Blanc', 'Marine'] } } });
  assert.equal(r.statusCode, 200, r.body);
  r = await appel('PUT', `/api/fiches/versions/${V1}`, { jeton: J.infographie, body: { version_ligne: 1, config_studio: {} } });
  assert.equal(r.json().erreur, 'conflit_version');
  r = await appel('PUT', `/api/fiches/versions/${V1}`, { jeton: J.admin, body: { version_ligne: 2, config_studio: {} } });
  assert.equal(r.statusCode, 423, 'verrou tenu par l’infographiste');
  await assert.rejects(pool.query('delete from fiches.versions where id = $1', [V1]), /Suppression interdite/);
});

test('proposer : version figée, PDF avec identifiant caché, commande à compléter SANS numéro ni prix', async () => {
  const r = await appel('POST', `/api/fiches/versions/${V1}/proposer`, { jeton: J.infographie, body: {} });
  assert.equal(r.statusCode, 200, r.body);
  BR = r.json().brouillon_id;
  const v = (await pool.query('select statut, pdf_id from fiches.versions where id = $1', [V1])).rows[0];
  assert.equal(v.statut, 'proposee');
  await assert.rejects(pool.query(`update fiches.versions set config_studio = '{}' where id = $1`, [V1]), /figée/);
  // PDF : identifiant caché relu par « Ouvrir un PDF… »
  const f = (await pool.query('select chemin from commercial.fichiers where id = $1', [v.pdf_id])).rows[0];
  const octets = fs.readFileSync(path.join(process.env.ERP_FICHIERS_DIR, f.chemin));
  const o = await appel('POST', '/api/fiches/ouvrir-pdf', { jeton: J.infographie, body: octets, headers: { 'content-type': 'application/pdf' } });
  assert.equal(o.statusCode, 200, o.body); assert.equal(o.json().version_id, V1);
  // pas de commande CMD créée, pas de numéro consommé
  assert.equal((await pool.query(`select count(*)::int n from commercial.documents where collection = 'orders'`)).rows[0].n, 0);
  const b = (await appel('GET', `/api/commandes-a-completer/${BR}`, { jeton: J.infographie }));
  assert.equal(b.statusCode, 200);
  assert.ok(b.json().lignes.every((l) => l.pu === undefined), 'aucun prix pour l’infographiste');
});

test('nouvelle version : motif obligatoire ; la commande à compléter pointe sur la dernière version', async () => {
  let r = await appel('POST', `/api/fiches/${FICHE.id}/versions`, { jeton: J.infographie, body: { depuis: V1, motif: 'ok' } });
  assert.equal(r.statusCode, 400);
  r = await appel('POST', `/api/fiches/${FICHE.id}/versions`, { jeton: J.infographie, body: { depuis: V1, motif: 'Logo agrandi au dos' } });
  assert.equal(r.statusCode, 201, r.body);
  const v2 = r.json().nouvelle_version_id;
  r = await appel('POST', `/api/fiches/${FICHE.id}/versions`, { jeton: J.infographie, body: { depuis: V1, motif: 'Deuxième brouillon' } });
  assert.equal(r.json().erreur, 'brouillon_existant');
  r = await appel('POST', `/api/fiches/versions/${v2}/proposer`, { jeton: J.infographie, body: {} });
  assert.equal(r.json().brouillon_id, BR, 'même commande à compléter');
  const b = (await appel('GET', `/api/commandes-a-completer/${BR}`, { jeton: J.commercial })).json();
  assert.equal(b.lignes.length, 1); assert.equal(b.lignes[0].version, 2); assert.equal(b.lignes[0].fiche_version_id, v2);
  const cmp = (await appel('GET', `/api/fiches/comparer/${V1}/${v2}`, { jeton: J.infographie })).json();
  assert.ok(Array.isArray(cmp.differences));
});

test('validation : contrôles, OF bloqué sans BOM/gamme, numéro CMD à la validation, nom + date, PDF tamponné', async () => {
  let b = (await appel('GET', `/api/commandes-a-completer/${BR}`, { jeton: J.commercial })).json();
  let r = await appel('POST', `/api/commandes-a-completer/${BR}/valider`, { jeton: J.commercial, body: { version: b.version } });
  assert.equal(r.json().erreur, 'quantites_manquantes');
  r = await appel('PUT', `/api/commandes-a-completer/${BR}`, { jeton: J.infographie, body: { version: b.version, lignes: [] } });
  assert.equal(r.statusCode, 403, 'l’infographiste ne complète pas (prix)');
  r = await appel('PUT', `/api/commandes-a-completer/${BR}`, { jeton: J.commercial, body: { version: b.version, bc_client: 'BC-77', lignes: [{ fiche_version_id: b.lignes[0].fiche_version_id, pu: 30, detail: [{ couleur: 'Blanc', taille: 'M', qte: 3 }, { couleur: 'Blanc', taille: 'L', qte: 2 }] }] } });
  assert.equal(r.statusCode, 200, r.body);
  b = r.json();
  r = await appel('POST', `/api/commandes-a-completer/${BR}/valider`, { jeton: J.commercial, body: { version: b.version } });
  assert.equal(r.statusCode, 201, r.body);
  CMD = r.json().commande;
  assert.equal(CMD.numero, `CMD-${AN}-0001`);
  assert.equal(r.json().lancement.lances.length, 0);
  assert.match(r.json().lancement.bloques[0].motif, /nomenclature/);
  const v = (await pool.query(`select statut, valide_par_nom, pdf_valide_id, commande_numero from fiches.versions where fiche_id = $1 order by numero`, [FICHE.id])).rows;
  assert.equal(v[1].statut, 'validee'); assert.equal(v[1].valide_par_nom, 'Compte commercial'); assert.ok(v[1].pdf_valide_id); assert.equal(v[1].commande_numero, CMD.numero);
  const o = (await pool.query(`select donnees from commercial.documents where id = $1`, [CMD.id])).rows[0].donnees;
  assert.equal(o.lines.length, 2); assert.equal(o.clientPO, 'BC-77'); assert.equal(o.origine.type, 'infographie');
  const a = (await pool.query(`select count(*)::int n from noyau.audit where action in ('fiche_validee', 'commande_validee', 'of_lancement_bloque')`)).rows[0].n;
  assert.equal(a, 3);
});

test('OF lancés après BOM + gamme ; codes-barres ; étiquettes une par pièce, stables ; Excel ; traçabilité', async () => {
  await appel('POST', '/api/pf/boms', { jeton: J.admin, body: { produit_id: FICHE.produit_id, lignes: [{ article_id: TISSU, qte_base: 1.2 }] } });
  await appel('POST', '/api/pf/gammes', { jeton: J.admin, body: { produit_id: FICHE.produit_id, operations: [{ operation: 'Assemblage', temps_min: 20 }] } });
  let r = await appel('POST', `/api/prod/commandes/${CMD.id}/lancer-of`, { jeton: J.atelier, body: {} });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().lances.length, 1);
  const OF = r.json().lances[0];
  const fv = (await pool.query('select v.statut from fiches.versions v join prod.of o on o.fiche_version_id = v.id where o.id = $1', [OF.id])).rows[0];
  assert.equal(fv.statut, 'en_production');
  // étiquettes refusées tant que la composition du tissu n'est pas saisie
  r = await appel('POST', `/api/prod/of/${OF.id}/etiquettes`, { jeton: J.atelier });
  assert.equal(r.json().erreur, 'composition_manquante');
  const art = (await appel('GET', '/api/registres/articles_mp', { jeton: J.admin })).json().find((x) => x.id === TISSU);
  r = await appel('PUT', `/api/stocks/mp/articles/${TISSU}/composition`, { jeton: J.admin, body: { version: art.version, fibres: [{ fibre: 'coton', pct: 35 }, { fibre: 'polyester', pct: 60 }], entretien: { lavage: 'lav40', blanchiment: 'blanch_non', sechage: 'tamb_doux', repassage: 'rep2', pro: 'sec_p' } } });
  assert.equal(r.json().erreur, 'total_fibres');
  r = await appel('PUT', `/api/stocks/mp/articles/${TISSU}/composition`, { jeton: J.admin, body: { version: art.version, fibres: [{ fibre: 'coton', pct: 35 }, { fibre: 'polyester', pct: 65 }], entretien: { lavage: 'lav40', blanchiment: 'blanch_non', sechage: 'tamb_doux', repassage: 'rep2', pro: 'sec_p' } } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().composition, '65 % Polyester · 35 % Coton');
  // pièces par sachet = 2 → code « sachet » distinct
  r = await appel('PUT', `/api/produits/${FICHE.produit_id}/conditionnement`, { jeton: J.commercial, body: { pieces_par_sachet: 2 } });
  assert.equal(r.statusCode, 200, r.body);
  r = await appel('POST', `/api/prod/of/${OF.id}/etiquettes`, { jeton: J.atelier });
  assert.equal(r.statusCode, 200, r.body); assert.equal(r.json().nouvelles, 5 + 3, '5 pièces + 3 sachets (M : 2+1, L : 1)');
  r = await appel('POST', `/api/prod/of/${OF.id}/etiquettes`, { jeton: J.atelier });
  assert.equal(r.json().nouvelles, 0, 'régénérer = mêmes codes');
  const L = (await appel('GET', `/api/etiquettes?of_id=${OF.id}`, { jeton: J.magasin })).json();
  const comp = L.filter((e) => e.type === 'composition'), emb = L.filter((e) => e.type === 'emballage');
  assert.equal(comp.length, 5); assert.equal(emb.length, 3);
  assert.equal(new Set(L.map((e) => e.code)).size, 8);
  const cM = comp.find((e) => e.taille === 'M');
  assert.equal(cM.contenu.of, OF.numero); assert.equal(cM.contenu.origine_fr, 'Fabriqué en Tunisie'); assert.match(cM.contenu.date, /^\d{2}\/\d{4}$/);
  assert.equal(cM.contenu.fibres_ar, 'بوليستر 65% · قطن 35%');
  assert.notEqual(emb.find((e) => e.taille === 'M' && e.pieces === 2).code_barres, cM.code_barres, 'code sachet ≠ code pièce');
  assert.ok(!JSON.stringify(L).match(/"(pu|prix|prix_ht|montant)"/));
  // impression : réimpression sans motif refusée
  r = await appel('POST', '/api/etiquettes/imprimees', { jeton: J.magasin, body: { ids: comp.map((e) => e.id) } });
  assert.equal(r.json().nombre, 5);
  r = await appel('POST', '/api/etiquettes/imprimees', { jeton: J.magasin, body: { ids: [comp[0].id] } });
  assert.equal(r.json().erreur, 'motif_obligatoire');
  r = await appel('POST', '/api/etiquettes/imprimees', { jeton: J.magasin, body: { ids: [comp[0].id], motif: 'étiquette abîmée' } });
  assert.equal(r.statusCode, 200);
  // PDF et Excel
  r = await appel('GET', `/api/etiquettes/pdf?of_id=${OF.id}`, { jeton: J.atelier });
  assert.equal(r.statusCode, 200); assert.equal(r.rawPayload.slice(0, 5).toString(), '%PDF-');
  // format rouleau : une étiquette par page, au format exact 40 × 120 mm ; identifiants dans l'en-tête
  r = await appel('GET', `/api/etiquettes/pdf?of_id=${OF.id}&type=composition&format=rouleau`, { jeton: J.atelier });
  assert.equal(r.statusCode, 200); assert.equal(r.headers['x-etiquettes-ids'].split(',').length, 5);
  { const { PDFDocument } = require('pdf-lib'); const d = await PDFDocument.load(r.rawPayload); assert.equal(d.getPageCount(), 5); assert.equal(Math.round(d.getPage(0).getWidth() / 2.8346), 40); }
  r = await appel('GET', `/api/etiquettes/excel?commande_id=${CMD.id}`, { jeton: J.atelier });
  assert.equal(r.statusCode, 200); assert.match(r.headers['content-disposition'], new RegExp(`${CMD.numero}\\.xlsx`));
  assert.equal(r.rawPayload.slice(0, 2).toString(), 'PK');
  // traçabilité : connecté seulement, sans montant
  r = await appel('GET', `/api/tracabilite/${cM.code}`);
  assert.equal(r.statusCode, 401);
  r = await appel('GET', `/api/tracabilite/${cM.code}`, { jeton: J.infographie });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().of.numero, OF.numero); assert.equal(r.json().livraison.prevue !== undefined || r.json().livraison.bls, true);
  assert.ok(!/prix|montant|total/.test(JSON.stringify(r.json())));
});

test('dupliquer pour un autre client : nouvelle référence, source notée ; dupliquer une commande', async () => {
  const f = (await appel('GET', `/api/fiches/${FICHE.id}`, { jeton: J.infographie })).json();
  let r = await appel('POST', `/api/fiches/${FICHE.id}/dupliquer`, { jeton: J.infographie, body: { depuis: f.versions[0].id, client_id: 'autre' } });
  assert.equal(r.statusCode, 201, r.body);
  assert.notEqual(r.json().ref_produit, FICHE.ref_produit); assert.equal(r.json().source_fiche_id, FICHE.id); assert.equal(r.json().client_nom, 'Hôtel Sousse');
  const boms = (await appel('GET', `/api/pf/boms?produit_id=${r.json().produit_id}`, { jeton: J.admin })).json();
  assert.equal(boms.length, 1, 'BOM copiée');
  r = await appel('POST', `/api/commandes/${CMD.id}/dupliquer`, { jeton: J.commercial, body: {} });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().statut, 'a_completer'); assert.equal(r.json().origine, 'duplication');
  assert.equal((await pool.query(`select count(*)::int n from commercial.documents where collection = 'orders'`)).rows[0].n, 1, 'l’ancienne commande ne bouge pas');
});

test('droits : l’atelier ne crée pas de fiche, le magasin ne génère pas d’étiquettes, l’infographiste ne valide pas', async () => {
  assert.equal((await appel('POST', '/api/fiches', { jeton: J.atelier, body: { code_article: 'P', sexe: 'F' } })).statusCode, 403);
  const of = (await pool.query('select id from prod.of limit 1')).rows[0].id;
  assert.equal((await appel('POST', `/api/prod/of/${of}/etiquettes`, { jeton: J.magasin })).statusCode, 403);
  assert.equal((await appel('POST', '/api/commandes-a-completer/1/valider', { jeton: J.infographie, body: { version: 1 } })).statusCode, 403);
  assert.equal((await appel('PUT', '/api/parametres/etiquettes', { jeton: J.commercial, body: { gs1_prefixe: '6191234' } })).statusCode, 403);
  // préfixe GS1 saisi → EAN-13 pour les nouveaux codes
  assert.equal((await appel('PUT', '/api/parametres/etiquettes', { jeton: J.admin, body: { gs1_prefixe: '6191234' } })).statusCode, 200);
  const r = await appel('POST', `/api/produits/${FICHE.produit_id}/codes-barres`, { jeton: J.commercial, body: { couleurs: ['Rouge'] } });
  assert.ok(r.json().crees.length > 0 && r.json().crees.every((x) => x.type === 'EAN13' && E.eanValide(x.code) && x.code.startsWith('6191234')));
});

test('Basique n’est jamais un client de document de vente (commande, BL, facture)', async () => {
  const n = (await appel('POST', '/api/commercial/numero', { jeton: J.commercial, body: { kind: 'order' } })).json().numero;
  let r = await appel('PUT', '/api/commercial/orders', { jeton: J.commercial, body: { number: n, status: 'en_cours', client: { name: 'Basique' }, lines: [] } });
  assert.equal(r.json().erreur, 'client_obligatoire');
  r = await appel('PUT', '/api/commercial/orders', { jeton: J.commercial, body: { number: n, status: 'en_cours', client: { name: '' }, lines: [] } });
  assert.equal(r.json().erreur, 'client_obligatoire');
  r = await appel('POST', `/api/fiches/versions/${(await pool.query("select v.id from fiches.versions v join fiches.fiches f on f.id = v.fiche_id where f.client_id is null and v.statut = 'brouillon' limit 1")).rows[0]?.id || 0}/proposer`, { jeton: J.infographie, body: {} });
  assert.ok([400, 404].includes(r.statusCode));
});
