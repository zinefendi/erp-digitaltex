-- Lot ERP 0.11.0 : production (module 6 côté web) et BOM / gamme versionnées (module 7).
-- Décisions de l'utilisateur du 23/10/2026 : lot 7 découpé (0.11.0 = BOM versionnée + OF en 3 parties
-- côté web ; tablette PWA + pointage des heures en 0.12.0), réservations des matières au lancement
-- de l'OF, affectation des tâches en version simple (0.12.0).
-- Ajout seul : les BOM / gammes jsonb des produits finis sont COPIÉES en version 1, jamais effacées.

insert into parametres.numerotation (type, libelle, prefixe, ordre) values
  ('of', 'Ordre de fabrication', 'OF', 11)
on conflict (type) do nothing;

-- ================================================================ BOM versionnée (CDC §4.7)
-- Une modification crée une nouvelle version ; les OF déjà lancés gardent la leur (fiche figée).
create table pf.boms (
  id          bigserial primary key,
  produit_id  bigint not null references pf.produits(id),
  version     int not null check (version between 1 and 999),
  date_effet  date not null default current_date,
  statut      text not null default 'active' check (statut in ('active', 'archivee')),
  origine     text not null default 'creation' check (origine in ('migration', 'creation', 'modification')),
  note        text not null default '',
  cree_le     timestamptz not null default now(),
  cree_par    int references noyau.utilisateurs(id),
  unique (produit_id, version)
);
create index boms_produit_idx on pf.boms (produit_id, statut);

-- Ligne de nomenclature : matière du registre 'articles_mp' (article_id) ou ligne informative
-- (article_id null, ex. emballage pas encore au registre). Tissu : métrage par taille dans par_taille.
create table pf.bom_lignes (
  id          bigserial primary key,
  bom_id      bigint not null references pf.boms(id),
  article_id  bigint references registres.fiches(id),
  designation text not null default '',
  unite       text not null default '',
  qte_base    numeric(14,4) not null default 0 check (qte_base >= 0),
  par_taille  jsonb not null default '{}'::jsonb,   -- {"XL": 1.35} : métrage du tissu pour la taille
  pu          numeric(14,3) not null default 0 check (pu >= 0),
  ordre       int not null default 0
);
create index bom_lignes_bom_idx on pf.bom_lignes (bom_id, ordre);

-- ================================================================ gamme opératoire versionnée
create table pf.gammes (
  id          bigserial primary key,
  produit_id  bigint not null references pf.produits(id),
  version     int not null check (version between 1 and 999),
  date_effet  date not null default current_date,
  statut      text not null default 'active' check (statut in ('active', 'archivee')),
  origine     text not null default 'creation' check (origine in ('migration', 'creation', 'modification')),
  note        text not null default '',
  cree_le     timestamptz not null default now(),
  cree_par    int references noyau.utilisateurs(id),
  unique (produit_id, version)
);
create table pf.gamme_operations (
  id         bigserial primary key,
  gamme_id   bigint not null references pf.gammes(id),
  operation  text not null default '',
  temps_min  numeric(12,3) not null default 0 check (temps_min >= 0),
  poste      text not null default '',
  ordre      int not null default 0
);
create index gamme_operations_idx on pf.gamme_operations (gamme_id, ordre);

-- Reprise des BOM / gammes existantes (jsonb) en version 1 « active ». Rien n'est modifié ailleurs :
-- les matières sont rattachées aux fiches 'articles_mp' par code ou désignation (sinon ligne informative).
do $bloc$
declare p record; b bigint; g bigint;
begin
  for p in select id, bom, gamme from pf.produits where (bom <> '[]'::jsonb or gamme <> '[]'::jsonb) loop
    if p.bom <> '[]'::jsonb then
      insert into pf.boms (produit_id, version, statut, origine, note) values (p.id, 1, 'active', 'migration', 'Reprise de la BOM saisie avant la 0.11.0') returning id into b;
      insert into pf.bom_lignes (bom_id, article_id, designation, unite, qte_base, par_taille, pu, ordre)
        select b, f.id, coalesce(l.l->>'designation', ''), coalesce(f.donnees->>'unite', ''),
               coalesce((l.l->>'qte')::numeric, 0), '{}'::jsonb, coalesce((l.l->>'pu')::numeric, 0), l.ord
        from jsonb_array_elements(p.bom) with ordinality as t(l, ord)
        left join lateral (
          select f2.id, f2.donnees from registres.fiches f2
          where f2.registre = 'articles_mp'
            and ((l.l->>'matiere' is not null and l.l->>'matiere' <> '' and f2.donnees->>'code' = l.l->>'matiere')
              or (l.l->>'designation' is not null and f2.donnees->>'designation' = l.l->>'designation'))
          order by f2.id limit 1
        ) f on true;
    end if;
    if p.gamme <> '[]'::jsonb then
      insert into pf.gammes (produit_id, version, statut, origine, note) values (p.id, 1, 'active', 'migration', 'Reprise de la gamme saisie avant la 0.11.0') returning id into g;
      insert into pf.gamme_operations (gamme_id, operation, temps_min, ordre)
        select g, coalesce(l.l->>'operation', ''), coalesce((l.l->>'temps_min')::numeric, 0), l.ord
        from jsonb_array_elements(p.gamme) with ordinality as t(l, ord);
    end if;
  end loop;
end $bloc$;

-- ================================================================ ordres de fabrication (module 6)
create schema prod;

create table prod.of (
  id               bigserial primary key,
  numero           text not null unique,                 -- OF-AAAA-NNNN (attribué dans la transaction)
  date_lancement   date not null default current_date,
  commande_id      text not null default '',             -- commercial.documents (collection 'orders')
  commande_numero  text not null default '',
  client_id        text not null default '',
  client_nom       text not null default '',
  produit_id       bigint not null references pf.produits(id),
  tailles_couleurs jsonb not null default '[]'::jsonb,   -- [{taille, couleur, qte}]
  date_livraison   date,
  bom_version_id   bigint references pf.boms(id),
  gamme_version_id bigint references pf.gammes(id),
  besoins          jsonb not null default '[]'::jsonb,   -- figés à la création : [{article_id, designation, unite, qte_totale, par_piece}]
  fiche            jsonb not null default '{}'::jsonb,   -- fiche technique figée, SANS aucun montant (CDC §4.6.1)
  produit_version  int not null default 1,               -- pour signaler « fiche modifiée depuis le lancement »
  remarques        text not null default '',
  statut           text not null default 'cree' check (statut in ('cree', 'en_cours', 'termine', 'annule')),
  version          int not null default 1,
  annule_motif     text not null default '',
  cree_le          timestamptz not null default now(),
  cree_par         int references noyau.utilisateurs(id),
  termine_le       timestamptz,
  maj_le           timestamptz not null default now()
);
create index of_commande_idx on prod.of (commande_id);
create index of_produit_idx on prod.of (produit_id);
create index of_statut_idx on prod.of (statut);

create table prod.of_parties (
  id            bigserial primary key,
  of_id         bigint not null references prod.of(id),
  partie        int not null check (partie between 1 and 3),
  etat          text not null default 'en_attente' check (etat in ('en_attente', 'en_cours', 'validee', 'sans_objet')),
  qtes_validees jsonb not null default '[]'::jsonb,     -- cumul des validations non annulées
  unique (of_id, partie)
);

-- Validations : ajout seul. Une annulation ne réécrit rien — elle marque la ligne (motif + responsable)
-- et les mouvements de stock inverses sont passés à ce moment-là (CDC §4.6.2).
create table prod.of_validations (
  id          bigserial primary key,
  of_id       bigint not null references prod.of(id),
  partie      int not null check (partie between 1 and 3),
  date        date not null default current_date,
  qtes        jsonb not null default '[]'::jsonb,       -- [{taille, couleur, qte}] de CETTE validation
  sorties     jsonb not null default '[]'::jsonb,       -- coupe : consommations réelles [{article_id, lot_id, qte}]
  remarques   text not null default '',
  photo_id    bigint references commercial.fichiers(id),
  annule      boolean not null default false,
  motif       text not null default '',                 -- motif d'annulation (responsable autorisé)
  annule_le   timestamptz,
  annule_par  int references noyau.utilisateurs(id),
  horodatage  timestamptz not null default now(),
  utilisateur int references noyau.utilisateurs(id)
);
create index of_validations_of_idx on prod.of_validations (of_id, partie, horodatage);

create function prod.pas_de_suppression() returns trigger language plpgsql as $$
begin raise exception 'Suppression interdite : un ordre de fabrication s''annule, il n''est jamais supprimé.'; end $$;
create trigger of_pas_de_suppression before delete on prod.of for each row execute function prod.pas_de_suppression();
create trigger of_parties_pas_de_suppression before delete on prod.of_parties for each row execute function prod.pas_de_suppression();
create trigger of_validations_pas_de_suppression before delete on prod.of_validations for each row execute function prod.pas_de_suppression();

-- Réservations : lecture par OF (consommation à la validation de la coupe)
create index reservations_ref_idx on stocks.reservations_mp (ref_doc) where actif;

-- ================================================================ photos atelier (fichiers)
-- Une validation de partie peut porter une photo prise depuis la tablette (lot 0.12.0) ou le poste.
-- (la table 011 nomme ses contraintes fichiers_* : on étend les deux noms possibles)
alter table commercial.fichiers drop constraint if exists fichiers_nature_check;
alter table commercial.fichiers drop constraint if exists commercial_fichiers_nature_check;
alter table commercial.fichiers add constraint fichiers_nature_check
  check (nature in ('scan_paiement', 'fiche_technique', 'photo_atelier'));
alter table commercial.fichiers drop constraint if exists fichiers_cible_type_check;
alter table commercial.fichiers drop constraint if exists commercial_fichiers_cible_type_check;
alter table commercial.fichiers add constraint fichiers_cible_type_check
  check (cible_type in ('commande', 'produit', 'reglement', 'of'));

-- Réservations soldées (tout consommé) : quantité restante à 0, ligne inactive (trace conservée).
alter table stocks.reservations_mp drop constraint if exists reservations_mp_qte_check;
alter table stocks.reservations_mp add constraint reservations_mp_qte_check check (qte >= 0);
