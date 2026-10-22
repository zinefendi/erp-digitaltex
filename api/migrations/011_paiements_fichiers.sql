-- Lot ERP 0.10.1 (demandes de l'utilisateur du 22/10/2026, module 02 Gestion commerciale) :
--  * banques émettrices tunisiennes (liste de la circulaire BCT n° 2026-05 du 24/04/2026 : 25 établissements
--    adhérents à la plateforme électronique unique des chèques) — modifiable, jamais supprimée (actif = false) ;
--  * fichiers rattachés aux documents : scans des moyens de paiement (chèque, traite, ordre de virement…)
--    et fiches techniques (PDF du Studio 3D ou PDF / JPEG joint à la main) d'une commande ou d'un produit fini.
-- Ajout seul : aucune donnée existante n'est modifiée.

create table parametres.banques (
  code    text primary key check (code ~ '^[A-Z0-9_]{2,20}$'),
  nom     text not null check (length(trim(nom)) between 2 and 120),
  ordre   int not null default 100,
  actif   boolean not null default true,
  maj_le  timestamptz not null default now()
);
insert into parametres.banques (code, nom, ordre) values
  ('ALBARAKA', 'Al Baraka Bank Tunisie', 1),
  ('ALUBAF', 'ALUBAF International Bank', 2),
  ('AMEN', 'Amen Bank', 3),
  ('ATB', 'Arab Tunisian Bank (ATB)', 4),
  ('ATTIJARI', 'Attijari Bank', 5),
  ('ABC', 'Bank ABC Tunisie', 6),
  ('BH', 'BH Bank', 7),
  ('BIAT', 'Banque Internationale Arabe de Tunisie (BIAT)', 8),
  ('BNA', 'Banque Nationale Agricole (BNA)', 9),
  ('BT', 'Banque de Tunisie (BT)', 10),
  ('BTE', 'Banque de Tunisie et des Émirats (BTE)', 11),
  ('BTK', 'Banque Tuniso-Koweïtienne (BTK)', 12),
  ('BTL', 'Banque Tuniso-Libyenne (BTL)', 13),
  ('BTS', 'Banque Tunisienne de Solidarité (BTS)', 14),
  ('ZITOUNA', 'Banque Zitouna', 15),
  ('CITI', 'Citi Bank', 16),
  ('NAIB', 'North Africa International Bank (NAIB)', 17),
  ('ONP', 'La Poste Tunisienne (Office National des Postes)', 18),
  ('QNB', 'Qatar National Bank Tunisia (QNB)', 19),
  ('STB', 'Société Tunisienne de Banque (STB)', 20),
  ('TIB', 'Tunis International Bank (TIB)', 21),
  ('TSB', 'Tunisian Saudi Bank (TSB)', 22),
  ('UBCI', 'Union Bancaire pour le Commerce et l’Industrie (UBCI)', 23),
  ('UIB', 'Union Internationale de Banques (UIB)', 24),
  ('WIFAK', 'Wifak Bank', 25),
  ('AUTRE', 'Autre banque / banque étrangère', 99)
on conflict (code) do nothing;

create table commercial.fichiers (
  id         bigserial primary key,
  nature     text not null check (nature in ('scan_paiement', 'fiche_technique')),
  cible_type text not null check (cible_type in ('commande', 'produit', 'reglement')),
  cible_id   text not null default '',               -- id de commande (commercial.documents), référence produit fini, ou '' (scan pas encore rattaché)
  nom        text not null,
  mime       text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  taille     int not null check (taille > 0),
  empreinte  text not null,                          -- SHA-256 du contenu
  chemin     text not null,                          -- relatif au dossier des fichiers du serveur
  annule     boolean not null default false,
  cree_le    timestamptz not null default now(),
  cree_par   int references noyau.utilisateurs(id)
);
create index fichiers_cible_idx on commercial.fichiers (cible_type, cible_id) where not annule;
