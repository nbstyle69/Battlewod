#!/usr/bin/env node
/**
 * Suite `onboarding` — « présentation vue » côté compte.
 *
 *   TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY / TEST_SUPABASE_SERVICE_ROLE_KEY
 *
 * Preuves sous vraie identité (JWT athlète) :
 *   1. compte neuf : get_my_profile rend onboarding_completed_at NULL ;
 *   2. mark_onboarding_completed → horodatage, relu par get_my_profile ;
 *   3. idempotence : second appel rend le MÊME horodatage (premier conservé) ;
 *   4. un autre compte n'est pas touché (reste NULL) ;
 *   5. anon → `permission denied for function` (grant révoqué) ;
 *   6. un client ne peut pas écrire la colonne d'un autre profil (0 ligne).
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

async function newUser(tag) {
  const email = `onb-${tag}-${Date.now()}@test.local`;
  const password = 'Test1234!';
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: `onb_${tag}_${Date.now() % 100000}`, level: 'scaled' },
  });
  if (error) throw error;
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, client };
}
async function myProfile(client) {
  const { data, error } = await client.rpc('get_my_profile');
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

const created = [];
try {
  const alice = await newUser('alice'); created.push(alice.id);
  const bob = await newUser('bob'); created.push(bob.id);

  const p0 = await myProfile(alice.client);
  check('compte neuf : onboarding_completed_at NULL (relu par get_my_profile)', 'onboarding_completed_at' in p0 && p0.onboarding_completed_at === null, JSON.stringify(p0.onboarding_completed_at));

  const { data: t1, error: e1 } = await alice.client.rpc('mark_onboarding_completed');
  check('mark_onboarding_completed rend un horodatage', !e1 && typeof t1 === 'string', e1?.message ?? t1);
  const p1 = await myProfile(alice.client);
  check('get_my_profile relit le même horodatage', p1.onboarding_completed_at && new Date(p1.onboarding_completed_at).getTime() === new Date(t1).getTime(), p1.onboarding_completed_at);

  await new Promise(r => setTimeout(r, 1100));
  const { data: t2 } = await alice.client.rpc('mark_onboarding_completed');
  check('idempotence : second appel conserve le premier horodatage', new Date(t2).getTime() === new Date(t1).getTime(), `${t1} → ${t2}`);

  const pb = await myProfile(bob.client);
  check('autre compte intact (NULL)', pb.onboarding_completed_at === null, JSON.stringify(pb.onboarding_completed_at));

  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: ea } = await anon.rpc('mark_onboarding_completed');
  check('anon refusé : permission denied for function', !!ea && /permission denied for function/.test(ea.message), ea?.message ?? 'aucune erreur');

  const { data: upd, error: eu } = await bob.client.from('profiles')
    .update({ onboarding_completed_at: '2020-01-01T00:00:00Z' }).eq('id', alice.id).select('id');
  const pa = await myProfile(alice.client);
  check('bob ne peut pas écrire la colonne d’alice (0 ligne ou refus), alice inchangée',
    (eu || (upd ?? []).length === 0) && new Date(pa.onboarding_completed_at).getTime() === new Date(t1).getTime(),
    eu?.message ?? `${(upd ?? []).length} ligne(s)`);
} catch (e) {
  fail++; console.log(`❌ exception : ${e.message}`);
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
}
console.log(`\nONBOARDING_ASSERTIONS=${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
