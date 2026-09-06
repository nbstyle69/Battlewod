-- Contrôles A (après lot 1) : identité de la box, comptes, profils, adhésions, isolation, NBS2 intacte.
-- @@ A1 box
select b.name = 'AthleX Fitness' and b.city = 'Lyon' and b.is_active and b.invite_code ~ '^[A-Z0-9]{6}$' as ok,
       'A1 box AthleX Fitness (Lyon, active, code 6 alphanum)' as controle,
       format('name=%s city=%s code=%s owner=%s', b.name, b.city, b.invite_code, p.email) as detail
  from public.boxes b join public.profiles p on p.id = b.owner_id where b.id = '{{BOX_ID}}';
-- @@ A2 comptes
select count(*) = 151 and count(*) filter (where u.email_confirmed_at is not null) = 151 as ok,
       'A2 151 comptes Auth, e-mail confirmé' as controle,
       format('auth=%s confirmés=%s', count(*), count(*) filter (where u.email_confirmed_at is not null)) as detail
  from demo_stg.member_map mm join auth.users u on u.id = mm.user_id;
-- @@ A2b gmail : mot de passe inconnu
-- GoTrue pose toujours un hash (aléatoire si l'appel admin n'envoie pas de mot de passe) : le seed n'en transmet
-- ni n'en conserve aucun pour ces deux comptes ; ils ne sont utilisables qu'après « mot de passe oublié ».
select count(*) = 2 and bool_and(u.email_confirmed_at is not null and u.last_sign_in_at is null) as ok,
       'A2b comptes gmail confirmés, jamais connectés, mot de passe non transmis par le seed' as controle,
       string_agg(u.email || ':' || case when u.last_sign_in_at is null then 'jamais connecté' else 'CONNECTÉ' end, ', ') as detail
  from auth.users u where u.email in ('nbstylz+athlexfitness@gmail.com', 'nbstylz+appledemo@gmail.com');
-- @@ A3 profils
select count(*) = 151 and count(*) filter (where p.username is null or p.username ~ '^user_') = 0 as ok,
       'A3 151 profils, pseudos humains' as controle,
       format('profils=%s sans_pseudo=%s demo=%s', count(*), count(*) filter (where p.username is null),
              (select username from public.profiles where email = 'nbstylz+appledemo@gmail.com')) as detail
  from public.profiles p join demo_stg.member_map mm on mm.user_id = p.id;
-- @@ A4 demo
select p.username = '[Apple_User]' and p.level = 'rx' and p.elo = (select e.elo_depart::int from demo_stg.elo_start e join demo_stg.members m on m.member_ref = e.member_ref where m.email = p.email) as ok,
       'A4 compte démo : pseudo [Apple_User], ELO = elo_start.csv' as controle,
       format('username=%s level=%s elo=%s role=%s', p.username, p.level, p.elo, p.role) as detail
  from public.profiles p where p.email = 'nbstylz+appledemo@gmail.com';
-- @@ A5 adhésions
select count(*) = 151 and count(*) filter (where role = 'owner') = 1 and count(*) filter (where role = 'coach') = 3
       and count(*) filter (where role = 'member' and plan_id is null) = 0 as ok,
       'A5 151 adhésions (1 owner, 3 coachs, membres avec formule)' as controle,
       format('total=%s owner=%s coach=%s member=%s sans_plan=%s', count(*), count(*) filter (where role='owner'),
              count(*) filter (where role='coach'), count(*) filter (where role='member'),
              count(*) filter (where role = 'member' and plan_id is null)) as detail
  from public.box_members where box_id = '{{BOX_ID}}' and status = 'active';
-- @@ A6 formules
select count(*) = 4 and bool_and(stripe_price_id is null) as ok,
       'A6 4 formules membership_plans sans Stripe' as controle,
       string_agg(name || '(' || coalesce(max_sessions_per_week::text, '∞') || ')', ', ' order by sort_order) as detail
  from public.membership_plans where box_id = '{{BOX_ID}}';
-- @@ A7 abonnement back-office
select count(*) = 1 and bool_and(status = 'active' and current_period_end > now() and stripe_subscription_id is null) as ok,
       'A7 box_subscriptions active, sans Stripe' as controle,
       string_agg(format('%s/%s fin=%s', plan_tier, status, current_period_end::date), ', ') as detail
  from public.box_subscriptions where box_id = '{{BOX_ID}}';
-- @@ A8 démo membre d'une seule box
select count(*) = 1 and bool_and(box_id = '{{BOX_ID}}') as ok,
       'A8 démo membre uniquement d''AthleX Fitness' as controle,
       string_agg(box_id::text, ', ') as detail
  from public.box_members bm where bm.member_id = (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com');
-- @@ A9 NBS2 intacte
select demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}') = (select value::jsonb from demo_stg.params where key = 'nbs2_snapshot') as ok,
       'A9 NBS2 : relevé identique au lot 0' as controle,
       demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}')::text as detail;
-- @@ A10 staging non exposé
select count(*) = 0 as ok, 'A10 aucun grant anon/authenticated sur demo_stg et _demo_seed_log' as controle,
       coalesce(string_agg(table_schema || '.' || table_name || ':' || grantee, ', '), 'aucun') as detail
  from information_schema.role_table_grants
 where grantee in ('anon', 'authenticated') and (table_schema = 'demo_stg' or table_name = '_demo_seed_log');
-- @@ A11 aucun profil hors seed touché
select (select count(*) from public.profiles) = 151 + (select value::int from demo_stg.params where key = 'profiles_before') as ok,
       'A11 profils = avant + 151' as controle,
       format('profils=%s avant=%s', (select count(*) from public.profiles), (select value from demo_stg.params where key = 'profiles_before')) as detail;
