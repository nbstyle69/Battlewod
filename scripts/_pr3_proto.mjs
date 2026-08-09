// Protocole PR 3 (bugs 4.x) sur la pile de test jetable — jamais la prod.
// Vérifie sur vraies données : compteur de WODs (member_id), liste communauté
// via box_members, et le merge des personal_records au save (4.6b).
import { createClient } from '@supabase/supabase-js';

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error('Variables TEST_SUPABASE_* manquantes'); process.exit(1); }
if (URL.includes('lkwdlqlbrbxaiydkoxfp')) { console.error('❌ Cible = PRODUCTION — refusé'); process.exit(1); }

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let ok = 0, ko = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

const stamp = Date.now();
const mkUser = async (suffix) => {
  const email = `zz_pr3_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: profileError } = await svc.from('profiles').upsert({ id: data.user.id, email, username: `zz_pr3_${suffix}_${stamp}`, level: 'inter', role: 'member', elo: 1000 });
  if (profileError) throw profileError;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
};

const cleanup = async (ids, boxId) => {
  if (boxId) {
    await svc.from('wod_scores').delete().eq('box_id', boxId);
    const { error } = await svc.from('boxes').delete().eq('id', boxId);
    if (error) console.error('purge box', error.message);
  }
  for (const id of ids) {
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) console.error('purge user', id, error.message);
  }
};

let created = [];
let boxId = null;
try {
  const owner = await mkUser('owner');
  const member = await mkUser('member');
  created = [owner.id, member.id];

  const { data: box, error: boxError } = await svc.from('boxes').insert({
    owner_id: owner.id, name: `ZZ PR3 ${stamp}`, slug: `zz-pr3-${stamp}`,
    invite_code: `Z3${String(stamp).slice(-6)}`, is_active: true, is_listed: true,
  }).select('id').single();
  if (boxError) throw boxError;
  boxId = box.id;

  await svc.from('box_members').insert([
    { box_id: boxId, member_id: owner.id, role: 'owner', status: 'active' },
    { box_id: boxId, member_id: member.id, role: 'member', status: 'active' },
  ]);

  // ── 4.1a compteur de WODs : la colonne est member_id, pas user_id ──
  const { data: wod, error: wodError } = await svc.from('box_wods').insert({
    box_id: boxId, title: 'ZZ PR3 WOD', wod_type: 'for_time', description: '21-15-9', is_published: true, scheduled_date: new Date().toISOString().slice(0, 10),
  }).select('id').single();
  if (wodError) throw wodError;
  await svc.from('wod_scores').insert({ wod_id: wod.id, member_id: member.id, box_id: boxId, score_type: 'time', score_value: 300 });

  const bad = await member.client.from('wod_scores').select('id', { count: 'exact', head: true }).eq('user_id', member.id);
  check('4.1a colonne user_id inexistante (ancien code)', !!bad.error, bad.error?.message ?? 'aucune erreur');

  const good = await member.client.from('wod_scores').select('id', { count: 'exact', head: true }).eq('member_id', member.id);
  check('4.1a compteur WODs sur member_id', !good.error && good.count === 1, `count=${good.count}`);

  // ── 4.1b communauté via box_members ──
  const legacy = await member.client.from('profiles')
    .select('id, username, elo').eq('box_id', boxId);
  check('4.1b profiles.box_id inexistant (ancien code)', !!legacy.error, legacy.error?.code ?? 'aucune erreur');

  const community = await member.client.from('box_members')
    .select('profiles:member_id(id, username, level, elo, wins, total_matches, avatar_url)')
    .eq('box_id', boxId).eq('status', 'active');
  const list = (community.data ?? []).map(r => (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)).filter(Boolean);
  check('4.1b communauté via box_members', !community.error && list.length === 2, `${list.length} membre(s)`);

  // ── 4.6b merge des personal_records au save ──
  const savePRs = async (client, userId, updated, changedKeys) => {
    const { data } = await client.from('profiles').select('personal_records').eq('id', userId).single();
    const merged = { ...(data?.personal_records ?? {}) };
    for (const key of changedKeys) merged[key] = updated[key];
    return client.from('profiles').update({ personal_records: merged }).eq('id', userId);
  };

  await savePRs(member.client, member.id, { 'weightlifting_Back Squat': '150' }, ['weightlifting_Back Squat']);
  await savePRs(member.client, member.id, { 'cardio_500m Row': '1:35' }, ['cardio_500m Row']);
  const { data: after } = await member.client.from('profiles').select('personal_records').eq('id', member.id).single();
  const records = after?.personal_records ?? {};
  check('4.6b les deux catégories subsistent après deux saves',
    records['weightlifting_Back Squat'] === '150' && records['cardio_500m Row'] === '1:35',
    JSON.stringify(records));

  // ── 4.2 non-lus : message d'un co-membre puis lecture ──
  const { data: group } = await svc.from('message_groups').insert({
    box_id: boxId, name: 'ZZ PR3 groupe', members: [owner.id, member.id],
  }).select('id').single();
  const before = new Date().toISOString();
  await svc.from('group_messages').insert({ group_id: group.id, sender_id: owner.id, content: 'coucou' });

  const countUnread = async (client, userId, since) => {
    const { data: groups } = await client.from('message_groups').select('id').eq('box_id', boxId).contains('members', [userId]);
    const ids = (groups ?? []).map(g => g.id);
    if (ids.length === 0) return 0;
    let q = client.from('group_messages').select('id', { count: 'exact', head: true }).in('group_id', ids).neq('sender_id', userId);
    if (since) q = q.gt('created_at', since);
    const { count } = await q;
    return count ?? 0;
  };

  check('4.2 badge à 1 sur un message de co-membre', (await countUnread(member.client, member.id, before)) === 1);
  const seen = new Date().toISOString();
  check('4.2 badge à 0 après ouverture de l’écran', (await countUnread(member.client, member.id, seen)) === 0);
} catch (e) {
  console.error('ERREUR', e?.message ?? e, e?.code ?? '', e?.details ?? '');
  ko++;
} finally {
  await cleanup(created, boxId);
  const { count } = await svc.from('profiles').select('id', { count: 'exact', head: true }).like('username', 'zz_pr3_%');
  check('fixtures purgées', (count ?? 0) === 0, `résidu ${count ?? 0}`);
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
