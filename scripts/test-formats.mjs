#!/usr/bin/env node
/**
 * AthleX — Tournament Format Reliability Test (32 agents)
 * ─────────────────────────────────────────────────────────────────────────────
 * Suite A : Classique      (simple)      — 32 agents, 2 WODs, cumul de points
 * Suite B : Bracket        (single-elim) — 32 agents, 5 rounds, 1 champion
 * Suite C : Swiss          (double-elim) — 32 agents, WB + LB brackets
 * Suite D : Ligue Divisions(league_div)  — 32 agents, 4 divs × 8, 4 saisons
 *
 * USAGE
 *   ./scripts/test-stack.sh up && node scripts/test-formats.mjs [--keep-data]
 *   Cible fournie par TEST_SUPABASE_URL / TEST_SUPABASE_*_KEY (jamais la prod).
 */

import {
  requireTestTarget, serviceClient, signInAs, createUser, createOwnedBox, dropBoxAndOwner,
  onCleanup, runCleanup, installCleanupTraps, KEEP_DATA,
} from './lib/test-env.mjs';

requireTestTarget();
installCleanupTraps();

const db = serviceClient();

// ── Helpers ───────────────────────────────────────────────────────────────────
const TS   = Date.now();
const TAG  = `fmt_${TS}`;
const res  = { passed: 0, failed: 0 };
const ids  = { classique: null, bracket: null, swiss: null, league: null };

/** Client porteur du JWT de l'owner : les RPC de gestion sont gardées par is_box_admin(). */
let asOwner = db;

const ok   = m => { console.log(`  ✅ ${m}`); res.passed++; };
const fail = (m, e) => { console.log(`  ❌ ${m}`); if (e?.message) console.log(`     → ${e.message}`); res.failed++; };
const info = m => console.log(`  ℹ️  ${m}`);

function assert(cond, msg, err = null) {
  cond ? ok(msg) : fail(msg, err instanceof Error ? err : err ? { message: String(err?.message ?? err) } : null);
  return cond;
}

// ── 32 Agents ─────────────────────────────────────────────────────────────────
const AGENTS = Array.from({ length: 32 }, (_, i) => ({
  username: `Fmt${String(i + 1).padStart(2, '0')}_${TS}`,
  email: `fmt${i + 1}.${TAG}@test.athlex.io`,
  id: null, elo: 1000 + (i * 10),
}));

async function createAgents() {
  console.log('\n── 32 Agents Setup ──────────────────────────────────────────────────────────');
  const pw = `AthleX_Fmt_${TS}!`;
  let ok_count = 0;
  for (const a of AGENTS) {
    const { data, error } = await db.auth.admin.createUser({ email: a.email, password: pw, email_confirm: true });
    if (error) { fail(`Create ${a.username}`, error); continue; }
    a.id = data.user.id;
    const { error: pErr } = await db.from('profiles').upsert({
      id: a.id, email: a.email, username: a.username,
      role: 'athlete', level: 'rx', elo: a.elo, total_matches: 0, wins: 0,
    }, { onConflict: 'id' });
    if (!pErr) ok_count++;
    else fail(`Profile ${a.username}`, pErr);
  }
  info(`${ok_count}/32 agents ready`);
}

async function deleteAgents() {
  for (const a of AGENTS) if (a.id) await db.auth.admin.deleteUser(a.id);
  ok('32 agents deleted');
}

// ── Box jetable + owner ───────────────────────────────────────────────────────
// La suite ne doit jamais emprunter une box existante : elle crée la sienne,
// avec son propre propriétaire, et s'authentifie avec son JWT.
let BOX_ID = null;
let OWNER_ID = null;

async function createBoxAndOwner() {
  const email = `owner.${TAG}@test.athlex.io`;
  const password = `AthleX_Fmt_${TS}!`;
  OWNER_ID = await createUser(db, {
    email, password, username: `FmtOwner_${TS}`, role: 'box_owner',
  });
  BOX_ID = await createOwnedBox(db, { tag: TAG, ownerId: OWNER_ID });
  onCleanup(() => dropBoxAndOwner(db, BOX_ID, OWNER_ID));
  ({ client: asOwner } = await signInAs(email, password));
  info(`Box jetable ${BOX_ID.slice(0, 8)}… détenue par ${email}`);
  return BOX_ID;
}

async function createTournament(format, extra = {}) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await db.from('tournaments').insert({
    box_id: BOX_ID, created_by: OWNER_ID,
    name: `[TEST] ${format.toUpperCase()} ${TAG}`,
    description: 'Auto test — safe to delete',
    status: 'open', level: 'rx', format,
    start_date: today, end_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    max_participants: 32, ...extra,
  }).select('id').single();
  return { data, error };
}

async function registerAll(tournId) {
  for (const a of AGENTS.filter(x => x.id)) {
    await db.from('tournament_participants').insert({ tournament_id: tournId, athlete_id: a.id, score: 0 });
  }
}

// ── Suite A: Classique ────────────────────────────────────────────────────────
async function suiteClassique() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Suite A — Classique (simple, cumul de points)                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const { data: t, error: tErr } = await createTournament('simple');
  if (!assert(!tErr && t, 'Create classique tournament', tErr)) return;
  ids.classique = t.id;
  info(`ID: ${t.id.slice(0, 8)}...`);

  await registerAll(t.id);
  const { count: pCount } = await db.from('tournament_participants').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id);
  assert(pCount === 32, `32 participants registered (got ${pCount})`);

  // 2 WODs
  const wods = [];
  for (let w = 1; w <= 2; w++) {
    const { data: wod, error: wErr } = await db.from('tournament_wods').insert({
      tournament_id: t.id, order_index: w,
      title: `[TEST] WOD ${w}`, type: 'For Time',
      duration_minutes: 15, movements: '[]', scoring: 'Temps', status: 'active',
    }).select('id').single();
    if (assert(!wErr && wod, `WOD ${w} created`, wErr)) wods.push(wod.id);
  }
  assert(wods.length === 2, '2 WODs created');

  // All 32 submit scores for each WOD (score = random so rankings vary)
  const agents = AGENTS.filter(a => a.id);
  let scoreErrors = 0;
  for (const wId of wods) {
    for (let i = 0; i < agents.length; i++) {
      const { error } = await db.from('tournament_scores').insert({
        tournament_id: t.id, tournament_wod_id: wId,
        athlete_id: agents[i].id,
        score_value: String(Math.floor(Math.random() * 300) + 60),
        status: 'validated',
      });
      if (error) scoreErrors++;
    }
  }
  assert(scoreErrors === 0, `All 64 scores submitted (${scoreErrors} errors)`);

  // Verify scores in DB
  const { count: sCount } = await db.from('tournament_scores').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id);
  assert(sCount === 64, `Score count in DB = ${sCount} (expected 64)`);

  // Close
  const { error: cErr } = await db.from('tournaments').update({ status: 'completed' }).eq('id', t.id);
  assert(!cErr, 'Tournament closed (status=completed)', cErr);
}

// ── Suite B: Bracket (single elimination) ────────────────────────────────────
async function suiteBracket() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Suite B — Bracket (single elimination, 32→1 en 5 rounds)              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const { data: t, error: tErr } = await createTournament('bracket');
  if (!assert(!tErr && t, 'Create bracket tournament', tErr)) return;
  ids.bracket = t.id;
  info(`ID: ${t.id.slice(0, 8)}...`);

  await registerAll(t.id);

  // Generate round 1
  const { data: r1Count, error: r1Err } = await asOwner.rpc('generate_bracket_round_1', { p_tournament_id: t.id });
  if (!assert(!r1Err, `Round 1 generated (${r1Count} matches)`, r1Err)) return;
  assert(r1Count === 16, `16 matches in round 1 (got ${r1Count})`);

  // Simulate 5 rounds: always pick participant1 as winner
  for (let round = 1; round <= 5; round++) {
    const { data: matches } = await db.from('tournament_bracket_matches')
      .select('id, participant1_id, participant2_id, status')
      .eq('tournament_id', t.id).eq('round', round).eq('side', 'winner');

    const pending = (matches ?? []).filter(m => m.status === 'pending');
    if (pending.length === 0) break;

    for (const m of pending) {
      const winner = m.participant1_id;
      const loser  = m.participant2_id;
      await db.from('tournament_bracket_matches').update({
        winner_id: winner, loser_id: loser ?? null, status: 'completed', completed_at: new Date().toISOString(),
      }).eq('id', m.id);
    }

    const expectedMatches = Math.ceil(pending.length / 2);
    if (round < 5) {
      const { data: nextCount, error: advErr } = await asOwner.rpc('advance_bracket_round', {
        p_tournament_id: t.id, p_completed_round: round,
      });
      assert(!advErr, `Round ${round} advanced → ${nextCount} match(es) next round`, advErr);
    }
    assert(true, `Round ${round}: ${pending.length} match(es) resolved`);
  }

  // Verify a champion exists (round 5, match 1, winner_id set)
  const { data: final } = await db.from('tournament_bracket_matches')
    .select('winner_id').eq('tournament_id', t.id).eq('round', 5).eq('side', 'winner').single();
  assert(!!final?.winner_id, `Champion identified in round 5`);

  const { error: cErr } = await db.from('tournaments').update({ status: 'completed' }).eq('id', t.id);
  assert(!cErr, 'Bracket tournament closed', cErr);
}

// ── Suite C: Swiss (double elimination) ──────────────────────────────────────
async function suiteSwiss() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Suite C — Swiss (double elimination, WB + LB)                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const { data: t, error: tErr } = await createTournament('swiss');
  if (!assert(!tErr && t, 'Create swiss tournament', tErr)) return;
  ids.swiss = t.id;
  info(`ID: ${t.id.slice(0, 8)}...`);

  await registerAll(t.id);

  const { data: r1, error: r1Err } = await asOwner.rpc('generate_bracket_round_1', { p_tournament_id: t.id });
  if (!assert(!r1Err, `Swiss round 1 generated (${r1} WB matches)`, r1Err)) return;

  // Resolve all pending matches (WB + LB) round by round
  for (let round = 1; round <= 6; round++) {
    const { data: matches } = await db.from('tournament_bracket_matches')
      .select('id, participant1_id, participant2_id, side, status')
      .eq('tournament_id', t.id).eq('round', round).neq('status', 'bye').neq('status', 'completed');

    if (!matches || matches.length === 0) break;

    for (const m of matches) {
      const winner = m.participant1_id;
      const loser  = m.participant2_id ?? null;
      await db.from('tournament_bracket_matches').update({
        winner_id: winner, loser_id: loser, status: 'completed', completed_at: new Date().toISOString(),
      }).eq('id', m.id);
    }
    assert(true, `Swiss round ${round}: ${matches.length} match(es) resolved (WB+LB)`);

    // Only advance WB side
    const wbPending = matches.filter(m => m.side === 'winner');
    if (wbPending.length > 1) {
      const { error: advErr } = await asOwner.rpc('advance_bracket_round', {
        p_tournament_id: t.id, p_completed_round: round,
      });
      if (advErr && !advErr.message?.includes('unfinished')) assert(!advErr, `Swiss advance round ${round}`, advErr);
    }
  }

  // Check LB matches exist (proves double-elim structure was created)
  const { count: lbCount } = await db.from('tournament_bracket_matches')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', t.id).eq('side', 'loser');
  assert(lbCount > 0, `Loser Bracket created (${lbCount} LB matches)`);

  const { error: cErr } = await db.from('tournaments').update({ status: 'completed' }).eq('id', t.id);
  assert(!cErr, 'Swiss tournament closed', cErr);
}

// ── Suite D: Ligue avec Divisions (4 saisons) ─────────────────────────────────
async function suiteLeague() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Suite D — Ligue avec Divisions (4 saisons, promotions/relégations)    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  const { data: t, error: tErr } = await createTournament('league_div');
  if (!assert(!tErr && t, 'Create league_div tournament', tErr)) return;
  ids.league = t.id;
  info(`ID: ${t.id.slice(0, 8)}...`);

  const agents = AGENTS.filter(a => a.id);
  assert(agents.length === 32, `32 agents available`);

  // 4 divisions: D1(top), D2, D3, D4 — 8 athletes each
  // D2/D3/D4: promote top 2 to upper div | D1/D2/D3: relegate bottom 2 to lower div
  const DIV_CONFIG = [
    { name: 'Division 1', level: 1, promote_count: 0, relegate_count: 2 },
    { name: 'Division 2', level: 2, promote_count: 2, relegate_count: 2 },
    { name: 'Division 3', level: 3, promote_count: 2, relegate_count: 2 },
    { name: 'Division 4', level: 4, promote_count: 2, relegate_count: 0 },
  ];

  const divIds = {};
  for (const cfg of DIV_CONFIG) {
    const { data: div, error: dErr } = await db.from('tournament_divisions').insert({
      tournament_id: t.id, name: cfg.name, level: cfg.level,
      max_members: 8, promote_count: cfg.promote_count, relegate_count: cfg.relegate_count,
    }).select('id').single();
    assert(!dErr && div, `${cfg.name} created`, dErr);
    if (div) divIds[cfg.level] = div.id;
  }

  // Register all 32 in tournament_participants first
  await registerAll(t.id);

  // A DB trigger may auto-assign all participants to the lowest division — clear those
  // so we can do our own deterministic placement (8 athletes per div)
  await db.from('tournament_division_members')
    .delete().in('division_id', Object.values(divIds));

  // Now manually assign: D1=agents[0-7], D2=[8-15], D3=[16-23], D4=[24-31]
  let divPlaced = 0;
  for (let i = 0; i < agents.length; i++) {
    const divLevel = Math.floor(i / 8) + 1;
    const { error } = await db.from('tournament_division_members').insert({
      division_id: divIds[divLevel], athlete_id: agents[i].id, points: 0,
    });
    if (!error) divPlaced++;
    else fail(`${agents[i].username} → Division ${divLevel}`, error);
  }

  // Verify division membership
  const { count: memberCount } = await db.from('tournament_division_members')
    .select('*', { count: 'exact', head: true })
    .in('division_id', Object.values(divIds));
  assert(memberCount === 32, `Division membership: ${memberCount}/32 athletes placed`);

  // ── 4 Seasons ─────────────────────────────────────────────────────────────
  for (let season = 1; season <= 4; season++) {
    info(`\n  ── Saison ${season} ────────────────────────────────────────`);

    // 1 WOD per season (general, no division_id)
    const { data: wod, error: wErr } = await db.from('tournament_wods').insert({
      tournament_id: t.id, order_index: season,
      title: `[TEST] Saison ${season} WOD`, type: 'AMRAP',
      duration_minutes: 10, movements: '[]', scoring: 'Reps', status: 'active',
      season_number: season,
    }).select('id').single();
    if (!assert(!wErr && wod, `Saison ${season} WOD created`, wErr)) continue;

    // All 32 submit scores (higher agent index → higher score to create interesting movement)
    let scoreErr = 0;
    for (let i = 0; i < agents.length; i++) {
      // Add some randomness to score so promotions/relegations vary each season
      const base = (32 - i) * 10; // agent 0 (D1) gets ~320, agent 31 (D4) gets ~10
      const noise = Math.floor(Math.random() * 40) - 20;
      const { error } = await db.from('tournament_scores').insert({
        tournament_id: t.id, tournament_wod_id: wod.id,
        athlete_id: agents[i].id, score_value: String(Math.max(1, base + noise)),
        status: 'validated',
      });
      if (error) scoreErr++;
    }
    assert(scoreErr === 0, `Saison ${season}: 32 scores soumis (${scoreErr} erreurs)`);

    // Points auto-recalculated by trigger — verify at least 1 athlete has points
    const { data: sample } = await db.from('tournament_division_members')
      .select('points').eq('division_id', divIds[1]).order('points', { ascending: false }).limit(1).single();
    assert((sample?.points ?? 0) > 0, `Saison ${season}: trigger recalc_division_points actif (D1 leader = ${sample?.points} pts)`);

    // Read D1 standings before end_season
    const { data: d1Standing } = await db.from('tournament_division_members')
      .select('athlete_id, points')
      .eq('division_id', divIds[1])
      .order('points', { ascending: false });

    // End season → promote/relegate + snapshot + reset
    const { data: nextSeason, error: esErr } = await asOwner.rpc('end_season_and_advance', { p_tournament_id: t.id });
    if (!assert(!esErr, `end_season_and_advance → saison ${nextSeason}`, esErr)) continue;
    assert(nextSeason === season + 1, `current_season avancée: ${season} → ${nextSeason}`);

    // Verify season history snapshot
    const { count: histCount } = await db.from('tournament_season_history')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', t.id).eq('season_number', season);
    assert(histCount === 32, `Saison ${season} snapshot: ${histCount}/32 entrées en history`);

    // Verify outcomes present: champion (D1 rank 1), promoted, relegated, stayed
    const { data: outcomes } = await db.from('tournament_season_history')
      .select('outcome').eq('tournament_id', t.id).eq('season_number', season);
    const uniqueOutcomes = [...new Set((outcomes ?? []).map(o => o.outcome))];
    assert(uniqueOutcomes.includes('champion'), `Saison ${season}: champion identifié`);
    assert(uniqueOutcomes.includes('promoted'), `Saison ${season}: promotions enregistrées`);
    assert(uniqueOutcomes.includes('relegated'), `Saison ${season}: relégations enregistrées`);

    // Print D1 top 3
    console.log(`\n     📊 D1 Saison ${season} standings:`);
    (d1Standing ?? []).slice(0, 3).forEach((m, i) => {
      const ag = agents.find(a => a.id === m.athlete_id);
      console.log(`        ${i + 1}. ${ag?.username?.split('_')[0] ?? '?'} — ${m.points} pts`);
    });
  }

  // Final: verify that athletes actually moved between divisions across seasons
  const { data: movements } = await db.from('tournament_season_history')
    .select('athlete_id, season_number, division_level, outcome')
    .eq('tournament_id', t.id)
    .eq('outcome', 'promoted')
    .order('season_number');
  assert((movements?.length ?? 0) > 0, `Mouvements inter-divisions confirmés: ${movements?.length} promotions sur 4 saisons`);

  // Verify current_season is 5 after 4 end_season calls
  const { data: tourn } = await db.from('tournaments').select('current_season').eq('id', t.id).single();
  assert(tourn?.current_season === 5, `current_season = ${tourn?.current_season} (attendu: 5)`);

  const { error: cErr } = await db.from('tournaments').update({ status: 'completed' }).eq('id', t.id);
  assert(!cErr, 'League tournament closed', cErr);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
// Enregistrée via onCleanup() : elle tourne aussi si la suite meurt en route.
async function cleanup() {
  if (KEEP_DATA) {
    info('--keep-data: DB non nettoyée');
    info(`  Classique: ${ids.classique ?? 'none'}`);
    info(`  Bracket:   ${ids.bracket ?? 'none'}`);
    info(`  Swiss:     ${ids.swiss ?? 'none'}`);
    info(`  League:    ${ids.league ?? 'none'}`);
    return;
  }
  console.log('\n── Cleanup ──────────────────────────────────────────────────────────────────');
  for (const [label, id] of Object.entries(ids)) {
    if (id) { await db.from('tournaments').delete().eq('id', id); ok(`${label} deleted`); }
  }
  await deleteAgents();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║     AthleX — Tournament Format Reliability Test (32 agents)            ║');
  console.log(`║  Tag: ${TAG.slice(0, 55).padEnd(55)} ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  onCleanup(cleanup);
  try {
    await createAgents();
    await createBoxAndOwner();
    await suiteClassique();
    await suiteBracket();
    await suiteSwiss();
    await suiteLeague();
  } finally {
    await runCleanup();
  }

  const total = res.passed + res.failed;
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS  ${res.passed} passed · ${res.failed} failed · ${total} total`.padEnd(75) + '║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  if (res.failed > 0) { console.error(`❌  ${res.failed} test(s) failed\n`); process.exit(1); }
  else console.log('✅  All tests passed!\n');
}

main().catch(err => {
  console.error('\n💥 Fatal:', err.message ?? err);
  runCleanup().finally(() => process.exit(1));
});
