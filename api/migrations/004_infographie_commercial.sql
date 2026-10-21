-- Interface ERP v1 : module 1 (catalogue du studio 3D), module 2 (gestion 3.3.0 en réseau),
-- registres simples (fournisseurs, articles matières).

-- ---------------------------------------------------------------- Infographie : catalogue du studio
create schema if not exists infographie;
create table infographie.catalogue (
  id       int primary key default 1 check (id = 1),
  donnees  jsonb not null,
  version  int not null default 1,
  maj_le   timestamptz not null default now(),
  maj_par  int references noyau.utilisateurs(id)
);

-- ---------------------------------------------------------------- Commercial : documents de la gestion 3.3.0
create schema if not exists commercial;
create table commercial.documents (
  collection text not null check (collection in ('clients', 'orders', 'bls', 'invoices')),
  id         text not null check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  donnees    jsonb not null,
  cree_le    timestamptz not null default now(),
  maj_le     timestamptz not null default now(),
  maj_par    int references noyau.utilisateurs(id),
  primary key (collection, id)
);
-- révision globale : permet aux postes de savoir qu'un autre poste a modifié quelque chose
create table commercial.revision (id int primary key default 1 check (id = 1), n bigint not null default 0);
insert into commercial.revision values (1, 0);
create function commercial.incrementer() returns trigger language plpgsql as $$
begin update commercial.revision set n = n + 1 where id = 1; return null; end $$;
create trigger documents_revision after insert or update or delete on commercial.documents
  for each statement execute function commercial.incrementer();

-- Les factures ne se suppriment jamais (statut « annulée »), ni les commandes, ni les BL.
create function commercial.suppression_interdite() returns trigger language plpgsql as $$
begin
  if old.collection <> 'clients' then raise exception 'Suppression interdite pour %', old.collection; end if;
  return old;
end $$;
create trigger documents_pas_de_suppression before delete on commercial.documents
  for each row execute function commercial.suppression_interdite();

-- Reprise : documents importés depuis l'application 3.3.0 (étape 12)
do $$
begin
  if to_regclass('reprise.enregistrements') is null then return; end if;
  execute $q$
    insert into commercial.documents (collection, id, donnees, cree_le, maj_le)
    select e.collection, e.id_origine, e.donnees,
           coalesce((e.donnees->>'createdAt')::timestamptz, now()), coalesce((e.donnees->>'updatedAt')::timestamptz, now())
      from reprise.enregistrements e
     where e.collection in ('clients', 'orders', 'bls', 'invoices') and e.id_origine ~ '^[A-Za-z0-9_-]{1,40}$'
    on conflict do nothing $q$;
end $$;

-- ---------------------------------------------------------------- Registres simples
create schema if not exists registres;
create table registres.fiches (
  registre text not null check (registre in ('fournisseurs', 'articles_mp')),
  id       bigserial primary key,
  donnees  jsonb not null,
  actif    boolean not null default true,
  version  int not null default 1,
  cree_le  timestamptz not null default now(),
  cree_par int references noyau.utilisateurs(id),
  maj_le   timestamptz not null default now(),
  maj_par  int references noyau.utilisateurs(id)
);
create index fiches_registre_idx on registres.fiches (registre, actif);
create unique index fiches_code_unique on registres.fiches (registre, lower(donnees->>'code')) where donnees->>'code' is not null and donnees->>'code' <> '';
