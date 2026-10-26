-- Lot ERP 0.15.0 : fiches techniques versionnées → commande brouillon → validation commerciale → OF →
-- étiquettes de composition et d'emballage (traçabilité par QR), codes-barres produit, fibres et entretien.
-- Spec SPEC-FICHES-0.15.0 v1.1, validée par l'utilisateur le 26/10/2026 (conflits 1 à 9, réponses du 21:23,
-- propositions C1 à C7 appliquées par défaut le 21:33). Ajout seul : aucune donnée existante n'est modifiée.

-- ================================================================ droits (générés depuis lib/droits-catalogue.js)
insert into noyau.fonctions values
  ('commercial.codes_barres', 'commercial', 'Codes-barres produit', 11),
  ('production.etiquettes', 'production', 'Étiquettes (composition, emballage)', 5),
  ('parametres.etiquettes', 'parametres', 'Étiquettes, fibres et entretien', 9)
on conflict (code) do nothing;
insert into noyau.fonction_actions values
  ('commercial.codes_barres', 'lire'),
  ('commercial.codes_barres', 'creer'),
  ('commercial.codes_barres', 'modifier'),
  ('commercial.codes_barres', 'exporter'),
  ('production.etiquettes', 'lire'),
  ('production.etiquettes', 'creer'),
  ('production.etiquettes', 'valider'),
  ('production.etiquettes', 'exporter'),
  ('parametres.etiquettes', 'lire'),
  ('parametres.etiquettes', 'modifier')
on conflict do nothing;
insert into noyau.role_droits (role_id, fonction, action)
  select r.id, v.f, v.a from noyau.roles r, (values
    ('direction', 'commercial.codes_barres', 'lire'),
    ('direction', 'production.etiquettes', 'lire'),
    ('direction', 'parametres.etiquettes', 'lire'),
    ('commercial', 'commercial.codes_barres', 'lire'),
    ('commercial', 'commercial.codes_barres', 'creer'),
    ('commercial', 'commercial.codes_barres', 'modifier'),
    ('commercial', 'commercial.codes_barres', 'exporter'),
    ('commercial', 'production.etiquettes', 'lire'),
    ('commercial', 'production.etiquettes', 'creer'),
    ('commercial', 'production.etiquettes', 'valider'),
    ('commercial', 'production.etiquettes', 'exporter'),
    ('infographie', 'commercial.codes_barres', 'lire'),
    ('infographie', 'production.etiquettes', 'lire'),
    ('comptabilite', 'commercial.codes_barres', 'lire'),
    ('comptabilite', 'production.etiquettes', 'lire'),
    ('production', 'commercial.codes_barres', 'lire'),
    ('production', 'production.etiquettes', 'lire'),
    ('production', 'production.etiquettes', 'creer'),
    ('production', 'production.etiquettes', 'valider'),
    ('production', 'production.etiquettes', 'exporter'),
    ('magasin', 'commercial.codes_barres', 'lire'),
    ('magasin', 'production.etiquettes', 'lire'),
    ('magasin', 'production.etiquettes', 'valider')) v(r, f, a) where r.code = v.r
on conflict do nothing;
update noyau.roles set version = version + 1, maj_le = now()
 where code in ('direction', 'commercial', 'infographie', 'comptabilite', 'production', 'magasin');
insert into noyau.audit (action, entite, entite_id, details)
select 'role_droits_modifies', 'role', r.code, jsonb_build_object('origine', 'migration 015', 'ajoutes',
  (select jsonb_agg(d.fonction || ':' || d.action order by d.fonction, d.action) from noyau.role_droits d
    where d.role_id = r.id and d.fonction in ('commercial.codes_barres', 'production.etiquettes', 'parametres.etiquettes')))
from noyau.roles r where r.code in ('direction', 'commercial', 'infographie', 'comptabilite', 'production', 'magasin');

-- ================================================================ fiches techniques versionnées (spec § 4)
create schema if not exists fiches;

-- Une fiche par produit fini : la référence (P00126H) est le nom du produit ET du fichier patronage .MDL.
create table if not exists fiches.fiches (
  id               bigserial primary key,
  produit_id       bigint not null unique references pf.produits(id),
  reference        text not null,
  client_id        text,                                   -- null = Basique
  client_nom       text not null default '',
  source_fiche_id  bigint references fiches.fiches(id),    -- « Dupliquer pour un autre client »
  designation      text not null default '' check (length(designation) <= 160),
  version_courante int not null default 0,
  annule           boolean not null default false,
  cree_le          timestamptz not null default now(),
  cree_par         int references noyau.utilisateurs(id),
  maj_le           timestamptz not null default now()
);
create index if not exists fiches_client_idx on fiches.fiches (client_id);

-- Versions : jamais d'écrasement. Seul un brouillon se modifie ; proposée / validée / en production = figée.
create table if not exists fiches.versions (
  id              bigserial primary key,
  fiche_id        bigint not null references fiches.fiches(id),
  numero          int not null check (numero between 1 and 9999),
  statut          text not null default 'brouillon' check (statut in ('brouillon', 'proposee', 'validee', 'en_production', 'archivee')),
  config_studio   jsonb not null default '{}'::jsonb,      -- composition 3D (modèle, couleurs, logos, marquages)
  vignette        text not null default '' check (length(vignette) <= 400000),
  pdf_id          bigint references commercial.fichiers(id),  -- PDF proposé (identifiant caché DTX-FICHE)
  pdf_valide_id   bigint references commercial.fichiers(id),  -- PDF tamponné « Validée par … le … »
  brouillon_id    bigint,                                  -- commande brouillon où elle a été proposée
  commande_id     text not null default '',
  commande_numero text not null default '',
  motif_modif     text not null default '' check (length(motif_modif) <= 300),
  cree_le         timestamptz not null default now(),
  cree_par        int references noyau.utilisateurs(id),
  propose_le      timestamptz,
  propose_par     int references noyau.utilisateurs(id),
  valide_le       timestamptz,
  valide_par      int references noyau.utilisateurs(id),
  valide_par_nom  text not null default '',
  version_ligne   int not null default 1,
  unique (fiche_id, numero)
);
create unique index if not exists versions_un_brouillon on fiches.versions (fiche_id) where statut = 'brouillon';
create index if not exists versions_fiche_idx on fiches.versions (fiche_id, numero desc);

create or replace function fiches.pas_de_suppression() returns trigger language plpgsql as $$
begin raise exception 'Suppression interdite : une fiche technique et ses versions sont conservées (historique).'; end $$;
drop trigger if exists fiches_pas_de_suppression on fiches.fiches;
create trigger fiches_pas_de_suppression before delete on fiches.fiches for each row execute function fiches.pas_de_suppression();
drop trigger if exists versions_pas_de_suppression on fiches.versions;
create trigger versions_pas_de_suppression before delete on fiches.versions for each row execute function fiches.pas_de_suppression();

-- Une version sortie du brouillon est figée : sa composition 3D et son PDF ne changent plus.
create or replace function fiches.version_figee() returns trigger language plpgsql as $$
begin
  if old.statut <> 'brouillon' and (new.config_studio is distinct from old.config_studio or new.pdf_id is distinct from old.pdf_id
      or new.vignette is distinct from old.vignette or new.numero <> old.numero or new.fiche_id <> old.fiche_id) then
    raise exception 'Version figée : la composition d''une version proposée ou validée ne change plus (créez une nouvelle version).';
  end if;
  if old.statut <> 'brouillon' and new.statut = 'brouillon' then
    raise exception 'Une version proposée ou validée ne redevient pas un brouillon.';
  end if;
  return new;
end $$;
drop trigger if exists versions_figees on fiches.versions;
create trigger versions_figees before update on fiches.versions for each row execute function fiches.version_figee();

-- Commandes à compléter (spec § 6–7) : créées par l'infographiste SANS numéro ni prix, complétées et validées par le
-- commercial. Elles restent hors de commercial.documents (aucun BL, facture ou OF possible) jusqu'à la validation,
-- qui crée la vraie commande CMD-AAAA-NNNN (numéro attribué à ce moment-là, dans la transaction).
create table if not exists fiches.brouillons (
  id                 bigserial primary key,
  client_id          text not null,
  client_nom         text not null default '',
  origine            text not null default 'infographie' check (origine in ('infographie', 'duplication')),
  source_commande_id text not null default '',
  lignes             jsonb not null default '[]'::jsonb,  -- [{fiche_version_id, produit_id, reference, designation, detail:[{couleur,taille,qte}], pu, remise}]
  bc_client          text not null default '',
  livraison          date,
  note               text not null default '' check (length(note) <= 500),
  statut             text not null default 'a_completer' check (statut in ('a_completer', 'validee', 'abandonnee')),
  commande_id        text not null default '',
  commande_numero    text not null default '',
  version            int not null default 1,
  cree_le            timestamptz not null default now(),
  cree_par           int references noyau.utilisateurs(id),
  maj_le             timestamptz not null default now(),
  valide_le          timestamptz,
  valide_par         int references noyau.utilisateurs(id)
);
create index if not exists brouillons_statut_idx on fiches.brouillons (statut, client_id);
drop trigger if exists brouillons_pas_de_suppression on fiches.brouillons;
create trigger brouillons_pas_de_suppression before delete on fiches.brouillons for each row execute function fiches.pas_de_suppression();
alter table fiches.versions drop constraint if exists versions_brouillon_fk;
alter table fiches.versions add constraint versions_brouillon_fk foreign key (brouillon_id) references fiches.brouillons(id);

-- PDF des fiches rangés comme les autres fichiers (nature fiche_technique, cible « fiche_version »)
alter table commercial.fichiers drop constraint if exists fichiers_nature_check;
alter table commercial.fichiers drop constraint if exists commercial_fichiers_nature_check;
alter table commercial.fichiers add constraint fichiers_nature_check
  check (nature in ('scan_paiement', 'fiche_technique', 'photo_atelier', 'etiquettes'));
alter table commercial.fichiers drop constraint if exists fichiers_cible_type_check;
alter table commercial.fichiers drop constraint if exists commercial_fichiers_cible_type_check;
alter table commercial.fichiers add constraint fichiers_cible_type_check
  check (cible_type in ('commande', 'produit', 'reglement', 'of', 'fiche_version'));

-- ================================================================ OF : version de fiche imprimée
alter table prod.of add column if not exists fiche_version_id bigint references fiches.versions(id);
-- modification de fiche validée après le lancement : signal « fiche modifiée » à l'atelier (CDC §4.6.1)
alter table prod.of add column if not exists fiche_modifiee_le timestamptz;

-- ================================================================ codes-barres produit (spec § 4, C1–C4)
alter table pf.produits add column if not exists pieces_par_sachet int not null default 1 check (pieces_par_sachet between 1 and 1000);
alter table pf.produits add column if not exists designation text not null default '' check (length(designation) <= 160);

-- Un code par produit × taille × couleur (C3) ; « sachet » = lot de N pièces, code distinct (C4).
-- Code 128 interne tant qu'aucun préfixe GS1 n'est saisi (C2) ; EAN-13 ensuite. Jamais réutilisé ni supprimé.
create table if not exists pf.codes_barres (
  id          bigserial primary key,
  produit_id  bigint not null references pf.produits(id),
  taille      text not null default '',
  couleur     text not null default '',
  conditionnement int not null default 1 check (conditionnement between 1 and 1000),  -- 1 = pièce, N = sachet de N
  code        text not null unique,
  type        text not null check (type in ('EAN13', 'CODE128')),
  actif       boolean not null default true,
  cree_le     timestamptz not null default now(),
  cree_par    int references noyau.utilisateurs(id),
  unique (produit_id, taille, couleur, conditionnement)
);
create table if not exists pf.compteur_codes_barres (
  type    text primary key check (type in ('EAN13', 'CODE128')),
  dernier bigint not null default 0 check (dernier >= 0)
);
insert into pf.compteur_codes_barres values ('EAN13', 0), ('CODE128', 0) on conflict do nothing;
drop trigger if exists codes_barres_pas_de_suppression on pf.codes_barres;
create trigger codes_barres_pas_de_suppression before delete on pf.codes_barres for each row execute function pf.pas_de_suppression();

-- ================================================================ étiquettes (spec § 9)
create table if not exists prod.etiquettes (
  id             bigserial primary key,
  type           text not null check (type in ('composition', 'emballage')),
  code           text not null unique check (code ~ '^[A-Z2-7]{10}$'),  -- base32 aléatoire, non devinable
  of_id          bigint not null references prod.of(id),
  commande_id    text not null default '',
  produit_id     bigint not null references pf.produits(id),
  reference      text not null,
  taille         text not null default '',
  couleur        text not null default '',
  rang           int not null check (rang >= 1),
  pieces         int not null default 1 check (pieces >= 1),
  code_barres    text not null default '',
  contenu        jsonb not null default '{}'::jsonb,   -- figé à la génération (fibres FR/AR, entretien, date, n° OF…)
  imprimee_le    timestamptz,
  imprimee_par   int references noyau.utilisateurs(id),
  nb_impressions int not null default 0,
  cree_le        timestamptz not null default now(),
  unique (of_id, type, taille, couleur, rang)
);
create index if not exists etiquettes_of_idx on prod.etiquettes (of_id, type);
drop trigger if exists etiquettes_pas_de_suppression on prod.etiquettes;
create trigger etiquettes_pas_de_suppression before delete on prod.etiquettes for each row execute function prod.pas_de_suppression();

-- ================================================================ paramètres d'étiquetage
insert into parametres.options (code, libelle, valeur, commentaire) values
  ('etiq_origine_fr', 'Pays d’origine (français)', 'Fabriqué en Tunisie', 'Décision de l’utilisateur du 26/10/2026 : toujours Tunisie.'),
  ('etiq_origine_ar', 'Pays d’origine (arabe)', 'صنع في تونس', 'Traduction à faire relire par l’entreprise.'),
  ('etiq_reserve', 'Étiquettes de réserve par OF', '0', 'Étiquettes de composition imprimées en plus des pièces de l’OF.'),
  ('etiq_client', 'Nom du client sur les étiquettes', 'non', 'oui / non.'),
  ('etiq_format_emballage', 'Format de l’autocollant d’emballage (mm)', '60x40', 'C5 : 60 × 40 mm par défaut, même imprimante TSC (profil Emballage).'),
  ('gs1_prefixe', 'Préfixe entreprise GS1 (EAN-13)', '', 'C2 : vide = codes internes Code 128. Saisir le préfixe GS1 Tunisie (619…) pour attribuer des EAN-13.')
on conflict (code) do nothing;

-- Dénominations des fibres FR / AR (liste modifiable ; traductions à faire relire par l'entreprise).
create table if not exists parametres.fibres (
  code   text primary key check (code ~ '^[a-z_]{2,30}$'),
  fr     text not null,
  ar     text not null default '',
  ordre  int not null default 0,
  actif  boolean not null default true
);
insert into parametres.fibres (code, fr, ar, ordre) values
  ('coton', 'Coton', 'قطن', 1), ('polyester', 'Polyester', 'بوليستر', 2), ('elasthanne', 'Élasthanne', 'إيلاستان', 3),
  ('viscose', 'Viscose', 'فسكوز', 4), ('polyamide', 'Polyamide', 'بولياميد', 5), ('laine', 'Laine', 'صوف', 6),
  ('lin', 'Lin', 'كتان', 7), ('acrylique', 'Acrylique', 'أكريليك', 8), ('modal', 'Modal', 'مودال', 9), ('soie', 'Soie', 'حرير', 10)
on conflict (code) do nothing;

-- Modèles d'entretien PROPOSÉS par type de tissu (codes ISO 3758, ordre lavage, blanchiment, séchage, repassage,
-- entretien professionnel). Jamais imposés : choisis puis ajustés sur chaque article tissu.
create table if not exists parametres.modeles_entretien (
  code      text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  libelle   text not null,
  symboles  jsonb not null,           -- {lavage, blanchiment, sechage, repassage, pro}
  texte_fr  text not null default '',
  texte_ar  text not null default '',
  ordre     int not null default 0
);
insert into parametres.modeles_entretien (code, libelle, symboles, texte_fr, texte_ar, ordre) values
  ('coton_100', '100 % coton', '{"lavage":"lav60","blanchiment":"blanch_non","sechage":"tamb_doux","repassage":"rep3","pro":"sec_p"}',
   'Laver à 60 °C. Ne pas blanchir. Séchage en tambour doux. Repassage à haute température.', 'يغسل على 60 درجة. لا يستعمل المبيّض. تجفيف خفيف في المجفف. كيّ بحرارة عالية.', 1),
  ('polycoton', 'Polyester / coton', '{"lavage":"lav40","blanchiment":"blanch_non","sechage":"tamb_doux","repassage":"rep2","pro":"sec_p"}',
   'Laver à 40 °C. Ne pas blanchir. Séchage en tambour doux. Repassage à température moyenne.', 'يغسل على 40 درجة. لا يستعمل المبيّض. تجفيف خفيف في المجفف. كيّ بحرارة متوسطة.', 2),
  ('polyester_100', '100 % polyester', '{"lavage":"lav40_doux","blanchiment":"blanch_non","sechage":"tamb_non","repassage":"rep1","pro":"sec_p"}',
   'Laver à 40 °C, programme délicat. Ne pas blanchir. Ne pas sécher en tambour. Repassage à basse température.', 'يغسل على 40 درجة برنامج لطيف. لا يستعمل المبيّض. لا يجفف في المجفف. كيّ بحرارة منخفضة.', 3),
  ('elasthanne', 'Avec élasthanne', '{"lavage":"lav30_doux","blanchiment":"blanch_non","sechage":"tamb_non","repassage":"rep1","pro":"sec_non"}',
   'Laver à 30 °C, programme délicat. Ne pas blanchir. Ne pas sécher en tambour. Repassage à basse température. Pas de nettoyage à sec.', 'يغسل على 30 درجة برنامج لطيف. لا يستعمل المبيّض. لا يجفف في المجفف. كيّ بحرارة منخفضة. لا تنظيف جاف.', 4)
on conflict (code) do nothing;
