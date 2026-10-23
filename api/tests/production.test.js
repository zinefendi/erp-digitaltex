'use strict';
// Tests production (lot 0.11.0) : BOM versionnée (PRI recalculé, masquage des coûts), OF créé depuis
// une commande avec réservations de matières, 3 parties dans l'ordre, validation partielle puis
// complément, sorties MP à la coupe, entrées PF à la partie 3, annulations avec motif et mouvements
// inverses, MP insuffisante (réservation possible, sortie refusée), numérotation concurrente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-'));
process.env.ERP_GLB_DIR = path.join(TMP, 'glb');
process.env.ERP_CATALOGUE_REPRISE = path.join(TMP, 'reprise.json');
process.env.ERP_CATALOGUE_USINE = path.join(TMP, 'usine.json');
process.env.ERP_SAUVEGARDES = path.join(TMP, 'sauv');
fs.writeFileSync(process.env.ERP_CATALOGUE_USINE, JSON.stringify({ catalog: [], shop: { articles: {} }, models: {} }));

const { pool } = require('../lib/db');
const { migrer } = require('../lib/migrations');
const mdp = require('../lib/mdp');
const D = require('../lib/droits');
const { construire } = require('../server');
let app;
const appel = (method, url, { jeton, body } = {}) => app.inject({ method, url, payload: body, headers: jeton ? { authorization: 'Bearer ' + jeton } : {} });
const J = {};
async function compte(cle, roles) {
  const h = await mdp.hacher('Atelier-Polo-2026');
  const r = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ($1, $1, $2, false) returning id`, ['s.' + cle, h]);
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code = any($2)`, [r.rows[0].id, roles]);
  J[cle] = (await appel('POST', '/api/auth/connexion', { body: { identifiant: 's.' + cle, mot_de_passe: 'Atelier-Polo-2026' } })).json().jeton;
}
const AN = new Date().getFullYear();
let TISSU, PF, OF1;

test.before(async () => {
  await require('./_base').viderBase();
  await migrer(pool, { info: () => {} });
  D._viderCache();
  app = construire({ logger: false, limiteConnexion: 1000 }); await app.ready();
  for (const [k, r] of Object.entries({ admin: ['super_admin'], atelier: ['production'], magasin: ['magasin'], compta: ['comptabilite'], commercial: ['commercial'], infographie: ['infographie'] })) await compte(k, r);
  TISSU = (await appel('POST', '/api/registres/articles_mp', { jeton: J.admin, body: { code: 'T01', designation: 'Piqué 220 g', famille: 'Tissu', unite: 'm', stock_mini: 100, prix_achat: 10 } })).json().id;
  PF = (await appel('POST', '/api/produits', { jeton: J.admin, body: { code_article: 'P', sexe: 'H', taillant: ['S', 'M', 'L', 'XL'], bom: [{ designation: 'Piqué', qte: 0.4, pu: 12.5 }], gamme: [{ operation: 'Assemblage', temps_min: 30 }] } })).json();
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('orders', 'cmd1', $1)`,
    [{ id: 'cmd1', number: `CM-${AN}-0001`, status: 'confirmee', client: { id: 'cl1', name: 'Hôtel Sousse' }, lines: [{ id: 'l1', article: PF.reference, size: 'XL', color: 'Blanc', qty: 100 }] }]);
  // stock de tissu : deux rouleaux (couche FIFO distincte)
  await appel('POST', '/api/stocks/mp/receptions', { jeton: J.admin, body: { fournisseur: 'Tissage du Sahel', lignes: [{ article_id: TISSU, qte: 50, n_lot: 'L1', bain: 'B7', rouleau: 'R1', cout_unitaire: 10 }, { article_id: TISSU, qte: 80, n_lot: 'L2', bain: 'B8', rouleau: 'R2', cout_unitaire: 12 }] } });
});
test.after(async () => { await app.close(); await pool.end(); fs.rmSync(TMP, { recursive: true, force: true }); });

const etatTissu = async (jeton) => (await appel('GET', '/api/stocks/mp/etat', { jeton })).json().find((a) => a.id === TISSU);

test('BOM versionnée : v1 créée, PRI recalculé sur la fiche, coûts masqués pour l’atelier', async () => {
  let r = await appel('POST', '/api/pf/boms', { jeton: J.admin, body: { produit_id: PF.id, lignes: [{ article_id: TISSU, qte_base: 0.4, par_taille: { XL: 0.4 } }], note: 'BOM initiale' } });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().version, 1);
  // PRI = (0,4 × 10 + 30 × 0,15) × 1,09 = 9,265
  const p = (await appel('GET', `/api/produits/${PF.id}`, { jeton: J.compta })).json();
  assert.ok(Math.abs(p.pri - 9.265) < 0.01, 'PRI=' + p.pri);
  const boms = (await appel('GET', `/api/pf/boms?produit_id=${PF.id}`, { jeton: J.atelier })).json();
  assert.equal(boms.length, 1);
  assert.ok(boms[0].lignes.every((l) => l.pu === undefined), 'pu masqué sans visibilité coûts');
});

test('OF : création depuis la commande, numéro OF, réservation des matières au lancement', async () => {
  let r = await appel('POST', '/api/prod/of', { jeton: J.infographie, body: { commande_id: 'cmd1', produit_id: PF.id, tailles_couleurs: [{ taille: 'XL', couleur: 'Blanc', qte: 100 }] } });
  assert.equal(r.statusCode, 403);
  r = await appel('POST', '/api/prod/of', { jeton: J.atelier, body: { commande_id: 'cmd1', produit_id: PF.id, tailles_couleurs: [{ taille: 'XL', couleur: 'Blanc', qte: 100 }] } });
  assert.equal(r.statusCode, 201, r.body);
  OF1 = r.json();
  assert.equal(OF1.numero, `OF-${AN}-0001`);
  assert.equal(OF1.parties.find((x) => x.partie === 2).etat, 'sans_objet', 'produit sans marquage');
  const b = OF1.besoins.find((x) => x.article_id === TISSU);
  assert.ok(Math.abs(b.qte_totale - 43.6) < 0.01, 'besoin=' + b.qte_totale); // 100 × 0,4 × 1,09
  const t = await etatTissu(J.magasin);
  assert.equal(t.reserve, 43.6); assert.equal(t.disponible, 86.4);
  // une taille hors taillant est refusée
  r = await appel('POST', '/api/prod/of', { jeton: J.atelier, body: { commande_id: 'cmd1', produit_id: PF.id, tailles_couleurs: [{ taille: '3XL', couleur: 'Blanc', qte: 1 }] } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'taille_inconnue');
});

test('parties dans l’ordre : partie 3 refusée avant la coupe, partie 2 sans objet', async () => {
  let r = await appel('POST', `/api/prod/of/${OF1.id}/partie/3/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 100 }] } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'partie_precedente');
  r = await appel('POST', `/api/prod/of/${OF1.id}/partie/2/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 10 }] } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'partie_sans_objet');
});

test('coupe partielle (60/100) : sortie du rouleau choisi, réservation consommée, partie en cours', async () => {
  const lots = (await appel('GET', `/api/stocks/mp/articles/${TISSU}/lots`, { jeton: J.admin })).json();
  const R1 = lots.find((l) => l.rouleau === 'R1');
  let r = await appel('POST', `/api/prod/of/${OF1.id}/partie/1/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 60 }], sorties: [{ article_id: TISSU, lot_id: R1.id, qte: 26.16 }], remarques: 'Premier matelassage' } });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().etat, 'en_cours');
  const t = await etatTissu(J.admin);
  assert.equal(t.reserve, 17.44, '43,6 − 26,16 consommés');
  assert.equal(t.physique, 103.84, '130 − 26,16');
  // trop validé : 41 pièces de plus que les 40 restantes
  r = await appel('POST', `/api/prod/of/${OF1.id}/partie/1/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 41 }] } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'trop_valide');
});

test('fin de coupe : sortie sans rouleau refusée pour le tissu, puis validée avec le prorata saisi', async () => {
  let r = await appel('POST', `/api/prod/of/${OF1.id}/partie/1/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 40 }] } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'rouleau_requis', 'le prorata d’un tissu exige le rouleau');
  const lots = (await appel('GET', `/api/stocks/mp/articles/${TISSU}/lots`, { jeton: J.admin })).json();
  const R1 = lots.find((l) => l.rouleau === 'R1');
  r = await appel('POST', `/api/prod/of/${OF1.id}/partie/1/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 40 }], sorties: [{ article_id: TISSU, lot_id: R1.id, qte: 17.44 }] } });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().etat, 'validee');
  const of = (await appel('GET', `/api/prod/of/${OF1.id}`, { jeton: J.admin })).json();
  assert.equal(of.parties.find((x) => x.partie === 1).etat, 'validee');
  assert.equal(of.parties.find((x) => x.partie === 1).qtes_validees[0].qte, 100);
  const t = await etatTissu(J.admin);
  assert.equal(t.reserve, 0, 'réservations soldées'); assert.equal(t.physique, 86.4);
});

test('assemblage : entrée PF au PRI avec photo, OF terminé, mouvements tracés', async () => {
  const ph = (await pool.query(`insert into commercial.fichiers (nature, cible_type, cible_id, nom, mime, taille, empreinte, chemin)
    values ('photo_atelier', 'of', '${OF1.id}', 'controle.jpg', 'image/jpeg', 100, 'e', 'x') returning id`)).rows[0].id;
  let r = await appel('POST', `/api/prod/of/${OF1.id}/partie/3/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 100 }], photo_id: ph } });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().statut, 'termine');
  const pf = (await appel('GET', '/api/stocks/pf/etat', { jeton: J.admin })).json();
  const s = pf.find((x) => x.produit_id === PF.id && x.taille === 'XL' && x.couleur === 'Blanc');
  assert.equal(s.qte, 100); assert.ok(s.valeur > 0);
  const mv = (await appel('GET', '/api/stocks/pf/mouvements', { jeton: J.admin })).json();
  assert.ok(mv.some((m) => m.type === 'entree_of' && m.ref_num === OF1.numero));
  r = await appel('POST', `/api/prod/of/${OF1.id}/partie/3/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 1 }] } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'of_ferme');
});

test('annulation d’une validation d’assemblage : sortie PF inverse, OF remis en cours, puis revalidation', async () => {
  const of = (await appel('GET', `/api/prod/of/${OF1.id}`, { jeton: J.admin })).json();
  const v3 = of.validations.find((v) => v.partie === 3);
  let r = await appel('POST', `/api/prod/of/${OF1.id}/validations/${v3.id}/annuler`, { jeton: J.infographie, body: { motif: 'Essai interdit' } });
  assert.equal(r.statusCode, 403);
  r = await appel('POST', `/api/prod/of/${OF1.id}/validations/${v3.id}/annuler`, { jeton: J.atelier, body: { motif: 'Couture défectueuse' } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().statut, 'en_cours');
  const s = (await appel('GET', '/api/stocks/pf/etat', { jeton: J.admin })).json().find((x) => x.produit_id === PF.id);
  assert.equal(s.qte, 0, 'pièces ressorties du stock PF');
  const mv = (await appel('GET', '/api/stocks/pf/mouvements', { jeton: J.admin })).json();
  assert.ok(mv.some((m) => m.type === 'sortie' && m.ref_num === OF1.numero && m.motif.includes('Couture défectueuse')));
  r = await appel('POST', `/api/prod/of/${OF1.id}/partie/3/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 100 }] } });
  assert.equal(r.statusCode, 201, r.body); assert.equal(r.json().statut, 'termine');
});

test('annulation d’une validation de coupe : retour au rouleau, réservations reconstituées', async () => {
  let r = await appel('POST', '/api/prod/of', { jeton: J.atelier, body: { commande_id: 'cmd1', produit_id: PF.id, tailles_couleurs: [{ taille: 'XL', couleur: 'Blanc', qte: 20 }] } });
  assert.equal(r.statusCode, 201, r.body);
  const OF2 = r.json();
  assert.equal(OF2.numero, `OF-${AN}-0002`);
  const R2 = (await appel('GET', `/api/stocks/mp/articles/${TISSU}/lots`, { jeton: J.admin })).json().find((l) => l.rouleau === 'R2');
  r = await appel('POST', `/api/prod/of/${OF2.id}/partie/1/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 20 }], sorties: [{ article_id: TISSU, lot_id: R2.id, qte: 8.72 }] } });
  assert.equal(r.statusCode, 201, r.body);
  let t = await etatTissu(J.admin);
  assert.equal(t.physique, 77.68); assert.equal(t.reserve, 0);
  const of = (await appel('GET', `/api/prod/of/${OF2.id}`, { jeton: J.admin })).json();
  const v1 = of.validations.find((v) => v.partie === 1);
  r = await appel('POST', `/api/prod/of/${OF2.id}/validations/${v1.id}/annuler`, { jeton: J.atelier, body: { motif: 'Erreur de taille' } });
  assert.equal(r.statusCode, 200, r.body);
  t = await etatTissu(J.admin);
  assert.equal(t.physique, 86.4, 'métrage rendu au rouleau');
  assert.equal(t.reserve, 8.72, 'réservation reconstituée');
  const mv = (await appel('GET', '/api/stocks/mp/mouvements', { jeton: J.admin })).json();
  assert.ok(mv.some((m) => m.type === 'retour' && m.ref_doc === OF2.numero));
});

test('MP insuffisante : réservation possible (à commander), sortie à la coupe refusée, OF annulable', async () => {
  let r = await appel('POST', '/api/prod/of', { jeton: J.atelier, body: { commande_id: 'cmd1', produit_id: PF.id, tailles_couleurs: [{ taille: 'XL', couleur: 'Blanc', qte: 500 }] } });
  assert.equal(r.statusCode, 201, r.body);
  const OF3 = r.json();
  let bes = (await appel('GET', '/api/prod/besoins?commande_id=cmd1', { jeton: J.compta })).json();
  const g = bes.find((x) => x.produit_id === PF.id);
  assert.ok(g.lignes[0].a_commander > 0, 'matière à commander quand la réservation dépasse le disponible');
  const R2 = (await appel('GET', `/api/stocks/mp/articles/${TISSU}/lots`, { jeton: J.admin })).json().find((l) => l.rouleau === 'R2');
  r = await appel('POST', `/api/prod/of/${OF3.id}/partie/1/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 500 }], sorties: [{ article_id: TISSU, lot_id: R2.id, qte: 218 }] } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'stock_insuffisant');
  r = await appel('POST', `/api/prod/of/${OF3.id}/annuler`, { jeton: J.atelier, body: { motif: 'Attendre la toile' } });
  assert.equal(r.statusCode, 200, r.body);
  const t = await etatTissu(J.admin);
  assert.equal(t.reserve, 8.72, 'réservations de l’OF annulé libérées');
  bes = (await appel('GET', '/api/prod/besoins?commande_id=cmd1', { jeton: J.compta })).json();
  assert.equal(bes.find((x) => x.produit_id === PF.id).lignes[0].a_commander, 0);
});

test('fiche technique sans aucun montant ; signal « fiche modifiée » après une nouvelle version de BOM', async () => {
  let of = (await appel('GET', `/api/prod/of/${OF1.id}`, { jeton: J.atelier })).json();
  const corps = JSON.stringify(of);
  assert.ok(!corps.includes('"pu"') && !corps.includes('"montant"'), 'aucun coût dans un OF');
  let r = await appel('POST', '/api/pf/boms', { jeton: J.infographie, body: { produit_id: PF.id, lignes: [{ article_id: TISSU, qte_base: 0.5, par_taille: { XL: 0.5 } }], note: 'Conso revue' } });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().version, 2);
  const p = (await appel('GET', `/api/produits/${PF.id}`, { jeton: J.compta })).json();
  assert.ok(Math.abs(p.pri - 10.355) < 0.01, 'PRI recalculé (0,5 × 10 + 4,5) × 1,09 = ' + p.pri);
  of = (await appel('GET', `/api/prod/of/${OF1.id}`, { jeton: J.atelier })).json();
  assert.equal(of.fiche_modifiee, true, 'fiche produit modifiée depuis le lancement');
  assert.equal(of.besoins.find((x) => x.article_id === TISSU).qte_totale, 43.6, 'besoins de l’OF lancé inchangés');
  const boms = (await appel('GET', `/api/pf/boms?produit_id=${PF.id}`, { jeton: J.compta })).json();
  assert.equal(boms.length, 2);
  assert.equal(boms.find((b) => b.version === 1).statut, 'archivee');
  assert.equal(boms.find((b) => b.version === 2).statut, 'active');
});

test('numérotation concurrente : deux OF créés en même temps ont deux numéros distincts', async () => {
  const [a, b] = await Promise.all([
    appel('POST', '/api/prod/of', { jeton: J.atelier, body: { commande_id: 'cmd1', produit_id: PF.id, tailles_couleurs: [{ taille: 'XL', couleur: 'Blanc', qte: 5 }] } }),
    appel('POST', '/api/prod/of', { jeton: J.atelier, body: { commande_id: 'cmd1', produit_id: PF.id, tailles_couleurs: [{ taille: 'XL', couleur: 'Blanc', qte: 5 }] } }),
  ]);
  assert.equal(a.statusCode, 201, a.body); assert.equal(b.statusCode, 201, b.body);
  assert.notEqual(a.json().numero, b.json().numero);
  // leurs besoins suivent la BOM v2 (0,5 × 1,09 = 0,545 par pièce)
  for (const x of [a.json(), b.json()]) assert.ok(Math.abs(x.besoins.find((l) => l.article_id === TISSU).qte_totale - 2.725) < 0.01);
  // nettoyage : OF jamais démarrés → annulés (libère les réservations)
  for (const x of [a.json(), b.json()]) await appel('POST', `/api/prod/of/${x.id}/annuler`, { jeton: J.atelier, body: { motif: 'Fin des tests' } });
});
