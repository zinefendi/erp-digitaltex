'use strict';
const Fastify = require('fastify');
const { pool } = require('./lib/db');
const { migrer } = require('./lib/migrations');
const VERSION = require('./package.json').version;

function construire(opts = {}) {
  const app = Fastify({
    logger: opts.logger ?? { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] },
    trustProxy: ['127.0.0.1', '172.16.0.0/12'], // relais de confiance : Nginx sur le réseau Docker interne
    bodyLimit: 2 * 1024 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: true, useDefaults: true } },
  });
  app.register(require('@fastify/cookie'));
  // Limite globale par session (plusieurs postes peuvent partager la même IP publique), sinon par IP.
  app.register(require('@fastify/rate-limit'), { global: true, max: 1200, timeWindow: '1 minute',
    keyGenerator: (req) => { const j = require('./lib/securite').jetonDe(req); return j ? 's:' + require('crypto').createHash('sha256').update(j).digest('hex').slice(0, 24) : 'ip:' + req.ip; } });

  app.setErrorHandler((err, req, reply) => {
    if (err.validation) return reply.code(400).send({ erreur: 'requete_invalide', message: 'Requête invalide : ' + err.message });
    if (err.statusCode === 429) return reply.code(429).send({ erreur: 'trop_de_requetes', message: 'Trop de tentatives. Patientez une minute.' });
    if (err.statusCode && err.statusCode < 500 && err.expose !== false && typeof err.code === 'string' && /^[a-z_]+$/.test(err.code)) {
      return reply.code(err.statusCode).send({ erreur: err.code, message: err.message });
    }
    req.log.error(err); if (process.env.ERP_DEBUG_ERR) console.error('ERREUR_SERVEUR_BRUTE:', err);
    return reply.code(500).send({ erreur: 'serveur', message: 'Erreur du serveur. Si elle se répète, prévenez l’administrateur.' });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ erreur: 'introuvable', message: 'Adresse inconnue.' }));

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.get('/api/sante', async (req, reply) => {
    try {
      const r = await pool.query('select now() as heure, version() as version');
      return { statut: 'ok', service: 'erp-digitaltex-api', version: VERSION, base: 'ok',
        heure_base: r.rows[0].heure, postgres: r.rows[0].version.split(' ').slice(0, 2).join(' ') };
    } catch (e) {
      req.log.error(e);
      reply.code(503);
      return { statut: 'erreur', base: 'injoignable' };
    }
  });

  app.register(require('./lib/routes-auth'), { limiteConnexion: opts.limiteConnexion ?? 10 });
  app.register(require('./lib/routes-utilisateurs'));
  app.register(require('./lib/routes-roles'));
  app.register(require('./lib/routes-parametres'));
  app.register(require('./lib/routes-metier'));
  app.register(require('./lib/routes-compta'));
  app.register(require('./lib/routes-produits-finis'));
  app.register(require('./lib/routes-ventes'));
  app.register(require('./lib/routes-stocks'));
  app.register(require('./lib/routes-prod'));
  app.register(require('./lib/routes-fichiers'));
  return app;
}

async function demarrer() {
  const app = construire();
  try {
    await migrer(pool, app.log);
  } catch (e) {
    app.log.error(e, 'Migrations en échec : arrêt');
    process.exit(1);
  }
  const stop = async () => { await app.close(); await pool.end(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  await app.listen({ host: '0.0.0.0', port: 3000 });
}

if (require.main === module) demarrer().catch((e) => { console.error(e); process.exit(1); });
module.exports = { construire };
