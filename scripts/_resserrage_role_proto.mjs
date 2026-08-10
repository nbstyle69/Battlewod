// Protocole « resserrage de la branche rôle » (20261017) — pile jetable, vrais JWT.
//
// Avant cette migration, 10 policies portaient la branche
//   role = ANY (ARRAY['admin','super_admin','box_owner'])
// qui ignore la box : n'importe quel gérant pouvait lire / modifier /
// supprimer les scores, l'historique d'ELO, les compteurs de reps et les
// badges de n'importe quelle box.
//
// Deux sens à prouver :
//   • ce qui doit désormais échouer : un box_owner d'une AUTRE box sur les
//     données de la box témoin (score, ELO, reps, badges) ;
//   • ce qui doit continuer de passer : l'owner de la box (fenêtre
//     « En révision » rejouée sur le vrai chemin ScoresClient.updateStatus),
//     l'athlète dans les deux sens, le crédit de badges/reps du back-office,
//     et la dérogation plateforme super_admin.
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
const created = { users: [], boxes: [] };

const mkUser = async (suffix, role = 'member') => {
  const email = `zz_rsr_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_rsr_${suffix}_${stamp}`,
    level: 'inter', role, elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, client };
};

const mkBox = async (ownerId, suffix) => {
  const { data, error } = await svc.from('boxes').insert({
    owner_id: ownerId, name: `ZZ RSR ${suffix} ${stamp}`, slug: `zz-rsr-${suffix}-${stamp}`,
    invite_code: `ZR${created.boxes.length}${String(stamp).slice(-5)}`,
    is_active: true, is_listed: true,
  }).select('id').single();
  if (error) throw error;
  created.boxes.push(data.id);
  await svc.from('box_members').insert({ box_id: data.id, member_id: ownerId, role: 'owner', status: 'active' });
  return data.id;
};

try {
  // ── Décor : la box témoin, une box tierce, un athlète, un super_admin ─────
  const owner = await mkUser('owner', 'box_owner');       // gérant de la box témoin
  const foreign = await mkUser('etranger', 'box_owner');  // gérant d'une AUTRE box
  const athlete = await mkUser('athlete');
  const admin = await mkUser('superadmin', 'super_admin');

  const boxA = await mkBox(owner.id, 'temoin');
  await mkBox(foreign.id, 'tierce');
  await svc.from('box_members').insert({ box_id: boxA, member_id: athlete.id, role: 'member', status: 'active' });

  const { data: t, error: tErr } = await svc.from('tournaments').insert({
    name: `ZZ RSR ${stamp}`, level: 'rx', status: 'active', box_id: boxA,
    created_by: owner.id, format: 'simple', max_participants: 16,
  }).select('id').single();
  if (tErr) throw tErr;
  await svc.from('tournament_participants').insert({ tournament_id: t.id, athlete_id: athlete.id });

  const mkWod = async opts => {
    const { data, error } = await svc.from('tournament_wods').insert({
      tournament_id: t.id, title: `${opts.title} ${stamp}`, type: 'For Time',
      duration_minutes: 12, status: opts.status, opens_at: null, closes_at: null,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  };
  const wOpen = await mkWod({ status: 'active', title: 'Ouvert' });

  // ── Inventaire : le motif ne doit plus exister nulle part dans le schéma ──
  const survivors = sql(`SELECT coalesce(string_agg(tablename||'.'||policyname||':'||cmd, ', ' ORDER BY tablename, policyname), 'aucune')
                           FROM pg_policies
                          WHERE schemaname='public'
                            AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%''box_owner''::text%'`);
  check('inventaire — plus aucune policy ne porte la branche rôle box_owner',
    survivors === 'aucune', survivors);

  const scored = sql(`SELECT coalesce(string_agg(policyname||':'||cmd, ', ' ORDER BY policyname), 'aucune')
                        FROM pg_policies WHERE tablename='tournament_scores' AND cmd IN ('INSERT','UPDATE','DELETE')`);
  check('inventaire — une seule policy INSERT / UPDATE / DELETE sur tournament_scores (rien à OR-combiner)',
    scored === 'tournament_scores_admin_delete:DELETE, tournament_scores_owner_insert:INSERT, tournament_scores_owner_update_pending:UPDATE',
    scored);

  // ── Sens 1 : l'athlète est inchangé, dans les deux sens ───────────────────
  const { error: e1 } = await athlete.client.from('tournament_scores').insert({
    tournament_id: t.id, tournament_wod_id: wOpen, athlete_id: athlete.id,
    score_value: '300', status: 'pending',
  });
  check('athlète — INSERT sur un WOD ouvert : toujours accepté', !e1, e1?.message ?? '');

  const { data: mine } = await svc.from('tournament_scores').select('id').eq('tournament_wod_id', wOpen).single();

  const { data: selfRead } = await athlete.client.from('tournament_scores').select('id').eq('id', mine.id);
  check('athlète — lecture de son propre score : toujours acceptée', (selfRead?.length ?? 0) === 1, `${selfRead?.length ?? 0} ligne(s)`);

  const { data: selfUpd, error: e2 } = await athlete.client.from('tournament_scores')
    .update({ score_value: '280' }).eq('id', mine.id).select('id');
  check('athlète — UPDATE de son score pending sur un WOD ouvert : toujours accepté',
    !e2 && (selfUpd?.length ?? 0) === 1, e2?.message ?? `${selfUpd?.length ?? 0} ligne(s)`);

  // ── Sens 2 : le gérant d'une AUTRE box est désormais refusé ───────────────
  const { data: fRead } = await foreign.client.from('tournament_scores').select('id').eq('id', mine.id);
  check('box_owner d\'une autre box — lecture d\'un score de la box témoin : REFUSÉE',
    (fRead?.length ?? 0) === 0, `${fRead?.length ?? 0} ligne(s)`);

  const { data: fUpd, error: fErr } = await foreign.client.from('tournament_scores')
    .update({ status: 'validated' }).eq('id', mine.id).select('id');
  const afterForeign = (await svc.from('tournament_scores').select('status, score_value').eq('id', mine.id).single()).data;
  check('box_owner d\'une autre box — UPDATE d\'un score de la box témoin : REFUSÉ (ligne intacte)',
    (fUpd?.length ?? 0) === 0 && afterForeign.status === 'pending' && afterForeign.score_value === '280',
    `error=${fErr?.message ?? 'aucune'} · status=${afterForeign.status} · valeur=${afterForeign.score_value}`);

  const { data: fDel } = await foreign.client.from('tournament_scores').delete().eq('id', mine.id).select('id');
  const stillThere = (await svc.from('tournament_scores').select('id', { count: 'exact', head: true }).eq('id', mine.id)).count;
  check('box_owner d\'une autre box — DELETE d\'un score de la box témoin : REFUSÉ (ligne toujours là)',
    (fDel?.length ?? 0) === 0 && stillThere === 1, `${fDel?.length ?? 0} supprimée(s) · reste ${stillThere}`);

  // ── Fenêtre « En révision » sur le vrai chemin (ScoresClient.updateStatus) ─
  const { error: closeErr } = await owner.client.from('tournament_wods')
    .update({ status: 'closed' }).eq('tournament_id', t.id).neq('status', 'closed');
  check('owner — « Terminer le tournoi » ferme les WOD (chemin TheHub #239)', !closeErr, closeErr?.message ?? '');

  const { data: vRows, error: vErr } = await owner.client.from('tournament_scores')
    .update({ status: 'validated', validated_at: new Date().toISOString() })
    .eq('id', mine.id).select('id');
  check('owner de la box — validation d\'un score APRÈS fermeture : toujours acceptée',
    !vErr && (vRows?.length ?? 0) === 1, vErr?.message ?? `${vRows?.length ?? 0} ligne(s)`);

  const { data: cRows, error: cErr } = await owner.client.from('tournament_scores')
    .update({ score_value: '275' }).eq('id', mine.id).select('id');
  check('owner de la box — correction de la valeur APRÈS fermeture : toujours acceptée',
    !cErr && (cRows?.length ?? 0) === 1, cErr?.message ?? `${cRows?.length ?? 0} ligne(s)`);

  const { data: rRows, error: rErr } = await owner.client.from('tournament_scores')
    .update({ status: 'rejected', admin_message: 'test' }).eq('id', mine.id).select('id');
  check('owner de la box — rejet d\'un score APRÈS fermeture : toujours accepté',
    !rErr && (rRows?.length ?? 0) === 1, rErr?.message ?? `${rRows?.length ?? 0} ligne(s)`);

  const { error: aErr } = await athlete.client.from('tournament_scores')
    .update({ score_value: '999' }).eq('id', mine.id);
  const afterAthlete = (await svc.from('tournament_scores').select('score_value').eq('id', mine.id).single()).data?.score_value;
  check('athlète — UPDATE après fermeture : toujours REFUSÉ (garde 20261016 intact)',
    afterAthlete === '275', `error=${aErr?.message ?? 'aucune'} · valeur=${afterAthlete}`);

  // ── Dérogation plateforme : super_admin garde la main partout ─────────────
  const { data: sRows, error: sErr } = await admin.client.from('tournament_scores')
    .update({ status: 'validated' }).eq('id', mine.id).select('id');
  check('super_admin — UPDATE sur la box témoin : toujours accepté (dérogation plateforme)',
    !sErr && (sRows?.length ?? 0) === 1, sErr?.message ?? `${sRows?.length ?? 0} ligne(s)`);

  // ── tournament_elo_history : même resserrage ──────────────────────────────
  const eloRow = {
    tournament_id: t.id, athlete_id: athlete.id, final_rank: 1, participants_count: 1,
    avg_opponent_elo: 1000, elo_before: 1000, elo_after: 1020, elo_change: 20,
  };
  const { error: eOwn } = await owner.client.from('tournament_elo_history').insert(eloRow);
  check('owner de la box — écriture tournament_elo_history de son tournoi : acceptée', !eOwn, eOwn?.message ?? '');

  const { error: eFor } = await foreign.client.from('tournament_elo_history').insert({ ...eloRow, final_rank: 2 });
  check('box_owner d\'une autre box — écriture tournament_elo_history : REFUSÉE', !!eFor, eFor?.message ?? 'accepté (!)');

  const { data: eForRead } = await foreign.client.from('tournament_elo_history').select('id').eq('tournament_id', t.id);
  check('box_owner d\'une autre box — lecture tournament_elo_history : REFUSÉE',
    (eForRead?.length ?? 0) === 0, `${eForRead?.length ?? 0} ligne(s)`);

  const { data: eSelf } = await athlete.client.from('tournament_elo_history').select('id').eq('tournament_id', t.id);
  check('athlète — lecture de son propre historique d\'ELO : toujours acceptée', (eSelf?.length ?? 0) === 1, `${eSelf?.length ?? 0} ligne(s)`);

  // ── athlete_badges / movement_rep_counts : le back-office doit continuer ──
  // (BOTournamentScreen crédite reps + badges avec le JWT de l'owner)
  const { error: mOwn } = await owner.client.from('movement_rep_counts').insert({
    athlete_id: athlete.id, movement_key: 'thruster', movement_label: 'Thruster', total_reps: 50,
  });
  check('owner de la box — crédit de reps à un membre de sa box : accepté (chemin BOTournamentScreen)', !mOwn, mOwn?.message ?? '');

  const { error: bOwn } = await owner.client.from('athlete_badges')
    .upsert({ athlete_id: athlete.id, badge_key: `zz_rsr_${stamp}` }, { onConflict: 'athlete_id,badge_key' });
  check('owner de la box — crédit de badge à un membre de sa box : accepté', !bOwn, bOwn?.message ?? '');

  // Participant d'un tournoi de ma box sans adhésion : la 2e branche du helper.
  const guest = await mkUser('invite');
  await svc.from('tournament_participants').insert({ tournament_id: t.id, athlete_id: guest.id });
  const { error: bGuest } = await owner.client.from('athlete_badges')
    .upsert({ athlete_id: guest.id, badge_key: `zz_rsr_g_${stamp}` }, { onConflict: 'athlete_id,badge_key' });
  check('owner de la box — crédit de badge à un participant non adhérent de son tournoi : accepté', !bGuest, bGuest?.message ?? '');

  const { error: mFor } = await foreign.client.from('movement_rep_counts').insert({
    athlete_id: athlete.id, movement_key: 'snatch', movement_label: 'Snatch', total_reps: 999,
  });
  check('box_owner d\'une autre box — crédit de reps à un athlète hors de sa box : REFUSÉ', !!mFor, mFor?.message ?? 'accepté (!)');

  const { error: bFor } = await foreign.client.from('athlete_badges')
    .insert({ athlete_id: athlete.id, badge_key: `zz_rsr_f_${stamp}` });
  check('box_owner d\'une autre box — crédit de badge à un athlète hors de sa box : REFUSÉ', !!bFor, bFor?.message ?? 'accepté (!)');

  const { data: mForRead } = await foreign.client.from('movement_rep_counts').select('id').eq('athlete_id', athlete.id);
  check('box_owner d\'une autre box — lecture des compteurs de reps d\'un athlète tiers : REFUSÉE',
    (mForRead?.length ?? 0) === 0, `${mForRead?.length ?? 0} ligne(s)`);

  const { data: mSelf } = await athlete.client.from('movement_rep_counts').select('id').eq('athlete_id', athlete.id);
  check('athlète — lecture de ses propres compteurs de reps : toujours acceptée', (mSelf?.length ?? 0) === 1, `${mSelf?.length ?? 0} ligne(s)`);

  // ── inter_elo_history : écriture réservée à la plateforme (SECURITY DEFINER)
  const interRow = {
    competition_id: (await svc.from('inter_competitions').insert({
      title: `ZZ RSR INTER ${stamp}`, format: 'league', type: 'individual', status: 'closed', created_by: owner.id,
    }).select('id').single()).data.id,
    athlete_id: athlete.id, final_rank: 1, participants_count: 2,
    avg_opponent_elo: 1000, elo_before: 1000, elo_after: 1010, elo_change: 10,
  };
  const { error: iFor } = await foreign.client.from('inter_elo_history').insert(interRow);
  check('box_owner — écriture inter_elo_history : REFUSÉE (réservée à la plateforme)', !!iFor, iFor?.message ?? 'accepté (!)');

  await svc.from('inter_elo_history').insert(interRow);
  const { data: iForRead } = await foreign.client.from('inter_elo_history').select('id').eq('athlete_id', athlete.id);
  check('box_owner d\'une autre box — lecture inter_elo_history d\'un athlète tiers : REFUSÉE',
    (iForRead?.length ?? 0) === 0, `${iForRead?.length ?? 0} ligne(s)`);

  const { data: iSelf } = await athlete.client.from('inter_elo_history').select('id');
  check('athlète — lecture de son propre inter_elo_history : toujours acceptée', (iSelf?.length ?? 0) === 1, `${iSelf?.length ?? 0} ligne(s)`);
} catch (err) {
  console.error('❌ protocole interrompu :', err?.message ?? err);
  ko++;
} finally {
  for (const boxId of created.boxes) {
    const { data: ts } = await svc.from('tournaments').select('id').eq('box_id', boxId);
    for (const t of ts ?? []) {
      await svc.from('tournament_elo_history').delete().eq('tournament_id', t.id);
      await svc.from('tournament_scores').delete().eq('tournament_id', t.id);
      await svc.from('tournament_participants').delete().eq('tournament_id', t.id);
      await svc.from('tournament_wods').delete().eq('tournament_id', t.id);
    }
    await svc.from('tournaments').delete().eq('box_id', boxId);
    await svc.from('box_members').delete().eq('box_id', boxId);
    await svc.from('boxes').delete().eq('id', boxId);
  }
  for (const id of created.users) {
    await svc.from('inter_elo_history').delete().eq('athlete_id', id);
    await svc.from('movement_rep_counts').delete().eq('athlete_id', id);
    await svc.from('athlete_badges').delete().eq('athlete_id', id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }
  await svc.from('inter_competitions').delete().like('title', `ZZ RSR INTER ${stamp}%`);
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
