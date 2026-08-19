/**
 * Lot 0-bis — contrôle d'après-coupe, au vrai JWT contre la prod.
 *
 * La partie 2 (REVOKE des 3 colonnes) est appliquée : on vérifie que la
 * fermeture est réelle côté PostgREST (pas seulement dans le catalogue, qui
 * mentait déjà une fois), que « soi » et le staff lisent toujours par RPC, et
 * que les classements ne perdent aucun athlète.
 *
 * Décor préfixé zz_ dans la base de prod, supprimé en fin de course.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SVC) throw new Error('EXPO_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY requis');

const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const stamp = Date.now();
const results = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${label} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
}

async function makeUser(tag) {
  const email = `zz_l0b2_${tag}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_l0b2_${tag}_${stamp}`, level: 'inter', role: 'member',
    elo: 1000, full_name: `ZZ ${tag} Civil`, gender: 'male',
    personal_records: { back_squat_Back_Squat: '180' },
  });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  return { id: data.user.id, client };
}

const ids = [];
try {
  const athlete = await makeUser('athlete'); ids.push(athlete.id);
  const other = await makeUser('inconnu'); ids.push(other.id);

  console.log('\n── Les 3 colonnes sont fermées, au vrai JWT ────────────────────');
  for (const col of ['full_name', 'gender', 'personal_records']) {
    const r = await athlete.client.from('profiles').select(col).eq('id', other.id);
    check(`${col} d'un inconnu`, r.error?.code ?? 'LU', '42501');
    const own = await athlete.client.from('profiles').select(col).eq('id', athlete.id);
    check(`${col} sur SA PROPRE ligne (le grant ne connaît pas les lignes)`, own.error?.code ?? 'LU', '42501');
  }

  console.log('\n── « Soi » lit tout par la RPC ─────────────────────────────────');
  const mine = await athlete.client.rpc('get_my_profile');
  const me = (Array.isArray(mine.data) ? mine.data[0] : mine.data) ?? null;
  check('get_my_profile répond', mine.error?.code ?? 'OK', 'OK');
  check('son nom civil', me?.full_name, `ZZ athlete Civil`);
  check('son genre', me?.gender, 'male');
  check('ses records', !!me?.personal_records?.back_squat_Back_Squat, true);
  check('son e-mail', me?.email, `zz_l0b2_athlete_${stamp}@test.athlex.io`);

  console.log('\n── Les classements ne perdent personne ─────────────────────────');
  const pub = await athlete.client.from('profiles')
    .select('id, username, avatar_url, level, elo, wins, total_matches, bio')
    .order('elo', { ascending: false });
  check('lecture publique du classement', pub.error?.code ?? 'OK', 'OK');
  const total = await svc.from('profiles').select('id', { count: 'exact', head: true });
  check('aucune ligne perdue (athlète vs service_role)', pub.data?.length, total.count);
  check('pseudo présent', typeof pub.data?.[0]?.username === 'string', true);
  check('ELO présent', typeof pub.data?.[0]?.elo === 'number', true);

  console.log('\n── Contrôle négatif de la sonde ────────────────────────────────');
  // La sonde doit savoir distinguer : une valeur fausse ne doit PAS passer.
  check('la sonde rejette un décompte faux', pub.data?.length === total.count + 1, false);
  check('la sonde rejette un code d\'erreur faux', (pub.error?.code ?? 'OK') === '42501', false);
} finally {
  for (const id of ids) {
    await svc.from('profiles').delete().eq('id', id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }
  const rest = await svc.from('profiles').select('id').like('username', 'zz_l0b2_%');
  console.log(`\nnettoyage : ${rest.data?.length ?? 0} ligne(s) zz_l0b2_ restante(s)`);
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok} ✅ · ${results.length - ok} ❌`);
  if (ok !== results.length) process.exitCode = 1;
}
