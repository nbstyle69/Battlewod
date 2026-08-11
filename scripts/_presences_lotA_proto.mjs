// Protocole « feuille de présence — lot A serveur » (20261024).
//
// Frontières à prouver, dans les deux sens :
//   • le gérant ET le coach de LA box pointent une présence ;
//   • le gérant d'une AUTRE box, l'athlète tiers et anon ne pointent rien ;
//   • le membre ne pointe PAS sa propre présence ;
//   • le membre ne se promeut PAS lui-même de la liste d'attente ;
//   • non-régression : le membre réserve et annule toujours (chemin app mobile),
//     la promotion automatique fonctionne toujours, la capacité tient toujours.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.TEST_DB_URL;
if (!URL || !ANON || !SERVICE || !DB) { console.error('Variables TEST_* manquantes'); process.exit(1); }
if (URL.includes('lkwdlqlbrbxaiydkoxfp') || DB.includes('lkwdlqlbrbxaiydkoxfp')) {
  console.error('❌ Cible = PRODUCTION — refusé'); process.exit(1);
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const sql = q => execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf-8' }).trim();

let ok = 0, ko = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

const stamp = Date.now();
const created = { users: [], boxes: [] };

const mkUser = async (suffix, role = 'member') => {
  const email = `zz_pres_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_pres_${suffix}_${stamp}`, level: 'inter', role, elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, email, client };
};

const rowOf = async id => (await svc.from('class_reservations').select('attended, status').eq('id', id).single()).data;
const point = (who, resId, value) =>
  who.client.from('class_reservations').update({ attended: value }).eq('id', resId).select('id');

try {
  const ownerA   = await mkUser('ownerA', 'box_owner');
  const ownerB   = await mkUser('ownerB', 'box_owner');
  const coachA   = await mkUser('coachA');
  const memberA  = await mkUser('memberA');
  const memberA2 = await mkUser('memberA2');
  const outsider = await mkUser('outsider');

  const mkBox = async (owner, tag) => {
    const { data, error } = await svc.from('boxes').insert({
      owner_id: owner.id, name: `ZZ PRES ${tag} ${stamp}`, slug: `zz-pres-${tag}-${stamp}`,
      invite_code: `ZP${tag}${String(stamp).slice(-4)}`, is_active: true, is_listed: true, city: 'Lyon',
    }).select('id').single();
    if (error) throw error;
    created.boxes.push(data.id);
    return data.id;
  };
  const boxA = await mkBox(ownerA, 'A');
  await mkBox(ownerB, 'B');

  const addMember = async (boxId, user, role) => {
    const { error } = await svc.from('box_members').insert({
      box_id: boxId, member_id: user.id, role, status: 'active',
    });
    if (error) throw error;
  };
  await addMember(boxA, coachA, 'coach');
  await addMember(boxA, memberA, 'member');
  await addMember(boxA, memberA2, 'member');

  const mkSlot = async (capacity) => {
    const { data, error } = await svc.from('class_schedules').insert({
      box_id: boxA, title: 'ZZ Présences', scheduled_date: new Date().toISOString().slice(0, 10),
      start_time: '10:00', end_time: '11:00', max_capacity: capacity,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  };

  // ── Décor : un créneau d'une place, deux inscrits ─────────────────────────
  const slot = await mkSlot(1);
  const { data: r1 } = await svc.from('class_reservations').insert({
    schedule_id: slot, member_id: memberA.id, box_id: boxA, status: 'confirmed',
  }).select('id, status').single();
  const { data: r2 } = await svc.from('class_reservations').insert({
    schedule_id: slot, member_id: memberA2.id, box_id: boxA, status: 'confirmed',
  }).select('id, status').single();
  check('capacité tenue en base : le 2e passe en liste d\'attente', r2.status === 'waiting', `statut=${r2.status}`);

  // ── Qui pointe ────────────────────────────────────────────────────────────
  const { data: dOwner } = await point(ownerA, r1.id, true);
  check('gérant de la box pointe', (dOwner?.length ?? 0) === 1 && (await rowOf(r1.id)).attended === true);

  await svc.from('class_reservations').update({ attended: null }).eq('id', r1.id);
  const { data: dCoach } = await point(coachA, r1.id, false);
  check('coach de la box pointe une absence', (dCoach?.length ?? 0) === 1 && (await rowOf(r1.id)).attended === false);

  // ── Qui ne pointe pas ─────────────────────────────────────────────────────
  await svc.from('class_reservations').update({ attended: null }).eq('id', r1.id);
  for (const [label, who] of [['gérant d\'une AUTRE box', ownerB], ['athlète étranger à la box', outsider]]) {
    const { data } = await point(who, r1.id, true);
    check(`${label} refusé`, (data?.length ?? 0) === 0 && (await rowOf(r1.id)).attended === null);
  }

  const { data: dAnon } = await anon.from('class_reservations').update({ attended: true }).eq('id', r1.id).select('id');
  check('anon refusé', (dAnon?.length ?? 0) === 0 && (await rowOf(r1.id)).attended === null);

  const { data: dSelf } = await point(memberA, r1.id, true);
  check('le membre ne pointe PAS sa propre présence',
    (dSelf?.length ?? 0) === 0 && (await rowOf(r1.id)).attended === null);

  const { data: dPeer } = await point(memberA2, r1.id, true);
  check('un membre ne pointe pas celle d\'un camarade',
    (dPeer?.length ?? 0) === 0 && (await rowOf(r1.id)).attended === null);

  // ── Saut de file ──────────────────────────────────────────────────────────
  const { data: dJump } = await memberA2.client.from('class_reservations')
    .update({ status: 'confirmed' }).eq('id', r2.id).select('id');
  check('le membre ne se promeut PAS de la liste d\'attente',
    (dJump?.length ?? 0) === 0 && (await rowOf(r2.id)).status === 'waiting');

  // ── Non-régression : le chemin réel du membre (app mobile) ────────────────
  const slot2 = await mkSlot(1);
  const { data: own, error: ownErr } = await memberA.client.from('class_reservations')
    .insert({ schedule_id: slot2, member_id: memberA.id, box_id: boxA, status: 'confirmed' })
    .select('id, status').single();
  check('non-régression : le membre réserve toujours', !ownErr && own?.status === 'confirmed', ownErr?.message ?? '');

  const { data: queued } = await memberA2.client.from('class_reservations')
    .insert({ schedule_id: slot2, member_id: memberA2.id, box_id: boxA, status: 'confirmed' })
    .select('id, status').single();
  check('non-régression : créneau plein → liste d\'attente', queued?.status === 'waiting', `statut=${queued?.status}`);

  const { data: dDel } = await memberA.client.from('class_reservations')
    .delete().eq('id', own.id).select('id');
  check('non-régression : le membre annule toujours', (dDel?.length ?? 0) === 1);

  check('non-régression : la place libérée promeut le 1er de la file',
    (await rowOf(queued.id)).status === 'confirmed');

  // ── La policy visée n'existe plus, celle du gérant est intacte ────────────
  const policies = sql(`SELECT string_agg(policyname, ',' ORDER BY policyname)
                          FROM pg_policies
                         WHERE tablename = 'class_reservations' AND cmd = 'UPDATE'`);
  check('plus aucune policy d\'UPDATE pour le membre', !policies.includes('member_update_own_reservation'), policies);
  check('la policy d\'UPDATE du gérant est intacte', policies.includes('box_admin_update_reservation'), policies);
} finally {
  for (const b of created.boxes) sql(`DELETE FROM boxes WHERE id = '${b}'`);
  for (const u of created.users) {
    await svc.auth.admin.deleteUser(u).catch(() => {});
    sql(`DELETE FROM profiles WHERE id = '${u}'`);
  }
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
