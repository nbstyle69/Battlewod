#!/usr/bin/env node
/**
 * AthleX — League Detailed Test
 * ─────────────────────────────────────────────────────────────────────────────
 * 32 agents · 4 divisions × 8 · 5 saisons · 4 WODs/saison (1 par division)
 * Points détaillés par WOD → classement par division → promotions/relégations
 *
 * Scoring : 1er=100, 2e=97, ..., -3/rang, min 1 pt
 * Promote : top 2 de D2/D3/D4 → division supérieure
 * Relegate: bottom 2 de D1/D2/D3 → division inférieure
 *
 * USAGE
 *   ./scripts/test-stack.sh up && node scripts/test-league-detailed.mjs
 *   Cible fournie par TEST_SUPABASE_URL / TEST_SUPABASE_*_KEY (jamais la prod).
 */

import {
  requireTestTarget, serviceClient, signInAs, createUser, createOwnedBox, dropBoxAndOwner,
  onCleanup, runCleanup, installCleanupTraps,
} from './lib/test-env.mjs';

requireTestTarget();
installCleanupTraps();

const db = serviceClient();

/** Client JWT de l'owner : end_season_and_advance est gardée par is_box_admin(). */
let asOwner = db;

const TS  = Date.now();
const TAG = `league_${TS}`;
let passed = 0, failed = 0;
const ok   = m => { console.log(`  ✅ ${m}`); passed++; };
const fail = (m, e) => { console.log(`  ❌ ${m}${e ? '\n     → ' + (e.message ?? e) : ''}`); failed++; };
const assert = (c, m, e = null) => { c ? ok(m) : fail(m, e); return c; };
const hr = c => `─`.repeat(c ?? 60);

// ── 32 agents ────────────────────────────────────────────────────────────────
const AGENTS = Array.from({ length: 32 }, (_, i) => ({
  username: `L${String(i + 1).padStart(2, '0')}_${TS}`,
  email: `l${i + 1}.${TAG}@test.athlex.io`,
  id: null,
}));

let tournId = null;
const divIds = {}; // level → uuid

// ── Setup ────────────────────────────────────────────────────────────────────
async function setup() {
  console.log('\n── Création des 32 agents ───────────────────────────────────────────────────');
  const pw = `AthleX!${TS}`;
  let n = 0;
  for (const a of AGENTS) {
    const { data, error } = await db.auth.admin.createUser({ email: a.email, password: pw, email_confirm: true });
    if (error) { fail(`Auth ${a.username}`, error); continue; }
    a.id = data.user.id;
    const { error: pErr } = await db.from('profiles').upsert({
      id: a.id, email: a.email, username: a.username,
      role: 'athlete', level: 'rx', elo: 1000, total_matches: 0, wins: 0,
    }, { onConflict: 'id' });
    if (!pErr) n++;
  }
  console.log(`  ✅ ${n}/32 agents prêts`);

  // Box jetable avec son propre owner (jamais une box existante).
  const ownerEmail = `owner.${TAG}@test.athlex.io`;
  const ownerId = await createUser(db, {
    email: ownerEmail, password: pw, username: `LgOwner_${TS}`, role: 'box_owner',
  });
  const boxId = await createOwnedBox(db, { tag: TAG, ownerId });
  onCleanup(() => dropBoxAndOwner(db, boxId, ownerId));
  ({ client: asOwner } = await signInAs(ownerEmail, pw));
  console.log(`  ✅ Box jetable ${boxId.slice(0, 8)}…`);

  // Tournoi league_div
  const today = new Date().toISOString().split('T')[0];
  const { data: t, error: tErr } = await db.from('tournaments').insert({
    box_id: boxId, created_by: ownerId,
    name: `[TEST-LEAGUE] ${TAG}`,
    description: 'Auto test détaillé — safe to delete',
    status: 'open', level: 'rx', format: 'league_div',
    start_date: today,
    end_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    max_participants: 32,
  }).select('id').single();
  assert(!tErr && t, 'Tournoi league_div créé', tErr);
  tournId = t?.id;

  // 4 divisions (2 promotions/relégations sauf extrêmes)
  const DIV_CFG = [
    { name: 'Division 1 (Élite)', level: 1, promote_count: 0, relegate_count: 2 },
    { name: 'Division 2 (Pro)',   level: 2, promote_count: 2, relegate_count: 2 },
    { name: 'Division 3 (Inter)', level: 3, promote_count: 2, relegate_count: 2 },
    { name: 'Division 4 (Scaled)',level: 4, promote_count: 2, relegate_count: 0 },
  ];
  for (const cfg of DIV_CFG) {
    const { data: d, error } = await db.from('tournament_divisions').insert({
      tournament_id: tournId, ...cfg, max_members: 8,
    }).select('id').single();
    assert(!error && d, `${cfg.name} créée`, error);
    if (d) divIds[cfg.level] = d.id;
  }

  // Enregistrement + placement dans divisions
  const agents = AGENTS.filter(a => a.id);
  for (const a of agents) {
    await db.from('tournament_participants').insert({ tournament_id: tournId, athlete_id: a.id, score: 0 });
  }
  // Clear auto-trigger assignment, then place manually
  await db.from('tournament_division_members').delete().in('division_id', Object.values(divIds));
  for (let i = 0; i < agents.length; i++) {
    const level = Math.floor(i / 8) + 1;
    await db.from('tournament_division_members').insert({
      division_id: divIds[level], athlete_id: agents[i].id, points: 0,
    });
  }
  const { count } = await db.from('tournament_division_members')
    .select('*', { count: 'exact', head: true }).in('division_id', Object.values(divIds));
  assert(count === 32, `32/32 athlètes placés en divisions`);
}

// ── Saison ───────────────────────────────────────────────────────────────────
async function runSeason(season) {
  const DIV_LABELS = { 1: 'D1 Élite', 2: 'D2 Pro', 3: 'D3 Inter', 4: 'D4 Scaled' };
  const WOD_TYPES  = ['For Time', 'AMRAP', 'EMOM', 'Max Reps'];

  console.log(`\n${'═'.repeat(74)}`);
  console.log(`  SAISON ${season}`);
  console.log(`${'═'.repeat(74)}`);

  // 1 WOD par division
  const wodIds = {};
  for (let level = 1; level <= 4; level++) {
    const { data: wod, error } = await db.from('tournament_wods').insert({
      tournament_id: tournId,
      division_id: divIds[level],
      season_number: season,
      order_index: (season - 1) * 4 + level,
      title: `[S${season}] WOD ${DIV_LABELS[level]} — ${WOD_TYPES[level - 1]}`,
      type: WOD_TYPES[level - 1],
      duration_minutes: 12,
      movements: '[]',
      scoring: level === 2 ? 'Temps' : 'Reps',
      status: 'active',
    }).select('id').single();
    assert(!error && wod, `WOD créé pour ${DIV_LABELS[level]}`, error);
    if (wod) wodIds[level] = wod.id;
  }

  // Scores : chaque athlète soumet pour le WOD de sa division
  const { data: members } = await db.from('tournament_division_members')
    .select('athlete_id, division_id, points')
    .in('division_id', Object.values(divIds));

  const divisionOf = {}; // athleteId → divLevel
  for (const m of members ?? []) {
    const level = Object.entries(divIds).find(([, id]) => id === m.division_id)?.[0];
    if (level) divisionOf[m.athlete_id] = parseInt(level);
  }

  const agentScores = {}; // athleteId → score soumis
  for (const a of AGENTS.filter(x => x.id)) {
    const level = divisionOf[a.id];
    if (!level || !wodIds[level]) continue;
    const score = Math.floor(Math.random() * 150) + 50; // 50–200
    agentScores[a.id] = score;
    await db.from('tournament_scores').insert({
      tournament_id: tournId,
      tournament_wod_id: wodIds[level],
      athlete_id: a.id,
      score_value: String(score),
      status: 'validated',
    });
  }

  // Laisser le trigger recalculer, puis afficher standings
  for (let level = 1; level <= 4; level++) {
    const { data: standing } = await db.from('tournament_division_members')
      .select('athlete_id, points')
      .eq('division_id', divIds[level])
      .order('points', { ascending: false });

    const promoCount = level > 1 ? 2 : 0;
    const relegCount = level < 4 ? 2 : 0;

    console.log(`\n  ${DIV_LABELS[level]} ${hr(40 - DIV_LABELS[level].length)}`);
    console.log(`  ${'Rang'.padEnd(5)} ${'Athlète'.padEnd(15)} ${'Score WOD'.padEnd(12)} ${'Pts total'.padEnd(12)} Statut`);
    console.log(`  ${hr(60)}`);

    (standing ?? []).forEach((m, idx) => {
      const ag = AGENTS.find(a => a.id === m.athlete_id);
      const name = ag?.username?.split('_')[0] ?? '?';
      const wodScore = agentScores[m.athlete_id] ?? '-';
      const rank = idx + 1;
      const size = standing.length;

      let status = '';
      if (rank <= promoCount) status = '🟢 PROMU';
      else if (rank > size - relegCount) status = '🔴 RELÉGUÉ';
      else status = '⬜ stable';

      console.log(`  ${String(rank).padEnd(5)} ${name.padEnd(15)} ${String(wodScore).padEnd(12)} ${String(m.points).padEnd(12)} ${status}`);
    });

    const topPts = standing?.[0]?.points ?? 0;
    assert(topPts > 0, `${DIV_LABELS[level]}: points recalculés (leader = ${topPts} pts)`);
  }

  // Snapshot + promote/relegate
  const { data: nextSeason, error: esErr } = await asOwner.rpc('end_season_and_advance', { p_tournament_id: tournId });
  assert(!esErr, `Saison ${season} clôturée → passage en saison ${nextSeason}`, esErr);

  // Afficher les mouvements
  const { data: history } = await db.from('tournament_season_history')
    .select('athlete_id, division_name, final_rank, final_points, outcome')
    .eq('tournament_id', tournId)
    .eq('season_number', season)
    .in('outcome', ['promoted', 'relegated', 'champion']);

  if (history && history.length > 0) {
    console.log(`\n  Mouvements saison ${season}:`);
    for (const h of history) {
      const ag = AGENTS.find(a => a.id === h.athlete_id);
      const name = ag?.username?.split('_')[0] ?? '?';
      const icon = h.outcome === 'champion' ? '🏆' : h.outcome === 'promoted' ? '🟢' : '🔴';
      console.log(`    ${icon} ${name.padEnd(8)} ${h.outcome.padEnd(10)} | ${h.division_name} rang ${h.final_rank} (${h.final_points} pts)`);
    }
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanup() {
  console.log('\n── Cleanup ──────────────────────────────────────────────────────────────────');
  if (tournId) { await db.from('tournaments').delete().eq('id', tournId); console.log('  ✅ Tournoi supprimé'); }
  for (const a of AGENTS) if (a.id) await db.auth.admin.deleteUser(a.id);
  console.log('  ✅ 32 agents supprimés');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   AthleX — League Détaillée · 32 agents · 4 divs · 5 saisons · 4 WODs ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  onCleanup(cleanup);
  try {
    await setup();
    for (let s = 1; s <= 5; s++) await runSeason(s);

    // Résumé final: qui a bougé le plus ?
    const { data: allHistory } = await db.from('tournament_season_history')
      .select('athlete_id, season_number, division_level, outcome')
      .eq('tournament_id', tournId)
      .order('athlete_id').order('season_number');

    const trajectories = {};
    for (const h of allHistory ?? []) {
      if (!trajectories[h.athlete_id]) trajectories[h.athlete_id] = [];
      trajectories[h.athlete_id].push(`S${h.season_number}:D${h.division_level}`);
    }

    console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║  TRAJECTOIRES (division par saison)                                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════╝');
    for (const a of AGENTS.filter(x => x.id)) {
      const traj = (trajectories[a.id] ?? []).join(' → ');
      const name = a.username.split('_')[0];
      console.log(`  ${name.padEnd(8)} ${traj}`);
    }

    const { data: promotions } = await db.from('tournament_season_history')
      .select('*', { count: 'exact' }).eq('tournament_id', tournId).eq('outcome', 'promoted');
    const { data: relegations } = await db.from('tournament_season_history')
      .select('*', { count: 'exact' }).eq('tournament_id', tournId).eq('outcome', 'relegated');
    const { data: champions } = await db.from('tournament_season_history')
      .select('*', { count: 'exact' }).eq('tournament_id', tournId).eq('outcome', 'champion');

    console.log(`\n  📊 Total mouvements sur 5 saisons:`);
    console.log(`     🟢 Promotions  : ${promotions?.length ?? 0}`);
    console.log(`     🔴 Relégations : ${relegations?.length ?? 0}`);
    console.log(`     🏆 Champions   : ${champions?.length ?? 0}`);

  } finally {
    await runCleanup();
  }

  const total = passed + failed;
  console.log(`\n${'═'.repeat(74)}`);
  console.log(`  RÉSULTATS  ${passed} ✅ · ${failed} ❌ · ${total} total`);
  console.log(`${'═'.repeat(74)}\n`);
  if (failed > 0) { process.exit(1); }
}

main().catch(e => { console.error('\n💥 Fatal:', e.message); runCleanup().finally(() => process.exit(1)); });
