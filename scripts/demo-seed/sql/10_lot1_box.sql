-- LOT 1 (partie SQL) : box, abonnement back-office, formules, profils, adhésions, ELO de départ.
-- Prérequis : demo_stg.member_map rempli (comptes créés par l'API Admin, profils créés par
-- le trigger handle_new_user à partir des métadonnées username/level).

do $$
declare
  v_owner uuid := (select user_id from demo_stg.member_map where member_ref = 'owner');
  v_box   uuid := '{{BOX_ID}}';
begin
  if v_owner is null then raise exception 'owner absent de member_map'; end if;
  if exists (select 1 from public.boxes where id = v_box) then raise exception 'box démo déjà présente'; end if;

  -- ── Box ────────────────────────────────────────────────────────────────
  insert into public.boxes (id, owner_id, name, description, tagline, invite_code, is_active, is_listed,
                            address, city, postal_code, country, latitude, longitude, slug,
                            allowed_tournament_formats, daily_publish_hour, weekly_publish_day, weekly_publish_hour,
                            contact_email, sport_type, services)
  values (v_box, v_owner, 'AthleX Fitness',
          'Box CrossFit de 400 m² à Lyon 7e : programmation quotidienne, coaching en petits groupes, open gym et compétitions internes chaque mois.',
          'Train hard. Compete fair.', '{{INVITE_CODE}}', true, true,
          '18 rue de Gerland', 'Lyon', '69007', 'France', 45.7326, 4.8352, 'athlex-fitness',
          array['simple','bracket','swiss'], 6, 0, 18,
          'nbstylz+athlexfitness@gmail.com', array['crossfit'], array['open gym','coaching','compétitions']);
  perform public._demo_log('boxes', v_box::text);

  -- ── Abonnement plateforme (le back-office verrouille le dashboard sans ligne active) ──
  insert into public.box_subscriptions (box_id, plan_tier, status, current_period_end, is_early_adopter)
  values (v_box, 'complete', 'active', now() + interval '1 year', false);
  perform public._demo_log('box_subscriptions', id::text) from public.box_subscriptions where box_id = v_box;

  -- ── Formules (sans Stripe) ──────────────────────────────────────────────
  insert into demo_stg.plan_map (formule, plan_id)
  select f.formule, gen_random_uuid()
    from (values ('1x/sem'), ('2x/sem'), ('3x/sem'), ('illimité')) f(formule)
  on conflict do nothing;

  insert into public.membership_plans (id, box_id, name, max_sessions_per_week, color, price_cents, currency,
                                       description, is_active, sort_order, plan_type, commitment_months)
  select pm.plan_id, v_box, p.name, p.max_week, p.color, p.price, 'eur', p.descr, true, p.ord, 'subscription', 0
    from (values
      ('1x/sem',   '1x / semaine', 1,    '#F59E0B', 5900, 'Une séance coachée par semaine.', 1),
      ('2x/sem',   '2x / semaine', 2,    '#3B82F6', 6900, 'Deux séances coachées par semaine.', 2),
      ('3x/sem',   '3x / semaine', 3,    '#16A34A', 8900, 'Trois séances coachées par semaine.', 3),
      ('illimité', 'Illimité',     null, '#EF4444', 9900, 'Accès illimité aux cours et à l''open gym.', 4)
    ) p(formule, name, max_week, color, price, descr, ord)
    join demo_stg.plan_map pm on pm.formule = p.formule;
  perform public._demo_log('membership_plans', id::text) from public.membership_plans where box_id = v_box;

  -- ── Profils (créés par handle_new_user ; on complète) ─────────────────
  update public.profiles p
     set role = 'box_owner',
         full_name = 'AthleX Fitness',
         bio = 'Gérant de la box AthleX Fitness',
         onboarding_completed_at = demo_stg.d('2026-07-20')::timestamptz,
         created_at = demo_stg.d('2026-07-20')::timestamptz
   where p.id = v_owner;

  update public.profiles p
     set elo = es.elo_depart::int,
         full_name = m.nom_complet,
         onboarding_completed_at = (demo_stg.d('2026-07-27') - (abs(hashtext(m.member_ref)) % 60))::timestamptz,
         created_at = (demo_stg.d('2026-07-27') - (abs(hashtext(m.member_ref)) % 60))::timestamptz
    from demo_stg.member_map mm
    join demo_stg.members m on m.member_ref = mm.member_ref
    join demo_stg.elo_start es on es.member_ref = m.member_ref
   where p.id = mm.user_id;

  perform public._demo_log('profiles', mm.user_id::text) from demo_stg.member_map mm;

  -- ── Adhésions ──────────────────────────────────────────────────────────
  insert into public.box_members (box_id, member_id, joined_at, status, plan_id, role, subscription_status)
  select v_box, v_owner, demo_stg.d('2026-07-20')::timestamptz, 'active', null, 'owner', null;

  insert into public.box_members (box_id, member_id, joined_at, status, plan_id, role, subscription_status, payment_method_type)
  select v_box, mm.user_id,
         (demo_stg.d('2026-07-27') - (abs(hashtext(m.member_ref)) % 60))::timestamptz,
         'active', pm.plan_id,
         case when m.role = 'coach' then 'coach' else 'member' end,
         'active', 'cash'
    from demo_stg.members m
    join demo_stg.member_map mm on mm.member_ref = m.member_ref
    join demo_stg.plan_map pm on pm.formule = m.formule;
  perform public._demo_log('box_members', id::text) from public.box_members where box_id = v_box;

  -- ── ELO de box (classement de box) : point de départ, recalculé par compute_box_elo au lot 2 ──
  insert into public.box_elo (member_id, box_id, elo, matches, wins, updated_at)
  select mm.user_id, v_box, es.elo_depart::int, 0, 0, demo_stg.d('2026-07-27')::timestamptz
    from demo_stg.member_map mm
    join demo_stg.elo_start es on es.member_ref = mm.member_ref;
  perform public._demo_log('box_elo', member_id::text) from public.box_elo where box_id = v_box;
end $$;

select
  (select count(*) from public.box_members where box_id = '{{BOX_ID}}') as box_members,
  (select member_count from public.boxes where id = '{{BOX_ID}}') as member_count,
  (select count(*) from public.membership_plans where box_id = '{{BOX_ID}}') as plans,
  (select username from public.profiles where email = 'nbstylz+appledemo@gmail.com') as demo_username;
