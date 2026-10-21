-- Lot ERP 0.9.0 : ventes complètes (CDC lots 4 et 5) — devis, proformas, avoirs, colisage export,
-- verrous de modification (bail 30 min). Ajout seul : aucune donnée existante n'est modifiée.
-- Les droits commercial.devis / proformas / avoirs existent depuis la migration 002 (matrice CDC § 5.2).

create schema ventes;

-- ================================================================ devis, proformas, avoirs
-- Numéro attribué par le serveur dans la transaction du document (parametres.attribuer_numero) :
-- DEV-AAAA-NNNN, PRO-AAAA-NNNN, AV-AAAA-NNNN — ni doublon ni trou. Rien ne se supprime (annulation tracée).
create table ventes.documents (
  id            bigserial primary key,
  type          text not null check (type in ('devis', 'proforma', 'avoir')),
  numero        text not null unique,
  date          date not null,
  validite      date,                                   -- devis / proforma : date limite de l'offre
  client_id     text not null default '',
  client        jsonb not null default '{}'::jsonb,     -- copie de la fiche au jour du document
  ref_client    text not null default '',               -- référence / n° de demande du client
  type_client   text not null default 'local' check (type_client in ('local', 'export')),
  devise        text not null default 'DT' check (devise in ('DT', 'EUR', 'USD')),
  langue        text not null default 'fr' check (langue in ('fr', 'en')),
  incoterm      text not null default '' check (incoterm = '' or incoterm in ('EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF')),
  lieu_incoterm text not null default '',
  taux_change   numeric(14,6) check (taux_change is null or taux_change > 0), -- export : 1 EUR/USD = x DT (mémorisé, sert au contrôle vente à perte)
  prix_ttc      boolean not null default true,          -- prix unitaires saisis TTC (local) ou HT (export)
  tva           numeric(6,3) not null default 0 check (tva between 0 and 100),
  timbre        numeric(14,3) not null default 0 check (timbre >= 0),
  lignes        jsonb not null default '[]'::jsonb,     -- [{produit, designation, couleur, taille, qte, pu, remise, service, total_ht}]
  ht            numeric(14,3) not null default 0,
  montant_tva   numeric(14,3) not null default 0,
  ttc           numeric(14,3) not null default 0,
  net           numeric(14,3) not null default 0,
  conditions    text not null default '',               -- conditions de paiement / délai
  note          text not null default '',
  colisage      jsonb not null default '[]'::jsonb,     -- export : [{colis, contenu, quantite, poids_net, poids_brut, dimensions}]
  statut        text not null,
  motif         text not null default '',               -- refus, annulation
  origine_id    bigint references ventes.documents(id), -- proforma issue d'un devis
  commande_id   text,                                   -- commande (commercial.documents 'orders') issue du devis / de la proforma
  commande_num  text,
  facture_id    text,                                   -- avoir : facture d'origine (commercial.documents 'invoices')
  facture_num   text,
  a_rembourser  numeric(14,3) not null default 0,        -- avoir : part dépassant le reste dû de la facture (à rembourser ou imputer)
  vente_perte   boolean not null default false,         -- au moins une ligne sous le prix de revient, confirmée
  version       int not null default 1,
  cree_le       timestamptz not null default now(),
  cree_par      int references noyau.utilisateurs(id),
  maj_le        timestamptz not null default now(),
  maj_par       int references noyau.utilisateurs(id),
  check (
    (type = 'devis'    and statut in ('emis', 'envoye', 'accepte', 'refuse', 'expire', 'transforme', 'annule')) or
    (type = 'proforma' and statut in ('emise', 'envoyee', 'acceptee', 'transformee', 'annulee')) or
    (type = 'avoir'    and statut in ('emis', 'annule'))
  ),
  check (type <> 'avoir' or facture_id is not null)
);
create index ventes_documents_type_idx on ventes.documents (type, date desc);
create index ventes_documents_client_idx on ventes.documents (client_id);
create index ventes_documents_facture_idx on ventes.documents (facture_id) where facture_id is not null;

create function ventes.suppression_interdite() returns trigger language plpgsql as $$
begin raise exception 'Suppression interdite : un devis, une proforma ou un avoir s''annule, il ne se supprime pas.'; end $$;
create trigger documents_pas_de_suppression before delete on ventes.documents
  for each row execute function ventes.suppression_interdite();

-- Liste de colisage d'une facture export (la proforma garde la sienne dans ventes.documents.colisage)
create table ventes.colisages (
  facture_id  text primary key,
  colis       jsonb not null default '[]'::jsonb,
  version     int not null default 1,
  maj_le      timestamptz not null default now(),
  maj_par     int references noyau.utilisateurs(id)
);

-- ================================================================ verrous de modification (CDC § 6)
-- Bail de 30 minutes renouvelable : un document ouvert en modification sur un poste est refusé aux autres,
-- avec le nom de la personne. Le numéro de version reste contrôlé à chaque enregistrement.
create table noyau.verrous (
  entite          text not null check (entite ~ '^[a-z_]{2,30}$'),
  entite_id       text not null check (length(entite_id) between 1 and 60),
  utilisateur_id  int not null references noyau.utilisateurs(id),
  poste           text,
  pris_le         timestamptz not null default now(),
  expire_le       timestamptz not null,
  primary key (entite, entite_id)
);
