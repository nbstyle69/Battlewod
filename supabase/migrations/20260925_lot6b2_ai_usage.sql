-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 6B-2 — Compteur d'usage IA (rate limit) pour les 2 edge functions payantes
--
-- CONTEXTE : analyze-tournament-score et parse-wod-pdf appellent l'API Anthropic
-- (payante) sans AUCUN plafond → un compte owner/coach compromis, ou une boucle,
-- fait tourner le compteur sans borne, à ta charge. On ajoute un quota par
-- utilisateur et par jour, vérifié côté serveur avant chaque appel Anthropic.
--
-- Plafonds décidés : 20 analyses de score / jour, 10 imports de PDF / jour
-- (passés en paramètre par l'edge, ajustables sans migration).
--
-- L'edge tourne en service_role (auth.uid() = NULL) → on passe l'user_id
-- explicitement ; EXECUTE réservé à service_role.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day     date NOT NULL DEFAULT CURRENT_DATE,
  kind    text NOT NULL,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
-- Aucune policy : table interne, accédée uniquement via la RPC definer.
REVOKE ALL ON public.ai_usage FROM PUBLIC, anon, authenticated;

-- Incrémente puis renvoie true si l'appel est SOUS le plafond. Atomique
-- (upsert-returning) → sûr face aux appels concurrents. Compter aussi les
-- tentatives refusées est voulu : un abuseur voit son quota rester saturé
-- sans qu'aucun appel Anthropic ne parte.
CREATE OR REPLACE FUNCTION public.bump_ai_usage(p_user uuid, p_kind text, p_limit int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE v_count int;
BEGIN
  IF p_user IS NULL OR p_kind IS NULL OR p_limit IS NULL THEN
    RAISE EXCEPTION 'bump_ai_usage: arguments requis';
  END IF;
  INSERT INTO public.ai_usage (user_id, day, kind, count)
  VALUES (p_user, CURRENT_DATE, p_kind, 1)
  ON CONFLICT (user_id, day, kind)
  DO UPDATE SET count = public.ai_usage.count + 1
  RETURNING count INTO v_count;
  RETURN v_count <= p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.bump_ai_usage(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_ai_usage(uuid, text, int) TO service_role;

NOTIFY pgrst, 'reload schema';
