-- Lot ERP 0.7.0 : réponses du comptable (21/10/2026) + comptabilité clients et fournisseurs
-- + module 11 « Comptabilité générale » (retenues à la source gérées à part, journaux, plan, valorisation CMUP)
-- + articles et prestations vendus hors Studio (créés par le commercial ou le comptable).
-- Ajout seul : aucune donnée existante n'est modifiée, sauf les commentaires de deux taux et des mentions vides.

-- ================================================================ droits (générés depuis lib/droits-catalogue.js)
insert into noyau.modules values ('compta_generale', 11, 'Comptabilité générale');
insert into noyau.fonctions values
  ('commercial.articles', 'commercial', 'Articles et prestations (hors Studio)', 9),
  ('compta_generale.retenues', 'compta_generale', 'Retenues à la source (subies et opérées)', 1),
  ('compta_generale.journaux', 'compta_generale', 'Journaux, écritures et balance', 2),
  ('compta_generale.plan', 'compta_generale', 'Plan comptable', 3),
  ('compta_generale.valorisation', 'compta_generale', 'Valorisation des stocks (CMUP)', 4);
insert into noyau.fonction_actions values
  ('commercial.articles', 'lire'),
  ('commercial.articles', 'creer'),
  ('commercial.articles', 'modifier'),
  ('commercial.articles', 'supprimer'),
  ('commercial.articles', 'exporter'),
  ('compta_generale.retenues', 'lire'),
  ('compta_generale.retenues', 'creer'),
  ('compta_generale.retenues', 'valider'),
  ('compta_generale.retenues', 'annuler'),
  ('compta_generale.retenues', 'exporter'),
  ('compta_generale.journaux', 'lire'),
  ('compta_generale.journaux', 'exporter'),
  ('compta_generale.plan', 'lire'),
  ('compta_generale.plan', 'modifier'),
  ('compta_generale.valorisation', 'lire'),
  ('compta_generale.valorisation', 'exporter');
insert into noyau.role_droits (role_id, fonction, action)
  select r.id, v.f, v.a from noyau.roles r, (values
    ('direction', 'commercial.articles', 'lire'),
    ('direction', 'compta_generale.retenues', 'lire'),
    ('direction', 'compta_generale.journaux', 'lire'),
    ('direction', 'compta_generale.plan', 'lire'),
    ('direction', 'compta_generale.valorisation', 'lire'),
    ('commercial', 'commercial.articles', 'lire'),
    ('commercial', 'commercial.articles', 'creer'),
    ('commercial', 'commercial.articles', 'modifier'),
    ('commercial', 'commercial.articles', 'supprimer'),
    ('commercial', 'commercial.articles', 'exporter'),
    ('infographie', 'commercial.articles', 'lire'),
    ('comptabilite', 'commercial.articles', 'lire'),
    ('comptabilite', 'commercial.articles', 'creer'),
    ('comptabilite', 'commercial.articles', 'modifier'),
    ('comptabilite', 'commercial.articles', 'supprimer'),
    ('comptabilite', 'commercial.articles', 'exporter'),
    ('comptabilite', 'compta_generale.retenues', 'lire'),
    ('comptabilite', 'compta_generale.retenues', 'creer'),
    ('comptabilite', 'compta_generale.retenues', 'valider'),
    ('comptabilite', 'compta_generale.retenues', 'annuler'),
    ('comptabilite', 'compta_generale.retenues', 'exporter'),
    ('comptabilite', 'compta_generale.journaux', 'lire'),
    ('comptabilite', 'compta_generale.journaux', 'exporter'),
    ('comptabilite', 'compta_generale.plan', 'lire'),
    ('comptabilite', 'compta_generale.plan', 'modifier'),
    ('comptabilite', 'compta_generale.valorisation', 'lire'),
    ('comptabilite', 'compta_generale.valorisation', 'exporter')) v(r, f, a) where r.code = v.r;
update noyau.roles set version = version + 1, maj_le = now() where code in ('direction', 'commercial', 'infographie', 'comptabilite');
insert into noyau.audit (action, entite, entite_id, details)
select 'role_droits_modifies', 'role', r.code, jsonb_build_object('origine', 'migration 006', 'ajoutes',
  (select jsonb_agg(d.fonction || ':' || d.action order by d.fonction, d.action) from noyau.role_droits d
    where d.role_id = r.id and (d.fonction like 'compta_generale.%' or d.fonction = 'commercial.articles')))
from noyau.roles r where r.code in ('direction', 'commercial', 'infographie', 'comptabilite');

-- ================================================================ réponses du comptable : fiscalité et options
update parametres.fiscalite set commentaire = 'Confirmé par le comptable le 21/10/2026'
 where code in ('tva_normale', 'timbre_fiscal') and en_vigueur_le = '2018-01-01';
insert into parametres.fiscalite (code, libelle, valeur, unite, en_vigueur_le, commentaire) values
  ('tva_export', 'TVA sur ventes à l’exportation', 0, '%', '2018-01-01', 'Confirmé par le comptable le 21/10/2026 — mention « Vente à l’exportation » (art. 11 du Code de la TVA)'),
  ('ras_achats', 'Retenue à la source : achats de biens et services', 1.5, '%', '2026-01-01', 'Art. 52 du Code de l’IRPP et de l’IS, sur le TTC — taux à confirmer par le comptable'),
  ('ras_seuil', 'Retenue à la source : seuil (montant TTC)', 1000, 'DT', '2026-01-01', 'Retenue sur les paiements d’au moins 1 000 DT TTC — à confirmer par le comptable'),
  ('ras_honoraires', 'Retenue à la source : honoraires (sociétés et régime réel)', 3, '%', '2026-01-01', 'Art. 52 du Code de l’IRPP et de l’IS — à confirmer par le comptable'),
  ('ras_honoraires_autres', 'Retenue à la source : honoraires (autres cas)', 10, '%', '2026-01-01', 'Art. 52 du Code de l’IRPP et de l’IS — à confirmer par le comptable'),
  ('ras_loyers', 'Retenue à la source : loyers', 10, '%', '2026-01-01', 'Art. 52 du Code de l’IRPP et de l’IS — à confirmer par le comptable')
on conflict do nothing;

create table parametres.options (
  code     text primary key check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  libelle  text not null,
  valeur   text not null,
  commentaire text not null default '',
  maj_le   timestamptz not null default now(),
  maj_par  int references noyau.utilisateurs(id)
);
insert into parametres.options (code, libelle, valeur, commentaire) values
  ('methode_stock', 'Valorisation des stocks', 'CMUP', 'Coût moyen unitaire pondéré, méthode admise par la norme comptable tunisienne NC 04. Choisie par l’ERP à la demande du comptable (21/10/2026).'),
  ('facture_electronique', 'Facture électronique El Fatoora (TTN)', 'oui', 'Obligatoire pour DIGITAL-TEX selon le comptable (21/10/2026). Générateur TEIF (XML) et envoi à TTN prévus au lot 5 ; adhésion TTN et certificat de signature électronique à obtenir par la société.'),
  ('ecarts_change', 'Écarts de change', 'aucun', 'Les factures en EUR ou en USD restent dans leur devise : aucun écart de change n’est calculé (comptable, 21/10/2026).'),
  ('bareme_paie', 'Barème de paie', 'libre', 'Barème libre ; la convention collective sectorielle de la bonneterie et de la confection est affichée à titre indicatif (comptable, 21/10/2026).'),
  ('export_comptable', 'Format des exports comptables', 'CSV et Excel', 'Au choix de l’utilisateur à chaque export (comptable, 21/10/2026).');


-- mention légale proposée en pied de facture (seulement si aucune n'a encore été saisie ; modifiable dans Paramètres › Société)
update parametres.societe set mentions = 'Facture établie conformément à l’article 18 du Code de la TVA.', version = version + 1, maj_le = now()
 where id = 1 and mentions = '';

insert into parametres.numerotation (type, libelle, prefixe, ordre) values
  ('encaissement', 'Encaissement client', 'ENC', 9),
  ('facture_f', 'Facture fournisseur (n° interne)', 'FF', 10),
  ('reglement_f', 'Règlement fournisseur', 'RGF', 11),
  ('ras', 'Certificat de retenue à la source', 'RAS', 12)
on conflict do nothing;

-- ================================================================ articles et prestations hors Studio (module 2)
create table commercial.articles (
  id          bigserial primary key,
  code        text not null check (code ~ '^[A-Za-z0-9._-]{1,30}$'),
  designation text not null check (length(trim(designation)) between 1 and 200),
  type        text not null default 'produit' check (type in ('produit', 'prestation')),
  unite       text not null default 'pièce',
  prix_ht     numeric(14,3) not null default 0 check (prix_ht >= 0),
  tva         numeric(6,3) not null default 19 check (tva between 0 and 100),
  compte      text not null default '' check (compte = '' or compte ~ '^[0-9]{2,10}$'),
  note        text not null default '',
  actif       boolean not null default true,
  version     int not null default 1,
  cree_le     timestamptz not null default now(),
  cree_par    int references noyau.utilisateurs(id),
  maj_le      timestamptz not null default now(),
  maj_par     int references noyau.utilisateurs(id)
);
create unique index articles_code_unique on commercial.articles (lower(code));

-- ================================================================ comptabilité
create schema compta;

-- Plan de comptes utilisé pour générer les écritures (propositions NC 01, à valider par le comptable)
create table compta.plan (
  cle      text primary key check (cle ~ '^[a-z][a-z0-9_]{1,39}$'),
  libelle  text not null,
  compte   text not null check (compte ~ '^[0-9]{1,10}$'),
  ordre    int not null,
  maj_le   timestamptz not null default now(),
  maj_par  int references noyau.utilisateurs(id)
);
insert into compta.plan (cle, libelle, compte, ordre) values
  ('clients', 'Clients', '411', 1),
  ('clients_avances', 'Clients – avances et acomptes reçus sur commandes', '4191', 2),
  ('fournisseurs', 'Fournisseurs', '401', 3),
  ('ventes_produits', 'Ventes de produits finis (local)', '701', 4),
  ('ventes_export', 'Ventes de produits finis (export)', '701', 5),
  ('ventes_prestations', 'Prestations de services', '706', 6),
  ('tva_collectee', 'TVA collectée', '4367', 7),
  ('tva_deductible', 'TVA déductible', '4366', 8),
  ('timbre', 'État – droit de timbre sur factures', '4472', 9),
  ('ras_subies', 'État – retenues à la source subies (acomptes d’impôt)', '4351', 10),
  ('ras_operees', 'État – retenues à la source opérées (à reverser)', '4353', 11),
  ('banque', 'Banque', '532', 12),
  ('caisse', 'Caisse', '54', 13),
  ('achats', 'Achats de matières premières', '601', 14),
  ('services', 'Services extérieurs', '62', 15),
  ('honoraires', 'Honoraires', '622', 16),
  ('loyers', 'Loyers', '613', 17),
  ('autres_charges', 'Autres charges', '6', 18);

-- Encaissements clients : un encaissement peut solder plusieurs factures (lettrage).
-- Chaque affectation est aussi écrite dans le règlement de la facture (Gestion), avec la référence de l'encaissement.
create table compta.encaissements (
  id          bigserial primary key,
  numero      text not null unique,
  client_id   text not null,
  client_nom  text not null,
  date        date not null,
  montant     numeric(14,3) not null check (montant >= 0),
  devise      text not null default 'DT' check (devise in ('DT', 'EUR', 'USD')),
  mode        text not null,
  reference   text not null default '',
  banque      text not null default '',
  echeance    date,
  statut      text not null default 'valide' check (statut in ('valide', 'portefeuille', 'remis', 'impaye', 'annule')),
  note        text not null default '',
  motif       text not null default '',
  version     int not null default 1,
  cree_le     timestamptz not null default now(),
  cree_par    int references noyau.utilisateurs(id),
  maj_le      timestamptz not null default now(),
  maj_par     int references noyau.utilisateurs(id)
);
create index encaissements_client_idx on compta.encaissements (client_id, date);
create table compta.affectations_clients (
  encaissement_id bigint not null references compta.encaissements(id),
  facture_id      text not null,
  montant         numeric(14,3) not null check (montant >= 0),   -- part payée (espèces, chèque, virement…)
  retenue         numeric(14,3) not null default 0 check (retenue >= 0), -- part retenue à la source par le client
  actif           boolean not null default true,
  cree_le         timestamptz not null default now(),
  primary key (encaissement_id, facture_id),
  check (montant + retenue > 0)
);

create table compta.relances (
  id          bigserial primary key,
  client_id   text not null,
  client_nom  text not null,
  niveau      int not null check (niveau between 1 and 3),
  date        date not null default current_date,
  canal       text not null check (canal in ('courrier', 'email', 'telephone', 'visite')),
  factures    jsonb not null,
  montant     numeric(14,3) not null,
  devise      text not null default 'DT',
  note        text not null default '',
  cree_le     timestamptz not null default now(),
  cree_par    int references noyau.utilisateurs(id)
);
create index relances_client_idx on compta.relances (client_id, date desc);

-- Factures fournisseurs (n° interne FF + n° du fournisseur), montants recalculés par le serveur
create table compta.factures_fournisseurs (
  id              bigserial primary key,
  numero          text not null unique,
  fournisseur_id  bigint not null references registres.fiches(id),
  fournisseur_nom text not null,
  fournisseur_mf  text not null default '',
  reference       text not null check (length(trim(reference)) between 1 and 60),
  date            date not null,
  echeance        date,
  devise          text not null default 'DT' check (devise in ('DT', 'EUR', 'USD')),
  categorie       text not null default 'achats' check (categorie in ('achats', 'services', 'honoraires', 'loyers', 'autres_charges')),
  compte_charge   text not null default '' check (compte_charge = '' or compte_charge ~ '^[0-9]{1,10}$'),
  lignes          jsonb not null default '[]',
  ht              numeric(14,3) not null default 0,
  tva             numeric(14,3) not null default 0,
  timbre          numeric(14,3) not null default 0 check (timbre >= 0),
  net             numeric(14,3) not null default 0,
  statut          text not null default 'saisie' check (statut in ('saisie', 'validee', 'annulee')),
  note            text not null default '',
  motif           text not null default '',
  version         int not null default 1,
  cree_le         timestamptz not null default now(),
  cree_par        int references noyau.utilisateurs(id),
  maj_le          timestamptz not null default now(),
  maj_par         int references noyau.utilisateurs(id),
  valide_le       timestamptz,
  valide_par      int references noyau.utilisateurs(id)
);
-- la même facture d'un fournisseur ne peut pas être saisie deux fois
create unique index ff_reference_unique on compta.factures_fournisseurs (fournisseur_id, lower(reference)) where statut <> 'annulee';
create index ff_fournisseur_idx on compta.factures_fournisseurs (fournisseur_id, date);

create table compta.reglements_fournisseurs (
  id              bigserial primary key,
  numero          text not null unique,
  fournisseur_id  bigint not null references registres.fiches(id),
  fournisseur_nom text not null,
  date            date not null,
  devise          text not null default 'DT' check (devise in ('DT', 'EUR', 'USD')),
  mode            text not null,
  reference       text not null default '',
  banque          text not null default '',
  brut            numeric(14,3) not null check (brut > 0),
  retenue         numeric(14,3) not null default 0 check (retenue >= 0),
  net             numeric(14,3) not null,
  statut          text not null default 'valide' check (statut in ('valide', 'annule')),
  note            text not null default '',
  motif           text not null default '',
  cree_le         timestamptz not null default now(),
  cree_par        int references noyau.utilisateurs(id),
  maj_le          timestamptz not null default now(),
  maj_par         int references noyau.utilisateurs(id),
  check (net = brut - retenue)
);
create table compta.affectations_fournisseurs (
  reglement_id bigint not null references compta.reglements_fournisseurs(id),
  facture_id   bigint not null references compta.factures_fournisseurs(id),
  montant      numeric(14,3) not null check (montant > 0),
  actif        boolean not null default true,
  primary key (reglement_id, facture_id)
);

-- Retenues à la source : opérées (sur nos paiements fournisseurs → certificat RAS émis) et subies (retenues par nos clients)
create table compta.retenues (
  id               bigserial primary key,
  sens             text not null check (sens in ('operee', 'subie')),
  numero           text unique,                 -- certificat émis (opérées) : RAS-AAAA-NNNN
  tiers_type       text not null check (tiers_type in ('client', 'fournisseur')),
  tiers_id         text not null,
  tiers_nom        text not null,
  tiers_mf         text not null default '',
  tiers_adresse    text not null default '',
  document         text not null default '',     -- n° de la facture concernée
  facture_client_id text,
  facture_f_id     bigint references compta.factures_fournisseurs(id),
  reglement_id     bigint references compta.reglements_fournisseurs(id),
  encaissement_id  bigint references compta.encaissements(id),
  date             date not null,
  nature           text not null default 'achats',
  base             numeric(14,3) not null check (base >= 0),
  taux             numeric(6,3) not null check (taux >= 0 and taux <= 100),
  montant          numeric(14,3) not null check (montant > 0),
  devise           text not null default 'DT',
  certificat_recu  boolean not null default false, -- subies : certificat remis par le client
  certificat_ref   text not null default '',
  statut           text not null default 'valide' check (statut in ('valide', 'annule')),
  note             text not null default '',
  cree_le          timestamptz not null default now(),
  cree_par         int references noyau.utilisateurs(id),
  maj_le           timestamptz not null default now(),
  maj_par          int references noyau.utilisateurs(id)
);
create index retenues_sens_idx on compta.retenues (sens, date);

-- Jamais de suppression dans la comptabilité : on annule (statut), comme pour les factures
create function compta.suppression_interdite() returns trigger language plpgsql as $$
begin raise exception 'Suppression interdite en comptabilité : utilisez l’annulation.'; end $$;
create trigger enc_pas_de_suppression before delete on compta.encaissements for each row execute function compta.suppression_interdite();
create trigger aff_c_pas_de_suppression before delete on compta.affectations_clients for each row execute function compta.suppression_interdite();
create trigger ff_pas_de_suppression before delete on compta.factures_fournisseurs for each row execute function compta.suppression_interdite();
create trigger rgf_pas_de_suppression before delete on compta.reglements_fournisseurs for each row execute function compta.suppression_interdite();
create trigger aff_f_pas_de_suppression before delete on compta.affectations_fournisseurs for each row execute function compta.suppression_interdite();
create trigger ras_pas_de_suppression before delete on compta.retenues for each row execute function compta.suppression_interdite();
create trigger rel_pas_de_suppression before delete on compta.relances for each row execute function compta.suppression_interdite();
