-- Lot 1A — correctif #3 : restaure user_movement_stats.updated_at (drift de prod).
--
-- La migration source 20260321_movement_tracking.sql définit :
--   updated_at timestamptz NOT NULL DEFAULT now()
-- et increment_movement_stats(...) fait INSERT (..., updated_at) VALUES (..., now())
-- + ON CONFLICT ... SET updated_at = now(). Or la colonne a disparu de la table en prod
-- (drift non tracé par une migration du repo) → chaque appel de la RPC plante en 42703
-- (« column "updated_at" does not exist »), avalé par le try/catch de gamification.ts.
-- Résultat : les stats de mouvement ne s'écrivent jamais.
--
-- On restaure la colonne prévue par le schéma d'origine. increment_movement_stats
-- (redéfini au 20260810 avec la garde v_target) redevient alors fonctionnel sans autre
-- changement. Idempotent.

ALTER TABLE public.user_movement_stats
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

NOTIFY pgrst, 'reload schema';
