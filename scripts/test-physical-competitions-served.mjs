#!/usr/bin/env node
/**
 * Suite `phys-served` — une compétition physique passée n'est plus servie ouverte.
 *
 *   TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY / TEST_SUPABASE_SERVICE_ROLE_KEY
 *
 * Sous JWT athlète, via la vue `physical_competitions_served` (celle que lit l'app) :
 *   1. passée + status stocké `open`  → servie `closed`, absente du filtre open/active ;
 *   2. à venir + status `open`        → servie `open`, présente dans le filtre ;
 *   3. la table brute garde `open` sur la passée (la vue recalcule, elle n'écrit pas) ;
 *   4. anon lit la vue (même exposition que la table).
 */
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) { console.error('TEST_SUPABASE_* manquantes'); process.exit(2); }

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
let pass = 0, fail = 0;
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`✅ ${label}${detail ? `\n   · ${detail}` : ''}`); }
  else { fail++; console.log(`❌ ${label}${detail ? `\n   · ${detail}` : ''}`); }
}
const iso = (d) => d.toISOString().slice(0, 10);
const tag = Date.now();
const past = { name: `phys-past-${tag}`, date: iso(new Date(Date.now() - 30 * 86400e3)), status: 'open', mode: 'info', format: 'team' };
const future = { name: `phys-future-${tag}`, date: iso(new Date(Date.now() + 30 * 86400e3)), status: 'open', mode: 'info', format: 'team' };

const created = [];
let userId = null;
try {
  const { data: ins, error: ei } = await admin.from('physical_competitions').insert([past, future]).select('id, name');
  if (ei) throw ei;
  created.push(...ins.map(r => r.id));
  const pastId = ins.find(r => r.name === past.name).id;
  const futureId = ins.find(r => r.name === future.name).id;

  const email = `phys-${tag}@test.local`, password = 'Test1234!';
  const { data: u, error: eu } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: `phys_${tag % 100000}`, level: 'scaled' } });
  if (eu) throw eu;
  userId = u.user.id;
  const athlete = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: es } = await athlete.auth.signInWithPassword({ email, password });
  if (es) throw es;

  const { data: served, error: e1 } = await athlete.from('physical_competitions_served').select('id, status').in('id', [pastId, futureId]);
  if (e1) throw e1;
  const sPast = served.find(r => r.id === pastId)?.status;
  const sFuture = served.find(r => r.id === futureId)?.status;
  check('passée (status stocké open) → servie closed', sPast === 'closed', `status servi = ${sPast}`);
  check('à venir (status open) → servie open', sFuture === 'open', `status servi = ${sFuture}`);

  const { data: openList, error: e2 } = await athlete.from('physical_competitions_served').select('id').in('status', ['open', 'active']).in('id', [pastId, futureId]);
  if (e2) throw e2;
  const openIds = openList.map(r => r.id);
  check('filtre open/active (HomeScreen) : à venir listée, passée absente', openIds.includes(futureId) && !openIds.includes(pastId), JSON.stringify(openIds.map(i => i === pastId ? 'passée' : 'à venir')));

  const { data: raw } = await admin.from('physical_competitions').select('status').eq('id', pastId).single();
  check('table brute inchangée : la passée reste open (la vue recalcule, n’écrit pas)', raw?.status === 'open', raw?.status);

  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: a, error: ea } = await anon.from('physical_competitions_served').select('id, status').eq('id', pastId);
  check('anon lit la vue (même exposition que la table), passée closed', !ea && a?.[0]?.status === 'closed', ea?.message ?? a?.[0]?.status);
} catch (e) {
  fail++; console.log(`❌ exception : ${e.message}`);
} finally {
  if (created.length) await admin.from('physical_competitions').delete().in('id', created);
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}
console.log(`\nPHYS_SERVED_ASSERTIONS=${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
