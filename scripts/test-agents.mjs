#!/usr/bin/env node
/**
 * AthleX — Multi-Agent Tournament Reliability Test
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates 5 test agents going through the full lifecycle of each competition
 * type and verifies ELO calculations against src/utils/elo.ts logic.
 *
 * SUITES
 *   1. Daily Tournament  — 5 agents, pairwise ELO, reps mode
 *   2. BO Tournament     — 5 agents, avg-opponent ELO, For Time (skipped if no box)
 *   3. Inter-box         — 5 agents, standings view, reps mode
 *
 * USAGE
 *   ./scripts/test-stack.sh up && node scripts/test-agents.mjs [--keep-data]
 *   Cible fournie par TEST_SUPABASE_URL / TEST_SUPABASE_*_KEY (jamais la prod).
 *
 */

import {
  requireTestTarget, serviceClient, signInAs, createUser, createOwnedBox, dropBoxAndOwner,
  onCleanup, runCleanup, installCleanupTraps, KEEP_DATA,
} from './lib/test-env.mjs';

requireTestTarget();
installCleanupTraps();

const supabase = serviceClient();

// ── ELO Logic (mirrors src/utils/elo.ts) ─────────────────────────────────────
const K_PAIRWISE = 64;
const K_TOURNAMENT = 48;
const ELO_FLOOR = 100;

function calculatePairwiseDeltas(players) {
  const n = players.length;
  if (n < 2) return players.map(p => ({ ...p, delta: 0 }));
  return players.map(player => {
    let expectedScore = 0, actualScore = 0;
    for (const opp of players) {
      if (opp.id === player.id) continue;
      expectedScore += 1 / (1 + Math.pow(10, (opp.elo - player.elo) / 400));
      if (player.rank < opp.rank) actualScore += 1;
      else if (player.rank === opp.rank) actualScore += 0.5;
    }
    return { ...player, delta: Math.round((K_PAIRWISE / (n - 1)) * (actualScore - expectedScore)) };
  });
}

function calcAvgOpponentDelta(athleteElo, finalRank, total, avgOppElo) {
  if (total <= 1) return 0;
  const actual = (total - finalRank) / (total - 1);
  const expected = 1 / (1 + Math.pow(10, (avgOppElo - athleteElo) / 400));
  return Math.round(K_TOURNAMENT * (actual - expected));
}

function clampElo(elo) { return Math.max(ELO_FLOOR, elo); }

function assignRanks(sorted) {
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    const rank = (i > 0 && sorted[i].score === sorted[i - 1].score)
      ? result[i - 1].rank
      : i + 1;
    result.push({ ...sorted[i], rank });
  }
  return result;
}

// ── Test Infrastructure ───────────────────────────────────────────────────────
const TS = Date.now();
const TAG = `test_agent_${TS}`;

const results = { passed: 0, failed: 0, skipped: 0 };
const createdIds = { dailyTournId: null, boTournId: null, interCompId: null };

function ok(msg)   { console.log(`  ✅ ${msg}`); results.passed++; }
function fail(msg, err = null) {
  console.log(`  ❌ ${msg}`);
  if (err?.message) console.log(`     → ${err.message}`);
  results.failed++;
}
function skip(msg) { console.log(`  ⏭  ${msg}`); results.skipped++; }
function info(msg) { console.log(`  ℹ️  ${msg}`); }

function assert(condition, msg, err = null) {
  condition ? ok(msg) : fail(msg, err instanceof Error ? err : err ? new Error(String(err?.message ?? err)) : null);
  return condition;
}

// ── Agents ────────────────────────────────────────────────────────────────────
// 5 agents with varying ELO to make results interesting
const AGENTS = [
  { username: `Alpha_${TS}`,   email: `alpha.${TAG}@test.athlex.io`,   startElo: 1200, id: null, elo: 1200 },
  { username: `Bravo_${TS}`,   email: `bravo.${TAG}@test.athlex.io`,   startElo: 1050, id: null, elo: 1050 },
  { username: `Charlie_${TS}`, email: `charlie.${TAG}@test.athlex.io`, startElo: 1000, id: null, elo: 1000 },
  { username: `Delta_${TS}`,   email: `delta.${TAG}@test.athlex.io`,   startElo:  950, id: null, elo:  950 },
  { username: `Echo_${TS}`,    email: `echo.${TAG}@test.athlex.io`,    startElo:  900, id: null, elo:  900 },
];

async function createAgents() {
  console.log('\n── Agent Setup ──────────────────────────────────────────────────────────────');
  const password = `AthleX_Test_${TS}!`;

  for (const agent of AGENTS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: agent.email,
      password,
      email_confirm: true,
    });
    if (!assert(!error, `Create auth user ${agent.username}`, error)) continue;
    agent.id = data.user.id;

    // Upsert profile (in case the DB trigger didn't fire in test env)
    const { error: pErr } = await supabase.from('profiles').upsert({
      id: agent.id,
      email: agent.email,
      username: agent.username,
      role: 'athlete',
      level: 'rx',
      elo: agent.elo,
      total_matches: 0,
      wins: 0,
    }, { onConflict: 'id' });
    assert(!pErr, `Profile created for ${agent.username} (ELO: ${agent.elo})`, pErr);
  }

  const valid = AGENTS.filter(a => a.id).length;
  info(`${valid}/5 agents ready`);
}

async function deleteAgents() {
  for (const agent of AGENTS) {
    if (!agent.id) continue;
    await supabase.auth.admin.deleteUser(agent.id);
  }
  ok('Test agents deleted from auth.users');
}

// ── Suite 1: Daily Tournament ─────────────────────────────────────────────────
async function testDailyTournament() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Suite 1 — Daily Tournament (mini-tournoi, pairwise ELO)               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const agents = AGENTS.filter(a => a.id);
  if (agents.length < 2) { skip('Not enough agents created'); return null; }

  // ── 1a. Create tournament ─────────────────────────────────────────────────
  const { data: tourn, error: tErr } = await supabase.from('daily_tournaments').insert({
    creator_id: agents[0].id,
    wod_name: `[TEST] AMRAP 10min ${TAG}`,
    wod_type: 'AMRAP',
    duration: 10,
    level: 'rx',
    movements: '10 Burpees\n10 Air Squats\n10 Box Jumps',
    score_mode: 'reps',
    max_players: 5,
    status: 'open',
    elo_reward: 25,
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
  }).select('id').single();
  if (!assert(!tErr && !!tourn, 'Create daily tournament', tErr)) return null;
  const tournId = tourn.id;
  createdIds.dailyTournId = tournId;
  info(`Tournament ID: ${tournId.slice(0, 8)}...`);

  // ── 1b. Agents join ───────────────────────────────────────────────────────
  console.log('\n  Joining...');
  for (const agent of agents) {
    const { error } = await supabase.from('daily_tournament_participants').upsert({
      tournament_id: tournId,
      user_id: agent.id,
    }, { onConflict: 'tournament_id,user_id', ignoreDuplicates: true });
    assert(!error, `${agent.username} joins`, error);
  }

  // Verify participant count
  const { count: partCount } = await supabase
    .from('daily_tournament_participants')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournId);
  assert(partCount === agents.length, `Participant count = ${partCount} (expected ${agents.length})`);

  // ── 1c. Submit scores (reps — higher = better) ────────────────────────────
  //   Alpha:85  Bravo:72  Charlie:91  Delta:68  Echo:79
  //   Expected rank: Alpha=2, Bravo=4, Charlie=1, Delta=5, Echo=3
  const SCORES = [85, 72, 91, 68, 79];
  console.log('\n  Submitting scores...');
  for (let i = 0; i < agents.length; i++) {
    const { error } = await supabase.from('daily_tournament_scores').upsert({
      tournament_id: tournId,
      user_id: agents[i].id,
      score_value: SCORES[i],
      rx: true,
    }, { onConflict: 'tournament_id,user_id' });
    assert(!error, `${agents[i].username} scores ${SCORES[i]} reps`, error);
  }

  // ── 1d. Duplicate score must be rejected (unique constraint) ──────────────
  const { error: dupErr } = await supabase.from('daily_tournament_scores').insert({
    tournament_id: tournId,
    user_id: agents[0].id,
    score_value: 999,
    rx: true,
  });
  assert(!!dupErr, 'Duplicate score INSERT rejected (unique constraint enforced)');

  // ── 1e. Close tournament ──────────────────────────────────────────────────
  const { error: closeErr } = await supabase.from('daily_tournaments')
    .update({ status: 'completed', ends_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', tournId);
  assert(!closeErr, 'Tournament closed (status=completed)', closeErr);

  // Verify no re-open to open (status transition integrity)
  const { data: check } = await supabase.from('daily_tournaments').select('status').eq('id', tournId).single();
  assert(check?.status === 'completed', `Status persisted as "completed" (got "${check?.status}")`);

  // ── 1f. Compute ELO (reps: desc sort → rank) ─────────────────────────────
  console.log('\n  Computing ELO...');
  const withScores = agents.map((a, i) => ({ ...a, score: SCORES[i] }))
    .sort((a, b) => b.score - a.score); // desc for reps
  const ranked = assignRanks(withScores);
  const rankedPlayers = ranked.map(a => ({ id: a.id, elo: a.elo, rank: a.rank }));
  const eloResults = calculatePairwiseDeltas(rankedPlayers);

  // ── 1g. Apply ELO + insert history ───────────────────────────────────────
  for (const r of eloResults) {
    const agent = AGENTS.find(a => a.id === r.id);
    const entry = ranked.find(s => s.id === r.id);
    const newElo = clampElo(agent.elo + r.delta);

    const { error: histErr } = await supabase.from('daily_tournament_elo_history').upsert({
      tournament_id: tournId,
      user_id: r.id,
      elo_before: agent.elo,
      elo_after: newElo,
      elo_delta: r.delta,
      final_rank: entry.rank,
    }, { onConflict: 'tournament_id,user_id' });
    assert(!histErr,
      `${agent.username} ELO history: rank ${entry.rank}, delta ${r.delta >= 0 ? '+' : ''}${r.delta} → ${newElo}`,
      histErr);

    const { error: rpcErr } = await supabase.rpc('update_user_elo', {
      p_user_id: r.id,
      p_new_elo: newElo,
      p_increment_matches: 1,
      p_increment_wins: entry.rank === 1 ? 1 : 0,
    });
    assert(!rpcErr, `ELO updated via RPC for ${agent.username}`, rpcErr);
    agent.elo = newElo;
  }

  // ── 1h. Verify ELO in DB matches our computation ──────────────────────────
  console.log('\n  Verifying ELO in DB...');
  for (const agent of agents) {
    const { data: profile } = await supabase.from('profiles').select('elo').eq('id', agent.id).single();
    assert(profile?.elo === agent.elo,
      `DB ELO matches for ${agent.username}: expected ${agent.elo}, got ${profile?.elo}`);
  }

  // Verify history completeness
  const { count: histCount } = await supabase
    .from('daily_tournament_elo_history')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournId);
  assert(histCount === agents.length, `ELO history: ${histCount}/${agents.length} entries`);

  // ── 1i. Verify ELO sum is approximately preserved (zero-sum property) ─────
  const totalDelta = eloResults.reduce((s, r) => s + r.delta, 0);
  assert(Math.abs(totalDelta) <= agents.length,
    `ELO sum near zero (total delta = ${totalDelta >= 0 ? '+' : ''}${totalDelta})`);

  console.log('\n  📊 Score Summary:');
  ranked.forEach(a => {
    const r = eloResults.find(e => e.id === a.id);
    console.log(`     ${a.rank}. ${a.username.split('_')[0].padEnd(8)} ${a.score} reps  ELO delta: ${r.delta >= 0 ? '+' : ''}${r.delta}`);
  });

  return tournId;
}

// ── Suite 2: BO Tournament ────────────────────────────────────────────────────
async function testBOTournament() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Suite 2 — BO Tournament (avg-opponent ELO, For Time)                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const agents = AGENTS.filter(a => a.id);
  if (agents.length < 2) { skip('Not enough agents'); return null; }

  // Box jetable dédiée : la suite n'emprunte jamais une box existante.
  const ownerEmail = `owner.${TAG}@test.athlex.io`;
  const ownerPassword = `AthleX_Test_${TS}!`;
  const ownerId = await createUser(supabase, {
    email: ownerEmail,
    password: ownerPassword,
    username: `AgtOwner_${TS}`,
    role: 'box_owner',
  });
  const boxId = await createOwnedBox(supabase, { tag: TAG, ownerId });
  onCleanup(() => dropBoxAndOwner(supabase, boxId, ownerId));
  const box = { id: boxId, name: `[TEST] Box ${TAG}` };
  info(`Box jetable : "${box.name}" (${box.id.slice(0, 8)}...)`);

  const { client: asOwner } = await signInAs(ownerEmail, ownerPassword);

  // update_user_elo n'est exécutable que par service_role : un JWT owner doit
  // être refusé, sinon n'importe quel client pourrait réécrire un ELO.
  const { error: eloGuardErr } = await asOwner.rpc('update_user_elo', {
    p_user_id: agents[0].id, p_new_elo: 9999, p_increment_matches: 0, p_increment_wins: 0,
  });
  assert(!!eloGuardErr, 'update_user_elo refusé à un JWT owner (réservé service_role)');

  // ── 2a. Create tournament ─────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];
  // Créé avec le JWT de l'owner : la RLS de `tournaments` est réellement exercée.
  const { data: tourn, error: tErr } = await asOwner.from('tournaments').insert({
    box_id: box.id,
    created_by: ownerId,
    name: `[TEST] BO Tournament ${TAG}`,
    description: 'Automated reliability test — safe to delete',
    status: 'open',
    level: 'rx',
    start_date: today,
    end_date: tomorrow,
    max_participants: 10,
  }).select('id').single();
  if (!assert(!tErr && !!tourn, 'Create BO tournament', tErr)) return null;
  const tournId = tourn.id;
  createdIds.boTournId = tournId;
  info(`Tournament ID: ${tournId.slice(0, 8)}...`);

  // ── 2b. Create 1 WOD ─────────────────────────────────────────────────────
  const { data: wod, error: wErr } = await supabase.from('tournament_wods').insert({
    tournament_id: tournId,
    order_index: 1,
    title: '[TEST] 21-15-9 Thrusters / Pull-ups',
    description: 'For Time: 21-15-9 Thrusters (43kg) + Pull-ups',
    type: 'For Time',
    duration_minutes: 15,
    movements: JSON.stringify([
      { name: 'Thrusters', reps: [21, 15, 9] },
      { name: 'Pull-ups', reps: [21, 15, 9] },
    ]),
    scoring: 'Temps total (mm:ss)',
    deadline_hours: 24,
    status: 'active',
  }).select('id').single();
  if (!assert(!wErr && !!wod, 'Create tournament WOD', wErr)) return null;

  // ── 2c. Register agents ───────────────────────────────────────────────────
  console.log('\n  Registering...');
  for (const agent of agents) {
    const { error } = await supabase.from('tournament_participants').insert({
      tournament_id: tournId,
      athlete_id: agent.id,
      score: 0,
    });
    // Ignore duplicate (23505) if re-run
    if (error && error.code !== '23505') {
      assert(false, `${agent.username} registers`, error);
    } else {
      assert(true, `${agent.username} registered`);
    }
  }

  // ── 2d. Submit scores (For Time — lower = better, in seconds) ─────────────
  //   Alpha:180s  Bravo:240s  Charlie:165s  Delta:210s  Echo:195s
  //   Expected rank: Charlie=1, Alpha=2, Echo=3, Delta=4, Bravo=5
  const SCORES = [180, 240, 165, 210, 195];
  console.log('\n  Submitting scores...');
  for (let i = 0; i < agents.length; i++) {
    const mins = Math.floor(SCORES[i] / 60);
    const secs = SCORES[i] % 60;
    const { error } = await supabase.from('tournament_scores').insert({
      tournament_id: tournId,
      tournament_wod_id: wod.id,
      athlete_id: agents[i].id,
      score_value: `${mins}:${String(secs).padStart(2, '0')}`,
      status: 'validated',
    });
    assert(!error, `${agents[i].username} scores ${SCORES[i]}s (${mins}:${String(secs).padStart(2, '0')})`, error);
  }

  // Duplicate score must fail (unique constraint on wod+athlete)
  const { error: dupErr } = await supabase.from('tournament_scores').insert({
    tournament_id: tournId,
    tournament_wod_id: wod.id,
    athlete_id: agents[0].id,
    score_value: '0:01',
    status: 'validated',
  });
  assert(!!dupErr, 'Duplicate tournament score rejected (unique constraint per wod+athlete)');

  // ── 2e. Close tournament ──────────────────────────────────────────────────
  const { error: closeErr } = await supabase.from('tournaments')
    .update({ status: 'completed' })
    .eq('id', tournId);
  assert(!closeErr, 'BO tournament closed (status=completed)', closeErr);

  // ── 2f. Compute avg-opponent ELO ──────────────────────────────────────────
  console.log('\n  Computing ELO (avg-opponent)...');
  const withScores = agents.map((a, i) => ({ ...a, score: SCORES[i] }))
    .sort((a, b) => a.score - b.score); // asc for time
  const ranked = assignRanks(withScores);

  const avgElo = Math.round(agents.reduce((s, a) => s + a.elo, 0) / agents.length);
  info(`Average ELO among participants: ${avgElo}`);

  for (const entry of ranked) {
    const delta = calcAvgOpponentDelta(entry.elo, entry.rank, ranked.length, avgElo);
    const newElo = clampElo(entry.elo + delta);

    const { error: histErr } = await supabase.from('tournament_elo_history').upsert({
      tournament_id: tournId,
      athlete_id: entry.id,
      final_rank: entry.rank,
      participants_count: ranked.length,
      avg_opponent_elo: avgElo,
      elo_before: entry.elo,
      elo_after: newElo,
      elo_change: delta,
    }, { onConflict: 'tournament_id,athlete_id' });
    assert(!histErr,
      `${entry.username} BO ELO history: rank ${entry.rank}, delta ${delta >= 0 ? '+' : ''}${delta}`,
      histErr);

    const { error: rpcErr } = await supabase.rpc('update_user_elo', {
      p_user_id: entry.id,
      p_new_elo: newElo,
      p_increment_matches: 1,
      p_increment_wins: entry.rank === 1 ? 1 : 0,
    });
    assert(!rpcErr, `ELO updated via RPC for ${entry.username} (${entry.elo} → ${newElo})`, rpcErr);
    entry.elo = newElo;
    AGENTS.find(a => a.id === entry.id).elo = newElo;
  }

  // ── 2g. Verify history in DB ──────────────────────────────────────────────
  const { count: histCount } = await supabase
    .from('tournament_elo_history')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournId);
  assert(histCount === agents.length, `BO ELO history: ${histCount}/${agents.length} entries`);

  // ── 2h. Verify each profile ELO ───────────────────────────────────────────
  console.log('\n  Verifying ELO in DB...');
  for (const agent of agents) {
    const { data: profile } = await supabase.from('profiles').select('elo').eq('id', agent.id).single();
    assert(profile?.elo === agent.elo,
      `DB ELO matches for ${agent.username}: expected ${agent.elo}, got ${profile?.elo}`);
  }

  console.log('\n  📊 Score Summary:');
  ranked.forEach(a => {
    const mins = Math.floor(a.score / 60);
    const secs = a.score % 60;
    const histDelta = calcAvgOpponentDelta(a.startElo, a.rank, ranked.length, avgElo);
    console.log(`     ${a.rank}. ${a.username.split('_')[0].padEnd(8)} ${mins}:${String(secs).padStart(2, '0')}  ELO delta: ${histDelta >= 0 ? '+' : ''}${histDelta}`);
  });

  return tournId;
}

// ── Suite 3: Inter-box Competition ────────────────────────────────────────────
async function testInterCompetition() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Suite 3 — Inter-box Competition (standings view)                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const agents = AGENTS.filter(a => a.id);
  if (agents.length < 2) { skip('Not enough agents'); return null; }

  // ── 3a. Create competition (service role bypasses super_admin RLS) ────────
  const { data: comp, error: cErr } = await supabase.from('inter_competitions').insert({
    title: `[TEST] Inter-box ${TAG}`,
    description: 'Automated test — safe to delete',
    format: 'league',
    type: 'individual',
    team_size: 1,
    status: 'open',
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    max_participants: 20,
    created_by: agents[0].id,
  }).select('id').single();
  if (!assert(!cErr && !!comp, 'Create inter-box competition', cErr)) return null;
  const compId = comp.id;
  createdIds.interCompId = compId;
  info(`Competition ID: ${compId.slice(0, 8)}...`);

  // ── 3b. Create 1 revealed WOD ─────────────────────────────────────────────
  const { data: wod, error: wErr } = await supabase.from('inter_competition_wods').insert({
    competition_id: compId,
    title: '[TEST] Open WOD 1',
    description: 'AMRAP 10min: 10 Burpees, 10 Box Jumps (60cm), 10 KB Swings (24kg)',
    order_index: 1,
    time_cap: 10,
    scoring_type: 'reps',
    revealed_at: new Date(Date.now() - 1000).toISOString(),
  }).select('id').single();
  if (!assert(!wErr && !!wod, 'Create inter-box WOD (revealed)', wErr)) return null;

  // ── 3c. Register agents ───────────────────────────────────────────────────
  console.log('\n  Registering...');
  for (const agent of agents) {
    const { error } = await supabase.from('inter_registrations').insert({
      competition_id: compId,
      athlete_id: agent.id,
      status: 'active',
    });
    assert(!error, `${agent.username} registers for inter-box`, error);
  }

  // Duplicate registration must fail
  const { error: dupRegErr } = await supabase.from('inter_registrations').insert({
    competition_id: compId,
    athlete_id: agents[0].id,
    status: 'active',
  });
  assert(!!dupRegErr, 'Duplicate inter registration rejected (unique constraint)');

  // ── 3d. Submit scores (reps — higher = better) ────────────────────────────
  //   Alpha:95  Bravo:78  Charlie:110  Delta:82  Echo:101
  //   Expected rank (standings): Charlie=1, Echo=2, Alpha=3, Delta=4, Bravo=5
  const SCORES = [95, 78, 110, 82, 101];
  console.log('\n  Submitting scores...');
  for (let i = 0; i < agents.length; i++) {
    const { error } = await supabase.from('inter_scores').insert({
      competition_id: compId,
      wod_id: wod.id,
      athlete_id: agents[i].id,
      score_value: SCORES[i],
      score_display: `${SCORES[i]} reps`,
      status: 'validated',
    });
    assert(!error, `${agents[i].username} scores ${SCORES[i]} reps`, error);
  }

  // ── 3e. Verify standings view ─────────────────────────────────────────────
  console.log('\n  Verifying standings view...');
  const { data: standings, error: sErr } = await supabase
    .from('inter_standings')
    .select('athlete_id, username, score_value, rank')
    .eq('competition_id', compId)
    .eq('wod_id', wod.id)
    .order('rank', { ascending: true });

  assert(!sErr && standings?.length === agents.length,
    `Standings view returns ${standings?.length ?? 'ERROR'} entries (expected ${agents.length})`, sErr);

  if (standings?.length > 0) {
    // Best scorer (score 110) should be rank 1
    const expectedWinner = agents[SCORES.indexOf(Math.max(...SCORES))]; // Charlie
    assert(standings[0].athlete_id === expectedWinner.id,
      `Rank 1 is ${expectedWinner.username} with ${Math.max(...SCORES)} reps`);

    // Worst scorer (score 78) should be last
    const expectedLast = agents[SCORES.indexOf(Math.min(...SCORES))]; // Bravo
    assert(standings[standings.length - 1].athlete_id === expectedLast.id,
      `Last place is ${expectedLast.username} with ${Math.min(...SCORES)} reps`);
  }

  // ── 3f. Test score edit (update own score) ────────────────────────────────
  // Update Bravo to 90 reps (above Delta 82 → Bravo moves from 5th to 4th)
  const { error: editErr } = await supabase.from('inter_scores')
    .update({ score_value: 90, score_display: '90 reps (corrected)' })
    .eq('competition_id', compId)
    .eq('wod_id', wod.id)
    .eq('athlete_id', agents[1].id); // Bravo: 78 → 90
  assert(!editErr, `Score update (Bravo: 78 → 90 reps)`, editErr);

  // Verify standings re-sorted: Delta (82) is now last, not Bravo (90)
  const { data: updatedStandings } = await supabase
    .from('inter_standings')
    .select('athlete_id, score_value, rank')
    .eq('competition_id', compId)
    .eq('wod_id', wod.id)
    .order('rank', { ascending: true });
  const lastEntry = updatedStandings?.[updatedStandings.length - 1];
  const expectedLastAgent = agents[3]; // Delta with 82 reps
  assert(lastEntry?.athlete_id === expectedLastAgent.id,
    `Standings re-sorted: last place is now ${expectedLastAgent.username} (82 reps), not Bravo (90 reps)`);

  // ── 3g. Close competition ─────────────────────────────────────────────────
  const { error: closeErr } = await supabase.from('inter_competitions')
    .update({ status: 'closed' })
    .eq('id', compId);
  assert(!closeErr, 'Inter-box competition closed (status=closed)', closeErr);

  // Draft competitions should not be visible via regular RLS (test with anon)
  // (Can't test RLS with service role — this is documented as a manual test)
  info('Note: RLS "draft competitions invisible to non-admin" must be tested manually with anon key');

  console.log('\n  📊 Final Standings:');
  const finalStandings = updatedStandings ?? [];
  finalStandings.forEach(s => {
    const agent = agents.find(a => a.id === s.athlete_id);
    console.log(`     ${s.rank}. ${(agent?.username ?? '?').split('_')[0].padEnd(8)} ${s.score_value} reps`);
  });

  return compId;
}

// ── Suite 4: Edge Cases ───────────────────────────────────────────────────────
async function testEdgeCases() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Suite 4 — Edge Cases                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  // ELO: 1-player tournament returns delta=0
  const singlePlayer = [{ id: 'fake-id', elo: 1000, rank: 1 }];
  const singleResult = calculatePairwiseDeltas(singlePlayer);
  assert(singleResult[0].delta === 0, 'Pairwise ELO with 1 player → delta = 0');

  // ELO: 2 players, equal ELO, winner gets ~+K/2
  const equalPlayers = [
    { id: 'p1', elo: 1000, rank: 1 },
    { id: 'p2', elo: 1000, rank: 2 },
  ];
  const equalResult = calculatePairwiseDeltas(equalPlayers);
  assert(equalResult[0].delta > 0 && equalResult[1].delta < 0,
    `Equal ELO 2-player: winner +${equalResult[0].delta}, loser ${equalResult[1].delta}`);
  assert(equalResult[0].delta + equalResult[1].delta === 0,
    'Zero-sum ELO: winner.delta + loser.delta = 0');

  // ELO: tied rank (same score) → both get delta ≈ 0 (vs each other)
  const tiedPlayers = [
    { id: 'p1', elo: 1000, rank: 1 },
    { id: 'p2', elo: 1000, rank: 1 }, // tied
    { id: 'p3', elo: 1000, rank: 3 },
  ];
  const tiedResult = calculatePairwiseDeltas(tiedPlayers);
  assert(tiedResult[2].delta < 0, 'Tied rank: last place loses ELO');

  // ELO floor clamping
  assert(clampElo(-500) === ELO_FLOOR,
    `ELO floor: clampElo(-500) = ${ELO_FLOOR}`);
  assert(clampElo(500) === 500,
    'ELO floor: clampElo(500) = 500 (above floor, unchanged)');

  // avg-opponent: only 1 participant → delta = 0
  const avgDelta1 = calcAvgOpponentDelta(1000, 1, 1, 1000);
  assert(avgDelta1 === 0, `avg-opponent ELO with 1 participant → delta = ${avgDelta1}`);

  // avg-opponent: winner against stronger field earns more
  const weakWinner = calcAvgOpponentDelta(900, 1, 5, 1100);
  const strongWinner = calcAvgOpponentDelta(1100, 1, 5, 900);
  assert(weakWinner > strongWinner,
    `Upset bonus: weak winner (ELO 900 vs avg 1100) gains ${weakWinner} > strong winner (ELO 1100 vs avg 900) gains ${strongWinner}`);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanup() {
  if (KEEP_DATA) {
    info('--keep-data flag set: skipping DB cleanup');
    info(`  Daily tournament: ${createdIds.dailyTournId ?? 'none'}`);
    info(`  BO tournament:    ${createdIds.boTournId ?? 'none'}`);
    info(`  Inter-box comp:   ${createdIds.interCompId ?? 'none'}`);
    info(`  Agents: ${AGENTS.filter(a => a.id).map(a => a.email).join(', ')}`);
    return;
  }

  console.log('\n── Cleanup ──────────────────────────────────────────────────────────────────');

  // Delete competitions (cascades to scores, history, participants, etc.)
  if (createdIds.dailyTournId) {
    const { error } = await supabase.from('daily_tournaments').delete().eq('id', createdIds.dailyTournId);
    assert(!error, 'Daily tournament + cascade deleted', error);
  }
  if (createdIds.boTournId) {
    const { error } = await supabase.from('tournaments').delete().eq('id', createdIds.boTournId);
    assert(!error, 'BO tournament + cascade deleted', error);
  }
  if (createdIds.interCompId) {
    const { error } = await supabase.from('inter_competitions').delete().eq('id', createdIds.interCompId);
    assert(!error, 'Inter-box competition + cascade deleted', error);
  }

  // Delete agents
  await deleteAgents();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║          AthleX — Multi-Agent Tournament Reliability Test               ║');
  console.log(`║  Tag: ${TAG.slice(0, 55).padEnd(55)} ║`);
  console.log(`║  Mode: ${KEEP_DATA ? 'keep data' : 'auto-cleanup'} ${' '.repeat(KEEP_DATA ? 46 : 42)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  onCleanup(cleanup);
  try {
    await createAgents();
    await testDailyTournament();
    await testBOTournament();
    await testInterCompetition();
    await testEdgeCases();
  } finally {
    await runCleanup();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = results.passed + results.failed + results.skipped;
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS  ${results.passed} passed · ${results.failed} failed · ${results.skipped} skipped · ${total} total`
    .padEnd(75) + '║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (results.failed > 0) {
    console.error(`❌  ${results.failed} test(s) failed — check output above\n`);
    process.exit(1);
  } else {
    console.log(`✅  All tests passed!\n`);
  }
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message ?? err);
  runCleanup().finally(() => process.exit(1));
});
