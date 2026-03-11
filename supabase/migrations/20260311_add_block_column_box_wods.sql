-- Ajouter la colonne 'block' à box_wods (Skill GYM, Skill Haltéro, WOD, Pré-WOD, Post-WOD)
ALTER TABLE box_wods
ADD COLUMN IF NOT EXISTS block TEXT DEFAULT NULL;

-- Rendre wod_type nullable (optionnel)
ALTER TABLE box_wods
ALTER COLUMN wod_type DROP NOT NULL;
