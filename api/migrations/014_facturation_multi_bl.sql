-- Lot ERP 0.13.0 : facture de plusieurs BL d'un même client (module 02 Gestion commerciale).
-- Interrupteur demandé par l'utilisateur le 26/10/2026 : Paramètres › Factures › « Facturation multi-BL »
-- (activée / désactivée par l'administrateur). Désactivée : une facture reprend au plus UN BL (comme avant 0.13.0).
-- Les factures déjà émises ne changent jamais, quelle que soit la valeur.
insert into parametres.options (code, libelle, valeur, commentaire) values
  ('facturation_multi_bl', 'Facturation multi-BL', 'oui',
   'oui : une facture peut regrouper plusieurs BL d’un même client (références BL et commandes sur la facture). non : un seul BL par facture. Réglage de l’administrateur (Paramètres › Factures), décision de l’utilisateur du 26/10/2026.')
on conflict (code) do nothing;
