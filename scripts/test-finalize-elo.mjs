#!/usr/bin/env node
/**
 * AthleX — Clôture ELO : une seule fonction serveur (`finalize_tournament_elo`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Pour chaque format (simple, bracket, swiss, league_div), sur pile jetable :
 *   · le gérant clôture via la RPC ; pour chaque participant
 *     `profiles.elo = dernier elo_after` (tournament_elo_history) ;
 *   · une seconde clôture est refusée (TOURNOI_DEJA_CLOTURE), rien ne bouge ;
 *   · coach et athlète sont refusés ; `anon` n'a pas le droit d'exécution ;
 *   · le piège de la RLS est documenté : un gérant qui PATCH `profiles` d'un
 *     autre athlète via PostgREST reçoit 204 et ZÉRO ligne.
 *
 * Mutation inverse (scripts/test-finalize-elo-mutation.sh) : sans l'UPDATE du
 * profil dans la fonction, cette suite doit échouer.
 *
 * USAGE
 *   ./scripts/test-stack.sh up && node scripts/test-finalize-elo.mjs [--keep-data]
 */

import {
  requireTestTarget, serviceClient, anonClient, signInAs, createUser, createOwnedBox, dropBoxAndOwner,
  onCleanup, runCleanup, installCleanupTraps, SUPABASE_URL, ANON_KEY,
} from './lib/test-env.mjs';

requireTestTarget();
installCleanupTraps();

const db  = serviceClient();
const TS  = Date.now();
const TAG = `felo_${TS}`;
const PW  = `AthleX_Felo_${TS}!`;
const res = { passed: 0, failed: 0 };

const ok   = m => { console.log(`  ✅ ${m}`); res.passed++; };
const fail = (m, e) => { console.log(`  ❌ ${m}`); if (e?.message) console.log(`     → ${e.message}`); res.failed++; };
const info = m => console.log(`  ℹ️  ${m}`);
const assert = (cond, msg, err = null) => { cond ? ok(msg) : fail(msg, err); return cond; };

// ── Décor : box, gérant, coach, 8 athlètes ───────────────────────────────────
let BOX_ID, OWNER_ID, COACH_ID, asOwner, asCoach, asAthlete, ownerToken;
const AGENTS = Array.from({ length: 8 }, (_, i) => ({
  username: `Felo${i + 1}_${TS}`, email: `felo${i + 1}.${TAG}@test.athlex.io`, id: null, elo: 1000 + i * 25,
}));

async function setup() {
  console.log('\n── Décor ───────────────────────────────────────────────────────────────────');
  OWNER_ID = await createUser(db, { email: `owner.${TAG}@test.athlex.io`, password: PW, username: `FeloOwner_${TS}`, role: 'box_owner' });
  BOX_ID = await createOwnedBox(db, { tag: TAG, ownerId: OWNER_ID });
  onCleanup(() => dropBoxAndOwner(db, BOX_ID, OWNER_ID));

  COACH_ID = await createUser(db, { email: `coach.${TAG}@test.athlex.io`, password: PW, username: `FeloCoach_${TS}` });
  onCleanup(() => db.auth.admin.deleteUser(COACH_ID));
  await db.from('box_members').upsert({ box_id: BOX_ID, member_id: COACH_ID, role: 'coach', status: 'active' }, { onConflict: 'box_id,member_id' });

  for (const a of AGENTS) {
    a.id = await createUser(db, { email: a.email, password: PW, username: a.username, elo: a.elo });
    await db.from('box_members').upsert({ box_id: BOX_ID, member_id: a.id, role: 'member', status: 'active' }, { onConflict: 'box_id,member_id' });
  }
  onCleanup(async () => { for (const a of AGENTS) if (a.id) await db.auth.admin.deleteUser(a.id); });

  ({ client: asOwner, accessToken: ownerToken } = await signInAs(`owner.${TAG}@test.athlex.io`, PW));
  ({ client: asCoach } = await signInAs(`coach.${TAG}@test.athlex.io`, PW));
  ({ client: asAthlete } = await signInAs(AGENTS[0].email, PW));
  info(`Box ${BOX_ID.slice(0, 8)}…, gérant, coach, 8 athlètes (ELO 1000…1175)`);
}

async function createTournament(format, participants = AGENTS) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await db.from('tournaments').insert({
    box_id: BOX_ID, created_by: OWNER_ID, name: `[TEST] ${format} ${TAG}`,
    description: 'Auto test — safe to delete', status: 'open', level: 'rx', format,
    start_date: today, end_date: today, max_participants: 8,
  }).select('id').single();
  if (error) throw new Error(`tournoi ${format} : ${error.message}`);
  for (const a of participants) await db.from('tournament_participants').insert({ tournament_id: data.id, athlete_id: a.id, score: 0 });
  return data.id;
}

async function snapshotProfiles() {
  const { data } = await db.from('profiles').select('id, elo, total_matches, wins').in('id', AGENTS.map(a => a.id));
  return Object.fromEntries((data ?? []).map(p => [p.id, p]));
}

// ── Assertions communes à tous les formats ───────────────────────────────────
async function closeAndCheck(format, tournId, { expectDistribution, participants = AGENTS }) {
  const before = await snapshotProfiles();
  const N = participants.length;

  // Coach et athlète : refusés, et rien n'a bougé.
  const { error: coachErr } = await asCoach.rpc('finalize_tournament_elo', { p_tournament_id: tournId });
  assert(coachErr && /gérant ou co-gérant/i.test(coachErr.message), `${format} : le coach est refusé (message nommé)`, coachErr ?? { message: 'aucune erreur' });
  const { error: athErr } = await asAthlete.rpc('finalize_tournament_elo', { p_tournament_id: tournId });
  assert(athErr && /gérant ou co-gérant/i.test(athErr.message), `${format} : l'athlète est refusé`, athErr ?? { message: 'aucune erreur' });
  const { count: h0 } = await db.from('tournament_elo_history').select('*', { count: 'exact', head: true }).eq('tournament_id', tournId);
  assert(h0 === 0, `${format} : aucun historique écrit par les refus`);

  // Gérant : clôture.
  const { data: rows, error } = await asOwner.rpc('finalize_tournament_elo', { p_tournament_id: tournId });
  if (!assert(!error && Array.isArray(rows), `${format} : clôture par le gérant`, error)) return;
  assert(rows.length === N, `${format} : ${rows.length}/${N} lignes rendues (rang, before, after, change)`);
  assert(rows.every(r => r.elo_after === r.elo_before + r.elo_change), `${format} : elo_after = elo_before + elo_change sur chaque ligne`);
  assert(rows.some(r => r.final_rank === 1), `${format} : un rang 1 existe`);

  // Invariant : profil = dernier elo_after, pour chaque participant.
  const { data: hist } = await db.from('tournament_elo_history').select('athlete_id, elo_after, calculated_at').eq('tournament_id', tournId);
  const after = await snapshotProfiles();
  const mismatches = (hist ?? []).filter(h => after[h.athlete_id]?.elo !== h.elo_after);
  assert(hist?.length === N && mismatches.length === 0,
    `${format} : profiles.elo = dernier elo_after pour les ${N} participants`,
    mismatches.length ? { message: mismatches.map(m => `${m.athlete_id.slice(0, 8)} profil=${after[m.athlete_id]?.elo} elo_after=${m.elo_after}`).join(' ; ') } : null);

  // Dernier elo_after toutes tables confondues (la ligne récap doit être la plus récente).
  const { data: latest, error: latestErr } = await db.rpc('_felo_latest_elo_after', { p_athletes: participants.map(a => a.id) });
  if (latest && !latestErr) {
    const bad = latest.filter(l => after[l.athlete_id]?.elo !== l.elo_after);
    assert(bad.length === 0, `${format} : profil = dernier elo_after toutes tables d'historique confondues`);
  }

  const { data: t } = await db.from('tournaments').select('status').eq('id', tournId).single();
  assert(t?.status === 'completed', `${format} : statut completed`);

  if (expectDistribution) {
    const moved = AGENTS.filter(a => before[a.id].elo !== after[a.id].elo).length;
    assert(moved > 0, `${format} : l'ELO a été distribué (${moved} profils ont bougé)`);
    assert(AGENTS.every(a => after[a.id].total_matches === before[a.id].total_matches + 1), `${format} : total_matches +1 pour chacun`);
    const winners = rows.filter(r => r.final_rank === 1).map(r => r.athlete_id);
    assert(winners.every(w => after[w].wins === before[w].wins + 1), `${format} : wins +1 pour le rang 1`);
  } else {
    assert(AGENTS.every(a => before[a.id].elo === after[a.id].elo),
      `${format} : aucune seconde couche de points (ELO déjà distribué match/WOD par match/WOD, profils inchangés)`);
  }

  // Idempotence : refus prononcé, rien ne bouge.
  const { data: again, error: againErr } = await asOwner.rpc('finalize_tournament_elo', { p_tournament_id: tournId });
  assert(againErr && /TOURNOI_DEJA_CLOTURE/.test(againErr.message), `${format} : seconde clôture refusée (TOURNOI_DEJA_CLOTURE)`, againErr ?? { message: `réponse ${JSON.stringify(again)?.slice(0, 60)}` });
  const after2 = await snapshotProfiles();
  const { count: h2 } = await db.from('tournament_elo_history').select('*', { count: 'exact', head: true }).eq('tournament_id', tournId);
  assert(h2 === N && AGENTS.every(a => after2[a.id].elo === after[a.id].elo && after2[a.id].total_matches === after[a.id].total_matches),
    `${format} : la seconde clôture n'a rien redistribué (historique ${h2}, profils identiques)`);
  return rows;
}

// ── Format simple : la règle de classement (lib/tournamentScoring) ───────────
async function suiteSimple() {
  console.log('\n══ Simple (classique) ═══════════════════════════════════════════════════════');
  const tournId = await createTournament('simple');
  const wods = [];
  for (const [i, type] of [['For Time'], ['AMRAP']].entries()) {
    const { data: w } = await db.from('tournament_wods').insert({
      tournament_id: tournId, order_index: i + 1, title: `[TEST] WOD ${i + 1}`, type: type[0],
      duration_minutes: 12, movements: '[]', scoring: type[0] === 'For Time' ? 'Temps' : 'Reps', status: 'active',
    }).select('id').single();
    wods.push(w.id);
  }
  // WOD 1 For Time : finishers (temps croissant), un cappé, un DNF hérité, un score
  // non parsable. WOD 2 AMRAP : reps décroissantes, deux ex-aequo.
  const ft = ['300', '300', '420', '250', '1000049', 'abc', '500', '380'];
  const ftCapped = [false, false, false, false, false, false, true, false];
  const amrap = ['150', '150', '120', '200', '90', '180', '60', '110'];
  for (let i = 0; i < 8; i++) {
    await db.from('tournament_scores').insert({ tournament_id: tournId, tournament_wod_id: wods[0], athlete_id: AGENTS[i].id, score_value: ft[i], capped: ftCapped[i], status: 'validated' });
    await db.from('tournament_scores').insert({ tournament_id: tournId, tournament_wod_id: wods[1], athlete_id: AGENTS[i].id, score_value: amrap[i], status: 'validated' });
  }

  // Un score en attente bloque la clôture (refus nommé), puis on le valide.
  await db.from('tournament_scores').update({ status: 'pending' }).eq('tournament_wod_id', wods[1]).eq('athlete_id', AGENTS[7].id);
  const { error: pendErr } = await asOwner.rpc('finalize_tournament_elo', { p_tournament_id: tournId });
  assert(pendErr && /SCORES_EN_ATTENTE/.test(pendErr.message), 'simple : un score pending bloque la clôture (SCORES_EN_ATTENTE)', pendErr ?? { message: 'aucune erreur' });
  await db.from('tournament_scores').update({ status: 'validated' }).eq('tournament_wod_id', wods[1]).eq('athlete_id', AGENTS[7].id);

  // Classement serveur attendu, calculé à la main d'après lib/tournamentScoring :
  // WOD1 ordre : A4(250) A1(300) A2(300) A8(380) A3(420) A6(abc) A7(cappé 500) A5(DNF hérité 999999+50 → cappé, 50 reps)
  //   cappés : A7 (500 reps) avant A5 (50 reps) ;
  //   le non parsable (A6) reste en queue de SON groupe (finishers), donc AVANT
  //   les cappés, et occupe une position sans marquer : A7 et A5 glissent d'un cran.
  //   points : A4 100, A1 97, A2 94, A8 91, A3 88, A6 0 (pos. 6), A7 82, A5 79
  // WOD2 ordre : A4(200) A6(180) A1(150) A2(150) A3(120) A8(110) A5(90) A7(60)
  //   points : A4 100, A6 97, A1 94, A2 91, A3 88, A8 85, A5 82, A7 79
  // Cumul : A4 200, A1 191, A2 185, A3 176, A8 176, A5 161, A7 161, A6 97
  // A1/A2 ex-aequo (300, sans tiebreak) : ROW_NUMBER tranche par athlete_id
  // (miroir du localeCompare de rankWodScores) — l'un prend 97, l'autre 94.
  const expected = { 4: 200, 3: 176, 8: 176, 5: 161, 7: 161, 6: 97 };
  const tied = [1, 2].sort((a, b) => AGENTS[a - 1].id.localeCompare(AGENTS[b - 1].id));
  expected[tied[0]] = 191; expected[tied[1]] = 185;
  const { data: standings, error: sErr } = await db.rpc('tournament_classique_standings', { p_tournament_id: tournId });
  assert(!sErr && standings?.length === 8, 'simple : tournament_classique_standings rend 8 lignes', sErr);
  const byId = Object.fromEntries((standings ?? []).map(s => [s.athlete_id, s]));
  const pointsOk = AGENTS.every((a, i) => byId[a.id]?.points === expected[i + 1]);
  assert(pointsOk, 'simple : points SQL = règle lib/tournamentScoring (finishers < cappés, DNF hérité, non parsable = 0, 100−3·(rang−1))',
    pointsOk ? null : { message: AGENTS.map((a, i) => `A${i + 1}=${byId[a.id]?.points}/${expected[i + 1]}`).join(' ') });
  const rankOf = i => byId[AGENTS[i - 1].id]?.final_rank;
  assert(rankOf(4) === 1 && rankOf(3) === 4 && rankOf(8) === 4 && rankOf(7) === 6 && rankOf(5) === 6 && rankOf(6) === 8,
    'simple : rangs 1,2,3,4,4,6,6,8 (ex-aequo partagés au cumul)');

  const rows = await closeAndCheck('simple', tournId, { expectDistribution: true });
  if (rows) {
    const w = rows.find(r => r.final_rank === 1);
    assert(w?.athlete_id === AGENTS[3].id && w.elo_change > 0, `simple : le vainqueur (A4) gagne des points (+${w?.elo_change})`);
    const last = rows.find(r => r.athlete_id === AGENTS[5].id);
    assert(last?.final_rank === 8 && last.elo_change < 0, `simple : le dernier (A6) en perd (${last?.elo_change})`);
  }
}

// ── Bracket (simple élimination) ─────────────────────────────────────────────
async function playBracket(tournId, format) {
  const e = id => AGENTS.find(a => a.id === id)?.elo ?? 0;
  const resolve = async m => {
    // Le mieux classé (ELO) gagne : déterministe.
    const winner = e(m.participant1_id) >= e(m.participant2_id) ? m.participant1_id : m.participant2_id;
    const loser = winner === m.participant1_id ? m.participant2_id : m.participant1_id;
    await db.from('tournament_bracket_matches').update({ winner_id: winner, loser_id: loser ?? null, status: 'completed', completed_at: new Date().toISOString() }).eq('id', m.id);
  };
  // Tour par tour, comme le gérant : on tranche les matchs en attente du tour,
  // on avance le WB (ce qui crée le LB du tour en swiss), et on recommence.
  for (let guard = 0; guard < 20; guard++) {
    const { data: pending } = await db.from('tournament_bracket_matches')
      .select('id, round, participant1_id, participant2_id, side')
      .eq('tournament_id', tournId).eq('status', 'pending').order('round');
    if (!pending?.length) break;
    const round = pending[0].round;
    const ofRound = pending.filter(m => m.round === round);
    for (const m of ofRound) await resolve(m);
    const { count: wbInRound } = await db.from('tournament_bracket_matches').select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournId).eq('round', round).eq('side', 'winner');
    const { count: nextWb } = await db.from('tournament_bracket_matches').select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournId).eq('round', round + 1).eq('side', 'winner');
    // En swiss, avancer la finale WB ne crée aucun match WB mais crée le dernier tour du LB.
    if ((wbInRound > 1 || format === 'swiss') && nextWb === 0 && ofRound.some(m => m.side === 'winner')) {
      const { error } = await asOwner.rpc('advance_bracket_round', { p_tournament_id: tournId, p_completed_round: round });
      if (error && !/unfinished/i.test(error.message)) fail(`advance round ${round}`, error);
    }
  }
  if (format === 'swiss') {
    // Grande finale : créée par le gérant (createGrandFinalAction côté web) entre
    // le champion du WB et celui du LB, puis tranchée.
    const { data: all } = await db.from('tournament_bracket_matches').select('round, side, winner_id').eq('tournament_id', tournId);
    const top = side => all.filter(m => m.side === side && m.winner_id).sort((a, b) => b.round - a.round)[0]?.winner_id;
    const { data: gf } = await db.from('tournament_bracket_matches').insert({
      tournament_id: tournId, round: 99, match_number: 1, side: 'grand_final',
      participant1_id: top('winner'), participant2_id: top('loser'), status: 'pending',
    }).select('id, participant1_id, participant2_id').single();
    await resolve(gf);
  }
}

async function suiteBracket(format) {
  console.log(`\n══ ${format} ${format === 'swiss' ? '(double élimination)' : '(simple élimination)'} ═══════════════════════════════`);
  // Double élimination : 4 joueurs, seul effectif où advance_bracket_round
  // converge. Le défaut à 8 est documenté par suiteSwiss8Defect (attendu-rouge).
  const participants = format === 'swiss' ? AGENTS.slice(4) : AGENTS;
  const tournId = await createTournament(format, participants);
  const { error: r1Err } = await asOwner.rpc('generate_bracket_round_1', { p_tournament_id: tournId });
  if (!assert(!r1Err, `${format} : round 1 généré`, r1Err)) return;

  // Tableau non terminé : refus nommé.
  const { error: earlyErr } = await asOwner.rpc('finalize_tournament_elo', { p_tournament_id: tournId });
  assert(earlyErr && /TABLEAU_NON_TERMINE/.test(earlyErr.message), `${format} : clôture refusée tant qu'il reste des matchs (TABLEAU_NON_TERMINE)`, earlyErr ?? { message: 'aucune erreur' });

  await playBracket(tournId, format);
  const { count: mh } = await db.from('tournament_match_elo_history').select('*', { count: 'exact', head: true }).eq('tournament_id', tournId);
  assert(mh > 0, `${format} : ELO distribué match par match par le trigger (${mh} lignes tournament_match_elo_history)`);

  const rows = await closeAndCheck(format, tournId, { expectDistribution: false, participants });
  if (rows) {
    const champ = rows.find(r => r.final_rank === 1);
    assert(champ?.athlete_id === AGENTS[7].id, `${format} : le champion est le mieux classé (A8)`);
    // La ligne récap agrège les matchs : elo_change = somme des deltas de l'athlète.
    const { data: m } = await db.from('tournament_match_elo_history').select('athlete_id, elo_delta').eq('tournament_id', tournId);
    const sum = {}; for (const x of m ?? []) sum[x.athlete_id] = (sum[x.athlete_id] ?? 0) + x.elo_delta;
    assert(rows.every(r => r.elo_change === (sum[r.athlete_id] ?? 0)), `${format} : elo_change récap = Σ deltas des matchs`);
  }
}

// ── Suisse à 8 : défaut connu, attendu-rouge ─────────────────────────────────
// advance_bracket_round (swiss) construit le LB en une seule passe par tour :
//   LB tour N = vainqueurs du LB tour N-1  ×  perdants du WB tour N, appariés 1:1
//   (LEAST des deux effectifs). Il n'y a jamais de tour « mineur » du LB où les
//   vainqueurs du LB se rencontrent entre eux. Tant que les deux effectifs sont
//   égaux (2 → 1 → …), ça converge : c'est le cas à 4 joueurs. À 8 : le LB tour 2
//   produit 2 vainqueurs, la finale WB (tour 3) n'a qu'1 perdant → 1 match créé,
//   le 2e vainqueur du LB n'a plus jamais d'adversaire, ni de défaite. Le tableau
//   se termine, grande finale jouée, avec 1 athlète « encore en lice » (l'orphelin)
//   et la clôture refuse.
//   À 5, 6, 7 : les effectifs impairs ne reçoivent pas de bye en swiss
//   (WHILE i+1 <= v_count) — un vainqueur du WB est simplement oublié.
// Ce test AFFIRME le défaut : le jour où advance_bracket_round est corrigée,
// il rougit, et on le retire avec la ligne « résiduel » d'ETAT_DU_PROJET.
async function suiteSwiss8Defect() {
  console.log('\n══ swiss à 8 — défaut connu d\'advance_bracket_round (attendu-rouge) ═════════');
  const tournId = await createTournament('swiss', AGENTS);
  const { error: r1Err } = await asOwner.rpc('generate_bracket_round_1', { p_tournament_id: tournId });
  if (!assert(!r1Err, 'swiss×8 : round 1 généré (4 matchs WB)', r1Err)) return;
  await playBracket(tournId, 'swiss');

  const { data: all } = await db.from('tournament_bracket_matches')
    .select('round, side, participant1_id, participant2_id, winner_id, loser_id').eq('tournament_id', tournId);
  const lb = r => all.filter(m => m.side === 'loser' && m.round === r);
  const wb = r => all.filter(m => m.side === 'winner' && m.round === r);
  assert(wb(1).length === 4 && wb(2).length === 2 && wb(3).length === 1, `swiss×8 : WB 4 → 2 → 1 matchs (${wb(1).length}/${wb(2).length}/${wb(3).length})`);
  assert(lb(1).length === 2 && lb(2).length === 2, `swiss×8 : LB tour 1 = 2 matchs, tour 2 = 2 matchs (${lb(1).length}/${lb(2).length})`);
  assert(lb(3).length === 1, `swiss×8 : LB tour 3 = 1 seul match pour 2 vainqueurs du LB tour 2 + 1 perdant de la finale WB (${lb(3).length}) — attendu-rouge : c'est le défaut`);
  const lb2Winners = lb(2).map(m => m.winner_id);
  const playedAfter = new Set(all.filter(m => m.round > 2 || m.side === 'grand_final').flatMap(m => [m.participant1_id, m.participant2_id]));
  const orphans = lb2Winners.filter(id => !playedAfter.has(id));
  assert(orphans.length === 1, `swiss×8 : ${orphans.length} vainqueur du LB tour 2 ne rejoue jamais et n'est jamais éliminé — attendu-rouge : défaut documenté, pas accepté`);

  const { error } = await asOwner.rpc('finalize_tournament_elo', { p_tournament_id: tournId });
  assert(error && /TABLEAU_NON_TERMINE : 1 /.test(error.message),
    `swiss×8 : la clôture refuse (${error?.message ?? 'aucune erreur'}) — attendu-rouge : le refus est la bonne réponse au tableau bancal, tant que la cause n'est pas corrigée`);
  const { count: h } = await db.from('tournament_elo_history').select('*', { count: 'exact', head: true }).eq('tournament_id', tournId);
  assert(h === 0, 'swiss×8 : aucune ligne d\'historique écrite par la clôture refusée');
}

// ── Ligue avec divisions ─────────────────────────────────────────────────────
async function suiteLeague() {
  console.log('\n══ league_div ═══════════════════════════════════════════════════════════════');
  const tournId = await createTournament('league_div');
  const divs = {};
  for (const level of [1, 2]) {
    const { data: d } = await db.from('tournament_divisions').insert({ tournament_id: tournId, name: `Division ${level}`, level, max_members: 4, promote_count: level === 2 ? 1 : 0, relegate_count: level === 1 ? 1 : 0 }).select('id').single();
    divs[level] = d.id;
  }
  await db.from('tournament_division_members').delete().in('division_id', Object.values(divs));
  for (let i = 0; i < 8; i++) await db.from('tournament_division_members').insert({ division_id: divs[i < 4 ? 1 : 2], athlete_id: AGENTS[i].id, points: 0 });

  const { data: wod } = await db.from('tournament_wods').insert({ tournament_id: tournId, order_index: 1, title: '[TEST] S1 WOD', type: 'AMRAP', duration_minutes: 10, movements: '[]', scoring: 'Reps', status: 'active', season_number: 1 }).select('id').single();
  for (let i = 0; i < 8; i++) await db.from('tournament_scores').insert({ tournament_id: tournId, tournament_wod_id: wod.id, athlete_id: AGENTS[i].id, score_value: String(100 + i * 7), status: 'validated' });
  const { error: lwErr } = await asOwner.rpc('compute_league_wod_elo', { p_tournament_wod_id: wod.id });
  assert(!lwErr, 'league_div : ELO du WOD distribué par compute_league_wod_elo', lwErr);

  const rows = await closeAndCheck('league_div', tournId, { expectDistribution: false });
  if (rows) {
    const d1 = rows.filter(r => AGENTS.slice(0, 4).some(a => a.id === r.athlete_id)).map(r => r.final_rank);
    const d2 = rows.filter(r => AGENTS.slice(4).some(a => a.id === r.athlete_id)).map(r => r.final_rank);
    assert(Math.max(...d1) < Math.min(...d2), 'league_div : la division 1 est classée devant la division 2');
  }
}

// ── Grants : anon sans droit d'exécution ─────────────────────────────────────
async function suiteGrants() {
  console.log('\n══ Grants ═══════════════════════════════════════════════════════════════════');
  const { error } = await anonClient().rpc('finalize_tournament_elo', { p_tournament_id: '00000000-0000-0000-0000-000000000000' });
  assert(error && (error.code === '42501' || /permission denied/i.test(error.message)), 'anon : permission denied sur finalize_tournament_elo (TO authenticated seulement)', error ?? { message: 'aucune erreur' });
  const { error: e2 } = await anonClient().rpc('compute_tournament_elo', { p_tournament_id: '00000000-0000-0000-0000-000000000000' });
  assert(e2 && (e2.code === '42501' || /permission denied/i.test(e2.message)), 'anon : permission denied sur compute_tournament_elo (alias)', e2 ?? { message: 'aucune erreur' });
}

// ── Le piège : PATCH profiles d'un autre athlète → 204 et 0 ligne ────────────
async function suiteRlsTrap() {
  console.log('\n══ Piège RLS : PATCH profiles par le gérant ═════════════════════════════════');
  const victim = AGENTS[1];
  const { data: before } = await db.from('profiles').select('elo').eq('id', victim.id).single();
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${victim.id}`;
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' };

  // Requête telle que l'ancien CloseTournamentButton l'émettait (sans Prefer).
  const r1 = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ elo: before.elo + 500 }) });
  assert(r1.status === 204, `PATCH profiles (autre athlète, sans Prefer) → HTTP ${r1.status} : « succès » apparent`);
  const { data: mid } = await db.from('profiles').select('elo').eq('id', victim.id).single();
  assert(mid.elo === before.elo, `…et pourtant 0 ligne modifiée (elo relu = ${mid.elo}, inchangé) : le 204 ne prouve rien`);

  // Avec Prefer: return=representation, la réponse dit la vérité : tableau vide.
  // (`select=` explicite : la lecture de profiles est limitée colonne par colonne,
  // une représentation `*` renverrait 403 pour la colonne email.)
  const r2 = await fetch(`${url}&select=id,elo`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ elo: before.elo + 500 }) });
  const body = await r2.json().catch(() => null);
  assert(r2.status === 200 && Array.isArray(body) && body.length === 0, `PATCH avec Prefer: return=representation → HTTP ${r2.status}, ${Array.isArray(body) ? body.length : '?'} ligne(s) : c'est la vérification à faire`);

  // Le gérant peut, lui, modifier SA ligne (la policy « own profile » fonctionne).
  const { data: own } = await db.from('profiles').select('bio').eq('id', OWNER_ID).single();
  const r3 = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${OWNER_ID}&select=id,bio`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ bio: own?.bio ?? null }) });
  const b3 = await r3.json().catch(() => null);
  assert(r3.status === 200 && Array.isArray(b3) && b3.length === 1, 'Contrôle : le même PATCH sur sa propre ligne renvoie 1 ligne');
}

// ── Helper SQL éphémère : dernier elo_after toutes tables confondues ─────────
// Installé via psql (TEST_ADMIN_DB_URL, fourni par test-stack.sh) et retiré à la
// fin : ce n'est pas un objet du schéma. Sans psql, l'assertion est sautée.
async function withLatestHelper(fn) {
  const adminUrl = process.env.TEST_ADMIN_DB_URL;
  if (!adminUrl) { info('TEST_ADMIN_DB_URL absent : vérification « toutes tables » sautée'); return fn(); }
  const { execSync } = await import('node:child_process');
  const sql = `
    CREATE OR REPLACE FUNCTION public._felo_latest_elo_after(p_athletes uuid[])
    RETURNS TABLE (athlete_id uuid, elo_after integer) LANGUAGE sql SECURITY DEFINER AS $$
      SELECT DISTINCT ON (athlete_id) athlete_id, elo_after FROM (
        SELECT member_id AS athlete_id, elo_after, created_at AS at FROM elo_history WHERE member_id = ANY(p_athletes)
        UNION ALL SELECT member_id, elo_after, created_at FROM box_elo_history WHERE member_id = ANY(p_athletes)
        UNION ALL SELECT athlete_id, elo_after, calculated_at FROM tournament_elo_history WHERE athlete_id = ANY(p_athletes)
        UNION ALL SELECT athlete_id, elo_after, created_at FROM tournament_match_elo_history WHERE athlete_id = ANY(p_athletes)
        UNION ALL SELECT athlete_id, elo_after, created_at FROM tournament_wod_elo_history WHERE athlete_id = ANY(p_athletes)
      ) u ORDER BY athlete_id, at DESC;
    $$;
    GRANT EXECUTE ON FUNCTION public._felo_latest_elo_after(uuid[]) TO service_role;
    NOTIFY pgrst, 'reload schema';`;
  execSync(`psql "${adminUrl}" -v ON_ERROR_STOP=1 -q`, { input: sql });
  onCleanup(() => execSync(`psql "${adminUrl}" -q -c "DROP FUNCTION IF EXISTS public._felo_latest_elo_after(uuid[])"`));
  await new Promise(r => setTimeout(r, 1500));
  await fn();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Clôture ELO — finalize_tournament_elo : tous formats, invariant, RLS   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  try {
    await setup();
    await withLatestHelper(async () => {
      await suiteGrants();
      await suiteRlsTrap();
      await suiteSimple();
      await suiteBracket('bracket');
      await suiteBracket('swiss');
      await suiteSwiss8Defect();
      await suiteLeague();
    });
  } catch (e) {
    fail(`Exception : ${e?.message ?? e}`);
  } finally {
    await runCleanup();
  }
  console.log(`\n${res.failed === 0 ? '✅' : '❌'}  ${res.passed} réussi(s), ${res.failed} échec(s)`);
  process.exit(res.failed === 0 ? 0 : 1);
}
main();
