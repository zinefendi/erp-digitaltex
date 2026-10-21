-- Lot 2, étape 15 : module 10 Paramètres — société, fiscalité datée, numérotation des documents.
create schema if not exists parametres;

-- ---------------------------------------------------------------- Société (une seule ligne)
create table parametres.societe (
  id          int primary key default 1 check (id = 1),
  nom         text not null default '',
  adresse     text not null default '',
  ville       text not null default '',
  telephone   text not null default '',
  email       text not null default '',
  web         text not null default '',
  mf          text not null default '',   -- matricule fiscal
  rc          text not null default '',   -- registre de commerce
  banque      text not null default '',
  rib         text not null default '' check (rib = '' or rib ~ '^[0-9]{20}$'),
  logo        text not null default '' check (logo = '' or (logo ~ '^data:image/(png|jpeg|webp);base64,' and length(logo) <= 700000)),
  mentions    text not null default '',   -- mentions légales en pied de document (à fournir par le comptable)
  version     int not null default 1,
  maj_le      timestamptz not null default now(),
  maj_par     int references noyau.utilisateurs(id)
);
insert into parametres.societe (id) values (1);

-- ---------------------------------------------------------------- Fiscalité : valeurs datées
-- On n'écrase jamais un taux : on ajoute une nouvelle valeur avec sa date d'entrée en vigueur.
-- Un document utilise la valeur en vigueur à sa date (fonction parametres.taux_a).
create table parametres.fiscalite (
  id          serial primary key,
  code        text not null check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  libelle     text not null,
  valeur      numeric(12,3) not null check (valeur >= 0),
  unite       text not null check (unite in ('%', 'DT')),
  en_vigueur_le date not null,
  commentaire text not null default '',
  cree_le     timestamptz not null default now(),
  cree_par    int references noyau.utilisateurs(id),
  unique (code, en_vigueur_le)
);

create function parametres.taux_a(p_code text, p_date date default current_date) returns numeric
language sql stable as $$
  select valeur from parametres.fiscalite where code = p_code and en_vigueur_le <= p_date
  order by en_vigueur_le desc limit 1
$$;

-- Valeurs déjà utilisées par l'application 3.3.0 (TVA 19 %, timbre 1 DT). Les autres taux
-- (TVA réduites, retenue à la source…) seront saisis après validation du comptable.
insert into parametres.fiscalite (code, libelle, valeur, unite, en_vigueur_le, commentaire) values
  ('tva_normale', 'TVA taux normal', 19, '%', '2018-01-01', 'Repris de l’application 3.3.0 — date d’effet à confirmer par le comptable'),
  ('timbre_fiscal', 'Droit de timbre sur facture', 1, 'DT', '2018-01-01', 'Repris de l’application 3.3.0 — montant et date à confirmer par le comptable (loi de finances en vigueur)');

-- ---------------------------------------------------------------- Numérotation
create table parametres.numerotation (
  type      text primary key check (type ~ '^[a-z][a-z_]{1,29}$'),
  libelle   text not null,
  prefixe   text not null check (prefixe ~ '^[A-Z0-9]{1,6}$'),
  chiffres  int not null default 4 check (chiffres between 3 and 6),
  ordre     int not null,
  version   int not null default 1,
  maj_le    timestamptz not null default now()
);
insert into parametres.numerotation (type, libelle, prefixe, ordre) values
  ('devis',    'Devis',                  'DEV', 1),
  ('proforma', 'Facture proforma',       'PRO', 2),
  ('commande', 'Commande',               'CMD', 3),
  ('bl',       'Bon de livraison',       'BL',  4),
  ('facture',  'Facture',                'FAC', 5),
  ('avoir',    'Avoir',                  'AV',  6),
  ('recu',     'Reçu d’avance / règlement', 'REC', 7),
  ('of',       'Ordre de fabrication',   'OF',  8);

create table parametres.compteurs (
  type     text not null references parametres.numerotation(type),
  annee    int not null check (annee between 2000 and 2100),
  dernier  int not null default 0 check (dernier >= 0),
  primary key (type, annee)
);

-- Numéro officiel, attribué dans la transaction du document : verrou de ligne → ni doublon ni trou
-- (si la transaction échoue, le compteur revient en arrière avec elle).
create function parametres.attribuer_numero(p_type text, p_date date default current_date) returns text
language plpgsql as $$
declare n int; t parametres.numerotation; a int := extract(year from p_date);
begin
  select * into t from parametres.numerotation where type = p_type;
  if not found then raise exception 'Type de document inconnu : %', p_type; end if;
  insert into parametres.compteurs (type, annee, dernier) values (p_type, a, 1)
    on conflict (type, annee) do update set dernier = parametres.compteurs.dernier + 1
    returning dernier into n;
  return t.prefixe || '-' || a || '-' || lpad(n::text, t.chiffres, '0');
end $$;

-- ---------------------------------------------------------------- Reprise depuis l'application 3.3.0
do $$
declare s jsonb; g jsonb;
begin
  if to_regclass('reprise.enregistrements') is null then return; end if;
  select donnees into s from reprise.enregistrements where collection = 'parametres' and id_origine = 'societe';
  if s is not null then
    update parametres.societe set
      nom = coalesce(s->>'name', ''), adresse = coalesce(s->>'address', ''), ville = coalesce(s->>'city', ''),
      telephone = coalesce(s->>'phone', ''), email = coalesce(s->>'email', ''), web = coalesce(s->>'web', ''),
      mf = coalesce(s->>'mf', ''), rc = coalesce(s->>'rc', ''), banque = coalesce(s->>'bank', ''),
      rib = case when coalesce(s->>'rib', '') ~ '^[0-9]{20}$' then s->>'rib' else '' end,
      logo = case when coalesce(s->>'logo', '') ~ '^data:image/(png|jpeg|webp);base64,' and length(s->>'logo') <= 700000 then s->>'logo' else '' end
    where id = 1;
  end if;
  select donnees into g from reprise.enregistrements where collection = 'parametres' and id_origine = 'gestion';
  if g is not null then
    update parametres.numerotation set prefixe = upper(g->>'orderPrefix')   where type = 'commande' and upper(coalesce(g->>'orderPrefix', ''))   ~ '^[A-Z0-9]{1,6}$';
    update parametres.numerotation set prefixe = upper(g->>'blPrefix')      where type = 'bl'       and upper(coalesce(g->>'blPrefix', ''))      ~ '^[A-Z0-9]{1,6}$';
    update parametres.numerotation set prefixe = upper(g->>'invoicePrefix') where type = 'facture'  and upper(coalesce(g->>'invoicePrefix', '')) ~ '^[A-Z0-9]{1,6}$';
    update parametres.numerotation set prefixe = upper(g->>'receiptPrefix') where type = 'recu'     and upper(coalesce(g->>'receiptPrefix', '')) ~ '^[A-Z0-9]{1,6}$';
  end if;
  -- compteurs « order:2026 » → commande / 2026
  insert into parametres.compteurs (type, annee, dernier)
  select case split_part(e.id_origine, ':', 1) when 'order' then 'commande' when 'invoice' then 'facture' when 'bl' then 'bl' when 'receipt' then 'recu' end,
         split_part(e.id_origine, ':', 2)::int, (e.donnees->>'dernier_numero')::int
    from reprise.enregistrements e
   where e.collection = 'compteurs' and split_part(e.id_origine, ':', 1) in ('order', 'invoice', 'bl', 'receipt')
     and split_part(e.id_origine, ':', 2) ~ '^[0-9]{4}$'
  on conflict (type, annee) do update set dernier = greatest(parametres.compteurs.dernier, excluded.dernier);
end $$;
