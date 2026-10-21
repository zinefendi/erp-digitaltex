'use strict';
// Module 1 (catalogue + modèles 3D du studio), module 2 (gestion commerciale 3.3.0 en réseau),
// registres simples (fournisseurs, articles matières), suivi des sauvegardes.
// Règle CDC § 5.2 : un montant non autorisé n'est jamais envoyé → D.masquer() sur chaque réponse.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');
const P = require('./prix-studio');

const GLB_DIR = process.env.ERP_GLB_DIR || '/data/glb';
const FACTORY = process.env.ERP_CATALOGUE_USINE || '/data/catalogue-usine.json';
const SAUVEGARDES = process.env.ERP_SAUVEGARDES || '/data/sauvegardes';
const erreur = (reply, code, err, message) => reply.code(code).send({ erreur: err, message });
const exige = (f, a) => S.exigerConnexion({ droit: [f, a] });

// ------------------------------------------------------------------ catalogue
// Champs de prix du catalogue (tarifs du studio) retirés sans le droit « prix ».
function catalogueMasque(eff, c) {
  if (!c || D.voit(eff, 'prix')) return c;
  const x = structuredClone(c);
  if (x.shop) {
    for (const k of ['printPrice', 'embSetup', 'embPiece', 'surcharge', 'money']) delete x.shop[k];
    for (const a of Object.values(x.shop.articles || {})) { delete a.price; delete a.sp; }
  }
  delete x.passPrice; delete x.gestion?.tva; delete x.gestion?.timbre;
  return x;
}

async function lireCatalogue(db) {
  const r = (await db.query('select donnees, version, maj_le from infographie.catalogue where id = 1')).rows[0];
  if (r) return r;
  // première lecture : catalogue repris de l'application 3.3.0, sinon catalogue d'usine
  let c = null;
  const rep = process.env.ERP_CATALOGUE_REPRISE || '/data/reprise/catalogue.json';
  for (const f of [rep, FACTORY]) { try { c = JSON.parse(fs.readFileSync(f, 'utf8')); break; } catch (_) { /* suivant */ } }
  if (!c) return null;
  // les modèles ajoutés par l'utilisateur (« user-models/x.glb ») sont servis par le serveur
  for (const m of Object.values(c.models || {})) if (m && typeof m.url === 'string' && m.url.startsWith('user-models/')) m.url = '/api/infographie/modeles/' + path.basename(m.url);
  await db.query('insert into infographie.catalogue (id, donnees) values (1, $1) on conflict do nothing', [c]);
  return (await db.query('select donnees, version, maj_le from infographie.catalogue where id = 1')).rows[0];
}

// Une seule source de vérité : la société, la TVA, le timbre et les préfixes viennent des Paramètres ERP
// (module 10), pas du catalogue. Le studio et la Gestion 3.3.0 les lisent ici sans modification.
async function avecParametres(db, donnees) {
  const c = structuredClone(donnees);
  const s = (await db.query('select nom, adresse, ville, telephone, email, web, mf, rc, banque, rib, logo from parametres.societe where id = 1')).rows[0];
  if (s) c.company = { name: s.nom, address: s.adresse, city: s.ville, phone: s.telephone, email: s.email, web: s.web, mf: s.mf, rc: s.rc, bank: s.banque, rib: s.rib, logo: s.logo };
  const f = (await db.query(`select distinct on (code) code, valeur::float8 as v from parametres.fiscalite
      where en_vigueur_le <= current_date order by code, en_vigueur_le desc`)).rows;
  const fv = Object.fromEntries(f.map((x) => [x.code, x.v]));
  const n = Object.fromEntries((await db.query('select type, prefixe from parametres.numerotation')).rows.map((x) => [x.type, x.prefixe]));
  c.gestion = { ...(c.gestion || {}) };
  if (fv.tva_normale !== undefined) c.gestion.tva = fv.tva_normale;
  if (fv.timbre_fiscal !== undefined) c.gestion.timbre = fv.timbre_fiscal;
  for (const [k, t] of [['orderPrefix', 'commande'], ['blPrefix', 'bl'], ['invoicePrefix', 'facture'], ['receiptPrefix', 'recu']]) if (n[t]) c.gestion[k] = n[t];
  return c;
}

// ------------------------------------------------------------------ commercial
const COLS = ['clients', 'orders', 'bls', 'invoices'];
const DROIT_COL = { clients: 'commercial.clients', orders: 'commercial.commandes', bls: 'commercial.bl', invoices: 'commercial.factures' };
const rid = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex').slice(0, 5);
const KIND = { order: 'commande', bl: 'bl', invoice: 'facture', receipt: 'recu' };

async function lireGestion(eff) {
  const r = await pool.query('select collection, donnees from commercial.documents order by cree_le, id');
  const out = { version: 1, counters: {}, clients: [], orders: [], bls: [], invoices: [] };
  for (const x of r.rows) if (D.peut(eff, DROIT_COL[x.collection], 'lire')) out[x.collection].push(x.donnees);
  const c = await pool.query('select type, annee, dernier from parametres.compteurs');
  const inv = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [v, k]));
  for (const x of c.rows) if (inv[x.type]) out.counters[`${inv[x.type]}:${x.annee}`] = x.dernier;
  out.revision = Number((await pool.query('select n from commercial.revision')).rows[0].n);
  // sans le droit « prix » : lignes, avances, règlements, totaux retirés ; factures entièrement masquées
  if (!D.voit(eff, 'prix')) { out.invoices = []; for (const k of ['orders', 'bls']) out[k] = D.masquer(eff, out[k]); }
  return out;
}

// ------------------------------------------------------------------ registres
const REGISTRES = {
  fournisseurs: { droit: 'compta_fournisseurs.fournisseurs', champs: ['code', 'nom', 'contact', 'telephone', 'email', 'adresse', 'ville', 'mf', 'categorie', 'conditions', 'note'], requis: ['nom'] },
  articles_mp: { droit: 'stock_mp.articles', champs: ['code', 'designation', 'famille', 'unite', 'couleur', 'fournisseur', 'stock_mini', 'emplacement', 'prix_achat', 'note'], requis: ['designation', 'unite'] },
};

module.exports = async function routesMetier(app) {
  // ============ Infographie : catalogue ============
  app.get('/api/infographie/catalogue', { preHandler: exige('infographie.catalogue', 'lire') }, async (req, reply) => {
    const r = await lireCatalogue(pool);
    if (!r) return erreur(reply, 404, 'introuvable', 'Catalogue introuvable sur le serveur.');
    const c = await avecParametres(pool, r.donnees);
    return { catalogue: catalogueMasque(req.droits, c), version: r.version, maj_le: r.maj_le, prix_visibles: D.voit(req.droits, 'prix') };
  });
  // Même catalogue, au format brut attendu par le studio (servi aussi sous /studio/catalogue.json par Nginx).
  app.get('/api/infographie/catalogue-brut', { preHandler: exige('infographie.catalogue', 'lire') }, async (req, reply) => {
    const r = await lireCatalogue(pool);
    if (!r) return erreur(reply, 404, 'introuvable', 'Catalogue introuvable sur le serveur.');
    return catalogueMasque(req.droits, await avecParametres(pool, r.donnees));
  });
  app.get('/api/infographie/catalogue-usine', { preHandler: exige('infographie.catalogue', 'modifier') }, async (req, reply) => {
    try { return JSON.parse(fs.readFileSync(FACTORY, 'utf8')); } catch (_) { return erreur(reply, 404, 'introuvable', 'Catalogue d’usine introuvable.'); }
  });
  app.put('/api/infographie/catalogue', {
    preHandler: exige('infographie.catalogue', 'modifier'), bodyLimit: 20 * 1024 * 1024,
    schema: { body: { type: 'object', required: ['catalogue'], properties: { catalogue: { type: 'object' }, version: { type: 'integer' } } } },
  }, async (req, reply) => {
    const c = req.body.catalogue;
    if (!Array.isArray(c.catalog) || !c.shop || !c.models) return erreur(reply, 400, 'catalogue_invalide', 'Catalogue invalide.');
    if (!D.voit(req.droits, 'prix')) return erreur(reply, 403, 'interdit', 'Modifier le catalogue demande de voir les prix (tarifs du studio).');
    return transaction(async (cx) => {
      const avant = await lireCatalogue(cx);
      await cx.query('select 1 from infographie.catalogue where id = 1 for update');
      if (req.body.version !== undefined && avant && req.body.version !== avant.version) return erreur(reply, 409, 'conflit_version', 'Le catalogue a été modifié sur un autre poste. Rechargez avant d’enregistrer.');
      await cx.query('update infographie.catalogue set donnees = $1, version = version + 1, maj_le = now(), maj_par = $2 where id = 1', [c, req.utilisateur.id]);
      const resume = (x) => ({ produits: (x?.catalog || []).length, modeles: Object.keys(x?.models || {}).length, couleurs: (x?.shop?.colors || []).length });
      await S.auditer(cx, req, 'catalogue_modifie', { entite: 'catalogue', entiteId: 1, avant: resume(avant?.donnees), apres: resume(c) });
      const r = (await cx.query('select version from infographie.catalogue where id = 1')).rows[0];
      return { ok: true, version: r.version };
    });
  });

  // Modèles GLB : envoi (contrôle de l'en-tête glTF) et lecture
  app.addContentTypeParser('model/gltf-binary', { parseAs: 'buffer', bodyLimit: 60 * 1024 * 1024 }, (req, body, done) => done(null, body));
  app.post('/api/infographie/modeles/:id', { preHandler: exige('infographie.catalogue', 'modifier'), bodyLimit: 60 * 1024 * 1024 }, async (req, reply) => {
    const b = req.body;
    if (!Buffer.isBuffer(b) || b.length < 20 || b.toString('latin1', 0, 4) !== 'glTF') return erreur(reply, 400, 'glb_invalide', 'Ce n’est pas un fichier .glb valide (CLO : Fichier ▸ Exporter ▸ glTF, format GLB).');
    const id = String(req.params.id).toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 60) || 'modele';
    const nom = `${id}-${Date.now().toString(36)}.glb`;
    fs.mkdirSync(GLB_DIR, { recursive: true });
    fs.writeFileSync(path.join(GLB_DIR, nom), b);
    await S.auditer(pool, req, 'modele_3d_ajoute', { entite: 'modele_3d', entiteId: nom, details: { taille: b.length } });
    return { url: '/api/infographie/modeles/' + nom, size: b.length };
  });
  app.get('/api/infographie/modeles/:nom', { preHandler: exige('infographie.catalogue', 'lire') }, async (req, reply) => {
    const nom = path.basename(String(req.params.nom));
    if (!/^[a-z0-9_-]+\.glb$/i.test(nom)) return erreur(reply, 400, 'nom_invalide', 'Nom de fichier invalide.');
    const f = path.join(GLB_DIR, nom);
    if (!fs.existsSync(f)) return erreur(reply, 404, 'introuvable', 'Modèle 3D introuvable.');
    reply.header('Cache-Control', 'private, max-age=86400').type('model/gltf-binary');
    return reply.send(fs.createReadStream(f));
  });

  // ============ Commercial : gestion 3.3.0 ============
  app.get('/api/commercial/gestion', { preHandler: S.exigerConnexion() }, async (req) => lireGestion(req.droits));
  app.get('/api/commercial/revision', { preHandler: S.exigerConnexion() }, async () => ({ revision: Number((await pool.query('select n from commercial.revision')).rows[0].n) }));

  app.put('/api/commercial/:col', {
    preHandler: S.exigerConnexion(), bodyLimit: 15 * 1024 * 1024,
    schema: { params: { type: 'object', properties: { col: { type: 'string', enum: COLS } } }, body: { type: 'object' } },
  }, async (req, reply) => {
    const col = req.params.col;
    let rec = req.body;
    // Sans le droit « prix » : clients autorisés ; commandes avec prix fixés par le serveur (lib/prix-studio.js) ;
    // BL et factures toujours refusés.
    const sansPrix = !D.voit(req.droits, 'prix');
    if (sansPrix && !['clients', 'orders'].includes(col)) return erreur(reply, 403, 'interdit', 'Enregistrer ce document demande de voir les prix.');
    if (rec.id && !/^[A-Za-z0-9_-]{1,40}$/.test(rec.id)) return erreur(reply, 400, 'id_invalide', 'Identifiant invalide.');
    return transaction(async (c) => {
      const avant = rec.id ? (await c.query('select donnees from commercial.documents where collection = $1 and id = $2 for update', [col, rec.id])).rows[0]?.donnees : null;
      const action = avant ? 'modifier' : 'creer';
      if (!D.peut(req.droits, DROIT_COL[col], action)) return erreur(reply, 403, 'interdit', `Vos droits ne permettent pas de ${action === 'creer' ? 'créer' : 'modifier'} ce document.`);
      if (sansPrix && col === 'orders') {
        if (!avant) {
          // le numéro doit avoir été attribué par le serveur à ce même compte, et ne servir qu'une fois
          const n = String(rec.number || '').slice(0, 40);
          await c.query('select pg_advisory_xact_lock(727002, hashtext($1))', [n]); // deux postes, même numéro : l'un après l'autre
          const attribue = n && (await c.query(`select 1 from noyau.audit where action = 'numero_attribue' and entite_id = 'commande'
            and utilisateur_id = $1 and details->>'numero' = $2 limit 1`, [req.utilisateur.id, n])).rowCount;
          if (!attribue) return erreur(reply, 400, 'numero_absent', 'Une nouvelle commande doit avoir un numéro attribué par le serveur.');
          if ((await c.query(`select 1 from commercial.documents where collection = 'orders' and donnees->>'number' = $1`, [n])).rowCount) return erreur(reply, 400, 'numero_pris', 'Ce numéro de commande est déjà utilisé.');
        }
        const cat = await lireCatalogue(c);
        try { rec = P.fusionnerCommande(rec, avant, cat?.donnees); } catch (e) { if (e instanceof P.ErreurPrix) return erreur(reply, 400, e.code, e.message); throw e; }
      }
      if (sansPrix && col === 'clients' && avant) {
        // champs que ce compte ne voit pas (encours, montants) : ceux du serveur, jamais effacés
        rec = { ...rec };
        for (const [vis, champs] of Object.entries(D.CHAMPS_MASQUES)) if (!D.voit(req.droits, vis)) for (const k of champs) if (!k.includes('[]')) { if (avant[k] !== undefined) rec[k] = avant[k]; else delete rec[k]; }
      }
      // règles de la 3.3.0, maintenant contrôlées par le serveur
      if (avant && col === 'invoices') {
        if (avant.status === 'annulee') return erreur(reply, 400, 'facture_annulee', 'Une facture annulée ne se modifie plus.');
        if (rec.status === 'annulee' && !D.peut(req.droits, 'commercial.factures', 'annuler')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas d’annuler une facture.');
        if (avant.number && rec.number !== avant.number) return erreur(reply, 400, 'numero_fige', 'Le numéro d’une facture ne change pas.');
      }
      if (avant && col === 'orders' && rec.status === 'annulee' && avant.status !== 'annulee' && !D.peut(req.droits, 'commercial.commandes', 'annuler')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas d’annuler une commande.');
      if (col === 'invoices' && !avant && !rec.number) return erreur(reply, 400, 'numero_absent', 'Une facture doit avoir un numéro officiel.');
      rec.id ||= rid();
      rec.updatedAt = new Date().toISOString(); rec.createdAt ||= avant?.createdAt || rec.updatedAt;
      await c.query(`insert into commercial.documents (collection, id, donnees, maj_par) values ($1, $2, $3, $4)
        on conflict (collection, id) do update set donnees = excluded.donnees, maj_le = now(), maj_par = excluded.maj_par`, [col, rec.id, rec, req.utilisateur.id]);
      const resume = (x) => x && { numero: x.number || x.name || null, statut: x.status || null, client: x.client?.name || null, lignes: (x.lines || []).length };
      const act = { clients: 'client', orders: 'commande', bls: 'bl', invoices: 'facture' }[col];
      await S.auditer(c, req, avant ? `${act}_modifie` : `${act}_cree`, { entite: act, entiteId: rec.id, avant: resume(avant), apres: resume(rec), details: sansPrix && col === 'orders' ? { prix: 'calculés par le serveur' } : undefined });
      return sansPrix ? D.masquer(req.droits, rec) : rec;
    });
  });

  app.delete('/api/commercial/:col/:id', {
    preHandler: S.exigerConnexion(),
    schema: { params: { type: 'object', properties: { col: { type: 'string', enum: COLS }, id: { type: 'string', maxLength: 40 } } } },
  }, async (req, reply) => {
    if (req.params.col !== 'clients') return erreur(reply, 400, 'suppression_interdite', 'Les commandes, BL et factures ne se suppriment pas : utilisez « Annuler ».');
    if (!D.peut(req.droits, 'commercial.clients', 'supprimer')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de supprimer un client.');
    return transaction(async (c) => {
      const used = (await c.query(`select count(*)::int n from commercial.documents where collection in ('orders','invoices') and donnees->'client'->>'id' = $1`, [req.params.id])).rows[0].n;
      if (used) return erreur(reply, 400, 'client_utilise', 'Ce client a des commandes ou des factures : il ne peut pas être supprimé.');
      const r = await c.query(`delete from commercial.documents where collection = 'clients' and id = $1 returning donnees`, [req.params.id]);
      if (r.rows[0]) await S.auditer(c, req, 'client_supprime', { entite: 'client', entiteId: req.params.id, avant: { nom: r.rows[0].donnees.name } });
      return { ok: true };
    });
  });

  // Numéros officiels : attribués par le serveur (sans doublon ni trou), au format des Paramètres
  app.post('/api/commercial/numero', {
    preHandler: S.exigerConnexion(),
    schema: { body: { type: 'object', required: ['kind'], additionalProperties: false, properties: { kind: { type: 'string', enum: Object.keys(KIND) }, date: { type: 'string', format: 'date' } } } },
  }, async (req, reply) => {
    const droit = { order: ['commercial.commandes', 'creer'], bl: ['commercial.bl', 'creer'], invoice: ['commercial.factures', 'creer'], receipt: ['commercial.reglements', 'creer'] }[req.body.kind];
    if (!D.peut(req.droits, ...droit)) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de créer ce document.');
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const r = await pool.query('select parametres.attribuer_numero($1, $2::date) n', [KIND[req.body.kind], date]);
    await S.auditer(pool, req, 'numero_attribue', { entite: 'numerotation', entiteId: KIND[req.body.kind], details: { numero: r.rows[0].n } });
    return { numero: r.rows[0].n };
  });
  app.get('/api/commercial/numero/:kind', { preHandler: S.exigerConnexion(), schema: { params: { type: 'object', properties: { kind: { type: 'string', enum: Object.keys(KIND) } } } } }, async (req) => {
    const r = (await pool.query(`select n.prefixe, n.chiffres, coalesce(c.dernier, 0) d from parametres.numerotation n
      left join parametres.compteurs c on c.type = n.type and c.annee = extract(year from current_date)::int where n.type = $1`, [KIND[req.params.kind]])).rows[0];
    return { prochain: `${r.prefixe}-${new Date().getFullYear()}-${String(r.d + 1).padStart(r.chiffres, '0')}`, suivant: r.d + 1 };
  });

  // ============ Registres (fournisseurs, articles matières) ============
  app.get('/api/registres/:reg', { preHandler: S.exigerConnexion(), schema: { params: { type: 'object', properties: { reg: { type: 'string', enum: Object.keys(REGISTRES) } } } } }, async (req, reply) => {
    const R = REGISTRES[req.params.reg];
    if (!D.peut(req.droits, R.droit, 'lire')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de consulter ce registre.');
    const r = await pool.query('select id, donnees, actif, version, maj_le from registres.fiches where registre = $1 order by actif desc, lower(coalesce(donnees->>\'nom\', donnees->>\'designation\'))', [req.params.reg]);
    let lignes = r.rows.map((x) => ({ id: Number(x.id), ...x.donnees, actif: x.actif, version: x.version, maj_le: x.maj_le }));
    if (req.params.reg === 'articles_mp' && !D.voit(req.droits, 'achats')) lignes = lignes.map(({ prix_achat, ...l }) => l);
    return lignes;
  });
  const enregistrer = async (req, reply, id) => {
    const R = REGISTRES[req.params.reg];
    if (!D.peut(req.droits, R.droit, id ? 'modifier' : 'creer')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas cette action.');
    const d = {};
    for (const k of R.champs) if (req.body[k] !== undefined && req.body[k] !== null) d[k] = typeof req.body[k] === 'string' ? req.body[k].trim().slice(0, 300) : req.body[k];
    for (const k of R.requis) if (!d[k]) return erreur(reply, 400, 'incomplet', `Champ obligatoire : ${k}.`);
    for (const k of ['stock_mini', 'prix_achat']) if (d[k] !== undefined && d[k] !== '' && !(Number(d[k]) >= 0)) return erreur(reply, 400, 'valeur_invalide', `${k} doit être un nombre positif.`);
    if ('prix_achat' in d && !D.voit(req.droits, 'achats')) delete d.prix_achat;
    try {
      return await transaction(async (c) => {
        if (!id) {
          const r = await c.query('insert into registres.fiches (registre, donnees, cree_par, maj_par) values ($1, $2, $3, $3) returning id', [req.params.reg, d, req.utilisateur.id]);
          await S.auditer(c, req, 'fiche_creee', { entite: req.params.reg, entiteId: r.rows[0].id, apres: d });
          reply.code(201); return { id: Number(r.rows[0].id) };
        }
        const av = (await c.query('select donnees, version from registres.fiches where id = $1 and registre = $2 for update', [id, req.params.reg])).rows[0];
        if (!av) return erreur(reply, 404, 'introuvable', 'Fiche introuvable.');
        if (req.body.version !== av.version) return erreur(reply, 409, 'conflit_version', 'Fiche modifiée entre-temps sur un autre poste. Rechargez.');
        if (!D.voit(req.droits, 'achats') && av.donnees.prix_achat !== undefined) d.prix_achat = av.donnees.prix_achat;
        await c.query('update registres.fiches set donnees = $2, actif = coalesce($3, actif), version = version + 1, maj_le = now(), maj_par = $4 where id = $1', [id, d, req.body.actif ?? null, req.utilisateur.id]);
        await S.auditer(c, req, 'fiche_modifiee', { entite: req.params.reg, entiteId: id, avant: av.donnees, apres: d });
        return { ok: true };
      });
    } catch (e) {
      if (e.code === '23505') return erreur(reply, 409, 'code_pris', 'Ce code est déjà utilisé.');
      throw e;
    }
  };
  const sch = { params: { type: 'object', properties: { reg: { type: 'string', enum: Object.keys(REGISTRES) }, id: { type: 'integer' } } }, body: { type: 'object' } };
  app.post('/api/registres/:reg', { preHandler: S.exigerConnexion(), schema: sch }, (req, reply) => enregistrer(req, reply, null));
  app.put('/api/registres/:reg/:id', { preHandler: S.exigerConnexion(), schema: sch }, (req, reply) => enregistrer(req, reply, req.params.id));

  // ============ Sauvegardes (lecture de l'état, Super admin) ============
  app.get('/api/sauvegardes', { preHandler: exige('parametres.sauvegardes', 'lire') }, async () => {
    const lister = (sous) => { try { return fs.readdirSync(path.join(SAUVEGARDES, sous)).map((n) => { const s = fs.statSync(path.join(SAUVEGARDES, sous, n)); return { nom: n, taille: s.size, date: s.mtime }; }).sort((a, b) => b.date - a.date); } catch (_) { return []; } };
    const db = lister('db'), fi = lister('fichiers'), co = lister('code');
    return { base: db.slice(0, 30), fichiers: fi.slice(0, 30), code: co.slice(0, 30), conservation_jours: 30, heure: '02:30 (UTC) chaque nuit', restauration_testee: 'chaque dimanche 04:00 (UTC)' };
  });
};
