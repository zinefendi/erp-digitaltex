'use strict';
// Atelier (lot 0.12.0) — tablette PWA et version simple de l'affectation / du pointage
// (décisions du 23/10/2026 : affectation depuis le web, le responsable pointe pour tous,
// PIN 4 chiffres). La tablette réutilise les routes production existantes (même serveur,
// mêmes droits, jamais de prix) ; ce fichier ajoute : connexion par PIN, ouvriers,
// affectations, pointages et signalements. CDC §4.6.3 et §4.6.4.
const { pool, transaction } = require('./db');
const mdp = require('./mdp');
const S = require('./securite');
const D = require('./droits');
const { r3 } = require('./calculs');

const erreur = (reply, code, err, message) => reply.code(code).send({ erreur: err, message });
const exige = (f, a) => S.exigerConnexion({ droit: [f, a] });
const txt = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const REFUS = { erreur: 'identifiants', message: 'Identifiant ou code PIN incorrect.' };
const PIN_RE = /^\d{4}$/;

// ================================================================ CONNEXION PAR PIN (tablette atelier)
// Comme la connexion par mot de passe : même verrouillage (5 échecs / 15 min), mêmes sessions,
// mêmes droits ensuite. Le PIN n'est jamais renvoyé et son empreinte est hachée (scrypt).
module.exports = async function routesAtelier(app) {
  app.post('/api/auth/connexion-pin', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object', required: ['identifiant', 'pin'], additionalProperties: false,
        properties: { identifiant: { type: 'string', minLength: 1, maxLength: 60 }, pin: { type: 'string', minLength: 4, maxLength: 8 } },
      },
    },
  }, async (req, reply) => {
    const identifiant = req.body.identifiant.trim().toLowerCase();
    if (!PIN_RE.test(String(req.body.pin || ''))) {
      await S.auditer(pool, req, 'connexion_pin_refusee', { details: { identifiant, motif: 'pin_invalide' } });
      return reply.code(401).send(REFUS);
    }
    const r = await pool.query(
      `select id, identifiant, nom_complet, pin_hash, actif, pin_echecs, pin_verrouille_jusqu, pin_verrouille_jusqu > now() as verrouille
         from noyau.utilisateurs where identifiant = $1`, [identifiant]);
    const u = r.rows[0];
    const echoue = async (motif) => {
      if (motif === 'pin') {
        const echecs = (u?.pin_echecs || 0) + 1;
        const verrou = echecs >= S.ECHECS_AVANT_VERROU;
        if (u) await pool.query(
          `update noyau.utilisateurs set pin_echecs = $2, pin_verrouille_jusqu = case when $3 then now() + make_interval(secs => $4) else pin_verrouille_jusqu end where id = $1`,
          [u.id, verrou ? 0 : echecs, verrou, S.VERROU_MS / 1000]);
        await S.auditer(pool, req, verrou ? 'pin_verrouille' : 'connexion_pin_refusee', { utilisateur: u, details: { motif: 'pin', echecs } });
      } else {
        await S.auditer(pool, req, 'connexion_pin_refusee', { utilisateur: u, details: { motif } });
      }
      return reply.code(motif === 'verrouille' ? 423 : 401).send(motif === 'verrouille'
        ? { erreur: 'verrouille', message: 'PIN verrouillé après plusieurs erreurs. Réessayez dans 15 minutes ou demandez à l’administrateur.' }
        : REFUS);
    };
    if (!u || !u.pin_hash) return echoue(u ? 'sans_pin' : 'inconnu');
    if (u.verrouille) return echoue('verrouille');
    if (!(await mdp.verifier(req.body.pin, u.pin_hash))) return echoue('pin');
    if (!u.actif) return echoue('desactive');
    const jeton = await transaction(async (c) => {
      await c.query('update noyau.utilisateurs set pin_echecs = 0, pin_verrouille_jusqu = null, derniere_connexion = now() where id = $1', [u.id]);
      const j = await S.creerSession(c, req, u.id);
      await S.auditer(c, req, 'connexion_pin', { utilisateur: u });
      return j;
    });
    reply.setCookie(S.COOKIE, jeton, { path: '/', httpOnly: true, secure: true, sameSite: 'strict', maxAge: S.DUREE_MAX_MS / 1000 });
    return { jeton, utilisateur: { id: u.id, identifiant: u.identifiant, nom_complet: u.nom_complet } };
  });

  // ================================================================ OUVRIERS
  app.get('/api/prod/ouvriers', { preHandler: exige('production.taches', 'lire') }, async (req, reply) => {
    const r = await pool.query('select id, nom, poste, actif, to_char(cree_le, \'YYYY-MM-DD\') cree_le from prod.ouvriers order by actif desc, nom');
    return r.rows.map((x) => ({ ...x, id: Number(x.id) }));
  });

  app.post('/api/prod/ouvriers', {
    preHandler: exige('production.taches', 'creer'),
    schema: { body: { type: 'object', required: ['nom'], additionalProperties: false,
      properties: { nom: { type: 'string', minLength: 2, maxLength: 80 }, poste: { type: 'string', maxLength: 80 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const nom = txt(req.body.nom, 80);
    if (nom.length < 2) return erreur(reply, 400, 'nom_invalide', 'Le nom de l’ouvrier doit compter au moins 2 caractères.');
    try {
      const r = await c.query('insert into prod.ouvriers (nom, poste) values ($1, $2) returning id', [nom, txt(req.body.poste, 80)]);
      await S.auditer(c, req, 'ouvrier_cree', { entite: 'ouvrier', entiteId: String(r.rows[0].id), details: { nom } });
      reply.code(201);
      return { id: Number(r.rows[0].id), nom, poste: txt(req.body.poste, 80), actif: true };
    } catch (e) {
      if (e.code === '23505') return erreur(reply, 409, 'nom_pris', 'Un ouvrier porte déjà ce nom.');
      throw e;
    }
  }).catch((e) => { if (e.statusCode) return erreur(reply, e.statusCode, e.code, e.message); throw e; }));

  app.patch('/api/prod/ouvriers/:id', {
    preHandler: exige('production.taches', 'modifier'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: { type: 'object', additionalProperties: false,
        properties: { nom: { type: 'string', minLength: 2, maxLength: 80 }, poste: { type: 'string', maxLength: 80 }, actif: { type: 'boolean' } } } },
  }, async (req, reply) => transaction(async (c) => {
    const o = (await c.query('select * from prod.ouvriers where id = $1', [req.params.id])).rows[0];
    if (!o) return erreur(reply, 404, 'introuvable', 'Ouvrier introuvable.');
    const nom = req.body.nom !== undefined ? txt(req.body.nom, 80) : o.nom;
    if (nom.length < 2) return erreur(reply, 400, 'nom_invalide', 'Le nom doit compter au moins 2 caractères.');
    await c.query('update prod.ouvriers set nom = $2, poste = $3, actif = $4, maj_le = now() where id = $1',
      [o.id, nom, req.body.poste !== undefined ? txt(req.body.poste, 80) : o.poste, req.body.actif ?? o.actif]);
    await S.auditer(c, req, 'ouvrier_modifie', { entite: 'ouvrier', entiteId: String(o.id), avant: { nom: o.nom, poste: o.poste, actif: o.actif },
      apres: { nom, poste: req.body.poste !== undefined ? txt(req.body.poste, 80) : o.poste, actif: req.body.actif ?? o.actif } });
    return { ok: true };
  }).catch((e) => { if (e.code === '23505') return erreur(reply, 409, 'nom_pris', 'Un ouvrier porte déjà ce nom.'); if (e.statusCode) return erreur(reply, e.statusCode, e.code, e.message); throw e; }));

  // ================================================================ AFFECTATIONS (version simple : depuis le web)
  app.post('/api/prod/of/:id/affectations', {
    preHandler: exige('production.taches', 'creer'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: { type: 'object', required: ['partie', 'ouvrier_id'], additionalProperties: false,
        properties: { partie: { type: 'integer', minimum: 1, maximum: 3 }, ouvrier_id: { type: 'integer' }, note: { type: 'string', maxLength: 200 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const of = (await c.query('select id, numero, statut from prod.of where id = $1', [req.params.id])).rows[0];
    if (!of) return erreur(reply, 404, 'introuvable', 'Ordre de fabrication introuvable.');
    if (of.statut === 'annule') return erreur(reply, 400, 'of_annule', 'Cet OF est annulé.');
    if (of.statut === 'termine') return erreur(reply, 400, 'of_termine', 'Cet OF est terminé.');
    const p = (await c.query('select id, etat from prod.of_parties where of_id = $1 and partie = $2', [of.id, req.body.partie])).rows[0];
    if (!p) return erreur(reply, 404, 'partie_introuvable', 'Partie inconnue.');
    if (p.etat === 'sans_objet') return erreur(reply, 400, 'partie_sans_objet', 'Cette partie est sans objet (produit sans marquage).');
    const o = (await c.query('select id, nom, actif from prod.ouvriers where id = $1', [req.body.ouvrier_id])).rows[0];
    if (!o) return erreur(reply, 404, 'ouvrier_introuvable', 'Ouvrier introuvable.');
    if (!o.actif) return erreur(reply, 400, 'ouvrier_inactif', 'Cet ouvrier est désactivé.');
    try {
      const r = await c.query('insert into prod.of_affectations (of_id, partie, ouvrier_id, note, cree_par) values ($1,$2,$3,$4,$5) returning id',
        [of.id, req.body.partie, o.id, txt(req.body.note, 200), req.utilisateur.id]);
      await S.auditer(c, req, 'affectation_creee', { entite: 'of', entiteId: of.numero, details: { partie: req.body.partie, ouvrier: o.nom, affectation: Number(r.rows[0].id) } });
      reply.code(201);
      return { id: Number(r.rows[0].id), ouvrier: o.nom };
    } catch (e) {
      if (e.code === '23505') return erreur(reply, 409, 'deja_affecte', `${o.nom} est déjà affecté à cette partie.`);
      throw e;
    }
  }).catch((e) => { if (e.statusCode) return erreur(reply, e.statusCode, e.code, e.message); throw e; }));

  app.post('/api/prod/affectations/:id/annuler', {
    preHandler: exige('production.taches', 'modifier'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: { type: 'object', required: ['motif'], additionalProperties: false, properties: { motif: { type: 'string', minLength: 3, maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const a = (await c.query(`select a.*, o.numero, v.nom ouvrier from prod.of_affectations a
      join prod.of o on o.id = a.of_id join prod.ouvriers v on v.id = a.ouvrier_id where a.id = $1`, [req.params.id])).rows[0];
    if (!a) return erreur(reply, 404, 'introuvable', 'Affectation introuvable.');
    if (a.annule) return erreur(reply, 400, 'deja_annulee', 'Cette affectation est déjà retirée.');
    await c.query('update prod.of_affectations set annule = true, annule_motif = $2, annule_le = now(), annule_par = $3 where id = $1',
      [a.id, txt(req.body.motif, 300), req.utilisateur.id]);
    await S.auditer(c, req, 'affectation_retiree', { entite: 'of', entiteId: a.numero, details: { partie: a.partie, ouvrier: a.ouvrier, motif: txt(req.body.motif, 300) } });
    return { ok: true };
  }));

  // ================================================================ POINTAGES (le responsable pointe pour tous)
  app.post('/api/prod/pointages', {
    preHandler: exige('production.pointage', 'creer'),
    schema: { body: { type: 'object', required: ['of_id', 'partie', 'ouvrier_id', 'debut'], additionalProperties: false,
      properties: { of_id: { type: 'integer' }, partie: { type: 'integer', minimum: 1, maximum: 3 }, ouvrier_id: { type: 'integer' },
        debut: { type: 'string', format: 'date-time' }, fin: { type: 'string', format: 'date-time' },
        source: { type: 'string', enum: ['web', 'tablette'] }, remarques: { type: 'string', maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const b = req.body;
    const of = (await c.query('select id, numero, statut from prod.of where id = $1', [b.of_id])).rows[0];
    if (!of) return erreur(reply, 404, 'introuvable', 'Ordre de fabrication introuvable.');
    if (of.statut === 'annule') return erreur(reply, 400, 'of_annule', 'Cet OF est annulé.');
    const p = (await c.query('select id, etat from prod.of_parties where of_id = $1 and partie = $2', [of.id, b.partie])).rows[0];
    if (!p) return erreur(reply, 404, 'partie_introuvable', 'Partie inconnue.');
    if (p.etat === 'sans_objet') return erreur(reply, 400, 'partie_sans_objet', 'Cette partie est sans objet (produit sans marquage).');
    const o = (await c.query('select id, nom, actif from prod.ouvriers where id = $1', [b.ouvrier_id])).rows[0];
    if (!o) return erreur(reply, 404, 'ouvrier_introuvable', 'Ouvrier introuvable.');
    if (!o.actif) return erreur(reply, 400, 'ouvrier_inactif', 'Cet ouvrier est désactivé.');
    const debut = new Date(b.debut);
    if (isNaN(debut)) return erreur(reply, 400, 'date_invalide', 'Date de début illisible.');
    if (debut > new Date(Date.now() + 60000)) return erreur(reply, 400, 'debut_futur', 'Le début ne peut pas être dans le futur.');
    const fin = b.fin ? new Date(b.fin) : null;
    if (fin && (isNaN(fin) || fin <= debut)) return erreur(reply, 400, 'fin_invalide', 'La fin doit être postérieure au début.');
    const r = await c.query(`insert into prod.pointages (of_id, partie, ouvrier_id, debut, fin, source, remarques, cree_par)
      values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [of.id, b.partie, o.id, debut.toISOString(), fin ? fin.toISOString() : null, b.source === 'tablette' ? 'tablette' : 'web', txt(b.remarques, 300), req.utilisateur.id]);
    await S.auditer(c, req, 'pointage_cree', { entite: 'of', entiteId: of.numero,
      details: { partie: b.partie, ouvrier: o.nom, debut: debut.toISOString(), fin: fin ? fin.toISOString() : null, source: b.source === 'tablette' ? 'tablette' : 'web' } });
    reply.code(201);
    return { id: Number(r.rows[0].id) };
  }).catch((e) => { if (e.statusCode) return erreur(reply, e.statusCode, e.code, e.message); throw e; }));

  // Correction d'un pointage : version obligatoire (pas d'écrasement silencieux), tracée à l'audit.
  app.patch('/api/prod/pointages/:id', {
    preHandler: exige('production.pointage', 'modifier'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: { type: 'object', required: ['version'], additionalProperties: false,
        properties: { debut: { type: 'string', format: 'date-time' }, fin: { type: ['string', 'null'], format: 'date-time' },
          remarques: { type: 'string', maxLength: 300 }, version: { type: 'integer' } } } },
  }, async (req, reply) => transaction(async (c) => {
    const pt = (await c.query(`select p.*, o.numero, v.nom ouvrier from prod.pointages p
      join prod.of o on o.id = p.of_id join prod.ouvriers v on v.id = p.ouvrier_id where p.id = $1`, [req.params.id])).rows[0];
    if (!pt) return erreur(reply, 404, 'introuvable', 'Pointage introuvable.');
    if (pt.annule) return erreur(reply, 400, 'pointage_annule', 'Ce pointage est annulé.');
    if (pt.version !== req.body.version) return erreur(reply, 409, 'conflit_version', 'Ce pointage a été modifié par quelqu’un d’autre entre-temps. Rechargez avant de corriger.');
    const debut = req.body.debut ? new Date(req.body.debut) : pt.debut;
    if (isNaN(debut)) return erreur(reply, 400, 'date_invalide', 'Date de début illisible.');
    if (debut > new Date(Date.now() + 60000)) return erreur(reply, 400, 'debut_futur', 'Le début ne peut pas être dans le futur.');
    const fin = req.body.fin !== undefined ? (req.body.fin ? new Date(req.body.fin) : null) : (pt.fin ? new Date(pt.fin) : null);
    if (fin && (isNaN(fin) || fin <= debut)) return erreur(reply, 400, 'fin_invalide', 'La fin doit être postérieure au début.');
    await c.query('update prod.pointages set debut = $2, fin = $3, remarques = $4, version = version + 1, maj_le = now() where id = $1',
      [pt.id, debut.toISOString(), fin ? fin.toISOString() : null, req.body.remarques !== undefined ? txt(req.body.remarques, 300) : pt.remarques]);
    await S.auditer(c, req, 'pointage_modifie', { entite: 'of', entiteId: pt.numero,
      details: { pointage: Number(pt.id), ouvrier: pt.ouvrier, partie: pt.partie,
        avant: { debut: pt.debut, fin: pt.fin }, apres: { debut: debut.toISOString(), fin: fin ? fin.toISOString() : null } } });
    return { ok: true };
  }).catch((e) => { if (e.statusCode) return erreur(reply, e.statusCode, e.code, e.message); throw e; }));

  app.post('/api/prod/pointages/:id/annuler', {
    preHandler: exige('production.pointage', 'modifier'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: { type: 'object', required: ['motif'], additionalProperties: false, properties: { motif: { type: 'string', minLength: 3, maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const pt = (await c.query(`select p.*, o.numero, v.nom ouvrier from prod.pointages p
      join prod.of o on o.id = p.of_id join prod.ouvriers v on v.id = p.ouvrier_id where p.id = $1`, [req.params.id])).rows[0];
    if (!pt) return erreur(reply, 404, 'introuvable', 'Pointage introuvable.');
    if (pt.annule) return erreur(reply, 400, 'deja_annule', 'Ce pointage est déjà annulé.');
    await c.query('update prod.pointages set annule = true, annule_motif = $2, annule_le = now(), annule_par = $3 where id = $1',
      [pt.id, txt(req.body.motif, 300), req.utilisateur.id]);
    await S.auditer(c, req, 'pointage_annule', { entite: 'of', entiteId: pt.numero, details: { pointage: Number(pt.id), ouvrier: pt.ouvrier, motif: txt(req.body.motif, 300) } });
    return { ok: true };
  }));

  // Liste des pointages : par jour (défaut : aujourd'hui), par ouvrier, avec temps prévu (gamme) vs réel.
  app.get('/api/prod/pointages', {
    preHandler: exige('production.pointage', 'lire'),
    schema: { querystring: { type: 'object', additionalProperties: false,
      properties: { du: { type: 'string', format: 'date' }, au: { type: 'string', format: 'date' }, ouvrier_id: { type: 'integer' } } } },
  }, async (req) => {
    const q = req.query;
    const du = q.du || new Date().toISOString().slice(0, 10), au = q.au || du;
    const r = await pool.query(
      `select p.id, p.of_id, o.numero, p.partie, p.ouvrier_id, v.nom ouvrier, p.debut, p.fin, p.source, p.remarques, p.version, p.annule,
              (select sum((g->>'temps_min')::float8) from jsonb_array_elements(coalesce(o.fiche->'gamme', '[]'::jsonb)) g) temps_prevu_piece
         from prod.pointages p
         join prod.of o on o.id = p.of_id
         join prod.ouvriers v on v.id = p.ouvrier_id
        where p.debut >= $1::date and p.debut < ($2::date + 1)
          and ($3::int is null or p.ouvrier_id = $3)
        order by p.debut, p.id limit 1000`, [du, au, q.ouvrier_id ?? null]);
    return r.rows.map((x) => ({ ...x, id: Number(x.id), of_id: Number(x.of_id), ouvrier_id: Number(x.ouvrier_id), version: Number(x.version),
      temps_prevu_piece: x.temps_prevu_piece ? r3(x.temps_prevu_piece) : null }));
  });

  // ================================================================ SIGNALEMENTS « Signaler un problème »
  app.post('/api/prod/of/:id/signalements', {
    preHandler: exige('production.of', 'lire'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: { type: 'object', required: ['texte'], additionalProperties: false,
        properties: { partie: { type: 'integer', minimum: 1, maximum: 3 }, texte: { type: 'string', minLength: 3, maxLength: 500 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const of = (await c.query('select id, numero, statut from prod.of where id = $1', [req.params.id])).rows[0];
    if (!of) return erreur(reply, 404, 'introuvable', 'Ordre de fabrication introuvable.');
    const r = await c.query('insert into prod.signalements (of_id, partie, texte, cree_par) values ($1,$2,$3,$4) returning id',
      [of.id, req.body.partie || null, txt(req.body.texte, 500), req.utilisateur.id]);
    await S.auditer(c, req, 'of_signale', { entite: 'of', entiteId: of.numero,
      details: { signalement: Number(r.rows[0].id), partie: req.body.partie || null, texte: txt(req.body.texte, 500) } });
    reply.code(201);
    return { id: Number(r.rows[0].id) };
  }));

  app.get('/api/prod/signalements', {
    preHandler: exige('production.of', 'lire'),
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { etat: { type: 'string', enum: ['ouvert', 'resolu'] } } } },
  }, async (req) => {
    const r = await pool.query(
      `select s.id, s.of_id, o.numero, s.partie, s.texte, s.etat, s.resolu_note, s.resolu_le, to_char(s.cree_le, 'YYYY-MM-DD"T"HH24:MI') cree_le,
              coalesce(c.nom_complet, c.identifiant) cree_par_nom
         from prod.signalements s join prod.of o on o.id = s.of_id left join noyau.utilisateurs c on c.id = s.cree_par
        where ($1::text is null or s.etat = $1) order by (s.etat = 'ouvert') desc, s.cree_le desc limit 300`,
      [req.query.etat || null]);
    return r.rows.map((x) => ({ ...x, id: Number(x.id), of_id: Number(x.of_id) }));
  });

  app.post('/api/prod/signalements/:id/resoudre', {
    preHandler: exige('production.of', 'modifier'),
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: { type: 'object', additionalProperties: false, properties: { note: { type: 'string', maxLength: 300 } } } },
  }, async (req, reply) => transaction(async (c) => {
    const s = (await c.query(`select s.*, o.numero from prod.signalements s join prod.of o on o.id = s.of_id where s.id = $1`, [req.params.id])).rows[0];
    if (!s) return erreur(reply, 404, 'introuvable', 'Signalement introuvable.');
    if (s.etat === 'resolu') return erreur(reply, 400, 'deja_resolu', 'Ce signalement est déjà résolu.');
    await c.query(`update prod.signalements set etat = 'resolu', resolu_note = $2, resolu_le = now(), resolu_par = $3 where id = $1`,
      [s.id, txt(req.body?.note, 300), req.utilisateur.id]);
    await S.auditer(c, req, 'of_signalement_resolu', { entite: 'of', entiteId: s.numero, details: { signalement: Number(s.id), note: txt(req.body?.note, 300) } });
    return { ok: true };
  }));
};

// Vérifie les droits de lecture d'un OF pour les helpers ci-dessus (utilisé par les tests).
module.exports.PIN_RE = PIN_RE;
module.exports._peut = (eff, f, a) => D.peut(eff, f, a);