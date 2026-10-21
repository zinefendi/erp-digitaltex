'use strict';
// Produits finis (lot 0.8.0) : codes article, références attribuées par le serveur, BOM et gamme,
// marquages, calcul du prix de revient et de vente, vente à perte contrôlée, historique.
// Règle CDC § 5.2 : un montant non autorisé n'est JAMAIS envoyé au poste — masquage côté serveur.
// L'infographiste ne voit AUCUN prix (visibilité « prix » absente) et pas les coûts (visibilité « coûts »).
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');
const PF = require('./produits-finis');

const erreur = (reply, code, err, message, extra) => reply.code(code).send({ erreur: err, message, ...extra });
const exige = (f, a) => S.exigerConnexion({ droit: [f, a] });
const r3 = (v) => Math.round((+v || 0) * 1000) / 1000;
const SECTES = ['B', 'E', 'F', 'H', 'U'];

/** Retire les montants que ce compte n'a pas le droit de voir. */
function masquer(eff, p) {
  if (!p) return p;
  const x = structuredClone(p);
  // les colonnes numeric(14,3) arrivent en texte : on rend des nombres
  for (const k of ['id', 'cout_matieres', 'cout_industrialisation', 'cout_marquages', 'pri', 'marge', 'prix_ht', 'minutes_gamme']) if (x[k] !== undefined && x[k] !== null) x[k] = Number(x[k]);
  const voitPrix = D.voit(eff, 'prix'), voitCouts = D.voit(eff, 'couts');
  if (voitPrix && voitCouts) return x;
  if (!voitCouts) {
    for (const k of ['cout_matieres', 'cout_industrialisation', 'cout_marquages', 'pri', 'marge']) delete x[k];
    x.bom = (x.bom || []).map(({ pu, total, ...l }) => l);              // prix unitaire CMUP = coût d'achat
    x.marquages = (x.marquages || []).map(({ montant, ...l }) => l);    // tarifs de marquage = coûts
  }
  if (!voitPrix) delete x.prix_ht;
  return x;
}

/** Champs de fiche acceptés du client ; les montants calculés restent au serveur. */
function champsFiche(b) {
  const d = {};
  if (b.illustration !== undefined) d.illustration = String(b.illustration || '').slice(0, 700000);
  if (b.taillant !== undefined) d.taillant = Array.isArray(b.taillant) ? b.taillant.map((t) => String(t).trim().slice(0, 20)).filter(Boolean) : [];
  if (b.bom !== undefined) d.bom = b.bom;
  if (b.gamme !== undefined) d.gamme = b.gamme;
  if (b.marquages !== undefined) d.marquages = b.marquages;
  if (b.note !== undefined) d.note = String(b.note || '').trim().slice(0, 1000);
  if (b.client_id !== undefined) { d.client_id = b.client_id ? String(b.client_id).slice(0, 40) : null; }
  if (b.marge !== undefined) d.marge = b.marge;
  if (b.prix_source !== undefined) d.prix_source = b.prix_source;
  if (b.prix_ht !== undefined) d.prix_ht = b.prix_ht;
  return d;
}

/** Calcule et enregistre les montants serveur d'un produit (BOM/gamme/marquages nettoyés d'abord). */
async function calculerEtEnregistrer(c, req, produit, id) {
  const couts = await PF.lireCouts(c);
  const tarifs = await PF.lireTarifsMarquages(c);
  const bom = PF.nettoyerBom(produit.bom || []);
  const gamme = PF.nettoyerGamme(produit.gamme || []);
  const marq = PF.nettoyerMarquages(produit.marquages || [], tarifs);
  const erreurs = [...bom.erreurs, ...gamme.erreurs, ...marq.erreurs];
  if (erreurs.length) return { erreur_saisie: erreurs.join(' ') };
  const marge = produit.marge !== undefined && produit.marge !== null ? r3(produit.marge) : null;
  const calc = PF.calculer({ bom: bom.lignes, gamme: gamme.lignes, marquages: marq.lignes }, marge, couts, tarifs);
  // Garde-fou vente à perte (spec § 3) : prix < PRI → confirmation obligatoire, tracée dans l'audit.
  const perte = (produit.prix_source === 'manuel' || produit.prix_source === 'devis') && produit.prix_ht !== undefined
    ? r3(produit.prix_ht) : calc.prix_ht;
  const venteAPerte = calc.pri > 0 && perte < calc.pri;
  if (venteAPerte && !produit.confirmer_perte) {
    return { vente_a_perte: { pri: calc.pri, prix_propose: perte, marge: calc.marge } };
  }
  const etat = PF.etatDe(marq.lignes, produit.client_id || null);
  const params = [produit.illustration ?? '', JSON.stringify(produit.taillant || []), JSON.stringify(bom.lignes),
    JSON.stringify(gamme.lignes), JSON.stringify(marq.lignes), calc.cout_matieres, calc.cout_industrialisation,
    calc.cout_marquages, calc.pri, calc.marge, perte, produit.prix_source || 'calcule', calc.minutes_gamme,
    etat, produit.note || '', produit.client_id || null, produit.client_nom || ''];
  if (id) {
    await c.query(`update pf.produits set illustration=$1, taillant=$2, bom=$3, gamme=$4, marquages=$5,
      cout_matieres=$6, cout_industrialisation=$7, cout_marquages=$8, pri=$9, marge=$10, prix_ht=$11,
      prix_source=$12, minutes_gamme=$13, etat=$14, note=$15, client_id=$16, client_nom=$17,
      version = version + 1, maj_le = now(), maj_par = $18 where id = $19`, [...params, req.utilisateur.id, id]);
  } else {
    await c.query(`insert into pf.produits (illustration, taillant, bom, gamme, marquages, cout_matieres,
      cout_industrialisation, cout_marquages, pri, marge, prix_ht, prix_source, minutes_gamme, etat,
      note, client_id, client_nom, cree_par, maj_par, reference, code_article, numero, annee, sexe)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18,$19,$20,$21,$22,$23)`,
      [...params, req.utilisateur.id, produit.reference, produit.code_article, produit.numero, produit.annee, produit.sexe]);
  }
  return { calc, bom: bom.lignes, gamme: gamme.lignes, marquages: marq.lignes, etat,
    vente_a_perte: venteAPerte ? { pri: calc.pri, prix_propose: perte, marge: calc.marge } : null };
}

/** Relit une fiche complète (pour l'historique et les réponses). */
const lireFiche = async (db, id) => (await db.query('select * from pf.produits where id = $1', [id])).rows[0];

module.exports = async function routesProduitsFinis(app) {
  // ------------------------------------------------------------ codes article (Paramètres)
  app.get('/api/produits/codes-article', { preHandler: S.exigerConnexion() }, async () =>
    (await pool.query('select code, libelle, actif, version, maj_le from pf.codes_article order by code')).rows);

  app.post('/api/produits/codes-article', {
    preHandler: exige('parametres.codes_article', 'creer'),
    schema: { body: { type: 'object', required: ['code', 'libelle'], additionalProperties: false,
      properties: { code: { type: 'string', maxLength: 10 }, libelle: { type: 'string', maxLength: 80 } } } },
  }, async (req, reply) => {
    const code = String(req.body.code || '').trim().toUpperCase();
    const libelle = String(req.body.libelle || '').trim();
    if (!/^[A-Z][A-Z0-9]{0,9}$/.test(code)) return erreur(reply, 400, 'code_invalide', 'Code : 1 à 10 lettres majuscules ou chiffres, commençant par une lettre.');
    if (!libelle) return erreur(reply, 400, 'libelle_manquant', 'Indiquez le libellé du code article.');
    return transaction(async (c) => {
      try {
        await c.query('insert into pf.codes_article (code, libelle, maj_par) values ($1, $2, $3)', [code, libelle, req.utilisateur.id]);
      } catch (e) {
        if (e.code === '23505') return erreur(reply, 409, 'code_pris', 'Ce code article existe déjà (éventuellement désactivé : réactivez-le).');
        throw e;
      }
      await S.auditer(c, req, 'code_article_cree', { entite: 'code_article', entiteId: code, apres: { code, libelle } });
      reply.code(201);
      return (await c.query('select code, libelle, actif, version, maj_le from pf.codes_article order by code')).rows;
    });
  });

  app.put('/api/produits/codes-article/:code', {
    preHandler: exige('parametres.codes_article', 'modifier'),
    schema: { params: { type: 'object', properties: { code: { type: 'string', maxLength: 10 } } },
      body: { type: 'object', required: ['version'], additionalProperties: false,
        properties: { version: { type: 'integer' }, libelle: { type: 'string', maxLength: 80 }, actif: { type: 'boolean' } } } },
  }, async (req, reply) => transaction(async (c) => {
    const code = req.params.code.toUpperCase();
    const avant = (await c.query('select * from pf.codes_article where code = $1 for update', [code])).rows[0];
    if (!avant) return erreur(reply, 404, 'introuvable', 'Code article introuvable.');
    if (avant.version !== req.body.version) return erreur(reply, 409, 'conflit_version', 'Code modifié entre-temps sur un autre poste. Rechargez.');
    // Un code utilisé par un produit fini ne se désactive pas deux fois : contrôle de bon sens.
    if (req.body.actif === false) {
      const utilises = (await c.query('select count(*)::int n from pf.produits where code_article = $1', [code])).rows[0].n;
      if (utilises) return erreur(reply, 400, 'code_utilise', `Ce code est déjà utilisé par ${utilises} produit(s) fini(s) : il reste actif.`);
    }
    const libelle = req.body.libelle?.trim() || avant.libelle;
    const actif = req.body.actif ?? avant.actif;
    await c.query('update pf.codes_article set libelle = $2, actif = $3, version = version + 1, maj_le = now(), maj_par = $4 where code = $1',
      [code, libelle, actif, req.utilisateur.id]);
    await S.auditer(c, req, 'code_article_modifie', { entite: 'code_article', entiteId: code,
      avant: { libelle: avant.libelle, actif: avant.actif }, apres: { libelle, actif } });
    return (await c.query('select code, libelle, actif, version, maj_le from pf.codes_article order by code')).rows;
  }));

  // « Supprimer » un code = le désactiver (rien n'est supprimé ; la liste § 2 reste complète).
  app.delete('/api/produits/codes-article/:code', {
    preHandler: exige('parametres.codes_article', 'supprimer'),
    schema: { params: { type: 'object', properties: { code: { type: 'string', maxLength: 10 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const code = req.params.code.toUpperCase();
    const avant = (await c.query('select * from pf.codes_article where code = $1 for update', [code])).rows[0];
    if (!avant) return erreur(reply, 404, 'introuvable', 'Code article introuvable.');
    await c.query('update pf.codes_article set actif = false, version = version + 1, maj_le = now(), maj_par = $2 where code = $1', [code, req.utilisateur.id]);
    await S.auditer(c, req, 'code_article_desactive', { entite: 'code_article', entiteId: code, avant: { actif: avant.actif }, apres: { actif: false } });
    return { ok: true };
  }));

  // ------------------------------------------------------------ coûts et tarifs (Paramètres, valeurs datées)
  app.get('/api/produits/couts', { preHandler: S.exigerConnexion() }, async (req) => {
    const [couts, tarifs] = await Promise.all([lireCoutsDetail(pool), lireTarifsDetail(pool)]);
    const peutVoir = D.voit(req.droits, 'couts') || req.droits.super_admin;
    return { couts: peutVoir ? couts : null, tarifs: peutVoir ? tarifs : null,
      en_vigueur: peutVoir ? Object.fromEntries([...(couts || []), ...(tarifs || [])].map((x) => [x.code, x.valeur])) : {} };
  });

  app.post('/api/produits/couts', {
    preHandler: exige('parametres.couts', 'modifier'),
    schema: { body: { type: 'object', required: ['code', 'valeur', 'en_vigueur_le'], additionalProperties: false,
      properties: { code: { type: 'string', maxLength: 40 }, valeur: { type: 'number', minimum: 0, maximum: 1000000 },
        en_vigueur_le: { type: 'string', format: 'date' }, commentaire: { type: 'string', maxLength: 300 } } } },
  }, async (req, reply) => {
    const LIBELLES = { cout_minute: ['Coût minute (industrialisation)', 'DT'], perte_matiere: ['Perte matière générale', '%'], marge_defaut: ['Marge par défaut', '%'] };
    const l = LIBELLES[req.body.code];
    if (!l) return erreur(reply, 400, 'code_inconnu', 'Coût inconnu (coût_minute, perte_matiere, marge_defaut).');
    if (req.body.code === 'perte_matiere' && req.body.valeur > 100) return erreur(reply, 400, 'valeur_invalide', 'Une perte en pourcentage ne dépasse pas 100.');
    try {
      return await transaction(async (c) => {
        const r = await c.query('insert into parametres.couts (code, libelle, valeur, unite, en_vigueur_le, commentaire, cree_par) values ($1,$2,$3,$4,$5,$6,$7) returning id',
          [req.body.code, l[0], req.body.valeur, l[1], req.body.en_vigueur_le, (req.body.commentaire || '').trim(), req.utilisateur.id]);
        await S.auditer(c, req, 'cout_ajoute', { entite: 'cout', entiteId: r.rows[0].id,
          apres: { code: req.body.code, valeur: req.body.valeur, unite: l[1], en_vigueur_le: req.body.en_vigueur_le } });
        reply.code(201);
        return { ok: true, couts: await lireCoutsDetail(c) };
      });
    } catch (e) { if (e.code === '23505') return erreur(reply, 409, 'date_prise', 'Une valeur existe déjà pour ce coût à cette date.'); throw e; }
  });

  app.post('/api/produits/tarifs-marquages', {
    preHandler: exige('parametres.couts', 'modifier'),
    schema: { body: { type: 'object', required: ['code', 'libelle', 'unite', 'prix', 'en_vigueur_le'], additionalProperties: false,
      properties: { code: { type: 'string', maxLength: 40 }, libelle: { type: 'string', maxLength: 80 },
        unite: { type: 'string', enum: ['par_face', 'par_1000_points', 'par_piece'] },
        prix: { type: 'number', minimum: 0, maximum: 1000000 }, en_vigueur_le: { type: 'string', format: 'date' },
        commentaire: { type: 'string', maxLength: 300 } } } },
  }, async (req, reply) => {
    const code = req.body.code.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(code)) return erreur(reply, 400, 'code_invalide', 'Code : minuscules, chiffres et souligné.');
    try {
      return await transaction(async (c) => {
        const r = await c.query('insert into parametres.tarifs_marquages (code, libelle, unite, prix, en_vigueur_le, commentaire, cree_par) values ($1,$2,$3,$4,$5,$6,$7) returning id',
          [code, req.body.libelle.trim(), req.body.unite, req.body.prix, req.body.en_vigueur_le, (req.body.commentaire || '').trim(), req.utilisateur.id]);
        await S.auditer(c, req, 'tarif_marquage_ajoute', { entite: 'tarif_marquage', entiteId: r.rows[0].id,
          apres: { code, prix: req.body.prix, unite: req.body.unite, en_vigueur_le: req.body.en_vigueur_le } });
        reply.code(201);
        return { ok: true, tarifs: await lireTarifsDetail(c) };
      });
    } catch (e) { if (e.code === '23505') return erreur(reply, 409, 'date_prise', 'Une valeur existe déjà pour ce tarif à cette date.'); throw e; }
  });

  // ------------------------------------------------------------ produits finis
  app.get('/api/produits', { preHandler: exige('commercial.produits_finis', 'lire') }, async (req) => {
    const r = await pool.query(`select id, reference, code_article, numero, annee, sexe, etat, client_id, client_nom,
      taillant, bom, gamme, marquages, cout_matieres, cout_industrialisation, cout_marquages, pri, marge, prix_ht,
      prix_source, minutes_gamme, note, version, annule, cree_le, maj_le from pf.produits where annule = false
      order by annee desc, code_article, numero desc`);
    return r.rows.map((p) => masquer(req.droits, p));
  });

  app.get('/api/produits/:id', {
    preHandler: exige('commercial.produits_finis', 'lire'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (req, reply) => {
    const p = await lireFiche(pool, req.params.id);
    if (!p) return erreur(reply, 404, 'introuvable', 'Produit fini introuvable.');
    const hist = (await pool.query(`select h.version, h.action, h.horodatage, u.identifiant as utilisateur, h.donnees
      from pf.historique h left join noyau.utilisateurs u on u.id = h.utilisateur
      where produit_id = $1 order by h.version desc limit 50`, [req.params.id])).rows;
    return { ...masquer(req.droits, p), historique: hist.map((h) => ({ ...h, donnees: masquer(req.droits, h.donnees) })) };
  });

  // Création : la référence est attribuée par le serveur, dans la transaction (sans doublon ni trou).
  app.post('/api/produits', {
    preHandler: exige('commercial.produits_finis', 'creer'), bodyLimit: 1024 * 1024,
    schema: { body: { type: 'object', required: ['code_article', 'sexe'], additionalProperties: false,
      properties: { code_article: { type: 'string', maxLength: 10 }, sexe: { type: 'string', enum: SECTES },
        illustration: { type: 'string', maxLength: 700000 }, taillant: { type: 'array', maxItems: 30 },
        bom: { type: 'array', maxItems: 100 }, gamme: { type: 'array', maxItems: 100 }, marquages: { type: 'array', maxItems: 20 },
        note: { type: 'string', maxLength: 1000 }, client_id: { type: 'string', maxLength: 40, nullable: true },
        marge: { type: 'number', minimum: 0, maximum: 1000 }, prix_source: { type: 'string', enum: ['calcule', 'manuel', 'devis'] },
        prix_ht: { type: 'number', minimum: 0, maximum: 1000000 }, confirmer_perte: { type: 'boolean' } } } },
  }, async (req, reply) => {
    const code = String(req.body.code_article || '').trim().toUpperCase();
    const sexe = req.body.sexe;
    if (!SECTES.includes(sexe)) return erreur(reply, 400, 'sexe_invalide', 'Sexe : B Bébé, E Enfant, F Femme, H Homme, U Unisexe.');
    if ((req.body.prix_source === 'manuel' || req.body.prix_source === 'devis') && !D.voit(req.droits, 'prix'))
      return erreur(reply, 403, 'interdit', 'Saisir un prix à la main ou depuis un devis demande de voir les prix.');
    if (req.body.client_id) {
      const cl = (await pool.query(`select donnees->>'name' as nom from commercial.documents
        where collection = 'clients' and id = $1`, [req.body.client_id])).rows[0];
      if (!cl) return erreur(reply, 400, 'client_inconnu', 'Client introuvable.');
      req.body.client_nom = cl.nom;
    }
    return transaction(async (c) => {
      const ref = (await c.query('select pf.attribuer_reference($1, $2) as r', [code, sexe])).rows[0].r;
      req.body.reference = ref;
      req.body.code_article = code;
      const m = ref.match(/^([A-Z]+)([0-9]{3})([0-9]{2})[BEFHU]$/);
      req.body.numero = Number(m[2]); req.body.annee = 2000 + Number(m[3]);
      const res = await calculerEtEnregistrer(c, req, req.body, null);
      if (res.erreur_saisie) return erreur(reply, 400, 'saisie_invalide', res.erreur_saisie);
      if (res.vente_a_perte && !req.body.confirmer_perte) return erreur(reply, 409, 'vente_a_perte',
        `Attention : vente à perte. Prix de revient ${res.vente_a_perte.pri.toFixed(3)} DT, prix proposé ${res.vente_a_perte.prix_propose.toFixed(3)} DT. Cochez « Confirmer la vente à perte » pour enregistrer.`, res.vente_a_perte);
      const fiche = await lireFiche(c, (await c.query('select id from pf.produits where reference = $1', [ref])).rows[0].id);
      await c.query('insert into pf.historique (produit_id, version, action, donnees, utilisateur) values ($1, 1, \'cree\', $2, $3)',
        [fiche.id, fiche, req.utilisateur.id]);
      await S.auditer(c, req, 'produit_cree', { entite: 'produit_fini', entiteId: fiche.id,
        apres: { reference: fiche.reference, etat: fiche.etat, prix_ht: D.voit(req.droits, 'prix') ? Number(fiche.prix_ht) : undefined,
          vente_a_perte: res.vente_a_perte ? true : undefined } });
      reply.code(201);
      return masquer(req.droits, fiche);
    });
  });

  // Modification : verrou de version, recalcul complet, historique.
  app.put('/api/produits/:id', {
    preHandler: exige('commercial.produits_finis', 'modifier'), bodyLimit: 1024 * 1024,
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: { type: 'object', required: ['version'], additionalProperties: false,
        properties: { version: { type: 'integer' }, illustration: { type: 'string', maxLength: 700000 },
          taillant: { type: 'array', maxItems: 30 }, bom: { type: 'array', maxItems: 100 }, gamme: { type: 'array', maxItems: 100 },
          marquages: { type: 'array', maxItems: 20 }, note: { type: 'string', maxLength: 1000 },
          client_id: { type: 'string', maxLength: 40, nullable: true }, marge: { type: 'number', minimum: 0, maximum: 1000 },
          prix_source: { type: 'string', enum: ['calcule', 'manuel', 'devis'] }, prix_ht: { type: 'number', minimum: 0, maximum: 1000000 },
          confirmer_perte: { type: 'boolean' } } } },
  }, async (req, reply) => {
    if ((req.body.prix_source === 'manuel' || req.body.prix_source === 'devis') && !D.voit(req.droits, 'prix'))
      return erreur(reply, 403, 'interdit', 'Saisir un prix à la main ou depuis un devis demande de voir les prix.');
    return transaction(async (c) => {
      const avant = (await c.query('select * from pf.produits where id = $1 for update', [req.params.id])).rows[0];
      if (!avant) return erreur(reply, 404, 'introuvable', 'Produit fini introuvable.');
      if (avant.annule) return erreur(reply, 400, 'annule', 'Ce produit fini est annulé : il ne se modifie plus.');
      if (avant.version !== req.body.version) return erreur(reply, 409, 'conflit_version', 'Le produit fini a été modifié sur un autre poste. Rechargez la page.');
      if (req.body.client_id !== undefined && req.body.client_id) {
        const cl = (await c.query(`select donnees->>'name' as nom from commercial.documents
          where collection = 'clients' and id = $1`, [req.body.client_id])).rows[0];
        if (!cl) return erreur(reply, 400, 'client_inconnu', 'Client introuvable.');
        req.body.client_nom = cl.nom;
      }
      const champ = champsFiche(req.body);
      const fusion = { illustration: avant.illustration, taillant: avant.taillant, bom: avant.bom, gamme: avant.gamme,
        marquages: avant.marquages, note: avant.note, client_id: avant.client_id, client_nom: avant.client_nom,
        marge: Number(avant.marge), prix_source: avant.prix_source, prix_ht: Number(avant.prix_ht), ...champ };
      if (fusion.client_id !== undefined) fusion.client_nom = req.body.client_nom ?? (fusion.client_id ? avant.client_nom : '');
      const res = await calculerEtEnregistrer(c, req, fusion, avant.id);
      if (res.erreur_saisie) return erreur(reply, 400, 'saisie_invalide', res.erreur_saisie);
      if (res.vente_a_perte && !req.body.confirmer_perte) return erreur(reply, 409, 'vente_a_perte',
        `Attention : vente à perte. Prix de revient ${res.vente_a_perte.pri.toFixed(3)} DT, prix proposé ${res.vente_a_perte.prix_propose.toFixed(3)} DT. Cochez « Confirmer la vente à perte » pour enregistrer.`, res.vente_a_perte);
      const fiche = await lireFiche(c, avant.id);
      const action = fiche.etat !== avant.etat ? 'etat_change' : 'modifie';
      await c.query('insert into pf.historique (produit_id, version, action, donnees, utilisateur) values ($1, $2, $3, $4, $5)',
        [avant.id, fiche.version, action, fiche, req.utilisateur.id]);
      await S.auditer(c, req, action === 'etat_change' ? 'produit_etat_change' : 'produit_modifie',
        { entite: 'produit_fini', entiteId: avant.id, avant: { etat: avant.etat, reference: avant.reference },
          apres: { etat: fiche.etat, reference: fiche.reference, vente_a_perte: res.vente_a_perte ? true : undefined } });
      return masquer(req.droits, fiche);
    });
  });

  // Annulation (rien n'est supprimé) : réservée à ceux qui peuvent annuler.
  app.post('/api/produits/:id/annuler', {
    preHandler: exige('commercial.produits_finis', 'annuler'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: { type: 'object', additionalProperties: false, properties: { version: { type: 'integer' }, motif: { type: 'string', maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const avant = (await c.query('select * from pf.produits where id = $1 for update', [req.params.id])).rows[0];
    if (!avant) return erreur(reply, 404, 'introuvable', 'Produit fini introuvable.');
    if (avant.annule) return erreur(reply, 400, 'deja_annule', 'Ce produit fini est déjà annulé.');
    const utilises = (await c.query(`select count(*)::int n from commercial.documents
      where collection in ('orders','invoices') and donnees->'lines' @> $1::jsonb`, [JSON.stringify([{ produit: String(avant.reference) }])])).rows[0].n;
    await c.query('update pf.produits set annule = true, version = version + 1, maj_le = now(), maj_par = $2 where id = $1', [avant.id, req.utilisateur.id]);
    await c.query('insert into pf.historique (produit_id, version, action, donnees, utilisateur) values ($1, $2, \'annule\', $3, $4)',
      [avant.id, avant.version + 1, { motif: (req.body.motif || '').trim() }, req.utilisateur.id]);
    await S.auditer(c, req, 'produit_annule', { entite: 'produit_fini', entiteId: avant.id,
      avant: { reference: avant.reference, annule: false }, apres: { annule: true }, details: { motif: (req.body.motif || '').trim() } });
    return { ok: true };
  }));

  // ------------------------------------------------------------ conversion d'un article 0.7.0 (spec § 5)
  app.post('/api/produits/convertir-article', {
    preHandler: exige('commercial.produits_finis', 'creer'),
    schema: { body: { type: 'object', required: ['article_id', 'code_article', 'sexe'], additionalProperties: false,
      properties: { article_id: { type: 'integer' }, code_article: { type: 'string', maxLength: 10 }, sexe: { type: 'string', enum: SECTES } } } },
  }, async (req, reply) => transaction(async (c) => {
    const a = (await c.query('select * from commercial.articles where id = $1 for update', [req.body.article_id])).rows[0];
    if (!a) return erreur(reply, 404, 'introuvable', 'Article introuvable.');
    if (a.type !== 'produit') return erreur(reply, 400, 'pas_un_produit', 'Seuls les articles de type « produit » deviennent des produits finis (les prestations restent des articles).');
    if (a.produit_id) return erreur(reply, 400, 'deja_converti', 'Cet article est déjà converti en produit fini.');
    if (!a.actif) return erreur(reply, 400, 'inactif', 'Cet article est désactivé.');
    const code = String(req.body.code_article || '').toUpperCase();
    const ref = (await c.query('select pf.attribuer_reference($1, $2) as r', [code, req.body.sexe])).rows[0].r;
    const m = ref.match(/^([A-Z]+)([0-9]{3})([0-9]{2})[BEFHU]$/);
    const couts = await PF.lireCouts(c);
    const calc = PF.calculer({ bom: [], gamme: [], marquages: [] }, null, couts, {});
    const fiche = (await c.query(`insert into pf.produits (reference, code_article, numero, annee, sexe, etat, prix_ht, prix_source,
      note, cree_par, maj_par) values ($1,$2,$3,$4,$5,'basique',$6,'manuel',$7,$8,$8) returning id`,
      [ref, code, Number(m[2]), 2000 + Number(m[3]), req.body.sexe, a.prix_ht,
       `Converti depuis l’article 0.7.0 ${a.code} — ancien code conservé comme alias.`,
       req.utilisateur.id])).rows[0];
    await c.query('update commercial.articles set produit_id = $2 where id = $1', [a.id, fiche.id]);
    await c.query('insert into pf.historique (produit_id, version, action, donnees, utilisateur) values ($1, 1, \'cree\', $2, $3)',
      [fiche.id, await lireFiche(c, fiche.id), req.utilisateur.id]);
    await S.auditer(c, req, 'article_converti', { entite: 'produit_fini', entiteId: fiche.id,
      apres: { reference: ref, article: a.code, prix_ht: Number(a.prix_ht) } });
    reply.code(201);
    return masquer(req.droits, await lireFiche(c, fiche.id));
  }));

  // Aperçu de la prochaine référence (affichage, sans attribution).
  app.get('/api/produits/prochaine-reference/:code/:sexe', {
    preHandler: exige('commercial.produits_finis', 'lire'),
    schema: { params: { type: 'object', properties: { code: { type: 'string', maxLength: 10 }, sexe: { type: 'string', enum: SECTES } } } },
  }, async (req) => {
    const r = (await pool.query(`select coalesce(max(dernier), 0) d from pf.compteurs_ref
      where code = $1 and annee = extract(year from current_date)::int and sexe = $2`, [req.params.code.toUpperCase(), req.params.sexe])).rows[0];
    return { prochaine: `${req.params.code.toUpperCase()}${String(r.d + 1).padStart(3, '0')}${String(new Date().getFullYear()).slice(2)}${req.params.sexe}` };
  });
};

// Détails des coûts/tarifs (avec historique des valeurs datées) — pour l'écran Paramètres.
async function lireCoutsDetail(db) {
  return (await db.query(`select c.id, c.code, c.libelle, c.valeur::float8 as valeur, c.unite,
    to_char(c.en_vigueur_le, 'YYYY-MM-DD') as en_vigueur_le, c.commentaire,
    (c.en_vigueur_le = (select max(x.en_vigueur_le) from parametres.couts x where x.code = c.code and x.en_vigueur_le <= current_date)) as en_vigueur
    from parametres.couts c order by c.code, c.en_vigueur_le desc`)).rows;
}
async function lireTarifsDetail(db) {
  return (await db.query(`select t.id, t.code, t.libelle, t.unite, t.prix::float8 as prix,
    to_char(t.en_vigueur_le, 'YYYY-MM-DD') as en_vigueur_le, t.commentaire,
    (t.en_vigueur_le = (select max(x.en_vigueur_le) from parametres.tarifs_marquages x where x.code = t.code and x.en_vigueur_le <= current_date)) as en_vigueur
    from parametres.tarifs_marquages t order by t.code, t.en_vigueur_le desc`)).rows;
}