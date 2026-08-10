// Protocole « garde WOD fermé » (20261016) — pile jetable, vrais JWT.
//
// Deux sens à prouver :
//   • ce qui doit continuer de passer : athlète sur WOD ouvert (insert + update
//     de son score pending), et surtout l'organisateur pendant la fenêtre
//     « En révision » (valider / rejeter / corriger APRÈS fermeture des WOD) ;
//   • ce qui doit désormais échouer : athlète sur WOD closed, sur WOD non
//     encore révélé (opens_at futur) et sur WOD dont closes_at est passé.
//
// Le chemin de validation testé est celui de TheHub : UPDATE direct sur
// tournament_scores avec le JWT de l'owner (ScoresClient.updateStatus), pas un
// RPC ni le service_role.
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

const mkUser = async (suffix, role = 'member') => {
  const email = `zz_grd_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_grd_${suffix}_${stamp}`,
    level: 'inter', role, elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, client };
};

const mkWod = async (tournamentId, opts) => {
  const { data, error } = await svc.from('tournament_wods').insert({
    tournament_id: tournamentId, title: `${opts.title} ${stamp}`, type: 'For Time',
    duration_minutes: 12, status: opts.status, opens_at: opts.opens_at ?? null,
    closes_at: opts.closes_at ?? null,
  }).select('id').single();
  if (error) throw error;
  return data.id;
};

const submit = (client, athleteId, tournamentId, wodId, value = '300') =>
  client.from('tournament_scores').insert({
    tournament_id: tournamentId, tournament_wod_id: wodId, athlete_id: athleteId,
    score_value: value, status: 'pending',
  });

const rowCount = async wodId =>
  (await svc.from('tournament_scores').select('id', { count: 'exact', head: true }).eq('tournament_wod_id', wodId)).count;

try {
  // ── Décor : une box, son owner, un athlète, et un owner d'une AUTRE box ───
  const owner = await mkUser('owner', 'box_owner');
  const athlete = await mkUser('athlete');
  const { data: box, error: boxErr } = await svc.from('boxes').insert({
    owner_id: owner.id, name: `ZZ GRD ${stamp}`, slug: `zz-grd-${stamp}`,
    invite_code: `ZG${String(stamp).slice(-6)}`, is_active: true, is_listed: true,
  }).select('id').single();
  if (boxErr) throw boxErr;
  created.boxId = box.id;
  await svc.from('box_members').insert([
    { box_id: box.id, member_id: owner.id, role: 'owner', status: 'active' },
    { box_id: box.id, member_id: athlete.id, role: 'member', status: 'active' },
  ]);

  const { data: t, error: tErr } = await svc.from('tournaments').insert({
    name: `ZZ GARDE ${stamp}`, level: 'rx', status: 'active', box_id: box.id,
    created_by: owner.id, format: 'simple', max_participants: 16,
  }).select('id').single();
  if (tErr) throw tErr;
  await svc.from('tournament_participants').insert({ tournament_id: t.id, athlete_id: athlete.id });

  // Le trigger 20261015 pourrait rebasculer le tournoi ; on part de 'active'.
  const wOpen = await mkWod(t.id, { status: 'active', title: 'Ouvert' });
  const wClosed = await mkWod(t.id, { status: 'closed', title: 'Ferme' });
  const wFuture = await mkWod(t.id, { status: 'active', title: 'NonRevele', opens_at: new Date(Date.now() + 86_400_000).toISOString() });
  const wExpired = await mkWod(t.id, { status: 'active', title: 'Expire', closes_at: new Date(Date.now() - 3_600_000).toISOString() });
  const wPending = await mkWod(t.id, { status: 'pending', title: 'EnAttente' });

  // ── Piège des policies permissives : l'inventaire doit rester à 1+1 ───────
  const pols = sql(`SELECT coalesce(string_agg(policyname||':'||cmd, ', ' ORDER BY policyname), 'aucune')
                      FROM pg_policies WHERE tablename='tournament_scores' AND cmd IN ('INSERT','UPDATE')`);
  check('inventaire — une seule policy INSERT et une seule UPDATE (rien à OR-combiner)',
    pols === 'tournament_scores_owner_insert:INSERT, tournament_scores_owner_update_pending:UPDATE', pols);

  // ── Sens 1 : ce qui doit continuer de passer ──────────────────────────────
  const { error: e1 } = await submit(athlete.client, athlete.id, t.id, wOpen);
  check('athlète — INSERT sur un WOD actif et révélé : accepté', !e1, e1?.message ?? '');

  const { data: mine } = await svc.from('tournament_scores').select('id').eq('tournament_wod_id', wOpen).single();
  const { data: upd, error: e2 } = await athlete.client.from('tournament_scores')
    .update({ score_value: '280' }).eq('id', mine.id).select('id');
  check('athlète — UPDATE de son score pending sur un WOD ouvert : accepté',
    !e2 && (upd?.length ?? 0) === 1, e2?.message ?? `${upd?.length ?? 0} ligne(s)`);

  // ── Sens 2 : ce qui doit désormais échouer ────────────────────────────────
  const { error: e3 } = await submit(athlete.client, athlete.id, t.id, wClosed);
  check('athlète — INSERT sur un WOD closed : REFUSÉ',
    !!e3 && (await rowCount(wClosed)) === 0, e3?.message ?? 'accepté (!)');

  const { error: e4 } = await submit(athlete.client, athlete.id, t.id, wFuture);
  check('athlète — INSERT sur un WOD non révélé (opens_at futur) : REFUSÉ',
    !!e4 && (await rowCount(wFuture)) === 0, e4?.message ?? 'accepté (!)');

  const { error: e5 } = await submit(athlete.client, athlete.id, t.id, wExpired);
  check('athlète — INSERT sur un WOD dont closes_at est passé : REFUSÉ',
    !!e5 && (await rowCount(wExpired)) === 0, e5?.message ?? 'accepté (!)');

  const { error: e6 } = await submit(athlete.client, athlete.id, t.id, wPending);
  check('athlète — INSERT sur un WOD pending : REFUSÉ',
    !!e6 && (await rowCount(wPending)) === 0, e6?.message ?? 'accepté (!)');

  // Incohérence WOD/tournoi : le score prétend appartenir à un autre tournoi.
  const { data: t2 } = await svc.from('tournaments').insert({
    name: `ZZ GARDE ALT ${stamp}`, level: 'rx', status: 'active', box_id: box.id,
    created_by: owner.id, format: 'simple', max_participants: 16,
  }).select('id').single();
  const { error: e7 } = await athlete.client.from('tournament_scores').insert({
    tournament_id: t2.id, tournament_wod_id: wOpen, athlete_id: athlete.id,
    score_value: '300', status: 'pending',
  });
  check('athlète — INSERT avec un WOD qui n\'appartient pas au tournoi : REFUSÉ', !!e7, e7?.message ?? 'accepté (!)');

  // « Terminer le tournoi » : on ferme tout, puis on rejoue les deux sens.
  const { error: closeErr } = await owner.client.from('tournament_wods')
    .update({ status: 'closed' }).eq('tournament_id', t.id).neq('status', 'closed');
  check('owner — « Terminer le tournoi » ferme les WOD (chemin TheHub #239)', !closeErr, closeErr?.message ?? '');

  const { error: e8 } = await athlete.client.from('tournament_scores')
    .update({ score_value: '999' }).eq('id', mine.id);
  const stillVal = (await svc.from('tournament_scores').select('score_value').eq('id', mine.id).single()).data?.score_value;
  check('athlète — UPDATE de son score après fermeture : REFUSÉ (valeur intacte)',
    stillVal === '280', `error=${e8?.message ?? 'aucune'} · valeur=${stillVal}`);

  // ── Fenêtre « En révision » : l'organisateur doit garder la main ──────────
  const { data: vRows, error: vErr } = await owner.client.from('tournament_scores')
    .update({ status: 'validated', validated_at: new Date().toISOString() })
    .eq('id', mine.id).select('id');
  check('owner — validation d\'un score APRÈS fermeture des WOD : acceptée',
    !vErr && (vRows?.length ?? 0) === 1, vErr?.message ?? `${vRows?.length ?? 0} ligne(s)`);

  const { data: cRows, error: cErr } = await owner.client.from('tournament_scores')
    .update({ score_value: '275' }).eq('id', mine.id).select('id');
  check('owner — correction du score APRÈS fermeture : acceptée',
    !cErr && (cRows?.length ?? 0) === 1, cErr?.message ?? `${cRows?.length ?? 0} ligne(s)`);

  const { data: rRows, error: rErr } = await owner.client.from('tournament_scores')
    .update({ status: 'rejected', admin_message: 'test' }).eq('id', mine.id).select('id');
  check('owner — rejet d\'un score APRÈS fermeture : accepté',
    !rErr && (rRows?.length ?? 0) === 1, rErr?.message ?? `${rRows?.length ?? 0} ligne(s)`);

  // L'organisateur peut aussi saisir un score à la place d'un athlète.
  const { error: aErr } = await owner.client.from('tournament_scores').insert({
    tournament_id: t.id, tournament_wod_id: wClosed, athlete_id: athlete.id,
    score_value: '310', status: 'validated',
  });
  check('owner — saisie d\'un score sur un WOD fermé (dérogation admin) : acceptée', !aErr, aErr?.message ?? '');

  // Étanchéité inter-box : un owner d'une autre box ne doit pas soumettre ici.
  const stranger = await mkUser('etranger');
  const { error: sErr2 } = await submit(stranger.client, stranger.id, t.id, wOpen);
  check('étanchéité — un tiers ne peut pas soumettre pour lui-même sur ce tournoi fermé', !!sErr2, sErr2?.message ?? 'accepté (!)');
} finally {
  if (created.boxId) {
    const { data: ts } = await svc.from('tournaments').select('id').eq('box_id', created.boxId);
    for (const t of ts ?? []) {
      await svc.from('tournament_scores').delete().eq('tournament_id', t.id);
      await svc.from('tournament_participants').delete().eq('tournament_id', t.id);
      await svc.from('tournament_wods').delete().eq('tournament_id', t.id);
    }
    await svc.from('tournaments').delete().eq('box_id', created.boxId);
    await svc.from('box_members').delete().eq('box_id', created.boxId);
    await svc.from('boxes').delete().eq('id', created.boxId);
  }
  for (const id of created.users) await svc.auth.admin.deleteUser(id).catch(() => {});
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
