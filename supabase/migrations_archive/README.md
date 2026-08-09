# Archive des migrations d'avant baseline

Ces fichiers **ne sont plus rejoués**. Ils sont conservés pour l'historique
(qui a changé quoi, quand, et pourquoi) et ne doivent pas être modifiés.

## Pourquoi

Le rejeu de cet historique sur une base vierge produisait un **schéma faux** :

- `20260331_programs.sql` crée la version « affiliation » de `programs`, sans
  `IF NOT EXISTS` ;
- `20260414_programs_marketplace.sql` — la version réellement en production —
  est ensuite **sautée par son propre `IF NOT EXISTS`**, puisque la table
  existe déjà.

Une base reconstruite depuis zéro n'était donc pas la production. Le repo
mentait sur le schéma. Plutôt que de rafistoler la chaîne, on a figé un
**baseline** : `supabase/migrations/20260301000000_baseline_prod_schema.sql`,
généré par `supabase db dump` sur la production.

## Contenu

- 140 migrations horodatées, de `20260306_tournament_system.sql` à
  `20260915_lot4abis_elo_coherence.sql` ;
- 4 fichiers qui n'ont jamais fait partie du pipeline (préfixés `_legacy_`) :
  `_legacy_schema.sql`, `_legacy_migration_b2b.sql`,
  `_legacy_migration_blocks_elo.sql`, `_legacy_migration_social.sql`.
  Ils vivaient à la racine de `supabase/` et n'étaient joués à la main par
  personne ; leur contenu est déjà couvert par le baseline.

## Et maintenant

Toute nouvelle migration va dans `supabase/migrations/`, horodatée après le
baseline, et doit être rejouable sur base vierge — la CI
(`.github/workflows/db-replay.yml`) le vérifie à chaque PR.
