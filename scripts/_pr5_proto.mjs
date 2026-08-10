// Protocole PR 5 (compte) sur la pile de test jetable — jamais la prod.
// 3.5 genre : UPDATE profiles SET gender doit passer sur soi, échouer sur autrui.
// 3E  mdp   : ré-auth avec le mdp actuel, changement, reconnexion, ancien refusé.
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
const PWD = 'Test1234!';
const NEW_PWD = 'Test5678!';
const created = [];

const mkUser = async (suffix, password = PWD) => {
  const email = `zz_pr5_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_pr5_${suffix}_${stamp}`, level: 'inter', role: 'member', elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return { id: data.user.id, email, client };
};

try {
  const me = await mkUser('me');
  const other = await mkUser('other');

  // ── 3.5 genre ─────────────────────────────────────────────────────────
  const { data: mine, error: mineErr } = await me.client
    .from('profiles').update({ gender: 'female' }).eq('id', me.id).select('gender');
  check('genre : update sur soi accepté', !mineErr && mine?.[0]?.gender === 'female', mineErr?.message ?? 'female');

  const { data: nulled } = await me.client
    .from('profiles').update({ gender: null }).eq('id', me.id).select('gender');
  check('genre : remise à NULL acceptée', nulled?.[0]?.gender === null);

  const { data: theirs, error: theirsErr } = await me.client
    .from('profiles').update({ gender: 'male' }).eq('id', other.id).select('gender');
  const { data: check2 } = await svc.from('profiles').select('gender').eq('id', other.id).single();
  check('genre : update sur un autre id sans effet',
    (theirs ?? []).length === 0 && check2.gender === null,
    theirsErr ? theirsErr.code : `${(theirs ?? []).length} ligne(s)`);

  // ── 3E mot de passe ───────────────────────────────────────────────────
  const app = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess } = await app.auth.signInWithPassword({ email: me.email, password: PWD });
  const uidBefore = sess.user.id;

  const { error: wrongErr } = await app.auth.signInWithPassword({ email: me.email, password: 'MauvaisMdp!' });
  check('mdp : ré-auth avec un mauvais mot de passe refusée', !!wrongErr, wrongErr?.message);

  const { data: reauth, error: reauthErr } = await app.auth.signInWithPassword({ email: me.email, password: PWD });
  check('mdp : ré-auth rend une session pour le MÊME user (fetchProfile inchangé)',
    !reauthErr && reauth.user.id === uidBefore);

  const { error: updErr } = await app.auth.updateUser({ password: NEW_PWD });
  check('mdp : changement accepté', !updErr, updErr?.message);

  const fresh = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: newLogin, error: newErr } = await fresh.auth.signInWithPassword({ email: me.email, password: NEW_PWD });
  check('mdp : reconnexion avec le nouveau mot de passe', !newErr && newLogin.user.id === uidBefore, newErr?.message);

  const stale = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: oldErr } = await stale.auth.signInWithPassword({ email: me.email, password: PWD });
  check('mdp : ancien mot de passe refusé', !!oldErr, oldErr?.message);

  // Le profil reste lisible après le changement (pas de session cassée).
  const { data: after, error: afterErr } = await app.from('profiles').select('id, username').eq('id', me.id).single();
  check('mdp : profil toujours lisible avec la session courante', !afterErr && after.id === me.id, afterErr?.message);
} catch (e) {
  check('protocole', false, e.message);
} finally {
  for (const id of created) await svc.auth.admin.deleteUser(id);
  const { count } = await svc.from('profiles').select('id', { count: 'exact', head: true }).like('username', 'zz_pr5_%');
  check('fixtures purgées', (count ?? 0) === 0, `résidu ${count ?? 0}`);
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
