'use strict';
// Codes-barres produit + fibres / entretien des tissus + paramètres d'étiquetage (lot 0.15.0, spec § 4).
//  * un code par produit × taille × couleur (C3), créé automatiquement, jamais réutilisé ni supprimé ;
//  * sachet de N pièces (N > 1) : code distinct (C4) ;
//  * Code 128 interne « DT00000001 » tant qu'aucun préfixe GS1 n'est saisi (C2), EAN-13 ensuite.
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');
const E = require('./etiquetage');

const erreur = (reply, code, err, message) => reply.code(code).send({ erreur: err, message });
const exige = (f, a) => S.exigerConnexion({ droit: [f, a] });
const capte = (reply) => (e) => { if (e.statusCode && e.code) return erreur(reply, e.statusCode, e.code, e.message); throw e; };
const leve = (code, message, statusCode = 400) => Object.assign(new Error(message), { statusCode, code });

/** Couleurs connues d'un produit : celles de ses commandes et OF (sinon une seule « » = toutes couleurs). */
async function couleursDe(c, produit) {
  const r = await c.query(`select distinct x->>'couleur' coul from prod.of o, jsonb_array_elements(o.tailles_couleurs) x where o.produit_id = $1 and coalesce(x->>'couleur', '') <> ''`, [produit.id]);
  return r.rows.map((x) => x.coul);
}

/** Crée les codes manquants d'un produit (tailles du taillant × couleurs données, + sachet si pièces/sachet > 1). */
async function creerCodesProduit(c, u, produitId, couleurs = null) {
  const p = (await c.query('select id, reference, taillant, pieces_par_sachet from pf.produits where id = $1', [produitId])).rows[0];
  if (!p) return [];
  const tailles = (p.taillant || []).length ? p.taillant.map(String) : [''];
  const coul = couleurs && couleurs.length ? couleurs : [''];
  const conds = p.pieces_par_sachet > 1 ? [1, p.pieces_par_sachet] : [1];
  const crees = [];
  for (const t of tailles) for (const k of coul) for (const n of conds) {
    if ((await c.query('select 1 from pf.codes_barres where produit_id = $1 and taille = $2 and couleur = $3 and conditionnement = $4', [p.id, t, k, n])).rowCount) continue;
    const cb = await E.attribuerCodeBarres(c);
    await c.query(`insert into pf.codes_barres (produit_id, taille, couleur, conditionnement, code, type, cree_par) values ($1,$2,$3,$4,$5,$6,$7)`, [p.id, t, k, n, cb.code, cb.type, u.id]);
    crees.push({ taille: t, couleur: k, conditionnement: n, ...cb });
  }
  if (crees.length) await c.query(`insert into noyau.audit (utilisateur_id, identifiant, action, entite, entite_id, details) values ($1,$2,'code_barres_cree','produit_fini',$3,$4)`,
    [u.id, u.identifiant || null, p.reference, { codes: crees.map((x) => `${x.taille || 'TU'}/${x.couleur || '*'}${x.conditionnement > 1 ? '×' + x.conditionnement : ''}=${x.code}`) }]);
  return crees;
}
/** Code-barres d'un produit pour une taille / couleur (repli : toutes couleurs « ») — créé au besoin. */
async function codePour(c, u, produitId, taille, couleur, conditionnement = 1) {
  const q = async () => (await c.query(`select code, type from pf.codes_barres where produit_id = $1 and taille = $2 and couleur = any($3) and conditionnement = $4 and actif
    order by (couleur = '') limit 1`, [produitId, taille || '', [couleur || '', ''], conditionnement])).rows[0];
  let r = await q();
  if (!r) { await creerCodesProduit(c, u, produitId, couleur ? [couleur] : null); r = await q(); }
  if (!r) { // taille hors taillant (OF ancien) : code créé pour cette seule case
    const cb = await E.attribuerCodeBarres(c);
    await c.query(`insert into pf.codes_barres (produit_id, taille, couleur, conditionnement, code, type, cree_par) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`, [produitId, taille || '', couleur || '', conditionnement, cb.code, cb.type, u.id]);
    r = await q();
  }
  return r;
}

module.exports = async function routesCodesBarres(app) {
  // ---------------------------------------------------------------- codes-barres d'un produit
  app.get('/api/produits/:id/codes-barres', { preHandler: exige('commercial.codes_barres', 'lire'), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req) =>
    (await pool.query(`select id::int, taille, couleur, conditionnement, code, type, actif, cree_le from pf.codes_barres where produit_id = $1 order by conditionnement, couleur, taille`, [req.params.id])).rows);

  app.post('/api/produits/:id/codes-barres', {
    preHandler: exige('commercial.codes_barres', 'creer'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', additionalProperties: false, properties: {
      couleurs: { type: 'array', maxItems: 60, items: { type: 'string', maxLength: 60 } } } } },
  }, async (req, reply) => transaction(async (c) => {
    if (!(await c.query('select 1 from pf.produits where id = $1 and not annule', [req.params.id])).rowCount) throw leve('introuvable', 'Produit fini introuvable.', 404);
    const crees = await creerCodesProduit(c, req.utilisateur, req.params.id, (req.body.couleurs || []).map((x) => String(x).trim()).filter(Boolean));
    return { crees };
  }).catch(capte(reply)));

  // pièces par sachet (1, 2, 10 pour torchons, serviettes, coiffes…) : crée le code « sachet » au besoin
  app.put('/api/produits/:id/conditionnement', {
    preHandler: exige('commercial.codes_barres', 'modifier'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', required: ['pieces_par_sachet'], additionalProperties: false, properties: {
      pieces_par_sachet: { type: 'integer', minimum: 1, maximum: 1000 }, designation: { type: 'string', maxLength: 160 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const p = (await c.query('select id, reference, pieces_par_sachet, designation from pf.produits where id = $1 for update', [req.params.id])).rows[0];
    if (!p) throw leve('introuvable', 'Produit fini introuvable.', 404);
    await c.query('update pf.produits set pieces_par_sachet = $2, designation = coalesce($3, designation), maj_le = now(), maj_par = $4 where id = $1',
      [p.id, req.body.pieces_par_sachet, req.body.designation ?? null, req.utilisateur.id]);
    await S.auditer(c, req, 'conditionnement_modifie', { entite: 'produit_fini', entiteId: p.reference, avant: { pieces_par_sachet: p.pieces_par_sachet, designation: p.designation },
      apres: { pieces_par_sachet: req.body.pieces_par_sachet, designation: req.body.designation } });
    const crees = await creerCodesProduit(c, req.utilisateur, p.id);
    return { ok: true, crees };
  }).catch(capte(reply)));

  // recherche par code scanné (inventaire, BL, contrôle) : sans prix
  app.get('/api/codes-barres/:code', { preHandler: exige('commercial.codes_barres', 'lire'), schema: { params: { type: 'object', properties: { code: { type: 'string', maxLength: 20 } } } } }, async (req, reply) => {
    const r = (await pool.query(`select b.code, b.type, b.taille, b.couleur, b.conditionnement, p.id::int produit_id, p.reference, p.designation, p.sexe, ca.libelle article
      from pf.codes_barres b join pf.produits p on p.id = b.produit_id left join pf.codes_article ca on ca.code = p.code_article where b.code = $1`, [req.params.code])).rows[0];
    if (!r) return erreur(reply, 404, 'introuvable', 'Code-barres inconnu.');
    return { ...r, sexe_libelle: E.SEXES[r.sexe] };
  });

  // ---------------------------------------------------------------- fibres et entretien des tissus
  app.get('/api/etiquettes/referentiel', { preHandler: S.exigerConnexion() }, async () => ({
    fibres: (await pool.query('select code, fr, ar, ordre, actif from parametres.fibres order by ordre, code')).rows,
    modeles: (await pool.query('select code, libelle, symboles, texte_fr, texte_ar, ordre from parametres.modeles_entretien order by ordre, code')).rows,
    symboles: E.SYMBOLES, traitements: E.TRAITEMENTS,
    options: Object.fromEntries((await pool.query(`select code, valeur from parametres.options where code like 'etiq_%' or code = 'gs1_prefixe'`)).rows.map((x) => [x.code, x.valeur])),
  }));

  // Composition (fibres %) et entretien d'un article tissu (registre articles_mp) — total 100 %, 5 symboles ISO
  app.put('/api/stocks/mp/articles/:id/composition', {
    preHandler: S.exigerConnexion(),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', required: ['fibres', 'entretien', 'version'], additionalProperties: false, properties: {
      version: { type: 'integer' }, fibres: { type: 'array', minItems: 1, maxItems: 8 }, entretien: { type: 'object' } } } },
  }, async (req, reply) => transaction(async (c) => {
    if (!(D.peut(req.droits, 'stock_mp.articles', 'modifier') || D.peut(req.droits, 'infographie.fiches', 'modifier'))) throw leve('interdit', 'Vos droits ne permettent pas de modifier la composition des tissus.', 403);
    const a = (await c.query(`select id, donnees, version from registres.fiches where id = $1 and registre = 'articles_mp' for update`, [req.params.id])).rows[0];
    if (!a) throw leve('introuvable', 'Article matière introuvable.', 404);
    if (a.version !== req.body.version) throw leve('conflit_version', 'Article modifié entre-temps sur un autre poste. Rechargez.', 409);
    const codes = (await c.query('select code from parametres.fibres where actif')).rows.map((x) => x.code);
    const fibres = E.nettoyerFibres(req.body.fibres, codes);
    const entretien = E.nettoyerEntretien(req.body.entretien);
    const dico = Object.fromEntries((await c.query('select code, fr, ar from parametres.fibres')).rows.map((x) => [x.code, x]));
    const t = E.texteFibres(fibres, dico);
    const d = { ...a.donnees, fibres, entretien, composition: t.fr, composition_ar: t.ar };
    await c.query('update registres.fiches set donnees = $2, version = version + 1, maj_le = now(), maj_par = $3 where id = $1', [a.id, d, req.utilisateur.id]);
    await S.auditer(c, req, 'entretien_article_modifie', { entite: 'articles_mp', entiteId: a.id, avant: { fibres: a.donnees.fibres, entretien: a.donnees.entretien }, apres: { fibres, entretien } });
    return { ok: true, composition: t.fr, composition_ar: t.ar, version: a.version + 1 };
  }).catch(capte(reply)));

  // ---------------------------------------------------------------- paramètres d'étiquetage
  app.put('/api/parametres/etiquettes', {
    preHandler: exige('parametres.etiquettes', 'modifier'),
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      etiq_origine_fr: { type: 'string', maxLength: 60 }, etiq_origine_ar: { type: 'string', maxLength: 60 }, etiq_reserve: { type: 'integer', minimum: 0, maximum: 50 },
      etiq_client: { type: 'string', enum: ['oui', 'non'] }, etiq_format_emballage: { type: 'string', pattern: '^[0-9]{2,3}x[0-9]{2,3}$' },
      gs1_prefixe: { type: 'string', pattern: '^([0-9]{6,11})?$' },
      fibres: { type: 'array', maxItems: 60, items: { type: 'object', required: ['code', 'fr'], additionalProperties: false, properties: {
        code: { type: 'string', pattern: '^[a-z_]{2,30}$' }, fr: { type: 'string', maxLength: 40 }, ar: { type: 'string', maxLength: 40 }, actif: { type: 'boolean' } } } },
      modeles: { type: 'array', maxItems: 40, items: { type: 'object', required: ['code', 'libelle', 'symboles'], additionalProperties: false, properties: {
        code: { type: 'string', pattern: '^[a-z0-9_]{2,40}$' }, libelle: { type: 'string', maxLength: 60 }, symboles: { type: 'object' }, texte_fr: { type: 'string', maxLength: 300 }, texte_ar: { type: 'string', maxLength: 300 } } } } } } },
  }, async (req, reply) => transaction(async (c) => {
    const b = req.body, avant = {}, apres = {};
    for (const k of ['etiq_origine_fr', 'etiq_origine_ar', 'etiq_reserve', 'etiq_client', 'etiq_format_emballage', 'gs1_prefixe']) {
      if (b[k] === undefined) continue;
      if (k === 'gs1_prefixe' && b[k] && !/^619/.test(b[k])) throw leve('prefixe_invalide', 'Un préfixe GS1 Tunisie commence par 619.');
      avant[k] = (await c.query('select valeur from parametres.options where code = $1', [k])).rows[0]?.valeur;
      await c.query('update parametres.options set valeur = $2, maj_le = now(), maj_par = $3 where code = $1', [k, String(b[k]), req.utilisateur.id]);
      apres[k] = String(b[k]);
    }
    for (const f of b.fibres || []) await c.query(`insert into parametres.fibres (code, fr, ar, actif) values ($1,$2,$3,coalesce($4,true))
      on conflict (code) do update set fr = excluded.fr, ar = excluded.ar, actif = excluded.actif`, [f.code, f.fr, f.ar || '', f.actif ?? true]);
    for (const m of b.modeles || []) {
      const sy = E.nettoyerEntretien(m.symboles);
      await c.query(`insert into parametres.modeles_entretien (code, libelle, symboles, texte_fr, texte_ar) values ($1,$2,$3,$4,$5)
        on conflict (code) do update set libelle = excluded.libelle, symboles = excluded.symboles, texte_fr = excluded.texte_fr, texte_ar = excluded.texte_ar`,
        [m.code, m.libelle, { lavage: sy.lavage, blanchiment: sy.blanchiment, sechage: sy.sechage, repassage: sy.repassage, pro: sy.pro }, m.texte_fr || '', m.texte_ar || '']);
    }
    await S.auditer(c, req, 'parametre_etiquettes_modifie', { entite: 'parametres', entiteId: 'etiquettes', avant, apres: { ...apres, fibres: (b.fibres || []).length || undefined, modeles: (b.modeles || []).length || undefined } });
    return { ok: true };
  }).catch(capte(reply)));
};
module.exports.creerCodesProduit = creerCodesProduit;
module.exports.codePour = codePour;
module.exports.couleursDe = couleursDe;
