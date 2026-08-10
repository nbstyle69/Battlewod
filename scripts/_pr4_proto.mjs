// Protocole PR 4 (observabilité des lectures) sur la pile de test jetable.
// Prouve que readRows remonte un refus RLS que l'ancien code avalait :
// - lecture autorisée  → données rendues, RIEN dans Sentry
// - lecture refusée    → mêmes 0 ligne à l'écran, MAIS captureError appelé
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.TEST_SUPABASE_DB_URL ?? 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres';
if (!URL || !ANON || !SERVICE) { console.error('Variables TEST_SUPABASE_* manquantes'); process.exit(1); }
if (URL.includes('lkwdlqlbrbxaiydkoxfp')) { console.error('❌ Cible = PRODUCTION — refusé'); process.exit(1); }

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const sql = (q) => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -f -`, { input: q, stdio: 'pipe' }).toString();

let ok = 0, ko = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

// Réplique exacte de src/lib/db.ts (le bundle RN n'est pas exécutable ici).
const captured = [];
async function readRows(query, ctx) {
  const { data, error } = await query;
  if (error) captured.push({ error, ctx });
  return data ?? null;
}

const stamp = Date.now();
const email = `zz_pr4_${stamp}@test.athlex.io`;
let userId = null, boxId = null, revoked = false;

try {
  const { data: created, error: userError } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (userError) throw userError;
  userId = created.user.id;
  await svc.from('profiles').upsert({ id: userId, email, username: `zz_pr4_${stamp}`, level: 'inter', role: 'member', elo: 1000 });

  const { data: box, error: boxError } = await svc.from('boxes').insert({
    owner_id: userId, name: `ZZ PR4 ${stamp}`, slug: `zz-pr4-${stamp}`,
    invite_code: `Z4${String(stamp).slice(-6)}`, is_active: true, is_listed: true,
  }).select('id').single();
  if (boxError) throw boxError;
  boxId = box.id;
  await svc.from('box_members').insert({ box_id: boxId, member_id: userId, role: 'owner', status: 'active' });

  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (signInError) throw signInError;

  const listMembers = () => readRows(
    client.from('box_members').select('member_id, profiles:member_id(username)').eq('box_id', boxId).eq('status', 'active'),
    { screen: 'BOSchedule', action: 'loadBoxMembers' },
  );

  const before = await listMembers();
  check('lecture autorisée : données rendues', (before ?? []).length === 1, `${(before ?? []).length} membre(s)`);
  check('lecture autorisée : rien remonté à Sentry', captured.length === 0);

  // Refus RLS réel : on retire le SELECT de table à `authenticated`. Un REVOKE
  // par colonne serait sans effet tant que le grant de table subsiste.
  sql(`REVOKE SELECT ON TABLE public.box_members FROM authenticated;`);
  revoked = true;

  const after = await listMembers();
  check('lecture refusée : écran toujours à 0 ligne (comportement inchangé)', (after ?? []).length === 0);
  check('lecture refusée : erreur remontée à Sentry', captured.length === 1,
    captured[0] ? `${captured[0].error.code} ${captured[0].ctx.screen}/${captured[0].ctx.action}` : 'aucune');
  check('lecture refusée : code 42501 (insufficient_privilege)', captured[0]?.error?.code === '42501');
} catch (e) {
  check('protocole', false, e.message);
} finally {
  if (revoked) sql(`GRANT SELECT ON TABLE public.box_members TO authenticated;`);
  if (boxId) await svc.from('boxes').delete().eq('id', boxId);
  if (userId) await svc.auth.admin.deleteUser(userId);
  const { count } = await svc.from('profiles').select('id', { count: 'exact', head: true }).like('username', 'zz_pr4_%');
  check('fixtures purgées', (count ?? 0) === 0, `résidu ${count ?? 0}`);
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
