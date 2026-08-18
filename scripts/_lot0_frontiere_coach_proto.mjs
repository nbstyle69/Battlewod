/**
 * Lot 0 — protocole de fermeture de la frontière coach (vrai JWT).
 *
 * Même décor que la recon R4, assertions INVERSÉES : ce que le coach lisait et
 * écrivait doit désormais être refusé, et le gérant doit continuer de passer.
 * Sans la moitié « gérant autorisé », une garde qui refuserait TOUT LE MONDE
 * passerait pour un succès — c'est le contrôle positif.
 *
 * Tout est créé sous préfixe zz_ dans la base de prod puis supprimé.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const svc = createClient(URL, SVC, { auth: { persistSession: false } });

const stamp = Date.now();
const results = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${label} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
}
function must(res, what) {
  if (res.error || !res.data) throw new Error(`décor « ${what} » : ${res.error?.message ?? 'aucune ligne'}`);
  return res.data;
}

async function makeUser(tag, role) {
  const email = `zz_lot0_${tag}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  await svc.from('profiles').upsert({ id: data.user.id, email, username: `zz_lot0_${tag}_${stamp}`, level: 'inter', role, elo: 1000 });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  return { id: data.user.id, client };
}

const PERIOD = { p_from: new Date(Date.now() - 30 * 864e5).toISOString(), p_to: new Date().toISOString() };
const DAYS = { p_from: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), p_to: new Date().toISOString().slice(0, 10) };

const cleanup = [];
try {
  const owner = await makeUser('owner', 'box_owner');
  cleanup.push(() => svc.auth.admin.deleteUser(owner.id));
  const coowner = await makeUser('coowner', 'member');
  cleanup.push(() => svc.auth.admin.deleteUser(coowner.id));
  const coach = await makeUser('coach', 'member');
  cleanup.push(() => svc.auth.admin.deleteUser(coach.id));
  const athlete = await makeUser('athlete', 'member');
  cleanup.push(() => svc.auth.admin.deleteUser(athlete.id));

  const box = must(await svc.from('boxes').insert({
    name: `zz_lot0_box_${stamp}`, owner_id: owner.id, city: 'Test', invite_code: `ZL0${String(stamp).slice(-6)}`,
  }).select('id').single(), 'boxes');
  cleanup.unshift(() => svc.from('boxes').delete().eq('id', box.id));

  const plan = must(await svc.from('membership_plans').insert({
    box_id: box.id, name: 'zz_lot0_plan', price_cents: 5900, is_active: true,
  }).select('id').single(), 'membership_plans');

  must(await svc.from('box_members').insert({ box_id: box.id, member_id: coach.id, role: 'coach', status: 'active' }).select('id').single(), 'coach');
  must(await svc.from('box_members').insert({ box_id: box.id, member_id: coowner.id, role: 'owner', status: 'active' }).select('id').single(), 'co-gérant');
  const member = must(await svc.from('box_members').insert({
    box_id: box.id, member_id: athlete.id, role: 'member', status: 'active',
    plan_id: plan.id, subscription_status: 'active',
  }).select('id').single(), 'adhérent');

  must(await svc.from('box_cash_payments').insert({
    box_id: box.id, member_id: athlete.id, plan_id: plan.id, plan_name: 'zz_lot0_plan',
    amount_cents: 5900, source: 'renewal', collected_by: owner.id,
  }).select('id').single(), 'encaissement comptoir');

  const boxId = box.id;
  console.log(`\ndécor : box ${boxId} · gérant, co-gérant, coach, adhérent payé 59,00 € en espèces\n`);

  // ── Ce que le coach ne doit PLUS pouvoir faire.
  console.log('— coach (doit être refusé sur l\'argent et l\'administratif) —');
  const cMoney = await coach.client.rpc('get_box_money_summary', { p_box_id: boxId, ...PERIOD });
  check('coach refusé sur get_box_money_summary', cMoney.error?.code ?? null, '42501');
  const cPeople = await coach.client.rpc('get_box_money_people', { p_box_id: boxId });
  check('coach refusé sur get_box_money_people', cPeople.error?.code ?? null, '42501');
  const cPlans = await coach.client.rpc('get_box_plan_breakdown', { p_box_id: boxId });
  check('coach refusé sur get_box_plan_breakdown', cPlans.error?.code ?? null, '42501');
  const cFunnel = await coach.client.rpc('get_box_funnel_summary', { p_box_id: boxId, ...PERIOD });
  check('coach refusé sur get_box_funnel_summary', cFunnel.error?.code ?? null, '42501');
  const cCashWrite = await coach.client.rpc('record_member_cash_payment', { p_box_member_id: member.id });
  check('coach ne peut PLUS encaisser au comptoir', cCashWrite.error?.code ?? null, '42501');
  const cInvite = await coach.client.rpc('create_box_invitation', {
    p_box_id: boxId, p_email: `zz_lot0_c_${stamp}@test.athlex.io`, p_plan_id: plan.id, p_payment_mode: 'box', p_cash_collected: true,
  });
  check('coach ne peut PLUS créer d\'invitation encaissée', cInvite.error?.code ?? null, '42501');
  const { data: cCash } = await coach.client.from('box_cash_payments').select('id').eq('box_id', boxId);
  check('coach ne lit plus le journal comptoir', (cCash ?? []).length, 0);
  const { data: cInv } = await coach.client.from('box_invitations').select('id').eq('box_id', boxId);
  check('coach ne lit plus les invitations', (cInv ?? []).length, 0);

  // ── Ce que le coach doit CONSERVER (sinon la garde est trop large).
  console.log('\n— coach (doit conserver son métier) —');
  const cAttend = await coach.client.rpc('get_box_attendance_summary', { p_box_id: boxId, ...DAYS });
  check('coach garde l\'assiduité (attendance_summary)', cAttend.error == null, true);
  const cPeopleAtt = await coach.client.rpc('get_box_attendance_people', { p_box_id: boxId });
  check('coach garde les personnes à risque (attendance_people)', cPeopleAtt.error == null, true);
  const cHeat = await coach.client.rpc('get_box_reservation_heatmap', { p_box_id: boxId, ...DAYS });
  check('coach garde la heatmap de remplissage', cHeat.error == null, true);
  const { error: cWodErr } = await coach.client.from('box_wods').insert({
    box_id: boxId, created_by: coach.id, title: 'zz_lot0_wod', scheduled_date: DAYS.p_to, is_published: true,
  });
  check('coach garde l\'écriture des WOD du whiteboard', cWodErr == null, true);

  // ── Contrôle positif : le gérant et le co-gérant passent toujours.
  console.log('\n— gérant et co-gérant (doivent passer : contrôle positif) —');
  const oMoney = await owner.client.rpc('get_box_money_summary', { p_box_id: boxId, ...PERIOD });
  check('gérant lit toujours get_box_money_summary', oMoney.error == null, true);
  if (!oMoney.error) console.log('   →', JSON.stringify(oMoney.data)?.slice(0, 160));
  const { data: oCash } = await owner.client.from('box_cash_payments').select('id').eq('box_id', boxId);
  check('gérant lit toujours le journal comptoir', (oCash ?? []).length, 1);
  const coMoney = await coowner.client.rpc('get_box_money_summary', { p_box_id: boxId, ...PERIOD });
  check('co-gérant (role owner) lit toujours l\'argent', coMoney.error == null, true);
  const oCashWrite = await owner.client.rpc('record_member_cash_payment', { p_box_member_id: member.id });
  check('gérant encaisse toujours au comptoir', oCashWrite.error == null, true);
  const oInvite = await owner.client.rpc('create_box_invitation', {
    p_box_id: boxId, p_email: `zz_lot0_o_${stamp}@test.athlex.io`, p_plan_id: plan.id, p_payment_mode: 'box',
  });
  check('gérant crée toujours une invitation', oInvite.error == null, true);

  // ── Et l'adhérent reste dehors.
  const aMoney = await athlete.client.rpc('get_box_money_summary', { p_box_id: boxId, ...PERIOD });
  check('adhérent simple toujours refusé', aMoney.error != null, true);
} catch (e) {
  console.error('\n⛔ protocole interrompu :', e.message ?? e);
  results.push(false);
} finally {
  await svc.from('box_invitations').delete().like('email', `zz_lot0_%${stamp}%`);
  for (const fn of cleanup) { try { await fn(); } catch (e) { console.error('cleanup', e.message); } }
  const ko = results.filter(r => !r).length;
  console.log(`\n${results.length - ko} ✅ · ${ko} ❌`);
  process.exit(ko ? 1 : 0);
}
