/**
 * Lot 6 — l'espace coach, mesuré au vrai JWT sur pile jetable.
 *
 * Le lot ouvre un ÉCRAN (/templates) au coach ; il ne relâche pas les gardes
 * d'argent. Donc la suite doit prouver les deux à la fois, sinon « ouvert » ne
 * se distingue pas de « ouvert à tout » :
 *
 *   positif   le coach de la box tient sa planification — semaines types,
 *             grille de créneaux récurrents, génération des créneaux ;
 *   négatif   le coach d'une AUTRE box est refusé sur la même grille (sinon un
 *             « accordé » ne prouve aucune autorisation, juste l'absence de
 *             garde) ;
 *   négatif   le coach reste dehors de l'argent : publication et prix d'une
 *             offre, abonnement payant, encaissement, agrégats, journal
 *             comptoir, abonnement de la box.
 *
 * Et le titre : `get_my_admin_boxes()` doit dire 'coach' pour un compte dont
 * `profiles.role` vaut 'box_owner' mais qui n'est que coach dans CETTE box —
 * c'est cette valeur, et non le rôle du compte, qui ouvre les onglets gérant
 * côté mobile depuis ce lot.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SVC = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !ANON || !SVC) {
  console.error('⛔ TEST_SUPABASE_URL / _ANON_KEY / _SERVICE_ROLE_KEY requis (pile jetable).');
  process.exit(1);
}
const svc = createClient(SB_URL, SVC, { auth: { persistSession: false } });

const stamp = Date.now();
const results = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${label} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
}
function note(label, value) {
  console.log(`   · ${label} : ${value}`);
}
/** Un refus se prouve par son motif : « une erreur » accepte une faute de frappe. */
function refus(error, motif) {
  return !!error && new RegExp(motif, 'i').test(error.message ?? '');
}

async function makeUser(tag, role) {
  const email = `zz_l6_${tag}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  await svc.from('profiles').upsert({ id: data.user.id, email, username: `zz_l6_${tag}_${stamp}`, level: 'inter', role, elo: 1000 });
  const client = createClient(SB_URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  return { id: data.user.id, client };
}

function must(res, what) {
  if (res.error || !res.data) throw new Error(`décor « ${what} » : ${res.error?.message ?? 'aucune ligne'}`);
  return res.data;
}

function mondayOf(offsetWeeks) {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + offsetWeeks * 7);
  return d.toISOString().slice(0, 10);
}

const cleanup = [];
try {
  const owner = await makeUser('owner', 'box_owner');
  cleanup.push(() => svc.auth.admin.deleteUser(owner.id));
  // Le coach porte volontairement `profiles.role = 'box_owner'` ET possède sa
  // propre box : c'est le cas qui donnait les onglets gérant dans la box où il
  // n'est que coach.
  const coach = await makeUser('coach', 'box_owner');
  cleanup.push(() => svc.auth.admin.deleteUser(coach.id));
  const coowner = await makeUser('cogerant', 'member');
  cleanup.push(() => svc.auth.admin.deleteUser(coowner.id));
  const foreign = await makeUser('coach_tiers', 'member');
  cleanup.push(() => svc.auth.admin.deleteUser(foreign.id));
  const publisher = await makeUser('publisher', 'box_owner');
  cleanup.push(() => svc.auth.admin.deleteUser(publisher.id));
  const athlete = await makeUser('athlete', 'member');
  cleanup.push(() => svc.auth.admin.deleteUser(athlete.id));

  const box = must(await svc.from('boxes').insert({
    name: `zz_l6_box_${stamp}`, owner_id: owner.id, city: 'Test', invite_code: `ZL6${String(stamp).slice(-6)}`,
  }).select('id').single(), 'boxes');
  cleanup.unshift(() => svc.from('boxes').delete().eq('id', box.id));

  const otherBox = must(await svc.from('boxes').insert({
    name: `zz_l6_box2_${stamp}`, owner_id: foreign.id, city: 'Test', invite_code: `ZL7${String(stamp).slice(-6)}`,
  }).select('id').single(), 'boxes (tierce)');
  cleanup.unshift(() => svc.from('boxes').delete().eq('id', otherBox.id));

  const coachOwnBox = must(await svc.from('boxes').insert({
    name: `zz_l6_box3_${stamp}`, owner_id: coach.id, city: 'Test', invite_code: `ZL9${String(stamp).slice(-6)}`,
  }).select('id').single(), 'boxes (celle du coach)');
  cleanup.unshift(() => svc.from('boxes').delete().eq('id', coachOwnBox.id));

  const pubBox = must(await svc.from('boxes').insert({
    name: `zz_l6_pub_${stamp}`, owner_id: publisher.id, city: 'Test', invite_code: `ZL8${String(stamp).slice(-6)}`,
  }).select('id').single(), 'boxes (éditrice)');
  cleanup.unshift(() => svc.from('boxes').delete().eq('id', pubBox.id));

  must(await svc.from('box_members').insert({ box_id: box.id, member_id: coach.id, role: 'coach', status: 'active' })
    .select('id').single(), 'coach de la box');
  must(await svc.from('box_members').insert({ box_id: box.id, member_id: coowner.id, role: 'owner', status: 'active' })
    .select('id').single(), 'co-gérant de la box');
  must(await svc.from('box_members').insert({ box_id: otherBox.id, member_id: foreign.id, role: 'coach', status: 'active' })
    .select('id').single(), 'coach tiers');
  must(await svc.from('box_members').insert({ box_id: box.id, member_id: athlete.id, role: 'member', status: 'active' })
    .select('id').single(), 'adhérent');

  console.log(`\ndécor : box ${box.id} · coach ${coach.id} (propriétaire de ${coachOwnBox.id}) · box éditrice ${pubBox.id}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  console.log('── 1. Le titre est prononcé par le serveur, box par box');
  const mine = await coach.client.rpc('get_my_admin_boxes');
  const roles = Object.fromEntries((mine.data ?? []).map(b => [b.id, b.my_role]));
  check('la box où il est coach rend my_role=coach', roles[box.id], 'coach');
  check('sa propre box rend my_role=owner', roles[coachOwnBox.id], 'owner');
  note('profiles.role du même compte', 'box_owner — donc le titre ne vient pas du compte');

  // Le client mobile ne doit plus dériver le titre du rôle de compte : la
  // branche des onglets gérant se lit sur le disque, c'est un contrôle
  // structurel (une garde retirée par erreur reviendrait sinon en silence).
  const nav = readFileSync(new URL('../src/navigation/index.tsx', import.meta.url), 'utf8');
  const branche = nav.match(/const isBoxOwner\s*=.*/)?.[0] ?? '';
  check('mobile : isBoxOwner ne lit que boxRole (la box active)', /^const isBoxOwner\s*=\s*boxRole === 'owner';$/.test(branche.trim()), true);
  note('branche lue', branche.trim());
  const ctx = readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');
  check('mobile : AuthContext résout les titres par get_my_admin_boxes', ctx.includes("rpc('get_my_admin_boxes')"), true);
  check("mobile : plus de branche \"role === 'box_owner'\" dans la résolution de box", /role === 'box_owner'/.test(ctx), false);

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── 2. Planification de SA box : semaines types (inchangé par ce lot)');
  const monday = mondayOf(0);
  must(await svc.from('box_wods').insert({
    box_id: box.id, title: 'zz_l6_wod', scheduled_date: monday, wod_type: 'For Time', description: '10 burpees',
  }).select('id').single(), 'box_wods');

  const save = await coach.client.rpc('save_week_as_template', {
    p_box_id: box.id, p_source_monday: monday, p_title: `zz_l6_tpl_${stamp}`,
  });
  check('coach ENREGISTRE une semaine type', save.error == null, true);
  if (save.error) note('erreur', save.error.message);

  const list = await coach.client.rpc('list_week_templates', { p_box_id: box.id });
  check('coach LISTE ses semaines types (la bibliothèque de /templates)', (list.data ?? []).length >= 1, true);
  const tplId = (list.data ?? [])[0]?.template_id ?? null;

  const applied = await coach.client.rpc('apply_program_week', {
    p_source_kind: 'template', p_source_id: tplId, p_week: 1,
    p_target_monday: mondayOf(1), p_replace: false,
  });
  check('coach APPLIQUE une semaine type au calendrier', applied.error == null, true);
  if (applied.error) note('erreur', applied.error.message);

  const foreignSave = await foreign.client.rpc('save_week_as_template', {
    p_box_id: box.id, p_source_monday: monday, p_title: 'zz_l6_tpl_tiers',
  });
  check("coach d'une AUTRE box refusé sur save_week_as_template", refus(foreignSave.error, 'refus|denied|autoris|privilege'), true);
  if (foreignSave.error) note('refus', foreignSave.error.message.slice(0, 90));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── 3. Grille de créneaux récurrents : la garde du lot 6');
  const tplRow = {
    box_id: box.id, title: `zz_l6_slot_${stamp}`, day_of_week: 1, start_time: '18:00',
    end_time: '19:00', max_capacity: 12, is_active: true,
  };
  const coachTpl = await coach.client.from('schedule_templates').insert(tplRow).select('id');
  check('coach ÉCRIT un modèle de créneau (schedule_templates)', coachTpl.error == null && (coachTpl.data ?? []).length === 1, true);
  if (coachTpl.error) note('erreur', coachTpl.error.message);
  if (coachTpl.data?.[0]) cleanup.unshift(() => svc.from('schedule_templates').delete().eq('id', coachTpl.data[0].id));

  const coownerTpl = await coowner.client.from('schedule_templates').insert({ ...tplRow, title: `zz_l6_slot_co_${stamp}`, day_of_week: 2 }).select('id');
  check('co-gérant ÉCRIT un modèle de créneau', coownerTpl.error == null && (coownerTpl.data ?? []).length === 1, true);
  if (coownerTpl.data?.[0]) cleanup.unshift(() => svc.from('schedule_templates').delete().eq('id', coownerTpl.data[0].id));

  const foreignTpl = await foreign.client.from('schedule_templates').insert({ ...tplRow, title: `zz_l6_slot_tiers_${stamp}`, day_of_week: 3 }).select('id');
  check("coach d'une AUTRE box refusé sur schedule_templates", refus(foreignTpl.error, 'row-level security|violates|denied'), true);
  if (foreignTpl.error) note('refus', foreignTpl.error.message.slice(0, 90));
  // Un refus RLS peut se présenter sans erreur selon le chemin : on compte donc
  // aussi l'état réellement écrit, sinon « 0 ligne » passerait pour un succès.
  const tiersEcrit = await svc.from('schedule_templates').select('id').eq('box_id', box.id).eq('day_of_week', 3);
  check('aucune ligne écrite par le coach tiers', (tiersEcrit.data ?? []).length, 0);

  const athleteTpl = await athlete.client.from('schedule_templates').insert({ ...tplRow, title: `zz_l6_slot_ath_${stamp}`, day_of_week: 4 }).select('id');
  check('adhérent simple refusé sur schedule_templates', refus(athleteTpl.error, 'row-level security|violates|denied'), true);

  const gen = await coach.client.rpc('generate_class_schedules_from_templates', { p_box_id: box.id, p_weeks_ahead: 1 });
  check('coach GÉNÈRE les créneaux depuis les modèles', gen.error == null, true);
  if (gen.error) note('erreur', gen.error.message);
  else note('créneaux générés', gen.data);

  const genForeign = await foreign.client.rpc('generate_class_schedules_from_templates', { p_box_id: box.id, p_weeks_ahead: 1 });
  check("coach d'une AUTRE box refusé sur la génération", refus(genForeign.error, 'refus|denied|appartient|autoris'), true);

  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n── 4. L'argent reste fermé au coach (5-F ne se relâche pas)");
  const prog = must(await svc.from('box_programming').insert({
    publisher_box_id: pubBox.id, title: `zz_l6_prog_${stamp}`, is_published: true,
    price_cents: 9900, billing: 'monthly', weeks_count: 4,
  }).select('id').single(), 'box_programming (payante, publiée)');
  const progWod = must(await svc.from('box_programming_wods').insert({
    programming_id: prog.id, week_number: 1, day_of_week: 1, title: 'zz_l6_prog_wod', description: 'contenu payant',
  }).select('id').single(), 'box_programming_wods');

  const paid = await coach.client.from('box_programming_subscriptions').insert({
    programming_id: prog.id, subscriber_box_id: box.id, status: 'active',
  }).select('id');
  check('coach refusé sur un abonnement PAYANT actif (garde backend)', refus(paid.error, 'PAID_PROGRAMMING'), true);
  const readPaid = await coach.client.from('box_programming_wods').select('id').eq('id', progWod.id);
  check('le contenu payant reste illisible', (readPaid.data ?? []).length, 0);

  const rpcPaid = await coach.client.rpc('subscribe_free_programming', {
    p_programming_id: prog.id, p_subscriber_box_id: box.id,
  });
  check('la RPC gratuite refuse une offre payante', refus(rpcPaid.error, 'payante|PAID|gratuit'), true);

  const progFree = must(await svc.from('box_programming').insert({
    publisher_box_id: pubBox.id, title: `zz_l6_free_${stamp}`, is_published: true,
    price_cents: 0, billing: 'free', weeks_count: 4,
  }).select('id').single(), 'box_programming (gratuite)');
  const rpcFree = await coach.client.rpc('subscribe_free_programming', {
    p_programming_id: progFree.id, p_subscriber_box_id: box.id,
  });
  check('contrôle positif : offre GRATUITE souscrite par la RPC', rpcFree.error == null, true);
  if (rpcFree.error) note('erreur', rpcFree.error.message);
  cleanup.unshift(() => svc.from('box_programming_subscriptions').delete().eq('programming_id', progFree.id));

  const publish = await coach.client.from('box_programming').insert({
    publisher_box_id: box.id, title: `zz_l6_pub_${stamp}`, is_published: true, price_cents: 4900,
    billing: 'monthly', weeks_count: 4,
  }).select('id');
  check('coach refusé sur la PUBLICATION et le PRIX d\'une offre', publish.error != null, true);
  // L'invariant exclut les semaines types : elles SONT des `box_programming`
  // (`is_template = true`, privées, posées par la RPC) et le coach en crée
  // légitimement. Compter toutes les lignes rendrait ce contrôle rouge pour le
  // bon comportement du serveur.
  const publie = await svc.from('box_programming').select('id')
    .eq('publisher_box_id', box.id).eq('is_template', false);
  check('aucune offre publiée au nom de la box par le coach', (publie.data ?? []).length, 0);

  const money = await coach.client.rpc('get_box_money_summary', {
    p_box_id: box.id, p_from: new Date(Date.now() - 30 * 864e5).toISOString(), p_to: new Date().toISOString(),
  });
  check('coach refusé sur get_box_money_summary', money.error != null, true);

  const cash = await coach.client.from('box_cash_payments').select('id').eq('box_id', box.id);
  check('coach ne lit pas le journal comptoir', (cash.data ?? []).length, 0);

  const boxSub = await coach.client.from('box_subscriptions').select('id').eq('box_id', box.id);
  check("coach ne lit pas l'abonnement de la box", (boxSub.data ?? []).length, 0);

  const program = must(await svc.from('programs').insert({
    box_id: box.id, owner_id: owner.id, title: `zz_l6_program_${stamp}`, price_cents: 2900,
    type: 'fixed', invite_code: `ZP6${String(stamp).slice(-6)}`,
  }).select('id').single(), 'programs');
  const assign = await coach.client.rpc('assign_program_cash', {
    p_program_id: program.id, p_user_id: athlete.id, p_amount_cents: 1000,
  });
  check('coach refusé sur assign_program_cash', assign.error != null, true);

  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n── 5. « Qui paie quoi » : le résidu de lecture nominative");
  const plan = must(await svc.from('membership_plans').insert({
    box_id: box.id, name: `zz_l6_plan_${stamp}`, price_cents: 6900, plan_type: 'subscription',
    is_active: true, max_sessions_per_week: 3,
  }).select('id, price_cents').single(), 'membership_plans');
  cleanup.unshift(() => svc.from('membership_plans').delete().eq('id', plan.id));
  must(await svc.from('box_members').update({
    plan_id: plan.id, subscription_status: 'active', amount_cents: 6900,
    subscription_current_period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
  }).eq('box_id', box.id).eq('member_id', athlete.id).select('id').single(), 'abonnement de décor');

  const coachNominatif = await coach.client.from('box_members')
    .select('member_id, subscription_status, plan_id').eq('box_id', box.id);
  check('coach refusé sur box_members.subscription_status / plan_id',
    refus(coachNominatif.error, 'permission denied'), true);
  if (coachNominatif.error) note('refus', coachNominatif.error.message.slice(0, 90));
  // Une fermeture qui emporterait la liste des adhérents ne serait pas une
  // frontière, ce serait une panne : le coach garde ce qui n'est pas de l'argent.
  const coachRoster = await coach.client.from('box_members')
    .select('member_id, role, status, joined_at').eq('box_id', box.id).eq('status', 'active');
  check('contrôle positif : le coach lit encore le roster (sans argent)',
    (coachRoster.data ?? []).length >= 3, true);

  const coachBilling = await coach.client.rpc('get_box_billing', { p_box_id: box.id });
  check('coach refusé sur get_box_billing, et le refus est prononcé',
    refus(coachBilling.error, 'refus|denied|gérant'), true);
  if (coachBilling.error) note('refus', coachBilling.error.message.slice(0, 90));

  const ownerBilling = await owner.client.rpc('get_box_billing', { p_box_id: box.id });
  const ownerLigne = (ownerBilling.data ?? []).find(r => r.member_id === athlete.id);
  check('contrôle positif : le gérant lit le statut nominatif', ownerLigne?.subscription_status, 'active');
  check('contrôle positif : le gérant lit la formule nominative', ownerLigne?.plan_id, plan.id);
  check('contrôle positif : le gérant lit le montant', ownerLigne?.amount_cents, 6900);

  const coownerBilling = await coowner.client.rpc('get_box_billing', { p_box_id: box.id });
  check('contrôle positif : le co-gérant aussi',
    ((coownerBilling.data ?? []).find(r => r.member_id === athlete.id))?.subscription_status, 'active');

  const foreignBilling = await foreign.client.rpc('get_box_billing', { p_box_id: box.id });
  check("gérant d'une AUTRE box refusé sur get_box_billing",
    refus(foreignBilling.error, 'refus|denied|gérant'), true);

  const selfBilling = await athlete.client.rpc('get_my_membership_billing');
  const selfLignes = selfBilling.data ?? [];
  check('contrôle positif : l\'adhérent lit SON abonnement', selfLignes[0]?.subscription_status, 'active');
  check('… et rien que le sien', selfLignes.every(r => r.plan_id === plan.id || r.plan_id == null), true);

  // L'assignation de formule est un geste de gérant : la fermeture en lecture ne
  // doit pas l'emporter, et elle ne doit pas s'ouvrir au coach.
  const ownerAssign = await owner.client.from('box_members')
    .update({ plan_id: plan.id }).eq('box_id', box.id).eq('member_id', athlete.id).select('member_id');
  check('contrôle positif : le gérant assigne toujours une formule',
    ownerAssign.error == null && (ownerAssign.data ?? []).length === 1, true);
  const coachAssign = await coach.client.from('box_members')
    .update({ plan_id: null }).eq('box_id', box.id).eq('member_id', athlete.id).select('member_id');
  check('coach n\'assigne pas de formule', (coachAssign.data ?? []).length, 0);
  const resteAssigne = await svc.from('box_members').select('plan_id')
    .eq('box_id', box.id).eq('member_id', athlete.id).single();
  check('… et la formule de l\'adhérent est intacte', resteAssigne.data?.plan_id, plan.id);

  // Le tarif d'une formule, lui, est public : `public_read_active_plans` le sert
  // à la page publique d'une box. Le cacher au coach serait un décor — il le lit
  // sans session. C'est mesuré, pas supposé.
  const anonClient = createClient(SB_URL, ANON, { auth: { persistSession: false } });
  const anonPlan = await anonClient.from('membership_plans').select('price_cents').eq('id', plan.id).maybeSingle();
  const coachPlan = await coach.client.from('membership_plans').select('price_cents').eq('id', plan.id).maybeSingle();
  check('le tarif d\'une formule est public (sans session)', anonPlan.data?.price_cents, 6900);
  check('le coach n\'en lit pas plus que la clé anon', coachPlan.data?.price_cents, anonPlan.data?.price_cents);
} catch (e) {
  console.error('\n⛔ protocole interrompu :', e.message ?? e);
  results.push(false);
} finally {
  for (const fn of cleanup) { try { await fn(); } catch (e) { console.error('cleanup', e.message); } }
  const ko = results.filter(r => !r).length;
  console.log(`\n=== ${results.length - ko} ✅ · ${ko} ❌ ===`);
  console.log(`ESPACE_COACH_ASSERTIONS=${results.length - ko}/${results.length}`);
  if (ko > 0) process.exitCode = 1;
}
