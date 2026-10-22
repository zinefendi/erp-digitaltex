-- ERP 0.9.1 — FODEC sur les factures locales, modification des lignes (facture, BL, avoir), impression au format DIGITAL-TEX.
-- Décision de l'utilisateur (22/10/2026) : FODEC 1 % appliqué aux ventes locales en dinars, jamais à l'export.
-- Comme la TVA et le timbre : valeur datée, jamais écrasée, À CONFIRMER PAR LE COMPTABLE (CDC § 7).
insert into parametres.fiscalite (code, libelle, valeur, unite, en_vigueur_le, commentaire) values
  ('fodec', 'FODEC (ventes locales de produits)', 1, '%', '2026-01-01',
   'Décidé le 22/10/2026 (modèle de facture DIGITAL-TEX) — taux, date d''effet et assiette (produits, hors prestations) à confirmer par le comptable')
on conflict (code, en_vigueur_le) do nothing;

-- Compte proposé pour le FODEC collecté : à confirmer par le comptable (Comptabilité générale › Plan).
insert into compta.plan (cle, libelle, compte, ordre) values
  ('fodec', 'État – FODEC collecté (compte à confirmer par le comptable)', '4471', 19)
on conflict (cle) do nothing;

-- Devis, proformas et avoirs : taux FODEC figé sur le document et montant calculé par le serveur.
alter table ventes.documents
  add column if not exists fodec numeric(6,3) not null default 0 check (fodec between 0 and 100),
  add column if not exists montant_fodec numeric(14,3) not null default 0;
