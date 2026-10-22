-- Lot ERP 0.10.0 : stocks matières premières (module 8) et produits finis (module 9).
-- Décisions de l'utilisateur du 22/10/2026 : valorisation FIFO (provisoire, À CONFIRMER PAR LE COMPTABLE),
-- lots et rouleaux de tissu dès ce lot, sortie automatique du stock PF à la validation d'un BL
-- (stock négatif autorisé, alerte tracée). Ajout seul : aucune donnée existante n'est modifiée.
-- Fiche article matière = registres.fiches (registre 'articles_mp'), déjà en service depuis la 0.6.0.

create schema stocks;

-- ================================================================ paramètres datés
create table parametres.stocks (
  id            bigserial primary key,
  code          text not null check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  libelle       text not null,
  valeur        text not null,
  en_vigueur_le date not null,
  commentaire   text not null default '',
  cree_le       timestamptz not null default now(),
  cree_par      int references noyau.utilisateurs(id),
  unique (code, en_vigueur_le)
);
insert into parametres.stocks (code, libelle, valeur, en_vigueur_le, commentaire) values
  ('methode_valorisation', 'Méthode de valorisation des stocks', 'FIFO', '2026-01-01',
   'Choisie par l''utilisateur le 22/10/2026 (premier entré, premier sorti) — à confirmer par le comptable (CDC § 7)')
on conflict (code, en_vigueur_le) do nothing;

-- Numérotation : réceptions matières et inventaires (préfixes modifiables dans Paramètres › Numérotation)
insert into parametres.numerotation (type, libelle, prefixe, ordre) values
  ('reception_mp', 'Réception matières', 'RMP', 9),
  ('inventaire', 'Inventaire de stock', 'INV', 10)
on conflict (type) do nothing;

-- ================================================================ matières premières
-- Réception : en-tête numéroté (RMP-AAAA-NNNN) ; chaque ligne crée un lot (ou un rouleau pour le tissu).
create table stocks.receptions_mp (
  id           bigserial primary key,
  numero       text not null unique,
  date         date not null,
  fournisseur  text not null default '',
  ref_fournisseur text not null default '',   -- n° de BL / facture du fournisseur
  note         text not null default '',
  statut       text not null default 'validee' check (statut in ('validee', 'annulee')),
  motif        text not null default '',
  cree_le      timestamptz not null default now(),
  cree_par     int references noyau.utilisateurs(id)
);

-- Lot = couche FIFO : un coût unitaire, une quantité restante. Tissu : un lot par rouleau (n° de lot, bain).
create table stocks.lots_mp (
  id            bigserial primary key,
  article_id    bigint not null references registres.fiches(id),
  reception_id  bigint references stocks.receptions_mp(id),
  origine_lot   bigint references stocks.lots_mp(id),      -- lot scindé par un transfert d'emplacement
  n_lot         text not null default '',
  bain          text not null default '',                 -- bain de teinture (tissu)
  rouleau       text not null default '',                 -- n° de rouleau (tissu)
  date_entree   date not null,
  qte_initiale  numeric(14,3) not null check (qte_initiale >= 0),
  qte_restante  numeric(14,3) not null check (qte_restante >= 0),
  cout_unitaire numeric(14,4) not null default 0 check (cout_unitaire >= 0),
  emplacement   text not null default '',
  cree_le       timestamptz not null default now()
);
create index lots_mp_article_idx on stocks.lots_mp (article_id, date_entree, id) where qte_restante > 0;

-- Mouvements : ajout seul. qte signée (+ entrée, − sortie), valeur = qte × coût du lot.
create table stocks.mouvements_mp (
  id            bigserial primary key,
  date          date not null default current_date,
  type          text not null check (type in ('reception', 'sortie_of', 'sortie', 'retour', 'transfert', 'ajustement', 'inventaire', 'annulation')),
  article_id    bigint not null references registres.fiches(id),
  lot_id        bigint references stocks.lots_mp(id),
  qte           numeric(14,3) not null,
  cout_unitaire numeric(14,4) not null default 0,
  valeur        numeric(14,3) not null default 0,
  motif         text not null default '',
  ref_doc       text not null default '',                 -- RMP-…, INV-…, OF-… (lot 7)
  emplacement   text not null default '',
  horodatage    timestamptz not null default now(),
  utilisateur   int references noyau.utilisateurs(id)
);
create index mouvements_mp_article_idx on stocks.mouvements_mp (article_id, horodatage desc);

-- Réservations pour les OF (utilisées au lot 7) : disponible = physique − réservé
create table stocks.reservations_mp (
  id          bigserial primary key,
  article_id  bigint not null references registres.fiches(id),
  qte         numeric(14,3) not null check (qte > 0),
  ref_doc     text not null default '',
  actif       boolean not null default true,
  cree_le     timestamptz not null default now(),
  cree_par    int references noyau.utilisateurs(id)
);

-- ================================================================ produits finis
-- Stock par produit fini, taille et couleur (peut être négatif après un BL : alerte tracée).
create table stocks.pf_stock (
  produit_id  bigint not null references pf.produits(id),
  taille      text not null default '',
  couleur     text not null default '',
  qte         numeric(14,3) not null default 0,
  emplacement text not null default '',
  maj_le      timestamptz not null default now(),
  primary key (produit_id, taille, couleur)
);
-- Couches FIFO des produits finis (coût d'entrée = prix de revient PRI du produit au jour de l'entrée)
create table stocks.couches_pf (
  id            bigserial primary key,
  produit_id    bigint not null references pf.produits(id),
  taille        text not null default '',
  couleur       text not null default '',
  date_entree   date not null default current_date,
  qte_restante  numeric(14,3) not null check (qte_restante >= 0),
  cout_unitaire numeric(14,4) not null default 0 check (cout_unitaire >= 0),
  cree_le       timestamptz not null default now()
);
create index couches_pf_idx on stocks.couches_pf (produit_id, taille, couleur, date_entree, id) where qte_restante > 0;

create table stocks.mouvements_pf (
  id             bigserial primary key,
  date           date not null default current_date,
  type           text not null check (type in ('entree_manuelle', 'entree_of', 'sortie_bl', 'retour_bl', 'retour_client', 'sortie', 'ajustement', 'inventaire')),
  produit_id     bigint not null references pf.produits(id),
  taille         text not null default '',
  couleur        text not null default '',
  qte            numeric(14,3) not null,
  valeur         numeric(14,3) not null default 0,
  motif          text not null default '',
  ref_doc        text not null default '',                -- id du BL (commercial.documents), INV-…
  ref_num        text not null default '',                -- n° lisible (BL-2026-0004…)
  alerte_negatif boolean not null default false,
  horodatage     timestamptz not null default now(),
  utilisateur    int references noyau.utilisateurs(id)
);
create index mouvements_pf_produit_idx on stocks.mouvements_pf (produit_id, horodatage desc);
create index mouvements_pf_doc_idx on stocks.mouvements_pf (ref_doc) where ref_doc <> '';

-- ================================================================ inventaires (MP ou PF)
create table stocks.inventaires (
  id          bigserial primary key,
  numero      text not null unique,
  stock       text not null check (stock in ('mp', 'pf')),
  type        text not null default 'periodique' check (type in ('periodique', 'tournant')),
  date        date not null,
  note        text not null default '',
  statut      text not null default 'brouillon' check (statut in ('brouillon', 'valide', 'annule')),
  lignes      jsonb not null default '[]'::jsonb,   -- MP : [{lot_id, theorique, compte, justification}] · PF : [{produit_id, taille, couleur, theorique, compte, justification}]
  version     int not null default 1,
  cree_le     timestamptz not null default now(),
  cree_par    int references noyau.utilisateurs(id),
  valide_le   timestamptz,
  valide_par  int references noyau.utilisateurs(id)
);

-- Rien ne se supprime : mouvements, réceptions et inventaires sont des pièces de stock.
create function stocks.suppression_interdite() returns trigger language plpgsql as $$
begin raise exception 'Suppression interdite : un mouvement de stock se corrige par un mouvement inverse.'; end $$;
create trigger mvt_mp_pas_de_suppression before delete on stocks.mouvements_mp for each row execute function stocks.suppression_interdite();
create trigger mvt_pf_pas_de_suppression before delete on stocks.mouvements_pf for each row execute function stocks.suppression_interdite();
create trigger rec_pas_de_suppression before delete on stocks.receptions_mp for each row execute function stocks.suppression_interdite();
create trigger inv_pas_de_suppression before delete on stocks.inventaires for each row execute function stocks.suppression_interdite();
create trigger lots_pas_de_suppression before delete on stocks.lots_mp for each row execute function stocks.suppression_interdite();
create function stocks.mouvement_fige() returns trigger language plpgsql as $$
begin raise exception 'Un mouvement de stock ne se modifie pas : passez un mouvement inverse.'; end $$;
create trigger mvt_mp_fige before update on stocks.mouvements_mp for each row execute function stocks.mouvement_fige();
create trigger mvt_pf_fige before update on stocks.mouvements_pf for each row execute function stocks.mouvement_fige();
