-- Lot ERP 0.12.0 : atelier — ouvriers, affectations aux parties, pointage des temps (version simple :
-- le responsable pointe pour tous), signalements, code PIN de connexion tablette (4 chiffres).
-- Décisions de l'utilisateur du 23/10/2026 : affectation depuis le web, le responsable pointe,
-- PIN 4 chiffres, Wi-Fi atelier vérifié (3 tablettes ou plus). CDC §4.6.3 et §4.6.4.

-- ================================================================ ouvriers (gérés dans l'écran Affectation)
create table prod.ouvriers (
  id      bigserial primary key,
  nom     text not null unique check (length(trim(nom)) between 2 and 80),
  poste   text not null default '',
  actif   boolean not null default true,
  cree_le timestamptz not null default now(),
  maj_le  timestamptz not null default now()
);
create trigger ouvriers_pas_de_suppression before delete on prod.ouvriers
  for each row execute function prod.pas_de_suppression();

-- ================================================================ affectations d'ouvriers aux parties
-- Une seule affectation ACTIVE par (OF, partie, ouvrier) ; un retrait est une annulation tracée.
create table prod.of_affectations (
  id           bigserial primary key,
  of_id        bigint not null references prod.of(id),
  partie       int not null check (partie between 1 and 3),
  ouvrier_id   bigint not null references prod.ouvriers(id),
  note         text not null default '',
  annule       boolean not null default false,
  annule_motif text not null default '',
  annule_le    timestamptz,
  annule_par   int references noyau.utilisateurs(id),
  cree_le      timestamptz not null default now(),
  cree_par     int references noyau.utilisateurs(id)
);
create unique index of_affectations_actives_idx on prod.of_affectations (of_id, partie, ouvrier_id) where not annule;
create index of_affectations_of_idx on prod.of_affectations (of_id, partie) where not annule;

-- ================================================================ pointage des temps (version simple)
-- Le responsable pointe le début et la fin pour le compte de l'ouvrier (web ou tablette) ;
-- les corrections passent par une modification tracée à l'audit (version obligatoire).
create table prod.pointages (
  id           bigserial primary key,
  of_id        bigint not null references prod.of(id),
  partie       int not null check (partie between 1 and 3),
  ouvrier_id   bigint not null references prod.ouvriers(id),
  debut        timestamptz not null,
  fin          timestamptz,
  source       text not null default 'web' check (source in ('web', 'tablette')),
  remarques    text not null default '',
  version      int not null default 1,
  annule       boolean not null default false,
  annule_motif text not null default '',
  annule_le    timestamptz,
  annule_par   int references noyau.utilisateurs(id),
  cree_le      timestamptz not null default now(),
  cree_par     int references noyau.utilisateurs(id),
  maj_le       timestamptz not null default now(),
  check (fin is null or fin > debut)
);
create index pointages_dates_idx on prod.pointages (debut);
create index pointages_ouvrier_idx on prod.pointages (ouvrier_id, debut);
create trigger pointages_pas_de_suppression before delete on prod.pointages
  for each row execute function prod.pas_de_suppression();

-- ================================================================ signalements « problème » (tablette)
create table prod.signalements (
  id          bigserial primary key,
  of_id       bigint not null references prod.of(id),
  partie      int check (partie between 1 and 3),
  texte       text not null check (length(trim(texte)) between 3 and 500),
  etat        text not null default 'ouvert' check (etat in ('ouvert', 'resolu')),
  resolu_note text not null default '',
  resolu_le   timestamptz,
  resolu_par  int references noyau.utilisateurs(id),
  cree_le     timestamptz not null default now(),
  cree_par    int references noyau.utilisateurs(id)
);
create index signalements_of_idx on prod.signalements (of_id, etat);
create trigger signalements_pas_de_suppression before delete on prod.signalements
  for each row execute function prod.pas_de_suppression();

-- ================================================================ code PIN tablette (4 chiffres, haché)
-- Le PIN est une commodité de connexion pour l'atelier : il ne remplace pas les droits, qui
-- restent contrôlés sur chaque route. Jamais renvoyé ; verrouillage comme les mots de passe.
alter table noyau.utilisateurs add column pin_hash text;
alter table noyau.utilisateurs add column pin_echecs int not null default 0;
alter table noyau.utilisateurs add column pin_verrouille_jusqu timestamptz;
