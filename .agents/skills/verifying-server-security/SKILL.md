---
name: verifying-server-security
description: Vérifier une garde serveur AthleX (RLS, grants, triggers, RPC) sur la pile Supabase jetable puis en production en lecture seule — rejeu d'une suite seule, validation par mutation inverse, et audit du catalogue de prod. À utiliser pour tout lot qui touche des policies, des grants, des SECURITY DEFINER ou des RPC d'argent.
---

# Vérifier une garde serveur (RLS · grants · triggers · RPC)

Ce dépôt porte des gardes serveur dont la preuve ne peut pas venir de l'écran : un test qui affiche
un refus prouve le client, pas la base. Ce qui se constate, c'est **l'effet observé dans la base**
sous une vraie identité — jamais qu'un écran s'affiche.

## Pile Supabase jetable = la seule cible d'écriture

```bash
./scripts/test-stack.sh up      # baseline de prod + migrations ; écrit /tmp/athlex-test-stack.env
./scripts/test-stack.sh down
set -a && . /tmp/athlex-test-stack.env && set +a   # TEST_SUPABASE_URL / _ANON_KEY / _SERVICE_ROLE_KEY
```

**Relecture SQL** (comptages avant/après, catalogue) : les suites de grants lisent le catalogue par
`psql`, pas par PostgREST. L'URL admin de la pile locale, à exporter une fois :

```bash
export TEST_ADMIN_DB_URL=postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres
```

## Rejouer une suite seule (la liste complète est dans `.github/workflows/integration.yml`)

```bash
set -a && . /tmp/athlex-test-stack.env && set +a
node scripts/test-grants.mjs                 # grants EXECUTE + grants de tables (T1..T9)
node scripts/test-programs-par-box.mjs        # programmes administrés par la box
node scripts/test-comptoir-programmes.mjs     # argent : journal comptoir + surfaces
node scripts/test-rls.mjs
```

Le workflow est la source de vérité du nombre de suites : ne jamais en « choisir quelques-unes »
sur mémoire. Une révocation massive sans **contrôle positif** (toutes les suites rejouées) est
indistinguable d'une panne massive.

Restauration après un sabotage local (grants réintroduits, garde retirée) : **rejouer la migration**,
pas recréer la pile —

```bash
psql "$TEST_ADMIN_DB_URL" -f supabase/migrations/<migration du lot>.sql
```

## Le contrôle se valide par mutation inverse, toujours

Une assertion qui ne peut pas échouer n'en est pas une, et cela ne se voit pas à la lecture.
Occurrences réelles de ce dépôt :

- `has_function_privilege(...)::text` rend `true`/`false` — une comparaison à `'t'` rendait
  l'assertion **inconditionnellement verte** ; elle était verte au moment précis où l'`EXECUTE`
  venait d'être accordé. Rendre un libellé explicite (`case when … then 'ouvert' else 'ferme' end`).
- Un `status >= 400` accepte un refus de **RLS** : ce n'est pas la preuve d'une révocation de grant.
  Exiger le message nommé `permission denied for (table|view)` **et** un invariant d'état avant/après.
- Un `DELETE` anonyme sur zéro ligne répond `204` : un « 0 ligne » silencieux ressemble à un succès
  *et* à une garde. Après révocation, la base dit `401 permission denied` — c'est ce qu'il faut exiger.
- Ce qui est compté doit être ce qui bougerait : par une vue `INSTEAD OF`, une écriture n'ajoute
  aucune ligne, elle allonge un tableau (`sum(array_length(members,1))`, pas `count(*)`).

Procédure : réintroduire le grant / retirer la garde par `psql` sur la pile, exiger le rouge **nommé**,
puis rejouer la migration pour restaurer.

**Isoler chaque écriture adversariale sur son propre objet.** Dans l'état sabotté, la première
écriture réussit : les suivantes visant le même couple `(offre, box)` tombent alors sur la clé
unique — rouge, mais pas pour l'autorisation, donc **vert par accident** dans l'état sécurisé, et les
invariants d'après mesurent l'effet du saboteur au lieu de la garde. Une offre (ou un décor) vierge
par identité testée, et un `upsert` pour les contrôles positifs qui doivent rester valides quelle
que soit la ligne laissée derrière.

**Ne garder que la transition, pas l'état.** Un trigger qui refuse `NEW.status = 'active'` fait
tomber avec lui tous les `UPDATE` légitimes d'une ligne **déjà** active (bascule d'option,
résiliation). Garder `NEW.status = 'active' AND OLD.status <> 'active'`, et poser en contrôles
positifs les gestes de staff qui traversent la même ligne.

**Un prix, un droit ou un montant relu dans la table plutôt que reçu en argument.** La RLS répond
« qui gère cette box », jamais « cette offre est-elle gratuite » : c'est la fonction qui doit
recharger `price_cents`/`billing` depuis l'offre. Un `insert` client qui pose lui-même
`status = 'active'` (ou une référence de paiement) est la forme canonique du « servi sans payer » —
réserver l'activation au backend signé (`request_is_backend()`) et donner au client une RPC qui
vérifie la gratuité côté serveur.

## Un refus pour la mauvaise raison est un faux vert

Un contrôle adversarial du type « le coach doit être refusé » est vert dès que l'appel échoue —
y compris quand il échoue pour une raison qui n'a rien à voir avec l'autorisation :

```
✅ coach refusé sur assign_program_cash
   · refus : Could not find the function public.assign_program_cash(p_amount_cents, p_member_id, …)
```

Le paramètre s'appelait `p_user_id`. La garde n'a jamais été atteinte. Exiger le **message attendu**
(`Accès refusé : gérant ou co-gérant de la box du programme requis`), et non « `error != null` ».
Corollaire : imprimer systématiquement le message de refus obtenu, c'est lui qui a révélé l'erreur.

Même famille côté décor : PostgREST répond `Could not find the 'X' column … in the schema cache`
quand un `insert` de décor se trompe de colonne. Lire les vrais noms avant d'écrire le décor —

```bash
psql "$TEST_ADMIN_DB_URL" -c "\d public.<table>" \
  -c "select proname, pg_get_function_arguments(oid) from pg_proc where proname='<rpc>'"
```

Pièges déjà rencontrés : `box_wods.wod_type` (pas `type`), `box_programming.weeks_count`/`billing`
(pas `weeks`/`billing_period`), `list_week_templates` rend `template_id` (pas `id`),
`programs.type ∈ {fixed, ongoing}`, `apply_program_week` ne prend **pas** de `p_box_id` (la box est
dérivée de la source).

## Pièges de gardes SECURITY DEFINER

- `is_privileged_backend()` est **inerte** dans une fonction `SECURITY DEFINER` : `current_user` y vaut
  déjà le propriétaire (`postgres`), donc la garde laisse passer tout le monde. Lire l'identité du JWT :
  `public.request_is_backend() OR public.is_box_owner_admin(v_box_id)`.
- Une vue sans `security_invoker=true` s'exécute avec les droits de son propriétaire : la RLS de la
  table sous-jacente n'est **pas** évaluée. Une vue n'est pas une table avec un chapeau.
- `is_box_owner_admin` n'est pas exécutable par `anon` : une policy `FOR ALL` non scopée fait tomber
  les pages publiques en `permission denied for function`. Scoper `TO authenticated` et servir la
  lecture publique par des grants de colonnes explicites.

## Ajouter un paramètre à une fonction, c'est en créer une seconde

`CREATE OR REPLACE FUNCTION f(a,b,c)` sur une `f(a,b)` existante crée une **surcharge** : les appelants
d'avant tombent en `function is not unique` — donc le lot qui étend le journal casse le journal.
Supprimer explicitement l'ancienne signature, et faire emprunter le chemin d'origine par la suite
(au vrai JWT) plutôt que de le décorer.

## Le journal de caisse refuse d'être nettoyé (et c'est correct)

`box_cash_payments` est en ajout seul (trigger `APPEND_ONLY` sur UPDATE/DELETE) : le nettoyage d'un
décor de test est refusé par la base. Sur la **pile jetable uniquement**, désactiver le trigger en
superuser pour purger. Ne jamais tenter cela ailleurs.

Corollaire de test d'argent : donner au décor une **baseline non nulle** et un montant encaissé
**absent partout ailleurs** (ex. baseline 30 €, encaissement 37 €) — un double comptage affiche alors
74 au lieu de 86, sans ambiguïté possible.

## Production : lecture seule, et le catalogue est la preuve

```bash
set -a && . ./.env && set +a
PROD_DB_URL="$SUPABASE_DB_URL" PROD_SUPABASE_URL="$EXPO_PUBLIC_SUPABASE_URL" \
PROD_SUPABASE_ANON_KEY="$EXPO_PUBLIC_SUPABASE_ANON_KEY" node scripts/audit-grants-prod.mjs
# imprime AUDIT_PROD_ASSERTIONS=x/y — un contrôle doit affirmer qu'il a tourné
```

Règles de l'audit de prod :

- **aucune mutation** : pas de `POST`/`DELETE` de table, et pas d'appel de RPC mutante. Une RPC qui
  écrit n'apporte une information neuve que dans l'état où le grant a régressé — donc exactement
  dans l'état où elle aboutit : l'audit deviendrait l'auteur du dégât qu'il constate. La juger sur
  `has_function_privilege`, corps jamais atteint.
- Le même critère des deux côtés : sinon la prod est jugée par un contrôle que la pile n'exerce jamais.
- Si une sonde anonyme doit quand même toucher une garde en prod, la viser sur un **UUID inexistant** :
  même si le grant avait survécu, la garde lève `GROUPE_INCONNU` et rien ne change.

Écarts de décor connus entre pile et prod, à nommer plutôt qu'à supposer couverts :

- les relations de `public` appartiennent à `supabase_admin` sur la pile, à **`postgres`** en prod :
  la branche « privilèges par défaut / propriétaires » ne s'exerce que sur la vraie base ;
- le défaut de `supabase_admin` est hors de portée depuis `postgres` (rôle de la plateforme) : il n'est
  pas refermé, il est **surveillé** par l'assertion « aucune relation de public ne lui appartient ».

Contrôle positif côté prod après une révocation : `https://athlexapp.eu/classement` et `/box` répondent
200, et l'audit vérifie que `boxes`/`profiles` se lisent encore sans session.
