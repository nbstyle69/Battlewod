// Protocole badge « Nouveautés » à la vraie frontière : vrai utilisateur, vrai
// JWT, vraie RLS, vraie base. Rejoue le comportement AVANT (soustraction de
// totaux) et APRÈS (anti-jointure sur la fenêtre affichable) sur les mêmes
// données, puis publie une vraie annonce et vérifie le compte.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SR) { console.error('URL/ANON/SR requis'); process.exit(1); }

const WINDOW = 50;
const admin = createClient(URL, SR, { auth: { persistSession: false } });
const email = `changelog_proto_${Date.now()}@e2e.local`;
const password = 'Proto!2026abc';

let ok = 0, ko = 0;
const t = (label, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true, user_metadata: { username: `Proto${Date.now() % 100000}` },
});
if (cErr) { console.error('createUser', cErr.message); process.exit(1); }
const uid = created.user.id;
let extraId = null;

try {
  const user = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await user.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error('signIn: ' + sErr.message);
  t('connexion réelle du cobaye', true, uid);

  // ancien compteur : total(table) − lignes lues
  const badgeAvant = async () => {
    const [{ count: total }, { count: read }] = await Promise.all([
      user.from('app_changelog').select('id', { count: 'exact', head: true }),
      user.from('changelog_reads').select('changelog_id', { count: 'exact', head: true }).eq('user_id', uid),
    ]);
    return Math.max(0, (total ?? 0) - (read ?? 0));
  };

  // nouveau compteur : anti-jointure sur la fenêtre affichable
  const badgeApres = async () => {
    const { data: win } = await user.from('app_changelog')
      .select('id').order('created_at', { ascending: false }).limit(WINDOW);
    const ids = (win ?? []).map(r => r.id);
    if (ids.length === 0) return 0;
    const { data: read } = await user.from('changelog_reads')
      .select('changelog_id').eq('user_id', uid).in('changelog_id', ids);
    return Math.max(0, ids.length - (read ?? []).length);
  };

  // ce que fait l'écran Nouveautés : marque la fenêtre affichée
  const visiteEcran = async () => {
    const { data: win } = await user.from('app_changelog')
      .select('id').order('created_at', { ascending: false }).limit(WINDOW);
    const rows = (win ?? []).map(c => ({ user_id: uid, changelog_id: c.id }));
    const { error } = await user.from('changelog_reads')
      .upsert(rows, { onConflict: 'user_id,changelog_id' });
    return { error, marked: rows.length };
  };

  const { count: totalEntries } = await admin
    .from('app_changelog').select('id', { count: 'exact', head: true });
  t('base plus grande que la fenêtre de l\'écran (condition du bug)',
    (totalEntries ?? 0) > WINDOW, `${totalEntries} entrées en base, fenêtre ${WINDOW}`);

  t('avant visite : les deux compteurs signalent des nouveautés',
    (await badgeAvant()) > 0 && (await badgeApres()) > 0,
    `avant=${await badgeAvant()} après=${await badgeApres()}`);

  const v = await visiteEcran();
  t('visite de l\'écran : écriture des marqueurs acceptée', !v.error,
    v.error?.message ?? `${v.marked} lignes marquées`);

  const resteAvant = await badgeAvant();
  t('ANCIEN compteur : badge NON nul après visite (la régression)', resteAvant > 0,
    `badge=${resteAvant} → affiché « ${resteAvant > 9 ? '9+' : resteAvant} »`);

  const resteApres = await badgeApres();
  t('NOUVEAU compteur : badge à 0 après visite', resteApres === 0, `badge=${resteApres}`);

  // « force-quit + relance » : le compteur est recalculé en base, donc deux
  // recalculs successifs sont exactement ce que fait une relance.
  const r1 = await badgeApres();
  const r2 = await badgeApres();
  t('relance ×2 : badge toujours 0', r1 === 0 && r2 === 0, `relance1=${r1} relance2=${r2}`);

  // vraie annonce publiée (service_role : seul un super_admin y écrit)
  const { data: ins, error: iErr } = await admin.from('app_changelog')
    .insert({ title: 'Protocole badge', body: 'entrée de test', type: 'update' })
    .select('id').single();
  if (iErr) throw new Error('insert annonce: ' + iErr.message);
  extraId = ins.id;

  const apresPub = await badgeApres();
  t('nouvelle annonce publiée → badge = 1 (le bon compte, pas un résidu)',
    apresPub === 1, `badge=${apresPub}`);

  const v2 = await visiteEcran();
  const apresRelecture = await badgeApres();
  t('nouvelle visite → badge de nouveau 0', !v2.error && apresRelecture === 0,
    `badge=${apresRelecture}`);
} catch (e) {
  t('protocole interrompu', false, e.message);
} finally {
  if (extraId) await admin.from('app_changelog').delete().eq('id', extraId);
  await admin.from('changelog_reads').delete().eq('user_id', uid);
  await admin.auth.admin.deleteUser(uid);
  const { count } = await admin.from('app_changelog').select('id', { count: 'exact', head: true });
  console.log(`\n${ok} ✅ · ${ko} ❌  (cobaye supprimé, ${count} entrées en base — état initial)`);
}
