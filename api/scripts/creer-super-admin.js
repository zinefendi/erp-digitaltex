'use strict';
// Crée un compte Super administrateur avec un mot de passe provisoire affiché UNE fois à l'écran.
// Usage (sur le serveur) :
//   docker exec -it erp-api node scripts/creer-super-admin.js <identifiant> "<Nom complet>"
// Le mot de passe provisoire devra être changé à la première connexion.
const { pool, transaction } = require('../lib/db');
const { migrer } = require('../lib/migrations');
const mdp = require('../lib/mdp');

(async () => {
  const [identifiantBrut, nom] = process.argv.slice(2);
  const identifiant = String(identifiantBrut || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(identifiant) || !nom || nom.trim().length < 2) {
    console.error('Usage : node scripts/creer-super-admin.js <identifiant> "<Nom complet>"');
    console.error('Identifiant : 3 à 40 caractères, minuscules sans accent, chiffres, point, tiret ou souligné.');
    process.exit(2);
  }
  await migrer(pool, { info: () => {} });
  const provisoire = mdp.provisoire();
  const h = await mdp.hacher(provisoire);
  try {
    await transaction(async (c) => {
      const r = await c.query(
        `insert into noyau.utilisateurs (identifiant, nom_complet, mot_de_passe_hash) values ($1, $2, $3) returning id`,
        [identifiant, nom.trim(), h]);
      await c.query(`insert into noyau.utilisateur_roles select $1, id from noyau.roles where code = 'super_admin'`, [r.rows[0].id]);
      await c.query(`insert into noyau.audit (identifiant, action, entite, entite_id, details)
                     values ($1, 'super_admin_cree_console', 'utilisateur', $2, '{"origine":"console serveur"}')`, [identifiant, String(r.rows[0].id)]);
    });
  } catch (e) {
    if (e.code === '23505') { console.error(`L'identifiant « ${identifiant} » existe déjà.`); process.exit(1); }
    throw e;
  }
  console.log('');
  console.log('  Compte Super administrateur créé');
  console.log('  Identifiant           : ' + identifiant);
  console.log('  Mot de passe provisoire : ' + provisoire);
  console.log('');
  console.log('  Notez-le maintenant : il ne sera plus jamais affiché.');
  console.log('  Connectez-vous sur https://app.vethypro.com : le changement de mot de passe sera demandé.');
  console.log('');
  await pool.end();
})().catch((e) => { console.error('Échec : ' + e.message); process.exit(1); });
