'use strict';
// OF lancés depuis une commande validée + étiquettes de composition / d'emballage + traçabilité (lot 0.15.0, spec § 8–9).
//  * lancement bloqué par produit si BOM ou gamme active manquante (les autres lignes partent) ;
//  * étiquette de composition : une par pièce (+ réserve paramétrée), 40 × 120 mm pliée, FR + AR, fibres %, 5 symboles
//    ISO 3758, « Fabriqué en Tunisie », code-barres + numéro, n° OF, n° commande, date MM/AAAA (C6), QR → /t/CODE ;
//  * autocollant d'emballage : un par sachet (⌈qté ÷ pièces/sachet⌉), code-barres (sachet si > 1, C4), nom, référence,
//    taille, sexe en clair, nombre de pièces ;
//  * Excel « CMD-AAAA-NNNN.xlsx » (Composition, Emballage, Récapitulatif) ; régénérer = mêmes codes ;
//  * /api/tracabilite/:code (comptes connectés) : OF, rouleaux de la coupe, date de production, livraison — sans montant.
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');
const PR = require('./prod');
const E = require('./etiquetage');
const X = require('./xlsx');
const CB = require('./routes-codes-barres');
const { PDFDocument, rgb } = require('pdf-lib');
const PDFF = require('./pdf-fiches');

const erreur = (reply, code, err, message, extra) => reply.code(code).send({ erreur: err, message, ...extra });
const exige = (f, a) => S.exigerConnexion({ droit: [f, a] });
const leve = (code, message, statusCode = 400) => Object.assign(new Error(message), { statusCode, code });
const capte = (reply) => (e) => { if (e.statusCode && e.code) return erreur(reply, e.statusCode, e.code, e.message); throw e; };
const URL_BASE = process.env.ERP_URL_PUBLIQUE || 'https://app.vethypro.com';
const jour = () => new Date().toISOString().slice(0, 10);
const mmaaaa = (d) => { const x = d ? new Date(d) : new Date(); return String(x.getMonth() + 1).padStart(2, '0') + '/' + x.getFullYear(); };
const fr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

/** Lance les OF d'une commande : un OF par produit fini (couleurs × tailles), bloqué sans BOM ni gamme active. */
async function lancerOFCommande(c, req, commandeId, { date_livraison = null } = {}) {
  if (!D.peut(req.droits, 'production.of', 'creer') && !D.peut(req.droits, 'production.etiquettes', 'creer')) return { lances: [], bloques: [{ motif: 'Vos droits ne permettent pas de lancer des OF.' }] };
  const cmd = (await c.query(`select id, donnees from commercial.documents where collection = 'orders' and id = $1`, [commandeId])).rows[0];
  if (!cmd) throw leve('commande_introuvable', 'Commande introuvable.', 404);
  if (['annule', 'annulee'].includes(cmd.donnees.status)) throw leve('commande_annulee', 'Cette commande est annulée : elle ne lance pas d’OF.');
  const parRef = new Map();
  for (const l of cmd.donnees.lines || []) {
    if (!/^[A-Z]+[0-9]{3}[0-9]{2}[BEFHU]$/.test(String(l.article || ''))) continue;
    const g = parRef.get(l.article) || { tc: new Map(), fiche_version_id: l.fiche_version_id || null };
    const k = JSON.stringify([l.size || '', l.color || '']);
    g.tc.set(k, (g.tc.get(k) || 0) + (+l.qty || 0)); parRef.set(l.article, g);
  }
  const lances = [], bloques = [];
  for (const [ref, g] of parRef) {
    const p = (await c.query('select * from pf.produits where reference = $1 and annule = false', [ref])).rows[0];
    if (!p) { bloques.push({ reference: ref, motif: 'produit fini introuvable' }); continue; }
    const deja = (await c.query(`select numero from prod.of where commande_id = $1 and produit_id = $2 and statut <> 'annule' limit 1`, [cmd.id, p.id])).rows[0];
    if (deja) { bloques.push({ reference: ref, motif: `OF déjà lancé (${deja.numero})` }); continue; }
    const bom = await PR.bomActive(c, p.id), gamme = await PR.gammeActive(c, p.id);
    if (!bom || !gamme) {
      const motif = !bom && !gamme ? 'pas de nomenclature ni de gamme active' : !bom ? 'pas de nomenclature active' : 'pas de gamme active';
      bloques.push({ reference: ref, motif });
      await S.auditer(c, req, 'of_lancement_bloque', { entite: 'commande', entiteId: cmd.donnees.number, details: { produit: ref, motif } });
      continue;
    }
    const taillant = (p.taillant || []).map(String);
    const tc = [...g.tc].map(([k, q]) => { const [taille, couleur] = JSON.parse(k); return { taille, couleur, qte: q }; }).filter((x) => x.qte > 0);
    const hors = tc.find((x) => taillant.length && !taillant.includes(x.taille));
    if (hors) { bloques.push({ reference: ref, motif: `taille « ${hors.taille} » absente du taillant` }); continue; }
    const besoins = await PR.construireBesoins(c, { produit_id: p.id, tailles_couleurs: tc, bom_version_id: bom.id });
    const ca = (await c.query('select libelle from pf.codes_article where code = $1', [p.code_article])).rows[0];
    const num = (await c.query("select parametres.attribuer_numero('of', current_date) n")).rows[0].n;
    const fv = g.fiche_version_id || (await c.query(`select v.id from fiches.versions v join fiches.fiches f on f.id = v.fiche_id where f.produit_id = $1 and v.statut in ('validee', 'en_production') order by v.numero desc limit 1`, [p.id])).rows[0]?.id || null;
    const of = (await c.query(`insert into prod.of (numero, commande_id, commande_numero, client_id, client_nom, produit_id, tailles_couleurs, date_livraison,
        bom_version_id, gamme_version_id, besoins, fiche, produit_version, fiche_version_id, cree_par)
      values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [num, String(cmd.id), String(cmd.donnees.number || ''), String(cmd.donnees.client?.id || ''), String(cmd.donnees.client?.name || ''), p.id, JSON.stringify(tc),
        date_livraison || cmd.donnees.delivery || null, besoins.bom_version_id, gamme.id, JSON.stringify(besoins.lignes), JSON.stringify(PR.ficheSansPrix(p, ca?.libelle)), p.version, fv, req.utilisateur.id])).rows[0];
    await c.query(`insert into prod.of_parties (of_id, partie, etat) values ($1, 1, 'en_attente'), ($1, 2, $2), ($1, 3, 'en_attente')`, [of.id, (p.marquages || []).length ? 'en_attente' : 'sans_objet']);
    const reservations = await PR.reserverPourOF(c, req.utilisateur, num, besoins.lignes);
    if (fv) await c.query(`update fiches.versions set statut = 'en_production' where id = $1 and statut = 'validee'`, [fv]);
    await CB.creerCodesProduit(c, req.utilisateur, p.id, [...new Set(tc.map((x) => x.couleur).filter(Boolean))]);
    await S.auditer(c, req, 'of_cree', { entite: 'of', entiteId: num, details: { commande: cmd.donnees.number, produit: ref, pieces: tc.reduce((s, x) => s + x.qte, 0), reservations: reservations.length, origine: 'validation commande' } });
    lances.push({ id: Number(of.id), numero: num, reference: ref });
  }
  return { lances, bloques };
}

/** Données figées d'une étiquette de composition / d'emballage pour un OF. */
async function donneesOF(c, ofId) {
  const of = (await c.query(`select o.*, p.reference, p.designation, p.sexe, p.pieces_par_sachet, ca.libelle article from prod.of o join pf.produits p on p.id = o.produit_id
    left join pf.codes_article ca on ca.code = p.code_article where o.id = $1`, [ofId])).rows[0];
  if (!of) throw leve('of_introuvable', 'Ordre de fabrication introuvable.', 404);
  if (of.statut === 'annule') throw leve('of_annule', 'Cet OF est annulé.');
  const opt = Object.fromEntries((await c.query(`select code, valeur from parametres.options where code like 'etiq_%'`)).rows.map((x) => [x.code, x.valeur]));
  // tissu principal : 1re ligne de la BOM de l'OF dont l'article est de famille tissu
  const bom = await PR.bomActive(c, of.produit_id, of.bom_version_id);
  let tissu = null;
  for (const l of (bom && bom.lignes) || []) {
    if (!l.article_id) continue;
    const a = (await c.query(`select id, donnees from registres.fiches where id = $1`, [l.article_id])).rows[0];
    if (a && /tissu/i.test(String(a.donnees.famille || ''))) { tissu = a; break; }
  }
  return { of, opt, tissu };
}

/** Génère (ou complète) les étiquettes d'un OF ; idempotent : mêmes codes à la régénération. */
async function genererEtiquettes(c, req, ofId) {
  const { of, opt, tissu } = await donneesOF(c, ofId);
  if (!tissu) throw leve('tissu_absent', `${of.reference} : aucune matière de famille « Tissu » dans la nomenclature de l’OF ${of.numero}.`);
  const fibres = tissu.donnees.fibres, ent = tissu.donnees.entretien;
  if (!Array.isArray(fibres) || !fibres.length) throw leve('composition_manquante', `Composition manquante pour l’article MP ${tissu.donnees.code || tissu.donnees.designation} (fibres %).`);
  try { E.nettoyerFibres(fibres); E.nettoyerEntretien(ent); } catch (e) { throw leve(e.code || 'composition_manquante', `${tissu.donnees.code || tissu.donnees.designation} : ${e.message}`); }
  const dico = Object.fromEntries((await c.query('select code, fr, ar from parametres.fibres')).rows.map((x) => [x.code, x]));
  const t = E.texteFibres(fibres, dico);
  const reserve = Math.max(0, +opt.etiq_reserve || 0);
  const date = mmaaaa();
  const base = { of: of.numero, commande: of.commande_numero, reference: of.reference, designation: of.designation || of.article || of.reference,
    sexe: of.sexe, sexe_libelle: E.SEXES[of.sexe], sexe_ar: E.SEXES_AR[of.sexe], origine_fr: opt.etiq_origine_fr || 'Fabriqué en Tunisie', origine_ar: opt.etiq_origine_ar || 'صنع في تونس',
    client: opt.etiq_client === 'oui' ? of.client_nom : '', date };
  let crees = 0;
  const ins = async (type, x, rang, pieces, cb, contenu) => {
    for (let essai = 0; essai < 5; essai++) {
      const r = await c.query(`insert into prod.etiquettes (type, code, of_id, commande_id, produit_id, reference, taille, couleur, rang, pieces, code_barres, contenu)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (of_id, type, taille, couleur, rang) do nothing returning id`,
        [type, E.codeEtiquette(), of.id, of.commande_id, of.produit_id, of.reference, x.taille || '', x.couleur || '', rang, pieces, cb.code, contenu]).catch((e) => { if (e.code === '23505' && /code/.test(e.detail || '')) return null; throw e; });
      if (r === null) continue; // collision de code (improbable) : nouveau tirage
      if (r.rowCount) crees++;
      return;
    }
    throw new Error('Impossible d’attribuer un code d’étiquette unique.');
  };
  for (const x of of.tailles_couleurs || []) {
    const q = Math.ceil(+x.qte || 0);
    const cb = await CB.codePour(c, req.utilisateur, of.produit_id, x.taille, x.couleur, 1);
    const fibresD = E.nettoyerFibres(fibres).map((f) => ({ pct: f.pct, fr: (dico[f.fibre] && dico[f.fibre].fr) || f.fibre, ar: (dico[f.fibre] && dico[f.fibre].ar) || '' }));
    const contenu = { ...base, taille: x.taille || '', couleur: x.couleur || '', fibres: fibresD, fibres_fr: t.fr, fibres_ar: t.ar, entretien: ent, code_barres: cb.code, type_code: cb.type };
    for (let i = 1; i <= q + reserve; i++) await ins('composition', x, i, 1, cb, contenu);
    const n = Math.max(1, of.pieces_par_sachet || 1);
    const cbs = n > 1 ? await CB.codePour(c, req.utilisateur, of.produit_id, x.taille, x.couleur, n) : cb;
    const sachets = Math.ceil(q / n);
    for (let i = 1; i <= sachets; i++) {
      const pieces = i < sachets ? n : q - n * (sachets - 1);
      await ins('emballage', x, i, pieces, cbs, { ...base, taille: x.taille || '', couleur: x.couleur || '', pieces, code_barres: cbs.code, type_code: cbs.type });
    }
  }
  await S.auditer(c, req, 'etiquettes_generees', { entite: 'of', entiteId: of.numero, details: { nouvelles: crees } });
  return { of, crees };
}

const ligneEtiq = (e) => ({ ...e, id: Number(e.id), of_id: Number(e.of_id), produit_id: Number(e.produit_id), lien: `${URL_BASE}/t/${e.code}` });

// ------------------------------------------------------------------ PDF d'aperçu (planche A4 + traits de coupe)
async function pdfPlanche(etiquettes, format = 'planche') {
  const rouleau = format === 'rouleau'; // une étiquette par page, au format exact (pilote Windows de la TSC TTP-244 Pro)
  const doc = await PDFDocument.create();
  const P = await PDFF.polices(doc);
  const MM = PDFF.MM;
  const crayon = (page, ox, oy) => ({ // repère y vers le bas → pdf-lib (y vers le haut)
    ligne: (x1, y1, x2, y2) => page.drawLine({ start: { x: ox + x1, y: oy - y1 }, end: { x: ox + x2, y: oy - y2 }, thickness: 0.5 }),
    rect: (x, y, w, h) => page.drawRectangle({ x: ox + x, y: oy - y - h, width: w, height: h, borderWidth: 0.5, borderColor: rgb(0, 0, 0) }),
    cercle: (cx, cy, r) => page.drawCircle({ x: ox + cx, y: oy - cy, size: r, borderWidth: 0.5, borderColor: rgb(0, 0, 0) }),
    point: (cx, cy, r) => page.drawCircle({ x: ox + cx, y: oy - cy, size: r, color: rgb(0, 0, 0) }),
    texte: (t, x, y, s) => page.drawText(String(t), { x: ox + x, y: oy - y, size: s, font: P.g }),
    poly: (pts) => { for (let i = 1; i < pts.length; i++) page.drawLine({ start: { x: ox + pts[i - 1][0], y: oy - pts[i - 1][1] }, end: { x: ox + pts[i][0], y: oy - pts[i][1] }, thickness: 0.5 }); },
  });
  const barres = (page, type, code, x, y, w, h) => {
    const m = E.modulesCode(type, code), u = w / m.length;
    for (let i = 0; i < m.length; i++) if (m[i] === '1') page.drawRectangle({ x: x + i * u, y, width: u + 0.01, height: h, color: rgb(0, 0, 0) });
  };
  const comp = etiquettes.filter((e) => e.type === 'composition'), emb = etiquettes.filter((e) => e.type === 'emballage');
  // composition : 40 × 120 mm, 4 par ligne, 2 lignes par A4 (paysage du rouleau → aperçu uniquement)
  const parPage = rouleau ? 1 : 8;
  for (let i = 0; i < comp.length; i += parPage) {
    const page = rouleau ? doc.addPage([40 * MM, 120 * MM]) : doc.addPage([210 * MM, 297 * MM]);
    comp.slice(i, i + parPage).forEach((e, k) => {
      const ox = rouleau ? 0 : (10 + (k % 4) * 48) * MM, top = rouleau ? 120 * MM : 297 * MM - (12 + Math.floor(k / 4) * 136) * MM;
      const d = e.contenu, w = 40 * MM;
      if (!rouleau) page.drawRectangle({ x: ox, y: top - 120 * MM, width: w, height: 120 * MM, borderWidth: 0.3, borderColor: rgb(0.6, 0.6, 0.6), borderDashArray: [2, 2] });
      if (!rouleau) page.drawLine({ start: { x: ox, y: top - 60 * MM }, end: { x: ox + w, y: top - 60 * MM }, thickness: 0.3, dashArray: [1, 2], color: rgb(0.5, 0.5, 0.5) });
      // volet 1 : taille, composition FR/AR, symboles, origine
      let y = top - 9 * MM;
      page.drawText(d.taille || 'TU', { x: ox + 3 * MM, y, size: 18, font: P.g });
      y -= 7 * MM;
      for (const f of d.fibres) {
        page.drawText(`${String(f.pct).replace('.', ',')} % ${f.fr}`, { x: ox + 3 * MM, y, size: 6.5, font: P.r });
        if (f.ar) E.dessinerArabe(page, `${f.ar} ${String(f.pct).replace('.', ',')}%`, ox + w - 3 * MM, y, 6.5, P.r);
        y -= 3.2 * MM;
      }
      y -= 2 * MM;
      E.TRAITEMENTS.forEach((tr, j) => E.dessinerSymbole(crayon(page, ox + 2.5 * MM + j * 7 * MM, y + 0), d.entretien[tr], 0, 0, 6 * MM));
      y -= 10 * MM;
      for (const l of [d.origine_fr]) { page.drawText(l, { x: ox + 3 * MM, y, size: 6.5, font: P.g }); y -= 3 * MM; }
      E.dessinerArabe(page, d.origine_ar, ox + w - 3 * MM, y, 6.5, P.r);
      // volet 2 (tourné de 180° une fois plié : aperçu à plat ici) : code-barres vertical, OF, commande, date, QR
      const y2 = top - 62 * MM;
      barres(page, d.type_code, d.code_barres, ox + 3 * MM, y2 - 16 * MM, 34 * MM, 12 * MM);
      page.drawText(d.code_barres, { x: ox + 3 * MM, y: y2 - 19.5 * MM, size: 7, font: P.r });
      page.drawText(`OF ${d.of}`, { x: ox + 3 * MM, y: y2 - 24 * MM, size: 7, font: P.g });
      page.drawText(`Cde ${d.commande}`, { x: ox + 3 * MM, y: y2 - 27.5 * MM, size: 6.5, font: P.r });
      page.drawText(`${d.reference} · ${d.date}`, { x: ox + 3 * MM, y: y2 - 31 * MM, size: 6.5, font: P.r });
      PDFF.dessinerQR(page, `${URL_BASE}/t/${e.code}`, ox + 3 * MM, y2 - 55 * MM, 20 * MM);
      page.drawText(e.code, { x: ox + 24 * MM, y: y2 - 46 * MM, size: 6, font: P.r });
    });
  }
  // emballage : 60 × 40 mm, 3 × 6 par A4
  const parPageE = rouleau ? 1 : 18;
  for (let i = 0; i < emb.length; i += parPageE) {
    const page = rouleau ? doc.addPage([60 * MM, 40 * MM]) : doc.addPage([210 * MM, 297 * MM]);
    emb.slice(i, i + parPageE).forEach((e, k) => {
      const d = e.contenu, ox = rouleau ? 0 : (12 + (k % 3) * 64) * MM, top = rouleau ? 40 * MM : 297 * MM - (12 + Math.floor(k / 3) * 46) * MM;
      if (!rouleau) page.drawRectangle({ x: ox, y: top - 40 * MM, width: 60 * MM, height: 40 * MM, borderWidth: 0.3, borderColor: rgb(0.6, 0.6, 0.6), borderDashArray: [2, 2] });
      page.drawText(String(d.designation).slice(0, 34), { x: ox + 3 * MM, y: top - 6 * MM, size: 8, font: P.g });
      page.drawText(`${d.reference}   Taille ${d.taille || 'TU'}   ${d.sexe_libelle}`, { x: ox + 3 * MM, y: top - 10.5 * MM, size: 7, font: P.r });
      page.drawText(`${d.pieces} pièce${d.pieces > 1 ? 's' : ''} / sachet${d.couleur ? ' · ' + d.couleur : ''}`, { x: ox + 3 * MM, y: top - 14.5 * MM, size: 7, font: P.r });
      barres(page, d.type_code, d.code_barres, ox + 6 * MM, top - 32 * MM, 48 * MM, 15 * MM);
      page.drawText(d.code_barres, { x: ox + 20 * MM, y: top - 36 * MM, size: 7.5, font: P.r });
    });
  }
  if (!doc.getPageCount()) doc.addPage();
  doc.setTitle('Étiquettes'); doc.setProducer('ERP DIGITAL-TEX');
  return doc.save();
}

module.exports = async function routesEtiquettes(app) {
  // Lancer les OF d'une commande validée (aussi appelé à la validation commerciale)
  app.post('/api/prod/commandes/:id/lancer-of', {
    preHandler: exige('production.of', 'creer'),
    schema: { params: { type: 'object', properties: { id: { type: 'string', maxLength: 60 } } }, body: { type: 'object', additionalProperties: false, properties: { date_livraison: { type: 'string', format: 'date' } } } },
  }, async (req, reply) => transaction((c) => lancerOFCommande(c, req, req.params.id, req.body || {})).catch(capte(reply)));

  // Générer / compléter les étiquettes d'un OF (ou de tous les OF d'une commande)
  app.post('/api/prod/of/:id/etiquettes', { preHandler: exige('production.etiquettes', 'creer'), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } },
    async (req, reply) => transaction(async (c) => { const r = await genererEtiquettes(c, req, req.params.id); return { of: r.of.numero, nouvelles: r.crees }; }).catch(capte(reply)));
  app.post('/api/prod/commandes/:id/etiquettes', { preHandler: exige('production.etiquettes', 'creer'), schema: { params: { type: 'object', properties: { id: { type: 'string', maxLength: 60 } } } } },
    async (req, reply) => transaction(async (c) => {
      const ofs = (await c.query(`select id from prod.of where commande_id = $1 and statut <> 'annule' order by id`, [req.params.id])).rows;
      if (!ofs.length) throw leve('aucun_of', 'Aucun OF lancé pour cette commande.');
      const out = [];
      for (const o of ofs) { const r = await genererEtiquettes(c, req, o.id); out.push({ of: r.of.numero, nouvelles: r.crees }); }
      return { ofs: out };
    }).catch(capte(reply)));

  // Liste (file d'impression de DT Étiquettes) — sans aucun montant
  app.get('/api/etiquettes', { preHandler: exige('production.etiquettes', 'lire'), schema: { querystring: { type: 'object', additionalProperties: false, properties: {
    of_id: { type: 'integer' }, commande_id: { type: 'string', maxLength: 60 }, type: { type: 'string', enum: ['composition', 'emballage'] }, a_imprimer: { type: 'boolean' } } } } }, async (req) => {
    const q = req.query;
    const r = await pool.query(`select e.*, o.numero of_numero from prod.etiquettes e join prod.of o on o.id = e.of_id
      where ($1::bigint is null or e.of_id = $1) and ($2::text is null or e.commande_id = $2) and ($3::text is null or e.type = $3) and (not coalesce($4, false) or e.nb_impressions = 0)
      order by e.of_id, e.type, e.taille, e.couleur, e.rang limit 20000`, [q.of_id || null, q.commande_id || null, q.type || null, q.a_imprimer ?? null]);
    return r.rows.map(ligneEtiq);
  });
  // File : OF ayant des étiquettes (reste à imprimer)
  app.get('/api/etiquettes/file', { preHandler: exige('production.etiquettes', 'lire') }, async () =>
    (await pool.query(`select o.id::int of_id, o.numero, o.commande_numero, o.client_nom, p.reference, o.statut, o.date_livraison,
        count(*) filter (where e.type = 'composition')::int composition, count(*) filter (where e.type = 'emballage')::int emballage,
        count(*) filter (where e.nb_impressions = 0)::int a_imprimer
      from prod.of o join pf.produits p on p.id = o.produit_id left join prod.etiquettes e on e.of_id = o.id
      where o.statut <> 'annule' group by o.id, p.reference order by o.id desc limit 300`)).rows);

  // Impression enregistrée (DT Étiquettes) ; réimpression = motif obligatoire
  app.post('/api/etiquettes/imprimees', {
    preHandler: exige('production.etiquettes', 'valider'),
    schema: { body: { type: 'object', required: ['ids'], additionalProperties: false, properties: { ids: { type: 'array', minItems: 1, maxItems: 5000, items: { type: 'integer' } }, motif: { type: 'string', maxLength: 300 }, poste_imprimante: { type: 'string', maxLength: 120 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const deja = (await c.query('select count(*)::int n from prod.etiquettes where id = any($1) and nb_impressions > 0', [req.body.ids])).rows[0].n;
    const motif = String(req.body.motif || '').trim();
    if (deja && motif.length < 3) throw leve('motif_obligatoire', `${deja} étiquette(s) déjà imprimée(s) : indiquez le motif de la réimpression.`);
    const r = await c.query(`update prod.etiquettes set nb_impressions = nb_impressions + 1, imprimee_le = now(), imprimee_par = $2 where id = any($1) returning id`, [req.body.ids, req.utilisateur.id]);
    await S.auditer(c, req, deja ? 'etiquette_reimprimee' : 'etiquette_imprimee', { entite: 'etiquettes', entiteId: String(req.body.ids[0]), details: { nombre: r.rowCount, deja_imprimees: deja || undefined, motif: motif || undefined, imprimante: req.body.poste_imprimante || undefined } });
    return { ok: true, nombre: r.rowCount };
  }).catch(capte(reply)));

  // Aperçu PDF (planche A4) d'un OF ou d'une commande
  app.get('/api/etiquettes/pdf', { preHandler: exige('production.etiquettes', 'lire'), schema: { querystring: { type: 'object', additionalProperties: false, properties: {
    of_id: { type: 'integer' }, commande_id: { type: 'string', maxLength: 60 }, type: { type: 'string', enum: ['composition', 'emballage'] },
    format: { type: 'string', enum: ['planche', 'rouleau'] }, a_imprimer: { type: 'boolean' } } } } }, async (req, reply) => {
    const q = req.query;
    if (!q.of_id && !q.commande_id) return erreur(reply, 400, 'cible', 'Indiquez un OF ou une commande.');
    let r = (await pool.query(`select * from prod.etiquettes where ($1::bigint is null or of_id = $1) and ($2::text is null or commande_id = $2) and ($3::text is null or type = $3)
        and (not coalesce($4, false) or nb_impressions = 0)
      order by of_id, type, taille, couleur, rang limit 4000`, [q.of_id || null, q.commande_id || null, q.type || null, q.a_imprimer ?? null])).rows;
    if (!r.length) return erreur(reply, 404, 'aucune', 'Aucune étiquette générée : cliquez d’abord sur « Générer les étiquettes ».');
    if (q.format === 'rouleau' && r.length > 800) r.length = 800; // lots de 800 (liste des identifiants complète dans l'en-tête)
    const b = await pdfPlanche(r, q.format);
    return reply.type('application/pdf').header('X-Etiquettes-Ids', r.map((x) => x.id).join(',')).header('Content-Disposition', 'inline; filename="etiquettes.pdf"').send(Buffer.from(b));
  });

  // Excel « CMD-AAAA-NNNN.xlsx »
  app.get('/api/etiquettes/excel', { preHandler: exige('production.etiquettes', 'exporter'), schema: { querystring: { type: 'object', required: ['commande_id'], additionalProperties: false, properties: { commande_id: { type: 'string', maxLength: 60 } } } } }, async (req, reply) => {
    const r = (await pool.query(`select e.*, o.numero of_numero, to_char(o.date_livraison, 'YYYY-MM-DD') livraison, o.commande_numero, o.client_nom
      from prod.etiquettes e join prod.of o on o.id = e.of_id where e.commande_id = $1 order by e.of_id, e.type, e.taille, e.couleur, e.rang`, [req.query.commande_id])).rows;
    if (!r.length) return erreur(reply, 404, 'aucune', 'Aucune étiquette générée pour cette commande.');
    const num = r[0].commande_numero || req.query.commande_id;
    const sym = (en) => E.TRAITEMENTS.map((t) => E.SYMBOLES[t][en[t]] || '').join(' / ');
    const comp = [['Code', 'Lien QR', 'N° commande', 'N° OF', 'Référence', 'Désignation', 'Taille', 'Couleur', 'Rang', 'Code-barres', 'Composition (FR)', 'Composition (AR)', 'Entretien', 'Origine', 'Date', 'Livraison promise', 'Imprimée']];
    const emb = [['Code', 'N° commande', 'N° OF', 'Référence', 'Désignation', 'Taille', 'Couleur', 'Sexe', 'Pièces / sachet', 'Code-barres', 'Imprimée']];
    const rec = new Map();
    for (const e of r) {
      const d = e.contenu;
      if (e.type === 'composition') comp.push([e.code, `${URL_BASE}/t/${e.code}`, num, e.of_numero, e.reference, d.designation, e.taille, e.couleur, e.rang, e.code_barres, d.fibres_fr, d.fibres_ar, sym(d.entretien || {}), d.origine_fr, d.date, fr(e.livraison), e.nb_impressions ? 'oui' : 'non']);
      else emb.push([e.code, num, e.of_numero, e.reference, d.designation, e.taille, e.couleur, d.sexe_libelle, e.pieces, e.code_barres, e.nb_impressions ? 'oui' : 'non']);
      const k = [e.of_numero, e.reference, e.taille, e.couleur].join('|');
      const x = rec.get(k) || { c: 0, s: 0, p: 0 }; if (e.type === 'composition') x.c++; else { x.s++; x.p += e.pieces; } rec.set(k, x);
    }
    const recap = [['N° OF', 'Référence', 'Taille', 'Couleur', 'Étiquettes composition', 'Sachets', 'Pièces emballées'], ...[...rec].map(([k, x]) => [...k.split('|'), x.c, x.s, x.p])];
    const buf = X.classeur([{ nom: 'Composition', lignes: comp }, { nom: 'Emballage', lignes: emb }, { nom: 'Récapitulatif', lignes: recap }]);
    await S.auditer(pool, req, 'etiquettes_exportees', { entite: 'commande', entiteId: num, details: { lignes: r.length } });
    return reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition', `attachment; filename="${String(num).replace(/[^A-Za-z0-9-]/g, '_')}.xlsx"`).send(buf);
  });

  // Traçabilité (comptes connectés) : OF, rouleaux de la coupe, production, livraison — aucun montant
  app.get('/api/tracabilite/:code', { preHandler: S.exigerConnexion(), schema: { params: { type: 'object', properties: { code: { type: 'string', pattern: '^[A-Za-z2-7]{10}$' } } } } }, async (req, reply) => {
    if (!(D.peut(req.droits, 'production.of', 'lire') || D.peut(req.droits, 'commercial.commandes', 'lire') || D.peut(req.droits, 'production.etiquettes', 'lire')))
      return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de consulter la traçabilité.');
    const e = (await pool.query(`select e.*, o.numero of_numero, o.statut of_statut, o.commande_id, o.commande_numero, o.client_nom, to_char(o.date_livraison, 'YYYY-MM-DD') livraison_promise,
        o.fiche_version_id, p.designation, ca.libelle article from prod.etiquettes e join prod.of o on o.id = e.of_id join pf.produits p on p.id = e.produit_id
        left join pf.codes_article ca on ca.code = p.code_article where e.code = $1`, [req.params.code.toUpperCase()])).rows[0];
    if (!e) return erreur(reply, 404, 'introuvable', 'Code d’étiquette inconnu.');
    const parties = (await pool.query('select partie, etat from prod.of_parties where of_id = $1 order by partie', [e.of_id])).rows;
    // rouleaux : sorties MP de la coupe de cet OF (validations non annulées)
    const rouleaux = (await pool.query(`select distinct l.n_lot, l.bain, l.rouleau, f.donnees->>'designation' article, f.donnees->>'code' code
      from prod.of_validations v, jsonb_array_elements(v.sorties) s join stocks.lots_mp l on l.id = (s->>'lot_id')::bigint left join registres.fiches f on f.id = l.article_id
      where v.of_id = $1 and v.partie = 1 and not v.annule`, [e.of_id])).rows;
    const prod3 = (await pool.query(`select to_char(min(v.date), 'YYYY-MM-DD') premiere, to_char(max(v.date), 'YYYY-MM-DD') derniere
      from prod.of_validations v, jsonb_array_elements(v.qtes) q where v.of_id = $1 and v.partie = 3 and not v.annule and coalesce(q->>'taille', '') = $2 and coalesce(q->>'couleur', '') = $3`, [e.of_id, e.taille, e.couleur])).rows[0];
    const bls = (await pool.query(`select donnees->>'number' numero, donnees->>'date' date from commercial.documents where collection = 'bls' and donnees->>'orderId' = $1 and coalesce(donnees->>'status', '') <> 'annule'
      and exists (select 1 from commercial.documents o, jsonb_array_elements(o.donnees->'lines') ol, jsonb_array_elements(donnees->'lines') bl
        where o.collection = 'orders' and o.id = $1 and ol->>'id' = bl->>'lineId' and ol->>'article' = $2 and coalesce(ol->>'size', '') = $3 and coalesce(ol->>'color', '') = $4)
      order by donnees->>'date'`, [e.commande_id, e.reference, e.taille, e.couleur])).rows;
    const fv = e.fiche_version_id ? (await pool.query('select numero, pdf_valide_id, valide_par_nom, to_char(valide_le, \'YYYY-MM-DD\') valide_le from fiches.versions where id = $1', [e.fiche_version_id])).rows[0] : null;
    await S.auditer(pool, req, 'tracabilite_consultee', { entite: 'etiquette', entiteId: e.code });
    return { code: e.code, type: e.type, reference: e.reference, designation: e.designation || e.article, taille: e.taille, couleur: e.couleur, code_barres: e.code_barres,
      commande: e.commande_numero, client: e.client_nom, of: { numero: e.of_numero, statut: e.of_statut, parties },
      composition: e.contenu.fibres_fr || null, rouleaux, production: prod3 && prod3.derniere ? { du: prod3.premiere, au: prod3.derniere } : null,
      livraison: bls.length ? { bls } : { prevue: e.livraison_promise }, fiche: fv ? { version: fv.numero, pdf_id: fv.pdf_valide_id && Number(fv.pdf_valide_id), validee_par: fv.valide_par_nom, le: fv.valide_le } : null };
  });
};
module.exports.lancerOFCommande = lancerOFCommande;
module.exports.genererEtiquettes = genererEtiquettes;
module.exports.pdfPlanche = pdfPlanche;
