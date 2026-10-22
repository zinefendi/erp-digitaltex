'use strict';
// ERP 0.10.1 — fichiers rattachés aux documents commerciaux et banques émettrices tunisiennes.
//  * scan du moyen de paiement (chèque, traite, ordre de virement…) : visible seulement avec le droit « prix »
//    (un scan montre un montant) et le droit de lire les règlements ;
//  * fiche technique (PDF du Studio 3D, ou PDF / JPEG joint à la main) d'une commande ou d'un produit fini :
//    ouverte par double-clic sur une ligne, dans tout l'ERP.
// Contenu contrôlé par sa signature (PDF, JPEG, PNG, WebP), nom de fichier sur disque choisi par le serveur,
// jamais supprimé (annulé = masqué), chaque ajout / retrait tracé dans l'audit.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');

const DIR = process.env.ERP_FICHIERS_DIR || '/data/fichiers';
const MAX = 15 * 1024 * 1024;
const MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const erreur = (reply, code, err, message) => reply.code(code).send({ erreur: err, message });
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Type réel du contenu (signature), indépendant de ce que déclare le poste. */
function mimeDe(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// droits par nature de fichier
const peutLire = (eff, nature) => (nature === 'scan_paiement'
  ? D.voit(eff, 'prix') && (D.peut(eff, 'commercial.reglements', 'lire') || D.peut(eff, 'commercial.factures', 'lire') || D.peut(eff, 'compta_clients.lettrage', 'lire'))
  : D.peut(eff, 'commercial.commandes', 'lire') || D.peut(eff, 'commercial.produits_finis', 'lire') || D.peut(eff, 'commercial.bl', 'lire') || D.peut(eff, 'commercial.factures', 'lire'));
const peutEcrire = (eff, nature) => (nature === 'scan_paiement'
  ? D.voit(eff, 'prix') && (D.peut(eff, 'commercial.reglements', 'creer') || D.peut(eff, 'commercial.factures', 'modifier') || D.peut(eff, 'compta_clients.lettrage', 'creer'))
  : D.peut(eff, 'commercial.commandes', 'modifier') || D.peut(eff, 'commercial.commandes', 'creer') || D.peut(eff, 'commercial.produits_finis', 'modifier'));

const COLS = `id::int, nature, cible_type, cible_id, nom, mime, taille, to_char(cree_le, 'YYYY-MM-DD"T"HH24:MI:SS') cree_le,
  (select coalesce(u.nom_complet, u.identifiant) from noyau.utilisateurs u where u.id = f.cree_par) cree_par`;

module.exports = async function routesFichiers(app) {
  for (const m of [...MIMES, 'application/octet-stream']) app.addContentTypeParser(m, { parseAs: 'buffer', bodyLimit: MAX }, (req, body, done) => done(null, body));

  // ---------- banques émettrices (liste BCT, paramétrable en base) ----------
  app.get('/api/parametres/banques', { preHandler: S.exigerConnexion() }, async () =>
    (await pool.query('select code, nom, actif from parametres.banques order by ordre, nom')).rows);

  // ---------- envoi d'un fichier ----------
  // Corps = le fichier brut ; paramètres : nature, cible_type, cible_id (ou commande_slug pour les fiches PDF du Studio), nom.
  app.post('/api/fichiers', {
    preHandler: S.exigerConnexion(), bodyLimit: MAX,
    schema: { querystring: { type: 'object', additionalProperties: false, required: ['nature', 'cible_type'], properties: {
      nature: { type: 'string', enum: ['scan_paiement', 'fiche_technique'] }, cible_type: { type: 'string', enum: ['commande', 'produit', 'reglement'] },
      cible_id: { type: 'string', maxLength: 80 }, commande_slug: { type: 'string', maxLength: 120 }, nom: { type: 'string', maxLength: 160 } } } },
  }, async (req, reply) => {
    const q = req.query, b = req.body;
    if (!peutEcrire(req.droits, q.nature)) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de joindre ce fichier.');
    if ((q.nature === 'scan_paiement') !== (q.cible_type === 'reglement')) return erreur(reply, 400, 'cible_invalide', 'Un scan se rattache à un règlement ; une fiche technique à une commande ou à un produit fini.');
    const mime = mimeDe(b);
    if (!mime) return erreur(reply, 400, 'fichier_invalide', 'Fichier refusé : seuls les PDF, JPEG, PNG et WebP sont acceptés.');
    if (q.nature === 'fiche_technique' && !['application/pdf', 'image/jpeg', 'image/png'].includes(mime)) return erreur(reply, 400, 'fichier_invalide', 'Une fiche technique est un PDF ou une image JPEG / PNG.');
    let cible = String(q.cible_id || '').trim();
    if (q.cible_type === 'commande') {
      const L = (await pool.query(`select id, donnees->>'number' n from commercial.documents where collection = 'orders'`)).rows;
      if (q.commande_slug) { // PDF des fiches techniques du Studio : « fiches-techniques-<n° commande>-<client> »
        const s = slug(q.commande_slug).replace(/^(fiches-techniques|fichiers-atelier)-/, '');
        const ok = L.filter((o) => o.n && (s === slug(o.n) || s.startsWith(slug(o.n) + '-'))).sort((a, c) => c.n.length - a.n.length)[0];
        if (!ok) return erreur(reply, 404, 'commande_introuvable', 'Commande introuvable pour ces fiches techniques.');
        cible = ok.id;
      } else if (!L.some((o) => o.id === cible)) return erreur(reply, 404, 'commande_introuvable', 'Commande introuvable.');
    } else if (q.cible_type === 'produit') {
      cible = cible.toUpperCase();
      if (!(await pool.query('select 1 from pf.produits where reference = $1', [cible])).rowCount) return erreur(reply, 404, 'produit_introuvable', 'Produit fini introuvable.');
    }
    const nom = String(q.nom || `${q.nature === 'scan_paiement' ? 'scan' : 'fiche-technique'}.${EXT[mime]}`).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 160);
    const emp = crypto.createHash('sha256').update(b).digest('hex');
    const sous = new Date().toISOString().slice(0, 7);
    const fichier = `${sous}/${q.nature}-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.${EXT[mime]}`;
    fs.mkdirSync(path.join(DIR, sous), { recursive: true });
    fs.writeFileSync(path.join(DIR, fichier), b, { flag: 'wx' });
    return transaction(async (c) => {
      const r = (await c.query(`insert into commercial.fichiers (nature, cible_type, cible_id, nom, mime, taille, empreinte, chemin, cree_par)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`, [q.nature, q.cible_type, cible, nom, mime, b.length, emp, fichier, req.utilisateur.id])).rows[0];
      await S.auditer(c, req, 'fichier_ajoute', { entite: q.nature, entiteId: String(r.id), details: { cible: q.cible_type, cible_id: cible, nom, taille: b.length, empreinte: emp } });
      reply.code(201);
      return (await c.query(`select ${COLS} from commercial.fichiers f where id = $1`, [r.id])).rows[0];
    });
  });

  // ---------- liste des fichiers d'une cible ----------
  app.get('/api/fichiers', {
    preHandler: S.exigerConnexion(),
    schema: { querystring: { type: 'object', additionalProperties: false, required: ['cible_type'], properties: {
      cible_type: { type: 'string', enum: ['commande', 'produit', 'reglement'] }, cible_id: { type: 'string', maxLength: 80 }, nature: { type: 'string', enum: ['scan_paiement', 'fiche_technique'] } } } },
  }, async (req) => {
    const q = req.query;
    const r = await pool.query(`select ${COLS} from commercial.fichiers f where not annule and cible_type = $1 and ($2::text is null or cible_id = $2) and ($3::text is null or nature = $3)
      order by cree_le desc, id desc limit 500`, [q.cible_type, q.cible_id ? (q.cible_type === 'produit' ? q.cible_id.toUpperCase() : q.cible_id) : null, q.nature || null]);
    return r.rows.filter((f) => peutLire(req.droits, f.nature));
  });

  // ---------- fiche technique d'une ligne : produit fini (référence) puis commande ----------
  app.get('/api/fichiers/fiche', {
    preHandler: S.exigerConnexion(),
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { reference: { type: 'string', maxLength: 40 }, commande: { type: 'string', maxLength: 80 } } } },
  }, async (req, reply) => {
    if (!peutLire(req.droits, 'fiche_technique')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de consulter les fiches techniques.');
    const { reference, commande } = req.query;
    const cherche = async (t, id) => (await pool.query(`select ${COLS} from commercial.fichiers f where not annule and nature = 'fiche_technique' and cible_type = $1 and cible_id = $2 order by cree_le desc, id desc limit 1`, [t, id])).rows[0];
    let f = null;
    if (reference) f = await cherche('produit', String(reference).toUpperCase());
    if (!f && commande) f = await cherche('commande', String(commande));
    if (f) return { fichier: f };
    // à défaut : illustration du produit fini (image enregistrée sur sa fiche)
    if (reference) {
      const p = (await pool.query(`select illustration from pf.produits where reference = $1 and coalesce(illustration, '') <> ''`, [String(reference).toUpperCase()])).rows[0];
      if (p && /^data:image\/(png|jpe?g|webp);base64,/.test(p.illustration)) return { illustration: p.illustration };
    }
    return erreur(reply, 404, 'fiche_absente', 'Aucune fiche technique pour cette ligne. Générez le PDF des fiches dans le Studio 3D, ou joignez un PDF / JPEG à la commande ou au produit fini.');
  });

  // ---------- lecture d'un fichier (ouvert dans un onglet) ----------
  app.get('/api/fichiers/:id', { preHandler: S.exigerConnexion(), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req, reply) => {
    const f = (await pool.query('select id, nature, nom, mime, chemin from commercial.fichiers where id = $1 and not annule', [req.params.id])).rows[0];
    if (!f) return erreur(reply, 404, 'introuvable', 'Fichier introuvable.');
    if (!peutLire(req.droits, f.nature)) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas d’ouvrir ce fichier.');
    const p = path.join(DIR, path.normalize(f.chemin).replace(/^(\.\.[/\\])+/, ''));
    if (!p.startsWith(path.resolve(DIR) + path.sep) || !fs.existsSync(p)) return erreur(reply, 404, 'introuvable', 'Fichier absent du serveur.');
    reply.header('Cache-Control', 'private, max-age=3600').header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.nom)}`).type(f.mime);
    return reply.send(fs.createReadStream(p));
  });

  // ---------- recherche des moyens de paiement (avances des commandes + règlements des factures) ----------
  // Tous les filtres (client, mode, banque, n°, dates, montants, scan) sont appliqués à l'écran sur cette liste.
  app.get('/api/reglements/recherche', { preHandler: S.exigerConnexion() }, async (req, reply) => {
    const eff = req.droits;
    if (!D.voit(eff, 'prix') || !(D.peut(eff, 'commercial.reglements', 'lire') || D.peut(eff, 'commercial.factures', 'lire'))) return erreur(reply, 403, 'interdit', 'Cet écran contient des montants : il demande le droit de voir les prix et de lire les règlements.');
    const docs = (await pool.query(`select collection, donnees from commercial.documents where collection in ('orders', 'invoices')`)).rows;
    const banques = Object.fromEntries((await pool.query('select code, nom from parametres.banques')).rows.map((b) => [b.code, b.nom]));
    const enc = Object.fromEntries((await pool.query(`select id::int, banque, to_char(echeance, 'YYYY-MM-DD') echeance, statut from compta.encaissements`)).rows.map((e) => [e.id, e]));
    const scans = new Map((await pool.query(`select id::int, nom, mime from commercial.fichiers where nature = 'scan_paiement' and not annule`)).rows.map((f) => [f.id, f]));
    const out = [];
    const pousser = (p, base) => {
      const e = p.enc ? enc[p.enc] : null;
      const bq = p.bank || (e && e.banque) || '';
      const sc = p.scan && scans.get(Number(p.scan));
      out.push({ ...base, id: p.id || '', date: p.date || '', montant: +p.amount || 0, mode: p.mode || '', numero_doc: p.ref || '', banque: bq, banque_nom: banques[bq] || bq,
        echeance: p.due || (e && e.echeance) || '', statut_enc: e ? e.statut : '', origine: p.enc ? 'compta' : p.avoir ? 'avoir' : 'gestion', scan: sc ? { id: sc.id, nom: sc.nom, mime: sc.mime } : null });
    };
    for (const { collection, donnees: d } of docs) {
      if (collection === 'orders' && d.status !== 'annulee') for (const a of d.advances || []) pousser(a, { type: 'avance', doc_id: d.id, doc_numero: d.number, client_id: d.client?.id || '', client: d.client?.name || '', devise: ['EUR', 'USD'].includes(d.currency) ? d.currency : 'DT', recu: a.receipt || '' });
      if (collection === 'invoices' && d.status !== 'annulee') for (const p of d.payments || []) { if (p.avoir || p.ras) continue; pousser(p, { type: 'reglement', doc_id: d.id, doc_numero: d.number, client_id: d.client?.id || '', client: d.client?.name || '', devise: ['EUR', 'USD'].includes(d.currency) ? d.currency : 'DT' }); }
    }
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  });

  // ---------- retrait (jamais d'effacement : le fichier est masqué, l'audit garde la trace) ----------
  app.post('/api/fichiers/:id/annuler', {
    preHandler: S.exigerConnexion(),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', additionalProperties: false, properties: { motif: { type: 'string', maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const f = (await c.query('select id, nature, cible_type, cible_id, nom from commercial.fichiers where id = $1 and not annule for update', [req.params.id])).rows[0];
    if (!f) return erreur(reply, 404, 'introuvable', 'Fichier introuvable.');
    if (!peutEcrire(req.droits, f.nature)) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de retirer ce fichier.');
    await c.query('update commercial.fichiers set annule = true where id = $1', [f.id]);
    await S.auditer(c, req, 'fichier_retire', { entite: f.nature, entiteId: String(f.id), details: { cible: f.cible_type, cible_id: f.cible_id, nom: f.nom, motif: req.body?.motif || '' } });
    return { ok: true };
  }));
};
module.exports.mimeDe = mimeDe;
