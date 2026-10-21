'use strict';
// Lot ERP 0.9.0 — ventes complètes (CDC lots 4 et 5) :
//   Devis (DEV) → Proforma (PRO) → Commande (CMD, Gestion) → BL → Facture (FAC) → Avoirs (AV).
//   Transformation en un clic, sans ressaisie, avec traçabilité amont ↔ aval.
//   Export : devise du client (EUR / USD), TVA 0 %, Incoterms 2020, taux de change mémorisé,
//   documents en français ou en anglais, liste de colisage.
// Règles : numéro serveur en transaction (sans doublon ni trou) · rien ne se supprime (annulation tracée) ·
//   verrou de modification 30 min + numéro de version · montants jamais envoyés sans le droit « prix » ·
//   ligne sur produit fini vendue sous le prix de revient → confirmation obligatoire, tracée dans l'audit.
const crypto = require('crypto');
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');
const C = require('./calculs');
const V = require('./ventes');

const r3 = C.r3;
const r2 = (v) => Math.round((+v || 0) * 100) / 100;
const erreur = (reply, code, err, message, extra) => reply.code(code).send({ erreur: err, message, ...extra });
const leve = (code, message, statut = 400, extra) => Object.assign(new Error(message), { statusCode: statut, code, extra });
const jour = () => new Date().toISOString().slice(0, 10);
const plusJours = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const rid = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex').slice(0, 5);

// type d'URL → type en base, droit, préfixe de numérotation, statuts
const TYPES = {
  devis: { type: 'devis', droit: 'commercial.devis', num: 'devis', entite: 'devis', initial: 'emis', modifiables: ['emis', 'envoye'], lib: 'Devis' },
  proformas: { type: 'proforma', droit: 'commercial.proformas', num: 'proforma', entite: 'proforma', initial: 'emise', modifiables: ['emise', 'envoyee'], lib: 'Proforma' },
  avoirs: { type: 'avoir', droit: 'commercial.avoirs', num: 'avoir', entite: 'avoir', initial: 'emis', modifiables: [], lib: 'Avoir' },
};
// transitions de statut autorisées : statut visé → [statuts de départ, action de droit]
const TRANSITIONS = {
  devis: { envoye: [['emis'], 'modifier'], accepte: [['emis', 'envoye'], 'valider'], refuse: [['emis', 'envoye'], 'valider'],
    expire: [['emis', 'envoye'], 'valider'], annule: [['emis', 'envoye', 'accepte', 'refuse', 'expire'], 'annuler'], emis: [['refuse', 'expire'], 'valider'] },
  proformas: { envoyee: [['emise'], 'modifier'], acceptee: [['emise', 'envoyee'], 'valider'], annulee: [['emise', 'envoyee', 'acceptee'], 'annuler'] },
  avoirs: { annule: [['emis'], 'annuler'] },
};
const INCOTERMS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'];
const MONTANTS = ['ht', 'montant_tva', 'ttc', 'net', 'timbre', 'a_rembourser', 'taux_change'];

// ------------------------------------------------------------------ lecture et masquage
const COLONNES = `d.id, d.type, d.numero, to_char(d.date, 'YYYY-MM-DD') date, to_char(d.validite, 'YYYY-MM-DD') validite,
  d.client_id, d.client, d.ref_client, d.type_client, d.devise, d.langue, d.incoterm, d.lieu_incoterm, d.taux_change::float8 taux_change,
  d.prix_ttc, d.tva::float8 tva, d.timbre::float8 timbre, d.lignes, d.ht::float8 ht, d.montant_tva::float8 montant_tva, d.ttc::float8 ttc,
  d.net::float8 net, d.a_rembourser::float8 a_rembourser, d.conditions, d.note, d.colisage, d.statut, d.motif,
  d.origine_id, o.numero origine_num, d.commande_id, d.commande_num, d.facture_id, d.facture_num, d.vente_perte, d.version,
  d.cree_le, cu.identifiant cree_par, d.maj_le, mu.identifiant maj_par,
  (select coalesce(json_agg(json_build_object('id', p.id, 'numero', p.numero, 'statut', p.statut) order by p.id), '[]') from ventes.documents p where p.origine_id = d.id) suites`;
const FROM = `from ventes.documents d left join ventes.documents o on o.id = d.origine_id
  left join noyau.utilisateurs cu on cu.id = d.cree_par left join noyau.utilisateurs mu on mu.id = d.maj_par`;

function masquer(eff, d) {
  const x = { ...d, id: Number(d.id), origine_id: d.origine_id == null ? null : Number(d.origine_id) };
  x.expire = ['emis', 'envoye', 'emise', 'envoyee'].includes(x.statut) && x.validite && x.validite < jour();
  if (D.voit(eff, 'prix')) return x;
  for (const k of MONTANTS) delete x[k];
  delete x.vente_perte;
  x.lignes = (x.lignes || []).map(({ pu, remise, total_ht, ...l }) => l);
  return x;
}
const lireUn = async (db, id, type) => (await db.query(`select ${COLONNES} ${FROM} where d.id = $1 and d.type = $2`, [id, type])).rows[0];

// ------------------------------------------------------------------ clients et taux en vigueur
async function client(db, id) {
  const r = (await db.query(`select donnees from commercial.documents where collection = 'clients' and id = $1`, [String(id)])).rows[0];
  if (!r) throw leve('client_inconnu', 'Client introuvable : choisissez un client de la liste (ou créez-le dans Commercial › Clients).', 400);
  const c = r.donnees;
  const export_ = c.type_client === 'export';
  return {
    snap: { id: c.id, name: c.name || '', contact: c.contact || '', address: c.address || '', city: c.city || '', phone: c.phone || '', email: c.email || '', mf: c.mf || '', country: c.country || '' },
    type_client: export_ ? 'export' : 'local',
    devise: export_ && ['EUR', 'USD'].includes(c.devise) ? c.devise : 'DT',
  };
}
const taux = async (db, code, date) => {
  const r = (await db.query('select parametres.taux_a($1, $2::date) v', [code, date])).rows[0];
  return r.v === null ? null : Number(r.v);
};

/** Lignes saisies → lignes propres ; contrôle des produits finis cités. */
async function nettoyerLignes(db, lignes, devise) {
  if (!Array.isArray(lignes) || !lignes.length) throw leve('lignes_absentes', 'Le document doit contenir au moins une ligne.');
  const arr = devise === 'DT' ? r3 : r2;
  const L = lignes.map((l, i) => {
    const designation = String(l.designation || '').trim().slice(0, 300);
    const produit = l.produit ? String(l.produit).trim().toUpperCase() : '';
    const qte = +l.qte;
    if (!designation) throw leve('ligne_invalide', `Ligne ${i + 1} : la désignation est obligatoire.`);
    if (!(qte > 0) || qte > 1e7) throw leve('ligne_invalide', `Ligne ${i + 1} : la quantité doit être supérieure à 0.`);
    if (!(+l.pu >= 0) || +l.pu > 1e8) throw leve('ligne_invalide', `Ligne ${i + 1} : le prix unitaire doit être positif.`);
    const remise = Math.min(100, Math.max(0, +l.remise || 0));
    if (produit && !V.REF_PF.test(produit)) throw leve('ligne_invalide', `Ligne ${i + 1} : référence produit fini invalide (${produit}).`);
    return { produit, designation, couleur: String(l.couleur || '').trim().slice(0, 60), taille: String(l.taille || '').trim().slice(0, 30),
      qte: r3(qte), pu: arr(+l.pu), remise, service: !!l.service };
  });
  const refs = [...new Set(L.map((l) => l.produit).filter(Boolean))];
  if (refs.length) {
    const ok = new Set((await db.query('select reference from pf.produits where reference = any($1) and annule = false', [refs])).rows.map((x) => x.reference));
    const manque = refs.filter((r) => !ok.has(r));
    if (manque.length) throw leve('produit_inconnu', `Produit fini introuvable ou annulé : ${manque.join(', ')}.`);
  }
  return L;
}

function nettoyerColisage(colis) {
  if (!Array.isArray(colis)) return [];
  return colis.slice(0, 500).map((c, i) => ({
    colis: String(c.colis || i + 1).trim().slice(0, 20), contenu: String(c.contenu || '').trim().slice(0, 300),
    quantite: Math.max(0, Math.floor(+c.quantite || 0)), poids_net: r3(Math.max(0, +c.poids_net || 0)),
    poids_brut: r3(Math.max(0, +c.poids_brut || 0)), dimensions: String(c.dimensions || '').trim().slice(0, 40),
  })).filter((c) => c.contenu || c.quantite || c.poids_brut);
}

/** Contrôle vente à perte d'un document ; lève 409 si non confirmé. Renvoie true si au moins une ligne est en perte. */
async function controlePerte(db, req, doc, confirmer, entite, entiteId) {
  if (doc.devise !== 'DT' && doc.lignes.some((l) => l.produit) && !(doc.taux_change > 0)) {
    throw leve('taux_change_requis', `Indiquez le taux de change (1 ${doc.devise} = ? DT) : il est mémorisé sur le document et sert à contrôler la vente à perte des produits finis.`);
  }
  const perte = await V.lignesEnPerte(db, doc.lignes, { ttc: doc.prix_ttc, tva: doc.tva, devise: doc.devise, taux: doc.taux_change });
  if (!perte.length) return false;
  if (!confirmer) {
    throw leve('vente_a_perte', `Attention : vente à perte sur ${perte.map((p) => `${p.ref} (prix ${p.pu_ht_dt.toFixed(3)} DT HT < prix de revient ${p.pri.toFixed(3)} DT)`).join(', ')}. Cochez « Confirmer la vente à perte » pour enregistrer.`, 409, { lignes: perte });
  }
  await S.auditer(db, req, 'vente_a_perte_confirmee', { entite, entiteId, details: { lignes: perte } });
  return true;
}

/** Construit un devis / une proforma à partir du corps de la requête (montants recalculés par le serveur). */
async function construire(db, b, avant) {
  const cl = await client(db, b.client_id ?? avant?.client_id);
  const date = b.date || avant?.date || jour();
  const export_ = cl.type_client === 'export';
  let tva = 0, prixTtc = false;
  if (!export_) {
    const t = await taux(db, 'tva_normale', date);
    if (t === null) throw leve('tva_absente', 'Aucun taux de TVA en vigueur à cette date (Paramètres › Fiscalité).');
    tva = t; prixTtc = b.prix_ttc ?? avant?.prix_ttc ?? true;
  }
  const lignes = await nettoyerLignes(db, b.lignes ?? avant?.lignes, cl.devise);
  const incoterm = export_ ? String(b.incoterm ?? avant?.incoterm ?? '').toUpperCase() : '';
  if (incoterm && !INCOTERMS.includes(incoterm)) throw leve('incoterm_invalide', 'Incoterm 2020 inconnu.');
  const tc = export_ ? (b.taux_change !== undefined ? (b.taux_change === null ? null : +b.taux_change) : avant?.taux_change ?? null) : null;
  if (tc !== null && !(tc > 0 && tc < 1000)) throw leve('taux_invalide', 'Taux de change invalide.');
  const doc = {
    client_id: cl.snap.id, client: cl.snap, type_client: cl.type_client, devise: cl.devise,
    date, validite: b.validite !== undefined ? (b.validite || null) : (avant ? avant.validite : plusJours(date, 30)),
    ref_client: String(b.ref_client ?? avant?.ref_client ?? '').trim().slice(0, 80),
    langue: export_ ? ((b.langue ?? avant?.langue) === 'en' ? 'en' : 'fr') : 'fr',
    incoterm, lieu_incoterm: export_ ? String(b.lieu_incoterm ?? avant?.lieu_incoterm ?? '').trim().slice(0, 80) : '',
    taux_change: tc, prix_ttc: prixTtc, tva, timbre: 0, lignes,
    conditions: String(b.conditions ?? avant?.conditions ?? '').trim().slice(0, 500),
    note: String(b.note ?? avant?.note ?? '').trim().slice(0, 1000),
    colisage: export_ ? nettoyerColisage(b.colisage ?? avant?.colisage ?? []) : [],
  };
  if (doc.validite && doc.validite < doc.date) throw leve('validite_invalide', 'La date de validité doit être postérieure à la date du document.');
  const t = V.totaux(doc);
  doc.lignes = t.lignes; doc.ht = t.ht; doc.montant_tva = t.tva; doc.ttc = t.ttc; doc.net = t.net;
  return doc;
}

const CHAMPS_DOC = ['client_id', 'client', 'ref_client', 'type_client', 'devise', 'date', 'validite', 'langue', 'incoterm', 'lieu_incoterm',
  'taux_change', 'prix_ttc', 'tva', 'timbre', 'lignes', 'ht', 'montant_tva', 'ttc', 'net', 'conditions', 'note', 'colisage'];
const JSONB = new Set(['client', 'lignes', 'colisage']);

async function inserer(c, req, type, doc, extra = {}) {
  const T = Object.values(TYPES).find((x) => x.type === type);
  const numero = (await c.query('select parametres.attribuer_numero($1, $2::date) n', [T.num, doc.date])).rows[0].n;
  const champs = { ...doc, ...extra, type, numero, statut: extra.statut || T.initial, cree_par: req.utilisateur.id, maj_par: req.utilisateur.id };
  const k = Object.keys(champs);
  const r = await c.query(`insert into ventes.documents (${k.join(', ')}) values (${k.map((_, i) => '$' + (i + 1)).join(', ')}) returning id`,
    k.map((x) => (JSONB.has(x) ? JSON.stringify(champs[x]) : champs[x])));
  return { id: Number(r.rows[0].id), numero };
}
const resume = (d) => d && { numero: d.numero, statut: d.statut, client: d.client?.name, devise: d.devise, net: d.net, lignes: (d.lignes || []).length };

// ------------------------------------------------------------------ avoirs : quantités déjà créditées
async function avoirsDe(db, factureId, sauf) {
  return (await db.query(`select id, numero, lignes, net::float8 net from ventes.documents where type = 'avoir' and facture_id = $1 and statut = 'emis'${sauf ? ' and id <> $2' : ''}`,
    sauf ? [factureId, sauf] : [factureId])).rows;
}
const devFacture = (f) => (['EUR', 'USD'].includes(f.currency) ? f.currency : 'DT');

module.exports = async function routesVentes(app) {
  const pTypes = { type: 'string', enum: Object.keys(TYPES) };

  // ============ liste et lecture ============
  app.get('/api/ventes/:type', { preHandler: S.exigerConnexion(), schema: { params: { type: 'object', properties: { type: pTypes } } } }, async (req, reply) => {
    const T = TYPES[req.params.type];
    if (!D.peut(req.droits, T.droit, 'lire')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de consulter ces documents.');
    const r = await pool.query(`select ${COLONNES} ${FROM} where d.type = $1 order by d.date desc, d.id desc limit 3000`, [T.type]);
    return r.rows.map((x) => masquer(req.droits, x));
  });
  app.get('/api/ventes/:type/:id', { preHandler: S.exigerConnexion(), schema: { params: { type: 'object', properties: { type: pTypes, id: { type: 'integer' } } } } }, async (req, reply) => {
    const T = TYPES[req.params.type];
    if (!D.peut(req.droits, T.droit, 'lire')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de consulter ce document.');
    const d = await lireUn(pool, req.params.id, T.type);
    if (!d) return erreur(reply, 404, 'introuvable', `${T.lib} introuvable.`);
    const v = await V.verrouAutre(pool, T.entite, d.id, req.utilisateur.id);
    return { ...masquer(req.droits, d), verrou: v };
  });

  // ============ création et modification (devis, proformas) ============
  const schDoc = { type: 'object', additionalProperties: false, properties: {
    client_id: { type: 'string', maxLength: 40 }, date: { type: 'string', format: 'date' }, validite: { type: ['string', 'null'], format: 'date' },
    ref_client: { type: 'string', maxLength: 80 }, langue: { type: 'string', enum: ['fr', 'en'] }, incoterm: { type: 'string', maxLength: 3 },
    lieu_incoterm: { type: 'string', maxLength: 80 }, taux_change: { type: ['number', 'null'] }, prix_ttc: { type: 'boolean' },
    lignes: { type: 'array', maxItems: 300, items: { type: 'object' } }, conditions: { type: 'string', maxLength: 500 }, note: { type: 'string', maxLength: 1000 },
    colisage: { type: 'array', maxItems: 500, items: { type: 'object' } }, confirmer_perte: { type: 'boolean' }, version: { type: 'integer' } } };
  const avecErreurs = (fn) => async (req, reply) => {
    try { return await fn(req, reply); } catch (e) {
      if (e.statusCode && e.code && typeof e.code === 'string') return erreur(reply, e.statusCode, e.code, e.message, e.extra ? { details: e.extra } : undefined);
      throw e;
    }
  };

  app.post('/api/ventes/:type', { preHandler: S.exigerConnexion(), bodyLimit: 2 * 1024 * 1024,
    schema: { params: { type: 'object', properties: { type: { type: 'string', enum: ['devis', 'proformas'] } } }, body: { ...schDoc, required: ['client_id', 'lignes'] } },
  }, avecErreurs(async (req, reply) => {
    const T = TYPES[req.params.type];
    if (!D.peut(req.droits, T.droit, 'creer')) return erreur(reply, 403, 'interdit', `Vos droits ne permettent pas de créer un${T.type === 'proforma' ? 'e proforma' : ' devis'}.`);
    if (!D.voit(req.droits, 'prix')) return erreur(reply, 403, 'interdit', 'Établir un document chiffré demande de voir les prix.');
    return transaction(async (c) => {
      const doc = await construire(c, req.body, null);
      const perte = await controlePerte(c, req, doc, req.body.confirmer_perte, T.entite, 'nouveau');
      const r = await inserer(c, req, T.type, doc, { vente_perte: perte });
      await S.auditer(c, req, `${T.entite}_cree`, { entite: T.entite, entiteId: r.numero, apres: resume({ ...doc, numero: r.numero, statut: T.initial }) });
      reply.code(201);
      return masquer(req.droits, await lireUn(c, r.id, T.type));
    });
  }));

  app.put('/api/ventes/:type/:id', { preHandler: S.exigerConnexion(), bodyLimit: 2 * 1024 * 1024,
    schema: { params: { type: 'object', properties: { type: { type: 'string', enum: ['devis', 'proformas'] }, id: { type: 'integer' } } }, body: { ...schDoc, required: ['version'] } },
  }, avecErreurs(async (req, reply) => {
    const T = TYPES[req.params.type];
    if (!D.peut(req.droits, T.droit, 'modifier') || !D.voit(req.droits, 'prix')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de modifier ce document.');
    return transaction(async (c) => {
      const av = (await c.query(`select ${COLONNES} ${FROM} where d.id = $1 and d.type = $2 for update of d`, [req.params.id, T.type])).rows[0];
      if (!av) return erreur(reply, 404, 'introuvable', `${T.lib} introuvable.`);
      const v = await V.verrouAutre(c, T.entite, av.id, req.utilisateur.id);
      if (v) return erreur(reply, 423, 'verrouille', `${T.lib} ${av.numero} est en cours de modification par ${v.par}${v.poste ? ' (' + v.poste + ')' : ''}. Réessayez plus tard.`, { verrou: v });
      if (req.body.version !== av.version) return erreur(reply, 409, 'conflit_version', `${T.lib} ${av.numero} a été modifié entre-temps sur un autre poste. Rechargez avant d’enregistrer.`);
      if (!T.modifiables.includes(av.statut)) return erreur(reply, 400, 'non_modifiable', `${T.lib} ${av.numero} n’est plus modifiable (statut : ${av.statut}).`);
      if (req.body.client_id && req.body.client_id !== av.client_id && av.origine_id) return erreur(reply, 400, 'client_fige', 'Le client d’une proforma issue d’un devis ne change pas.');
      const doc = await construire(c, req.body, av);
      const perte = await controlePerte(c, req, doc, req.body.confirmer_perte, T.entite, av.numero);
      const k = [...CHAMPS_DOC, 'vente_perte'];
      const val = { ...doc, vente_perte: perte };
      await c.query(`update ventes.documents set ${k.map((x, i) => `${x} = $${i + 1}`).join(', ')}, version = version + 1, maj_le = now(), maj_par = $${k.length + 1} where id = $${k.length + 2}`,
        [...k.map((x) => (JSONB.has(x) ? JSON.stringify(val[x]) : val[x])), req.utilisateur.id, av.id]);
      await S.auditer(c, req, `${T.entite}_modifie`, { entite: T.entite, entiteId: av.numero, avant: resume(av), apres: resume({ ...doc, numero: av.numero, statut: av.statut }) });
      return masquer(req.droits, await lireUn(c, av.id, T.type));
    });
  }));

  // ============ statuts ============
  app.post('/api/ventes/:type/:id/statut', { preHandler: S.exigerConnexion(),
    schema: { params: { type: 'object', properties: { type: pTypes, id: { type: 'integer' } } }, body: { type: 'object', additionalProperties: false, required: ['statut', 'version'],
      properties: { statut: { type: 'string', maxLength: 20 }, motif: { type: 'string', maxLength: 300 }, version: { type: 'integer' } } } },
  }, avecErreurs(async (req, reply) => {
    const T = TYPES[req.params.type], { statut, version } = req.body, motif = String(req.body.motif || '').trim();
    const tr = TRANSITIONS[req.params.type][statut];
    if (!tr) return erreur(reply, 400, 'statut_invalide', 'Statut inconnu pour ce document.');
    if (!D.peut(req.droits, T.droit, tr[1])) return erreur(reply, 403, 'interdit', `Vos droits ne permettent pas cette action${tr[1] === 'annuler' ? ' (annulation réservée)' : ''}.`);
    if (['annule', 'annulee', 'refuse'].includes(statut) && !motif) return erreur(reply, 400, 'motif_requis', 'Indiquez le motif.');
    return transaction(async (c) => {
      const av = (await c.query('select * from ventes.documents where id = $1 and type = $2 for update', [req.params.id, T.type])).rows[0];
      if (!av) return erreur(reply, 404, 'introuvable', `${T.lib} introuvable.`);
      if (av.version !== version) return erreur(reply, 409, 'conflit_version', `${T.lib} ${av.numero} a été modifié entre-temps. Rechargez.`);
      const v = await V.verrouAutre(c, T.entite, av.id, req.utilisateur.id);
      if (v) return erreur(reply, 423, 'verrouille', `${T.lib} ${av.numero} est en cours de modification par ${v.par}.`, { verrou: v });
      if (!tr[0].includes(av.statut)) return erreur(reply, 400, 'transition_interdite', `${T.lib} ${av.numero} : passage de « ${av.statut} » à « ${statut} » impossible.`);
      if (T.type === 'avoir') {
        // annulation d'un avoir : le règlement « avoir » est retiré de la facture d'origine
        const f = (await c.query(`select donnees from commercial.documents where collection = 'invoices' and id = $1 for update`, [av.facture_id])).rows[0]?.donnees;
        if (f) {
          f.payments = (f.payments || []).filter((p) => p.avoir !== Number(av.id)); f.updatedAt = new Date().toISOString();
          await c.query(`update commercial.documents set donnees = $1, maj_le = now(), maj_par = $2 where collection = 'invoices' and id = $3`, [f, req.utilisateur.id, av.facture_id]);
        }
      }
      await c.query('update ventes.documents set statut = $2, motif = case when $3 = \'\' then motif else $3 end, version = version + 1, maj_le = now(), maj_par = $4 where id = $1', [av.id, statut, motif, req.utilisateur.id]);
      await V.libererVerrou(c, T.entite, av.id, req.utilisateur.id);
      await S.auditer(c, req, `${T.entite}_${statut}`, { entite: T.entite, entiteId: av.numero, avant: { statut: av.statut }, apres: { statut, motif: motif || undefined } });
      return { ok: true, statut };
    });
  }));

  // ============ transformations : devis → proforma, devis / proforma → commande ============
  app.post('/api/ventes/devis/:id/proforma', { preHandler: S.exigerConnexion(),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', additionalProperties: false, required: ['version'], properties: { version: { type: 'integer' }, date: { type: 'string', format: 'date' } } } },
  }, avecErreurs(async (req, reply) => {
    if (!D.peut(req.droits, 'commercial.proformas', 'creer') || !D.voit(req.droits, 'prix')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de créer une proforma.');
    return transaction(async (c) => {
      const dv = (await c.query(`select ${COLONNES} ${FROM} where d.id = $1 and d.type = 'devis' for update of d`, [req.params.id])).rows[0];
      if (!dv) return erreur(reply, 404, 'introuvable', 'Devis introuvable.');
      if (dv.version !== req.body.version) return erreur(reply, 409, 'conflit_version', `Le devis ${dv.numero} a été modifié entre-temps. Rechargez.`);
      if (!['emis', 'envoye', 'accepte'].includes(dv.statut)) return erreur(reply, 400, 'transition_interdite', `Le devis ${dv.numero} ne peut plus être transformé (statut : ${dv.statut}).`);
      const date = req.body.date || jour();
      // même contenu, client relu (coordonnées à jour), montants recalculés à la date de la proforma
      const doc = await construire(c, { client_id: dv.client_id, date, validite: plusJours(date, 30) }, dv);
      const r = await inserer(c, req, 'proforma', doc, { origine_id: dv.id, vente_perte: dv.vente_perte });
      await c.query(`update ventes.documents set statut = 'transforme', version = version + 1, maj_le = now(), maj_par = $2 where id = $1`, [dv.id, req.utilisateur.id]);
      await S.auditer(c, req, 'devis_transforme', { entite: 'devis', entiteId: dv.numero, details: { proforma: r.numero } });
      await S.auditer(c, req, 'proforma_cree', { entite: 'proforma', entiteId: r.numero, apres: resume({ ...doc, numero: r.numero, statut: 'emise' }), details: { devis: dv.numero } });
      reply.code(201);
      return masquer(req.droits, await lireUn(c, r.id, 'proforma'));
    });
  }));

  app.post('/api/ventes/:type/:id/commande', { preHandler: S.exigerConnexion(),
    schema: { params: { type: 'object', properties: { type: { type: 'string', enum: ['devis', 'proformas'] }, id: { type: 'integer' } } },
      body: { type: 'object', additionalProperties: false, required: ['version'], properties: { version: { type: 'integer' }, date: { type: 'string', format: 'date' }, livraison: { type: 'string', format: 'date' }, bc_client: { type: 'string', maxLength: 80 } } } },
  }, avecErreurs(async (req, reply) => {
    const T = TYPES[req.params.type];
    if (!D.peut(req.droits, 'commercial.commandes', 'creer') || !D.voit(req.droits, 'prix')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de créer une commande.');
    return transaction(async (c) => {
      const d = (await c.query(`select ${COLONNES} ${FROM} where d.id = $1 and d.type = $2 for update of d`, [req.params.id, T.type])).rows[0];
      if (!d) return erreur(reply, 404, 'introuvable', `${T.lib} introuvable.`);
      if (d.version !== req.body.version) return erreur(reply, 409, 'conflit_version', `${T.lib} ${d.numero} a été modifié entre-temps. Rechargez.`);
      const ok = T.type === 'devis' ? ['emis', 'envoye', 'accepte'] : ['emise', 'envoyee', 'acceptee'];
      if (!ok.includes(d.statut)) return erreur(reply, 400, 'transition_interdite', `${T.lib} ${d.numero} ne peut plus être transformé en commande (statut : ${d.statut}).`);
      const date = req.body.date || jour();
      const numero = (await c.query("select parametres.attribuer_numero('commande', $1::date) n", [date])).rows[0].n;
      const cl = await client(c, d.client_id);
      // Lignes au format de la Gestion (application 3.3.0) : prix TTC en local, HT dans la devise à l'export
      const lines = d.lignes.map((l) => ({ id: rid(), src: l.produit ? 'produit_fini' : 'article', article: l.produit || '', designation: l.designation,
        staff: '', color: l.couleur || '', size: l.taille || '', qty: l.qte,
        pu: l.remise ? (d.devise === 'DT' ? r3 : r2)(l.pu * (1 - l.remise / 100)) : l.pu, service: !!l.service }));
      const total = r3(lines.reduce((s, l) => s + l.qty * l.pu, 0));
      const now = new Date().toISOString();
      const order = { id: rid(), number: numero, clientPO: req.body.bc_client || d.ref_client || '', client: cl.snap, date, delivery: req.body.livraison || '',
        lines, advances: [], products: [], status: 'en_cours', total, createdAt: now, updatedAt: now,
        origine: { type: T.type, id: Number(d.id), numero: d.numero },
        ...(d.devise !== 'DT' ? { currency: d.devise, export: true, pricesTTC: false, incoterm: d.incoterm, langue: d.langue, taux_change: d.taux_change } : {}) };
      await c.query(`insert into commercial.documents (collection, id, donnees, maj_par) values ('orders', $1, $2, $3)`, [order.id, order, req.utilisateur.id]);
      await c.query(`update ventes.documents set statut = $2, commande_id = $3, commande_num = $4, version = version + 1, maj_le = now(), maj_par = $5 where id = $1`,
        [d.id, T.type === 'devis' ? 'transforme' : 'transformee', order.id, numero, req.utilisateur.id]);
      // la proforma issue d'un devis : le devis d'origine pointe aussi vers la commande (traçabilité amont ↔ aval)
      if (d.origine_id) await c.query('update ventes.documents set commande_id = $2, commande_num = $3 where id = $1', [d.origine_id, order.id, numero]);
      await S.auditer(c, req, `${T.entite}_transforme`, { entite: T.entite, entiteId: d.numero, details: { commande: numero } });
      await S.auditer(c, req, 'commande_cree', { entite: 'commande', entiteId: order.id, apres: { numero, client: cl.snap.name, lignes: lines.length }, details: { origine: d.numero, vente_a_perte: d.vente_perte || undefined } });
      reply.code(201);
      return { ok: true, commande: { id: order.id, numero } };
    });
  }));

  // ============ avoirs ============
  // Avoir partiel ou total rattaché à une facture émise. Le montant de l'avoir est imputé sur le reste dû
  // de la facture (règlement « Avoir » visible dans la Gestion) ; l'excédent éventuel est « à rembourser ».
  app.post('/api/ventes/avoirs', { preHandler: S.exigerConnexion(),
    schema: { body: { type: 'object', additionalProperties: false, required: ['facture_id', 'motif'], properties: {
      facture_id: { type: 'string', maxLength: 40 }, date: { type: 'string', format: 'date' }, motif: { type: 'string', minLength: 1, maxLength: 300 },
      total: { type: 'boolean' }, note: { type: 'string', maxLength: 1000 },
      lignes: { type: 'array', maxItems: 300, items: { type: 'object', additionalProperties: false, required: ['index', 'qte'], properties: { index: { type: 'integer', minimum: 0 }, qte: { type: 'number', minimum: 0 } } } } } } },
  }, avecErreurs(async (req, reply) => {
    if (!D.peut(req.droits, 'commercial.avoirs', 'creer') || !D.voit(req.droits, 'prix')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas d’établir un avoir.');
    const b = req.body, date = b.date || jour();
    if (!b.motif.trim()) return erreur(reply, 400, 'motif_requis', 'Indiquez le motif de l’avoir (retour, erreur de prix…).');
    return transaction(async (c) => {
      await c.query('select pg_advisory_xact_lock(727003, 1)'); // même verrou que le lettrage : pas d'imputation concurrente sur une facture
      const f = (await c.query(`select donnees from commercial.documents where collection = 'invoices' and id = $1 for update`, [b.facture_id])).rows[0]?.donnees;
      if (!f) return erreur(reply, 404, 'introuvable', 'Facture introuvable.');
      if (f.status === 'annulee') return erreur(reply, 400, 'facture_annulee', `La facture ${f.number} est annulée : aucun avoir possible.`);
      if (date < f.date) return erreur(reply, 400, 'date_invalide', 'L’avoir ne peut pas être antérieur à la facture.');
      const deja = await avoirsDe(c, f.id);
      const credite = {};
      for (const a of deja) for (const l of a.lignes) credite[l.index] = r3((credite[l.index] || 0) + (+l.qte || 0));
      const sel = b.total ? (f.lines || []).map((l, i) => ({ index: i, qte: r3((+l.qty || 0) - (credite[i] || 0)) })) : (b.lignes || []);
      const lignes = [];
      for (const s of sel) {
        const l = (f.lines || [])[s.index];
        if (!l) return erreur(reply, 400, 'ligne_invalide', `Ligne ${s.index + 1} absente de la facture.`);
        const reste = r3((+l.qty || 0) - (credite[s.index] || 0));
        if (!(s.qte > 0)) continue;
        if (s.qte > reste + 0.0005) return erreur(reply, 400, 'trop_credite', `Ligne « ${l.designation} » : ${reste} au plus à créditer (déjà ${credite[s.index] || 0} sur ${+l.qty || 0}).`);
        lignes.push({ index: s.index, produit: V.REF_PF.test(String(l.article || '')) ? l.article : '', designation: l.designation, couleur: l.color || '', taille: l.size || '',
          qte: r3(s.qte), pu: +l.pu || 0, remise: +l.remise || 0, service: !!(l.service || l.artType === 'prestation') });
      }
      if (!lignes.length) return erreur(reply, 400, 'rien_a_crediter', 'Aucune quantité à créditer : la facture est déjà entièrement couverte par des avoirs.');
      const dev = devFacture(f);
      const cl = (await c.query(`select donnees from commercial.documents where collection = 'clients' and id = $1`, [String(f.client?.id || '')])).rows[0]?.donnees;
      const doc = { client_id: String(f.client?.id || ''), client: f.client || {}, ref_client: f.clientPO || '', type_client: dev === 'DT' ? 'local' : 'export', devise: dev,
        date, validite: null, langue: f.langue === 'en' ? 'en' : 'fr', incoterm: f.incoterm || '', lieu_incoterm: '', taux_change: null,
        prix_ttc: f.pricesTTC !== false, tva: +f.tva || 0, timbre: 0, lignes, conditions: '', note: String(b.note || '').trim(), colisage: [] };
      if (cl?.type_client === 'export' && dev === 'DT') doc.type_client = 'export';
      const t = V.totaux(doc);
      doc.lignes = t.lignes; doc.ht = t.ht; doc.montant_tva = t.tva; doc.ttc = t.ttc; doc.net = t.net;
      // imputation sur le reste dû de la facture (règlements + avoirs déjà imputés)
      const reste = C.resteFacture(f);
      const impute = r3(Math.min(doc.net, reste));
      const r = await inserer(c, req, 'avoir', doc, { facture_id: f.id, facture_num: f.number, motif: b.motif.trim(), a_rembourser: r3(doc.net - impute) });
      if (impute > 0) {
        f.payments ||= [];
        f.payments.push({ id: r.numero, date, amount: impute, mode: 'Avoir', ref: `${r.numero} · ${b.motif.trim()}`.slice(0, 120), avoir: r.id });
        f.updatedAt = new Date().toISOString();
        await c.query(`update commercial.documents set donnees = $1, maj_le = now(), maj_par = $2 where collection = 'invoices' and id = $3`, [f, req.utilisateur.id, f.id]);
      }
      await S.auditer(c, req, 'avoir_cree', { entite: 'avoir', entiteId: r.numero, apres: { facture: f.number, net: doc.net, devise: dev, impute, a_rembourser: r3(doc.net - impute), motif: b.motif.trim() } });
      reply.code(201);
      return masquer(req.droits, await lireUn(c, r.id, 'avoir'));
    });
  }));

  // Lignes d'une facture avec les quantités encore créditables (écran « Nouvel avoir »)
  app.get('/api/ventes/factures/:id/creditable', { preHandler: S.exigerConnexion({ droit: ['commercial.avoirs', 'creer'] }),
    schema: { params: { type: 'object', properties: { id: { type: 'string', maxLength: 40 } } } } }, async (req, reply) => {
    if (!D.voit(req.droits, 'prix')) return erreur(reply, 403, 'interdit', 'Cet écran contient des montants.');
    const f = (await pool.query(`select donnees from commercial.documents where collection = 'invoices' and id = $1`, [req.params.id])).rows[0]?.donnees;
    if (!f) return erreur(reply, 404, 'introuvable', 'Facture introuvable.');
    const credite = {};
    for (const a of await avoirsDe(pool, f.id)) for (const l of a.lignes) credite[l.index] = r3((credite[l.index] || 0) + (+l.qte || 0));
    const t = C.totauxFacture(f);
    return { id: f.id, numero: f.number, date: f.date, client: f.client, devise: devFacture(f), statut: f.status, net: t.net, reste: C.resteFacture(f), prix_ttc: f.pricesTTC !== false, tva: +f.tva || 0,
      lignes: (f.lines || []).map((l, i) => ({ index: i, designation: l.designation, qte: +l.qty || 0, pu: +l.pu || 0, remise: +l.remise || 0, credite: credite[i] || 0, creditable: r3((+l.qty || 0) - (credite[i] || 0)) })) };
  });

  // ============ liste de colisage d'une facture export ============
  app.get('/api/ventes/colisage/:facture', { preHandler: S.exigerConnexion({ droit: ['commercial.factures', 'lire'] }),
    schema: { params: { type: 'object', properties: { facture: { type: 'string', maxLength: 40 } } } } }, async (req) => {
    const r = (await pool.query('select colis, version from ventes.colisages where facture_id = $1', [req.params.facture])).rows[0];
    return r || { colis: [], version: 0 };
  });
  app.put('/api/ventes/colisage/:facture', { preHandler: S.exigerConnexion({ droit: ['commercial.factures', 'modifier'] }),
    schema: { params: { type: 'object', properties: { facture: { type: 'string', maxLength: 40 } } },
      body: { type: 'object', additionalProperties: false, required: ['colis', 'version'], properties: { colis: { type: 'array', maxItems: 500 }, version: { type: 'integer' } } } },
  }, async (req, reply) => transaction(async (c) => {
    const f = (await c.query(`select donnees->>'number' n from commercial.documents where collection = 'invoices' and id = $1`, [req.params.facture])).rows[0];
    if (!f) return erreur(reply, 404, 'introuvable', 'Facture introuvable.');
    const av = (await c.query('select version from ventes.colisages where facture_id = $1 for update', [req.params.facture])).rows[0];
    if ((av?.version || 0) !== req.body.version) return erreur(reply, 409, 'conflit_version', 'Liste de colisage modifiée entre-temps. Rechargez.');
    const colis = nettoyerColisage(req.body.colis);
    await c.query(`insert into ventes.colisages (facture_id, colis, maj_par) values ($1, $2, $3)
      on conflict (facture_id) do update set colis = excluded.colis, version = ventes.colisages.version + 1, maj_le = now(), maj_par = excluded.maj_par`, [req.params.facture, JSON.stringify(colis), req.utilisateur.id]);
    await S.auditer(c, req, 'colisage_modifie', { entite: 'facture', entiteId: f.n, details: { colis: colis.length } });
    return { ok: true, version: (av?.version || 0) + 1, colis };
  }));

  // ============ verrous de modification (bail 30 min, renouvelable) ============
  const ENTITES = { devis: 'commercial.devis', proforma: 'commercial.proformas', avoir: 'commercial.avoirs' };
  const schV = { params: { type: 'object', properties: { entite: { type: 'string', enum: Object.keys(ENTITES) }, id: { type: 'string', maxLength: 60, pattern: '^[A-Za-z0-9_-]+$' } } } };
  app.post('/api/verrous/:entite/:id', { preHandler: S.exigerConnexion(), schema: schV }, async (req, reply) => {
    if (!D.peut(req.droits, ENTITES[req.params.entite], 'modifier')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de modifier ce document.');
    const autre = await V.prendreVerrou(pool, req.params.entite, req.params.id, req.utilisateur, S.contexte(req).poste);
    if (autre) return erreur(reply, 423, 'verrouille', `Document en cours de modification par ${autre.par}${autre.poste ? ' (' + autre.poste + ')' : ''}. Il sera libre au plus tard à ${new Date(autre.jusqu).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tunis' })}.`, { verrou: autre });
    return { ok: true, bail_minutes: V.BAIL_MIN };
  });
  app.delete('/api/verrous/:entite/:id', { preHandler: S.exigerConnexion(), schema: schV }, async (req) => {
    await V.libererVerrou(pool, req.params.entite, req.params.id, req.utilisateur.id);
    return { ok: true };
  });
};
