# Base de données — baseline et migrations

## Source de vérité

`supabase/migrations/` reconstruit **exactement** le schéma de production :

1. `20260301000000_baseline_prod_schema.sql` — snapshot du schéma réel de la
   prod (`supabase db dump`) : tables, vues, fonctions, triggers, index,
   contraintes, RLS, grants, buckets et policies storage ;
2. les migrations suivantes, dans l'ordre lexicographique.

L'historique d'avant baseline est dans `supabase/migrations_archive/` — conservé,
plus jamais rejoué. Voir son README pour la raison (le rejeu produisait la
mauvaise version de `programs`).

## Vérifier qu'une migration est rejouable

```bash
./scripts/db-replay.sh
```

Le script démarre un Postgres vierge (image `supabase/postgres`, même version
majeure que la prod), rejoue baseline + migrations, et échoue à la première
erreur. C'est ce que la CI exécute sur chaque PR
(`.github/workflows/db-replay.yml`) : **une migration non rejouable ne peut
plus être mergée**.

## Vérifier la fidélité du baseline vis-à-vis de la prod

```bash
KEEP=1 ./scripts/db-replay.sh
SUPABASE_DB_URL='<url prod, lecture seule>' ./scripts/db-fidelity.sh
```

Compare 8 inventaires (colonnes, fonctions, policies, triggers, index, grants
de table, de colonne, de routine) entre la prod et la base rejouée. Attendu :
`ecarts=0` partout.

## Deux pièges que le baseline traite explicitement

- **`pg_dump` n'émet aucun `REVOKE`.** Les default privileges de la stack
  Supabase donnent `ALL` à `anon`/`authenticated` sur toute table créée dans
  `public`, et `EXECUTE` sur toute fonction. Rejouer le dump nu rendait donc à
  `anon` des droits que les lots de sécurité lui avaient retirés (jusqu'à
  `EXECUTE` sur `delete_user_account` ou `join_box_by_invite`). Le baseline se
  termine par une section « grants exacts » : `REVOKE ALL` sur chaque table et
  chaque routine, puis les privilèges tels qu'ils sont réellement en prod.
- **Hors périmètre du schéma** : schémas `auth`/`realtime` (plateforme), jobs
  `pg_cron`, secrets des edge functions, et les données. Le harnais de rejeu
  recrée le minimum de `storage` que la plateforme fournit normalement.
