-- ═══════════════════════════════════════════════════════════════════════
-- Per-box ELO ranking (#64)
--
-- The global `profiles.elo` is fed by everything (box WODs + tournaments +
-- inter-box) and drives the athlete Level/badges. This adds a SEPARATE,
-- box-scoped ELO so each box has its own leaderboard reflecting box-WOD
-- performance only — distinct from the tournament/inter-box ranking.
--
-- `compute_box_elo(wod_id)` mirrors `compute_wod_elo` but rates/ranks using
-- the box-scoped ELO (`box_elo`, seeded 1000) instead of the global one, is
-- idempotent per WOD (`box_elo_history`), and never touches `profiles.elo`.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Per-(member, box) ELO ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.box_elo (
  member_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  box_id     uuid        NOT NULL REFERENCES public.boxes(id)    ON DELETE CASCADE,
  elo        integer     NOT NULL DEFAULT 1000,
  matches    integer     NOT NULL DEFAULT 0,
  wins       integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, box_id)
);

CREATE INDEX IF NOT EXISTS idx_box_elo_box ON public.box_elo(box_id, elo DESC);

ALTER TABLE public.box_elo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "box_elo_read" ON public.box_elo;
CREATE POLICY "box_elo_read" ON public.box_elo
  FOR SELECT USING (
    box_id IN (SELECT box_id FROM box_members WHERE member_id = auth.uid() AND status = 'active')
    OR box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );
-- Writes happen only through the SECURITY DEFINER function below.

-- ── 2. Per-box ELO history (one row per member per WOD) ─────────────────
CREATE TABLE IF NOT EXISTS public.box_elo_history (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid        NOT NULL REFERENCES public.boxes(id)    ON DELETE CASCADE,
  wod_id     uuid        NOT NULL REFERENCES public.box_wods(id) ON DELETE CASCADE,
  member_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  elo_before integer     NOT NULL DEFAULT 1000,
  elo_after  integer     NOT NULL DEFAULT 1000,
  elo_delta  integer     NOT NULL DEFAULT 0,
  rank       integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wod_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_box_elo_history_member ON public.box_elo_history(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_box_elo_history_box    ON public.box_elo_history(box_id, created_at DESC);

ALTER TABLE public.box_elo_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "box_elo_history_read" ON public.box_elo_history;
CREATE POLICY "box_elo_history_read" ON public.box_elo_history
  FOR SELECT USING (
    member_id = auth.uid()
    OR box_id IN (SELECT box_id FROM box_members WHERE member_id = auth.uid() AND status = 'active')
    OR box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ── 3. Box-scoped ELO computation on WOD close ─────────────────────────
CREATE OR REPLACE FUNCTION public.compute_box_elo(p_wod_id uuid)
RETURNS TABLE (
  member_id  uuid,
  elo_before int,
  elo_after  int,
  elo_delta  int,
  rank       int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_box_id     uuid;
  v_is_time    boolean;
  v_lb_enabled boolean;
  v_n          int;
  k_pairwise   constant numeric := 64;
  scaled_mult  constant numeric := 0.4;
BEGIN
  SELECT bw.box_id,
         (bw.wod_type = 'for-time'),
         COALESCE(bw.leaderboard_enabled, true)
    INTO v_box_id, v_is_time, v_lb_enabled
    FROM box_wods bw
   WHERE bw.id = p_wod_id;

  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'WOD introuvable';
  END IF;

  -- Authorization: caller must be an active member (or the owner) of the box.
  IF NOT (
    is_box_owner(v_box_id) OR EXISTS (
      SELECT 1 FROM box_members bm
       WHERE bm.box_id = v_box_id
         AND bm.member_id = auth.uid()
         AND bm.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF NOT v_lb_enabled THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('boxelo:' || p_wod_id::text));

  -- Idempotency: already computed for this WOD.
  IF EXISTS (SELECT 1 FROM box_elo_history h WHERE h.wod_id = p_wod_id) THEN
    RETURN;
  END IF;

  -- Ranked field, rated by the BOX-scoped ELO (seeded 1000), RX before scaled.
  CREATE TEMP TABLE _bx_field ON COMMIT DROP AS
  WITH scores AS (
    SELECT ws.member_id,
           COALESCE(be.elo, 1000)::int AS elo,
           ws.score_value,
           COALESCE(ws.rx, false)      AS rx
      FROM wod_scores ws
      LEFT JOIN box_elo be ON be.member_id = ws.member_id AND be.box_id = v_box_id
     WHERE ws.wod_id = p_wod_id
  ),
  ordered AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN s.rx THEN 0 ELSE 1 END) ASC,
                      CASE WHEN v_is_time THEN s.score_value END ASC,
                      CASE WHEN NOT v_is_time THEN s.score_value END DESC
           ) AS seq
      FROM scores s
  ),
  ranked AS (
    SELECT o.*,
           MIN(o.seq) OVER (PARTITION BY o.rx, o.score_value) AS rnk
      FROM ordered o
  )
  SELECT member_id, elo, rx, rnk::int AS rank FROM ranked;

  SELECT COUNT(*) INTO v_n FROM _bx_field;
  IF v_n < 2 THEN
    RETURN;
  END IF;

  -- Pairwise ELO deltas against every other player (same formula as box WOD).
  CREATE TEMP TABLE _bx_deltas ON COMMIT DROP AS
  SELECT a.member_id,
         a.elo AS elo_before,
         a.rank,
         ROUND(
           ROUND( (k_pairwise / (v_n - 1)) * (
             (SELECT COALESCE(SUM(
                CASE WHEN a.rank < b.rank THEN 1
                     WHEN a.rank = b.rank THEN 0.5
                     ELSE 0 END), 0)
                FROM _bx_field b WHERE b.member_id <> a.member_id)
             - (SELECT COALESCE(SUM(
                  1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))), 0)
                FROM _bx_field b WHERE b.member_id <> a.member_id)
           ) )
           * (CASE WHEN a.rx THEN 1 ELSE scaled_mult END)
         )::int AS elo_delta
    FROM _bx_field a;

  INSERT INTO box_elo_history (box_id, wod_id, member_id, elo_before, elo_after, elo_delta, rank)
  SELECT v_box_id, p_wod_id, d.member_id, d.elo_before,
         GREATEST(100, d.elo_before + d.elo_delta), d.elo_delta, d.rank
    FROM _bx_deltas d
  ON CONFLICT (wod_id, member_id) DO NOTHING;

  INSERT INTO box_elo (member_id, box_id, elo, matches, wins, updated_at)
  SELECT d.member_id, v_box_id,
         GREATEST(100, d.elo_before + d.elo_delta),
         1,
         (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END),
         now()
    FROM _bx_deltas d
  -- EXCLUDED.elo is GREATEST(100, current_box_elo + delta): the box-scoped ELO
  -- was the rating basis, so it already reflects the accumulated value.
  ON CONFLICT (member_id, box_id) DO UPDATE
     SET elo        = EXCLUDED.elo,
         matches    = box_elo.matches + 1,
         wins       = box_elo.wins + EXCLUDED.wins,
         updated_at = now();

  RETURN QUERY
    SELECT d.member_id, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_delta) AS elo_after, d.elo_delta, d.rank
      FROM _bx_deltas d;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_box_elo(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.compute_box_elo(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
