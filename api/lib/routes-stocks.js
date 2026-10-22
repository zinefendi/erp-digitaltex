'use strict';
// Stocks (lot 0.10.0) — module 8 (matières premières) et module 9 (produits finis).
// Valeurs (coûts, valorisation FIFO) envoyées seulement avec la visibilité « couts » (CDC § 5.2) ;
// le magasin voit les quantités, jamais les valeurs. Chaque mouvement est tracé dans l'audit.
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');
const X = require('./xlsx');
const ST = require('./stocks');
const { r3 } = require('./calculs');

const erreur = (reply, code, err, message) => reply.code(code).send({ erreur: err, message });
const exige = (f, a) => S.exigerConnexion({ droit: [f, a] });
const numero = (c, type, date) => c.query('select parametres.attribuer_numero($1, $2::date) n', [type, date]).then((r) => r.rows[0].n);
const jour = () => new Date().toISOString().slice(0, 10);
const txt = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const CH_VAL = ['valeur', 'cout_unitaire', 'cout_moyen', 'pri', 'valeur_ecart'];
/** Retire les valeurs sans la visibilité « couts » (quantités toujours visibles). */
const sansValeurs = (eff, x) => {
  if (D.voit(eff, 'couts')) return x;
  const f = (o) => { const y = { ...o }; for (const k of CH_VAL) delete y[k]; return y; };
  return Array.isArray(x) ? x.map(f) : f(x);
};
// erreurs métier du moteur (lib/stocks.js) → réponse claire
const capte = (reply) => (e) => { if (e.statusCode && e.code) return erreur(reply, e.statusCode, e.code, e.message); throw e; };

function exporter(reply, format, nom, lignes) {
  if (format === 'csv') {
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${nom}.csv"`);
    return reply.send(X.csv(lignes));
  }
  reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition', `attachment; filename="${nom}.xlsx"`);
  return reply.send(X.classeur([{ nom, lignes }]));
}
const schFormat = { type: 'object', properties: { format: { type: 'string', enum: ['csv', 'xlsx'] }, article_id: { type: 'integer' }, produit_id: { type: 'integer' }, du: { type: 'string', format: 'date' }, au: { type: 'string', format: 'date' } } };

module.exports = async function routesStocks(app) {
  app.get('/api/stocks/parametres', { preHandler: S.exigerConnexion() }, async () => {
    const r = (await pool.query(`select distinct on (code) code, valeur, commentaire from parametres.stocks where en_vigueur_le <= current_date order by code, en_vigueur_le desc`)).rows;
    return Object.fromEntries(r.map((x) => [x.code, { valeur: x.valeur, commentaire: x.commentaire }]));
  });

  // ================================================================ MATIÈRES PREMIÈRES
  app.get('/api/stocks/mp/etat', { preHandler: exige('stock_mp.articles', 'lire'), schema: { querystring: schFormat } }, async (req, reply) => {
    const L = sansValeurs(req.droits, await ST.etatMP(pool));
    if (!req.query.format) return L;
    if (!D.peut(req.droits, 'stock_mp.articles', 'exporter')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas d’exporter.');
    const v = D.voit(req.droits, 'couts');
    return exporter(reply, req.query.format, `stock-matieres-${jour()}`, [
      ['Code', 'Désignation', 'Famille', 'Unité', 'Physique', 'Réservé', 'Disponible', 'Seuil mini', 'Alerte', 'Lots / rouleaux', ...(v ? ['Valeur FIFO (DT)', 'Coût moyen (DT)'] : [])],
      ...L.filter((a) => a.actif || a.physique).map((a) => [a.code, a.designation, a.famille, a.unite, a.physique, a.reserve, a.disponible, a.seuil_min ?? '', a.alerte ? 'oui' : '', a.lots, ...(v ? [a.valeur, a.cout_moyen] : [])])]);
  });
  app.get('/api/stocks/mp/alertes', { preHandler: exige('stock_mp.articles', 'lire') }, async (req) =>
    sansValeurs(req.droits, (await ST.etatMP(pool)).filter((a) => a.actif && a.alerte)));

  app.get('/api/stocks/mp/articles/:id/lots', { preHandler: exige('stock_mp.articles', 'lire'), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req) => {
    const r = await pool.query(`select l.id, l.n_lot, l.bain, l.rouleau, to_char(l.date_entree, 'YYYY-MM-DD') date_entree, l.qte_initiale::float8 qte_initiale,
        l.qte_restante::float8 qte_restante, l.cout_unitaire::float8 cout_unitaire, l.emplacement, r.numero reception, r.fournisseur
      from stocks.lots_mp l left join stocks.receptions_mp r on r.id = l.reception_id
      where l.article_id = $1 and l.qte_restante > 0 order by l.date_entree, l.id`, [req.params.id]);
    return sansValeurs(req.droits, r.rows.map((x) => ({ ...x, id: Number(x.id), valeur: r3(x.qte_restante * x.cout_unitaire) })));
  });

  // ---------------- réceptions (lots et rouleaux)
  app.get('/api/stocks/mp/receptions', { preHandler: exige('stock_mp.entrees', 'lire') }, async (req) => {
    const r = await pool.query(`select r.id, r.numero, to_char(r.date, 'YYYY-MM-DD') date, r.fournisseur, r.ref_fournisseur, r.note, r.statut, r.motif, u.identifiant cree_par,
        coalesce(json_agg(json_build_object('lot_id', l.id, 'article_id', l.article_id, 'designation', f.donnees->>'designation', 'unite', f.donnees->>'unite',
          'n_lot', l.n_lot, 'bain', l.bain, 'rouleau', l.rouleau, 'qte', l.qte_initiale::float8, 'qte_restante', l.qte_restante::float8,
          'cout_unitaire', l.cout_unitaire::float8, 'emplacement', l.emplacement) order by l.id) filter (where l.id is not null), '[]') lignes
      from stocks.receptions_mp r left join stocks.lots_mp l on l.reception_id = r.id and l.origine_lot is null
      left join registres.fiches f on f.id = l.article_id left join noyau.utilisateurs u on u.id = r.cree_par
      group by r.id, u.identifiant order by r.date desc, r.id desc limit 500`);
    const v = D.voit(req.droits, 'couts');
    return r.rows.map((x) => ({ ...x, id: Number(x.id), lignes: v ? x.lignes.map((l) => ({ ...l, valeur: r3(l.qte * l.cout_unitaire) })) : x.lignes.map(({ cout_unitaire, ...l }) => l),
      ...(v ? { valeur: r3(x.lignes.reduce((s, l) => s + l.qte * l.cout_unitaire, 0)) } : {}) }));
  });

  app.post('/api/stocks/mp/receptions', {
    preHandler: exige('stock_mp.entrees', 'creer'),
    schema: { body: { type: 'object', required: ['lignes'], additionalProperties: false, properties: {
      date: { type: 'string', format: 'date' }, fournisseur: { type: 'string', maxLength: 200 }, ref_fournisseur: { type: 'string', maxLength: 80 }, note: { type: 'string', maxLength: 500 },
      lignes: { type: 'array', minItems: 1, maxItems: 300, items: { type: 'object', required: ['article_id', 'qte'], additionalProperties: false, properties: {
        article_id: { type: 'integer' }, qte: { type: 'number', exclusiveMinimum: 0, maximum: 1e7 }, cout_unitaire: { type: 'number', minimum: 0, maximum: 1e7 },
        n_lot: { type: 'string', maxLength: 60 }, bain: { type: 'string', maxLength: 60 }, rouleau: { type: 'string', maxLength: 60 }, emplacement: { type: 'string', maxLength: 80 } } } } } } },
  }, async (req, reply) => {
    const b = req.body, date = b.date || jour();
    // le coût d'achat se saisit avec le droit de voir les prix d'achat ; sinon prix d'achat de la fiche article
    const coutSaisi = D.voit(req.droits, 'achats') || D.voit(req.droits, 'couts');
    return transaction(async (c) => {
      const fiches = {};
      for (const [i, l] of b.lignes.entries()) {
        const f = fiches[l.article_id] ||= await ST.ficheMP(c, l.article_id);
        if (!f.actif) throw ST.leve('article_inactif', `Ligne ${i + 1} : l’article « ${f.designation} » est désactivé.`);
        if (ST.estTissu(f) && !txt(l.n_lot) && !txt(l.rouleau)) throw ST.leve('rouleau_requis', `Ligne ${i + 1} : « ${f.designation} » est un tissu : indiquez le n° de lot ou de rouleau (une ligne par rouleau).`);
      }
      const num = await numero(c, 'reception_mp', date);
      const rec = (await c.query(`insert into stocks.receptions_mp (numero, date, fournisseur, ref_fournisseur, note, cree_par) values ($1,$2,$3,$4,$5,$6) returning id`,
        [num, date, txt(b.fournisseur), txt(b.ref_fournisseur, 80), txt(b.note, 500), req.utilisateur.id])).rows[0];
      const lots = [];
      for (const l of b.lignes) {
        const f = fiches[l.article_id];
        const cu = coutSaisi && l.cout_unitaire !== undefined ? l.cout_unitaire : (Number(f.prix_achat) || 0);
        lots.push(await ST.entreeLot(c, req.utilisateur, { article_id: l.article_id, qte: l.qte, cout_unitaire: cu, n_lot: txt(l.n_lot, 60), bain: txt(l.bain, 60), rouleau: txt(l.rouleau, 60),
          emplacement: txt(l.emplacement || f.emplacement, 80), reception_id: rec.id, date, type: 'reception', ref_doc: num, motif: txt(b.fournisseur) }));
      }
      await S.auditer(c, req, 'reception_mp_creee', { entite: 'reception_mp', entiteId: num, apres: { fournisseur: txt(b.fournisseur), lignes: b.lignes.map((l) => ({ article: fiches[l.article_id].designation, qte: l.qte, lot: l.n_lot || '', rouleau: l.rouleau || '' })) } });
      reply.code(201); return { id: Number(rec.id), numero: num, lots };
    }).catch(capte(reply));
  });

  // Annulation : seulement si rien n'est encore sorti des lots de la réception
  app.post('/api/stocks/mp/receptions/:id/annuler', {
    preHandler: exige('stock_mp.entrees', 'annuler'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', required: ['motif'], properties: { motif: { type: 'string', minLength: 3, maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const r = (await c.query('select * from stocks.receptions_mp where id = $1 for update', [req.params.id])).rows[0];
    if (!r) return erreur(reply, 404, 'introuvable', 'Réception introuvable.');
    if (r.statut === 'annulee') return erreur(reply, 400, 'deja_annulee', 'Cette réception est déjà annulée.');
    const lots = (await c.query('select id, article_id, qte_initiale::float8 qi, qte_restante::float8 qr, cout_unitaire::float8 cu, emplacement from stocks.lots_mp where reception_id = $1 for update', [r.id])).rows;
    const entame = (await c.query(`select 1 from stocks.mouvements_mp where lot_id = any($1) and type <> 'reception' and not (type = 'transfert' and qte = 0) limit 1`, [lots.map((l) => l.id)])).rowCount;
    if (entame) return erreur(reply, 400, 'reception_entamee', 'Des matières de cette réception ont déjà bougé (sortie, transfert, inventaire) : corrigez par un ajustement de stock.');
    for (const l of lots) {
      await c.query('update stocks.lots_mp set qte_restante = 0 where id = $1', [l.id]);
      await c.query(`insert into stocks.mouvements_mp (type, article_id, lot_id, qte, cout_unitaire, valeur, motif, ref_doc, emplacement, utilisateur) values ('annulation',$1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [l.article_id, l.id, -l.qr, l.cu, -r3(l.qr * l.cu), req.body.motif, r.numero, l.emplacement, req.utilisateur.id]);
    }
    await c.query(`update stocks.receptions_mp set statut = 'annulee', motif = $2 where id = $1`, [r.id, req.body.motif]);
    await S.auditer(c, req, 'reception_mp_annulee', { entite: 'reception_mp', entiteId: r.numero, details: { motif: req.body.motif } });
    return { ok: true };
  }));

  // ---------------- mouvements (sortie, retour, transfert, ajustement)
  app.get('/api/stocks/mp/mouvements', { preHandler: exige('stock_mp.entrees', 'lire'), schema: { querystring: schFormat } }, async (req, reply) => {
    const q = req.query, w = [], p = [];
    if (q.article_id) { p.push(q.article_id); w.push(`m.article_id = $${p.length}`); }
    if (q.du) { p.push(q.du); w.push(`m.date >= $${p.length}`); }
    if (q.au) { p.push(q.au); w.push(`m.date <= $${p.length}`); }
    const r = await pool.query(`select m.id, to_char(m.date, 'YYYY-MM-DD') date, m.type, m.article_id, f.donnees->>'designation' designation, f.donnees->>'unite' unite,
        m.lot_id, l.n_lot, l.rouleau, l.bain, m.qte::float8 qte, m.cout_unitaire::float8 cout_unitaire, m.valeur::float8 valeur, m.motif, m.ref_doc, m.emplacement, m.horodatage, u.identifiant utilisateur
      from stocks.mouvements_mp m join registres.fiches f on f.id = m.article_id left join stocks.lots_mp l on l.id = m.lot_id left join noyau.utilisateurs u on u.id = m.utilisateur
      ${w.length ? 'where ' + w.join(' and ') : ''} order by m.horodatage desc, m.id desc limit 2000`, p);
    const L = sansValeurs(req.droits, r.rows.map((x) => ({ ...x, id: Number(x.id), article_id: Number(x.article_id), lot_id: x.lot_id && Number(x.lot_id) })));
    if (!q.format) return L;
    if (!D.peut(req.droits, 'stock_mp.entrees', 'exporter')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas d’exporter.');
    const v = D.voit(req.droits, 'couts');
    return exporter(reply, q.format, `mouvements-matieres-${jour()}`, [['Date', 'Type', 'Article', 'Lot', 'Rouleau', 'Bain', 'Quantité', 'Unité', ...(v ? ['Coût unitaire', 'Valeur'] : []), 'Motif', 'Document', 'Emplacement', 'Utilisateur'],
      ...L.map((m) => [m.date, m.type, m.designation, m.n_lot || '', m.rouleau || '', m.bain || '', m.qte, m.unite, ...(v ? [m.cout_unitaire, m.valeur] : []), m.motif, m.ref_doc, m.emplacement, m.utilisateur || ''])]);
  });

  const DROIT_MVT_MP = { sortie: ['stock_mp.sorties', 'creer'], retour: ['stock_mp.sorties', 'creer'], transfert: ['stock_mp.entrees', 'modifier'], ajustement: ['stock_mp.entrees', 'valider'] };
  app.post('/api/stocks/mp/mouvements', {
    preHandler: S.exigerConnexion(),
    schema: { body: { type: 'object', required: ['type', 'article_id'], additionalProperties: false, properties: {
      type: { type: 'string', enum: Object.keys(DROIT_MVT_MP) }, article_id: { type: 'integer' }, lot_id: { type: 'integer' },
      qte: { type: 'number', minimum: -1e7, maximum: 1e7 }, emplacement: { type: 'string', maxLength: 80 }, motif: { type: 'string', maxLength: 300 }, ref_doc: { type: 'string', maxLength: 60 } } } },
  }, async (req, reply) => {
    const b = req.body;
    if (!D.peut(req.droits, ...DROIT_MVT_MP[b.type])) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas ce mouvement de stock.');
    if (b.type === 'ajustement' && txt(b.motif).length < 3) return erreur(reply, 400, 'motif_requis', 'Un ajustement de stock doit être justifié (motif).');
    if (['retour', 'transfert'].includes(b.type) && !b.lot_id) return erreur(reply, 400, 'lot_requis', 'Choisissez le lot / rouleau concerné.');
    return transaction(async (c) => {
      const f = await ST.ficheMP(c, b.article_id);
      if (b.lot_id) {
        const l = (await c.query('select article_id from stocks.lots_mp where id = $1', [b.lot_id])).rows[0];
        if (!l || Number(l.article_id) !== b.article_id) throw ST.leve('lot_invalide', 'Ce lot / rouleau n’appartient pas à cet article.');
      }
      let res;
      const motif = txt(b.motif, 300), ref_doc = txt(b.ref_doc, 60);
      if (b.type === 'sortie') res = await ST.sortieMP(c, req.utilisateur, { article_id: b.article_id, lot_id: b.lot_id || null, qte: b.qte, type: 'sortie', motif, ref_doc });
      else if (b.type === 'retour') res = await ST.retourLot(c, req.utilisateur, { lot_id: b.lot_id, qte: b.qte, type: 'retour', motif, ref_doc });
      else if (b.type === 'transfert') res = { lot_id: await ST.transfertLot(c, req.utilisateur, { lot_id: b.lot_id, qte: b.qte, emplacement: b.emplacement, motif }) };
      else if (b.qte > 0) res = b.lot_id ? await ST.retourLot(c, req.utilisateur, { lot_id: b.lot_id, qte: b.qte, type: 'ajustement', motif, ref_doc })
        : { lot_id: await ST.entreeLot(c, req.utilisateur, { article_id: b.article_id, qte: b.qte, cout_unitaire: Number(f.prix_achat) || 0, type: 'ajustement', motif, ref_doc, emplacement: txt(b.emplacement || f.emplacement, 80) }) };
      else if (b.qte < 0) res = await ST.sortieMP(c, req.utilisateur, { article_id: b.article_id, lot_id: b.lot_id || null, qte: -b.qte, type: 'ajustement', motif, ref_doc });
      else throw ST.leve('qte_invalide', 'La quantité de l’ajustement ne peut pas être 0.');
      await S.auditer(c, req, 'mouvement_mp', { entite: 'article_mp', entiteId: b.article_id, details: { type: b.type, article: f.designation, lot_id: b.lot_id || null, qte: b.qte ?? null, emplacement: b.emplacement || null, motif } });
      reply.code(201); return sansValeurs(req.droits, { ok: true, ...res });
    }).catch(capte(reply));
  });

  // ================================================================ PRODUITS FINIS
  app.get('/api/stocks/pf/etat', { preHandler: exige('stock_pf.stock', 'lire'), schema: { querystring: schFormat } }, async (req, reply) => {
    const L = sansValeurs(req.droits, await ST.etatPF(pool));
    if (!req.query.format) return L;
    if (!D.peut(req.droits, 'stock_pf.stock', 'exporter')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas d’exporter.');
    const v = D.voit(req.droits, 'couts');
    return exporter(reply, req.query.format, `stock-produits-finis-${jour()}`, [['Référence', 'Article', 'Client', 'Taille', 'Couleur', 'Quantité', 'Emplacement', ...(v ? ['Valeur FIFO (DT)'] : [])],
      ...L.map((s) => [s.reference, s.article || s.code_article, s.client_nom, s.taille, s.couleur, s.qte, s.emplacement, ...(v ? [s.valeur] : [])])]);
  });

  app.get('/api/stocks/pf/mouvements', { preHandler: exige('stock_pf.stock', 'lire'), schema: { querystring: schFormat } }, async (req, reply) => {
    const q = req.query, w = [], p = [];
    if (q.produit_id) { p.push(q.produit_id); w.push(`m.produit_id = $${p.length}`); }
    if (q.du) { p.push(q.du); w.push(`m.date >= $${p.length}`); }
    if (q.au) { p.push(q.au); w.push(`m.date <= $${p.length}`); }
    const r = await pool.query(`select m.id, to_char(m.date, 'YYYY-MM-DD') date, m.type, m.produit_id, p.reference, m.taille, m.couleur, m.qte::float8 qte, m.valeur::float8 valeur,
        m.motif, m.ref_num, m.alerte_negatif, m.horodatage, u.identifiant utilisateur
      from stocks.mouvements_pf m join pf.produits p on p.id = m.produit_id left join noyau.utilisateurs u on u.id = m.utilisateur
      ${w.length ? 'where ' + w.join(' and ') : ''} order by m.horodatage desc, m.id desc limit 2000`, p);
    const L = sansValeurs(req.droits, r.rows.map((x) => ({ ...x, id: Number(x.id), produit_id: Number(x.produit_id) })));
    if (!q.format) return L;
    if (!D.peut(req.droits, 'stock_pf.stock', 'exporter')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas d’exporter.');
    const v = D.voit(req.droits, 'couts');
    return exporter(reply, q.format, `mouvements-produits-finis-${jour()}`, [['Date', 'Type', 'Référence', 'Taille', 'Couleur', 'Quantité', ...(v ? ['Valeur'] : []), 'Motif', 'Document', 'Stock négatif', 'Utilisateur'],
      ...L.map((m) => [m.date, m.type, m.reference, m.taille, m.couleur, m.qte, ...(v ? [m.valeur] : []), m.motif, m.ref_num, m.alerte_negatif ? 'oui' : '', m.utilisateur || ''])]);
  });

  const DROIT_MVT_PF = { entree_manuelle: ['stock_pf.entrees', 'creer'], retour_client: ['stock_pf.entrees', 'creer'], sortie: ['stock_pf.sorties', 'creer'], ajustement: ['stock_pf.stock', 'modifier'] };
  app.post('/api/stocks/pf/mouvements', {
    preHandler: S.exigerConnexion(),
    schema: { body: { type: 'object', required: ['type', 'qte'], additionalProperties: false, properties: {
      type: { type: 'string', enum: Object.keys(DROIT_MVT_PF) }, produit_id: { type: 'integer' }, reference: { type: 'string', maxLength: 30 },
      taille: { type: 'string', maxLength: 30 }, couleur: { type: 'string', maxLength: 60 }, qte: { type: 'number', minimum: -1e7, maximum: 1e7 },
      emplacement: { type: 'string', maxLength: 80 }, motif: { type: 'string', maxLength: 300 } } } },
  }, async (req, reply) => {
    const b = req.body;
    if (!D.peut(req.droits, ...DROIT_MVT_PF[b.type])) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas ce mouvement de stock.');
    if (['ajustement', 'retour_client'].includes(b.type) && txt(b.motif).length < 3) return erreur(reply, 400, 'motif_requis', b.type === 'ajustement' ? 'Un ajustement de stock doit être justifié (motif).' : 'Indiquez le client et la raison du retour (motif).');
    if (b.type !== 'ajustement' && !(b.qte > 0)) return erreur(reply, 400, 'qte_invalide', 'La quantité doit être supérieure à 0.');
    return transaction(async (c) => {
      const p = b.produit_id ? (await c.query('select id, reference, annule from pf.produits where id = $1', [b.produit_id])).rows[0]
        : (await c.query('select id, reference, annule from pf.produits where reference = $1', [txt(b.reference, 30).toUpperCase()])).rows[0];
      if (!p) throw ST.leve('produit_introuvable', 'Produit fini introuvable.', 404);
      const base = { produit_id: Number(p.id), taille: b.taille, couleur: b.couleur, motif: txt(b.motif, 300) };
      let res;
      if (b.type === 'sortie' || (b.type === 'ajustement' && b.qte < 0)) res = await ST.sortiePF(c, req.utilisateur, { ...base, qte: Math.abs(b.qte), type: b.type });
      else if (b.qte > 0) res = await ST.entreePF(c, req.utilisateur, { ...base, qte: b.qte, type: b.type });
      else throw ST.leve('qte_invalide', 'La quantité de l’ajustement ne peut pas être 0.');
      if (b.emplacement !== undefined) await c.query('update stocks.pf_stock set emplacement = $4 where produit_id = $1 and taille = $2 and couleur = $3', [p.id, txt(b.taille, 30), txt(b.couleur, 60), txt(b.emplacement, 80)]);
      await S.auditer(c, req, 'mouvement_pf', { entite: 'produit_fini', entiteId: p.reference, details: { type: b.type, taille: b.taille || '', couleur: b.couleur || '', qte: b.qte, motif: base.motif } });
      reply.code(201); return sansValeurs(req.droits, { ok: true, ...res });
    }).catch(capte(reply));
  });

  // ================================================================ INVENTAIRES (MP par lot / rouleau, PF par taille et couleur)
  const droitInv = (stock) => (stock === 'mp' ? 'stock_mp.inventaires' : 'stock_pf.inventaires');
  async function theoriques(c, stock, filtre = []) {
    if (stock === 'mp') {
      return (await c.query(`select l.id lot_id, l.article_id, f.donnees->>'designation' designation, f.donnees->>'unite' unite, l.n_lot, l.rouleau, l.bain, l.emplacement,
          l.qte_restante::float8 theorique from stocks.lots_mp l join registres.fiches f on f.id = l.article_id
        where l.qte_restante > 0 ${filtre.length ? 'and l.article_id = any($1)' : ''} order by lower(f.donnees->>'designation'), l.date_entree, l.id`, filtre.length ? [filtre] : [])).rows
        .map((x) => ({ ...x, lot_id: Number(x.lot_id), article_id: Number(x.article_id), compte: null, justification: '' }));
    }
    return (await c.query(`select s.produit_id, p.reference, s.taille, s.couleur, s.emplacement, s.qte::float8 theorique from stocks.pf_stock s join pf.produits p on p.id = s.produit_id
      where s.qte <> 0 ${filtre.length ? 'and s.produit_id = any($1)' : ''} order by p.reference, s.couleur, s.taille`, filtre.length ? [filtre] : [])).rows
      .map((x) => ({ ...x, produit_id: Number(x.produit_id), compte: null, justification: '' }));
  }
  const lireInv = async (db, id) => (await db.query(`select i.id, i.numero, i.stock, i.type, to_char(i.date, 'YYYY-MM-DD') date, i.note, i.statut, i.lignes, i.version, i.cree_le, i.valide_le,
      u.identifiant cree_par, v.identifiant valide_par from stocks.inventaires i left join noyau.utilisateurs u on u.id = i.cree_par left join noyau.utilisateurs v on v.id = i.valide_par where i.id = $1`, [id])).rows[0];

  app.get('/api/stocks/inventaires', { preHandler: S.exigerConnexion() }, async (req) => {
    const stocks = ['mp', 'pf'].filter((s) => D.peut(req.droits, droitInv(s), 'lire'));
    if (!stocks.length) return [];
    const r = await pool.query(`select i.id, i.numero, i.stock, i.type, to_char(i.date, 'YYYY-MM-DD') date, i.note, i.statut, jsonb_array_length(i.lignes) nb_lignes,
        (select count(*) from jsonb_array_elements(i.lignes) l where l->>'compte' is not null)::int nb_comptes, i.version, u.identifiant cree_par
      from stocks.inventaires i left join noyau.utilisateurs u on u.id = i.cree_par where i.stock = any($1) order by i.date desc, i.id desc limit 300`, [stocks]);
    return r.rows.map((x) => ({ ...x, id: Number(x.id) }));
  });
  app.get('/api/stocks/inventaires/:id', { preHandler: S.exigerConnexion(), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, async (req, reply) => {
    const i = await lireInv(pool, req.params.id);
    if (!i) return erreur(reply, 404, 'introuvable', 'Inventaire introuvable.');
    if (!D.peut(req.droits, droitInv(i.stock), 'lire')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de consulter cet inventaire.');
    return { ...i, id: Number(i.id), lignes: sansValeurs(req.droits, i.lignes) };
  });

  app.post('/api/stocks/inventaires', {
    preHandler: S.exigerConnexion(),
    schema: { body: { type: 'object', required: ['stock'], additionalProperties: false, properties: {
      stock: { type: 'string', enum: ['mp', 'pf'] }, type: { type: 'string', enum: ['periodique', 'tournant'] }, date: { type: 'string', format: 'date' },
      note: { type: 'string', maxLength: 500 }, filtre: { type: 'array', maxItems: 500, items: { type: 'integer' } } } } },
  }, async (req, reply) => {
    const b = req.body;
    if (!D.peut(req.droits, droitInv(b.stock), 'creer')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas d’ouvrir un inventaire.');
    if (b.type === 'tournant' && !(b.filtre || []).length) return erreur(reply, 400, 'filtre_requis', 'Un inventaire tournant porte sur une sélection d’articles ou de produits : choisissez-les.');
    return transaction(async (c) => {
      const date = b.date || jour();
      const lignes = await theoriques(c, b.stock, b.filtre || []);
      if (!lignes.length) throw ST.leve('rien_a_compter', 'Aucun stock à compter pour cette sélection.');
      const num = await numero(c, 'inventaire', date);
      const r = (await c.query(`insert into stocks.inventaires (numero, stock, type, date, note, lignes, cree_par) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [num, b.stock, b.type || 'periodique', date, txt(b.note, 500), JSON.stringify(lignes), req.utilisateur.id])).rows[0];
      await S.auditer(c, req, 'inventaire_ouvert', { entite: 'inventaire', entiteId: num, details: { stock: b.stock, type: b.type || 'periodique', lignes: lignes.length } });
      reply.code(201); return { id: Number(r.id), numero: num, lignes: lignes.length };
    }).catch(capte(reply));
  });

  // Saisie des quantités comptées (brouillon, contrôle de version)
  app.put('/api/stocks/inventaires/:id', {
    preHandler: S.exigerConnexion(),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', required: ['version', 'lignes'], additionalProperties: false, properties: {
      version: { type: 'integer' }, note: { type: 'string', maxLength: 500 },
      lignes: { type: 'array', maxItems: 5000, items: { type: 'object', required: ['index'], additionalProperties: false, properties: {
        index: { type: 'integer', minimum: 0 }, compte: { type: ['number', 'null'], minimum: 0, maximum: 1e7 }, justification: { type: 'string', maxLength: 300 } } } } } } },
  }, async (req, reply) => transaction(async (c) => {
    const i = (await c.query('select * from stocks.inventaires where id = $1 for update', [req.params.id])).rows[0];
    if (!i) return erreur(reply, 404, 'introuvable', 'Inventaire introuvable.');
    if (!D.peut(req.droits, droitInv(i.stock), 'modifier')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de saisir cet inventaire.');
    if (i.statut !== 'brouillon') return erreur(reply, 400, 'inventaire_clos', 'Cet inventaire est clos : il ne se modifie plus.');
    if (req.body.version !== i.version) return erreur(reply, 409, 'conflit_version', 'Inventaire modifié entre-temps sur un autre poste. Rechargez.');
    const L = i.lignes;
    for (const x of req.body.lignes) {
      if (!L[x.index]) return erreur(reply, 400, 'ligne_invalide', 'Ligne d’inventaire inconnue.');
      if (x.compte !== undefined) L[x.index].compte = x.compte === null ? null : r3(x.compte);
      if (x.justification !== undefined) L[x.index].justification = txt(x.justification, 300);
    }
    await c.query('update stocks.inventaires set lignes = $2, note = coalesce($3, note), version = version + 1 where id = $1', [i.id, JSON.stringify(L), req.body.note ?? null]);
    return { ok: true, version: i.version + 1 };
  }));

  // Validation : écart = compté − stock au moment de la validation ; chaque écart doit être justifié.
  app.post('/api/stocks/inventaires/:id/valider', {
    preHandler: S.exigerConnexion(),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } }, body: { type: 'object', required: ['version'], properties: { version: { type: 'integer' } } } },
  }, async (req, reply) => transaction(async (c) => {
    const i = (await c.query('select * from stocks.inventaires where id = $1 for update', [req.params.id])).rows[0];
    if (!i) return erreur(reply, 404, 'introuvable', 'Inventaire introuvable.');
    if (!D.peut(req.droits, droitInv(i.stock), 'valider')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de valider un inventaire.');
    if (i.statut !== 'brouillon') return erreur(reply, 400, 'inventaire_clos', 'Cet inventaire est déjà clos.');
    if (req.body.version !== i.version) return erreur(reply, 409, 'conflit_version', 'Inventaire modifié entre-temps sur un autre poste. Rechargez.');
    const L = i.lignes, manque = [], ecarts = [];
    const nonComptees = L.filter((l) => l.compte === null || l.compte === undefined).length;
    if (nonComptees) throw ST.leve('lignes_non_comptees', `${nonComptees} ligne(s) sans quantité comptée : saisissez-les (0 si rien n’a été trouvé).`);
    for (const [k, l] of L.entries()) {
      const actuel = i.stock === 'mp'
        ? Number((await c.query('select qte_restante from stocks.lots_mp where id = $1 for update', [l.lot_id])).rows[0]?.qte_restante || 0)
        : Number((await c.query('select qte from stocks.pf_stock where produit_id = $1 and taille = $2 and couleur = $3 for update', [l.produit_id, l.taille, l.couleur])).rows[0]?.qte || 0);
      const ecart = r3(l.compte - actuel);
      l.stock_validation = r3(actuel); l.ecart = ecart;
      if (Math.abs(ecart) > 0.0005) { if (txt(l.justification).length < 3) manque.push(i.stock === 'mp' ? `${l.designation} ${l.rouleau || l.n_lot || ''}`.trim() : `${l.reference} ${l.taille} ${l.couleur}`.trim()); else ecarts.push([k, l]); }
    }
    if (manque.length) throw ST.leve('justification_requise', `Écart non justifié : ${manque.slice(0, 8).join(', ')}${manque.length > 8 ? '…' : ''}. Chaque écart doit avoir une justification.`);
    let valeurEcart = 0;
    for (const [, l] of ecarts) {
      const motif = `Inventaire ${i.numero} : ${l.justification}`;
      if (i.stock === 'mp') {
        const r = l.ecart > 0 ? await ST.retourLot(c, req.utilisateur, { lot_id: l.lot_id, qte: l.ecart, type: 'inventaire', motif, ref_doc: i.numero })
          : await ST.sortieMP(c, req.utilisateur, { article_id: l.article_id, lot_id: l.lot_id, qte: -l.ecart, type: 'inventaire', motif, ref_doc: i.numero });
        l.valeur_ecart = l.ecart > 0 ? r.valeur : -r.valeur;
      } else {
        const r = l.ecart > 0 ? await ST.entreePF(c, req.utilisateur, { produit_id: l.produit_id, taille: l.taille, couleur: l.couleur, qte: l.ecart, type: 'inventaire', motif, ref_doc: i.numero, ref_num: i.numero })
          : await ST.sortiePF(c, req.utilisateur, { produit_id: l.produit_id, taille: l.taille, couleur: l.couleur, qte: -l.ecart, type: 'inventaire', motif, ref_doc: i.numero, ref_num: i.numero });
        l.valeur_ecart = l.ecart > 0 ? r.valeur : -r.valeur;
      }
      valeurEcart += l.valeur_ecart;
    }
    await c.query(`update stocks.inventaires set lignes = $2, statut = 'valide', valide_le = now(), valide_par = $3, version = version + 1 where id = $1`, [i.id, JSON.stringify(L), req.utilisateur.id]);
    await S.auditer(c, req, 'inventaire_valide', { entite: 'inventaire', entiteId: i.numero, details: { stock: i.stock, lignes: L.length, ecarts: ecarts.length, valeur_ecart: r3(valeurEcart) } });
    return sansValeurs(req.droits, { ok: true, ecarts: ecarts.length, valeur_ecart: r3(valeurEcart) });
  }).catch(capte(reply)));

  app.post('/api/stocks/inventaires/:id/annuler', {
    preHandler: S.exigerConnexion(), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (req, reply) => transaction(async (c) => {
    const i = (await c.query('select * from stocks.inventaires where id = $1 for update', [req.params.id])).rows[0];
    if (!i) return erreur(reply, 404, 'introuvable', 'Inventaire introuvable.');
    if (!D.peut(req.droits, droitInv(i.stock), 'creer')) return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas cette action.');
    if (i.statut !== 'brouillon') return erreur(reply, 400, 'inventaire_clos', 'Seul un inventaire en cours (brouillon) s’abandonne ; un inventaire validé se corrige par un nouvel inventaire.');
    await c.query(`update stocks.inventaires set statut = 'annule', version = version + 1 where id = $1`, [i.id]);
    await S.auditer(c, req, 'inventaire_abandonne', { entite: 'inventaire', entiteId: i.numero });
    return { ok: true };
  }));
};
