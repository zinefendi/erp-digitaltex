'use strict';
// Tests interface ERP v1 : catalogue + GLB, gestion commerciale en réseau (droits, masquage, règles), registres.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-'));
process.env.ERP_GLB_DIR = path.join(TMP, 'glb');
process.env.ERP_CATALOGUE_REPRISE = path.join(TMP, 'reprise.json');
process.env.ERP_CATALOGUE_USINE = path.join(TMP, 'usine.json');
process.env.ERP_SAUVEGARDES = path.join(TMP, 'sauv');
fs.mkdirSync(path.join(TMP, 'sauv', 'db'), { recursive: true }); fs.writeFileSync(path.join(TMP, 'sauv', 'db', 'erp_2026-10-21_0230.dump'), 'x');
const CAT = { catalog: [{ id: 'polo_h', name: 'Polo' }], models: { polo_h: { url: 'models/polo_h.glb' }, perso: { url: 'user-models/perso-abc.glb' } },
  shop: { articles: { polo_h: { name: 'Polo', price: 41.99, sp: { XL: 44 }, sizes: ['M'] } }, colors: [['Bleu', '#29669d']], printPrice: 4, embSetup: 10, embPiece: 0.5, money: { sym: 'DT' } }, passPrice: '20 DT', gestion: { tva: 19, timbre: 1 } };
fs.writeFileSync(process.env.ERP_CATALOGUE_REPRISE, JSON.stringify(CAT));
fs.writeFileSync(process.env.ERP_CATALOGUE_USINE, JSON.stringify({ ...CAT, catalog: [] }));

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
const COMMANDE = { id: 'mvfaloedybw6y', number: 'CMD-2026-0001', status: 'en_cours', total: 209.95, client: { id: 'c1', name: 'Hôtel Test' }, lines: [{ id: 'l1', designation: 'Polo', qty: 5, size: 'M', pu: 41.99, staff: 'JARDIN' }], advances: [{ amount: 100 }] };
const FACTURE = { id: 'mvfarta06ot8u', number: 'FAC-2026-0001', status: 'emise', orderId: 'mvfaloedybw6y', client: { id: 'c1', name: 'Hôtel Test' }, lines: [{ designation: 'Polo', qty: 5, pu: 41.99 }], tva: 19, timbre: 1 };

test.before(async () => {
  await require('./_base').viderBase();
  await pool.query(`create schema reprise; create table reprise.enregistrements (id bigserial primary key, collection text not null, id_origine text not null, donnees jsonb not null, unique (collection, id_origine));`);
  await pool.query(`insert into reprise.enregistrements (collection, id_origine, donnees) values ('orders', $1, $2), ('invoices', $3, $4), ('clients', 'c1', '{"id":"c1","name":"Hôtel Test"}'), ('compteurs','order:2026','{"dernier_numero":1}'), ('compteurs','invoice:2026','{"dernier_numero":1}')`,
    [COMMANDE.id, COMMANDE, FACTURE.id, FACTURE]);
  await migrer(pool, { info: () => {} });
  D._viderCache();
  app = construire({ logger: false, limiteConnexion: 1000 }); await app.ready();
  for (const [k, r] of Object.entries({ admin: ['super_admin'], commercial: ['commercial'], infographie: ['infographie'], atelier: ['production'], compta: ['comptabilite'], magasin: ['magasin'], direction: ['direction'] })) await compte(k, r);
});
test.after(async () => { await app.close(); await pool.end(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('catalogue : repris de la 3.3.0, modèles utilisateur servis par le serveur', async () => {
  const r = (await appel('GET', '/api/infographie/catalogue', { jeton: J.infographie })).json();
  assert.equal(r.catalogue.catalog[0].id, 'polo_h');
  assert.equal(r.catalogue.models.perso.url, '/api/infographie/modeles/perso-abc.glb');
  assert.equal(r.catalogue.models.polo_h.url, 'models/polo_h.glb');
});

test('catalogue : sans droit prix, aucun tarif ne sort', async () => {
  for (const k of ['infographie', 'atelier', 'magasin']) for (const u of ['/api/infographie/catalogue', '/api/infographie/catalogue-brut']) {
    const t = JSON.stringify((await appel('GET', u, { jeton: J[k] })).json());
    for (const v of ['41.99', '"price"', '"sp"', 'printPrice', 'embSetup', 'embPiece', '20 DT']) assert.ok(!t.includes(v), `${k} : fuite ${v}`);
    assert.ok(t.includes('Polo'));
  }
  const t = JSON.stringify((await appel('GET', '/api/infographie/catalogue', { jeton: J.commercial })).json());
  assert.ok(t.includes('41.99'));
  assert.ok(Array.isArray((await appel('GET', '/api/infographie/catalogue-brut', { jeton: J.commercial })).json().catalog));
  assert.equal((await appel('GET', '/api/infographie/catalogue-brut')).statusCode, 401);
});

test('catalogue : enregistrement, version, droits', async () => {
  const v = (await appel('GET', '/api/infographie/catalogue', { jeton: J.admin })).json().version;
  let r = await appel('PUT', '/api/infographie/catalogue', { jeton: J.admin, body: { version: v, catalogue: { ...CAT, catalog: [...CAT.catalog, { id: 'tee', name: 'T-shirt' }] } } });
  assert.equal(r.json().version, v + 1);
  r = await appel('PUT', '/api/infographie/catalogue', { jeton: J.admin, body: { version: v, catalogue: CAT } });
  assert.equal(r.json().erreur, 'conflit_version');
  r = await appel('PUT', '/api/infographie/catalogue', { jeton: J.infographie, body: { version: v + 1, catalogue: CAT } });
  assert.equal(r.statusCode, 403, 'Infographie sans droit prix ne peut écraser les tarifs');
  assert.equal((await appel('PUT', '/api/infographie/catalogue', { jeton: J.commercial, body: { catalogue: CAT } })).statusCode, 403);
  assert.equal((await appel('PUT', '/api/infographie/catalogue', { jeton: J.admin, body: { catalogue: { catalog: 'x' } } })).json().erreur, 'catalogue_invalide');
});

test('catalogue : société, TVA, timbre et préfixes viennent des Paramètres ERP', async () => {
  const c = (await appel('GET', '/api/infographie/catalogue', { jeton: J.admin })).json().catalogue;
  assert.equal(c.gestion.tva, 19); assert.equal(c.gestion.timbre, 1);
  assert.equal(c.gestion.invoicePrefix, 'FAC'); assert.equal(c.gestion.orderPrefix, 'CMD');
  assert.ok(c.company && typeof c.company.name === 'string');
});

test('modèles GLB : en-tête contrôlé, fichier servi, nom sûr', async () => {
  let r = await app.inject({ method: 'POST', url: '/api/infographie/modeles/polo..%2F', payload: Buffer.from('pas un glb du tout....'), headers: { authorization: 'Bearer ' + J.admin, 'content-type': 'model/gltf-binary' } });
  assert.equal(r.json().erreur, 'glb_invalide');
  const glb = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(40, 1)]);
  r = await app.inject({ method: 'POST', url: '/api/infographie/modeles/Polo%20Femme', payload: glb, headers: { authorization: 'Bearer ' + J.admin, 'content-type': 'model/gltf-binary' } });
  const url = r.json().url; assert.match(url, /^\/api\/infographie\/modeles\/polofemme-[a-z0-9]+\.glb$/);
  r = await appel('GET', url, { jeton: J.atelier });
  assert.equal(r.statusCode, 200); assert.equal(r.rawPayload.length, glb.length);
  assert.equal((await appel('GET', '/api/infographie/modeles/..%2F..%2Fetc%2Fpasswd', { jeton: J.admin })).statusCode, 400);
  assert.equal((await appel('GET', url)).statusCode, 401);
  r = await app.inject({ method: 'POST', url: '/api/infographie/modeles/x', payload: glb, headers: { authorization: 'Bearer ' + J.atelier, 'content-type': 'model/gltf-binary' } });
  assert.equal(r.statusCode, 403);
});

test('gestion : documents repris, compteurs du serveur', async () => {
  const g = (await appel('GET', '/api/commercial/gestion', { jeton: J.commercial })).json();
  assert.equal(g.orders[0].number, 'CMD-2026-0001'); assert.equal(g.invoices[0].number, 'FAC-2026-0001');
  assert.equal(g.clients.length, 1); assert.equal(g.counters['order:2026'], 1);
  assert.equal(typeof g.revision, 'number');
});

test('gestion : sans droit prix → commandes sans montants, aucune facture', async () => {
  for (const k of ['atelier', 'infographie', 'magasin']) {
    const g = (await appel('GET', '/api/commercial/gestion', { jeton: J[k] })).json();
    const t = JSON.stringify(g);
    for (const v of ['209.95', '41.99', 'advances', 'FAC-2026']) assert.ok(!t.includes(v), `${k} : fuite ${v}`);
    if (k !== 'magasin') assert.equal(g.orders[0].lines[0].qty, 5);
  }
  const m = (await appel('GET', '/api/commercial/gestion', { jeton: J.magasin })).json();
  assert.equal(m.orders.length, 0, 'Magasin : pas de droit lecture des commandes');
});

test('gestion : création, numéro serveur, règles factures', async () => {
  let r = await appel('POST', '/api/commercial/numero', { jeton: J.commercial, body: { kind: 'order' } });
  assert.equal(r.json().numero, `CMD-${new Date().getFullYear()}-0002`);
  r = await appel('PUT', '/api/commercial/orders', { jeton: J.commercial, body: { number: r.json().numero, status: 'en_cours', client: { id: 'c1', name: 'Hôtel Test' }, lines: [] } });
  assert.equal(r.statusCode, 200); const o = r.json(); assert.ok(o.id); assert.ok(o.createdAt);
  // le commercial ne peut pas annuler une facture
  const f = (await appel('GET', '/api/commercial/gestion', { jeton: J.commercial })).json().invoices[0];
  r = await appel('PUT', '/api/commercial/invoices', { jeton: J.commercial, body: { ...f, status: 'annulee' } });
  assert.equal(r.statusCode, 403);
  r = await appel('PUT', '/api/commercial/invoices', { jeton: J.compta, body: { ...f, number: 'FAC-2026-0099' } });
  assert.equal(r.json().erreur, 'numero_fige');
  r = await appel('PUT', '/api/commercial/invoices', { jeton: J.compta, body: { ...f, status: 'annulee' } });
  assert.equal(r.statusCode, 200);
  r = await appel('PUT', '/api/commercial/invoices', { jeton: J.compta, body: { ...f, status: 'emise' } });
  assert.equal(r.json().erreur, 'facture_annulee');
  r = await appel('PUT', '/api/commercial/invoices', { jeton: J.commercial, body: { client: { name: 'X' }, lines: [] } });
  assert.equal(r.json().erreur, 'numero_absent');
  // aucune suppression de facture, même en base
  assert.equal((await appel('DELETE', '/api/commercial/invoices/' + f.id, { jeton: J.admin })).json().erreur, 'suppression_interdite');
  await assert.rejects(pool.query(`delete from commercial.documents where collection = 'invoices'`), /Suppression interdite/);
  // atelier sans droit prix : écriture refusée
  assert.equal((await appel('PUT', '/api/commercial/orders', { jeton: J.atelier, body: { ...o } })).statusCode, 403);
  assert.equal((await appel('POST', '/api/commercial/numero', { jeton: J.atelier, body: { kind: 'invoice' } })).statusCode, 403);
});

test('studio sans prix : l’infographiste crée et modifie une commande, prix fixés par le serveur', async () => {
  // numéro inventé (non attribué par le serveur à ce compte) : refusé
  const ligne = (uid, sz, q, hex = '#29669d') => ({ id: `${uid}|${hex}|${sz}`, src: 'studio', item: uid, designation: 'Polo', article: 'polo_h', color: hex, size: sz, qty: q, pu: 0.001 });
  const prod = (uid) => ({ uid, article: 'polo_h', garment: 'Polo', qty: 0, total: 1, marks: { front: { mode: 'print' }, back: { mode: 'embroidery', stitches: 8000 } } });
  let r = await appel('PUT', '/api/commercial/orders', { jeton: J.infographie, body: { number: 'CMD-2026-0999', client: { name: 'Hôtel Test' }, lines: [ligne('p1', 'M', 2)], products: [prod('p1')] } });
  assert.equal(r.json().erreur, 'numero_absent');
  // BL et factures toujours interdits sans prix
  assert.equal((await appel('PUT', '/api/commercial/bls', { jeton: J.infographie, body: { orderId: 'x', lines: [] } })).statusCode, 403);
  assert.equal((await appel('PUT', '/api/commercial/invoices', { jeton: J.infographie, body: { number: 'FAC-2026-0050', lines: [] } })).statusCode, 403);
  // client créé depuis le studio
  r = await appel('PUT', '/api/commercial/clients', { jeton: J.infographie, body: { name: 'Clinique Studio' } });
  assert.equal(r.statusCode, 200); const cl = r.json();
  // un client modifié sans prix garde ses champs masqués (encours)
  await appel('PUT', '/api/commercial/clients', { jeton: J.admin, body: { ...cl, encours: 1234 } });
  r = await appel('PUT', '/api/commercial/clients', { jeton: J.infographie, body: { ...cl, phone: '+216 70 000 000', encours: 0 } });
  assert.equal(r.statusCode, 200); assert.equal(r.json().encours, undefined);
  assert.equal((await pool.query(`select donnees->>'encours' e, donnees->>'phone' t from commercial.documents where collection = 'clients' and id = $1`, [cl.id])).rows[0].e, '1234');
  const num = (await appel('POST', '/api/commercial/numero', { jeton: J.infographie, body: { kind: 'order' } })).json().numero;
  assert.ok(num);
  const body = { number: num, client: { id: cl.id, name: cl.name }, date: '2026-10-21', status: 'soldee', total: 1, advances: [{ amount: 9999 }],
    lines: [ligne('p1', 'M', 2), ligne('p1', 'XL', 1), { id: 'p1|setup', src: 'studio', item: 'p1', designation: 'Programme', qty: 1, pu: 0, service: true }, { id: 'main', designation: 'Ajout pirate', qty: 1, pu: 500 }],
    products: [prod('p1')] };
  r = await appel('PUT', '/api/commercial/orders', { jeton: J.infographie, body });
  assert.equal(r.statusCode, 200, r.body);
  const t = r.body;
  for (const v of ['"pu"', '"total"', 'advances', '9999']) assert.ok(!t.includes(v), 'réponse infographie : fuite ' + v);
  const id = r.json().id;
  // vue commerciale : prix calculés par le serveur (impression 4 + broderie 8000 pts × 0,5/1000 = 4 → +8 par pièce)
  let o = (await appel('GET', '/api/commercial/gestion', { jeton: J.commercial })).json().orders.find((x) => x.id === id);
  const pu = Object.fromEntries(o.lines.map((l) => [l.size || l.id, l.pu]));
  assert.equal(pu.M, 49.99); assert.equal(pu.XL, 52); assert.equal(pu['p1|setup'], 80);
  assert.equal(o.total, 231.98);
  assert.equal(o.status, 'en_cours'); assert.deepEqual(o.advances, []);
  assert.ok(!o.lines.some((l) => l.id === 'main'), 'ligne « à la main » d’un compte sans prix ignorée');
  assert.equal(o.products[0].total, o.total);
  // le commercial ajoute une avance, une ligne manuelle et fixe un prix négocié
  o.advances = [{ amount: 50 }]; o.lines.find((l) => l.size === 'M').pu = 45; o.lines.push({ id: 'm1', designation: 'Écusson', qty: 3, pu: 2 });
  o.total = 2 * 45 + 52 + 80 + 6;
  assert.equal((await appel('PUT', '/api/commercial/orders', { jeton: J.commercial, body: o })).statusCode, 200);
  // l'infographiste revient sur la commande (vue masquée) : ajoute 3 pièces M en noir ; rien d'autre ne bouge
  const vue = (await appel('GET', '/api/commercial/gestion', { jeton: J.infographie })).json().orders.find((x) => x.id === id);
  assert.equal(vue.advances, undefined);
  vue.lines = [ligne('p1', 'M', 2), ligne('p1', 'XL', 1), ligne('p1', 'M', 3, '#000000'), ligne('p1', 'S', 1, '#ffffff'), { id: 'p1|setup', src: 'studio', item: 'p1', qty: 1, service: true }];
  vue.products = [prod('p1')];
  assert.equal((await appel('PUT', '/api/commercial/orders', { jeton: J.infographie, body: vue })).json().erreur, 'taille_inconnue');
  vue.lines = vue.lines.filter((l) => l.size !== 'S');
  r = await appel('PUT', '/api/commercial/orders', { jeton: J.infographie, body: vue });
  assert.equal(r.statusCode, 200, r.body);
  o = (await appel('GET', '/api/commercial/gestion', { jeton: J.commercial })).json().orders.find((x) => x.id === id);
  const p2 = Object.fromEntries(o.lines.map((l) => [l.id, l.pu]));
  assert.equal(p2['p1|#29669d|M'], 45, 'prix négocié conservé'); assert.equal(p2['p1|#000000|M'], 49.99); assert.equal(p2.m1, 2);
  assert.deepEqual(o.advances, [{ amount: 50 }]);
  assert.equal(o.total, 377.97);
  // article sans tarif : refus explicite
  vue.lines = [{ ...ligne('p9', 'M', 1), article: 'inconnu' }]; vue.products = [{ ...prod('p9'), article: 'inconnu' }];
  assert.equal((await appel('PUT', '/api/commercial/orders', { jeton: J.infographie, body: vue })).json().erreur, 'article_sans_tarif');
  // quantité invalide
  vue.lines = [ligne('p1', 'M', -4)]; vue.products = [prod('p1')];
  assert.equal((await appel('PUT', '/api/commercial/orders', { jeton: J.infographie, body: vue })).json().erreur, 'quantite_invalide');
  // le même numéro ne sert pas deux fois
  assert.equal((await appel('PUT', '/api/commercial/orders', { jeton: J.infographie, body: { ...body, id: undefined } })).json().erreur, 'numero_pris');
  // commande annulée : figée pour l'infographiste
  o.status = 'annulee'; assert.equal((await appel('PUT', '/api/commercial/orders', { jeton: J.commercial, body: o })).statusCode, 200);
  vue.lines = [ligne('p1', 'M', 1)];
  assert.equal((await appel('PUT', '/api/commercial/orders', { jeton: J.infographie, body: vue })).json().erreur, 'commande_figee');
  // l'atelier (production) reste sans droit d'écriture
  assert.equal((await appel('POST', '/api/commercial/numero', { jeton: J.atelier, body: { kind: 'order' } })).statusCode, 403);
  // tracé dans le journal
  const a = (await pool.query(`select details from noyau.audit where action = 'commande_cree' and entite_id = $1`, [id])).rows[0];
  assert.equal(a.details.prix, 'calculés par le serveur');
});

test('gestion : client supprimable seulement s’il n’a aucun document', async () => {
  let r = await appel('DELETE', '/api/commercial/clients/c1', { jeton: J.admin });
  assert.equal(r.json().erreur, 'client_utilise');
  r = await appel('PUT', '/api/commercial/clients', { jeton: J.commercial, body: { name: 'Client vide' } });
  r = await appel('DELETE', '/api/commercial/clients/' + r.json().id, { jeton: J.commercial });
  assert.equal(r.json().erreur, undefined);
});

test('révision : change à chaque écriture (synchronisation des postes)', async () => {
  const a = (await appel('GET', '/api/commercial/revision', { jeton: J.atelier })).json().revision;
  await appel('PUT', '/api/commercial/clients', { jeton: J.commercial, body: { name: 'Autre client' } });
  const b = (await appel('GET', '/api/commercial/revision', { jeton: J.atelier })).json().revision;
  assert.ok(b > a);
});

test('registres : fournisseurs et matières, prix d’achat masqué, code unique', async () => {
  let r = await appel('POST', '/api/registres/fournisseurs', { jeton: J.compta, body: { code: 'F001', nom: 'Tissages du Sahel', ville: 'Monastir' } });
  assert.equal(r.statusCode, 201);
  assert.equal((await appel('POST', '/api/registres/fournisseurs', { jeton: J.compta, body: { code: 'f001', nom: 'Doublon' } })).json().erreur, 'code_pris');
  assert.equal((await appel('POST', '/api/registres/fournisseurs', { jeton: J.compta, body: { code: 'F002' } })).json().erreur, 'incomplet');
  assert.equal((await appel('POST', '/api/registres/fournisseurs', { jeton: J.commercial, body: { nom: 'X' } })).statusCode, 403);
  r = await appel('POST', '/api/registres/articles_mp', { jeton: J.magasin, body: { code: 'TIS-PIQ-220', designation: 'Piqué 220 g/m² bleu', unite: 'm', prix_achat: 12.5 } });
  assert.equal(r.statusCode, 201);
  const vu = (await appel('GET', '/api/registres/articles_mp', { jeton: J.magasin })).json();
  assert.equal(vu[0].designation, 'Piqué 220 g/m² bleu'); assert.equal(vu[0].prix_achat, undefined, 'Magasin ne voit pas les prix d’achat');
  const ad = (await appel('GET', '/api/registres/articles_mp', { jeton: J.admin })).json();
  assert.equal(ad[0].prix_achat, undefined, 'prix non enregistré car le Magasin ne le voit pas');
  r = await appel('PUT', '/api/registres/articles_mp/' + ad[0].id, { jeton: J.admin, body: { ...ad[0], prix_achat: 12.5 } });
  assert.equal(r.statusCode, 200);
  const v = (await appel('GET', '/api/registres/articles_mp', { jeton: J.magasin })).json()[0];
  r = await appel('PUT', '/api/registres/articles_mp/' + v.id, { jeton: J.magasin, body: { ...v, stock_mini: 50 } });
  assert.equal((await appel('GET', '/api/registres/articles_mp', { jeton: J.admin })).json()[0].prix_achat, 12.5, 'le Magasin ne peut pas effacer un prix qu’il ne voit pas');
  assert.equal((await appel('PUT', '/api/registres/articles_mp/' + v.id, { jeton: J.magasin, body: { ...v } })).json().erreur, 'conflit_version');
  assert.equal((await appel('GET', '/api/registres/articles_mp', { jeton: J.atelier })).statusCode, 200);
  assert.equal((await appel('GET', '/api/registres/fournisseurs', { jeton: J.atelier })).statusCode, 403);
});

test('accueil : fonctions par module selon les droits ; sauvegardes réservées', async () => {
  const a = (await appel('GET', '/api/accueil', { jeton: J.atelier })).json();
  const prod = a.modules.find((m) => m.code === 'production');
  assert.ok(prod.fonctions.some((f) => f.code === 'production.etapes' && f.actions.includes('valider')));
  assert.ok(!a.modules.some((m) => m.code === 'paie'));
  assert.equal((await appel('GET', '/api/sauvegardes', { jeton: J.admin })).json().base[0].nom, 'erp_2026-10-21_0230.dump');
  assert.equal((await appel('GET', '/api/sauvegardes', { jeton: J.commercial })).statusCode, 403);
});
