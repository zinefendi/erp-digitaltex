'use strict';
// Lot ERP 0.7.0 — comptabilité clients (module 3), fournisseurs (module 4), comptabilité générale (module 11),
// articles hors Studio (module 2). Réponses du comptable du 21/10/2026 :
//  TVA export 0 % · TVA 19 % et timbre 1 DT confirmés · retenue à la source gérée à part (module 11) ·
//  stocks au CMUP · pas d'écart de change (factures en EUR / USD) · exports CSV ou Excel au choix.
// Règles : aucun montant sans le droit de visibilité correspondant ; rien ne se supprime (annulation tracée).
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');
const C = require('./calculs');
const X = require('./xlsx');

const r3 = C.r3;
const erreur = (reply, code, err, message) => reply.code(code).send({ erreur: err, message });
const exige = (f, a, vis = []) => async (req, reply) => {
  await S.exigerConnexion({ droit: [f, a] })(req, reply);
  if (reply.sent) return;
  const manque = vis.filter((v) => !D.voit(req.droits, v));
  if (manque.length) return reply.code(403).send({ erreur: 'interdit', message: 'Cet écran contient des montants : il demande le droit de voir ' + manque.map((v) => ({ prix: 'les prix', encours: 'les encours clients', achats: 'les prix d’achat', couts: 'les coûts de revient' }[v])).join(' et ') + '.' });
};
const numero = (c, type, date) => c.query('select parametres.attribuer_numero($1, $2::date) n', [type, date]).then((r) => r.rows[0].n);
const taux = async (c, code, date) => Number((await c.query('select parametres.taux_a($1, $2::date) v', [code, date])).rows[0].v);
const jour = () => new Date().toISOString().slice(0, 10);
const DEVISES = ['DT', 'EUR', 'USD'];
const MODES = ['Espèces', 'Chèque', 'Virement', 'Carte bancaire', 'Traite', 'Effet'];
const devise = (inv) => (inv.currency && DEVISES.includes(inv.currency) ? inv.currency : 'DT');
const leve = (code, message, statut = 400) => Object.assign(new Error(message), { statusCode: statut, code });

async function planComptes(db) {
  return Object.fromEntries((await db.query('select cle, compte from compta.plan')).rows.map((x) => [x.cle, x.compte]));
}

// ------------------------------------------------------------------ factures clients (Gestion) : lecture
async function facturesClients(db, verrou = false) {
  const r = await db.query(`select id, donnees from commercial.documents where collection = 'invoices'${verrou ? ' for update' : ''}`);
  return r.rows.map((x) => x.donnees);
}
function etatFacture(f) {
  const t = C.totauxFacture(f), regle = C.regleFacture(f), reste = r3(Math.max(0, t.net - regle));
  return { t, regle, reste };
}

// ------------------------------------------------------------------ export CSV / Excel
function envoyerTableau(reply, nom, format, feuilles) {
  const ok = ['csv', 'xlsx'].includes(format) ? format : 'xlsx';
  if (ok === 'csv') {
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${nom}.csv"`);
    return reply.send(X.csv(feuilles.length === 1 ? feuilles[0].lignes : feuilles.flatMap((f, i) => [...(i ? [[]] : []), [f.nom], ...f.lignes])));
  }
  reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition', `attachment; filename="${nom}.xlsx"`);
  return reply.send(X.classeur(feuilles));
}

// ------------------------------------------------------------------ écritures comptables (journaux)
// Générées à la volée depuis les documents : jamais stockées deux fois, toujours cohérentes avec la Gestion.
async function ecritures(db, du, au) {
  const P = await planComptes(db);
  const dans = (d) => d && d >= du && d <= au;
  const E = [];
  const ecr = (journal, date, piece, libelle, lignes) => {
    const L = lignes.filter((l) => r3(l.debit) || r3(l.credit)).map((l) => ({ ...l, debit: r3(l.debit), credit: r3(l.credit) }));
    if (L.length) E.push({ journal, date, piece, libelle, lignes: L });
  };
  // Ventes : une écriture par facture émise (une facture annulée n'est pas comptabilisée ; l'avoir arrive au lot 4)
  for (const f of await facturesClients(db)) {
    if (f.status === 'annulee' || !dans(f.date)) continue;
    const { t } = etatFacture(f); const dev = devise(f);
    const presta = r3(t.lignes.filter((l) => l.prestation).reduce((s, l) => s + l.totHT, 0));
    const export_ = !!f.export || (+f.tva === 0 && dev !== 'DT');
    const htProd = r3(t.ht - presta);
    ecr('VE', f.date, f.number, `Facture ${f.number} ${f.client?.name || ''}`.trim(), [
      { compte: P.clients, tiers: f.client?.name || '', debit: t.net, credit: 0, devise: dev },
      { compte: export_ ? P.ventes_export : P.ventes_produits, debit: 0, credit: htProd, devise: dev },
      { compte: P.ventes_prestations, debit: 0, credit: presta, devise: dev },
      { compte: P.tva_collectee, debit: 0, credit: t.tva, devise: dev },
      { compte: P.timbre, debit: 0, credit: t.timbre, devise: dev },
    ]);
  }
  // Encaissements clients (hors annulés) : banque / caisse au débit, client au crédit, retenue subie au débit 4351
  const enc = (await db.query(`select e.*, to_char(e.date, 'YYYY-MM-DD') d, coalesce(sum(a.retenue) filter (where a.actif), 0)::float8 ras
    from compta.encaissements e left join compta.affectations_clients a on a.encaissement_id = e.id
    where e.statut not in ('annule', 'impaye') and e.date between $1 and $2 group by e.id order by e.date, e.id`, [du, au])).rows;
  for (const e of enc) {
    const m = Number(e.montant), ras = Number(e.ras);
    ecr(e.mode === 'Espèces' ? 'CA' : 'BQ', e.d, e.numero, `Encaissement ${e.client_nom}${e.reference ? ' · ' + e.reference : ''}`, [
      { compte: e.mode === 'Espèces' ? P.caisse : P.banque, debit: m, credit: 0, devise: e.devise },
      { compte: P.ras_subies, debit: ras, credit: 0, devise: e.devise },
      { compte: P.clients, tiers: e.client_nom, debit: 0, credit: r3(m + ras), devise: e.devise },
    ]);
  }
  // Achats : factures fournisseurs validées
  const ff = (await db.query(`select *, to_char(date, 'YYYY-MM-DD') d from compta.factures_fournisseurs where statut = 'validee' and date between $1 and $2 order by date, id`, [du, au])).rows;
  for (const f of ff) {
    ecr('AC', f.d, f.numero, `Facture ${f.fournisseur_nom} n° ${f.reference}`, [
      { compte: f.compte_charge || P[f.categorie] || P.achats, debit: Number(f.ht), credit: 0, devise: f.devise },
      { compte: P.tva_deductible, debit: Number(f.tva), credit: 0, devise: f.devise },
      { compte: P.timbre, debit: Number(f.timbre), credit: 0, devise: f.devise },
      { compte: P.fournisseurs, tiers: f.fournisseur_nom, debit: 0, credit: Number(f.net), devise: f.devise },
    ]);
  }
  // Règlements fournisseurs : fournisseur au débit (brut), banque au crédit (net), retenue opérée au crédit 4353
  const rg = (await db.query(`select *, to_char(date, 'YYYY-MM-DD') d from compta.reglements_fournisseurs where statut = 'valide' and date between $1 and $2 order by date, id`, [du, au])).rows;
  for (const g of rg) {
    ecr(g.mode === 'Espèces' ? 'CA' : 'BQ', g.d, g.numero, `Règlement ${g.fournisseur_nom}${g.reference ? ' · ' + g.reference : ''}`, [
      { compte: P.fournisseurs, tiers: g.fournisseur_nom, debit: Number(g.brut), credit: 0, devise: g.devise },
      { compte: g.mode === 'Espèces' ? P.caisse : P.banque, debit: 0, credit: Number(g.net), devise: g.devise },
      { compte: P.ras_operees, debit: 0, credit: Number(g.retenue), devise: g.devise },
    ]);
  }
  E.sort((a, b) => (a.date + a.journal + a.piece).localeCompare(b.date + b.journal + b.piece));
  return E;
}

// ------------------------------------------------------------------ comptes fournisseurs : factures et soldes
async function soldesFF(db, fournisseurId) {
  const r = await db.query(`select f.id, f.numero, f.reference, f.fournisseur_id, f.fournisseur_nom, to_char(f.date, 'YYYY-MM-DD') date, to_char(f.echeance, 'YYYY-MM-DD') echeance,
      f.devise, f.categorie, f.net::float8 net, f.ht::float8 ht, f.tva::float8 tva, f.timbre::float8 timbre, f.statut,
      coalesce((select sum(a.montant) from compta.affectations_fournisseurs a join compta.reglements_fournisseurs g on g.id = a.reglement_id
        where a.facture_id = f.id and a.actif and g.statut = 'valide'), 0)::float8 regle
    from compta.factures_fournisseurs f where f.statut <> 'annulee' ${fournisseurId ? 'and f.fournisseur_id = $1' : ''} order by f.date, f.id`, fournisseurId ? [fournisseurId] : []);
  return r.rows.map((x) => ({ ...x, reste: r3(Math.max(0, x.net - x.regle)) }));
}

async function comptesFournisseurs(db) {
  const fs = await soldesFF(db);
  const auj = jour(); const par = {};
  for (const f of fs) {
    if (f.statut !== 'validee') continue;
    const k = f.fournisseur_id + '|' + f.devise;
    const p = par[k] ||= { fournisseur_id: Number(f.fournisseur_id), nom: f.fournisseur_nom, devise: f.devise, factures: 0, facture: 0, regle: 0, reste: 0, non_echu: 0, t30: 0, t60: 0, t90: 0, t90p: 0 };
    p.factures++; p.facture = r3(p.facture + f.net); p.regle = r3(p.regle + Math.min(f.regle, f.net)); p.reste = r3(p.reste + f.reste);
    if (f.reste > 0.0005) {
      const j = Math.round((new Date(auj) - new Date(f.echeance || f.date)) / 86400000);
      const t = j <= 0 ? 'non_echu' : j <= 30 ? 't30' : j <= 60 ? 't60' : j <= 90 ? 't90' : 't90p';
      p[t] = r3(p[t] + f.reste);
    }
  }
  return Object.values(par).sort((a, b) => b.reste - a.reste);
}

module.exports = async function routesCompta(app) {
  // ================================================================ options et rappels du comptable
  app.get('/api/compta/options', { preHandler: S.exigerConnexion() }, async () => {
    const o = (await pool.query('select code, libelle, valeur, commentaire from parametres.options order by code')).rows;
    return { options: o, modes: MODES, devises: DEVISES };
  });

  // ================================================================ ARTICLES ET PRESTATIONS HORS STUDIO (module 2)
    const lireArticles = async (eff) => {
    const r = (await pool.query(`select id, code, designation, type, unite, prix_ht::float8 prix_ht, tva::float8 tva, compte, note, actif, version, maj_le
      from commercial.articles order by actif desc, lower(designation)`)).rows.map((x) => ({ ...x, id: Number(x.id) }));
    // 0.8.0 : les produits finis référencés sont vendables comme articles — leur prix n'est envoyé
    // qu'aux comptes qui ont le droit de voir les prix (règle CDC § 5.2).
    if (D.voit(eff, 'prix')) {
      const t = (await pool.query(`select valeur from parametres.fiscalite where code = 'tva_normale' and en_vigueur_le <= current_date order by en_vigueur_le desc limit 1`)).rows[0];
      const tva = t ? Number(t.valeur) : 19;
      const pf = (await pool.query(`select reference, client_nom, prix_ht from pf.produits where annule = false order by annee desc, numero desc limit 500`)).rows;
      r.unshift(...pf.map((p) => ({ id: 'pf:' + p.reference, code: p.reference,
        designation: 'Produit fini ' + p.reference + (p.client_nom ? ' · ' + p.client_nom : ''),
        type: 'produit', unite: 'pièce', prix_ht: Number(p.prix_ht), tva, pf: true })));
    }

      return D.voit(eff, 'prix') ? r : r.map(({ prix_ht, ...a }) => a);
  };
  app.get('/api/commercial/articles', { preHandler: exige('commercial.articles', 'lire') }, async (req) => lireArticles(req.droits));
  const schArticle = { type: 'object', additionalProperties: false, required: ['code', 'designation'], properties: {
    code: { type: 'string', maxLength: 30 }, designation: { type: 'string', maxLength: 200 }, type: { type: 'string', enum: ['produit', 'prestation'] },
    unite: { type: 'string', maxLength: 20 }, prix_ht: { type: 'number', minimum: 0, maximum: 1e9 }, tva: { type: 'number', minimum: 0, maximum: 100 },
    compte: { type: 'string', maxLength: 10 }, note: { type: 'string', maxLength: 300 }, actif: { type: 'boolean' }, version: { type: 'integer' } } };
  const enregistrerArticle = async (req, reply, id) => {
    const b = req.body;
    if (!D.voit(req.droits, 'prix')) return erreur(reply, 403, 'interdit', 'Créer ou modifier un article demande de voir les prix.');
    if (!/^[A-Za-z0-9._-]{1,30}$/.test(b.code.trim())) return erreur(reply, 400, 'code_invalide', 'Code : lettres, chiffres, point, tiret ou soulignement (30 caractères au plus).');
    if (!b.designation.trim()) return erreur(reply, 400, 'incomplet', 'La désignation est obligatoire.');
    if (b.compte && !/^[0-9]{2,10}$/.test(b.compte)) return erreur(reply, 400, 'compte_invalide', 'Compte comptable : 2 à 10 chiffres.');
    try {
      return await transaction(async (c) => {
        const v = [b.code.trim(), b.designation.trim(), b.type || 'produit', (b.unite || 'pièce').trim(), r3(b.prix_ht), b.tva ?? 19, b.compte || '', (b.note || '').trim(), req.utilisateur.id];
        if (!id) {
          const r = await c.query(`insert into commercial.articles (code, designation, type, unite, prix_ht, tva, compte, note, cree_par, maj_par)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) returning id`, v);
          await S.auditer(c, req, 'article_cree', { entite: 'article', entiteId: r.rows[0].id, apres: { code: v[0], designation: v[1], prix_ht: v[4] } });
          reply.code(201); return { id: Number(r.rows[0].id) };
        }
        const av = (await c.query('select * from commercial.articles where id = $1 for update', [id])).rows[0];
        if (!av) return erreur(reply, 404, 'introuvable', 'Article introuvable.');
        if (b.version !== av.version) return erreur(reply, 409, 'conflit_version', 'Article modifié entre-temps sur un autre poste. Rechargez.');
        await c.query(`update commercial.articles set code=$1, designation=$2, type=$3, unite=$4, prix_ht=$5, tva=$6, compte=$7, note=$8, maj_par=$9,
          actif = coalesce($10, actif), version = version + 1, maj_le = now() where id = $11`, [...v, b.actif ?? null, id]);
        await S.auditer(c, req, 'article_modifie', { entite: 'article', entiteId: id, avant: { code: av.code, designation: av.designation, prix_ht: Number(av.prix_ht), actif: av.actif }, apres: { code: v[0], designation: v[1], prix_ht: v[4], actif: b.actif ?? av.actif } });
        return { ok: true };
      });
    } catch (e) { if (e.code === '23505') return erreur(reply, 409, 'code_pris', 'Ce code article est déjà utilisé.'); throw e; }
  };
  app.post('/api/commercial/articles', { preHandler: exige('commercial.articles', 'creer'), schema: { body: schArticle } }, (req, reply) => enregistrerArticle(req, reply, null));
  app.put('/api/commercial/articles/:id', { preHandler: exige('commercial.articles', 'modifier'), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: schArticle } }, (req, reply) => enregistrerArticle(req, reply, req.params.id));

  // ================================================================ COMPTABILITÉ CLIENTS (module 3)
  // Factures ouvertes d'un client (pour l'encaissement et le lettrage)
  app.get('/api/compta/clients/:id/factures', { preHandler: exige('compta_clients.lettrage', 'lire', ['prix', 'encours']) }, async (req) => {
    const fs = (await facturesClients(pool)).filter((f) => f.status !== 'annulee' && f.client?.id === req.params.id);
    return fs.map((f) => { const e = etatFacture(f); return { id: f.id, numero: f.number, date: f.date, echeance: f.due || f.date, devise: devise(f), net: e.t.net, regle: e.regle, reste: e.reste }; })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  });

  app.get('/api/compta/encaissements', { preHandler: exige('compta_clients.lettrage', 'lire', ['prix']) }, async () => {
    const r = await pool.query(`select e.id, e.numero, e.client_id, e.client_nom, to_char(e.date, 'YYYY-MM-DD') date, e.montant::float8 montant, e.devise, e.mode, e.reference, e.banque,
        to_char(e.echeance, 'YYYY-MM-DD') echeance, e.statut, e.note, e.motif, e.version, u.identifiant cree_par,
        coalesce(json_agg(json_build_object('facture_id', a.facture_id, 'montant', a.montant::float8, 'retenue', a.retenue::float8)) filter (where a.actif), '[]') affectations
      from compta.encaissements e left join compta.affectations_clients a on a.encaissement_id = e.id left join noyau.utilisateurs u on u.id = e.cree_par
      group by e.id, u.identifiant order by e.date desc, e.id desc limit 2000`);
    const num = Object.fromEntries((await facturesClients(pool)).map((f) => [f.id, f.number]));
    return r.rows.map((x) => ({ ...x, id: Number(x.id), affectations: x.affectations.map((a) => ({ ...a, numero: num[a.facture_id] || a.facture_id })) }));
  });

  // Encaissement + lettrage : met à jour les règlements des factures (visibles dans la Gestion) dans la même transaction.
  app.post('/api/compta/encaissements', {
    preHandler: exige('compta_clients.lettrage', 'creer', ['prix', 'encours']),
    schema: { body: { type: 'object', additionalProperties: false, required: ['client_id', 'date', 'mode', 'affectations'], properties: {
      client_id: { type: 'string', maxLength: 40 }, date: { type: 'string', format: 'date' }, mode: { type: 'string', enum: MODES },
      reference: { type: 'string', maxLength: 60 }, banque: { type: 'string', maxLength: 60 }, echeance: { type: 'string', format: 'date' },
      note: { type: 'string', maxLength: 300 }, montant: { type: 'number', minimum: 0 },
      affectations: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', additionalProperties: false, required: ['facture_id'], properties: {
        facture_id: { type: 'string', maxLength: 40 }, montant: { type: 'number', minimum: 0 }, retenue: { type: 'number', minimum: 0 }, taux_retenue: { type: 'number', minimum: 0, maximum: 100 } } } } } } },
  }, async (req, reply) => {
    const b = req.body;
    try {
      return await transaction(async (c) => {
        await c.query('select pg_advisory_xact_lock(727003, 1)'); // un lettrage à la fois : pas de double paiement d'une facture
        const fs = Object.fromEntries((await facturesClients(c, true)).map((f) => [f.id, f]));
        const vus = new Set(); let total = 0, totalRas = 0, dev = null; let client = null;
        const lignes = [];
        for (const a of b.affectations) {
          const f = fs[a.facture_id];
          if (!f) throw leve('facture_introuvable', 'Facture introuvable : ' + a.facture_id, 404);
          if (vus.has(f.id)) throw leve('facture_double', 'La facture ' + f.number + ' apparaît deux fois.');
          vus.add(f.id);
          if (f.status === 'annulee') throw leve('facture_annulee', `La facture ${f.number} est annulée.`);
          if (f.client?.id !== b.client_id) throw leve('autre_client', `La facture ${f.number} n’est pas à ce client.`);
          const d = devise(f); if (dev && d !== dev) throw leve('devises_melangees', 'Un encaissement ne regroupe que des factures de la même devise.'); dev = d;
          client = f.client;
          const e = etatFacture(f);
          const ras = r3(a.retenue ?? (a.taux_retenue ? e.t.net * a.taux_retenue / 100 : 0));
          const m = r3(a.montant ?? Math.max(0, e.reste - ras));
          if (m + ras <= 0) throw leve('montant_nul', `Montant nul pour la facture ${f.number}.`);
          if (m + ras > e.reste + 0.0005) throw leve('trop_percu', `La facture ${f.number} n’a plus que ${e.reste.toFixed(3)} ${d} à régler.`);
          total = r3(total + m); totalRas = r3(totalRas + ras);
          lignes.push({ f, m, ras, base: e.t.net, taux: ras && e.t.net ? r3(ras / e.t.net * 100) : 0 });
        }
        if (b.montant !== undefined && Math.abs(r3(b.montant) - total) > 0.0005) throw leve('montant_incoherent', `Le montant encaissé (${r3(b.montant).toFixed(3)}) ne correspond pas à la somme affectée aux factures (${total.toFixed(3)}).`);
        const statut = ['Chèque', 'Traite', 'Effet'].includes(b.mode) && b.echeance && b.echeance > b.date ? 'portefeuille' : 'valide';
        const n = await numero(c, 'encaissement', b.date);
        const enc = (await c.query(`insert into compta.encaissements (numero, client_id, client_nom, date, montant, devise, mode, reference, banque, echeance, statut, note, cree_par, maj_par)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) returning id`,
        [n, b.client_id, client?.name || '', b.date, total, dev, b.mode, b.reference || '', b.banque || '', b.echeance || null, statut, b.note || '', req.utilisateur.id])).rows[0];
        for (const l of lignes) {
          await c.query('insert into compta.affectations_clients (encaissement_id, facture_id, montant, retenue) values ($1,$2,$3,$4)', [enc.id, l.f.id, l.m, l.ras]);
          // écrit dans la facture (Gestion) : un règlement par part, avec la référence de l'encaissement
          const f = l.f; f.payments ||= [];
          if (l.m) f.payments.push({ id: `${n}`, date: b.date, amount: l.m, mode: b.mode, ref: [n, b.reference].filter(Boolean).join(' · '), enc: Number(enc.id) });
          if (l.ras) f.payments.push({ id: `${n}-RAS`, date: b.date, amount: l.ras, mode: 'Retenue à la source', ref: `${n} · retenue ${l.taux} %`, enc: Number(enc.id), ras: true });
          f.updatedAt = new Date().toISOString();
          await c.query(`update commercial.documents set donnees = $1, maj_le = now(), maj_par = $2 where collection = 'invoices' and id = $3`, [f, req.utilisateur.id, f.id]);
          if (l.ras) {
            await c.query(`insert into compta.retenues (sens, tiers_type, tiers_id, tiers_nom, tiers_mf, tiers_adresse, document, facture_client_id, encaissement_id, date, nature, base, taux, montant, devise, cree_par, maj_par)
              values ('subie', 'client', $1, $2, $3, $4, $5, $6, $7, $8, 'ventes', $9, $10, $11, $12, $13, $13)`,
            [b.client_id, client?.name || '', client?.mf || '', [client?.address, client?.city].filter(Boolean).join(' '), f.number, f.id, enc.id, b.date, l.base, l.taux, l.ras, dev, req.utilisateur.id]);
          }
        }
        await S.auditer(c, req, 'encaissement_cree', { entite: 'encaissement', entiteId: n, apres: { client: client?.name, montant: total, retenue: totalRas, devise: dev, mode: b.mode, factures: lignes.map((l) => l.f.number) } });
        reply.code(201); return { id: Number(enc.id), numero: n, montant: total, retenue: totalRas, statut };
      });
    } catch (e) { if (e.statusCode && e.code) return erreur(reply, e.statusCode, e.code, e.message); throw e; }
  });

  // Portefeuille d'effets et chèques : remise en banque, impayé, annulation (le lettrage est défait)
  app.post('/api/compta/encaissements/:id/statut', {
    preHandler: exige('compta_clients.lettrage', 'annuler', ['prix', 'encours']),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', additionalProperties: false, required: ['statut', 'version'], properties: {
      statut: { type: 'string', enum: ['remis', 'impaye', 'annule'] }, motif: { type: 'string', maxLength: 300 }, version: { type: 'integer' } } } },
  }, async (req, reply) => {
    const { statut, motif = '', version } = req.body;
    if (statut !== 'remis' && !motif.trim()) return erreur(reply, 400, 'motif_requis', 'Indiquez le motif (impayé, erreur de saisie…).');
    return transaction(async (c) => {
      await c.query('select pg_advisory_xact_lock(727003, 1)');
      const e = (await c.query('select * from compta.encaissements where id = $1 for update', [req.params.id])).rows[0];
      if (!e) return erreur(reply, 404, 'introuvable', 'Encaissement introuvable.');
      if (e.version !== version) return erreur(reply, 409, 'conflit_version', 'Encaissement modifié entre-temps. Rechargez.');
      if (['annule', 'impaye'].includes(e.statut)) return erreur(reply, 400, 'deja_clos', 'Cet encaissement est déjà ' + (e.statut === 'annule' ? 'annulé' : 'en impayé') + '.');
      if (statut === 'remis' && e.statut !== 'portefeuille') return erreur(reply, 400, 'pas_en_portefeuille', 'Seuls les chèques et effets en portefeuille se remettent en banque.');
      if (statut !== 'remis') {
        // défait le lettrage : retire les règlements créés par cet encaissement dans les factures
        const aff = (await c.query('select facture_id from compta.affectations_clients where encaissement_id = $1 and actif', [e.id])).rows;
        for (const a of aff) {
          const d = (await c.query(`select donnees from commercial.documents where collection = 'invoices' and id = $1 for update`, [a.facture_id])).rows[0]?.donnees;
          if (!d) continue;
          d.payments = (d.payments || []).filter((p) => p.enc !== Number(e.id)); d.updatedAt = new Date().toISOString();
          await c.query(`update commercial.documents set donnees = $1, maj_le = now(), maj_par = $2 where collection = 'invoices' and id = $3`, [d, req.utilisateur.id, a.facture_id]);
        }
        await c.query('update compta.affectations_clients set actif = false where encaissement_id = $1', [e.id]);
        await c.query(`update compta.retenues set statut = 'annule', maj_le = now(), maj_par = $2 where encaissement_id = $1`, [e.id, req.utilisateur.id]);
      }
      await c.query('update compta.encaissements set statut = $2, motif = $3, version = version + 1, maj_le = now(), maj_par = $4 where id = $1', [e.id, statut, motif.trim(), req.utilisateur.id]);
      await S.auditer(c, req, 'encaissement_' + statut, { entite: 'encaissement', entiteId: e.numero, avant: { statut: e.statut }, apres: { statut, motif: motif.trim() } });
      return { ok: true };
    });
  });

  // Relances : niveaux 1 (rappel), 2 (relance), 3 (mise en demeure) ; historique en ajout seul
  app.get('/api/compta/relances', { preHandler: exige('compta_clients.relances', 'lire', ['prix', 'encours']) }, async () => {
    const r = await pool.query(`select r.id, r.client_id, r.client_nom, r.niveau, to_char(r.date, 'YYYY-MM-DD') date, r.canal, r.factures, r.montant::float8 montant, r.devise, r.note, u.identifiant cree_par
      from compta.relances r left join noyau.utilisateurs u on u.id = r.cree_par order by r.date desc, r.id desc limit 1000`);
    return r.rows.map((x) => ({ ...x, id: Number(x.id) }));
  });
  app.post('/api/compta/relances', {
    preHandler: exige('compta_clients.relances', 'creer', ['prix', 'encours']),
    schema: { body: { type: 'object', additionalProperties: false, required: ['client_id', 'niveau', 'canal'], properties: {
      client_id: { type: 'string', maxLength: 40 }, niveau: { type: 'integer', minimum: 1, maximum: 3 }, canal: { type: 'string', enum: ['courrier', 'email', 'telephone', 'visite'] },
      note: { type: 'string', maxLength: 500 }, date: { type: 'string', format: 'date' } } } },
  }, async (req, reply) => {
    const b = req.body, d = b.date || jour();
    const fs = (await facturesClients(pool)).filter((f) => f.status !== 'annulee' && f.client?.id === b.client_id)
      .map((f) => ({ f, e: etatFacture(f) })).filter((x) => x.e.reste > 0.0005 && (x.f.due || x.f.date) < d);
    if (!fs.length) return erreur(reply, 400, 'rien_a_relancer', 'Ce client n’a aucune facture échue non soldée.');
    const devs = [...new Set(fs.map((x) => devise(x.f)))];
    const montant = r3(fs.reduce((s, x) => s + x.e.reste, 0));
    const r = await transaction(async (c) => {
      const x = (await c.query(`insert into compta.relances (client_id, client_nom, niveau, date, canal, factures, montant, devise, note, cree_par)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [b.client_id, fs[0].f.client?.name || '', b.niveau, d, b.canal,
        JSON.stringify(fs.map((y) => ({ numero: y.f.number, echeance: y.f.due || y.f.date, reste: y.e.reste, devise: devise(y.f) }))), montant, devs.length === 1 ? devs[0] : 'mixte', b.note || '', req.utilisateur.id])).rows[0];
      await S.auditer(c, req, 'relance_creee', { entite: 'relance', entiteId: x.id, apres: { client: fs[0].f.client?.name, niveau: b.niveau, canal: b.canal, montant } });
      return x;
    });
    reply.code(201); return { id: Number(r.id), factures: fs.length, montant };
  });

  // ================================================================ COMPTABILITÉ FOURNISSEURS (module 4)
  const fournisseur = async (c, id) => (await c.query(`select id, donnees, actif from registres.fiches where id = $1 and registre = 'fournisseurs'`, [id])).rows[0];

  app.get('/api/compta/fournisseurs/factures', { preHandler: exige('compta_fournisseurs.factures', 'lire', ['achats']) }, async () => {
    const r = await pool.query(`select f.*, to_char(f.date, 'YYYY-MM-DD') date, to_char(f.echeance, 'YYYY-MM-DD') echeance, u.identifiant cree_par_id, v.identifiant valide_par_id,
        coalesce((select sum(a.montant) from compta.affectations_fournisseurs a join compta.reglements_fournisseurs g on g.id = a.reglement_id
          where a.facture_id = f.id and a.actif and g.statut = 'valide'), 0)::float8 regle
      from compta.factures_fournisseurs f left join noyau.utilisateurs u on u.id = f.cree_par left join noyau.utilisateurs v on v.id = f.valide_par
      order by f.date desc, f.id desc limit 2000`);
    return r.rows.map((x) => ({ id: Number(x.id), numero: x.numero, fournisseur_id: Number(x.fournisseur_id), fournisseur_nom: x.fournisseur_nom, reference: x.reference, date: x.date, echeance: x.echeance,
      devise: x.devise, categorie: x.categorie, compte_charge: x.compte_charge, lignes: x.lignes, ht: Number(x.ht), tva: Number(x.tva), timbre: Number(x.timbre), net: Number(x.net), regle: x.regle,
      reste: x.statut === 'annulee' ? 0 : r3(Math.max(0, Number(x.net) - x.regle)), statut: x.statut, note: x.note, motif: x.motif, version: x.version, cree_par: x.cree_par_id, valide_par: x.valide_par_id }));
  });

  const schFF = { type: 'object', additionalProperties: false, required: ['fournisseur_id', 'reference', 'date', 'lignes'], properties: {
    fournisseur_id: { type: 'integer' }, reference: { type: 'string', maxLength: 60 }, date: { type: 'string', format: 'date' }, echeance: { type: 'string', format: 'date' },
    devise: { type: 'string', enum: DEVISES }, categorie: { type: 'string', enum: ['achats', 'services', 'honoraires', 'loyers', 'autres_charges'] },
    compte_charge: { type: 'string', maxLength: 10 }, timbre: { type: 'number', minimum: 0, maximum: 100000 }, note: { type: 'string', maxLength: 300 }, version: { type: 'integer' },
    lignes: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', additionalProperties: false, required: ['designation', 'qte', 'pu_ht'], properties: {
      designation: { type: 'string', maxLength: 200 }, qte: { type: 'number', minimum: 0, maximum: 1e7 }, pu_ht: { type: 'number', minimum: 0, maximum: 1e9 }, tva: { type: 'number', minimum: 0, maximum: 100 } } } } } };
  const enregistrerFF = async (req, reply, id) => {
    const b = req.body;
    if (b.compte_charge && !/^[0-9]{1,10}$/.test(b.compte_charge)) return erreur(reply, 400, 'compte_invalide', 'Compte de charge : chiffres uniquement.');
    if (!b.reference.trim()) return erreur(reply, 400, 'incomplet', 'Indiquez le numéro de la facture du fournisseur.');
    if (b.echeance && b.echeance < b.date) return erreur(reply, 400, 'echeance_invalide', 'L’échéance ne peut pas précéder la date de facture.');
    const T = C.totauxFF(b.lignes.filter((l) => l.designation.trim()), b.timbre || 0);
    if (!T.lignes.length) return erreur(reply, 400, 'incomplet', 'La facture doit contenir au moins une ligne.');
    try {
      return await transaction(async (c) => {
        const fo = await fournisseur(c, b.fournisseur_id);
        if (!fo) return erreur(reply, 404, 'introuvable', 'Fournisseur introuvable.');
        const v = [b.fournisseur_id, fo.donnees.nom, fo.donnees.mf || '', b.reference.trim(), b.date, b.echeance || null, b.devise || 'DT', b.categorie || 'achats', b.compte_charge || '',
          JSON.stringify(T.lignes), T.ht, T.tva, T.timbre, T.net, (b.note || '').trim(), req.utilisateur.id];
        if (!id) {
          const n = await numero(c, 'facture_f', b.date);
          const r = await c.query(`insert into compta.factures_fournisseurs (numero, fournisseur_id, fournisseur_nom, fournisseur_mf, reference, date, echeance, devise, categorie, compte_charge, lignes, ht, tva, timbre, net, note, cree_par, maj_par)
            values ($17,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) returning id`, [...v, n]);
          await S.auditer(c, req, 'facture_fournisseur_creee', { entite: 'facture_fournisseur', entiteId: n, apres: { fournisseur: fo.donnees.nom, reference: v[3], net: T.net, devise: v[6] } });
          reply.code(201); return { id: Number(r.rows[0].id), numero: n, ...T };
        }
        const av = (await c.query('select * from compta.factures_fournisseurs where id = $1 for update', [id])).rows[0];
        if (!av) return erreur(reply, 404, 'introuvable', 'Facture introuvable.');
        if (av.statut !== 'saisie') return erreur(reply, 400, 'facture_figee', 'Une facture validée ou annulée ne se modifie plus.');
        if (b.version !== av.version) return erreur(reply, 409, 'conflit_version', 'Facture modifiée entre-temps sur un autre poste. Rechargez.');
        await c.query(`update compta.factures_fournisseurs set fournisseur_id=$1, fournisseur_nom=$2, fournisseur_mf=$3, reference=$4, date=$5, echeance=$6, devise=$7, categorie=$8, compte_charge=$9,
          lignes=$10, ht=$11, tva=$12, timbre=$13, net=$14, note=$15, maj_par=$16, version = version + 1, maj_le = now() where id = $17`, [...v, id]);
        await S.auditer(c, req, 'facture_fournisseur_modifiee', { entite: 'facture_fournisseur', entiteId: av.numero, avant: { net: Number(av.net), reference: av.reference }, apres: { net: T.net, reference: v[3] } });
        return { ok: true, ...T };
      });
    } catch (e) { if (e.code === '23505') return erreur(reply, 409, 'facture_deja_saisie', 'Cette facture de ce fournisseur est déjà saisie (même numéro).'); throw e; }
  };
  app.post('/api/compta/fournisseurs/factures', { preHandler: exige('compta_fournisseurs.factures', 'creer', ['achats']), schema: { body: schFF } }, (req, reply) => enregistrerFF(req, reply, null));
  app.put('/api/compta/fournisseurs/factures/:id', { preHandler: exige('compta_fournisseurs.factures', 'modifier', ['achats']), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: schFF } }, (req, reply) => enregistrerFF(req, reply, req.params.id));

  app.post('/api/compta/fournisseurs/factures/:id/:action', {
    preHandler: S.exigerConnexion(),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' }, action: { type: 'string', enum: ['valider', 'annuler'] } } },
      body: { type: 'object', additionalProperties: false, required: ['version'], properties: { version: { type: 'integer' }, motif: { type: 'string', maxLength: 300 } } } },
  }, async (req, reply) => {
    const act = req.params.action;
    if (!D.peut(req.droits, 'compta_fournisseurs.factures', act) || !D.voit(req.droits, 'achats')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas cette action.');
    if (act === 'annuler' && !(req.body.motif || '').trim()) return erreur(reply, 400, 'motif_requis', 'Indiquez le motif de l’annulation.');
    return transaction(async (c) => {
      const f = (await c.query('select * from compta.factures_fournisseurs where id = $1 for update', [req.params.id])).rows[0];
      if (!f) return erreur(reply, 404, 'introuvable', 'Facture introuvable.');
      if (f.version !== req.body.version) return erreur(reply, 409, 'conflit_version', 'Facture modifiée entre-temps. Rechargez.');
      if (f.statut === 'annulee') return erreur(reply, 400, 'facture_annulee', 'Cette facture est déjà annulée.');
      if (act === 'valider' && f.statut !== 'saisie') return erreur(reply, 400, 'deja_validee', 'Cette facture est déjà validée.');
      if (act === 'annuler') {
        const regle = Number((await c.query(`select coalesce(sum(a.montant), 0) s from compta.affectations_fournisseurs a join compta.reglements_fournisseurs g on g.id = a.reglement_id
          where a.facture_id = $1 and a.actif and g.statut = 'valide'`, [f.id])).rows[0].s);
        if (regle > 0) return erreur(reply, 400, 'facture_reglee', 'Cette facture a des règlements : annulez d’abord les règlements.');
      }
      await c.query(`update compta.factures_fournisseurs set statut = $2, motif = $3, version = version + 1, maj_le = now(), maj_par = $4,
        valide_le = case when $2 = 'validee' then now() else valide_le end, valide_par = case when $2 = 'validee' then $4 else valide_par end where id = $1`,
      [f.id, act === 'valider' ? 'validee' : 'annulee', (req.body.motif || '').trim(), req.utilisateur.id]);
      await S.auditer(c, req, act === 'valider' ? 'facture_fournisseur_validee' : 'facture_fournisseur_annulee', { entite: 'facture_fournisseur', entiteId: f.numero, avant: { statut: f.statut }, apres: { statut: act === 'valider' ? 'validee' : 'annulee', motif: req.body.motif } });
      return { ok: true };
    });
  });

  // Règlements fournisseurs + retenue à la source opérée (certificat RAS numéroté)
  app.get('/api/compta/fournisseurs/reglements', { preHandler: exige('compta_fournisseurs.reglements', 'lire', ['achats']) }, async () => {
    const r = await pool.query(`select g.id, g.numero, g.fournisseur_id, g.fournisseur_nom, to_char(g.date, 'YYYY-MM-DD') date, g.devise, g.mode, g.reference, g.banque,
        g.brut::float8 brut, g.retenue::float8 retenue, g.net::float8 net, g.statut, g.note, g.motif, u.identifiant cree_par,
        coalesce(json_agg(json_build_object('facture_id', a.facture_id, 'numero', f.numero, 'reference', f.reference, 'montant', a.montant::float8)) filter (where a.facture_id is not null), '[]') factures,
        (select r.numero from compta.retenues r where r.reglement_id = g.id and r.statut = 'valide' limit 1) certificat
      from compta.reglements_fournisseurs g left join compta.affectations_fournisseurs a on a.reglement_id = g.id
      left join compta.factures_fournisseurs f on f.id = a.facture_id left join noyau.utilisateurs u on u.id = g.cree_par
      group by g.id, u.identifiant order by g.date desc, g.id desc limit 2000`);
    return r.rows.map((x) => ({ ...x, id: Number(x.id), fournisseur_id: Number(x.fournisseur_id) }));
  });

  app.post('/api/compta/fournisseurs/reglements', {
    preHandler: exige('compta_fournisseurs.reglements', 'creer', ['achats']),
    schema: { body: { type: 'object', additionalProperties: false, required: ['fournisseur_id', 'date', 'mode', 'factures'], properties: {
      fournisseur_id: { type: 'integer' }, date: { type: 'string', format: 'date' }, mode: { type: 'string', enum: MODES },
      reference: { type: 'string', maxLength: 60 }, banque: { type: 'string', maxLength: 60 }, note: { type: 'string', maxLength: 300 },
      retenue: { type: 'object', additionalProperties: false, required: ['nature'], properties: {
        nature: { type: 'string', enum: ['achats', 'honoraires', 'honoraires_autres', 'loyers', 'autre'] }, taux: { type: 'number', minimum: 0, maximum: 100 } } },
      factures: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', additionalProperties: false, required: ['facture_id', 'montant'], properties: {
        facture_id: { type: 'integer' }, montant: { type: 'number', exclusiveMinimum: 0 } } } } } } },
  }, async (req, reply) => {
    const b = req.body;
    try {
      return await transaction(async (c) => {
        await c.query('select pg_advisory_xact_lock(727004, $1)', [b.fournisseur_id]);
        const fo = await fournisseur(c, b.fournisseur_id);
        if (!fo) throw leve('introuvable', 'Fournisseur introuvable.', 404);
        const soldes = Object.fromEntries((await soldesFF(c, b.fournisseur_id)).map((f) => [f.id, f]));
        let brut = 0; let dev = null; const vus = new Set();
        for (const a of b.factures) {
          const f = soldes[a.facture_id];
          if (!f) throw leve('facture_introuvable', 'Facture fournisseur introuvable ou annulée.', 404);
          if (vus.has(f.id)) throw leve('facture_double', `La facture ${f.numero} apparaît deux fois.`); vus.add(f.id);
          if (f.statut !== 'validee') throw leve('facture_non_validee', `La facture ${f.numero} doit être validée avant d’être réglée.`);
          if (dev && f.devise !== dev) throw leve('devises_melangees', 'Un règlement ne regroupe que des factures de la même devise.'); dev = f.devise;
          if (r3(a.montant) > f.reste + 0.0005) throw leve('trop_paye', `La facture ${f.numero} n’a plus que ${f.reste.toFixed(3)} ${f.devise} à régler.`);
          brut = r3(brut + r3(a.montant));
        }
        // retenue à la source opérée : taux en vigueur (Paramètres › Fiscalité) sauf taux saisi ; seuil pour les achats
        let ras = 0, tauxRas = 0, nature = null;
        if (b.retenue) {
          nature = b.retenue.nature;
          const code = { achats: 'ras_achats', honoraires: 'ras_honoraires', honoraires_autres: 'ras_honoraires_autres', loyers: 'ras_loyers' }[nature];
          tauxRas = b.retenue.taux ?? (code ? await taux(c, code, b.date) : NaN);
          if (!Number.isFinite(tauxRas)) throw leve('taux_inconnu', 'Indiquez le taux de retenue pour cette nature.');
          if (nature === 'achats' && b.retenue.taux === undefined) {
            const seuil = await taux(c, 'ras_seuil', b.date);
            if (Number.isFinite(seuil) && brut < seuil) throw leve('sous_le_seuil', `Retenue « achats » : le paiement (${brut.toFixed(3)}) est sous le seuil de ${seuil.toFixed(3)} DT TTC. Retirez la retenue ou indiquez le taux.`);
          }
          ras = r3(brut * tauxRas / 100);
        }
        const n = await numero(c, 'reglement_f', b.date);
        const g = (await c.query(`insert into compta.reglements_fournisseurs (numero, fournisseur_id, fournisseur_nom, date, devise, mode, reference, banque, brut, retenue, net, note, cree_par, maj_par)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) returning id`,
        [n, b.fournisseur_id, fo.donnees.nom, b.date, dev, b.mode, b.reference || '', b.banque || '', brut, ras, r3(brut - ras), b.note || '', req.utilisateur.id])).rows[0];
        for (const a of b.factures) await c.query('insert into compta.affectations_fournisseurs (reglement_id, facture_id, montant) values ($1,$2,$3)', [g.id, a.facture_id, r3(a.montant)]);
        let certificat = null;
        if (ras > 0) {
          certificat = await numero(c, 'ras', b.date);
          await c.query(`insert into compta.retenues (sens, numero, tiers_type, tiers_id, tiers_nom, tiers_mf, tiers_adresse, document, facture_f_id, reglement_id, date, nature, base, taux, montant, devise, cree_par, maj_par)
            values ('operee', $1, 'fournisseur', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)`,
          [certificat, String(b.fournisseur_id), fo.donnees.nom, fo.donnees.mf || '', [fo.donnees.adresse, fo.donnees.ville].filter(Boolean).join(' '),
            b.factures.map((a) => soldes[a.facture_id].reference).join(', '), b.factures.length === 1 ? b.factures[0].facture_id : null, g.id, b.date, nature, brut, tauxRas, ras, dev, req.utilisateur.id]);
        }
        await S.auditer(c, req, 'reglement_fournisseur_cree', { entite: 'reglement_fournisseur', entiteId: n, apres: { fournisseur: fo.donnees.nom, brut, retenue: ras, net: r3(brut - ras), certificat } });
        reply.code(201); return { id: Number(g.id), numero: n, brut, retenue: ras, net: r3(brut - ras), certificat };
      });
    } catch (e) { if (e.statusCode && e.code) return erreur(reply, e.statusCode, e.code, e.message); throw e; }
  });

  app.post('/api/compta/fournisseurs/reglements/:id/annuler', {
    preHandler: exige('compta_fournisseurs.reglements', 'annuler', ['achats']),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', additionalProperties: false, required: ['motif'], properties: { motif: { type: 'string', minLength: 1, maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const g = (await c.query('select * from compta.reglements_fournisseurs where id = $1 for update', [req.params.id])).rows[0];
    if (!g) return erreur(reply, 404, 'introuvable', 'Règlement introuvable.');
    if (g.statut === 'annule') return erreur(reply, 400, 'deja_annule', 'Ce règlement est déjà annulé.');
    await c.query(`update compta.reglements_fournisseurs set statut = 'annule', motif = $2, maj_le = now(), maj_par = $3 where id = $1`, [g.id, req.body.motif.trim(), req.utilisateur.id]);
    await c.query('update compta.affectations_fournisseurs set actif = false where reglement_id = $1', [g.id]);
    await c.query(`update compta.retenues set statut = 'annule', note = 'Règlement annulé : ' || $2, maj_le = now(), maj_par = $3 where reglement_id = $1 and statut = 'valide'`, [g.id, req.body.motif.trim(), req.utilisateur.id]);
    await S.auditer(c, req, 'reglement_fournisseur_annule', { entite: 'reglement_fournisseur', entiteId: g.numero, apres: { motif: req.body.motif.trim() } });
    return { ok: true };
  }));

  // Comptes fournisseurs : solde et balance âgée
  app.get('/api/compta/fournisseurs/comptes', { preHandler: exige('compta_fournisseurs.factures', 'lire', ['achats']) }, async () => comptesFournisseurs(pool));

  // ================================================================ COMPTABILITÉ GÉNÉRALE (module 11)
  app.get('/api/compta/retenues', { preHandler: exige('compta_generale.retenues', 'lire', ['prix']) }, async (req) => {
    const r = await pool.query(`select r.id, r.sens, r.numero, r.tiers_type, r.tiers_id, r.tiers_nom, r.tiers_mf, r.tiers_adresse, r.document, to_char(r.date, 'YYYY-MM-DD') date, r.nature,
        r.base::float8 base, r.taux::float8 taux, r.montant::float8 montant, r.devise, r.certificat_recu, r.certificat_ref, r.statut, r.note
      from compta.retenues r order by r.date desc, r.id desc limit 5000`);
    // les retenues opérées (fournisseurs) sont des montants d'achat
    return r.rows.map((x) => ({ ...x, id: Number(x.id) })).filter((x) => x.sens === 'subie' || D.voit(req.droits, 'achats'));
  });
  // Retenue subie saisie à part (client qui a retenu sans passer par l'encaissement de l'ERP) ou certificat reçu
  app.post('/api/compta/retenues/:id/certificat', {
    preHandler: exige('compta_generale.retenues', 'valider', ['prix']),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', additionalProperties: false, required: ['reference'], properties: { reference: { type: 'string', minLength: 1, maxLength: 60 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const r = (await c.query('select * from compta.retenues where id = $1 for update', [req.params.id])).rows[0];
    if (!r) return erreur(reply, 404, 'introuvable', 'Retenue introuvable.');
    if (r.sens !== 'subie' || r.statut !== 'valide') return erreur(reply, 400, 'non_applicable', 'Seule une retenue subie valide attend un certificat du client.');
    await c.query('update compta.retenues set certificat_recu = true, certificat_ref = $2, maj_le = now(), maj_par = $3 where id = $1', [r.id, req.body.reference.trim(), req.utilisateur.id]);
    await S.auditer(c, req, 'certificat_ras_recu', { entite: 'retenue', entiteId: r.id, apres: { client: r.tiers_nom, reference: req.body.reference.trim(), montant: Number(r.montant) } });
    return { ok: true };
  }));

  app.get('/api/compta/plan', { preHandler: exige('compta_generale.plan', 'lire') }, async () => (await pool.query('select cle, libelle, compte, ordre from compta.plan order by ordre')).rows);
  app.put('/api/compta/plan/:cle', {
    preHandler: exige('compta_generale.plan', 'modifier'),
    schema: { params: { type: 'object', properties: { cle: { type: 'string', maxLength: 40 } } }, body: { type: 'object', additionalProperties: false, required: ['compte'], properties: { compte: { type: 'string', pattern: '^[0-9]{1,10}$' } } } },
  }, async (req, reply) => transaction(async (c) => {
    const av = (await c.query('select * from compta.plan where cle = $1 for update', [req.params.cle])).rows[0];
    if (!av) return erreur(reply, 404, 'introuvable', 'Compte inconnu.');
    await c.query('update compta.plan set compte = $2, maj_le = now(), maj_par = $3 where cle = $1', [av.cle, req.body.compte, req.utilisateur.id]);
    await S.auditer(c, req, 'plan_comptable_modifie', { entite: 'plan', entiteId: av.cle, avant: { compte: av.compte }, apres: { compte: req.body.compte } });
    return { ok: true };
  }));

  const periode = { type: 'object', properties: { du: { type: 'string', format: 'date' }, au: { type: 'string', format: 'date' }, format: { type: 'string', enum: ['csv', 'xlsx'] }, journal: { type: 'string', maxLength: 4 }, devise: { type: 'string', enum: DEVISES } } };
  const bornes = (q) => { const y = new Date().getFullYear(); return [q.du || `${y}-01-01`, q.au || `${y}-12-31`]; };

  app.get('/api/compta/ecritures', { preHandler: exige('compta_generale.journaux', 'lire', ['prix', 'achats']), schema: { querystring: periode } }, async (req) => {
    const [du, au] = bornes(req.query);
    const E = (await ecritures(pool, du, au)).filter((e) => !req.query.journal || e.journal === req.query.journal)
      .filter((e) => !req.query.devise || e.devise === req.query.devise); // 0.8.0 : journal local DT ou en devise
    const bal = {};
    for (const e of E) for (const l of e.lignes) { const k = l.compte + '|' + l.devise; const b = bal[k] ||= { compte: l.compte, devise: l.devise, debit: 0, credit: 0 }; b.debit = r3(b.debit + l.debit); b.credit = r3(b.credit + l.credit); }
    const desequilibres = E.filter((e) => Math.abs(r3(e.lignes.reduce((s, l) => s + l.debit - l.credit, 0))) > 0.0005).map((e) => e.piece);
    return { du, au, ecritures: E, balance: Object.values(bal).sort((a, b) => a.compte.localeCompare(b.compte) || a.devise.localeCompare(b.devise)).map((b) => ({ ...b, solde: r3(b.debit - b.credit) })), desequilibres };
  });

  // ---------- exports au choix CSV / Excel ----------
  const exportJournaux = async (req, reply) => {
    const [du, au] = bornes(req.query);
    const E = (await ecritures(pool, du, au)).filter((e) => !req.query.devise || e.devise === req.query.devise);
    const lib = { VE: 'Ventes', AC: 'Achats', BQ: 'Banque', CA: 'Caisse' };
    const lignes = [['Journal', 'Date', 'Pièce', 'Compte', 'Tiers', 'Libellé', 'Débit', 'Crédit', 'Devise']];
    for (const e of E) for (const l of e.lignes) lignes.push([e.journal, e.date, e.piece, l.compte, l.tiers || '', e.libelle, l.debit || 0, l.credit || 0, l.devise]);
    const bal = {}; for (const e of E) for (const l of e.lignes) { const k = l.compte + '|' + l.devise; const b = bal[k] ||= [l.compte, l.devise, 0, 0]; b[2] = r3(b[2] + l.debit); b[3] = r3(b[3] + l.credit); }
    const balance = [['Compte', 'Devise', 'Total débit', 'Total crédit', 'Solde'], ...Object.values(bal).sort((a, b) => a[0].localeCompare(b[0])).map((b) => [...b, r3(b[2] - b[3])])];
    await S.auditer(pool, req, 'export_comptable', { entite: 'export', entiteId: 'journaux', details: { du, au, format: req.query.format || 'xlsx', ecritures: E.length } });
    const feuilles = req.query.format === 'csv' ? [{ nom: 'Écritures', lignes }] : [{ nom: 'Écritures', lignes }, { nom: 'Balance', lignes: balance }, ...Object.entries(lib).map(([j, n]) => ({ nom: 'Journal ' + n, lignes: [lignes[0], ...lignes.slice(1).filter((l) => l[0] === j)] }))];
    return envoyerTableau(reply, `ecritures-${du}-${au}`, req.query.format, feuilles);
  };
  app.get('/api/compta/export/journaux', { preHandler: exige('compta_generale.journaux', 'exporter', ['prix', 'achats']), schema: { querystring: periode } }, exportJournaux);

  // Tableau de bord (0.8.0) : totaux séparés par devise (local DT, export EUR, export USD)
  app.get('/api/compta/tableau-de-bord', { preHandler: exige('compta_generale.journaux', 'lire', ['prix', 'achats']), schema: { querystring: periode } }, async (req) => {
    const [du, au] = bornes(req.query);
    const ventes = {};
    for (const f of (await facturesClients(pool)).filter((x) => x.status !== 'annulee' && x.date >= du && x.date <= au)) {
      const d = devise(f), e = etatFacture(f);
      const v = ventes[d] ||= { devise: d, factures: 0, ht: 0, tva: 0, net: 0, regle: 0, reste: 0 };
      v.factures++; v.ht = r3(v.ht + e.t.ht); v.tva = r3(v.tva + e.t.tva); v.net = r3(v.net + e.t.net);
      v.regle = r3(v.regle + e.regle); v.reste = r3(v.reste + e.reste);
    }
    const achats = {};
    const ff = (await pool.query(`select devise, ht::float8 ht, tva::float8 tva, net::float8 net, statut from compta.factures_fournisseurs
      where date between $1 and $2`, [du, au])).rows;
    for (const f of ff.filter((x) => x.statut !== 'annulee')) {
      const a = achats[f.devise] ||= { devise: f.devise, factures: 0, ht: 0, tva: 0, net: 0 };
      a.factures++; a.ht = r3(a.ht + f.ht); a.tva = r3(a.tva + f.tva); a.net = r3(a.net + f.net);
    }
    return { du, au, ventes: Object.values(ventes).sort((a, b) => a.devise.localeCompare(b.devise)),
      achats: Object.values(achats).sort((a, b) => a.devise.localeCompare(b.devise)) };
  });

  app.get('/api/compta/export/ventes', { preHandler: exige('compta_clients.exports', 'exporter', ['prix']), schema: { querystring: periode } }, async (req, reply) => {
    const [du, au] = bornes(req.query);
    const L = [['Date', 'Facture', 'Client', 'MF client', 'Devise', 'Total HT', 'Taux TVA (%)', 'TVA', 'Timbre', 'Net à payer', 'Réglé', 'Reste', 'Échéance', 'Export', 'État']];
    for (const f of (await facturesClients(pool)).filter((x) => x.date >= du && x.date <= au).sort((a, b) => (a.number || '').localeCompare(b.number || ''))) {
      const e = etatFacture(f);
      L.push([f.date, f.number, f.client?.name || '', f.client?.mf || '', devise(f), e.t.ht, +f.tva || 0, e.t.tva, e.t.timbre, e.t.net, f.status === 'annulee' ? 0 : e.regle, f.status === 'annulee' ? 0 : e.reste, f.due || '', f.export ? 'oui' : 'non', f.status === 'annulee' ? 'annulée' : 'émise']);
    }
    await S.auditer(pool, req, 'export_comptable', { entite: 'export', entiteId: 'ventes', details: { du, au, format: req.query.format || 'xlsx', lignes: L.length - 1 } });
    return envoyerTableau(reply, `journal-ventes-${du}-${au}`, req.query.format, [{ nom: 'Journal des ventes', lignes: L }]);
  });

  app.get('/api/compta/export/achats', { preHandler: exige('compta_fournisseurs.exports', 'exporter', ['achats']), schema: { querystring: periode } }, async (req, reply) => {
    const [du, au] = bornes(req.query);
    const r = (await pool.query(`select f.numero, to_char(f.date, 'YYYY-MM-DD') d, f.reference, f.fournisseur_nom, f.fournisseur_mf, f.devise, f.categorie, f.ht::float8 ht, f.tva::float8 tva, f.timbre::float8 timbre,
        f.net::float8 net, to_char(f.echeance, 'YYYY-MM-DD') e, f.statut from compta.factures_fournisseurs f where f.date between $1 and $2 order by f.date, f.id`, [du, au])).rows;
    const L = [['Date', 'N° interne', 'N° fournisseur', 'Fournisseur', 'MF fournisseur', 'Devise', 'Catégorie', 'Total HT', 'TVA', 'Timbre', 'Net', 'Échéance', 'État'],
      ...r.map((x) => [x.d, x.numero, x.reference, x.fournisseur_nom, x.fournisseur_mf, x.devise, x.categorie, x.ht, x.tva, x.timbre, x.net, x.e || '', { saisie: 'saisie', validee: 'validée', annulee: 'annulée' }[x.statut]])];
    await S.auditer(pool, req, 'export_comptable', { entite: 'export', entiteId: 'achats', details: { du, au, format: req.query.format || 'xlsx', lignes: L.length - 1 } });
    return envoyerTableau(reply, `journal-achats-${du}-${au}`, req.query.format, [{ nom: 'Journal des achats', lignes: L }]);
  });

  app.get('/api/compta/export/retenues', { preHandler: exige('compta_generale.retenues', 'exporter', ['prix', 'achats']), schema: { querystring: periode } }, async (req, reply) => {
    const [du, au] = bornes(req.query);
    const r = (await pool.query(`select sens, numero, to_char(date, 'YYYY-MM-DD') d, tiers_nom, tiers_mf, document, nature, base::float8 base, taux::float8 taux, montant::float8 montant, devise, certificat_recu, certificat_ref, statut
      from compta.retenues where date between $1 and $2 order by sens, date, id`, [du, au])).rows;
    const t = ['Date', 'Certificat', 'Tiers', 'Matricule fiscal', 'Facture(s)', 'Nature', 'Base (TTC)', 'Taux (%)', 'Montant retenu', 'Devise', 'État'];
    const op = r.filter((x) => x.sens === 'operee').map((x) => [x.d, x.numero || '', x.tiers_nom, x.tiers_mf, x.document, x.nature, x.base, x.taux, x.montant, x.devise, x.statut === 'annule' ? 'annulée' : 'valide']);
    const su = r.filter((x) => x.sens === 'subie').map((x) => [x.d, x.certificat_recu ? x.certificat_ref : 'à réclamer', x.tiers_nom, x.tiers_mf, x.document, x.nature, x.base, x.taux, x.montant, x.devise, x.statut === 'annule' ? 'annulée' : 'valide']);
    await S.auditer(pool, req, 'export_comptable', { entite: 'export', entiteId: 'retenues', details: { du, au, format: req.query.format || 'xlsx', lignes: r.length } });
    return envoyerTableau(reply, `retenues-a-la-source-${du}-${au}`, req.query.format, [{ nom: 'Retenues opérées', lignes: [t, ...op] }, { nom: 'Retenues subies', lignes: [t, ...su] }]);
  });

  app.get('/api/compta/export/balance-clients', { preHandler: exige('compta_clients.comptes', 'exporter', ['prix', 'encours']), schema: { querystring: periode } }, async (req, reply) => {
    const auj = jour(); const par = {};
    for (const f of (await facturesClients(pool)).filter((x) => x.status !== 'annulee')) {
      const e = etatFacture(f); const k = (f.client?.id || f.client?.name) + '|' + devise(f);
      const p = par[k] ||= [f.client?.name || '', f.client?.mf || '', devise(f), 0, 0, 0, 0, 0, 0, 0, 0, 0];
      p[3]++; p[4] = r3(p[4] + e.t.net); p[5] = r3(p[5] + Math.min(e.regle, e.t.net)); p[6] = r3(p[6] + e.reste);
      if (e.reste > 0.0005) { const j = Math.round((new Date(auj) - new Date(f.due || f.date)) / 86400000); const i = j <= 0 ? 7 : j <= 30 ? 8 : j <= 60 ? 9 : j <= 90 ? 10 : 11; p[i] = r3(p[i] + e.reste); }
    }
    const L = [['Client', 'MF', 'Devise', 'Factures', 'Facturé', 'Réglé', 'Reste dû', 'Non échu', '1–30 j', '31–60 j', '61–90 j', '+ 90 j'], ...Object.values(par).sort((a, b) => b[6] - a[6])];
    await S.auditer(pool, req, 'export_comptable', { entite: 'export', entiteId: 'balance_clients', details: { format: req.query.format || 'xlsx' } });
    return envoyerTableau(reply, `balance-agee-clients-${auj}`, req.query.format, [{ nom: 'Balance âgée clients', lignes: L }]);
  });

  app.get('/api/compta/export/balance-fournisseurs', { preHandler: exige('compta_fournisseurs.exports', 'exporter', ['achats']), schema: { querystring: periode } }, async (req, reply) => {
    const L = [['Fournisseur', 'Devise', 'Factures', 'Facturé', 'Réglé', 'Reste dû', 'Non échu', '1–30 j', '31–60 j', '61–90 j', '+ 90 j'],
      ...(await comptesFournisseurs(pool)).map((p) => [p.nom, p.devise, p.factures, p.facture, p.regle, p.reste, p.non_echu, p.t30, p.t60, p.t90, p.t90p])];
    await S.auditer(pool, req, 'export_comptable', { entite: 'export', entiteId: 'balance_fournisseurs', details: { format: req.query.format || 'xlsx' } });
    return envoyerTableau(reply, `balance-agee-fournisseurs-${jour()}`, req.query.format, [{ nom: 'Balance âgée fournisseurs', lignes: L }]);
  });

  // Valorisation (CMUP) : prête pour les mouvements de stock du lot 6 ; calcule dès maintenant sur les factures d'achat validées
  app.get('/api/compta/valorisation', { preHandler: exige('compta_generale.valorisation', 'lire', ['couts']) }, async () => {
    const r = (await pool.query(`select f.id, to_char(f.date, 'YYYY-MM-DD') d, f.devise, l
      from compta.factures_fournisseurs f, jsonb_array_elements(f.lignes) l where f.statut = 'validee' and f.categorie = 'achats' order by f.date, f.id`)).rows;
    const par = {};
    for (const x of r) { const k = String(x.l.designation).trim().toLowerCase() + '|' + x.devise; (par[k] ||= { designation: String(x.l.designation).trim(), devise: x.devise, mvts: [] }).mvts.push({ qte: +x.l.qte, pu: +x.l.pu_ht, date: x.d }); }
    return { methode: 'CMUP', explication: 'Coût moyen unitaire pondéré recalculé après chaque entrée (norme comptable tunisienne NC 04). Les sorties vers la production seront valorisées à ce coût au lot 6.',
      articles: Object.values(par).map((a) => ({ designation: a.designation, devise: a.devise, entrees: a.mvts.length, ...C.cmup(a.mvts), derniere_entree: a.mvts[a.mvts.length - 1].date })).sort((a, b) => a.designation.localeCompare(b.designation, 'fr')) };
  });
};
