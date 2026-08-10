// Protocole « activation automatique des tournois » (20261015) — pile jetable.
//
// Couvre les cinq contre-vérifications demandées :
//   1. piège 5.1 : anon/authenticated sans EXECUTE sur les 2 fonctions ;
//   2. chemin trigger : WOD passé actif (opens_at NULL) → tournoi actif ;
//   3. chemin cron : WOD programmé, activation par le balayage ;
//   4. non-régression : tournoi sans WOD visible immobile, `completed` figé ;
//   5. frontière RLS : soumission d'un score sur un WOD `closed`.
//
// Le SQL passe par psql (TEST_DB_URL) : les fonctions ciblées ne sont pas
// exposées à PostgREST, et c'est justement ce qu'on vérifie.
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
const sql = q => execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf-8' }).trim();

let ok = 0, ko = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

const stamp = Date.now();
const created = { users: [], boxId: null };

const mkUser = async suffix => {
  const email = `zz_act_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_act_${suffix}_${stamp}`,
    level: 'inter', role: 'member', elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, client };
};

const mkTournament = async (name, status, boxId, ownerId) => {
  const { data, error } = await svc.from('tournaments').insert({
    name: `ZZ ${name} ${stamp}`, level: 'rx', status, box_id: boxId,
    created_by: ownerId, format: 'simple', max_participants: 16,
  }).select('id').single();
  if (error) throw error;
  return data.id;
};

const mkWod = async (tournamentId, { status = 'pending', opens_at = null, title = 'WOD' } = {}) => {
  const { data, error } = await svc.from('tournament_wods').insert({
    tournament_id: tournamentId, title: `${title} ${stamp}`, type: 'For Time',
    duration_minutes: 12, status, opens_at,
  }).select('id').single();
  if (error) throw error;
  return data.id;
};

const statusOf = async id => (await svc.from('tournaments').select('status').eq('id', id).single()).data?.status;
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  // ── 1. Piège 5.1 : aucun EXECUTE pour anon/authenticated/PUBLIC ───────────
  const acl = sql(`
    SELECT coalesce(string_agg(p.proname||'|'||coalesce(pg_get_userbyid(a.grantee),'PUBLIC')||'|'||a.privilege_type, ','), 'aucun')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) a
     WHERE n.nspname='public'
       AND p.proname IN ('sync_tournament_activation','trg_tournament_wod_activation')
       AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon','authenticated'))`);
  check('5.1 — aucun EXECUTE anon/authenticated/PUBLIC sur les 2 fonctions', acl === 'aucun', acl);

  const svcGrant = sql(`
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) a
     WHERE n.nspname='public' AND p.proname='sync_tournament_activation'
       AND pg_get_userbyid(a.grantee)='service_role' AND a.privilege_type='EXECUTE'`);
  check('5.1 — service_role garde EXECUTE sur le balayage', svcGrant === '1');

  // Appel réel à la frontière PostgREST avec un JWT athlète : doit être refusé.
  const probe = await mkUser('probe');
  const { error: rpcErr } = await probe.client.rpc('sync_tournament_activation');
  check('5.1 — RPC refusée avec un JWT authenticated', !!rpcErr, rpcErr?.message ?? 'ACCEPTÉE (!)');

  const owner = await mkUser('owner');
  const athlete = await mkUser('athlete');
  const { data: box, error: boxErr } = await svc.from('boxes').insert({
    owner_id: owner.id, name: `ZZ ACT ${stamp}`, slug: `zz-act-${stamp}`,
    invite_code: `ZA${String(stamp).slice(-6)}`, is_active: true, is_listed: true,
  }).select('id').single();
  if (boxErr) throw boxErr;
  created.boxId = box.id;
  await svc.from('box_members').insert([
    { box_id: box.id, member_id: owner.id, role: 'owner', status: 'active' },
    { box_id: box.id, member_id: athlete.id, role: 'member', status: 'active' },
  ]);

  // ── 2. Chemin trigger ─────────────────────────────────────────────────────
  const tTrig = await mkTournament('trigger', 'open', box.id, owner.id);
  const wTrig = await mkWod(tTrig, { status: 'pending', title: 'Trigger' });
  check('trigger — tournoi encore « open » avec un WOD pending', await statusOf(tTrig) === 'open');
  const { error: upErr } = await svc.from('tournament_wods').update({ status: 'active', opens_at: null }).eq('id', wTrig);
  if (upErr) throw upErr;
  check('trigger — WOD actif (opens_at NULL) ⇒ tournoi « active » instantanément',
    await statusOf(tTrig) === 'active');

  // Insertion directe d'un WOD déjà actif (autre chemin du trigger).
  const tTrigIns = await mkTournament('trigger-insert', 'open', box.id, owner.id);
  await mkWod(tTrigIns, { status: 'active', title: 'TriggerInsert' });
  check('trigger — INSERT d\'un WOD déjà actif ⇒ tournoi « active »',
    await statusOf(tTrigIns) === 'active');

  // ── 3. Chemin cron ────────────────────────────────────────────────────────
  const job = sql(`SELECT coalesce(string_agg(schedule||' :: '||command, ' | '), 'absent') FROM cron.job WHERE jobname='tournament_activation_sweep'`);
  check('cron — job « tournament_activation_sweep » planifié */15', job.startsWith('*/15 * * * *'), job);

  const tCron = await mkTournament('cron', 'open', box.id, owner.id);
  const wCron = await mkWod(tCron, { status: 'active', opens_at: new Date(Date.now() + 75_000).toISOString(), title: 'Cron' });
  check('cron — WOD actif mais programmé : tournoi encore « open »', await statusOf(tCron) === 'open');

  // On ne peut pas attendre 15 min : on clone le job à la minute pour prouver
  // que pg_cron exécute réellement la fonction (mêmes droits, même commande).
  sql(`SELECT cron.schedule('zz_activation_sweep_test_${stamp}', '* * * * *', $c$ SELECT public.sync_tournament_activation(); $c$)`);
  let flipped = false;
  for (let i = 0; i < 22 && !flipped; i++) {
    await sleep(10_000);
    flipped = (await statusOf(tCron)) === 'active';
  }
  const runs = sql(`SELECT coalesce(string_agg(status, ','), 'aucune exécution') FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid WHERE j.jobname='zz_activation_sweep_test_${stamp}'`);
  check('cron — balayage pg_cron ⇒ tournoi « active » une fois opens_at passé', flipped, `exécutions: ${runs}`);
  sql(`SELECT cron.unschedule('zz_activation_sweep_test_${stamp}')`);
  check('cron — WOD toujours actif et visible après balayage',
    (await svc.from('tournament_wods').select('status').eq('id', wCron).single()).data?.status === 'active');

  // ── 4. Non-régression ─────────────────────────────────────────────────────
  const tNoWod = await mkTournament('sans-wod', 'open', box.id, owner.id);
  const tPending = await mkTournament('wod-pending', 'open', box.id, owner.id);
  await mkWod(tPending, { status: 'pending', title: 'Pending' });
  const tFuture = await mkTournament('wod-futur', 'open', box.id, owner.id);
  await mkWod(tFuture, { status: 'active', opens_at: new Date(Date.now() + 86_400_000).toISOString(), title: 'Futur' });
  const tDone = await mkTournament('completed', 'completed', box.id, owner.id);
  await mkWod(tDone, { status: 'active', title: 'Done' });

  const swept = sql('SELECT public.sync_tournament_activation()');
  console.log(`   (balayage manuel : ${swept} ligne(s) activée(s))`);
  check('non-régression — tournoi sans WOD reste « open »', await statusOf(tNoWod) === 'open');
  check('non-régression — WOD pending ne déclenche rien', await statusOf(tPending) === 'open');
  check('non-régression — WOD programmé au lendemain ne déclenche rien', await statusOf(tFuture) === 'open');
  check('non-régression — tournoi « completed » jamais réactivé', await statusOf(tDone) === 'completed');

  const idem = sql('SELECT public.sync_tournament_activation()');
  check('idempotence — second balayage n\'active plus rien', idem === '0', `${idem} ligne(s)`);

  // ── 5. Frontière RLS : score sur un WOD « closed » ────────────────────────
  const tClose = await mkTournament('closed-wod', 'active', box.id, owner.id);
  const wClose = await mkWod(tClose, { status: 'closed', title: 'Closed' });
  await svc.from('tournament_participants').insert({ tournament_id: tClose, athlete_id: athlete.id });
  const { error: insErr } = await athlete.client.from('tournament_scores').insert({
    tournament_id: tClose, tournament_wod_id: wClose, athlete_id: athlete.id,
    score_value: '300', status: 'pending',
  });
  const { count: nClosed } = await svc.from('tournament_scores')
    .select('id', { count: 'exact', head: true }).eq('tournament_wod_id', wClose);
  check('frontière — INSERT de score sur un WOD « closed » REFUSÉ côté serveur',
    !!insErr && nClosed === 0,
    insErr ? insErr.message : `ACCEPTÉ (${nClosed} ligne écrite) — « figé » n'est pas vrai à la frontière`);

  // Contrôle : sur un WOD actif du même tournoi, la soumission passe (sinon le
  // refus ci-dessus prouverait juste que le décor est cassé).
  const wOpen = await mkWod(tClose, { status: 'active', title: 'Open' });
  const { error: okErr } = await athlete.client.from('tournament_scores').insert({
    tournament_id: tClose, tournament_wod_id: wOpen, athlete_id: athlete.id,
    score_value: '300', status: 'pending',
  });
  check('frontière — témoin : soumission acceptée sur un WOD actif', !okErr, okErr?.message ?? '');
} finally {
  // Purge : tournois → box → comptes (FK boxes.owner_id en NO ACTION).
  if (created.boxId) {
    await svc.from('tournaments').delete().eq('box_id', created.boxId);
    for (const t of ['wod_scores', 'score_comments', 'message_replies']) {
      await svc.from(t).delete().eq('box_id', created.boxId);
    }
    await svc.from('box_members').delete().eq('box_id', created.boxId);
    await svc.from('boxes').delete().eq('id', created.boxId);
  }
  for (const id of created.users) await svc.auth.admin.deleteUser(id).catch(() => {});
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
