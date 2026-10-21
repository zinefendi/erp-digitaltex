'use strict';
// Module 10 Paramètres : société, fiscalité datée, numérotation ; tableau d'accueil.
// Lecture : tout compte connecté (ces informations figurent sur les documents émis).
// Écriture : droit parametres.<fonction>/modifier (Super administrateur par défaut).
const { pool, transaction } = require('./db');
const S = require('./securite');
const D = require('./droits');

const CONNECTE = S.exigerConnexion();
const erreur = (reply, code, err, message) => reply.code(code).send({ erreur: err, message });

const CHAMPS_SOCIETE = ['nom', 'adresse', 'ville', 'telephone', 'email', 'web', 'mf', 'rc', 'banque', 'rib', 'logo', 'mentions'];
const lireSociete = async (db) => (await db.query(`select ${CHAMPS_SOCIETE.join(', ')}, version, maj_le from parametres.societe where id = 1`)).rows[0];

/** Champs à compléter avant d'émettre une facture (aucune règle inventée : ceux que l'app 3.3.0 exigeait déjà + RC/RIB signalés). */
function manquants(s) {
  const m = [];
  if (!s.nom.trim()) m.push('nom');
  if (!s.adresse.trim()) m.push('adresse');
  if (!s.mf.trim()) m.push('matricule fiscal');
  if (!s.rc.trim()) m.push('registre de commerce');
  if (!s.rib.trim()) m.push('RIB');
  return m;
}

const lireFiscalite = async (db) => (await db.query(`select f.id, f.code, f.libelle, f.valeur::float8 as valeur, f.unite, to_char(f.en_vigueur_le, 'YYYY-MM-DD') as en_vigueur_le,
    f.commentaire, f.cree_le, u.identifiant as cree_par,
    (f.en_vigueur_le = (select max(x.en_vigueur_le) from parametres.fiscalite x where x.code = f.code and x.en_vigueur_le <= current_date)) as en_vigueur,
    f.en_vigueur_le > current_date as a_venir
  from parametres.fiscalite f left join noyau.utilisateurs u on u.id = f.cree_par order by f.code, f.en_vigueur_le desc`)).rows;

const lireNumerotation = async (db) => (await db.query(`select n.type, n.libelle, n.prefixe, n.chiffres, n.version,
    coalesce(c.dernier, 0) as dernier,
    n.prefixe || '-' || extract(year from current_date)::int || '-' || lpad((coalesce(c.dernier, 0) + 1)::text, n.chiffres, '0') as prochain
  from parametres.numerotation n left join parametres.compteurs c on c.type = n.type and c.annee = extract(year from current_date)::int
  order by n.ordre`)).rows;

module.exports = async function routesParametres(app) {
  // ------------------------------------------------------------ Société
  app.get('/api/parametres/societe', { preHandler: CONNECTE }, async () => {
    const s = await lireSociete(pool);
    return { ...s, a_completer: manquants(s) };
  });

  app.put('/api/parametres/societe', {
    preHandler: S.exigerConnexion({ droit: ['parametres.societe', 'modifier'] }),
    bodyLimit: 1024 * 1024,
    schema: { body: { type: 'object', required: ['version'], additionalProperties: false, properties: {
      version: { type: 'integer' },
      nom: { type: 'string', maxLength: 120 }, adresse: { type: 'string', maxLength: 200 }, ville: { type: 'string', maxLength: 80 },
      telephone: { type: 'string', maxLength: 40 }, email: { type: 'string', maxLength: 120 }, web: { type: 'string', maxLength: 120 },
      mf: { type: 'string', maxLength: 40 }, rc: { type: 'string', maxLength: 40 }, banque: { type: 'string', maxLength: 80 },
      rib: { type: 'string', maxLength: 30 }, logo: { type: 'string', maxLength: 700000 }, mentions: { type: 'string', maxLength: 1000 } } } },
  }, async (req, reply) => {
    const b = { ...req.body };
    if (b.rib !== undefined) b.rib = b.rib.replace(/\s+/g, '');
    if (b.rib && !/^[0-9]{20}$/.test(b.rib)) return erreur(reply, 400, 'rib_invalide', 'Le RIB doit contenir exactement 20 chiffres.');
    if (b.logo && !/^data:image\/(png|jpeg|webp);base64,/.test(b.logo)) return erreur(reply, 400, 'logo_invalide', 'Logo : image PNG, JPEG ou WebP uniquement.');
    if (b.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email.trim())) return erreur(reply, 400, 'email_invalide', 'Adresse e-mail invalide.');
    return transaction(async (c) => {
      const avant = (await c.query(`select ${CHAMPS_SOCIETE.join(', ')}, version from parametres.societe where id = 1 for update`)).rows[0];
      if (avant.version !== b.version) return erreur(reply, 409, 'conflit_version', 'Les informations de la société ont été modifiées entre-temps. Rechargez la page.');
      const champs = CHAMPS_SOCIETE.filter((k) => b[k] !== undefined);
      if (champs.length) {
        await c.query(`update parametres.societe set ${champs.map((k, i) => `${k} = $${i + 1}`).join(', ')},
          version = version + 1, maj_le = now(), maj_par = $${champs.length + 1} where id = 1`,
        [...champs.map((k) => (k === 'logo' || k === 'mentions' ? b[k] : b[k].trim())), req.utilisateur.id]);
      }
      const apres = await lireSociete(c);
      // le logo n'est pas recopié dans le journal (trop volumineux) : seulement s'il a changé
      const sansLogo = (x) => { const { logo, ...r } = x; return { ...r, logo: logo ? `image (${logo.length} car.)` : '' }; };
      await S.auditer(c, req, 'societe_modifiee', { entite: 'societe', entiteId: 1, avant: sansLogo(avant), apres: sansLogo(apres) });
      return { ...apres, a_completer: manquants(apres) };
    });
  });

  // ------------------------------------------------------------ Fiscalité
  app.get('/api/parametres/fiscalite', { preHandler: CONNECTE }, async () => lireFiscalite(pool));

  // Nouvelle valeur datée (on n'écrase jamais une valeur passée).
  app.post('/api/parametres/fiscalite', {
    preHandler: S.exigerConnexion({ droit: ['parametres.fiscalite', 'modifier'] }),
    schema: { body: { type: 'object', required: ['code', 'valeur', 'en_vigueur_le'], additionalProperties: false, properties: {
      code: { type: 'string', maxLength: 40 }, libelle: { type: 'string', minLength: 2, maxLength: 80 },
      valeur: { type: 'number', minimum: 0, maximum: 1000000 }, unite: { type: 'string', enum: ['%', 'DT'] },
      en_vigueur_le: { type: 'string', format: 'date' }, commentaire: { type: 'string', maxLength: 300 } } } },
  }, async (req, reply) => {
    const b = req.body;
    const code = b.code.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(code)) return erreur(reply, 400, 'code_invalide', 'Code : minuscules sans accent, chiffres et souligné.');
    const existant = (await pool.query('select libelle, unite from parametres.fiscalite where code = $1 order by en_vigueur_le desc limit 1', [code])).rows[0];
    const libelle = b.libelle?.trim() || existant?.libelle, unite = b.unite || existant?.unite;
    if (!libelle || !unite) return erreur(reply, 400, 'incomplet', 'Pour un nouveau taux, indiquez le libellé et l’unité.');
    if (existant && unite !== existant.unite) return erreur(reply, 400, 'unite_differente', `Ce taux s’exprime en ${existant.unite}.`);
    if (unite === '%' && b.valeur > 100) return erreur(reply, 400, 'valeur_invalide', 'Un pourcentage ne peut pas dépasser 100.');
    const passe = (await pool.query('select $1::date < current_date as p', [b.en_vigueur_le])).rows[0].p;
    try {
      return await transaction(async (c) => {
        const r = await c.query(`insert into parametres.fiscalite (code, libelle, valeur, unite, en_vigueur_le, commentaire, cree_par)
          values ($1, $2, $3, $4, $5, $6, $7) returning id`, [code, libelle, b.valeur, unite, b.en_vigueur_le, (b.commentaire || '').trim(), req.utilisateur.id]);
        await S.auditer(c, req, 'fiscalite_ajoutee', { entite: 'fiscalite', entiteId: r.rows[0].id,
          apres: { code, libelle, valeur: b.valeur, unite, en_vigueur_le: b.en_vigueur_le }, details: passe ? { date_passee: true } : null });
        reply.code(201);
        return { ok: true, avertissement: passe ? 'Date d’effet dans le passé : les documents déjà émis gardent le taux qu’ils portent ; seuls les nouveaux documents datés après cette date utiliseront ce taux.' : null, fiscalite: await lireFiscalite(c) };
      });
    } catch (e) {
      if (e.code === '23505') return erreur(reply, 409, 'date_prise', 'Une valeur existe déjà pour ce taux à cette date.');
      throw e;
    }
  });

  // Seule une valeur pas encore en vigueur peut être retirée (erreur de saisie).
  app.delete('/api/parametres/fiscalite/:id', {
    preHandler: S.exigerConnexion({ droit: ['parametres.fiscalite', 'modifier'] }),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (req, reply) => transaction(async (c) => {
    const f = (await c.query(`select *, en_vigueur_le > current_date as a_venir from parametres.fiscalite where id = $1 for update`, [req.params.id])).rows[0];
    if (!f) return erreur(reply, 404, 'introuvable', 'Valeur introuvable.');
    if (!f.a_venir) return erreur(reply, 400, 'deja_en_vigueur', 'Une valeur déjà entrée en vigueur ne se supprime pas : ajoutez une nouvelle valeur datée.');
    await c.query('delete from parametres.fiscalite where id = $1', [f.id]);
    await S.auditer(c, req, 'fiscalite_retiree', { entite: 'fiscalite', entiteId: f.id, avant: { code: f.code, valeur: Number(f.valeur), en_vigueur_le: f.en_vigueur_le } });
    return { ok: true, fiscalite: await lireFiscalite(c) };
  }));

  // ------------------------------------------------------------ Numérotation
  app.get('/api/parametres/numerotation', { preHandler: CONNECTE }, async () => lireNumerotation(pool));

  // Préfixe et nombre de chiffres modifiables ; les compteurs, jamais (ni doublon ni trou).
  app.put('/api/parametres/numerotation/:type', {
    preHandler: S.exigerConnexion({ droit: ['parametres.numerotation', 'modifier'] }),
    schema: { params: { type: 'object', properties: { type: { type: 'string', maxLength: 30 } } },
      body: { type: 'object', required: ['version'], additionalProperties: false, properties: {
        version: { type: 'integer' }, prefixe: { type: 'string', maxLength: 6 }, chiffres: { type: 'integer', minimum: 3, maximum: 6 } } } },
  }, async (req, reply) => {
    const prefixe = req.body.prefixe?.trim().toUpperCase();
    if (prefixe !== undefined && !/^[A-Z0-9]{1,6}$/.test(prefixe)) return erreur(reply, 400, 'prefixe_invalide', 'Préfixe : 1 à 6 lettres majuscules ou chiffres, sans espace ni tiret.');
    return transaction(async (c) => {
      const avant = (await c.query('select * from parametres.numerotation where type = $1 for update', [req.params.type])).rows[0];
      if (!avant) return erreur(reply, 404, 'introuvable', 'Type de document inconnu.');
      if (avant.version !== req.body.version) return erreur(reply, 409, 'conflit_version', 'Cette numérotation a été modifiée entre-temps. Rechargez la page.');
      if (prefixe && prefixe !== avant.prefixe) {
        const pris = (await c.query('select libelle from parametres.numerotation where prefixe = $1 and type <> $2', [prefixe, avant.type])).rows[0];
        if (pris) return erreur(reply, 409, 'prefixe_pris', `Le préfixe ${prefixe} est déjà utilisé par : ${pris.libelle}.`);
      }
      const ch = req.body.chiffres ?? avant.chiffres;
      const max = (await c.query('select coalesce(max(dernier), 0) m from parametres.compteurs where type = $1', [avant.type])).rows[0].m;
      if (String(max + 1).length > ch) return erreur(reply, 400, 'chiffres_insuffisants', `Le compteur est déjà à ${max} : il faut au moins ${String(max + 1).length} chiffres.`);
      await c.query('update parametres.numerotation set prefixe = $2, chiffres = $3, version = version + 1, maj_le = now() where type = $1', [avant.type, prefixe ?? avant.prefixe, ch]);
      const apres = (await c.query('select * from parametres.numerotation where type = $1', [avant.type])).rows[0];
      await S.auditer(c, req, 'numerotation_modifiee', { entite: 'numerotation', entiteId: avant.type,
        avant: { prefixe: avant.prefixe, chiffres: avant.chiffres }, apres: { prefixe: apres.prefixe, chiffres: apres.chiffres } });
      return lireNumerotation(c);
    });
  });

  // ------------------------------------------------------------ Accueil : 10 modules
  // État de chaque module (lot du calendrier) et compteurs utiles — sans montant si non autorisé.
  const LOTS = {
    infographie: { lot: 3, etat: 'Studio 3D et catalogue en réseau · Lookbook au lot 10', actif: true },
    commercial: { lot: 4, etat: 'Clients, commandes, BL, factures, articles hors Studio · devis, proformas, avoirs au lot 4', actif: true },
    compta_clients: { lot: 8, etat: 'Encours, encaissements et lettrage, relances, exports CSV / Excel', actif: true },
    compta_fournisseurs: { lot: 8, etat: 'Factures et règlements fournisseurs, balance âgée, exports · commandes d’achat au lot 6', actif: true },
    paie: { lot: 9, etat: 'Prévu au lot 9' },
    production: { lot: 7, etat: 'Plan de charge des commandes en service · OF en 3 parties au lot 7', actif: true },
    bom: { lot: 7, etat: 'Fiches articles en lecture · nomenclatures au lot 7', actif: true },
    stock_mp: { lot: 6, etat: 'Fichier des matières en service · mouvements au lot 6', actif: true },
    stock_pf: { lot: 6, etat: 'Prévu au lot 6' },
    parametres: { lot: 2, etat: 'En service', actif: true },
    compta_generale: { lot: 8, etat: 'Retenues à la source, journaux et balance, plan comptable, CMUP', actif: true },
  };
  app.get('/api/accueil', { preHandler: CONNECTE }, async (req) => {
    const cat = await D.catalogue();
    const eff = req.droits;
    const modules = cat.modules.filter((m) => m.fonctions.some((f) => D.peut(eff, f.code, 'lire')))
      .map((m) => ({ code: m.code, numero: m.numero, libelle: m.libelle, ...LOTS[m.code], actif: !!LOTS[m.code]?.actif,
        fonctions: m.fonctions.filter((f) => D.peut(eff, f.code, 'lire')).map((f) => ({ code: f.code, libelle: f.libelle, actions: eff.super_admin ? f.actions : (eff.droits[f.code] || []) })) }));
    const r = { modules, visibilites: eff.visibilites, super_admin: eff.super_admin };
    if (D.peut(eff, 'parametres.utilisateurs', 'lire')) {
      r.comptes = (await pool.query(`select count(*) filter (where actif)::int actifs, count(*) filter (where actif and doit_changer_mdp)::int provisoires,
        count(*) filter (where verrouille_jusqu > now())::int verrouilles from noyau.utilisateurs`)).rows[0];
    }
    if (D.peut(eff, 'parametres.audit', 'lire')) {
      r.securite = (await pool.query(`select count(*) filter (where action = 'connexion_refusee')::int refus_24h,
        count(*) filter (where action = 'compte_verrouille')::int verrouillages_24h,
        count(distinct utilisateur_id) filter (where action = 'connexion')::int connectes_24h
        from noyau.audit where horodatage > now() - interval '24 hours'`)).rows[0];
    }
    if (D.peut(eff, 'parametres.societe', 'lire')) r.societe_a_completer = manquants(await lireSociete(pool));
    return r;
  });
};
