/**
 * R4 — frontière coach sur les lectures financières (audit, aucune écriture de prod).
 *
 * `is_box_admin()` accepte les rôles owner ET coach. Ce protocole mesure au vrai
 * JWT ce qu'un coach lit et écrit RÉELLEMENT sur l'argent de sa box, plutôt que
 * de déduire d'une policy. Contrôle négatif : un coach d'une AUTRE box doit être
 * refusé partout — sans lui, un « accès autorisé » pourrait n'être qu'une garde
 * absente sur toute la table.
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

async function makeUser(tag, role) {
  const email = `zz_r4_${tag}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  await svc.from('profiles').upsert({ id: data.user.id, email, username: `zz_r4_${tag}_${stamp}`, level: 'inter', role, elo: 1000 });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  return { id: data.user.id, client };
}

// Une écriture de décor qui échoue en silence transforme tout le protocole en
// « tout est refusé » — donc chaque insert de décor est vérifié.
function must(res, what) {
  if (res.error || !res.data) throw new Error(`décor « ${what} » : ${res.error?.message ?? 'aucune ligne'}`);
  return res.data;
}

const cleanup = [];
try {
  // ── Décor : une box, son gérant, son coach, un adhérent payé en espèces.
  const owner = await makeUser('owner', 'box_owner');
  cleanup.push(() => svc.auth.admin.deleteUser(owner.id));
  const coach = await makeUser('coach', 'member');
  cleanup.push(() => svc.auth.admin.deleteUser(coach.id));
  const athlete = await makeUser('athlete', 'member');
  cleanup.push(() => svc.auth.admin.deleteUser(athlete.id));

  const box = must(await svc.from('boxes').insert({
    name: `zz_r4_box_${stamp}`, owner_id: owner.id, city: 'Test', invite_code: `ZR4${String(stamp).slice(-6)}`,
  }).select('id').single(), 'boxes');
  cleanup.unshift(() => svc.from('boxes').delete().eq('id', box.id));

  // Une box tierce avec son propre coach → contrôle négatif.
  const otherCoach = await makeUser('coach2', 'member');
  cleanup.push(() => svc.auth.admin.deleteUser(otherCoach.id));
  const otherBox = must(await svc.from('boxes').insert({
    name: `zz_r4_box2_${stamp}`, owner_id: otherCoach.id, city: 'Test', invite_code: `ZR5${String(stamp).slice(-6)}`,
  }).select('id').single(), 'boxes (tierce)');
  cleanup.unshift(() => svc.from('boxes').delete().eq('id', otherBox.id));

  const plan = must(await svc.from('membership_plans').insert({
    box_id: box.id, name: 'zz_r4_plan', price_cents: 5900, is_active: true,
  }).select('id').single(), 'membership_plans');

  must(await svc.from('box_members').insert({ box_id: box.id, member_id: coach.id, role: 'coach', status: 'active' }).select('id').single(), 'coach de la box');
  must(await svc.from('box_members').insert({ box_id: otherBox.id, member_id: otherCoach.id, role: 'coach', status: 'active' }).select('id').single(), 'coach de la box tierce');
  const member = must(await svc.from('box_members').insert({
    box_id: box.id, member_id: athlete.id, role: 'member', status: 'active',
    plan_id: plan.id, subscription_status: 'active',
  }).select('id').single(), 'adhérent');

  must(await svc.from('box_cash_payments').insert({
    box_id: box.id, member_id: athlete.id, plan_id: plan.id, plan_name: 'zz_r4_plan',
    amount_cents: 5900, source: 'renewal', collected_by: owner.id,
  }).select('id').single(), 'encaissement comptoir');

  const boxId = box.id;
  console.log(`\ndécor : box ${boxId} · coach ${coach.id} · adhérent payé 59,00 € en espèces\n`);

  // ── Ce que le coach lit sur l'argent de SA box.
  const money = await coach.client.rpc('get_box_money_summary', {
    p_box_id: boxId, p_from: new Date(Date.now() - 30 * 864e5).toISOString(), p_to: new Date().toISOString(),
  });
  check('coach lit get_box_money_summary (MRR, encaissements)', money.error == null, true);
  if (!money.error) console.log('   →', JSON.stringify(money.data)?.slice(0, 220));

  const people = await coach.client.rpc('get_box_money_people', { p_box_id: boxId });
  check('coach lit get_box_money_people (nominatif : qui paie quoi)', people.error == null, true);
  if (!people.error) console.log('   →', JSON.stringify(people.data)?.slice(0, 220));

  const { data: cash } = await coach.client.from('box_cash_payments').select('amount_cents,plan_name').eq('box_id', boxId);
  check('coach lit le journal des encaissements comptoir', (cash ?? []).length, 1);

  const { data: billing } = await coach.client.from('box_members')
    .select('id,subscription_status,plan_id').eq('box_id', boxId).eq('id', member.id);
  check('coach lit la facturation des adhérents (box_members)', (billing ?? []).length, 1);

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const attend = await coach.client.rpc('get_box_attendance_summary', { p_box_id: boxId, p_from: monthAgo, p_to: today });
  check('coach lit get_box_attendance_summary (assiduité — légitime pour lui)', attend.error == null, true);
  const funnel = await coach.client.rpc('get_box_funnel_summary', {
    p_box_id: boxId, p_from: new Date(Date.now() - 30 * 864e5).toISOString(), p_to: new Date().toISOString(),
  });
  check('coach lit get_box_funnel_summary (croissance)', funnel.error == null, true);

  // ── Écritures d'argent.
  const cashWrite = await coach.client.rpc('record_member_cash_payment', { p_box_member_id: member.id });
  check('coach ENCAISSE au comptoir (écriture d\'argent)', cashWrite.error == null, true);

  const invite = await coach.client.rpc('create_box_invitation', {
    p_box_id: boxId, p_email: `zz_r4_invite_${stamp}@test.athlex.io`, p_plan_id: plan.id,
    p_payment_mode: 'box', p_cash_collected: true,
  });
  check('coach crée une invitation nominative avec encaissement', invite.error == null, true);

  // ── Contrôle négatif : un coach d'une autre box doit être refusé partout.
  const foreignMoney = await otherCoach.client.rpc('get_box_money_summary', {
    p_box_id: boxId, p_from: new Date(Date.now() - 30 * 864e5).toISOString(), p_to: new Date().toISOString(),
  });
  check('coach d\'une AUTRE box refusé sur get_box_money_summary', foreignMoney.error != null, true);
  const { data: foreignCash } = await otherCoach.client.from('box_cash_payments').select('id').eq('box_id', boxId);
  check('coach d\'une AUTRE box ne lit pas le journal comptoir', (foreignCash ?? []).length, 0);

  // ── L'athlète, lui, ne doit rien voir de tout ça.
  const athleteMoney = await athlete.client.rpc('get_box_money_summary', {
    p_box_id: boxId, p_from: new Date(Date.now() - 30 * 864e5).toISOString(), p_to: new Date().toISOString(),
  });
  check('adhérent simple refusé sur get_box_money_summary', athleteMoney.error != null, true);
} catch (e) {
  console.error('\n⛔ protocole interrompu :', e.message ?? e);
} finally {
  for (const fn of cleanup) { try { await fn(); } catch (e) { console.error('cleanup', e.message); } }
  await svc.from('box_invitations').delete().like('email', `zz_r4_invite_${stamp}%`);
  const ko = results.filter(r => !r).length;
  console.log(`\n${results.length - ko} conforme(s) à l'attendu · ${ko} écart(s)`);
  process.exit(ko ? 1 : 0);
}
