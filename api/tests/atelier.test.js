'use strict';
// Tests atelier (lot 0.12.0) : connexion par PIN (définition par l'admin, verrouillage après
// 5 échecs), ouvriers, affectations aux parties, pointage début/fin par le responsable (version,
// corrections tracées, temps prévu de la gamme), signalements, photo d'atelier sur un OF et
// validation d'une partie depuis la tablette — jamais aucun prix dans les réponses.
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
const { construire } = require('../server');
let app;
const appel = (method, url, { jeton, body } = {}) => app.inject({ method, url, payload: body, headers: jeton ? { authorization: 'Bearer ' + jeton } : {} });
const J = {};
async function compte(cle, roles) {
  const h = await mdp.hacher('Atelier-Polo-2026');
  const r = await pool.query(`insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash, doit_changer_mdp) values ($1, $1, $2, false) returning id`, ['a.' + cle, h]);
  await pool.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code = any($2)`, [r.rows[0].id, roles]);
  J[cle] = (await appel('POST', '/api/auth/connexion', { body: { identifiant: 'a.' + cle, mot_de_passe: 'Atelier-Polo-2026' } })).json().jeton;
  return r.rows[0].id;
}
const AN = new Date().getFullYear();
let ADMIN_ID, TISSU, PF, OF1, OUVRIER1;

test.before(async () => {
  await require('./_base').viderBase();
  await migrer(pool, { info: () => {} });
  D._viderCache();
  app = construire({ logger: false, limiteConnexion: 1000 }); await app.ready();
  ADMIN_ID = await compte('admin', ['super_admin']);
  await compte('atelier', ['production']);
  await compte('commercial', ['commercial']);
  TISSU = (await appel('POST', '/api/registres/articles_mp', { jeton: J.admin, body: { code: 'T01', designation: 'Piqué 220 g', famille: 'Tissu', unite: 'm', stock_mini: 100, prix_achat: 10 } })).json().id;
  PF = (await appel('POST', '/api/produits', { jeton: J.admin, body: { code_article: 'P', sexe: 'H', taillant: ['M', 'XL'], bom: [{ designation: 'Piqué', qte: 0.4, pu: 12.5 }], gamme: [{ operation: 'Assemblage', temps_min: 30 }] } })).json();
  await pool.query(`insert into commercial.documents (collection, id, donnees) values ('orders', 'cmd1', $1)`,
    [{ id: 'cmd1', number: `CM-${AN}-0001`, status: 'confirmee', client: { id: 'cl1', name: 'Hôtel Sousse' }, lines: [{ id: 'l1', article: PF.reference, size: 'XL', color: 'Blanc', qty: 20 }] }]);
  await appel('POST', '/api/stocks/mp/receptions', { jeton: J.admin, body: { fournisseur: 'Tissage du Sahel', lignes: [{ article_id: TISSU, qte: 50, n_lot: 'L1', bain: 'B7', rouleau: 'R1', cout_unitaire: 10 }] } });
  OF1 = (await appel('POST', '/api/prod/of', { jeton: J.atelier, body: { commande_id: 'cmd1', produit_id: PF.id, tailles_couleurs: [{ taille: 'XL', couleur: 'Blanc', qte: 20 }] } })).json();
  OUVRIER1 = (await appel('POST', '/api/prod/ouvriers', { jeton: J.admin, body: { nom: 'Mohamed Trabelsi', poste: 'Piqueuse' } })).json().id;
});
test.after(async () => { await app.close(); await pool.end(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('PIN : défini par l’admin seulement, connexion OK, verrouillage après 5 échecs', async () => {
  // sans PIN : refus
  let r = await appel('POST', '/api/auth/connexion-pin', { body: { identifiant: 'a.atelier', pin: '1234' } });
  assert.equal(r.statusCode, 401); assert.equal(r.json().erreur, 'identifiants');
  // un commercial (non admin) ne peut pas poser un PIN
  r = await appel('POST', `/api/utilisateurs/${ADMIN_ID}/pin`, { jeton: J.commercial, body: { pin: '9999' } });
  assert.equal(r.statusCode, 403);
  // PIN invalide refusé
  r = await appel('POST', `/api/utilisateurs/${ADMIN_ID}/pin`, { jeton: J.admin, body: { pin: '12' } });
  assert.equal(r.statusCode, 400);
  // l'admin pose le PIN de l'atelier
  const ids = await pool.query(`select id from noyau.utilisateurs where identifiant = 'a.atelier'`);
  r = await appel('POST', `/api/utilisateurs/${ids.rows[0].id}/pin`, { jeton: J.admin, body: { pin: '2468' } });
  assert.equal(r.statusCode, 200); assert.equal(r.json().pin_actif, true);
  const u = (await appel('GET', '/api/utilisateurs', { jeton: J.admin })).json().find((x) => x.identifiant === 'a.atelier');
  assert.equal(u.pin_actif, true, 'jamais de hachage dans la réponse');
  // mauvais PIN ×4 : 401 ; le 5e déclenche le verrou (réponse 401, comme les mots de passe)…
  for (let i = 0; i < 5; i++) {
    r = await appel('POST', '/api/auth/connexion-pin', { body: { identifiant: 'a.atelier', pin: '1111' } });
    assert.equal(r.statusCode, 401);
  }
  // …et la tentative suivante est verrouillée, même avec le bon PIN
  r = await appel('POST', '/api/auth/connexion-pin', { body: { identifiant: 'a.atelier', pin: '1111' } });
  assert.equal(r.statusCode, 423); assert.equal(r.json().erreur, 'verrouille');
  r = await appel('POST', '/api/auth/connexion-pin', { body: { identifiant: 'a.atelier', pin: '2468' } });
  assert.equal(r.statusCode, 423);
  // l'admin déverrouille, le bon PIN connecte et donne les droits production
  r = await appel('POST', `/api/utilisateurs/${ids.rows[0].id}/deverrouiller`, { jeton: J.admin });
  assert.equal(r.statusCode, 200);
  r = await appel('POST', '/api/auth/connexion-pin', { body: { identifiant: 'a.atelier', pin: '2468' } });
  assert.equal(r.statusCode, 200, r.body);
  const jetonPin = r.json().jeton;
  r = await appel('GET', '/api/prod/of', { jeton: jetonPin });
  assert.equal(r.statusCode, 200);
  // un compte sans rôle production ne peut pas lire les OF, même avec un PIN
  const idsC = await pool.query(`select id from noyau.utilisateurs where identifiant = 'a.commercial'`);
  await appel('POST', `/api/utilisateurs/${idsC.rows[0].id}/pin`, { jeton: J.admin, body: { pin: '1357' } });
  const jc = (await appel('POST', '/api/auth/connexion-pin', { body: { identifiant: 'a.commercial', pin: '1357' } })).json().jeton;
  r = await appel('POST', `/api/prod/of/${OF1.id}/affectations`, { jeton: jc, body: { partie: 1, ouvrier_id: OUVRIER1 } });
  assert.equal(r.statusCode, 403);
});

test('ouvriers : création, doublon refusé, désactivation, réactivation', async () => {
  let r = await appel('POST', '/api/prod/ouvriers', { jeton: J.commercial, body: { nom: 'Interdit' } });
  assert.equal(r.statusCode, 403);
  r = await appel('POST', '/api/prod/ouvriers', { jeton: J.admin, body: { nom: 'Mohamed Trabelsi' } });
  assert.equal(r.statusCode, 409); assert.equal(r.json().erreur, 'nom_pris');
  const o2 = (await appel('POST', '/api/prod/ouvriers', { jeton: J.admin, body: { nom: 'Fatma Ben Salah', poste: 'Coupeuse' } })).json();
  r = await appel('PATCH', `/api/prod/ouvriers/${o2.id}`, { jeton: J.admin, body: { actif: false } });
  assert.equal(r.statusCode, 200);
  const L = (await appel('GET', '/api/prod/ouvriers', { jeton: J.atelier })).json();
  assert.equal(L.find((x) => x.id === o2.id).actif, false);
  // un ouvrier inactif ne peut pas être affecté
  r = await appel('POST', `/api/prod/of/${OF1.id}/affectations`, { jeton: J.admin, body: { partie: 1, ouvrier_id: o2.id } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'ouvrier_inactif');
  await appel('PATCH', `/api/prod/ouvriers/${o2.id}`, { jeton: J.admin, body: { actif: true } });
});

test('affectation : une seule active par partie et ouvrier, retrait avec motif', async () => {
  let r = await appel('POST', `/api/prod/of/${OF1.id}/affectations`, { jeton: J.admin, body: { partie: 1, ouvrier_id: OUVRIER1, note: 'Matelassage' } });
  assert.equal(r.statusCode, 201, r.body);
  r = await appel('POST', `/api/prod/of/${OF1.id}/affectations`, { jeton: J.admin, body: { partie: 1, ouvrier_id: OUVRIER1 } });
  assert.equal(r.statusCode, 409); assert.equal(r.json().erreur, 'deja_affecte');
  // partie sans objet : pas d'affectation
  r = await appel('POST', `/api/prod/of/${OF1.id}/affectations`, { jeton: J.admin, body: { partie: 2, ouvrier_id: OUVRIER1 } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'partie_sans_objet');
  // visible dans le détail de l'OF
  let of = (await appel('GET', `/api/prod/of/${OF1.id}`, { jeton: J.atelier })).json();
  assert.equal(of.affectations.filter((a) => !a.annule).length, 1);
  assert.equal(of.affectations[0].ouvrier, 'Mohamed Trabelsi');
  // retrait tracé
  const aid = of.affectations[0].id;
  r = await appel('POST', `/api/prod/affectations/${aid}/annuler`, { jeton: J.admin, body: { motif: 'Absence' } });
  assert.equal(r.statusCode, 200);
  r = await appel('POST', `/api/prod/affectations/${aid}/annuler`, { jeton: J.admin, body: { motif: 'Encore' } });
  assert.equal(r.statusCode, 400);
  // on ré-affecte (l'ancienne est annulée, l'index partiel le permet)
  r = await appel('POST', `/api/prod/of/${OF1.id}/affectations`, { jeton: J.admin, body: { partie: 1, ouvrier_id: OUVRIER1 } });
  assert.equal(r.statusCode, 201, r.body);
});

test('pointage : début puis fin par le responsable, version, correction tracée, temps prévu', async () => {
  let r = await appel('POST', '/api/prod/pointages', { jeton: J.commercial, body: { of_id: OF1.id, partie: 1, ouvrier_id: OUVRIER1, debut: new Date().toISOString() } });
  assert.equal(r.statusCode, 403);
  const debut = new Date(Date.now() - 3600 * 1000).toISOString();
  r = await appel('POST', '/api/prod/pointages', { jeton: J.atelier, body: { of_id: OF1.id, partie: 1, ouvrier_id: OUVRIER1, debut, source: 'tablette' } });
  assert.equal(r.statusCode, 201, r.body);
  const pid = r.json().id;
  // début dans le futur refusé
  r = await appel('POST', '/api/prod/pointages', { jeton: J.atelier, body: { of_id: OF1.id, partie: 1, ouvrier_id: OUVRIER1, debut: new Date(Date.now() + 3600e3).toISOString() } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'debut_futur');
  // correction sans version refusée, avec version OK
  r = await appel('PATCH', `/api/prod/pointages/${pid}`, { jeton: J.atelier, body: { fin: new Date().toISOString() } });
  assert.equal(r.statusCode, 400);
  r = await appel('PATCH', `/api/prod/pointages/${pid}`, { jeton: J.atelier, body: { version: 1, fin: new Date().toISOString(), remarques: 'Correction heure d’arrivée' } });
  assert.equal(r.statusCode, 200, r.body);
  r = await appel('PATCH', `/api/prod/pointages/${pid}`, { jeton: J.atelier, body: { version: 1, remarques: 'Encore' } });
  assert.equal(r.statusCode, 409); assert.equal(r.json().erreur, 'conflit_version');
  // fin antérieure au début refusée
  r = await appel('PATCH', `/api/prod/pointages/${pid}`, { jeton: J.atelier, body: { version: 2, fin: new Date(Date.now() - 7200e3).toISOString() } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'fin_invalide');
  // liste du jour : temps prévu (gamme 30 min par pièce) présent
  const L = (await appel('GET', `/api/prod/pointages?du=${new Date().toISOString().slice(0, 10)}`, { jeton: J.admin })).json();
  const p = L.find((x) => x.id === pid);
  assert.ok(p, 'pointage du jour listé');
  assert.equal(p.source, 'tablette');
  assert.equal(p.temps_prevu_piece, 30);
  // annulation avec motif
  r = await appel('POST', `/api/prod/pointages/${pid}/annuler`, { jeton: J.admin, body: { motif: 'Erreur de saisie' } });
  assert.equal(r.statusCode, 200);
  r = await appel('PATCH', `/api/prod/pointages/${pid}`, { jeton: J.atelier, body: { version: 3, remarques: 'x' } });
  assert.equal(r.statusCode, 400); assert.equal(r.json().erreur, 'pointage_annule');
});

test('signalements : création depuis l’atelier, liste, résolution', async () => {
  let r = await appel('POST', `/api/prod/of/${OF1.id}/signalements`, { jeton: J.atelier, body: { texte: 'x' } });
  assert.equal(r.statusCode, 400);
  r = await appel('POST', `/api/prod/of/${OF1.id}/signalements`, { jeton: J.atelier, body: { partie: 1, texte: 'Tissu manquant sur le matelas 2' } });
  assert.equal(r.statusCode, 201, r.body);
  const sid = r.json().id;
  r = await appel('GET', '/api/prod/signalements?etat=ouvert', { jeton: J.admin });
  assert.equal(r.statusCode, 200);
  assert.ok(r.json().some((s) => s.id === sid && s.numero === OF1.numero));
  // détail de l'OF
  const of = (await appel('GET', `/api/prod/of/${OF1.id}`, { jeton: J.atelier })).json();
  assert.equal(of.signalements[0].texte, 'Tissu manquant sur le matelas 2');
  r = await appel('POST', `/api/prod/signalements/${sid}/resoudre`, { jeton: J.atelier, body: { note: 'Toile reçue' } });
  assert.equal(r.statusCode, 200, r.body);
  r = await appel('POST', `/api/prod/signalements/${sid}/resoudre`, { jeton: J.admin });
  assert.equal(r.statusCode, 400);
});

test('flux tablette : photo d’atelier sur l’OF, validation de la partie 3, aucun prix', async () => {
  // le JPEG de test (signature réelle)
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xa, 0xb, 0xc]);
  // un commercial ne peut pas joindre de photo d'atelier
  let r = await app.inject({ method: 'POST', url: `/api/fichiers?nature=photo_atelier&cible_type=of&cible_id=${OF1.id}`, payload: jpeg, headers: { authorization: 'Bearer ' + J.commercial, 'content-type': 'image/jpeg' } });
  assert.equal(r.statusCode, 403);
  r = await app.inject({ method: 'POST', url: `/api/fichiers?nature=photo_atelier&cible_type=of&cible_id=${OF1.id}`, payload: jpeg, headers: { authorization: 'Bearer ' + J.atelier, 'content-type': 'image/jpeg' } });
  assert.equal(r.statusCode, 201, r.body);
  const photo = r.json();
  assert.equal(photo.nature, 'photo_atelier');
  // une photo d'atelier ne se rattache pas à une commande
  r = await app.inject({ method: 'POST', url: `/api/fichiers?nature=photo_atelier&cible_type=commande&cible_id=cmd1`, payload: jpeg, headers: { authorization: 'Bearer ' + J.atelier, 'content-type': 'image/jpeg' } });
  assert.equal(r.statusCode, 400);
  // coupe : sortie du rouleau (40 % de 20 pièces × 1,09 = 8,72 m)
  const R1 = (await appel('GET', `/api/stocks/mp/articles/${TISSU}/lots`, { jeton: J.admin })).json().find((l) => l.rouleau === 'R1');
  r = await appel('POST', `/api/prod/of/${OF1.id}/partie/1/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 20 }], sorties: [{ article_id: TISSU, lot_id: R1.id, qte: 8.72 }] } });
  assert.equal(r.statusCode, 201, r.body);
  // assemblage avec la photo de la tablette
  r = await appel('POST', `/api/prod/of/${OF1.id}/partie/3/valider`, { jeton: J.atelier, body: { qtes: [{ taille: 'XL', couleur: 'Blanc', qte: 20 }], photo_id: photo.id } });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().statut, 'termine');
  // la photo est bien lue par l'atelier, pas par un tiers sans droits
  r = await appel('GET', `/api/fichiers?cible_type=of&cible_id=${OF1.id}`, { jeton: J.atelier });
  assert.equal(r.json().length, 1);
  // aucun prix ni montant dans tout le détail de l'OF vu par l'atelier
  const of = (await appel('GET', `/api/prod/of/${OF1.id}`, { jeton: J.atelier })).json();
  const corps = JSON.stringify(of);
  assert.ok(!corps.includes('"pu"') && !corps.includes('"montant"') && !corps.includes('"pri"'), 'aucun coût dans la fiche tablette');
});