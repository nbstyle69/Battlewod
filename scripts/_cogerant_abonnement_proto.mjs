/**
 * Le co-gérant lit l'abonnement de sa box, et ne le modifie pas.
 *
 * Trois sens, au vrai JWT contre la prod : co-gérant passant en lecture, coach
 * refusé en lecture, et mutation refusée à tout le monde sauf aux routes serveur
 * (service_role). Contrôle positif : le gérant réel lit toujours — sans lui, une
 * policy qui refuse tout passerait pour un succès.
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
  const email = `zz_cog_${tag}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_cog_${tag}_${stamp}`, level: 'inter', role: 'member', elo: 1000,
  });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  return { id: data.user.id, client };
}

const users = [];
const memberships = [];
try {
  const { data: box } = await svc.from('boxes').select('id,name,owner_id').eq('name', 'Crossfit NBS2').single();
  const { data: sub } = await svc.from('box_subscriptions').select('id,status,plan_tier').eq('box_id', box.id).single();
  console.log(`box ${box.name} — abonnement ${sub.plan_tier}/${sub.status}\n`);

  const coOwner = await makeUser('cogerant'); users.push(coOwner.id);
  const coach = await makeUser('coach'); users.push(coach.id);
  const member = await makeUser('adherent'); users.push(member.id);

  for (const [u, role] of [[coOwner, 'owner'], [coach, 'coach'], [member, 'member']]) {
    const { data } = await svc.from('box_members')
      .insert({ box_id: box.id, member_id: u.id, role, status: 'active' }).select('id').single();
    memberships.push(data.id);
  }

  // — Le gérant réel : contrôle positif
  const ownerCli = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: ownerLink } = await svc.auth.admin.generateLink({
    type: 'magiclink', email: (await svc.auth.admin.getUserById(box.owner_id)).data.user.email,
  });
  await ownerCli.auth.verifyOtp({ type: 'magiclink', token_hash: ownerLink.properties.hashed_token });

  console.log('── Lecture ─────────────────────────────────────────────────────');
  const asOwner = await ownerCli.from('box_subscriptions').select('id,status').eq('box_id', box.id);
  check('gérant réel lit son abonnement (contrôle positif)', asOwner.data?.length ?? 0, 1);

  const asCo = await coOwner.client.from('box_subscriptions').select('id,status').eq('box_id', box.id);
  check('co-gérant lit l’abonnement de sa box', asCo.data?.length ?? 0, 1);
  check('co-gérant lit le bon statut', asCo.data?.[0]?.status, sub.status);

  const asCoach = await coach.client.from('box_subscriptions').select('id,status').eq('box_id', box.id);
  check('coach ne lit pas l’abonnement', asCoach.data?.length ?? 0, 0);

  const asMember = await member.client.from('box_subscriptions').select('id,status').eq('box_id', box.id);
  check('adhérent ne lit pas l’abonnement', asMember.data?.length ?? 0, 0);

  const anonCli = createClient(URL, ANON, { auth: { persistSession: false } });
  const asAnon = await anonCli.from('box_subscriptions').select('id,status').eq('box_id', box.id);
  check('anon refusé sur la table (grant retiré)', asAnon.error?.code ?? `LU ${asAnon.data?.length}`, '42501');

  console.log('\n── Mutation : personne, sauf les routes serveur ────────────────');
  // Le privilège de colonne est retiré : l'écriture échoue avant la policy, donc
  // « zéro ligne touchée » ne peut pas se faire passer pour un succès (§9).
  const coUpd = await coOwner.client.from('box_subscriptions')
    .update({ status: 'active', plan_tier: 'multi' }).eq('box_id', box.id);
  check('co-gérant ne modifie pas l’abonnement', coUpd.error?.code ?? 'ÉCRIT', '42501');

  const ownerUpd = await ownerCli.from('box_subscriptions')
    .update({ status: 'active' }).eq('box_id', box.id);
  check('le gérant lui-même ne modifie pas en direct (routes serveur uniquement)', ownerUpd.error?.code ?? 'ÉCRIT', '42501');

  const coIns = await coOwner.client.from('box_subscriptions')
    .insert({ box_id: box.id, plan_tier: 'multi', status: 'active' }).select('id');
  check('co-gérant ne s’invente pas un abonnement', coIns.error?.code ?? 'ÉCRIT', '42501');

  const { data: intact } = await svc.from('box_subscriptions').select('status,plan_tier').eq('id', sub.id).single();
  check('relecture : l’abonnement est inchangé', intact, { status: sub.status, plan_tier: sub.plan_tier });

  console.log('\n── Contrôle négatif de la sonde ────────────────────────────────');
  const bogus = JSON.stringify(asCoach.data?.length ?? 0) === JSON.stringify(1);
  check('la sonde rejette un décompte faux', bogus, false);
} finally {
  for (const id of memberships) await svc.from('box_members').delete().eq('id', id);
  for (const id of users) await svc.auth.admin.deleteUser(id).catch(() => {});
  for (const id of users) await svc.from('profiles').delete().eq('id', id);
  const { count } = await svc.from('profiles').select('id', { count: 'exact', head: true }).like('username', 'zz_cog_%');
  console.log(`\nnettoyage : ${count ?? 0} profil(s) zz_cog_ restant(s)`);
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok} ✅ · ${results.length - ok} ❌`);
  process.exit(results.length === ok ? 0 : 1);
}
