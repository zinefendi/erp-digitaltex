'use strict';
// Production (lot 0.11.0) — ordres de fabrication en 3 parties (coupe, marquage, assemblage et
// finition) et BOM / gammes versionnées (CDC §4.6 et §4.7). Réservations de matières au lancement
// de l'OF (décision du 23/10/2026) ; sorties MP à la validation de la coupe, entrées PF à la
// validation de la partie 3, dans la MÊME transaction que la validation. Aucun prix, montant ni
// donnée client sensible : la fiche technique figée est enregistrée sans montants (CDC §4.6.1).
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');
const ST = require('./stocks');
const PF = require('./produits-finis');
const PR = require('./prod');
const { r3 } = require('./calculs');

const erreur = (reply, code, err, message) => reply.code(code).send({ erreur: err, message });
const exige = (f, a) => S.exigerConnexion({ droit: [f, a] });
const numero = (c, type, date) => c.query('select parametres.attribuer_numero($1, $2::date) n', [type, date]).then((r) => r.rows[0].n);
const txt = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const jour = () => new Date().toISOString().slice(0, 10);
const capte = (reply) => (e) => { if (e.statusCode && e.code) return erreur(reply, e.statusCode, e.code, e.message); throw e; };
const piecesDe = (of) => r3((of.tailles_couleurs || []).reduce((s, t) => s + (+t.qte || 0), 0));
// Schéma du corps d'une validation de partie (lignes taille/couleur/quantité, remarque, photo,
// consommations réelles de la coupe) — défini à part pour rester lisible.
const CORPS_VALIDER = {
  type: 'object', required: ['qtes'], additionalProperties: false,
  properties: {
    qtes: { type: 'array', minItems: 1, maxItems: 200, items: {
      type: 'object', required: ['qte'], additionalProperties: false,
      properties: {
        taille: { type: 'string', maxLength: 30 },
        couleur: { type: 'string', maxLength: 60 },
        qte: { type: 'number', exclusiveMinimum: 0, maximum: 1e6 },
      },
    } },
    remarques: { type: 'string', maxLength: 500 },
    photo_id: { type: 'integer' },
    sorties: { type: 'array', maxItems: 300, items: {
      type: 'object', required: ['article_id', 'qte'], additionalProperties: false,
      properties: {
        article_id: { type: 'integer' },
        lot_id: { type: 'integer' },
        qte: { type: 'number', exclusiveMinimum: 0, maximum: 1e7 },
      },
    } },
  },
};
const ISO = (d) => d ? d.toISOString().slice(0, 10) : null;

async function detailOF(db, id, { avecPhoto = true } = {}) {
  const of = (await db.query(`select o.*, to_char(o.date_lancement, 'YYYY-MM-DD') date_lancement, to_char(o.date_livraison, 'YYYY-MM-DD') date_livraison,
      p.reference, ca.libelle article, p.version version_produit_actuelle, u.identifiant cree_par_nom
    from prod.of o join pf.produits p on p.id = o.produit_id left join pf.codes_article ca on ca.code = p.code_article
    left join noyau.utilisateurs u on u.id = o.cree_par where o.id = $1`, [id])).rows[0];
  if (!of) return null;
  const parties = (await db.query(`select partie, etat, qtes_validees from prod.of_parties where of_id = $1 order by partie`, [id])).rows;
  const vals = (await db.query(`select v.id, v.partie, to_char(v.date, 'YYYY-MM-DD') date, v.qtes, v.sorties, v.remarques, v.photo_id, v.annule, v.motif, v.horodatage,
      u.identifiant utilisateur, a.identifiant annule_par_nom, f.nom photo_nom
    from prod.of_validations v left join noyau.utilisateurs u on u.id = v.utilisateur left join noyau.utilisateurs a on a.id = v.annule_par
    left join commercial.fichiers f on f.id = v.photo_id
    where v.of_id = $1 order by v.partie, v.horodatage, v.id`, [id])).rows;
  const ficheModifiee = Number(of.produit_version) !== Number(of.version_produit_actuelle);
  return { ...of, fiche_modifiee: ficheModifiee, id: Number(of.id), produit_id: Number(of.produit_id), bom_version_id: of.bom_version_id ? Number(of.bom_version_id) : null,
    gamme_version_id: of.gamme_version_id ? Number(of.gamme_version_id) : null, parties, validations: avecPhoto ? vals : vals.map(({ photo_id, photo_nom, ...v }) => v) };
}

module.exports = async function routesProd(app) {
  // ================================================================ ORDRES DE FABRICATION
  app.get('/api/prod/of', { preHandler: exige('production.of', 'lire'), schema: { querystring: { type: 'object', additionalProperties: false,
    properties: { statut: { type: 'string', enum: ['cree', 'en_cours', 'termine', 'annule'] }, produit_id: { type: 'integer' },
      commande_id: { type: 'string', maxLength: 60 }, q: { type: 'string', maxLength: 80 },
      du: { type: 'string', format: 'date' }, au: { type: 'string', format: 'date' } } } } }, async (req) => {
    const q = req.query, w = [], p = [];
    if (q.statut) { p.push(q.statut); w.push(`o.statut = $${p.length}`); }
    if (q.produit_id) { p.push(q.produit_id); w.push(`o.produit_id = $${p.length}`); }
    if (q.commande_id) { p.push(q.commande_id); w.push(`o.commande_id = $${p.length}`); }
    if (q.q) { p.push(`%${q.q}%`); w.push(`(o.numero ilike $${p.length} or o.client_nom ilike $${p.length})`); }
    if (q.du) { p.push(q.du); w.push(`o.date_lancement >= $${p.length}::date`); }
    if (q.au) { p.push(q.au); w.push(`o.date_lancement <= $${p.length}::date`); }
    const r = await pool.query(`select o.id, o.numero, to_char(o.date_lancement, 'YYYY-MM-DD') date_lancement, o.commande_id, o.commande_numero,
        o.client_id, o.client_nom, o.produit_id, p.reference, ca.libelle article, to_char(o.date_livraison, 'YYYY-MM-DD') date_livraison,
        o.statut, o.version, (select coalesce(sum((x->>'qte')::float8), 0) from jsonb_array_elements(o.tailles_couleurs) x) pieces,
        coalesce(json_agg(json_build_object('partie', pt.partie, 'etat', pt.etat) order by pt.partie) filter (where pt.id is not null), '[]') parties
      from prod.of o join pf.produits p on p.id = o.produit_id left join pf.codes_article ca on ca.code = p.code_article
      left join prod.of_parties pt on pt.of_id = o.id
      ${w.length ? 'where ' + w.join(' and ') : ''} group by o.id, p.reference, ca.libelle order by o.date_lancement desc, o.id desc limit 300`, p);
    return r.rows.map((x) => ({ ...x, id: Number(x.id), produit_id: Number(x.produit_id), pieces: r3(x.pieces), version: Number(x.version) }));
  });

  app.get('/api/prod/of/:id', { preHandler: exige('production.of', 'lire'), schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } },
    async (req, reply) => {
      const of = await detailOF(pool, req.params.id);
      if (!of) return erreur(reply, 404, 'introuvable', 'Ordre de fabrication introuvable.');
      return of;
    });

  // Création depuis une commande client validée (CDC §4.6.1). Réservations de matières à la création.
  app.post('/api/prod/of', {
    preHandler: exige('production.of', 'creer'),
    schema: { body: { type: 'object', required: ['commande_id', 'produit_id', 'tailles_couleurs'], additionalProperties: false,
      properties: { commande_id: { type: 'string', maxLength: 60 }, produit_id: { type: 'integer' },
        tailles_couleurs: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', required: ['qte'], additionalProperties: false,
          properties: { taille: { type: 'string', maxLength: 30 }, couleur: { type: 'string', maxLength: 60 }, qte: { type: 'number', exclusiveMinimum: 0, maximum: 1e6 } } } },
        date_lancement: { type: 'string', format: 'date' }, date_livraison: { type: 'string', format: 'date' }, remarques: { type: 'string', maxLength: 500 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const b = req.body;
    const cmd = (await c.query(`select id, donnees from commercial.documents where collection = 'orders' and id = $1`, [b.commande_id])).rows[0];
    if (!cmd) return erreur(reply, 404, 'commande_introuvable', 'Commande introuvable.');
    if (['annule', 'annulee'].includes(cmd.donnees.status)) return erreur(reply, 400, 'commande_annulee', 'Cette commande est annulée : elle ne lance pas d’OF.');
    const p = (await c.query('select * from pf.produits where id = $1 and annule = false', [b.produit_id])).rows[0];
    if (!p) return erreur(reply, 404, 'produit_introuvable', 'Produit fini introuvable (ou annulé).');
    const taillant = (p.taillant || []).map(String);
    for (const t of b.tailles_couleurs) {
      const taille = String(t.taille || '').trim();
      if (taillant.length && !taillant.includes(taille)) return erreur(reply, 400, 'taille_inconnue', `Taille « ${taille} » absente du taillant du produit ${p.reference}.`);
    }
    const bom = await PR.bomActive(c, p.id);
    const gamme = await PR.gammeActive(c, p.id);
    const besoins = await PR.construireBesoins(c, { produit_id: p.id, tailles_couleurs: b.tailles_couleurs, bom_version_id: bom ? bom.id : null });
    const ca = (await c.query('select libelle from pf.codes_article where code = $1', [p.code_article])).rows[0];
    const num = await numero(c, 'of', b.date_lancement || jour());
    const of = (await c.query(`insert into prod.of (numero, date_lancement, commande_id, commande_numero, client_id, client_nom, produit_id,
        tailles_couleurs, date_livraison, bom_version_id, gamme_version_id, besoins, fiche, produit_version, remarques, cree_par)
      values ($1, coalesce($2::date, current_date), $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, $13, $14, $15, $16) returning id`,
      [num, b.date_lancement || null, String(cmd.id), String(cmd.donnees.number || ''), String(cmd.donnees.client?.id || cmd.donnees.client_id || ''),
        String(cmd.donnees.client?.name || cmd.donnees.clientName || ''), p.id, JSON.stringify(b.tailles_couleurs), b.date_livraison || null,
        besoins.bom_version_id, gamme ? gamme.id : null, JSON.stringify(besoins.lignes),
        JSON.stringify(PR.ficheSansPrix(p, ca?.libelle)), p.version, txt(b.remarques, 500), req.utilisateur.id])).rows[0];
    await c.query(`insert into prod.of_parties (of_id, partie, etat) values ($1, 1, 'en_attente'), ($1, 2, $2), ($1, 3, 'en_attente')`,
      [of.id, (p.marquages || []).length ? 'en_attente' : 'sans_objet']);
    const reservations = await PR.reserverPourOF(c, req.utilisateur, num, besoins.lignes);
    await S.auditer(c, req, 'of_cree', { entite: 'of', entiteId: num,
      details: { commande: String(cmd.donnees.number || cmd.id), produit: p.reference, pieces: piecesDe(b), reservations: reservations.length, sans_bom: !besoins.lignes.length } });
    reply.code(201);
    return detailOF(c, of.id);
  }).catch(capte(reply)));

  // Annulation : seulement si aucune partie n'a été validée (sinon passer par l'annulation des validations).
  app.post('/api/prod/of/:id/annuler', {
    preHandler: exige('production.of', 'annuler'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: { type: 'object', required: ['motif'], additionalProperties: false, properties: { motif: { type: 'string', minLength: 3, maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const of = (await c.query('select * from prod.of where id = $1 for update', [req.params.id])).rows[0];
    if (!of) return erreur(reply, 404, 'introuvable', 'Ordre de fabrication introuvable.');
    if (of.statut === 'annule') return erreur(reply, 400, 'deja_annule', 'Cet OF est déjà annulé.');
    const entame = (await c.query('select count(*)::int n from prod.of_validations where of_id = $1 and annule = false', [of.id])).rows[0].n;
    if (entame) return erreur(reply, 400, 'of_entame', 'Des parties de cet OF ont déjà été validées : faites annuler la validation par un responsable autorisé.');
    await PR.annulerReservations(c, of.numero);
    await c.query(`update prod.of set statut = 'annule', annule_motif = $2, version = version + 1, maj_le = now() where id = $1`, [of.id, txt(req.body.motif, 300)]);
    await S.auditer(c, req, 'of_annule', { entite: 'of', entiteId: of.numero, details: { motif: txt(req.body.motif, 300) } });
    return { ok: true };
  }));

  // ================================================================ LES 3 PARTIES
  app.post('/api/prod/of/:id/partie/:n/commencer', {
    preHandler: exige('production.etapes', 'valider'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' }, n: { type: 'integer', minimum: 1, maximum: 3 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const of = (await c.query('select * from prod.of where id = $1 for update', [req.params.id])).rows[0];
    if (!of) return erreur(reply, 404, 'introuvable', 'Ordre de fabrication introuvable.');
    if (['annule', 'termine'].includes(of.statut)) return erreur(reply, 400, 'of_ferme', 'Cet OF est ' + (of.statut === 'annule' ? 'annulé' : 'terminé') + '.');
    const parties = (await c.query('select id, partie, etat from prod.of_parties where of_id = $1 order by partie', [of.id])).rows;
    const p = parties.find((x) => x.partie === req.params.n);
    if (!p) return erreur(reply, 404, 'partie_introuvable', 'Partie inconnue.');
    if (p.etat === 'sans_objet') return erreur(reply, 400, 'partie_sans_objet', 'Cette partie est sans objet (produit sans marquage).');
    if (p.etat !== 'en_attente') return erreur(reply, 400, 'deja_commencee', 'Cette partie est déjà démarrée ou validée.');
    if (req.params.n > 1) {
      const bloquant = parties.filter((x) => x.partie < req.params.n && !['validee', 'sans_objet'].includes(x.etat));
      if (bloquant.length) return erreur(reply, 400, 'partie_precedente', `La partie ${bloquant[0].partie} doit être validée avant de démarrer la partie ${req.params.n}.`);
    }
    await c.query(`update prod.of_parties set etat = 'en_cours' where id = $1`, [p.id]);
    await c.query(`update prod.of set statut = 'en_cours', version = version + 1, maj_le = now() where id = $1 and statut = 'cree'`, [of.id]);
    await S.auditer(c, req, 'of_partie_commencee', { entite: 'of', entiteId: of.numero, details: { partie: req.params.n } });
    return { ok: true, etat: 'en_cours' };
  }));

  // Validation d'une partie : partielle possible (80/100, le reste reste en cours). Coupe → sorties MP
  // (saisie réelle ou prorata des besoins) ; partie 3 → entrées PF au PRI. Le tout dans la transaction.
  app.post('/api/prod/of/:id/partie/:n/valider', {
    preHandler: exige('production.etapes', 'valider'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' }, n: { type: 'integer', minimum: 1, maximum: 3 } } }, body: CORPS_VALIDER },
  }, async (req, reply) => transaction(async (c) => {
    const of = (await c.query('select * from prod.of where id = $1 for update', [req.params.id])).rows[0];
    if (!of) return erreur(reply, 404, 'introuvable', 'Ordre de fabrication introuvable.');
    if (['annule', 'termine'].includes(of.statut)) return erreur(reply, 400, 'of_ferme', 'Cet OF est ' + (of.statut === 'annule' ? 'annulé' : 'terminé') + '.');
    const n = req.params.n;
    const parties = (await c.query('select id, partie, etat, qtes_validees from prod.of_parties where of_id = $1 order by partie for update', [of.id])).rows;
    const p = parties.find((x) => x.partie === n);
    if (!p) return erreur(reply, 404, 'partie_introuvable', 'Partie inconnue.');
    if (p.etat === 'sans_objet') return erreur(reply, 400, 'partie_sans_objet', 'Cette partie est sans objet (produit sans marquage).');
    if (p.etat === 'validee') return erreur(reply, 400, 'deja_validee', 'Cette partie est déjà validée en totalité.');
    if (n > 1) {
      const bloquant = parties.filter((x) => x.partie < n && !['validee', 'sans_objet'].includes(x.etat));
      if (bloquant.length) return erreur(reply, 400, 'partie_precedente', `La partie ${bloquant[0].partie} doit être validée avant la partie ${n}.`);
    }
    // cumul des validations (celles-ci + précédentes non annulées) ≤ quantités de l'OF
    const cumul = new Map((p.qtes_validees || []).map((t) => [JSON.stringify([String(t.taille || '').trim(), String(t.couleur || '').trim()]), r3(+t.qte || 0)]));
    const ordre = new Map((of.tailles_couleurs || []).map((t) => [JSON.stringify([String(t.taille || '').trim(), String(t.couleur || '').trim()]), r3(+t.qte || 0)]));
    for (const q of req.body.qtes) {
      const k = JSON.stringify([String(q.taille || '').trim(), String(q.couleur || '').trim()]);
      const max = ordre.get(k);
      if (max === undefined) return erreur(reply, 400, 'ligne_inconnue', `« ${String(q.taille || '').trim()} ${String(q.couleur || '').trim()} » ne fait pas partie de cet OF.`);
      const deja = cumul.get(k) || 0;
      if (deja + (+q.qte) > max + PR.EPS) return erreur(reply, 400, 'trop_valide', `« ${q.taille || ''} ${q.couleur || ''} » : ${r3(max - deja)} pièce(s) restante(s) à valider au plus.`);
      cumul.set(k, r3(deja + +q.qte));
    }
    if (req.body.photo_id) {
      const f = await c.query(`select 1 from commercial.fichiers where id = $1 and cible_type = 'of' and cible_id = $2 and not annule`, [req.body.photo_id, String(of.id)]);
      if (!f.rowCount) return erreur(reply, 400, 'photo_invalide', 'La photo jointe n’a pas été trouvée sur cet OF (téléversez-la d’abord).');
    }
    // ---------- coupe : sorties de matières (réelles ou prorata des besoins figés)
    const sortiesDetail = [];
    if (n === 1) {
      let consos;
      if (req.body.sorties?.length) consos = req.body.sorties.map((s) => ({ article_id: s.article_id, lot_id: s.lot_id || null, qte: r3(s.qte) }));
      else {
        const totalPieces = piecesDe(of);
        consos = [];
        for (const bl of of.besoins || []) {
          if (!bl.article_id) continue;
          let q = 0;
          for (const v of req.body.qtes) {
            const pp = bl.par_piece && bl.par_piece[String(v.taille || '').trim()] !== undefined ? bl.par_piece[String(v.taille || '').trim()] : r3(bl.qte_totale / totalPieces);
            q = r3(q + pp * (+v.qte || 0));
          }
          if (q > PR.EPS) consos.push({ article_id: bl.article_id, lot_id: null, qte: q });
        }
      }
      const parArticle = {};
      for (const s of consos) {
        if (!(s.qte > PR.EPS)) continue;
        const res = await ST.sortieMP(c, req.utilisateur, { article_id: s.article_id, lot_id: s.lot_id, qte: s.qte, type: 'sortie_of', motif: `Coupe OF ${of.numero}`, ref_doc: of.numero });
        for (const d of res.detail) sortiesDetail.push({ article_id: s.article_id, lot_id: d.lot_id, qte: d.qte });
        parArticle[s.article_id] = r3((parArticle[s.article_id] || 0) + s.qte);
      }
      await PR.consommerReservations(c, of.numero, parArticle);
    }
    // ---------- assemblage et finition : entrée des produits finis au PRI
    if (n === 3) {
      for (const v of req.body.qtes) {
        const res = await ST.entreePF(c, req.utilisateur, { produit_id: of.produit_id, taille: v.taille, couleur: v.couleur, qte: v.qte, type: 'entree_of', motif: `Assemblage OF ${of.numero}`, ref_doc: String(of.id), ref_num: of.numero });
        if (res.alerte) throw PR.leve('stock_pf_alerte', 'Alerte de stock inattendue à l’entrée PF.');
      }
    }
    // ---------- états
    const qtesCumul = [...cumul].map(([k, q]) => { const [taille, couleur] = JSON.parse(k); return { taille, couleur, qte: q }; });
    const totalPieces = piecesDe(of), validePieces = r3(qtesCumul.reduce((s, q) => s + q.qte, 0));
    const etat = validePieces >= totalPieces - PR.EPS ? 'validee' : 'en_cours';
    await c.query('update prod.of_parties set etat = $3, qtes_validees = $4 where id = $1 and partie = $2', [p.id, n, etat, JSON.stringify(qtesCumul)]);
    const vid = (await c.query(`insert into prod.of_validations (of_id, partie, qtes, sorties, remarques, photo_id, utilisateur)
      values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [of.id, n, JSON.stringify(req.body.qtes), JSON.stringify(sortiesDetail), txt(req.body.remarques, 500), req.body.photo_id || null, req.utilisateur.id])).rows[0].id;
    const etats = (await c.query('select etat from prod.of_parties where of_id = $1', [of.id])).rows.map((x) => x.etat);
    const termine = etats.every((e) => e === 'validee' || e === 'sans_objet');
    await c.query(`update prod.of set statut = $2, termine_le = $3, version = version + 1, maj_le = now() where id = $1`,
      [of.id, termine ? 'termine' : 'en_cours', termine ? new Date().toISOString() : null]);
    await S.auditer(c, req, 'of_partie_validee', { entite: 'of', entiteId: of.numero,
      details: { partie: n, qtes: req.body.qtes, etat, terminee: termine, sorties_mp: n === 1 ? sortiesDetail.length : undefined, photo: req.body.photo_id ? true : undefined } });
    reply.code(201);
    return { ok: true, validation_id: Number(vid), etat, statut: termine ? 'termine' : 'en_cours', sorties_mp: sortiesDetail.length };
  }).catch(capte(reply)));

  // Annulation d'une validation : responsable autorisé + motif ; mouvements de stock inversés.
  app.post('/api/prod/of/:id/validations/:vid/annuler', {
    preHandler: exige('production.etapes', 'annuler'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' }, vid: { type: 'integer' } } },
      body: { type: 'object', required: ['motif'], additionalProperties: false, properties: { motif: { type: 'string', minLength: 3, maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const of = (await c.query('select * from prod.of where id = $1 for update', [req.params.id])).rows[0];
    if (!of) return erreur(reply, 404, 'introuvable', 'Ordre de fabrication introuvable.');
    if (of.statut === 'annule') return erreur(reply, 400, 'of_annule', 'Cet OF est annulé.');
    const v = (await c.query('select * from prod.of_validations where id = $1 and of_id = $2', [req.params.vid, of.id])).rows[0];
    if (!v) return erreur(reply, 404, 'introuvable', 'Validation introuvable.');
    if (v.annule) return erreur(reply, 400, 'deja_annulee', 'Cette validation est déjà annulée.');
    const motif = txt(req.body.motif, 300);
    if (v.partie === 1) {
      const parArticle = {};
      for (const s of v.sorties || []) {
        await ST.retourLot(c, req.utilisateur, { lot_id: s.lot_id, qte: s.qte, type: 'retour', motif: `Annulation validation coupe ${of.numero} : ${motif}`, ref_doc: of.numero });
        parArticle[s.article_id] = r3((parArticle[s.article_id] || 0) + s.qte);
      }
      await PR.reconstituerReservations(c, req.utilisateur, of.numero, parArticle);
    }
    if (v.partie === 3) {
      for (const q of v.qtes || []) {
        await ST.sortiePF(c, req.utilisateur, { produit_id: of.produit_id, taille: q.taille, couleur: q.couleur, qte: q.qte, type: 'sortie', motif: `Annulation validation assemblage ${of.numero} : ${motif}`, ref_doc: String(of.id), ref_num: of.numero })
          .catch((e) => { if (e.code === 'stock_insuffisant') throw PR.leve('stock_pf_insuffisant', 'Impossible d’annuler : des pièces déjà validées ont quitté le stock (livrées). Passez par un ajustement d’inventaire.'); throw e; });
      }
    }
    await c.query('update prod.of_validations set annule = true, motif = $3, annule_le = now(), annule_par = $4 where id = $1 and of_id = $2', [v.id, of.id, motif, req.utilisateur.id]);
    // recalcul du cumul de la partie
    const vals = (await c.query('select qtes from prod.of_validations where of_id = $1 and partie = $2 and annule = false', [of.id, v.partie])).rows;
    const cumul = new Map();
    for (const x of vals) for (const q of x.qtes || []) {
      const k = JSON.stringify([String(q.taille || '').trim(), String(q.couleur || '').trim()]);
      cumul.set(k, r3((cumul.get(k) || 0) + (+q.qte || 0)));
    }
    const qtesCumul = [...cumul].map(([k, q]) => { const [taille, couleur] = JSON.parse(k); return { taille, couleur, qte: q }; });
    const totalPieces = piecesDe(of), validePieces = r3(qtesCumul.reduce((s, q) => s + q.qte, 0));
    const etat = validePieces <= PR.EPS ? 'en_attente' : (validePieces >= totalPieces - PR.EPS ? 'validee' : 'en_cours');
    await c.query('update prod.of_parties set etat = $3, qtes_validees = $4 where of_id = $1 and partie = $2', [of.id, v.partie, etat, JSON.stringify(qtesCumul)]);
    const etats = (await c.query('select etat from prod.of_parties where of_id = $1', [of.id])).rows.map((x) => x.etat);
    const termine = etats.every((e) => e === 'validee' || e === 'sans_objet');
    await c.query(`update prod.of set statut = $2, termine_le = $3, version = version + 1, maj_le = now() where id = $1`,
      [of.id, termine ? 'termine' : 'en_cours', termine ? new Date().toISOString() : null]);
    await S.auditer(c, req, 'of_validation_annulee', { entite: 'of', entiteId: of.numero, details: { partie: v.partie, validation: Number(v.id), motif } });
    return { ok: true, etat, statut: termine ? 'termine' : 'en_cours' };
  }).catch(capte(reply)));

  // ================================================================ CALCUL DES BESOINS (CDC §4.7)
  // D'une commande (lignes produits finis) ou d'un produit + tailles : besoins vs stock disponible.
  app.get('/api/prod/besoins', { preHandler: S.exigerConnexion(), schema: { querystring: { type: 'object', additionalProperties: false,
    properties: { commande_id: { type: 'string', maxLength: 60 }, produit_id: { type: 'integer' }, tc: { type: 'string', maxLength: 20000 } } } } },
  async (req, reply) => {
    if (!D.peut(req.droits, 'production.of', 'lire') && !D.peut(req.droits, 'bom.nomenclatures', 'lire'))
      return erreur(reply, 403, 'interdit', 'Vos droits ne permettent pas de consulter le calcul des besoins.');
    const groupes = new Map();
    if (req.query.commande_id) {
      const cmd = (await pool.query(`select id, donnees from commercial.documents where collection = 'orders' and id = $1`, [req.query.commande_id])).rows[0];
      if (!cmd) return erreur(reply, 404, 'commande_introuvable', 'Commande introuvable.');
      for (const l of cmd.donnees.lines || []) {
        if (l.service) continue;
        const p = await ST.produitDeCode(pool, l.article);
        if (!p) continue;
        const g = groupes.get(Number(p.id)) || { produit_id: Number(p.id), reference: p.reference, tailles_couleurs: [] };
        const taille = String(l.size ?? '').trim(), couleur = String(l.color ?? '').trim(), qte = +l.qty || 0;
        const ex = g.tailles_couleurs.find((t) => t.taille === taille && t.couleur === couleur);
        if (ex) ex.qte = r3(ex.qte + qte); else g.tailles_couleurs.push({ taille, couleur, qte: r3(qte) });
        groupes.set(Number(p.id), g);
      }
    } else if (req.query.produit_id) {
      let tc = [];
      try { tc = JSON.parse(req.query.tc || '[]'); } catch { return erreur(reply, 400, 'tc_invalide', 'Tailles/couleurs illisibles.'); }
      const p = (await pool.query('select id, reference from pf.produits where id = $1 and annule = false', [req.query.produit_id])).rows[0];
      if (!p) return erreur(reply, 404, 'produit_introuvable', 'Produit fini introuvable.');
      groupes.set(Number(p.id), { produit_id: Number(p.id), reference: p.reference, tailles_couleurs: (Array.isArray(tc) ? tc : []).map((t) => ({ taille: String(t.taille || '').trim(), couleur: String(t.couleur || '').trim(), qte: r3(+t.qte || 0) })) });
    } else return erreur(reply, 400, 'cible_manquante', 'Indiquez une commande (commande_id) ou un produit (produit_id).');
    const out = [];
    for (const g of groupes.values()) {
      const besoins = await PR.construireBesoins(pool, { produit_id: g.produit_id, tailles_couleurs: g.tailles_couleurs });
      const lignes = await PR.besoinsVsStock(pool, besoins.lignes);
      out.push({ ...g, bom_version_id: besoins.bom_version_id, pieces: r3(g.tailles_couleurs.reduce((s, t) => s + t.qte, 0)), lignes });
    }
    return out;
  });

  // ================================================================ BOM VERSIONNÉE (CDC §4.7)
  const masquePu = (eff, lignes) => D.voit(eff, 'couts') || D.voit(eff, 'achats') ? lignes : lignes.map(({ pu, ...l }) => l);

  app.get('/api/pf/boms', { preHandler: exige('bom.nomenclatures', 'lire'), schema: { querystring: { type: 'object', additionalProperties: false, properties: { produit_id: { type: 'integer' } } } } },
    async (req) => {
      const r = (await pool.query(`select b.id, b.version, to_char(b.date_effet, 'YYYY-MM-DD') date_effet, b.statut, b.origine, b.note, b.cree_le, u.identifiant cree_par
        from pf.boms b left join noyau.utilisateurs u on u.id = b.cree_par where b.produit_id = $1 order by b.version desc`, [req.query.produit_id])).rows;
      const L = (await pool.query(`select l.bom_id, l.id, l.article_id, l.designation, l.unite, l.qte_base::float8 qte_base, l.par_taille, l.pu::float8 pu, l.ordre
        from pf.bom_lignes l where l.bom_id = any($1) order by l.bom_id, l.ordre, l.id`, [r.map((x) => x.id)])).rows;
      const parBom = new Map();
      for (const l of L) {
        if (!parBom.has(l.bom_id)) parBom.set(l.bom_id, []);
        parBom.get(l.bom_id).push({ ...l, id: Number(l.id), article_id: l.article_id ? Number(l.article_id) : null, bom_id: Number(l.bom_id), qte_base: r3(l.qte_base), pu: r3(l.pu) });
      }
      return r.map((b) => ({ ...b, id: Number(b.id), lignes: masquePu(req.droits, parBom.get(b.id) || []) }));
    });

  // Nouvelle version de BOM : archive l'active, met à jour la fiche produit (PRI recalculé si « calcule »).
  app.post('/api/pf/boms', {
    preHandler: exige('bom.nomenclatures', 'creer'),
    schema: { body: { type: 'object', required: ['produit_id', 'lignes'], additionalProperties: false,
      properties: { produit_id: { type: 'integer' }, note: { type: 'string', maxLength: 500 },
        lignes: { type: 'array', maxItems: 200, items: { type: 'object', additionalProperties: false,
          properties: { article_id: { type: 'integer', nullable: true }, designation: { type: 'string', maxLength: 200 }, unite: { type: 'string', maxLength: 20 },
            qte_base: { type: 'number', minimum: 0, maximum: 1e6 }, par_taille: { type: 'object', maxProperties: 40 }, pu: { type: 'number', minimum: 0, maximum: 1e6 } } } } } } },
  }, async (req, reply) => transaction(async (c) => {
    const b = req.body;
    const p = (await c.query('select * from pf.produits where id = $1 and annule = false', [b.produit_id])).rows[0];
    if (!p) return erreur(reply, 404, 'produit_introuvable', 'Produit fini introuvable.');
    const voitCouts = D.voit(req.droits, 'achats') || D.voit(req.droits, 'couts');
    const lignes = [];
    for (const l of b.lignes || []) {
      let designation = txt(l.designation, 200);
      let article_id = null, unite = txt(l.unite, 20), pu = 0;
      if (l.article_id) {
        const f = (await c.query(`select id, donnees from registres.fiches where id = $1 and registre = 'articles_mp'`, [l.article_id])).rows[0];
        if (!f) return erreur(reply, 400, 'article_introuvable', `Ligne « ${designation || 'sans nom'} » : article matière introuvable.`);
        article_id = Number(f.id);
        designation || (designation = f.donnees.designation || '');
        unite || (unite = f.donnees.unite || '');
        pu = voitCouts && l.pu !== undefined ? r3(l.pu) : r3(Number(f.donnees.prix_achat) || 0);
      }
      const qte = r3(+l.qte_base || 0);
      if (!designation && !article_id) continue; // ligne vide
      if (qte <= 0 && !article_id) continue;
      const par_taille = {};
      for (const [t, v] of Object.entries(l.par_taille || {})) if (+v > 0) par_taille[String(t).trim().slice(0, 30)] = r3(+v);
      lignes.push({ article_id, designation, unite, qte_base: qte, par_taille, pu, ordre: lignes.length + 1 });
    }
    if (!lignes.length) return erreur(reply, 400, 'bom_vide', 'La nomenclature est vide : au moins une matière (ou une ligne désignée) est nécessaire.');
    const avant = (await c.query(`select id, version from pf.boms where produit_id = $1 and statut = 'active' order by version desc limit 1`, [p.id])).rows[0];
    if (avant) await c.query(`update pf.boms set statut = 'archivee' where id = $1`, [avant.id]);
    const version = ((await c.query('select coalesce(max(version), 0) v from pf.boms where produit_id = $1', [p.id])).rows[0].v) + 1;
    const bom = (await c.query(`insert into pf.boms (produit_id, version, statut, origine, note, cree_par) values ($1, $2, 'active', $3, $4, $5) returning id`,
      [p.id, version, avant ? 'modification' : 'creation', txt(b.note, 500), req.utilisateur.id])).rows[0];
    for (const l of lignes) await c.query(`insert into pf.bom_lignes (bom_id, article_id, designation, unite, qte_base, par_taille, pu, ordre) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [bom.id, l.article_id, l.designation, l.unite, l.qte_base, JSON.stringify(l.par_taille), l.pu, l.ordre]);
    // la fiche produit reste la source du PRI (écran Produits finis) : on y recopie la nouvelle BOM
    const nb = lignes.map((l) => ({ matiere: '', designation: l.designation, qte: l.qte_base, pu: l.pu, total: r3(l.qte_base * l.pu) }));
    const codes = await c.query(`select id, donnees->>'code' code from registres.fiches where id = any($1) and registre = 'articles_mp'`, [lignes.filter((l) => l.article_id).map((l) => l.article_id)]);
    for (const l of nb) { const f = codes.rows.find((x) => Number(x.id) === lignes[nb.indexOf(l)].article_id); if (f) l.matiere = f.code || ''; }
    const couts = await PF.lireCouts(c), tarifs = await PF.lireTarifsMarquages(c);
    const calc = PF.calculer({ bom: nb, gamme: p.gamme || [], marquages: p.marquages || [] }, Number(p.marge), couts, tarifs);
    if (p.prix_source === 'calcule') {
      await c.query(`update pf.produits set bom = $2, cout_matieres = $3, cout_industrialisation = $4, cout_marquages = $5, pri = $6, prix_ht = $7,
        minutes_gamme = $8, version = version + 1, maj_le = now(), maj_par = $9 where id = $1`,
        [p.id, JSON.stringify(nb), calc.cout_matieres, calc.cout_industrialisation, calc.cout_marquages, calc.pri, calc.prix_ht, calc.minutes_gamme, req.utilisateur.id]);
    } else {
      await c.query(`update pf.produits set bom = $2, cout_matieres = $3, minutes_gamme = $4, version = version + 1, maj_le = now(), maj_par = $5 where id = $1`,
        [p.id, JSON.stringify(nb), calc.cout_matieres, calc.minutes_gamme, req.utilisateur.id]);
    }
    await c.query('insert into pf.historique (produit_id, version, action, donnees, utilisateur) values ($1, $2, \'modifie\', $3, $4)',
      [p.id, p.version + 1, { bom_version: Number(bom.id), origine: 'BOM versionnée 0.11.0' }, req.utilisateur.id]);
    await S.auditer(c, req, 'bom_version_creee', { entite: 'produit_fini', entiteId: String(p.id),
      details: { produit: p.reference, version: Number(bom.id), lignes: lignes.length, remplace: avant ? avant.version : null } });
    reply.code(201);
    return { id: Number(bom.id), version, lignes: masquePu(req.droits, lignes) };
  }).catch(capte(reply)));

  // ================================================================ GAMMES VERSIONNÉES
  app.get('/api/pf/gammes', { preHandler: exige('bom.gammes', 'lire'), schema: { querystring: { type: 'object', additionalProperties: false, properties: { produit_id: { type: 'integer' } } } } },
    async (req) => {
      const r = (await pool.query(`select g.id, g.version, to_char(g.date_effet, 'YYYY-MM-DD') date_effet, g.statut, g.origine, g.note, g.cree_le, u.identifiant cree_par
        from pf.gammes g left join noyau.utilisateurs u on u.id = g.cree_par where g.produit_id = $1 order by g.version desc`, [req.query.produit_id])).rows;
      const O = (await pool.query(`select * from pf.gamme_operations where gamme_id = any($1) order by gamme_id, ordre, id`, [r.map((x) => x.id)])).rows;
      const parGamme = new Map();
      for (const o of O) { if (!parGamme.has(o.gamme_id)) parGamme.set(o.gamme_id, []); parGamme.get(o.gamme_id).push({ operation: o.operation, temps_min: r3(o.temps_min), poste: o.poste, ordre: o.ordre }); }
      return r.map((g) => ({ ...g, id: Number(g.id), operations: parGamme.get(g.id) || [] }));
    });

  app.post('/api/pf/gammes', {
    preHandler: exige('bom.gammes', 'creer'),
    schema: { body: { type: 'object', required: ['produit_id', 'operations'], additionalProperties: false,
      properties: { produit_id: { type: 'integer' }, note: { type: 'string', maxLength: 500 },
        operations: { type: 'array', maxItems: 100, items: { type: 'object', required: ['operation'], additionalProperties: false,
          properties: { operation: { type: 'string', maxLength: 120 }, temps_min: { type: 'number', minimum: 0, maximum: 1e5 }, poste: { type: 'string', maxLength: 80 } } } } } } },
  }, async (req, reply) => transaction(async (c) => {
    const b = req.body;
    const p = (await c.query('select * from pf.produits where id = $1 and annule = false', [b.produit_id])).rows[0];
    if (!p) return erreur(reply, 404, 'produit_introuvable', 'Produit fini introuvable.');
    const operations = [];
    for (const o of b.operations || []) {
      const operation = txt(o.operation, 120);
      if (!operation) continue;
      operations.push({ operation, temps_min: r3(+o.temps_min || 0), poste: txt(o.poste, 80), ordre: operations.length + 1 });
    }
    if (!operations.length) return erreur(reply, 400, 'gamme_vide', 'La gamme est vide : au moins une opération est nécessaire.');
    const avant = (await c.query(`select id, version from pf.gammes where produit_id = $1 and statut = 'active' order by version desc limit 1`, [p.id])).rows[0];
    if (avant) await c.query(`update pf.gammes set statut = 'archivee' where id = $1`, [avant.id]);
    const version = ((await c.query('select coalesce(max(version), 0) v from pf.gammes where produit_id = $1', [p.id])).rows[0].v) + 1;
    const gamme = (await c.query(`insert into pf.gammes (produit_id, version, statut, origine, note, cree_par) values ($1, $2, 'active', $3, $4, $5) returning id`,
      [p.id, version, avant ? 'modification' : 'creation', txt(b.note, 500), req.utilisateur.id])).rows[0];
    for (const o of operations) await c.query('insert into pf.gamme_operations (gamme_id, operation, temps_min, poste, ordre) values ($1,$2,$3,$4,$5)', [gamme.id, o.operation, o.temps_min, o.poste, o.ordre]);
    // fiche produit : gamme jsonb + PRI recalculé si « calcule »
    const ng = operations.map(({ operation, temps_min }) => ({ operation, temps_min }));
    const couts = await PF.lireCouts(c), tarifs = await PF.lireTarifsMarquages(c);
    const calc = PF.calculer({ bom: p.bom || [], gamme: ng, marquages: p.marquages || [] }, Number(p.marge), couts, tarifs);
    if (p.prix_source === 'calcule') {
      await c.query(`update pf.produits set gamme = $2, cout_matieres = $3, cout_industrialisation = $4, cout_marquages = $5, pri = $6, prix_ht = $7,
        minutes_gamme = $8, version = version + 1, maj_le = now(), maj_par = $9 where id = $1`,
        [p.id, JSON.stringify(ng), calc.cout_matieres, calc.cout_industrialisation, calc.cout_marquages, calc.pri, calc.prix_ht, calc.minutes_gamme, req.utilisateur.id]);
    } else {
      await c.query(`update pf.produits set gamme = $2, minutes_gamme = $3, version = version + 1, maj_le = now(), maj_par = $4 where id = $1`, [p.id, JSON.stringify(ng), calc.minutes_gamme, req.utilisateur.id]);
    }
    await c.query('insert into pf.historique (produit_id, version, action, donnees, utilisateur) values ($1, $2, \'modifie\', $3, $4)',
      [p.id, p.version + 1, { gamme_version: Number(gamme.id), origine: 'Gamme versionnée 0.11.0' }, req.utilisateur.id]);
    await S.auditer(c, req, 'gamme_version_creee', { entite: 'produit_fini', entiteId: String(p.id),
      details: { produit: p.reference, version: Number(gamme.id), operations: operations.length, remplace: avant ? avant.version : null } });
    reply.code(201);
    return { id: Number(gamme.id), version, operations };
  }).catch(capte(reply)));
};
