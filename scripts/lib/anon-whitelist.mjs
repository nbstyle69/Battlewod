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
 * Liste blanche des *tables* du schéma `public` où `anon` peut écrire.
 *
 * Vide, et c'est le résultat attendu : aucun chemin produit ne demande à la clé
 * publique d'écrire dans une table. Les achats publics passent par des routes
 * `service_role`, l'inscription par un trigger serveur, la page /rejoindre par
 * une RPC `SECURITY DEFINER`. Une liste blanche vide est le meilleur état ; elle
 * existe pour que l'exception future ait un endroit unique où s'inscrire, avec
 * sa raison, au lieu d'un grant posé un soir et jamais relu.
 *
 * Le miroir SQL de cette liste est dans `20261118_lot5e_grants_ecriture_tables.sql`.
 * Les deux ne peuvent pas diverger en silence : le contrôle interroge le
 * catalogue, donc c'est l'état de la base qui décide — pas l'intention du SQL.
 */
export const ANON_TABLE_WRITE_WHITELIST = new Map([]);

/** Ce que `anon` ne doit détenir sur aucune table de `public`. */
export const PRIVILEGES_INTERDITS_ANON = [
  'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER',
];

/**
 * Ce que `authenticated` ne doit pas détenir non plus.
 *
 * INSERT/UPDATE/DELETE **restent** : c'est la RLS qui décide qui écrit quoi, et
 * elle a besoin du grant pour être évaluée. Ne partent que les privilèges
 * qu'aucun chemin PostgREST n'emprunte — TRUNCATE efface une table entière sans
 * passer par la RLS, TRIGGER et REFERENCES sont du DDL.
 */
export const PRIVILEGES_INTERDITS_AUTHENTICATED = ['TRUNCATE', 'REFERENCES', 'TRIGGER'];

/**
 * Sondes d'écriture à la clé publique — **pile jetable uniquement**.
 *
 * Le premier jet les faisait tourner aussi sur la production, et la mesure a
 * montré que c'était deux fautes en une. La première : le critère n'était pas
 * discriminant. « permission denied for table » nomme bien le grant, mais un
 * `POST` peut rendre 201 sans rien écrire (un trigger `BEFORE` qui renvoie
 * NULL avale la ligne) et un `DELETE` sur un filtre inexistant rend 204 —
 * mesurés tous les deux en production, où ils passaient pour des constats. La
 * seconde : une sonde d'écriture *tente* une écriture. Si le grant était là et
 * la RLS permissive, l'audit nocturne de la production créerait la ligne qu'il
 * prétend interdire.
 *
 * Donc : la production est jugée sur le catalogue (T1..T9, `relacl` et
 * `attacl` — ce que la base *est*), et le geste réel est joué ici, sur une pile
 * jetable, où l'assertion peut être complète : refus nommé **et** comptage
 * avant/après inchangé. Un refus qui n'est pas suivi d'un comptage ne distingue
 * pas un refus d'un succès silencieux.
 *
 * `message_group_members` est une **vue** : elle est dans la liste parce que
 * c'est par elle que le geste anonyme passait réellement (HTTP 201, membre
 * ajouté à un groupe dont anon n'administre rien). Une sonde qui n'énumère que
 * des tables ne l'aurait jamais vu.
 */
export const SONDES_ECRITURE_ANONYME = [
  ['wod_scores', 'POST', '{}'],
  ['box_articles', 'POST', '{}'],
  ['class_reservations', 'POST', '{}'],
  ['tournament_scores', 'POST', '{}'],
  ['box_documents', 'DELETE', null],
  ['message_group_members', 'POST', '{}'],
  ['message_group_members', 'DELETE', null],
];

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
];

/**
 * Les mêmes sondes, pour des RPC qui **écrivent**. Elles ne sont pas appelées :
 * elles sont jugées sur `has_function_privilege`.
 *
 * La raison est la même que pour les écritures de tables, et elle vise cet
 * audit lui-même : appeler la fonction n'apporte une information *nouvelle* que
 * dans le cas où le grant a régressé — c'est-à-dire précisément le cas où
 * l'appel réussit. Une sonde qui génère les créneaux de toutes les box en
 * production le jour où la garde tombe fait de l'audit l'auteur du dégât qu'il
 * était censé constater.
 *
 * Le catalogue, lui, répond sans rien exécuter : le corps de la fonction n'est
 * jamais atteint, quel que soit l'état du grant.
 */
export const SONDES_ANONYMES_MUTANTES = [
  'extend_all_class_schedules',
  'generate_class_schedules_from_templates',
];
