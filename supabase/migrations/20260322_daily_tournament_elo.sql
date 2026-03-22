-- ═══════════════════════════════════════════════════════════════════════════
-- Daily Tournament ELO History (#66)
-- Tracks ELO changes from daily mini-tournaments
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.daily_tournament_elo_history (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id       uuid        NOT NULL REFERENCES public.daily_tournaments(id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  elo_before          int         NOT NULL DEFAULT 1000,
  elo_after           int         NOT NULL DEFAULT 1000,
  elo_delta           int         NOT NULL DEFAULT 0,
  final_rank          int         NOT NULL DEFAULT 1,
  calculated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

ALTER TABLE public.daily_tournament_elo_history ENABLE ROW LEVEL SECURITY;

-- Users can see their own ELO history
DROP POLICY IF EXISTS "daily_elo_history_select" ON public.daily_tournament_elo_history;
CREATE POLICY "daily_elo_history_select" ON public.daily_tournament_elo_history
  FOR SELECT USING (auth.uid() = user_id);

-- Anyone authenticated can insert (triggered after tournament completion)
DROP POLICY IF EXISTS "daily_elo_history_insert" ON public.daily_tournament_elo_history;
CREATE POLICY "daily_elo_history_insert" ON public.daily_tournament_elo_history
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_daily_tourn_elo_user ON public.daily_tournament_elo_history(user_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_tourn_elo_tourn ON public.daily_tournament_elo_history(tournament_id);
