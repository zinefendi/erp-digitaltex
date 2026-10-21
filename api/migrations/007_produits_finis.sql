-- Lot ERP 0.8.0 : refonte « produit fini » + clients Local/Export (spec v2 validée le 21/10/2026).
-- Ajout seul : aucune donnée existante n'est modifiée, sauf les clients (ajout de type_client/devise
-- aux fiches existantes = Local DT, comme prévu par la spec § 4).

-- ================================================================ droits (mêmes motifs que la migration 006)
insert into noyau.fonctions values
  ('commercial.produits_finis', 'commercial', 'Produits finis (références, BOM, gamme, prix)', 10),
  ('parametres.codes_article', 'parametres', 'Codes article (produits finis)', 9),
  ('parametres.couts', 'parametres', 'Coûts et tarifs de production (coût minute, perte, marge, marquages)', 10);
insert into noyau.fonction_actions values
  ('commercial.produits_finis', 'lire'),
  ('commercial.produits_finis', 'creer'),
  ('commercial.produits_finis', 'modifier'),
  ('commercial.produits_finis', 'valider'),
  ('commercial.produits_finis', 'annuler'),
  ('commercial.produits_finis', 'exporter'),
  ('parametres.codes_article', 'lire'),
  ('parametres.codes_article', 'creer'),
  ('parametres.codes_article', 'modifier'),
  ('parametres.codes_article', 'supprimer'),
  ('parametres.couts', 'lire'),
  ('parametres.couts', 'modifier');
insert into noyau.role_droits (role_id, fonction, action)
  select r.id, v.f, v.a from noyau.roles r, (values
    ('direction', 'commercial.produits_finis', 'lire'),
    ('direction', 'parametres.codes_article', 'lire'),
    ('direction', 'parametres.couts', 'lire'),
    ('commercial', 'commercial.produits_finis', 'lire'),
    ('commercial', 'commercial.produits_finis', 'creer'),
    ('commercial', 'commercial.produits_finis', 'modifier'),
    ('commercial', 'commercial.produits_finis', 'valider'),
    ('commercial', 'commercial.produits_finis', 'annuler'),
    ('commercial', 'commercial.produits_finis', 'exporter'),
    ('infographie', 'commercial.produits_finis', 'lire'),
    ('infographie', 'commercial.produits_finis', 'creer'),
    ('infographie', 'commercial.produits_finis', 'modifier'),
    ('comptabilite', 'commercial.produits_finis', 'lire'),
    ('comptabilite', 'commercial.produits_finis', 'creer'),
    ('comptabilite', 'commercial.produits_finis', 'modifier'),
    ('comptabilite', 'commercial.produits_finis', 'valider'),
    ('comptabilite', 'commercial.produits_finis', 'annuler'),
    ('comptabilite', 'commercial.produits_finis', 'exporter'),
    ('comptabilite', 'parametres.codes_article', 'lire'),
    ('comptabilite', 'parametres.couts', 'lire'),
    ('production', 'commercial.produits_finis', 'lire'),
    ('magasin', 'commercial.produits_finis', 'lire')) v(r, f, a) where r.code = v.r;
update noyau.roles set version = version + 1, maj_le = now()
 where code in ('direction', 'commercial', 'infographie', 'comptabilite', 'production', 'magasin');
insert into noyau.audit (action, entite, entite_id, details)
select 'role_droits_modifies', 'role', r.code, jsonb_build_object('origine', 'migration 007', 'ajoutes',
  (select jsonb_agg(d.fonction || ':' || d.action order by d.fonction, d.action) from noyau.role_droits d
    where d.role_id = r.id and (d.fonction = 'commercial.produits_finis'
      or d.fonction in ('parametres.codes_article', 'parametres.couts'))))
from noyau.roles r where r.code in ('direction', 'commercial', 'infographie', 'comptabilite', 'production', 'magasin');

-- ================================================================ codes article (spec § 2, liste complète)
create schema pf;

create table pf.codes_article (
  code     text primary key check (code ~ '^[A-Z][A-Z0-9]{0,9}$'),
  libelle  text not null check (length(trim(libelle)) between 1 and 80),
  actif    boolean not null default true,   -- un code déjà utilisé se désactive, jamais supprimé
  version  int not null default 1,
  maj_le   timestamptz not null default now(),
  maj_par  int references noyau.utilisateurs(id)
);
insert into pf.codes_article (code, libelle) values
  ('B', 'Bonnet'), ('BA', 'Bandana'), ('BAV', 'Bavoir'), ('BD', 'Body'), ('BER', 'Bermuda'),
  ('BL', 'Blouse'), ('BLO', 'Blouson'), ('BR', 'Brassière'), ('C', 'Cape'), ('CB', 'Cape de bain'),
  ('CH', 'Chemise'), ('CHAUSS', 'Chaussettes'), ('COMBI', 'Combinaison'), ('CROP', 'Crop'),
  ('DB', 'Débardeur'), ('DR', 'Drapeau'), ('DSR', 'Dossard'), ('ECH', 'Écharpe'),
  ('GR', 'Grenouillère'), ('H', 'Housse de table'), ('J', 'Jupe'), ('LEG', 'Leggings'),
  ('MANT', 'Manteau'), ('MF', 'Maillot de foot'), ('P', 'Polo'), ('PANT', 'Pantalon'),
  ('PANTC', 'Panta-court'), ('PO', 'Pochette'), ('R', 'Robe'), ('S', 'Sweat/Shirt'),
  ('SC', 'Shirt/Sweat capuche'), ('SH', 'Short'), ('SAL', 'Salopette'), ('TAB', 'Tablier'),
  ('TC', 'Tour de cou bébé'), ('TED', 'Teddy'), ('TNC', 'Tunique'), ('TOP', 'Top'),
  ('TS', 'T-shirt'), ('V', 'Veste de cuisine');

-- Suite de références par (code article, année, sexe) : repart à 001 chaque année, sans doublon ni trou.
create table pf.compteurs_ref (
  code   text not null references pf.codes_article(code),
  annee  int not null check (annee between 2000 and 2100),
  sexe   char(1) not null check (sexe in ('B', 'E', 'F', 'H', 'U')),
  dernier int not null default 0 check (dernier >= 0),
  primary key (code, annee, sexe)
);

-- Attribution dans la transaction du produit fini : l'upsert verrouille la ligne du compteur,
-- deux postes qui créent en même temps passent l'un après l'autre ; un rollback redonne le numéro.
create function pf.attribuer_reference(p_code text, p_sexe char, p_annee int default extract(year from current_date)::int)
returns text language plpgsql as $$
declare n int;
begin
  if not exists (select 1 from pf.codes_article where code = p_code and actif) then
    raise exception 'Code article inconnu ou désactivé : %', p_code;
  end if;
  insert into pf.compteurs_ref (code, annee, sexe, dernier) values (p_code, p_annee, p_sexe, 1)
    on conflict (code, annee, sexe) do update set dernier = pf.compteurs_ref.dernier + 1
    returning dernier into n;
  return p_code || lpad(n::text, 3, '0') || right(p_annee::text, 2) || p_sexe;
end $$;

-- ================================================================ produits finis (spec § 1)
create table pf.produits (
  id           bigserial primary key,
  reference    text not null unique check (reference ~ '^[A-Z]+[0-9]{3}[0-9]{2}[BEFHU]$'),
  code_article text not null references pf.codes_article(code),
  numero       int not null check (numero between 1 and 999),
  annee        int not null check (annee between 2000 and 2100),
  sexe         char(1) not null check (sexe in ('B', 'E', 'F', 'H', 'U')),
  etat         text not null default 'basique' check (etat in ('basique', 'specifique')),
  client_id    text,
  client_nom   text not null default '',
  illustration text not null default '',            -- image de l'infographiste (data URL)
  taillant     jsonb not null default '[]'::jsonb,  -- liste de tailles (ex. ["S","M","L","XL"])
  patronage    text not null default '',            -- fichier Modaris : la référence elle-même (.MDL)
  bom          jsonb not null default '[]'::jsonb,  -- [{matiere, designation, qte, pu, total}]
  gamme        jsonb not null default '[]'::jsonb,  -- [{operation, temps_min}] — total = Σ temps
  marquages    jsonb not null default '[]'::jsonb,  -- [{type, libelle, faces, points, montant}]
  cout_matieres        numeric(14,3) not null default 0 check (cout_matieres >= 0),
  cout_industrialisation numeric(14,3) not null default 0 check (cout_industrialisation >= 0),
  cout_marquages       numeric(14,3) not null default 0 check (cout_marquages >= 0),
  pri          numeric(14,3) not null default 0 check (pri >= 0),
  marge        numeric(6,3) not null default 0 check (marge between 0 and 1000),
  prix_ht      numeric(14,3) not null default 0 check (prix_ht >= 0),
  prix_source  text not null default 'calcule' check (prix_source in ('calcule', 'manuel', 'devis')),
  minutes_gamme numeric(12,3) not null default 0 check (minutes_gamme >= 0),
  note         text not null default '',
  version      int not null default 1,
  annule       boolean not null default false,      -- rien n'est supprimé : on annule (spec § 1)
  cree_le      timestamptz not null default now(),
  cree_par     int references noyau.utilisateurs(id),
  maj_le       timestamptz not null default now(),
  maj_par      int references noyau.utilisateurs(id)
);
create index produits_client_idx on pf.produits (client_id);
create index produits_code_idx on pf.produits (code_article, annee);

create table pf.historique (
  id           bigserial primary key,
  produit_id   bigint not null references pf.produits(id),
  version      int not null,
  action       text not null check (action in ('cree', 'modifie', 'etat_change', 'prix_recalcule', 'annule')),
  donnees      jsonb not null,
  horodatage   timestamptz not null default now(),
  utilisateur  int references noyau.utilisateurs(id)
);
create index historique_produit_idx on pf.historique (produit_id, version desc);

create function pf.pas_de_suppression() returns trigger language plpgsql as $$
begin raise exception 'Suppression interdite : un produit fini se désactive, l''historique est conservé.'; end $$;
create trigger produits_pas_de_suppression before delete on pf.produits for each row execute function pf.pas_de_suppression();
create trigger historique_pas_de_suppression before delete on pf.historique for each row execute function pf.pas_de_suppression();
create trigger codes_pas_de_suppression before delete on pf.codes_article for each row execute function pf.pas_de_suppression();

-- ================================================================ coûts et tarifs datés (spec § 3)
-- Même principe que parametres.fiscalite : une valeur par date d'effet, jamais écrasée.
create table parametres.couts (
  id           bigserial primary key,
  code         text not null check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  libelle      text not null,
  valeur       numeric(14,6) not null check (valeur >= 0),
  unite        text not null check (unite in ('DT', '%', 'min')),
  en_vigueur_le date not null,
  commentaire  text not null default '',
  cree_le      timestamptz not null default now(),
  cree_par     int references noyau.utilisateurs(id),
  unique (code, en_vigueur_le)
);
insert into parametres.couts (code, libelle, valeur, unite, en_vigueur_le, commentaire) values
  ('cout_minute', 'Coût minute (industrialisation)', 0.150, 'DT', current_date,
   'Valeur de départ fixée par la direction le 21/10/2026 (0,150 DT). Sera recalculée plus tard selon la productivité réelle.'),
  ('perte_matiere', 'Perte matière générale', 9, '%', current_date,
   'Appliquée sur tout : matières + industrialisation + marquages (PRI = total × (1 + perte)).'),
  ('marge_defaut', 'Marge par défaut', 40, '%', current_date,
   'Marge sur le PRI pour le prix de vente HT ; modifiable par produit.');

-- Tarifs des marquages : impression par face, broderie par 1 000 points… (table vide à la création :
-- aucun tarif inventé — à saisir dans Paramètres avant d'utiliser des marquages).
create table parametres.tarifs_marquages (
  id           bigserial primary key,
  code         text not null check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  libelle      text not null,
  unite        text not null check (unite in ('par_face', 'par_1000_points', 'par_piece')),
  prix         numeric(14,3) not null check (prix >= 0),
  en_vigueur_le date not null,
  commentaire  text not null default '',
  cree_le      timestamptz not null default now(),
  cree_par     int references noyau.utilisateurs(id),
  unique (code, en_vigueur_le)
);

-- ================================================================ clients Local / Export (spec § 4)
-- Les clients restent dans commercial.documents (jsonb) : on ajoute le type et la devise.
-- Fiches existantes = Local, en dinars (décision de la spec, migration).
update commercial.documents
   set donnees = donnees || jsonb_build_object('type_client', 'local', 'devise', 'DT')
 where collection = 'clients'
   and donnees->>'type_client' is null;

-- ================================================================ articles 0.7.0 → produits finis (spec § 5)
-- Liaison seule : la conversion (choix du code article et du sexe) se fait depuis l'écran
-- Produits finis, à la demande de l'utilisateur, article par article. Rien n'est converti ici.
alter table commercial.articles add column produit_id bigint references pf.produits(id);
