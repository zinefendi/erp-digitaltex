-- Lot 2, étape 1 : comptes utilisateurs, rôles, sessions, journal d'audit.
-- Schéma « noyau » : socle commun à tous les modules de l'ERP.

create schema if not exists noyau;

-- Rôles (les 8 rôles fournis du CDC § 5.1 ; les rôles personnalisés viendront à l'étape 2)
create table noyau.roles (
  id          serial primary key,
  code        text not null unique check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  libelle     text not null,
  description text not null default '',
  systeme     boolean not null default false,   -- rôle fourni : ni supprimable ni renommable
  cree_le     timestamptz not null default now()
);

insert into noyau.roles (code, libelle, description, systeme) values
  ('super_admin',  'Super administrateur', 'Tout, y compris utilisateurs, droits, paramètres, sauvegardes, audit', true),
  ('direction',    'Direction',            'Lecture seule sur tout ; paie en synthèse seulement', true),
  ('commercial',   'Commercial',           'Gestion commerciale, clients, lookbook ; lecture du studio et des fiches', true),
  ('infographie',  'Infographie',          'Studio 3D, fiches techniques, catalogue, lookbook ; commandes sans prix', true),
  ('comptabilite', 'Comptabilité',         'Facturation, comptabilité clients et fournisseurs, exports comptables', true),
  ('production',   'Production / Atelier', 'Ordres de fabrication sur tablette, tâches, pointage, sorties de matières ; jamais de prix', true),
  ('magasin',      'Magasin / Achats',     'Stocks MP et PF, réceptions, commandes fournisseurs, inventaires', true),
  ('rh_paie',      'RH / Paie',            'Module paie uniquement ; seul rôle, avec le Super administrateur, à voir les salaires', true);

-- Utilisateurs
create table noyau.utilisateurs (
  id                 serial primary key,
  identifiant        text not null unique check (identifiant ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  nom_complet        text not null check (length(trim(nom_complet)) between 2 and 120),
  email              text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  mot_de_passe_hash  text not null,
  doit_changer_mdp   boolean not null default true,
  actif              boolean not null default true,
  echecs_connexion   integer not null default 0,
  verrouille_jusqu   timestamptz,
  derniere_connexion timestamptz,
  mdp_change_le      timestamptz not null default now(),
  cree_le            timestamptz not null default now(),
  cree_par           integer references noyau.utilisateurs(id),
  maj_le             timestamptz not null default now(),
  version            integer not null default 1
);

create table noyau.utilisateur_roles (
  utilisateur_id integer not null references noyau.utilisateurs(id) on delete cascade,
  role_id        integer not null references noyau.roles(id),
  primary key (utilisateur_id, role_id)
);

-- Sessions : le jeton n'est jamais stocké en clair (empreinte SHA-256 seulement)
create table noyau.sessions (
  id                bigserial primary key,
  jeton_empreinte   text not null unique,
  utilisateur_id    integer not null references noyau.utilisateurs(id) on delete cascade,
  cree_le           timestamptz not null default now(),
  derniere_activite timestamptz not null default now(),
  expire_le         timestamptz not null,
  revoquee_le       timestamptz,
  ip                text,
  poste             text,
  agent             text
);
create index sessions_utilisateur_idx on noyau.sessions (utilisateur_id) where revoquee_le is null;

-- Journal d'audit : ajout seul, jamais modifiable ni effaçable (CDC § 6)
create table noyau.audit (
  id             bigserial primary key,
  horodatage     timestamptz not null default now(),
  utilisateur_id integer references noyau.utilisateurs(id),
  identifiant    text,            -- copié : reste lisible même si le compte change
  poste          text,
  ip             text,
  action         text not null,
  entite         text,
  entite_id      text,
  avant          jsonb,
  apres          jsonb,
  details        jsonb
);
create index audit_horodatage_idx on noyau.audit (horodatage desc);
create index audit_entite_idx on noyau.audit (entite, entite_id);
create index audit_utilisateur_idx on noyau.audit (utilisateur_id, horodatage desc);

create function noyau.audit_interdit() returns trigger language plpgsql as $$
begin
  raise exception 'Le journal d''audit est en ajout seul : % interdit', tg_op;
end $$;

create trigger audit_pas_de_modification
  before update or delete on noyau.audit
  for each row execute function noyau.audit_interdit();
create trigger audit_pas_de_vidage
  before truncate on noyau.audit
  for each statement execute function noyau.audit_interdit();
