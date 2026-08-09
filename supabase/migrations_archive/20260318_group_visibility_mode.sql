-- Ajoute le mode de diffusion des WODs par groupe
-- 'daily'  = les athlètes ne voient que les WODs dont scheduled_date <= aujourd'hui
-- 'weekly' = les athlètes voient tous les WODs publiés de la semaine (défaut)
ALTER TABLE message_groups
  ADD COLUMN IF NOT EXISTS wod_visibility_mode text NOT NULL DEFAULT 'weekly'
    CHECK (wod_visibility_mode IN ('daily', 'weekly'));
