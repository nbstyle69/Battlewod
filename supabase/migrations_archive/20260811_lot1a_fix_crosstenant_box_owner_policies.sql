-- Lot 1A — correctif étanchéité inter-box (suite du 20260810).
--
-- Le 20260810 a retiré la branche globale `box_owner` de is_box_admin(). MAIS trois
-- policies gardent une branche PERMISSIVE indépendante `profiles.role IN
-- ('admin','super_admin','box_owner')` qui court-circuite le scoping (sémantique OU) :
--   • tournaments.tournaments_box_admin_manage
--   • tournament_wods.tournament_wods_admin_all
--   • tournament_participants.tournament_participants_admin_manage
-- Comme la majorité des vrais owners ont profiles.role='box_owner', n'importe quel
-- owner pouvait gérer les tournois/WOD/participants de N'IMPORTE QUELLE box.
--
-- Audit de liaison réalisé avant ce correctif (aucun backfill requis) :
--   • 11/11 boxes ont un owner_id ; les 9 vrais owners sont couverts par is_box_admin
--     via boxes.owner_id.
--   • Les profils role='box_owner' sans box liée sont des comptes de test vides
--     (0 box possédée, 0 box_members, 0 tournoi créé) → rien à rattacher.
-- On remplace donc la branche par is_box_admin(box_id), qui couvre déjà :
-- owner (owner_id) OU box_members(owner/coach actif) OU profiles(admin/super_admin).

-- 1) tournaments
DROP POLICY IF EXISTS tournaments_box_admin_manage ON public.tournaments;
CREATE POLICY tournaments_box_admin_manage ON public.tournaments
  FOR ALL TO public
  USING (public.is_box_admin(box_id))
  WITH CHECK (public.is_box_admin(box_id));

-- 2) tournament_wods (box via le tournoi parent)
DROP POLICY IF EXISTS tournament_wods_admin_all ON public.tournament_wods;
CREATE POLICY tournament_wods_admin_all ON public.tournament_wods
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tournament_wods.tournament_id AND public.is_box_admin(t.box_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tournament_wods.tournament_id AND public.is_box_admin(t.box_id)
  ));

-- 3) tournament_participants (box via le tournoi parent)
DROP POLICY IF EXISTS tournament_participants_admin_manage ON public.tournament_participants;
CREATE POLICY tournament_participants_admin_manage ON public.tournament_participants
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tournament_participants.tournament_id AND public.is_box_admin(t.box_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tournament_participants.tournament_id AND public.is_box_admin(t.box_id)
  ));

NOTIFY pgrst, 'reload schema';
