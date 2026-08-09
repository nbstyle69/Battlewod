-- ═══════════════════════════════════════════════════════════════════════════
-- Résiliation → perte d'accès à la box
-- ---------------------------------------------------------------------------
-- Avant : résilier un abonnement (cancel_at_period_end) puis sa fin réelle
-- (webhook customer.subscription.deleted) laissait box_members.status='active'.
-- L'adhérent continuait donc de voir les créneaux et de réserver (accès gardé
-- par status='active' via get_user_box_ids()/is_box_member), et de lire les WOD
-- de box (policy box_wods_read trop permissive : tout utilisateur connecté).
--
-- Ici :
--  1. On autorise un statut 'inactive' sur box_members (le webhook y bascule
--     l'adhérent à la fin réelle de l'abonnement — voir TheHub webhook).
--  2. On resserre la lecture des WOD de box au membre ACTIF (+ owner/coach +
--     WOD perso), en supprimant la policy publique box_wods_read.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Statut 'inactive' autorisé (ancien membre dont l'abonnement est terminé).
ALTER TABLE public.box_members DROP CONSTRAINT IF EXISTS box_members_status_check;
ALTER TABLE public.box_members
  ADD CONSTRAINT box_members_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'banned'::text, 'inactive'::text]));

-- 2. Les WOD de box ne sont plus lisibles par « tout utilisateur connecté ».
-- La lecture reste couverte par :
--   - member_see_published  → membre ACTIF de la box (get_user_box_ids), publié
--   - owner_manage_wods / coach_manage_wods → owner/coach de la box (ALL)
--   - user_see_own_personal_wods → WOD perso (box_id IS NULL)
-- Un membre 'inactive'/'banned' ou non-membre n'a donc plus accès aux WOD.
DROP POLICY IF EXISTS "box_wods_read" ON public.box_wods;

NOTIFY pgrst, 'reload schema';
