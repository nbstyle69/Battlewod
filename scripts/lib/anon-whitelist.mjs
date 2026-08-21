/**
 * Liste blanche des fonctions du schéma `public` que `anon` peut exécuter.
 *
 * Partagée par les deux contrôles — `test-grants.mjs` (pile jetable, en CI) et
 * `audit-grants-prod.mjs` (production, en nocturne) — pour une raison précise :
 * deux copies de cette liste divergeraient, et la copie la plus permissive
 * deviendrait la vraie. Une seule liste, deux lecteurs.
 *
 * Les prédicats de policy y figurent parce qu'une expression de policy est
 * évaluée avec les privilèges de l'appelant : sans EXECUTE, la requête
 * **échoue** au lieu de rendre faux, et les pages publiques tombent. Chacun
 * porte sa propre garde interne et rend faux sans session.
 */
export const ANON_WHITELIST = new Map([
  ['get_user_box_ids', 'prédicat de policy — 24 policies'],
  ['is_box_admin', 'prédicat de policy — 20 policies'],
  ['is_super_admin', 'prédicat de policy — 10 policies'],
  ['is_box_owner', 'prédicat de policy — 8 policies'],
  ['is_box_coach', 'prédicat de policy — 7 policies'],
  ['manages_box_funnel', 'prédicat de policy — 7 policies'],
  ['manages_box', 'prédicat de policy — 6 policies'],
  ['is_box_owner_member', 'prédicat de policy — 6 policies'],
  ['is_box_admin_of_athlete', 'prédicat de policy — 4 policies'],
  ['tournament_wod_accepts_scores', 'prédicat de policy — booléen sur un WOD, aucune donnée d\'athlète'],
  ['is_box_member', 'prédicat de policy — 1 policy'],
  ['get_box_mate_ids', 'prédicat de policy — 1 policy'],
  ['can_join_tournament', 'prédicat de policy — 1 policy'],
  ['can_join_daily_tournament', 'prédicat de policy — 1 policy'],
  ['can_join_inter_competition', 'prédicat de policy — 1 policy'],
  ['box_subscribes_programming', 'prédicat de policy — 1 policy'],
  ['peek_box_invitation', 'page publique /rejoindre/[token] : lue sans session par construction'],
]);

/**
 * Sondes anonymes : des RPC sensibles dont le refus doit venir du *grant*.
 *
 * Le piège du lot 4 : deux gardes rendent le même 42501, donc une assertion
 * posée sur le code passe dans les deux états. Le message distingue.
 */
export const SONDES_ANONYMES = [
  ['list_athlete_strength_sets', { p_user_id: '00000000-0000-0000-0000-000000000000' }],
  ['get_tournament_participants', { p_tournament_id: '00000000-0000-0000-0000-000000000000' }],
  ['get_tournament_validated_scores', { p_tournament_id: '00000000-0000-0000-0000-000000000000' }],
  ['get_box_dunning', { p_box_id: '00000000-0000-0000-0000-000000000000' }],
  ['extend_all_class_schedules', {}],
  ['generate_class_schedules_from_templates', { p_box_id: '00000000-0000-0000-0000-000000000000' }],
];
