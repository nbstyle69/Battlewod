-- Table des modèles de planning hebdomadaire
CREATE TABLE IF NOT EXISTS schedule_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid REFERENCES boxes(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  coach         text,
  day_of_week   int NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Lundi ... 7=Dimanche
  start_time    text NOT NULL,  -- 'HH:MM'
  end_time      text NOT NULL,  -- 'HH:MM'
  max_capacity  int NOT NULL DEFAULT 15,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE schedule_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "box_owner_manage_templates" ON schedule_templates
  FOR ALL USING (
    box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

CREATE POLICY "member_read_templates" ON schedule_templates
  FOR SELECT USING (
    box_id IN (
      SELECT box_id FROM box_members WHERE member_id = auth.uid() AND status = 'active'
    )
  );

NOTIFY pgrst, 'reload schema';
