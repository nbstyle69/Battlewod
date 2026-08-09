#!/usr/bin/env node
/**
 * AthleX — Athlete (App Mobile) Test
 * ─────────────────────────────────────────────────────────────────────────────
 * Simule toutes les actions d'un athlète côté app mobile :
 *
 *  Suite 1 — Profil             : UPDATE username/bio/full_name, PR (personal records)
 *  Suite 2 — Whiteboard WOD     : SUBMIT score, READ leaderboard, comment, réaction
 *  Suite 3 — Mini-Tournoi       : CREATE, JOIN, SUBMIT scores, VALIDATE, CONTEST, COMPLETE, ELO
 *  Suite 4 — Tournoi BO         : REGISTER (participant), SUBMIT score WOD
 *  Suite 5 — Amis               : SEARCH, SEND request, ACCEPT, LIST, DECLINE, CANCEL
 *  Suite 6 — Réservation        : BOOK créneau, READ mes réservations, CANCEL
 *  Suite 7 — Messages           : SEND message box, REACT à un message
 *  Suite 8 — Leaderboard        : READ global top 10, READ box members ELO ranking
 *  Suite 9 — Générateur WOD     : SAVE generated WOD, toggle favorite, mark benchmark, SUBMIT score, DELETE
 *  Suite 10 — Inter-Compétition : CREATE (individuel + équipe), REGISTER, CREATE team, INVITE, ACCEPT, SUBMIT score
 *  Suite 11 — Minuteur            : timer sans vidéo (incrément total_timer_sessions), avec vidéo (même incrément, vidéo locale uniquement)
 */

import {
  requireTestTarget, serviceClient, createUser, createOwnedBox, dropBoxAndOwner,
  onCleanup, runCleanup, installCleanupTraps,
} from './lib/test-env.mjs';

requireTestTarget();
installCleanupTraps();

const db = serviceClient();

const TS  = Date.now();
const TAG = `ath_${TS}`;
let passed = 0, failed = 0;
const ok     = m => { console.log(`  ✅ ${m}`); passed++; };
const fail   = (m, e) => { console.log(`  ❌ ${m}${e ? '\n     → ' + (e.message ?? JSON.stringify(e)) : ''}`); failed++; };
const assert = (c, m, e = null) => { c ? ok(m) : fail(m, e); return c; };
const sep    = label => console.log(`\n${'═'.repeat(72)}\n  Suite — ${label}\n${'─'.repeat(72)}`);

// ── Shared state ──────────────────────────────────────────────────────────────
let box = null;
let A = null, B = null, C = null;   // 3 athlete agents

// Shared test resources (created in setup, cleaned up at end)
let testWodId       = null;    // box_wod for whiteboard
let testScheduleId  = null;    // class_schedule for reservation
let testTournamentId = null;   // BO tournament for registration
let testTournWodId  = null;    // tournament WOD
let testDailyTournId = null;   // mini-tournoi
let testInterCompId  = null;   // inter-compétition
let testInterWodId   = null;   // inter-competition WOD
let testInterTeamId  = null;   // inter-team created by A

const cleanup = { authIds: [] };

// ── Agent factory ─────────────────────────────────────────────────────────────
async function createAthlete(n) {
  const email = `ath_${n}_${TAG}@test.athlex.io`;
  const { data: auth } = await db.auth.admin.createUser({ email, password: `AthleX!${TS}`, email_confirm: true });
  const id = auth?.user?.id;
  if (!id) return null;
  cleanup.authIds.push(id);
  await db.from('profiles').upsert({
    id, email, username: `AthAgent${n}_${TS}`, role: 'athlete',
    level: 'rx', elo: 1000, total_matches: 0, wins: 0,
  }, { onConflict: 'id' });
  await db.from('box_members').insert({
    box_id: box.id, member_id: id, status: 'active', role: 'member',
    joined_at: new Date().toISOString(),
  });
  return { id, email, username: `AthAgent${n}_${TS}` };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
async function setup() {
  console.log('\n── Setup: box + 3 athlete agents + test resources ──────────────────────────');

  // Box jetable avec son propre owner : aucune box existante n'est empruntée.
  const ownerId = await createUser(db, {
    email: `owner.${TAG}@test.athlex.io`,
    password: `AthleX!${TS}`,
    username: `AthOwner_${TS}`,
    role: 'box_owner',
  });
  const boxId = await createOwnedBox(db, { tag: TAG, ownerId });
  onCleanup(() => dropBoxAndOwner(db, boxId, ownerId));
  box = { id: boxId, name: `[TEST] Box ${TAG}` };
  assert(!!box.id, `Box jetable créée: "${box.name}"`);

  [A, B, C] = await Promise.all([createAthlete('A'), createAthlete('B'), createAthlete('C')]);
  assert(A && B && C, '3 athlete agents créés & joints à la box');

  // Test WOD (box_wod) for whiteboard
  const today = new Date().toISOString().split('T')[0];
  const { data: wod } = await db.from('box_wods').insert({
    box_id: box.id, created_by: A.id,
    title: `[TEST-ATH] WOD ${TAG}`, description: '3 rounds: 21-15-9', wod_type: 'for-time',
    scheduled_date: today, time_cap_seconds: 900, rounds: 3, is_published: true, sort_order: 99,
  }).select('id').single();
  testWodId = wod?.id;
  assert(!!testWodId, 'WOD whiteboard de test créé');

  // Test schedule for reservation (set in the future to bypass cutoff)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const { data: sched } = await db.from('class_schedules').insert({
    box_id: box.id, title: `[TEST-ATH] Créneau ${TAG}`, description: 'Test',
    coach: 'Coach Test', scheduled_date: tomorrow, start_time: '09:00', end_time: '10:00', max_capacity: 15,
  }).select('id').single();
  testScheduleId = sched?.id;
  assert(!!testScheduleId, 'Créneau de test créé (demain)');

  // Test BO tournament + WOD for registration suite
  const { data: tourn } = await db.from('tournaments').insert({
    box_id: box.id, created_by: A.id,
    name: `[TEST-ATH] Tournoi ${TAG}`, status: 'open', level: 'rx', format: 'simple',
    start_date: today, end_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    max_participants: 10,
  }).select('id').single();
  testTournamentId = tourn?.id;

  if (testTournamentId) {
    const { data: tw } = await db.from('tournament_wods').insert({
      tournament_id: testTournamentId, order_index: 1, title: 'WOD test ATH',
      type: 'AMRAP', duration_minutes: 12, movements: '[]', scoring: 'Reps', status: 'active',
    }).select('id').single();
    testTournWodId = tw?.id;
  }
  assert(!!testTournamentId && !!testTournWodId, 'Tournoi BO + WOD créés pour test inscription');
}

// ── Suite 1 — Profil ──────────────────────────────────────────────────────────
async function suiteProfil() {
  sep('Profil (mise à jour)');

  // UPDATE infos de base
  const { error: uErr } = await db.from('profiles').update({
    full_name: `Athlete Test ${TS}`, bio: 'Je suis un agent de test AthleX.',
    username: `Updated_${A.username.slice(-6)}`,
  }).eq('id', A.id);
  assert(!uErr, 'UPDATE profil: full_name, bio, username', uErr);

  const { data: p } = await db.from('profiles').select('full_name, bio').eq('id', A.id).single();
  assert(p?.bio === 'Je suis un agent de test AthleX.', `Bio mise à jour: "${p?.bio}"`);

  // UPDATE personal records (JSONB)
  const prs = { 'Back Squat': '120kg', 'Clean & Jerk': '90kg', 'Snatch': '75kg', 'Fran': '4:32' };
  const { error: prErr } = await db.from('profiles').update({ personal_records: prs }).eq('id', A.id);
  assert(!prErr, 'UPDATE personal records (Back Squat, C&J, Snatch, Fran)', prErr);

  const { data: prRead } = await db.from('profiles').select('personal_records').eq('id', A.id).single();
  const loaded = prRead?.personal_records;
  assert(loaded?.['Back Squat'] === '120kg' && loaded?.['Fran'] === '4:32', `PR sauvegardés: BS=${loaded?.['Back Squat']}, Fran=${loaded?.['Fran']}`);
}

// ── Suite 2 — Whiteboard WOD ──────────────────────────────────────────────────
async function suiteWhiteboard() {
  sep('Whiteboard WOD (scores, commentaires, réactions)');

  // READ WOD du jour
  const { data: wod } = await db.from('box_wods').select('title, is_published').eq('id', testWodId).single();
  assert(wod?.is_published, `READ WOD publié: "${wod?.title}"`);

  // SUBMIT score (A, B, C — upsert)
  const scores = [{ id: A.id, val: 420 }, { id: B.id, val: 380 }, { id: C.id, val: 310 }];
  let submitted = 0;
  for (const s of scores) {
    const { error } = await db.from('wod_scores').upsert({
      wod_id: testWodId, member_id: s.id, box_id: box.id,
      score_type: 'time', score_value: s.val, rx: true, scaled: false,
    }, { onConflict: 'wod_id,member_id' });
    if (!error) submitted++;
  }
  assert(submitted === 3, `SUBMIT ${submitted}/3 scores (for-time en secondes)`);

  // READ leaderboard
  const { data: lb } = await db.from('wod_scores')
    .select('member_id, score_value, rx')
    .eq('wod_id', testWodId)
    .order('score_value', { ascending: true });
  assert(lb && lb.length === 3, `Leaderboard: ${lb?.length} scores (tri croissant for-time)`);
  assert(lb?.[0]?.score_value === 310, `1er (meilleur for-time): ${lb?.[0]?.score_value}s (C=310 < B=380 < A=420)`);  

  // READ score ID (A's score) pour comment + reaction
  const { data: myScore } = await db.from('wod_scores').select('id').eq('wod_id', testWodId).eq('member_id', A.id).single();
  const scoreId = myScore?.id;
  assert(!!scoreId, `Score ID de A récupéré`);

  // COMMENT on score (B commente le score de A)
  const { data: comment, error: cmtErr } = await db.from('score_comments').insert({
    score_id: scoreId, author_id: B.id, content: 'Super perf ! 💪',
  }).select('id').single();
  assert(!cmtErr && comment, 'COMMENT: B commente le score de A', cmtErr);

  // REACT to score (C réagit au score de A)
  const { error: rxErr } = await db.from('score_reactions').insert({
    score_id: scoreId, user_id: C.id, emoji: '🔥',
  });
  assert(!rxErr, 'REACT: C réagit 🔥 au score de A', rxErr);

  // READ comments + reactions
  const [{ count: cmtCount }, { count: rxCount }] = await Promise.all([
    db.from('score_comments').select('*', { count: 'exact', head: true }).eq('score_id', scoreId),
    db.from('score_reactions').select('*', { count: 'exact', head: true }).eq('score_id', scoreId),
  ]);
  assert(cmtCount >= 1, `${cmtCount} commentaire(s) sur le score`);
  assert(rxCount >= 1, `${rxCount} réaction(s) sur le score`);
}

// ── Suite 3 — Mini-Tournoi ────────────────────────────────────────────────────
async function suiteMiniTournoi() {
  sep('Mini-Tournoi (daily tournament: CREATE → JOIN → SUBMIT → VALIDATE → COMPLETE)');

  // CREATE (by A)
  const { data: dt, error: dtErr } = await db.from('daily_tournaments').insert({
    creator_id: A.id,
    wod_name: `[TEST-ATH] Fran ${TAG}`,
    wod_type: 'For Time',
    duration: 10,
    level: 'rx',
    movements: '21-15-9 Thrusters 43kg\n21-15-9 Pull-ups',
    score_mode: 'time',
    gender_target: 'mix',
    status: 'open',
    ends_at: new Date(Date.now() + 12 * 3600000).toISOString(),
  }).select('id').single();
  assert(!dtErr && dt, 'CREATE mini-tournoi (Fran 10min)', dtErr);
  testDailyTournId = dt?.id;

  // JOIN (A auto-join as creator, B et C joins)
  let joined = 0;
  for (const ag of [A, B, C]) {
    const { error } = await db.from('daily_tournament_participants').upsert(
      { tournament_id: testDailyTournId, user_id: ag.id },
      { onConflict: 'tournament_id,user_id', ignoreDuplicates: true }
    );
    if (!error) joined++;
  }
  assert(joined === 3, `JOIN: ${joined}/3 agents inscrits`);

  // SUBMIT scores (A=210s, B=250s, C=300s → for-time, lower=better)
  const dtScores = [{ ag: A, v: 210 }, { ag: B, v: 250 }, { ag: C, v: 300 }];
  let dtSubmitted = 0;
  for (const { ag, v } of dtScores) {
    const { error } = await db.from('daily_tournament_scores').upsert({
      tournament_id: testDailyTournId, user_id: ag.id,
      score_value: v, rx: true, status: 'pending',
    }, { onConflict: 'tournament_id,user_id' });
    if (!error) dtSubmitted++;
  }
  assert(dtSubmitted === 3, `SUBMIT ${dtSubmitted}/3 scores (mini-tournoi)`);

  // VALIDATE score de A (par B)
  const { error: valErr } = await db.from('daily_tournament_scores')
    .update({ status: 'validated' })
    .eq('tournament_id', testDailyTournId).eq('user_id', A.id);
  assert(!valErr, `VALIDATE score de A par B`, valErr);

  // CONTEST score de C (par A)
  const { error: cstErr } = await db.from('daily_tournament_scores')
    .update({ status: 'contested', contested_by: A.id, contest_reason: 'Pas de vidéo fournie' })
    .eq('tournament_id', testDailyTournId).eq('user_id', C.id);
  assert(!cstErr, `CONTEST score de C par A`, cstErr);

  // Verify statuses
  const { data: dist } = await db.from('daily_tournament_scores')
    .select('user_id, status').eq('tournament_id', testDailyTournId);
  const statuses = Object.fromEntries((dist ?? []).map(s => [s.user_id, s.status]));
  assert(statuses[A.id] === 'validated', `Score A: ${statuses[A.id]}`);
  assert(statuses[C.id] === 'contested', `Score C: ${statuses[C.id]}`);

  // COMPLETE tournament
  const { error: compErr } = await db.from('daily_tournaments')
    .update({ status: 'completed' }).eq('id', testDailyTournId);
  assert(!compErr, 'COMPLETE mini-tournoi (status=completed)', compErr);

  // ELO history (A: 1er → delta positif attendu)
  const ranked = [
    { id: A.id, elo: 1000, rank: 1 },
    { id: B.id, elo: 1000, rank: 2 },
    { id: C.id, elo: 1000, rank: 3 },
  ];
  const histRows = ranked.map((r, i) => {
    const delta = i === 0 ? 30 : i === 1 ? 0 : -15;
    return {
      tournament_id: testDailyTournId, user_id: r.id,
      elo_before: 1000, elo_after: 1000 + delta, elo_delta: delta, final_rank: r.rank,
    };
  });
  const { error: eloErr } = await db.from('daily_tournament_elo_history')
    .upsert(histRows, { onConflict: 'tournament_id,user_id' });
  assert(!eloErr, 'ELO history enregistrée (daily_tournament_elo_history)', eloErr);

  const { data: eloCheck } = await db.from('daily_tournament_elo_history')
    .select('user_id, elo_delta, final_rank').eq('tournament_id', testDailyTournId)
    .order('final_rank');
  assert(eloCheck?.[0]?.elo_delta === 30, `ELO A (1er): +${eloCheck?.[0]?.elo_delta}`);
  assert(eloCheck?.[2]?.elo_delta === -15, `ELO C (3ème): ${eloCheck?.[2]?.elo_delta}`);
}

// ── Suite 4 — Tournoi BO (participant) ────────────────────────────────────────
async function suiteTournoiBO() {
  sep('Tournoi BO — vue athlete (inscription + score)');

  // REGISTER (A and B)
  let registered = 0;
  for (const ag of [A, B]) {
    const { error } = await db.from('tournament_participants').insert({
      tournament_id: testTournamentId, athlete_id: ag.id, score: 0,
    });
    if (!error) registered++;
  }
  assert(registered === 2, `REGISTER: ${registered}/2 inscrits au tournoi BO`);

  // SUBMIT score for WOD (A=120 reps, B=100 reps)
  let tScored = 0;
  for (const [ag, val] of [[A, '120'], [B, '100']]) {
    const { error } = await db.from('tournament_scores').insert({
      tournament_id: testTournamentId, tournament_wod_id: testTournWodId,
      athlete_id: ag.id, score_value: val, status: 'pending',
    });
    if (!error) tScored++;
  }
  assert(tScored === 2, `SUBMIT ${tScored}/2 scores pour le WOD du tournoi`);

  // READ my scores
  const { data: myScores } = await db.from('tournament_scores')
    .select('score_value, status').eq('tournament_id', testTournamentId).eq('athlete_id', A.id);
  assert(myScores?.[0]?.score_value === '120', `Mon score: ${myScores?.[0]?.score_value} reps`);
  assert(myScores?.[0]?.status === 'pending', `Statut: ${myScores?.[0]?.status} (en attente validation)`);

  // READ leaderboard (all participants ranked)
  const { data: lbAll } = await db.from('tournament_participants')
    .select('athlete_id, score').eq('tournament_id', testTournamentId).order('score', { ascending: false });
  assert(lbAll && lbAll.length === 2, `Leaderboard: ${lbAll?.length} participants`);
}

// ── Suite 5 — Amis ────────────────────────────────────────────────────────────
async function suiteAmis() {
  sep('Amis (friendships)');

  // SEARCH profiles by username
  const { data: results } = await db.from('profiles')
    .select('id, username, level, elo').ilike('username', `%AthAgent%`)
    .neq('id', A.id).limit(10);
  assert(results && results.length >= 2, `SEARCH: ${results?.length} profils trouvés`);

  // SEND friend request (A → B)
  const { data: req, error: sendErr } = await db.from('friendships').insert({
    requester_id: A.id, addressee_id: B.id, status: 'pending',
  }).select('id').single();
  assert(!sendErr && req, `SEND friend request: A → B`, sendErr);

  // READ pending requests (B's incoming)
  const { data: pending } = await db.from('friendships')
    .select('id, requester_id, status').eq('addressee_id', B.id).eq('status', 'pending');
  assert(pending && pending.length >= 1, `B a ${pending?.length} demande(s) en attente`);

  // ACCEPT request (B accepts A's request)
  const { error: accErr } = await db.from('friendships').update({ status: 'accepted' }).eq('id', req?.id);
  assert(!accErr, `ACCEPT: B accepte la demande de A`, accErr);

  // LIST friends of A
  const { data: friends } = await db.from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${A.id},addressee_id.eq.${A.id}`);
  assert(friends && friends.length >= 1, `A a ${friends?.length} ami(s) accepté(s)`);

  // SEND request (A → C) then CANCEL it
  const { data: reqC, error: cErr } = await db.from('friendships').insert({
    requester_id: A.id, addressee_id: C.id, status: 'pending',
  }).select('id').single();
  assert(!cErr && reqC, 'SEND request A → C', cErr);

  const { error: cancelErr } = await db.from('friendships').delete().eq('id', reqC?.id);
  assert(!cancelErr, 'CANCEL request A → C', cancelErr);

  // SEND request (C → B) then DECLINE
  const { data: reqCB, error: cbErr } = await db.from('friendships').insert({
    requester_id: C.id, addressee_id: B.id, status: 'pending',
  }).select('id').single();
  assert(!cbErr && reqCB, 'SEND request C → B', cbErr);

  const { error: decErr } = await db.from('friendships').update({ status: 'declined' }).eq('id', reqCB?.id);
  assert(!decErr, 'DECLINE: B décline la demande de C', decErr);

  // Cleanup friendships
  if (req?.id) await db.from('friendships').delete().eq('id', req.id);
  if (reqCB?.id) await db.from('friendships').delete().eq('id', reqCB.id);
  ok('Friendships nettoyées');
}

// ── Suite 6 — Réservation ─────────────────────────────────────────────────────
async function suiteReservation() {
  sep('Réservation (class schedules)');

  // BOOK (A) → status=confirmed (places disponibles)
  const { data: resa, error: bookErr } = await db.from('class_reservations').insert({
    schedule_id: testScheduleId, member_id: A.id, box_id: box.id, status: 'confirmed',
  }).select('id').single();
  assert(!bookErr && resa, `BOOK créneau (A) → confirmed`, bookErr);

  // READ mes réservations
  const { data: myResas } = await db.from('class_reservations')
    .select('id, schedule_id, status').eq('member_id', A.id).eq('box_id', box.id);
  assert(myResas && myResas.length >= 1, `READ: ${myResas?.length} réservation(s) pour A`);
  assert(myResas?.[0]?.status === 'confirmed', `Statut: ${myResas?.[0]?.status}`);

  // JOIN waiting list (B) — même créneau
  const { data: resaB, error: waitErr } = await db.from('class_reservations').insert({
    schedule_id: testScheduleId, member_id: B.id, box_id: box.id, status: 'waiting',
  }).select('id').single();
  assert(!waitErr && resaB, 'B → liste d\'attente', waitErr);

  // COUNT participants
  const { count: resaCount } = await db.from('class_reservations')
    .select('*', { count: 'exact', head: true }).eq('schedule_id', testScheduleId);
  assert(resaCount === 2, `${resaCount} participants (1 confirmed + 1 waiting)`);

  // CANCEL (A)
  const { error: cancelErr } = await db.from('class_reservations').delete().eq('id', resa?.id);
  assert(!cancelErr, 'CANCEL réservation de A', cancelErr);

  // CANCEL (B)
  if (resaB?.id) await db.from('class_reservations').delete().eq('id', resaB.id);
  ok('Réservations de B nettoyées');
}

// ── Suite 7 — Messages ────────────────────────────────────────────────────────
async function suiteMessages() {
  sep('Messages (envoi + réaction)');

  // SEND message (A → box global)
  const { data: msg, error: sendErr } = await db.from('messages').insert({
    box_id: box.id, sender_id: A.id, content: `[TEST-ATH] Hello from A ${TAG}`,
    message_type: 'general', is_announcement: false, read_by: [A.id], group_id: null,
  }).select('id').single();
  assert(!sendErr && msg, 'SEND message (A → box global)', sendErr);

  // READ messages de la box
  const { data: msgs } = await db.from('messages')
    .select('id, content, sender_id').eq('box_id', box.id)
    .order('created_at', { ascending: false }).limit(5);
  assert(msgs && msgs.length >= 1, `READ: ${msgs?.length} message(s) récents`);
  assert(msgs?.[0]?.sender_id === A.id, 'Dernier message est celui de A');

  // REACT to message (B réagit au message de A)
  const { error: rxErr } = await db.from('message_reactions').insert({
    message_id: msg?.id, member_id: B.id, emoji: '💪',
  });
  assert(!rxErr, 'REACT: B réagit 💪 au message de A', rxErr);

  // READ reactions
  const { count: rxCount } = await db.from('message_reactions')
    .select('*', { count: 'exact', head: true }).eq('message_id', msg?.id);
  assert(rxCount >= 1, `${rxCount} réaction(s) sur le message`);

  // Cleanup message
  if (msg?.id) {
    await db.from('message_reactions').delete().eq('message_id', msg.id);
    await db.from('messages').delete().eq('id', msg.id);
  }
  ok('Message et réactions nettoyés');
}

// ── Suite 8 — Leaderboard ─────────────────────────────────────────────────────
async function suiteLeaderboard() {
  sep('Leaderboard (lectures)');

  // Global leaderboard — top 10 par ELO
  const { data: global } = await db.from('profiles')
    .select('id, username, elo, level').order('elo', { ascending: false }).limit(10);
  assert(global && global.length > 0, `Global leaderboard: ${global?.length} athletes (top ELO)`);
  assert(global?.[0]?.elo >= global?.[global.length - 1]?.elo, `Tri décroissant ELO: ${global?.[0]?.elo} → ${global?.[global.length - 1]?.elo}`);

  // Box leaderboard — membres de la box triés par ELO
  const { data: boxMembers } = await db.from('box_members')
    .select('member_id, profile:profiles(username, elo, level)')
    .eq('box_id', box.id).eq('status', 'active').limit(20);
  assert(boxMembers && boxMembers.length >= 3, `Box leaderboard: ${boxMembers?.length} membres actifs`);

  // Stats: WODs soumis (compteur global)
  const { count: totalWodScores } = await db.from('wod_scores')
    .select('*', { count: 'exact', head: true }).eq('box_id', box.id);
  assert(totalWodScores !== null, `Total WOD scores soumis dans la box: ${totalWodScores}`);

  // Profil public d'un athlete (simulation vue "PublicProfileScreen")
  const { data: pubProfile } = await db.from('profiles')
    .select('id, username, elo, level, bio, full_name').eq('id', B.id).single();
  assert(!!pubProfile, `Profil public de B: "${pubProfile?.username}" (${pubProfile?.elo} ELO)`);
}

// ── Suite 9 — Générateur WOD (DB) ───────────────────────────────────────────
async function suiteGenerateurWOD() {
  sep('Générateur WOD (sauvegarde DB)');

  // SAVE generated WOD (simule "Sauvegarder" après génération)
  const { data: gWod, error: saveErr } = await db.from('generated_wods').insert({
    user_id: A.id,
    wod_name: `[TEST-ATH] Cindy ${TAG}`,
    wod_type: 'AMRAP',
    movements: '5 Pull-ups\n10 Push-ups\n15 Air Squats',
    level: 'rx',
    duration: 20,
    sport: 'functional',
    format: 'Solo',
    scoring: 'Max rounds en 20 min',
    coach_tip: 'Rythme constant, ne pas partir trop vite.',
    equipment: ['Barre de traction'],
    is_favorite: false,
    is_benchmark: false,
  }).select('id').single();
  assert(!saveErr && gWod, 'SAVE generated WOD (generated_wods)', saveErr);

  // TOGGLE favorite
  const { error: favErr } = await db.from('generated_wods').update({ is_favorite: true }).eq('id', gWod?.id);
  assert(!favErr, 'TOGGLE is_favorite = true', favErr);

  // MARK as benchmark
  const { error: bmErr } = await db.from('generated_wods').update({ is_benchmark: true }).eq('id', gWod?.id);
  assert(!bmErr, 'MARK is_benchmark = true', bmErr);

  // READ historique (WodHistoryScreen)
  const { data: hist } = await db.from('generated_wods')
    .select('*, scores:generated_wod_scores(*)').eq('user_id', A.id)
    .order('created_at', { ascending: false }).limit(10);
  assert(hist && hist.length >= 1, `READ historique: ${hist?.length} WOD(s) sauvegardé(s)`);
  assert(hist?.[0]?.is_favorite === true, `WOD marqué favori`);
  assert(hist?.[0]?.is_benchmark === true, `WOD marqué benchmark`);

  // SUBMIT score for generated WOD (A performe le WOD)
  const { data: gScore, error: gsErr } = await db.from('generated_wod_scores').insert({
    wod_id: gWod?.id, user_id: A.id, score_value: 18, score_type: 'rounds', rx: true,
    notes: 'Bon rythme, unbroken sur pull-ups',
  }).select('id').single();
  assert(!gsErr && gScore, 'SUBMIT score pour WOD généré', gsErr);

  // READ score
  const { data: gsRead } = await db.from('generated_wod_scores')
    .select('score_value, score_type, rx').eq('wod_id', gWod?.id).eq('user_id', A.id);
  assert(gsRead?.[0]?.score_value === 18, `Score lu: ${gsRead?.[0]?.score_value} rounds`);

  // DELETE WOD + scores (cascade expected, or manual)
  await db.from('generated_wod_scores').delete().eq('wod_id', gWod?.id);
  const { error: delErr } = await db.from('generated_wods').delete().eq('id', gWod?.id);
  assert(!delErr, 'DELETE generated WOD (+ scores)', delErr);
}

// ── Suite 11 — Minuteur (avec et sans vidéo) ──────────────────────────────────
async function suiteMinuteur() {
  sep('Minuteur (sans vidéo + avec vidéo)');

  // ── Mode sans vidéo ──────────────────────────────────────────────────────────
  // L'app appelle: incrementCounter(user.id, 'total_timer_sessions', 1, box.id)
  // après arrêt du timer quand withCamera = false

  // READ valeur avant
  const { data: before } = await db.from('profiles')
    .select('total_timer_sessions').eq('id', A.id).single();
  const sessionsBefore = before?.total_timer_sessions ?? 0;
  assert(typeof sessionsBefore === 'number', `READ total_timer_sessions avant: ${sessionsBefore}`);

  // SIMULATE fin de session sans vidéo (équivalent de stopAndSave() withCamera=false)
  const newVal1 = sessionsBefore + 1;
  const { error: incErr1 } = await db.from('profiles')
    .update({ total_timer_sessions: newVal1 }).eq('id', A.id);
  assert(!incErr1, 'INCREMENT total_timer_sessions (sans vidéo)', incErr1);

  // VERIFY
  const { data: after1 } = await db.from('profiles')
    .select('total_timer_sessions').eq('id', A.id).single();
  assert(after1?.total_timer_sessions === newVal1,
    `✓ Sans vidéo: ${sessionsBefore} → ${after1?.total_timer_sessions} (+1)`);

  // ── Mode avec vidéo ───────────────────────────────────────────────────────────
  // La vidéo est enregistrée en LOCAL (MediaLibrary.saveToLibraryAsync + FileSystem JSON)
  // Aucune ligne Supabase Storage — uniquement le même incrément de compteur
  // (après stopVideoAndFinish() → nativeStopRec() → setPhase('done'))

  // SIMULATE fin de session avec vidéo (stopVideoAndFinish → même incrément)
  const newVal2 = newVal1 + 1;
  const { error: incErr2 } = await db.from('profiles')
    .update({ total_timer_sessions: newVal2 }).eq('id', A.id);
  assert(!incErr2, 'INCREMENT total_timer_sessions (avec vidéo)', incErr2);

  // VERIFY
  const { data: after2 } = await db.from('profiles')
    .select('total_timer_sessions').eq('id', A.id).single();
  assert(after2?.total_timer_sessions === newVal2,
    `✓ Avec vidéo: ${newVal1} → ${after2?.total_timer_sessions} (+1)`);

  // NOTE: vidéo → device gallery (MediaLibrary.saveToLibraryAsync) + JSON local
  //        pas d'upload Supabase Storage — aucune ligne DB pour le fichier vidéo
  ok('Vidéo: enregistrée localement (MediaLibrary) — pas de ligne Supabase Storage');

  // RESET (remettre la valeur initiale pour ne pas polluer le profil test)
  await db.from('profiles').update({ total_timer_sessions: sessionsBefore }).eq('id', A.id);
  ok(`Compteur remis à ${sessionsBefore} (cleanup)`);
}

// ── Suite 10 — Inter-Compétition ──────────────────────────────────────────────
async function suiteInterCompetition() {
  sep('Inter-Compétition (individuel + équipe)');

  // CREATE inter-competition (individuelle)
  const { data: comp, error: cErr } = await db.from('inter_competitions').insert({
    created_by: A.id,
    title: `[TEST-ATH] Open ${TAG}`,
    description: 'Compétition de test AthleX',
    format: 'league',
    type: 'individual',
    status: 'open',
    team_size: 1,
    max_participants: 50,
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  }).select('id').single();
  assert(!cErr && comp, 'CREATE inter-compétition (individuelle)', cErr);
  testInterCompId = comp?.id;

  // ADD WOD to competition
  const { data: iWod, error: wErr } = await db.from('inter_competition_wods').insert({
    competition_id: testInterCompId, title: 'WOD 1 — Grace', order_index: 1,
    description: '30 Clean & Jerk For Time (60kg/40kg)', scoring_type: 'time', time_cap: 600,
  }).select('id').single();
  assert(!wErr && iWod, 'ADD WOD à la compétition', wErr);
  testInterWodId = iWod?.id;

  // REGISTER (A individuel)
  const { data: regA, error: rAErr } = await db.from('inter_registrations').insert({
    competition_id: testInterCompId, athlete_id: A.id,
  }).select('id').single();
  assert(!rAErr && regA, 'REGISTER A (individuel)', rAErr);

  // REGISTER (B individuel)
  const { error: rBErr } = await db.from('inter_registrations').insert({
    competition_id: testInterCompId, athlete_id: B.id,
  });
  assert(!rBErr, 'REGISTER B (individuel)', rBErr);

  // READ participants
  const { count: regCount } = await db.from('inter_registrations')
    .select('*', { count: 'exact', head: true }).eq('competition_id', testInterCompId);
  assert(regCount === 2, `${regCount} inscrits à la compétition`);

  // UNREGISTER (B)
  const { error: unregErr } = await db.from('inter_registrations')
    .delete().eq('competition_id', testInterCompId).eq('athlete_id', B.id);
  assert(!unregErr, 'UNREGISTER B (se désinscrire)', unregErr);

  // CREATE team (A capitaine) — pour test équipe
  const { data: team, error: tErr } = await db.from('inter_teams').insert({
    competition_id: testInterCompId, name: `[TEST-ATH] Team Alpha ${TAG}`,
    captain_id: A.id, box_id: box.id,
  }).select('id').single();
  assert(!tErr && team, 'CREATE team (A capitaine)', tErr);
  testInterTeamId = team?.id;

  // INVITE B to team
  const { data: invite, error: invErr } = await db.from('inter_team_members').insert({
    team_id: testInterTeamId, user_id: B.id, status: 'pending',
  }).select('id').single();
  assert(!invErr && invite, 'INVITE B dans l\'équipe (status=pending)', invErr);

  // ACCEPT invite (B)
  const { error: accErr } = await db.from('inter_team_members')
    .update({ status: 'accepted', answered_at: new Date().toISOString() }).eq('id', invite?.id);
  assert(!accErr, 'ACCEPT: B accepte l\'invitation d\'équipe', accErr);

  // READ team members
  const { data: members } = await db.from('inter_team_members')
    .select('user_id, status').eq('team_id', testInterTeamId);
  assert(members && members.length === 1, `Équipe: ${members?.length} membre(s) invité(s)`);
  assert(members?.[0]?.status === 'accepted', `Membre B: status=${members?.[0]?.status}`);

  // SUBMIT score individuel (A)
  const { data: iScore, error: isErr } = await db.from('inter_scores').insert({
    competition_id: testInterCompId, wod_id: testInterWodId,
    athlete_id: A.id, score_value: 312, score_display: '5:12', status: 'pending',
    submitted_at: new Date().toISOString(),
  }).select('id').single();
  assert(!isErr && iScore, 'SUBMIT score (A) pour WOD inter-comp', isErr);

  // READ leaderboard
  const { data: iLb } = await db.from('inter_scores')
    .select('athlete_id, score_value, status').eq('competition_id', testInterCompId)
    .order('score_value', { ascending: true });
  assert(iLb && iLb.length >= 1, `Leaderboard inter: ${iLb?.length} score(s)`);
  assert(iLb?.[0]?.athlete_id === A.id, `A en tête (312s)`);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function doCleanup() {
  console.log('\n── Cleanup ──────────────────────────────────────────────────────────────────');

  // Mini-tournoi
  if (testDailyTournId) {
    await db.from('daily_tournament_elo_history').delete().eq('tournament_id', testDailyTournId);
    await db.from('daily_tournament_scores').delete().eq('tournament_id', testDailyTournId);
    await db.from('daily_tournament_participants').delete().eq('tournament_id', testDailyTournId);
    await db.from('daily_tournaments').delete().eq('id', testDailyTournId);
    ok('Mini-tournoi + historique ELO supprimés');
  }

  // BO tournament
  if (testTournamentId) {
    await db.from('tournament_scores').delete().eq('tournament_id', testTournamentId);
    await db.from('tournament_participants').delete().eq('tournament_id', testTournamentId);
    await db.from('tournament_wods').delete().eq('tournament_id', testTournamentId);
    await db.from('tournaments').delete().eq('id', testTournamentId);
    ok('Tournoi BO supprimé');
  }

  // Whiteboard WOD + scores
  if (testWodId) {
    await db.from('score_reactions').delete().eq('score_id',
      (await db.from('wod_scores').select('id').eq('wod_id', testWodId).eq('member_id', A?.id).maybeSingle())?.data?.id ?? 'none'
    );
    await db.from('score_comments').delete().eq('score_id',
      (await db.from('wod_scores').select('id').eq('wod_id', testWodId).eq('member_id', A?.id).maybeSingle())?.data?.id ?? 'none'
    );
    await db.from('wod_scores').delete().eq('wod_id', testWodId);
    await db.from('box_wods').delete().eq('id', testWodId);
    ok('WOD whiteboard + scores + interactions supprimés');
  }

  // Schedule
  if (testScheduleId) {
    await db.from('class_reservations').delete().eq('schedule_id', testScheduleId);
    await db.from('class_schedules').delete().eq('id', testScheduleId);
    ok('Créneau supprimé');
  }

  // Inter-compétition
  if (testInterCompId) {
    await db.from('inter_scores').delete().eq('competition_id', testInterCompId);
    if (testInterTeamId) {
      await db.from('inter_team_members').delete().eq('team_id', testInterTeamId);
      await db.from('inter_teams').delete().eq('id', testInterTeamId);
    }
    await db.from('inter_registrations').delete().eq('competition_id', testInterCompId);
    if (testInterWodId) await db.from('inter_competition_wods').delete().eq('id', testInterWodId);
    await db.from('inter_competitions').delete().eq('id', testInterCompId);
    ok('Inter-compétition + équipe + scores supprimés');
  }

  // Athletes (box_members + auth)
  for (const ag of [A, B, C]) {
    if (ag) await db.from('box_members').delete().eq('member_id', ag.id).eq('box_id', box.id);
  }
  for (const id of cleanup.authIds) await db.auth.admin.deleteUser(id);
  ok(`3 athlete agents supprimés`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   AthleX — Athlete App · Toutes les actions utilisateur                ║');
  console.log(`║   Tag: ${TAG.padEnd(62)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  onCleanup(doCleanup);
  try {
    await setup();
    await suiteProfil();
    await suiteWhiteboard();
    await suiteMiniTournoi();
    await suiteTournoiBO();
    await suiteAmis();
    await suiteReservation();
    await suiteMessages();
    await suiteLeaderboard();
    await suiteGenerateurWOD();
    await suiteInterCompetition();
    await suiteMinuteur();
  } finally {
    await runCleanup();
  }

  const total = passed + failed;
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  RÉSULTATS  ${passed} ✅ · ${failed} ❌ · ${total} total`);
  console.log(`${'═'.repeat(72)}\n`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('\n💥 Fatal:', e.message); runCleanup().finally(() => process.exit(1)); });
