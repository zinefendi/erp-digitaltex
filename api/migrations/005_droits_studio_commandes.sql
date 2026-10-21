-- Lot ERP 0.6.0 : les infographistes créent et modifient les commandes depuis le Studio 3D
-- (demande de la direction du 21/10/2026). Ils restent SANS le droit de visibilité « prix » :
-- les prix de ces commandes sont calculés par le serveur depuis le catalogue (lib/prix-studio.js).
-- Les commerciaux ont déjà ces droits (matrice CDC § 5.2). Ajout seul : rien n'est retiré.
with ajout as (
  insert into noyau.role_droits (role_id, fonction, action)
  select r.id, v.f, v.a from noyau.roles r,
    (values ('commercial.commandes', 'lire'), ('commercial.commandes', 'creer'), ('commercial.commandes', 'modifier'),
            ('commercial.clients', 'lire'), ('commercial.clients', 'creer'), ('commercial.clients', 'modifier')) v(f, a)
  where r.code = 'infographie'
  on conflict do nothing
  returning role_id, fonction, action
), roles_touches as (
  update noyau.roles set version = version + 1, maj_le = now()
  where id in (select distinct role_id from ajout) returning id, code
)
insert into noyau.audit (action, entite, entite_id, details)
select 'role_droits_modifies', 'role', rt.code,
  jsonb_build_object('origine', 'migration 005', 'ajoutes', (select jsonb_agg(a.fonction || ':' || a.action order by a.fonction, a.action) from ajout a where a.role_id = rt.id))
from roles_touches rt;

-- Contrôle « numéro attribué par le serveur à ce compte » (PUT commande sans prix) : index partiel,
-- pour ne pas parcourir tout le journal d'audit à chaque enregistrement.
create index audit_numero_attribue_idx on noyau.audit (utilisateur_id, (details->>'numero'))
  where action = 'numero_attribue';
