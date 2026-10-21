'use strict';
// Génère migrations/002_droits.sql depuis lib/droits-catalogue.js (à ne lancer qu'une fois : une migration appliquée ne change plus).
const fs = require('fs'); const path = require('path');
const C = require('../lib/droits-catalogue');
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
let sql = `-- Lot 2, étape 14 : droits par module, fonction et action + droits de visibilité (CDC § 4.10 et § 5.2).
-- Généré par scripts/generer-migration-droits.js depuis lib/droits-catalogue.js.
-- Le Super administrateur a tous les droits par construction (non stockés, non retirables).

create table noyau.actions (code text primary key, libelle text not null, ordre int not null);
create table noyau.modules (code text primary key, numero int not null unique, libelle text not null);
create table noyau.fonctions (
  code text primary key, module text not null references noyau.modules(code), libelle text not null, ordre int not null);
create table noyau.fonction_actions (
  fonction text not null references noyau.fonctions(code), action text not null references noyau.actions(code),
  primary key (fonction, action));
create table noyau.visibilites (code text primary key, libelle text not null, description text not null, ordre int not null);

create table noyau.role_droits (
  role_id int not null references noyau.roles(id) on delete cascade,
  fonction text not null, action text not null,
  primary key (role_id, fonction, action),
  foreign key (fonction, action) references noyau.fonction_actions(fonction, action));
create table noyau.role_visibilites (
  role_id int not null references noyau.roles(id) on delete cascade,
  visibilite text not null references noyau.visibilites(code),
  primary key (role_id, visibilite));

alter table noyau.roles add column version int not null default 1, add column maj_le timestamptz not null default now();
create unique index roles_libelle_unique on noyau.roles (lower(libelle));

`;
sql += 'insert into noyau.actions values\n' + C.ACTIONS.map(([c, l], i) => `  (${q(c)}, ${q(l)}, ${i + 1})`).join(',\n') + ';\n\n';
sql += 'insert into noyau.modules values\n' + C.MODULES.map(([n, c, l]) => `  (${q(c)}, ${n}, ${q(l)})`).join(',\n') + ';\n\n';
sql += 'insert into noyau.fonctions values\n' + C.FONCTIONS.map((f) => `  (${q(f.code)}, ${q(f.module)}, ${q(f.libelle)}, ${f.ordre})`).join(',\n') + ';\n\n';
sql += 'insert into noyau.fonction_actions values\n' + C.FONCTIONS.flatMap((f) => f.actions.map((a) => `  (${q(f.code)}, ${q(a)})`)).join(',\n') + ';\n\n';
sql += 'insert into noyau.visibilites values\n' + C.VISIBILITES.map(([c, l, d], i) => `  (${q(c)}, ${q(l)}, ${q(d)}, ${i + 1})`).join(',\n') + ';\n\n';
sql += '-- Matrice par défaut des 7 rôles fournis (hors Super administrateur)\n';
for (const role of Object.keys(C.MATRICE)) {
  const d = C.defautRole(role);
  const lignes = Object.entries(d).flatMap(([f, acts]) => acts.map((a) => `(${q(f)}, ${q(a)})`));
  if (lignes.length) sql += `insert into noyau.role_droits select r.id, v.f, v.a from noyau.roles r, (values ${lignes.join(', ')}) v(f, a) where r.code = ${q(role)};\n`;
  const vis = C.MATRICE[role].visibilites;
  if (vis.length) sql += `insert into noyau.role_visibilites select r.id, v from noyau.roles r, unnest(array[${vis.map(q).join(', ')}]) v where r.code = ${q(role)};\n`;
}
fs.writeFileSync(path.join(__dirname, '..', 'migrations', '002_droits.sql'), sql);
console.log('002_droits.sql écrit,', sql.length, 'octets');
