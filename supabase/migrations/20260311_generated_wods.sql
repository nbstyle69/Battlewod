-- ═══════════════════════════════════════════════════════════════════════
-- generated_wods: WODs sauvegardés depuis le générateur personnel
-- generated_wod_scores: scores entrés par l'utilisateur après un WOD
-- ═══════════════════════════════════════════════════════════════════════

-- ── Table : generated_wods ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_wods (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport         text NOT NULL DEFAULT 'functional',          -- 'functional' | 'hybrid'
  wod_name      text NOT NULL,
  wod_type      text NOT NULL,                                -- 'For Time','AMRAP','EMOM','Tabata','Max Reps'
  duration      int  NOT NULL DEFAULT 0,                      -- en minutes (0 = benchmark)
  level         text NOT NULL DEFAULT 'rx',
  format        text NOT NULL DEFAULT 'Solo',                 -- 'Solo','Équipe 2','Équipe 3',...
  movements     text NOT NULL,                                -- contenu textuel du WOD
  scoring       text,
  coach_tip     text,
  team_note     text,
  equipment     text[] DEFAULT '{}',                          -- ['bb','kb','bw',...]
  is_favorite   boolean DEFAULT false,
  is_benchmark  boolean DEFAULT false,                        -- true si c'est un benchmark (Fran, Murph...)
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_gen_wods_user     ON generated_wods(user_id);
CREATE INDEX idx_gen_wods_created  ON generated_wods(created_at DESC);
CREATE INDEX idx_gen_wods_fav      ON generated_wods(user_id, is_favorite) WHERE is_favorite = true;

-- ── Table : generated_wod_scores ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_wod_scores (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  wod_id        uuid NOT NULL REFERENCES generated_wods(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score_type    text NOT NULL DEFAULT 'time',                 -- 'time','reps','rounds','weight'
  score_value   numeric NOT NULL,                             -- secondes pour time, nombre pour reps/rounds/weight
  rx            boolean DEFAULT true,
  notes         text,
  completed_at  timestamptz DEFAULT now(),

  UNIQUE(wod_id, user_id, completed_at)
);

CREATE INDEX idx_gen_scores_user ON generated_wod_scores(user_id);
CREATE INDEX idx_gen_scores_wod  ON generated_wod_scores(wod_id);
CREATE INDEX idx_gen_scores_date ON generated_wod_scores(completed_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE generated_wods ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_wod_scores ENABLE ROW LEVEL SECURITY;

-- generated_wods: chaque user voit/modifie seulement ses propres WODs
CREATE POLICY "Users can view own generated wods"
  ON generated_wods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generated wods"
  ON generated_wods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own generated wods"
  ON generated_wods FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own generated wods"
  ON generated_wods FOR DELETE
  USING (auth.uid() = user_id);

-- generated_wod_scores: chaque user voit/modifie seulement ses propres scores
CREATE POLICY "Users can view own scores"
  ON generated_wod_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scores"
  ON generated_wod_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scores"
  ON generated_wod_scores FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scores"
  ON generated_wod_scores FOR DELETE
  USING (auth.uid() = user_id);
