'use strict';
// Fiches techniques versionnées (lot 0.15.0, spec SPEC-FICHES-0.15.0) :
//   infographiste : fiche (= produit fini, référence P00126H = nom du patronage .MDL) → versions (jamais d'écrasement)
//   → « Proposer au commercial » : version figée + PDF (identifiant caché DTX-FICHE) + commande brouillon SANS numéro NI prix
//   commercial : complète quantités (couleurs × tailles) et prix → valide → commande CMD-AAAA-NNNN (numéro à la validation),
//   versions validées « Validée par X le JJ/MM/AAAA » (PDF tamponné) → OF lancés (bloqués sans BOM ni gamme).
// « Basique » (client vide) : uniquement pour les fiches / produits, jamais pour un document de vente.
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');
const V = require('./ventes');
const PR = require('./prod');
const PDF = require('./pdf-fiches');

const erreur = (reply, code, err, message, extra) => reply.code(code).send({ erreur: err, message, ...extra });
const exige = (f, a) => S.exigerConnexion({ droit: [f, a] });
const leve = (code, message, statusCode = 400) => Object.assign(new Error(message), { statusCode, code });
const capte = (reply) => (e) => { if (e.statusCode && e.code) return erreur(reply, e.statusCode, e.code, e.message, e.extra); throw e; };
const txt = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const jour = () => new Date().toISOString().slice(0, 10);
const r3 = (v) => Math.round((+v || 0) * 1000) / 1000;
const STATUTS = { brouillon: 'Brouillon', proposee: 'Proposée', validee: 'Validée', en_production: 'En production', archivee: 'Archivée' };

async function nomUtilisateur(db, id) {
  return (await db.query('select coalesce(nom_complet, identifiant) n from noyau.utilisateurs where id = $1', [id])).rows[0]?.n || '';
}
async function clientDe(db, id) {
  if (!id) return null;
  const r = (await db.query(`select donnees from commercial.documents where collection = 'clients' and id = $1`, [String(id)])).rows[0];
  if (!r) throw leve('client_inconnu', 'Client introuvable : choisissez un client de la liste.');
  return r.donnees;
}

/** Fiche complète : produit, versions (sans la composition 3D, lourde, sauf demande). */
async function lireFiche(db, id, { avecConfig = false } = {}) {
  const f = (await db.query(`select f.*, p.reference ref_produit, p.code_article, p.sexe, p.taillant, p.etat, p.designation produit_designation,
      p.pieces_par_sachet, ca.libelle article
    from fiches.fiches f join pf.produits p on p.id = f.produit_id left join pf.codes_article ca on ca.code = p.code_article where f.id = $1`, [id])).rows[0];
  if (!f) return null;
  const v = (await db.query(`select v.id, v.numero, v.statut, v.vignette, v.pdf_id, v.pdf_valide_id, v.brouillon_id, v.commande_id, v.commande_numero,
      v.motif_modif, v.cree_le, v.propose_le, v.valide_le, v.valide_par_nom, v.version_ligne ${avecConfig ? ', v.config_studio' : ''},
      coalesce(c.nom_complet, c.identifiant) cree_par_nom, coalesce(pp.nom_complet, pp.identifiant) propose_par_nom
    from fiches.versions v left join noyau.utilisateurs c on c.id = v.cree_par left join noyau.utilisateurs pp on pp.id = v.propose_par
    where v.fiche_id = $1 order by v.numero desc`, [id])).rows.map((x) => ({ ...x, id: Number(x.id), pdf_id: x.pdf_id && Number(x.pdf_id), pdf_valide_id: x.pdf_valide_id && Number(x.pdf_valide_id), brouillon_id: x.brouillon_id && Number(x.brouillon_id) }));
  return { ...f, id: Number(f.id), produit_id: Number(f.produit_id), source_fiche_id: f.source_fiche_id && Number(f.source_fiche_id),
    client_libelle: f.client_id ? f.client_nom : 'Basique', versions: v };
}

/** Prochaine version d'une fiche (dans la transaction, verrou de ligne sur la fiche). */
async function nouvelleVersion(c, req, ficheId, { config, vignette, motif }) {
  const f = (await c.query('select * from fiches.fiches where id = $1 for update', [ficheId])).rows[0];
  if (!f) throw leve('introuvable', 'Fiche introuvable.', 404);
  if (f.annule) throw leve('fiche_annulee', 'Cette fiche est annulée.');
  if ((await c.query(`select 1 from fiches.versions where fiche_id = $1 and statut = 'brouillon'`, [ficheId])).rowCount)
    throw leve('brouillon_existant', 'Un brouillon est déjà ouvert pour cette fiche : modifiez-le ou proposez-le d’abord.', 409);
  const n = f.version_courante + 1;
  if (n > 1 && !txt(motif, 300)) throw leve('motif_obligatoire', 'Indiquez le motif de la modification (nouvelle version).');
  const v = (await c.query(`insert into fiches.versions (fiche_id, numero, config_studio, vignette, motif_modif, cree_par) values ($1,$2,$3,$4,$5,$6) returning id`,
    [ficheId, n, config || {}, txt(vignette, 400000), txt(motif, 300), req.utilisateur.id])).rows[0];
  await c.query('update fiches.fiches set version_courante = $2, maj_le = now() where id = $1', [ficheId, n]);
  await S.auditer(c, req, 'fiche_version_creee', { entite: 'fiche', entiteId: f.reference, details: { version: n, motif: txt(motif, 300) || undefined } });
  return Number(v.id);
}

/** Fiche d'un produit fini (créée à la première demande). */
async function ficheDuProduit(c, req, produitId, designation) {
  const p = (await c.query('select * from pf.produits where id = $1 and annule = false', [produitId])).rows[0];
  if (!p) throw leve('produit_introuvable', 'Produit fini introuvable (ou annulé).', 404);
  const ex = (await c.query('select id from fiches.fiches where produit_id = $1', [produitId])).rows[0];
  if (ex) return Number(ex.id);
  const r = (await c.query(`insert into fiches.fiches (produit_id, reference, client_id, client_nom, designation, cree_par) values ($1,$2,$3,$4,$5,$6) returning id`,
    [p.id, p.reference, p.client_id || null, p.client_nom || '', txt(designation || p.designation, 160), req.utilisateur.id])).rows[0];
  await S.auditer(c, req, 'fiche_creee', { entite: 'fiche', entiteId: p.reference, details: { produit_id: Number(p.id), client: p.client_nom || 'Basique' } });
  return Number(r.id);
}

/** Copie la BOM et la gamme actives d'un produit vers un autre (version 1). */
async function copierBomGamme(c, u, de, vers) {
  const b = await PR.bomActive(c, de);
  if (b) {
    const nb = (await c.query(`insert into pf.boms (produit_id, version, origine, note, cree_par) values ($1, 1, 'creation', $2, $3) returning id`, [vers, 'Copie de la BOM v' + b.version, u.id])).rows[0].id;
    for (const l of b.lignes) await c.query(`insert into pf.bom_lignes (bom_id, article_id, designation, unite, qte_base, par_taille, pu, ordre) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [nb, l.article_id, l.designation, l.unite, l.qte_base, l.par_taille, l.pu, l.ordre]);
  }
  const g = await PR.gammeActive(c, de);
  if (g) {
    const ng = (await c.query(`insert into pf.gammes (produit_id, version, origine, note, cree_par) values ($1, 1, 'creation', $2, $3) returning id`, [vers, 'Copie de la gamme v' + g.version, u.id])).rows[0].id;
    for (const o of g.operations || g.lignes || []) await c.query(`insert into pf.gamme_operations (gamme_id, operation, temps_min, poste, ordre) values ($1,$2,$3,$4,$5)`,
      [ng, o.operation, o.temps_min, o.poste || '', o.ordre || 0]);
  }
}

/** Brouillon de commande vu par un compte : sans prix si le compte ne voit pas les prix. */
function brouillonVu(eff, b) {
  const x = { ...b, id: Number(b.id) };
  if (!D.voit(eff, 'prix')) x.lignes = (x.lignes || []).map(({ pu, remise, ...l }) => l);
  return x;
}

/** Enregistre un fichier PDF généré par le serveur (même dossier que routes-fichiers). */
async function rangerPdf(c, u, bytes, nom, cibleType, cibleId, nature = 'fiche_technique') {
  const F = require('./routes-fichiers');
  return F.enregistrerFichier(c, u, { nature, cible_type: cibleType, cible_id: String(cibleId), nom, mime: 'application/pdf', octets: Buffer.from(bytes) });
}

module.exports = async function routesFiches(app) {
  // PDF brut (« Ouvrir un PDF… ») : le parser de routes-fichiers est propre à son module (encapsulation Fastify)
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer', bodyLimit: 30 * 1024 * 1024 }, (req, body, done) => done(null, body));
  // ============================================================ BIBLIOTHÈQUE
  app.get('/api/fiches', { preHandler: exige('infographie.fiches', 'lire'), schema: { querystring: { type: 'object', additionalProperties: false, properties: {
    client: { type: 'string', maxLength: 40 }, statut: { type: 'string', enum: Object.keys(STATUTS) }, q: { type: 'string', maxLength: 80 } } } } }, async (req) => {
    const q = req.query;
    const r = await pool.query(`select f.id, f.reference, f.client_id, f.client_nom, f.designation, f.version_courante, f.source_fiche_id, f.maj_le,
        p.code_article, p.sexe, p.etat, ca.libelle article, v.statut, v.vignette, v.numero, v.valide_par_nom, v.valide_le, v.commande_numero
      from fiches.fiches f join pf.produits p on p.id = f.produit_id left join pf.codes_article ca on ca.code = p.code_article
      left join fiches.versions v on v.fiche_id = f.id and v.numero = f.version_courante
      where not f.annule and ($1::text is null or ($1 = 'basique' and f.client_id is null) or f.client_id = $1)
        and ($2::text is null or v.statut = $2)
        and ($3::text is null or (f.reference || ' ' || f.designation || ' ' || f.client_nom || ' ' || coalesce(ca.libelle, '')) ilike '%' || $3 || '%')
      order by (f.client_id is not null), f.client_nom, f.maj_le desc limit 500`, [q.client || null, q.statut || null, q.q || null]);
    return r.rows.map((x) => ({ ...x, id: Number(x.id), client_libelle: x.client_id ? x.client_nom : 'Basique' }));
  });

  // Liste des clients pour les fiches : « Basique » toujours en premier (décision du 26/10/2026)
  app.get('/api/fiches/clients', { preHandler: exige('infographie.fiches', 'lire') }, async () => {
    const r = await pool.query(`select id, donnees->>'name' nom from commercial.documents where collection = 'clients' order by lower(donnees->>'name')`);
    return [{ id: '', nom: 'Basique', basique: true }, ...r.rows];
  });

  app.get('/api/fiches/:id', { preHandler: exige('infographie.fiches', 'lire'), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req, reply) => {
    const f = await lireFiche(pool, req.params.id);
    if (!f) return erreur(reply, 404, 'introuvable', 'Fiche introuvable.');
    return { ...f, verrou: await V.verrouAutre(pool, 'fiche', f.id, req.utilisateur.id) };
  });
  app.get('/api/fiches/versions/:vid', { preHandler: exige('infographie.fiches', 'lire'), schema: { params: { type: 'object', properties: { vid: { type: 'integer' } } } } }, async (req, reply) => {
    const v = (await pool.query(`select v.*, f.reference, f.client_nom, f.client_id from fiches.versions v join fiches.fiches f on f.id = v.fiche_id where v.id = $1`, [req.params.vid])).rows[0];
    if (!v) return erreur(reply, 404, 'introuvable', 'Version introuvable.');
    return { ...v, id: Number(v.id), fiche_id: Number(v.fiche_id) };
  });

  // Comparer deux versions : différences de composition (couleurs, logos, emplacements, marquages)
  app.get('/api/fiches/comparer/:a/:b', { preHandler: exige('infographie.fiches', 'lire'), schema: { params: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'integer' } } } } }, async (req, reply) => {
    const r = (await pool.query('select id, numero, fiche_id, config_studio, vignette, statut from fiches.versions where id = any($1)', [[req.params.a, req.params.b]])).rows;
    if (r.length !== 2 || r[0].fiche_id !== r[1].fiche_id) return erreur(reply, 400, 'comparaison_impossible', 'Choisissez deux versions de la même fiche.');
    const [A, B] = r[0].id == req.params.a ? r : [r[1], r[0]];
    const diff = [];
    const parcourir = (x, y, chemin) => {
      if (JSON.stringify(x) === JSON.stringify(y)) return;
      if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
        for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) parcourir(x[k], y[k], chemin ? chemin + '.' + k : k);
        return;
      }
      const court = (v) => { const s = JSON.stringify(v ?? null); return s.length > 80 ? s.slice(0, 77) + '…' : s; };
      if (diff.length < 200) diff.push({ champ: chemin, avant: court(x), apres: court(y) });
    };
    parcourir(A.config_studio, B.config_studio, '');
    return { a: { id: Number(A.id), numero: A.numero, statut: A.statut, vignette: A.vignette }, b: { id: Number(B.id), numero: B.numero, statut: B.statut, vignette: B.vignette }, differences: diff };
  });

  // Ouvrir un PDF : lecture de l'identifiant caché DTX-FICHE:<fiche>:v<n>
  app.post('/api/fiches/ouvrir-pdf', { preHandler: exige('infographie.fiches', 'lire'), bodyLimit: 30 * 1024 * 1024 }, async (req, reply) => {
    const b = req.body;
    if (!Buffer.isBuffer(b) || b.slice(0, 5).toString() !== '%PDF-') return erreur(reply, 400, 'fichier_invalide', 'Choisissez un fichier PDF.');
    const id = await PDF.lireIdentifiant(b);
    if (!id) return erreur(reply, 404, 'pdf_ancien', 'PDF antérieur au lot 0.15.0 (ou d’une autre origine) : aucune fiche liée. Il reste un simple document.');
    const v = (await pool.query('select v.id, v.fiche_id, v.numero from fiches.versions v where v.fiche_id = $1 and v.numero = $2', [id.fiche, id.version])).rows[0];
    if (!v) return erreur(reply, 404, 'version_introuvable', 'La fiche citée par ce PDF n’existe pas sur ce serveur.');
    return { fiche_id: Number(v.fiche_id), version_id: Number(v.id), numero: v.numero };
  });

  // ============================================================ CRÉATION / VERSIONS
  // Nouvelle fiche : sur un produit fini existant, ou avec création du produit (code article + sexe → référence).
  app.post('/api/fiches', {
    preHandler: exige('infographie.fiches', 'creer'), bodyLimit: 8 * 1024 * 1024,
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      produit_id: { type: 'integer' }, code_article: { type: 'string', maxLength: 10 }, sexe: { type: 'string', enum: ['B', 'E', 'F', 'H', 'U'] },
      taillant: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 20 } }, client_id: { type: 'string', maxLength: 40 },
      designation: { type: 'string', maxLength: 160 }, config_studio: { type: 'object' }, vignette: { type: 'string', maxLength: 400000 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const b = req.body;
    let produitId = b.produit_id;
    if (!produitId) {
      if (!D.peut(req.droits, 'commercial.produits_finis', 'creer')) throw leve('interdit', 'Créer un produit fini demande le droit « Produits finis › créer ».', 403);
      const code = txt(b.code_article, 10).toUpperCase();
      if (!code || !b.sexe) throw leve('incomplet', 'Choisissez le code article et le sexe : la référence est attribuée par le serveur.');
      const cl = await clientDe(c, b.client_id);
      const ref = (await c.query('select pf.attribuer_reference($1, $2) r', [code, b.sexe])).rows[0].r;
      const m = ref.match(/^([A-Z]+)([0-9]{3})([0-9]{2})[BEFHU]$/);
      // un produit avec client est SPÉCIFIQUE, même sans marquage (décision du 26/10/2026)
      produitId = Number((await c.query(`insert into pf.produits (reference, code_article, numero, annee, sexe, etat, client_id, client_nom, taillant, patronage, designation, cree_par, maj_par)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) returning id`,
        [ref, code, Number(m[2]), 2000 + Number(m[3]), b.sexe, cl ? 'specifique' : 'basique', cl ? cl.id : null, cl ? cl.name : '',
          JSON.stringify((b.taillant || []).map((t) => txt(t, 20)).filter(Boolean)), ref + '.MDL', txt(b.designation, 160), req.utilisateur.id])).rows[0].id);
      await c.query(`insert into pf.historique (produit_id, version, action, donnees, utilisateur) values ($1, 1, 'cree', $2, $3)`,
        [produitId, { reference: ref, origine: 'fiche technique (Infographie)' }, req.utilisateur.id]);
      await S.auditer(c, req, 'produit_cree', { entite: 'produit_fini', entiteId: produitId, apres: { reference: ref, etat: cl ? 'specifique' : 'basique', origine: 'infographie' } });
      await require('./routes-codes-barres').creerCodesProduit(c, req.utilisateur, produitId);
    }
    const ficheId = await ficheDuProduit(c, req, produitId, b.designation);
    const f = (await c.query('select version_courante from fiches.fiches where id = $1', [ficheId])).rows[0];
    if (f.version_courante === 0) await nouvelleVersion(c, req, ficheId, { config: b.config_studio, vignette: b.vignette });
    reply.code(201);
    return lireFiche(c, ficheId);
  }).catch(capte(reply)));

  // Enregistrer le brouillon (seul un brouillon se modifie en place) — verrou 30 min + version de ligne
  app.put('/api/fiches/versions/:vid', {
    preHandler: exige('infographie.fiches', 'modifier'), bodyLimit: 8 * 1024 * 1024,
    schema: { params: { type: 'object', properties: { vid: { type: 'integer' } } }, body: { type: 'object', required: ['version_ligne'], additionalProperties: false, properties: {
      version_ligne: { type: 'integer' }, config_studio: { type: 'object' }, vignette: { type: 'string', maxLength: 400000 }, motif_modif: { type: 'string', maxLength: 300 }, designation: { type: 'string', maxLength: 160 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const v = (await c.query('select * from fiches.versions where id = $1 for update', [req.params.vid])).rows[0];
    if (!v) throw leve('introuvable', 'Version introuvable.', 404);
    if (v.statut !== 'brouillon') throw leve('version_figee', `La version ${v.numero} est ${STATUTS[v.statut].toLowerCase()} : elle ne se modifie plus. Créez une nouvelle version.`, 409);
    const autre = await V.prendreVerrou(c, 'fiche', v.fiche_id, req.utilisateur, S.contexte(req).poste);
    if (autre) throw Object.assign(leve('verrouille', `Fiche en cours de modification par ${autre.par}${autre.poste ? ' (' + autre.poste + ')' : ''} : lecture seule.`, 423), { extra: { verrou: autre } });
    if (v.version_ligne !== req.body.version_ligne) throw leve('conflit_version', 'Cette fiche a été enregistrée entre-temps sur un autre poste. Rechargez-la.', 409);
    const b = req.body;
    await c.query(`update fiches.versions set config_studio = coalesce($2, config_studio), vignette = coalesce($3, vignette), motif_modif = coalesce($4, motif_modif),
      version_ligne = version_ligne + 1 where id = $1`, [v.id, b.config_studio || null, b.vignette ?? null, b.motif_modif ?? null]);
    if (b.designation !== undefined) await c.query('update fiches.fiches set designation = $2, maj_le = now() where id = $1', [v.fiche_id, txt(b.designation, 160)]);
    return lireFiche(c, v.fiche_id, { avecConfig: false });
  }).catch(capte(reply)));

  // Nouvelle version (copie d'une version choisie, en brouillon, motif obligatoire)
  app.post('/api/fiches/:id/versions', {
    preHandler: exige('infographie.fiches', 'modifier'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', required: ['depuis', 'motif'], additionalProperties: false, properties: {
      depuis: { type: 'integer' }, motif: { type: 'string', minLength: 3, maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const src = (await c.query('select config_studio, vignette from fiches.versions where id = $1 and fiche_id = $2', [req.body.depuis, req.params.id])).rows[0];
    if (!src) throw leve('introuvable', 'Version de départ introuvable.', 404);
    const vid = await nouvelleVersion(c, req, req.params.id, { config: src.config_studio, vignette: src.vignette, motif: req.body.motif });
    reply.code(201);
    return { ...(await lireFiche(c, req.params.id)), nouvelle_version_id: vid };
  }).catch(capte(reply)));

  // Dupliquer pour un autre client (ou donner une basique à un client) → NOUVELLE référence, source notée
  app.post('/api/fiches/:id/dupliquer', {
    preHandler: exige('infographie.fiches', 'creer'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', required: ['depuis'], additionalProperties: false, properties: {
      depuis: { type: 'integer' }, client_id: { type: 'string', maxLength: 40 }, designation: { type: 'string', maxLength: 160 } } } },
  }, async (req, reply) => transaction(async (c) => {
    if (!D.peut(req.droits, 'commercial.produits_finis', 'creer')) throw leve('interdit', 'Dupliquer crée un produit fini : droit « Produits finis › créer » requis.', 403);
    const f = (await c.query('select * from fiches.fiches where id = $1', [req.params.id])).rows[0];
    if (!f) throw leve('introuvable', 'Fiche introuvable.', 404);
    const src = (await c.query('select config_studio, vignette, numero from fiches.versions where id = $1 and fiche_id = $2', [req.body.depuis, f.id])).rows[0];
    if (!src) throw leve('introuvable', 'Version de départ introuvable.', 404);
    const p = (await c.query('select * from pf.produits where id = $1', [f.produit_id])).rows[0];
    const cl = await clientDe(c, req.body.client_id);
    const ref = (await c.query('select pf.attribuer_reference($1, $2) r', [p.code_article, p.sexe])).rows[0].r;
    const m = ref.match(/^([A-Z]+)([0-9]{3})([0-9]{2})[BEFHU]$/);
    const np = Number((await c.query(`insert into pf.produits (reference, code_article, numero, annee, sexe, etat, client_id, client_nom, illustration, taillant, patronage,
        bom, gamme, marquages, note, designation, pieces_par_sachet, cree_par, maj_par)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18) returning id`,
      [ref, p.code_article, Number(m[2]), 2000 + Number(m[3]), p.sexe, cl || (p.marquages || []).length ? 'specifique' : 'basique', cl ? cl.id : null, cl ? cl.name : '',
        p.illustration, JSON.stringify(p.taillant || []), ref + '.MDL', JSON.stringify(p.bom || []), JSON.stringify(p.gamme || []), JSON.stringify(p.marquages || []),
        `Dupliqué de ${p.reference} (fiche v${src.numero}).`, txt(req.body.designation ?? f.designation, 160), p.pieces_par_sachet || 1, req.utilisateur.id])).rows[0].id);
    await c.query(`insert into pf.historique (produit_id, version, action, donnees, utilisateur) values ($1, 1, 'cree', $2, $3)`, [np, { reference: ref, source: p.reference }, req.utilisateur.id]);
    await copierBomGamme(c, req.utilisateur, p.id, np);
    await require('./routes-codes-barres').creerCodesProduit(c, req.utilisateur, np);
    const nf = Number((await c.query(`insert into fiches.fiches (produit_id, reference, client_id, client_nom, source_fiche_id, designation, cree_par) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [np, ref, cl ? cl.id : null, cl ? cl.name : '', f.id, txt(req.body.designation ?? f.designation, 160), req.utilisateur.id])).rows[0].id);
    await nouvelleVersion(c, req, nf, { config: src.config_studio, vignette: src.vignette });
    await S.auditer(c, req, 'fiche_dupliquee', { entite: 'fiche', entiteId: ref, details: { source: f.reference, version_source: src.numero, client: cl ? cl.name : 'Basique' } });
    reply.code(201);
    return lireFiche(c, nf);
  }).catch(capte(reply)));

  // Verrou de modification (bail 30 min) : prise / libération depuis le studio
  app.post('/api/fiches/:id/verrou', { preHandler: exige('infographie.fiches', 'modifier'), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req, reply) => {
    const autre = await V.prendreVerrou(pool, 'fiche', req.params.id, req.utilisateur, S.contexte(req).poste);
    if (autre) return erreur(reply, 423, 'verrouille', `Modifiée par ${autre.par}${autre.poste ? ' (' + autre.poste + ')' : ''} : lecture seule.`, { verrou: autre });
    return { ok: true, bail_minutes: V.BAIL_MIN };
  });
  app.delete('/api/fiches/:id/verrou', { preHandler: S.exigerConnexion(), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req) => {
    await V.libererVerrou(pool, 'fiche', req.params.id, req.utilisateur.id);
    return { ok: true };
  });

  // ============================================================ PROPOSER AU COMMERCIAL
  // Une action, une transaction : version figée + PDF (identifiant caché, sans prix) + commande brouillon sans numéro ni prix.
  app.post('/api/fiches/versions/:vid/proposer', {
    preHandler: exige('infographie.fiches', 'valider'), bodyLimit: 30 * 1024 * 1024,
    schema: { params: { type: 'object', properties: { vid: { type: 'integer' } } }, body: { type: 'object', additionalProperties: false, properties: {
      client_id: { type: 'string', maxLength: 40 }, brouillon_id: { type: 'integer' }, nouvelle_commande: { type: 'boolean' },
      pdf_base64: { type: 'string', maxLength: 40 * 1024 * 1024 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const v = (await c.query('select * from fiches.versions where id = $1 for update', [req.params.vid])).rows[0];
    if (!v) throw leve('introuvable', 'Version introuvable.', 404);
    if (v.statut !== 'brouillon') throw leve('deja_proposee', `La version ${v.numero} est déjà ${STATUTS[v.statut].toLowerCase()}.`, 409);
    const autre = await V.verrouAutre(c, 'fiche', v.fiche_id, req.utilisateur.id);
    if (autre) throw leve('verrouille', `Fiche en cours de modification par ${autre.par} : lecture seule.`, 423);
    const f = (await c.query('select * from fiches.fiches where id = $1 for update', [v.fiche_id])).rows[0];
    const p = (await c.query('select * from pf.produits where id = $1', [f.produit_id])).rows[0];
    // client de la commande : celui de la fiche, sinon (fiche Basique) celui choisi maintenant — jamais « Basique »
    const cl = f.client_id ? await clientDe(c, f.client_id) : await clientDe(c, req.body.client_id);
    if (!cl) throw leve('client_obligatoire', 'Une fiche Basique proposée au commercial doit indiquer le client de la commande (« Basique » n’est pas un client).');
    const qui = await nomUtilisateur(c, req.utilisateur.id);
    // PDF : celui du studio (s'il est fourni) complété du cartouche et de l'identifiant ; sinon PDF généré par le serveur
    const base = req.body.pdf_base64 ? Buffer.from(req.body.pdf_base64, 'base64') : null;
    if (base && base.slice(0, 5).toString() !== '%PDF-') throw leve('pdf_invalide', 'Le PDF transmis est invalide.');
    const ca = (await c.query('select libelle from pf.codes_article where code = $1', [p.code_article])).rows[0];
    const bytes = await PDF.pdfProposition(base, { fiche_id: Number(f.id), version: v.numero, reference: p.reference, designation: f.designation || p.designation || ca?.libelle || '',
      client: cl.name, sexe: p.sexe, taillant: p.taillant || [], propose_par: qui, date: jour(), vignette: v.vignette, marquages: (p.marquages || []).map(({ montant, ...m }) => m) });
    const pdf = await rangerPdf(c, req.utilisateur, bytes, `Fiche ${p.reference} v${v.numero}.pdf`, 'fiche_version', v.id);
    // commande brouillon : celle qui contient une version antérieure de la fiche, sinon celle choisie, sinon nouvelle
    let br = null;
    if (!req.body.nouvelle_commande) {
      br = (await c.query(`select * from fiches.brouillons where statut = 'a_completer' and client_id = $1 and lignes @> $2::jsonb order by id desc limit 1 for update`,
        [cl.id, JSON.stringify([{ fiche_id: Number(f.id) }])])).rows[0];
      if (!br && req.body.brouillon_id) {
        br = (await c.query(`select * from fiches.brouillons where id = $1 and statut = 'a_completer' for update`, [req.body.brouillon_id])).rows[0];
        if (!br) throw leve('brouillon_introuvable', 'Commande à compléter introuvable (déjà validée ?).', 404);
        if (br.client_id !== cl.id) throw leve('client_different', 'Cette commande à compléter est pour un autre client.');
      }
    }
    const ligne = { fiche_id: Number(f.id), fiche_version_id: Number(v.id), version: v.numero, produit_id: Number(p.id), reference: p.reference,
      designation: f.designation || p.designation || ca?.libelle || p.reference, taillant: p.taillant || [], detail: [] };
    let action;
    if (br) {
      const lignes = (br.lignes || []).slice();
      const i = lignes.findIndex((l) => l.fiche_id === Number(f.id));
      if (i >= 0) lignes[i] = { ...lignes[i], fiche_version_id: Number(v.id), version: v.numero }; else lignes.push(ligne);
      await c.query('update fiches.brouillons set lignes = $2, version = version + 1, maj_le = now() where id = $1', [br.id, JSON.stringify(lignes)]);
      action = 'commande_brouillon_mise_a_jour';
    } else {
      br = (await c.query(`insert into fiches.brouillons (client_id, client_nom, lignes, cree_par) values ($1,$2,$3,$4) returning *`, [cl.id, cl.name, JSON.stringify([ligne]), req.utilisateur.id])).rows[0];
      action = 'commande_brouillon_creee';
    }
    await c.query(`update fiches.versions set statut = 'proposee', pdf_id = $2, brouillon_id = $3, propose_le = now(), propose_par = $4 where id = $1`, [v.id, pdf.id, br.id, req.utilisateur.id]);
    await V.libererVerrou(c, 'fiche', v.fiche_id, req.utilisateur.id);
    await S.auditer(c, req, 'fiche_proposee', { entite: 'fiche', entiteId: p.reference, details: { version: v.numero, client: cl.name, brouillon: Number(br.id) } });
    await S.auditer(c, req, action, { entite: 'commande_brouillon', entiteId: String(br.id), details: { client: cl.name, fiche: p.reference, version: v.numero } });
    return { fiche: await lireFiche(c, f.id), brouillon_id: Number(br.id), pdf_id: Number(pdf.id) };
  }).catch(capte(reply)));

  // ============================================================ COMMANDES À COMPLÉTER (commercial)
  app.get('/api/commandes-a-completer', { preHandler: exige('commercial.commandes', 'lire') }, async (req) => {
    const r = await pool.query(`select b.*, coalesce(u.nom_complet, u.identifiant) cree_par_nom from fiches.brouillons b left join noyau.utilisateurs u on u.id = b.cree_par
      where b.statut = 'a_completer' order by b.cree_le desc limit 300`);
    return r.rows.map((b) => brouillonVu(req.droits, b));
  });
  app.get('/api/commandes-a-completer/:id', { preHandler: exige('commercial.commandes', 'lire'), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req, reply) => {
    const b = (await pool.query('select * from fiches.brouillons where id = $1', [req.params.id])).rows[0];
    if (!b) return erreur(reply, 404, 'introuvable', 'Commande à compléter introuvable.');
    // versions : la plus récente de chaque fiche (pour signaler une version obsolète)
    const ids = (b.lignes || []).map((l) => l.fiche_id);
    const dern = Object.fromEntries((await pool.query(`select f.id, f.version_courante from fiches.fiches f where f.id = any($1)`, [ids])).rows.map((x) => [Number(x.id), x.version_courante]));
    return { ...brouillonVu(req.droits, b), lignes: brouillonVu(req.droits, b).lignes.map((l) => ({ ...l, derniere_version: dern[l.fiche_id] })) };
  });

  // Compléter (quantités couleurs × tailles, prix, BC client, livraison) — commercial avec prix
  app.put('/api/commandes-a-completer/:id', {
    preHandler: exige('commercial.commandes', 'modifier'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', required: ['version', 'lignes'], additionalProperties: false, properties: {
      version: { type: 'integer' }, bc_client: { type: 'string', maxLength: 80 }, livraison: { type: 'string', format: 'date' }, note: { type: 'string', maxLength: 500 },
      lignes: { type: 'array', maxItems: 100, items: { type: 'object', required: ['fiche_version_id'], additionalProperties: false, properties: {
        fiche_version_id: { type: 'integer' }, pu: { type: 'number', minimum: 0, maximum: 1e7 }, remise: { type: 'number', minimum: 0, maximum: 100 }, staff: { type: 'string', maxLength: 60 },
        detail: { type: 'array', maxItems: 400, items: { type: 'object', required: ['qte'], additionalProperties: false, properties: {
          couleur: { type: 'string', maxLength: 60 }, taille: { type: 'string', maxLength: 30 }, qte: { type: 'number', minimum: 0, maximum: 1e6 } } } } } } } } } },
  }, async (req, reply) => transaction(async (c) => {
    if (!D.voit(req.droits, 'prix')) throw leve('interdit', 'Compléter une commande (prix) demande de voir les prix.', 403);
    const b = (await c.query('select * from fiches.brouillons where id = $1 for update', [req.params.id])).rows[0];
    if (!b) throw leve('introuvable', 'Commande à compléter introuvable.', 404);
    if (b.statut !== 'a_completer') throw leve('deja_validee', 'Cette commande est déjà validée.', 409);
    if (b.version !== req.body.version) throw leve('conflit_version', 'Commande modifiée entre-temps sur un autre poste. Rechargez.', 409);
    const parV = new Map(req.body.lignes.map((l) => [l.fiche_version_id, l]));
    const lignes = (b.lignes || []).map((l) => {
      const n = parV.get(l.fiche_version_id); if (!n) return l;
      const taillant = (l.taillant || []).map(String);
      const detail = (n.detail || []).filter((x) => +x.qte > 0).map((x) => ({ couleur: txt(x.couleur, 60), taille: txt(x.taille, 30), qte: r3(x.qte) }));
      for (const x of detail) if (taillant.length && x.taille && !taillant.includes(x.taille)) throw leve('taille_inconnue', `Taille « ${x.taille} » absente du taillant de ${l.reference}.`);
      return { ...l, detail, pu: n.pu !== undefined ? r3(n.pu) : l.pu, remise: n.remise ?? l.remise ?? 0, staff: n.staff !== undefined ? txt(n.staff, 60) : l.staff };
    });
    await c.query(`update fiches.brouillons set lignes = $2, bc_client = coalesce($3, bc_client), livraison = coalesce($4::date, livraison), note = coalesce($5, note),
      version = version + 1, maj_le = now() where id = $1`, [b.id, JSON.stringify(lignes), req.body.bc_client ?? null, req.body.livraison || null, req.body.note ?? null]);
    return brouillonVu(req.droits, (await c.query('select * from fiches.brouillons where id = $1', [b.id])).rows[0]);
  }).catch(capte(reply)));

  // Valider : numéro CMD attribué MAINTENANT (transaction), versions validées et tamponnées, OF lancés (option)
  app.post('/api/commandes-a-completer/:id/valider', {
    preHandler: exige('commercial.commandes', 'valider'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', required: ['version'], additionalProperties: false, properties: {
      version: { type: 'integer' }, lancer_of: { type: 'boolean' }, confirmer_perte: { type: 'boolean' }, date: { type: 'string', format: 'date' } } } },
  }, async (req, reply) => transaction(async (c) => {
    if (!D.voit(req.droits, 'prix')) throw leve('interdit', 'Valider une commande demande de voir les prix.', 403);
    const b = (await c.query('select * from fiches.brouillons where id = $1 for update', [req.params.id])).rows[0];
    if (!b) throw leve('introuvable', 'Commande à compléter introuvable.', 404);
    if (b.statut !== 'a_completer') throw leve('deja_validee', 'Cette commande est déjà validée.', 409);
    if (b.version !== req.body.version) throw leve('conflit_version', 'Commande modifiée entre-temps sur un autre poste. Rechargez.', 409);
    const cl = await clientDe(c, b.client_id);
    if (!cl) throw leve('client_obligatoire', 'Une commande a toujours un vrai client.');
    const L = b.lignes || [];
    if (!L.length) throw leve('vide', 'Cette commande n’a aucune fiche.');
    for (const l of L) {
      const q = (l.detail || []).reduce((s, x) => s + (+x.qte || 0), 0);
      if (!(q > 0)) throw leve('quantites_manquantes', `${l.reference} : saisissez les quantités (couleurs × tailles).`);
      if (!(+l.pu > 0)) throw leve('prix_manquant', `${l.reference} : saisissez le prix.`);
      const dv = (await c.query('select version_courante from fiches.fiches where id = $1', [l.fiche_id])).rows[0];
      const fv = (await c.query('select statut, numero from fiches.versions where id = $1', [l.fiche_version_id])).rows[0];
      if (dv.version_courante !== fv.numero) throw leve('version_obsolete', `${l.reference} : une version plus récente existe (v${dv.version_courante}). Faites-la proposer, ou mettez la commande à jour.`, 409);
      if (fv.statut !== 'proposee') throw leve('version_non_proposee', `${l.reference} v${fv.numero} n’est pas proposée.`, 409);
    }
    // vente à perte (même contrôle que les autres commandes : prix HT < PRI → confirmation tracée)
    const enPerte = await V.lignesEnPerte(c, L.map((l) => ({ produit: l.reference, pu: l.pu, remise: l.remise })), { ttc: false, devise: 'DT' });
    if (enPerte.length && !req.body.confirmer_perte) throw leve('vente_a_perte', `Attention : vente à perte sur ${[...new Set(enPerte.map((p) => p.ref))].join(', ')}. Cochez la confirmation pour valider.`, 409);
    if (enPerte.length) await S.auditer(c, req, 'vente_a_perte_confirmee', { entite: 'commande', entiteId: String(b.id), details: { lignes: enPerte } });
    const date = req.body.date || jour();
    const numero = (await c.query("select parametres.attribuer_numero('commande', $1::date) n", [date])).rows[0].n;
    const export_ = cl.type_client === 'export';
    // commandes : prix stockés TTC en local (format Studio, 0.10.1) ; saisie ici en HT
    const tva = export_ ? 0 : Number((await c.query("select coalesce(parametres.taux_a('tva_normale', $1::date), 19) v", [date])).rows[0].v);
    const fod = export_ ? 0 : Number((await c.query("select coalesce(parametres.taux_a('fodec', $1::date), 0) v", [date])).rows[0].v);
    const k = (1 + tva / 100) * (1 + fod / 100);
    const lines = L.flatMap((l) => (l.detail || []).filter((x) => +x.qte > 0).map((x) => ({ id: rid(), src: 'infographie', article: l.reference, designation: l.designation,
      staff: l.staff || '', color: x.couleur, size: x.taille, qty: +x.qte, pu: r3((+l.pu) * (1 - (+l.remise || 0) / 100) * (export_ ? 1 : k)), fiche_version_id: l.fiche_version_id })));
    const now = new Date().toISOString();
    const order = { id: rid(), number: numero, clientPO: b.bc_client || '', client: { id: cl.id, name: cl.name || '', contact: cl.contact || '', address: cl.address || '', city: cl.city || '', phone: cl.phone || '', email: cl.email || '', mf: cl.mf || '' },
      date, delivery: b.livraison ? new Date(b.livraison).toISOString().slice(0, 10) : '', lines, advances: [], products: [], status: 'en_cours',
      total: r3(lines.reduce((s, l) => s + l.qty * l.pu, 0)), createdAt: now, updatedAt: now, origine: { type: 'infographie', id: Number(b.id) },
      ...(export_ ? { currency: ['EUR', 'USD'].includes(cl.devise) ? cl.devise : 'EUR', export: true, pricesTTC: false } : {}) };
    await c.query(`insert into commercial.documents (collection, id, donnees, maj_par) values ('orders', $1, $2, $3)`, [order.id, order, req.utilisateur.id]);
    // versions validées : nom + date figés, PDF tamponné « Validée par X le JJ/MM/AAAA »
    const qui = await nomUtilisateur(c, req.utilisateur.id);
    for (const l of L) {
      const v = (await c.query('select * from fiches.versions where id = $1 for update', [l.fiche_version_id])).rows[0];
      const src = (await c.query('select chemin from commercial.fichiers where id = $1', [v.pdf_id])).rows[0];
      const tampon = await PDF.tamponValidation(require('./routes-fichiers').lireOctets(src.chemin), { par: qui, date, commande: numero });
      const pv = await rangerPdf(c, req.utilisateur, tampon, `Fiche ${l.reference} v${v.numero} validée.pdf`, 'fiche_version', v.id);
      await c.query(`update fiches.versions set statut = 'archivee' where fiche_id = $1 and statut in ('validee', 'en_production') and id <> $2`, [v.fiche_id, v.id]);
      await c.query(`update fiches.versions set statut = 'validee', valide_le = now(), valide_par = $2, valide_par_nom = $3, pdf_valide_id = $4, commande_id = $5, commande_numero = $6
        where id = $1`, [v.id, req.utilisateur.id, qui, pv.id, order.id, numero]);
      // le PDF validé est aussi la fiche technique de la commande (double-clic dans la Gestion, partout dans l'ERP)
      await rangerPdf(c, req.utilisateur, tampon, `fiches-techniques-${numero}-${l.reference}.pdf`, 'commande', order.id);
      await S.auditer(c, req, 'fiche_validee', { entite: 'fiche', entiteId: l.reference, details: { version: v.numero, par: qui, commande: numero } });
    }
    await c.query(`update fiches.brouillons set statut = 'validee', commande_id = $2, commande_numero = $3, valide_le = now(), valide_par = $4, version = version + 1 where id = $1`,
      [b.id, order.id, numero, req.utilisateur.id]);
    await S.auditer(c, req, 'commande_validee', { entite: 'commande', entiteId: order.id, apres: { numero, client: cl.name, lignes: lines.length }, details: { origine: 'infographie', brouillon: Number(b.id) } });
    let lancement = null;
    if (req.body.lancer_of !== false) lancement = await require('./routes-etiquettes').lancerOFCommande(c, req, order.id, { date_livraison: order.delivery || null });
    reply.code(201);
    return { commande: { id: order.id, numero }, lancement };
  }).catch(capte(reply)));

  app.post('/api/commandes-a-completer/:id/abandonner', {
    preHandler: exige('commercial.commandes', 'annuler'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', required: ['version', 'motif'], additionalProperties: false, properties: { version: { type: 'integer' }, motif: { type: 'string', minLength: 3, maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const b = (await c.query('select * from fiches.brouillons where id = $1 for update', [req.params.id])).rows[0];
    if (!b || b.statut !== 'a_completer') throw leve('introuvable', 'Commande à compléter introuvable (déjà validée ?).', 404);
    if (b.version !== req.body.version) throw leve('conflit_version', 'Commande modifiée entre-temps. Rechargez.', 409);
    await c.query(`update fiches.brouillons set statut = 'abandonnee', note = left(note || ' — abandonnée : ' || $2, 500), version = version + 1 where id = $1`, [b.id, req.body.motif]);
    await S.auditer(c, req, 'commande_brouillon_abandonnee', { entite: 'commande_brouillon', entiteId: String(b.id), details: { motif: req.body.motif } });
    return { ok: true };
  }).catch(capte(reply)));

  // Dupliquer une ancienne commande → nouvelle commande à compléter (l'ancienne ne change jamais)
  app.post('/api/commandes/:id/dupliquer', {
    preHandler: exige('commercial.commandes', 'creer'),
    schema: { params: { type: 'object', properties: { id: { type: 'string', maxLength: 60 } } }, body: { type: 'object', additionalProperties: false, properties: { client_id: { type: 'string', maxLength: 40 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const o = (await c.query(`select donnees from commercial.documents where collection = 'orders' and id = $1`, [req.params.id])).rows[0]?.donnees;
    if (!o) throw leve('introuvable', 'Commande introuvable.', 404);
    const cl = await clientDe(c, req.body.client_id || o.client?.id);
    if (!cl) throw leve('client_obligatoire', 'Choisissez le client de la nouvelle commande.');
    // regroupe les lignes produit fini par référence ; dernière version VALIDÉE de chaque fiche
    const parRef = new Map();
    for (const l of o.lines || []) {
      if (!V.REF_PF.test(String(l.article || ''))) continue;
      const g = parRef.get(l.article) || { reference: l.article, designation: l.designation, detail: [], pu: null, staff: l.staff || '' };
      g.detail.push({ couleur: l.color || '', taille: l.size || '', qte: +l.qty || 0 }); parRef.set(l.article, g);
    }
    if (!parRef.size) throw leve('rien_a_dupliquer', 'Cette commande n’a pas de ligne produit fini (référence) à dupliquer.');
    const lignes = [];
    for (const g of parRef.values()) {
      const f = (await c.query(`select f.id, f.produit_id, p.taillant, p.prix_ht from fiches.fiches f join pf.produits p on p.id = f.produit_id where f.reference = $1`, [g.reference])).rows[0];
      if (!f) continue;
      const v = (await c.query(`select id, numero from fiches.versions where fiche_id = $1 and statut in ('validee', 'en_production', 'proposee') order by numero desc limit 1`, [f.id])).rows[0];
      if (!v) continue;
      lignes.push({ fiche_id: Number(f.id), fiche_version_id: Number(v.id), version: v.numero, produit_id: Number(f.produit_id), reference: g.reference, designation: g.designation,
        taillant: f.taillant || [], detail: g.detail, pu: D.voit(req.droits, 'prix') ? r3(f.prix_ht) : undefined, staff: g.staff });
    }
    if (!lignes.length) throw leve('aucune_fiche', 'Aucune fiche technique enregistrée pour les produits de cette commande (commandes antérieures au lot 0.15.0).');
    const b = (await c.query(`insert into fiches.brouillons (client_id, client_nom, origine, source_commande_id, lignes, bc_client, cree_par) values ($1,$2,'duplication',$3,$4,'',$5) returning *`,
      [cl.id, cl.name, o.id, JSON.stringify(lignes), req.utilisateur.id])).rows[0];
    await S.auditer(c, req, 'commande_dupliquee', { entite: 'commande', entiteId: o.number || o.id, details: { brouillon: Number(b.id), client: cl.name } });
    reply.code(201);
    return brouillonVu(req.droits, b);
  }).catch(capte(reply)));

  // ============================================================ MODIFICATION APRÈS LANCEMENT DE L'OF
  // Nouvelle version proposée → le commercial « valide la modification pour la commande » → OF mis à jour + signal atelier
  app.post('/api/fiches/versions/:vid/valider-modification', {
    preHandler: exige('commercial.commandes', 'valider'),
    schema: { params: { type: 'object', properties: { vid: { type: 'integer' } } }, body: { type: 'object', required: ['commande_id'], additionalProperties: false, properties: { commande_id: { type: 'string', maxLength: 60 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const v = (await c.query('select * from fiches.versions where id = $1 for update', [req.params.vid])).rows[0];
    if (!v) throw leve('introuvable', 'Version introuvable.', 404);
    if (v.statut !== 'proposee') throw leve('version_non_proposee', 'Seule une version proposée par l’infographie se valide.', 409);
    const o = (await c.query(`select donnees from commercial.documents where collection = 'orders' and id = $1`, [req.body.commande_id])).rows[0]?.donnees;
    if (!o) throw leve('introuvable', 'Commande introuvable.', 404);
    const f = (await c.query('select * from fiches.fiches where id = $1', [v.fiche_id])).rows[0];
    if (!(o.lines || []).some((l) => l.article === f.reference)) throw leve('hors_commande', `La commande ${o.number} ne contient pas ${f.reference}.`);
    const qui = await nomUtilisateur(c, req.utilisateur.id);
    const date = jour();
    const src = (await c.query('select chemin from commercial.fichiers where id = $1', [v.pdf_id])).rows[0];
    const tampon = await PDF.tamponValidation(require('./routes-fichiers').lireOctets(src.chemin), { par: qui, date, commande: o.number });
    const pv = await rangerPdf(c, req.utilisateur, tampon, `Fiche ${f.reference} v${v.numero} validée.pdf`, 'fiche_version', v.id);
    await rangerPdf(c, req.utilisateur, tampon, `fiches-techniques-${o.number}-${f.reference}-v${v.numero}.pdf`, 'commande', o.id);
    await c.query(`update fiches.versions set statut = 'archivee' where fiche_id = $1 and statut in ('validee', 'en_production') and id <> $2`, [v.fiche_id, v.id]);
    const ofs = (await c.query(`update prod.of set fiche_version_id = $2, fiche_modifiee_le = now(), version = version + 1, maj_le = now()
      where commande_id = $1 and produit_id = $3 and statut <> 'annule' returning numero`, [o.id, v.id, f.produit_id])).rows.map((x) => x.numero);
    await c.query(`update fiches.versions set statut = $6, valide_le = now(), valide_par = $2, valide_par_nom = $3, pdf_valide_id = $4, commande_id = $5, commande_numero = $7 where id = $1`,
      [v.id, req.utilisateur.id, qui, pv.id, o.id, ofs.length ? 'en_production' : 'validee', o.number]);
    await S.auditer(c, req, 'fiche_modifiee_apres_of', { entite: 'fiche', entiteId: f.reference, details: { version: v.numero, commande: o.number, of: ofs, par: qui } });
    return { ok: true, of_mis_a_jour: ofs };
  }).catch(capte(reply)));
};
module.exports.lireFiche = lireFiche;
