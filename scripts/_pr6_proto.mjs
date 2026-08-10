// Protocole PR 6 (capped) sur la pile de test jetable — jamais la prod.
// Jeu témoin : 3 finishers (temps distincts), 2 cappés (reps distinctes),
// 1 ex aequo cappé. Vérifie que l'app et le serveur classent À L'IDENTIQUE,
// que l'AMRAP est inchangé, et que l'encodage hérité DNF_BASE reste correct.
import { createClient } from '@supabase/supabase-js';
import { compareScores } from '/tmp/pr6lib/scoreFormat.mjs';

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error('Variables TEST_SUPABASE_* manquantes'); process.exit(1); }
if (URL.includes('lkwdlqlbrbxaiydkoxfp')) { console.error('❌ Cible = PRODUCTION — refusé'); process.exit(1); }

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let ok = 0, ko = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

const stamp = Date.now();
const mkUser = async (suffix) => {
  const email = `zz_pr6_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_pr6_${suffix}_${stamp}`,
    level: 'inter', role: 'member', elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  return { id: data.user.id, name: suffix, client };
};

// Jeu témoin for-time : secondes si finisher, reps si cappé.
const WITNESS = [
  { name: 'fin_a', value: 420, capped: false }, // 7:00
  { name: 'fin_b', value: 540, capped: false }, // 9:00
  { name: 'fin_c', value: 600, capped: false }, // 10:00
  { name: 'cap_a', value: 31,  capped: true  }, // CAP + 31
  { name: 'cap_b', value: 31,  capped: true  }, // CAP + 31 (ex aequo)
  { name: 'cap_c', value: 8,   capped: true  }, // CAP + 8
];
const EXPECTED_ORDER = ['fin_a', 'fin_b', 'fin_c', 'cap_a', 'cap_b', 'cap_c'];

// Ordre calculé par le code de l'app (src/utils/scoreFormat.ts, compilé).
const appOrder = (rows, isTime) => [...rows]
  .sort((a, b) => compareScores(
    { rx: true, score_value: a.value, capped: a.capped },
    { rx: true, score_value: b.value, capped: b.capped },
    isTime,
  ))
  .map(r => r.name);

let users = [];
let boxId = null;
let dailyId = null;
let tournamentId = null;

try {
  const owner = await mkUser('owner');
  users.push(owner);
  for (const w of WITNESS) users.push(await mkUser(w.name));
  const byName = Object.fromEntries(users.map(u => [u.name, u]));
  const idToName = Object.fromEntries(users.map(u => [u.id, u.name]));
  const athletes = users.filter(u => u.name !== 'owner');

  const { data: box, error: boxErr } = await svc.from('boxes').insert({
    owner_id: owner.id, name: `ZZ PR6 ${stamp}`, slug: `zz-pr6-${stamp}`,
    invite_code: `Z6${String(stamp).slice(-6)}`, is_active: true, is_listed: true,
  }).select('id').single();
  if (boxErr) throw boxErr;
  boxId = box.id;

  await svc.from('box_members').insert([
    { box_id: boxId, member_id: owner.id, role: 'owner', status: 'active' },
    ...athletes.map(u => ({ box_id: boxId, member_id: u.id, role: 'member', status: 'active' })),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const mkWod = async (title, type) => {
    const { data, error } = await svc.from('box_wods').insert({
      box_id: boxId, title, wod_type: type, description: '21-15-9',
      is_published: true, scheduled_date: today,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  };

  // ── 1. compute_wod_elo (for-time) ────────────────────────────────────────
  const wodTime = await mkWod('ZZ PR6 for-time', 'for-time');
  await svc.from('wod_scores').insert(WITNESS.map(w => ({
    wod_id: wodTime, member_id: byName[w.name].id, box_id: boxId,
    score_type: 'time', score_value: w.value, capped: w.capped, rx: true,
  })));

  const eloRes = await owner.client.rpc('compute_wod_elo', { p_wod_id: wodTime });
  if (eloRes.error) throw eloRes.error;
  const serverRanks = Object.fromEntries(eloRes.data.map(r => [idToName[r.member_id], r.rank]));
  const serverOrder = eloRes.data
    .slice()
    .sort((a, b) => a.rank - b.rank || idToName[a.member_id].localeCompare(idToName[b.member_id]))
    .map(r => idToName[r.member_id]);

  check('compute_wod_elo : finishers avant cappés, temps ↑ puis reps ↓',
    JSON.stringify(serverOrder) === JSON.stringify(EXPECTED_ORDER), serverOrder.join(' > '));
  check('compute_wod_elo : ex aequo cappé → même rang',
    serverRanks.cap_a === serverRanks.cap_b && serverRanks.cap_a === 4,
    `cap_a=${serverRanks.cap_a} cap_b=${serverRanks.cap_b} cap_c=${serverRanks.cap_c}`);
  check('compute_wod_elo : le cappé le plus haut ne devance aucun finisher',
    serverRanks.fin_c < serverRanks.cap_a,
    `fin_c=${serverRanks.fin_c} < cap_a=${serverRanks.cap_a}`);

  const appTimeOrder = appOrder(WITNESS, true);
  check('bit-à-bit : app et serveur classent à l\'identique (for-time)',
    JSON.stringify(appTimeOrder) === JSON.stringify(serverOrder),
    `app=${appTimeOrder.join('>')} | srv=${serverOrder.join('>')}`);

  // ── 2. compute_box_elo (même champ, ELO propre à la box) ─────────────────
  const wodBox = await mkWod('ZZ PR6 for-time box', 'for-time');
  await svc.from('wod_scores').insert(WITNESS.map(w => ({
    wod_id: wodBox, member_id: byName[w.name].id, box_id: boxId,
    score_type: 'time', score_value: w.value, capped: w.capped, rx: true,
  })));
  const boxElo = await owner.client.rpc('compute_box_elo', { p_wod_id: wodBox });
  if (boxElo.error) throw boxElo.error;
  const boxOrder = boxElo.data.slice()
    .sort((a, b) => a.rank - b.rank || idToName[a.member_id].localeCompare(idToName[b.member_id]))
    .map(r => idToName[r.member_id]);
  check('compute_box_elo : même ordre que compute_wod_elo',
    JSON.stringify(boxOrder) === JSON.stringify(EXPECTED_ORDER), boxOrder.join(' > '));

  // ── 3. AMRAP inchangé ────────────────────────────────────────────────────
  const AMRAP = [
    { name: 'fin_a', value: 150, capped: false },
    { name: 'fin_b', value: 120, capped: false },
    { name: 'fin_c', value: 100, capped: false },
    { name: 'cap_a', value: 90,  capped: false },
    { name: 'cap_b', value: 90,  capped: false },
    { name: 'cap_c', value: 60,  capped: false },
  ];
  const wodAmrap = await mkWod('ZZ PR6 amrap', 'amrap');
  await svc.from('wod_scores').insert(AMRAP.map(w => ({
    wod_id: wodAmrap, member_id: byName[w.name].id, box_id: boxId,
    score_type: 'reps', score_value: w.value, capped: false, rx: true,
  })));
  const amrapRes = await owner.client.rpc('compute_wod_elo', { p_wod_id: wodAmrap });
  if (amrapRes.error) throw amrapRes.error;
  const amrapRanks = Object.fromEntries(amrapRes.data.map(r => [idToName[r.member_id], r.rank]));
  const amrapOrder = amrapRes.data.slice()
    .sort((a, b) => a.rank - b.rank || idToName[a.member_id].localeCompare(idToName[b.member_id]))
    .map(r => idToName[r.member_id]);
  check('AMRAP : reps décroissantes, ex aequo partagé (comportement inchangé)',
    JSON.stringify(amrapOrder) === JSON.stringify(['fin_a', 'fin_b', 'fin_c', 'cap_a', 'cap_b', 'cap_c'])
      && amrapRanks.cap_a === 4 && amrapRanks.cap_b === 4 && amrapRanks.cap_c === 6,
    amrapOrder.join(' > '));
  check('AMRAP : app et serveur identiques',
    JSON.stringify(appOrder(AMRAP, false)) === JSON.stringify(amrapOrder));

  // ── 4. Encodage hérité DNF_BASE (lignes déjà en base avant la colonne) ───
  const LEGACY = [
    { name: 'fin_a', value: 420, capped: false },
    { name: 'fin_b', value: 540, capped: false },
    { name: 'fin_c', value: 600, capped: false },
    { name: 'cap_a', value: 999999 + 31, capped: false },
    { name: 'cap_b', value: 999999 + 31, capped: false },
    { name: 'cap_c', value: 999999 + 8,  capped: false },
  ];
  const wodLegacy = await mkWod('ZZ PR6 legacy dnf', 'for-time');
  await svc.from('wod_scores').insert(LEGACY.map(w => ({
    wod_id: wodLegacy, member_id: byName[w.name].id, box_id: boxId,
    score_type: 'time', score_value: w.value, capped: w.capped, rx: true,
  })));
  const legacyRes = await owner.client.rpc('compute_wod_elo', { p_wod_id: wodLegacy });
  if (legacyRes.error) throw legacyRes.error;
  const legacyRanks = Object.fromEntries(legacyRes.data.map(r => [idToName[r.member_id], r.rank]));
  const legacyOrder = legacyRes.data.slice()
    .sort((a, b) => a.rank - b.rank || idToName[a.member_id].localeCompare(idToName[b.member_id]))
    .map(r => idToName[r.member_id]);
  check('hérité DNF_BASE : classé comme un cappé (reps ↓), rien à réécrire en base',
    JSON.stringify(legacyOrder) === JSON.stringify(EXPECTED_ORDER)
      && legacyRanks.cap_a === legacyRanks.cap_b,
    legacyOrder.join(' > '));
  check('hérité DNF_BASE : app et serveur identiques',
    JSON.stringify(appOrder(LEGACY, true)) === JSON.stringify(legacyOrder));

  // ── 5. compute_daily_tournament_elo ──────────────────────────────────────
  const { data: daily, error: dErr } = await svc.from('daily_tournaments').insert({
    creator_id: owner.id, wod_name: `ZZ PR6 daily ${stamp}`, wod_type: 'for-time',
    duration: 10, movements: '21-15-9 Thrusters', score_mode: 'time', max_players: 6,
  }).select('id').single();
  if (dErr) throw dErr;
  dailyId = daily.id;
  await svc.from('daily_tournament_participants').insert(
    athletes.map(u => ({ tournament_id: dailyId, user_id: u.id })));
  await svc.from('daily_tournament_scores').insert(WITNESS.map(w => ({
    tournament_id: dailyId, user_id: byName[w.name].id,
    score_value: w.value, capped: w.capped, rx: true, status: 'validated',
  })));
  const dRes = await owner.client.rpc('compute_daily_tournament_elo', { p_tournament_id: dailyId });
  if (dRes.error) throw dRes.error;
  const dailyOrder = dRes.data.slice()
    .sort((a, b) => a.final_rank - b.final_rank || idToName[a.user_id].localeCompare(idToName[b.user_id]))
    .map(r => idToName[r.user_id]);
  const dailyRanks = Object.fromEntries(dRes.data.map(r => [idToName[r.user_id], r.final_rank]));
  check('compute_daily_tournament_elo : ordre témoin respecté',
    JSON.stringify(dailyOrder) === JSON.stringify(EXPECTED_ORDER)
      && dailyRanks.cap_a === dailyRanks.cap_b,
    dailyOrder.join(' > '));
  check('daily : app et serveur identiques',
    JSON.stringify(appOrder(WITNESS, true)) === JSON.stringify(dailyOrder));

  // ── 6. compute_league_wod_elo + recalc_division_points ───────────────────
  const { data: tour, error: tErr } = await svc.from('tournaments').insert({
    box_id: boxId, name: `ZZ PR6 league ${stamp}`, format: 'league_div',
    status: 'active', created_by: owner.id, level: 'rx',
  }).select('id').single();
  if (tErr) throw tErr;
  tournamentId = tour.id;

  const { data: div, error: divErr } = await svc.from('tournament_divisions').insert({
    tournament_id: tournamentId, name: 'D1', level: 1,
  }).select('id').single();
  if (divErr) throw divErr;

  await svc.from('tournament_division_members').insert(
    athletes.map(u => ({ division_id: div.id, athlete_id: u.id })));

  const { data: twod, error: twErr } = await svc.from('tournament_wods').insert({
    tournament_id: tournamentId, title: 'ZZ PR6 league wod', type: 'For Time',
    order_index: 1, movements: [], duration_minutes: 10,
  }).select('id').single();
  if (twErr) throw twErr;

  await svc.from('tournament_scores').insert(WITNESS.map(w => ({
    tournament_id: tournamentId, tournament_wod_id: twod.id, athlete_id: byName[w.name].id,
    score_value: String(w.value), capped: w.capped, status: 'validated',
  })));

  const lRes = await owner.client.rpc('compute_league_wod_elo', { p_tournament_wod_id: twod.id });
  if (lRes.error) throw lRes.error;
  const leagueOrder = lRes.data.slice()
    .sort((a, b) => a.rank - b.rank)
    .map(r => idToName[r.athlete_id]);
  check('compute_league_wod_elo : finishers avant cappés, reps ↓ chez les cappés',
    JSON.stringify(leagueOrder) === JSON.stringify(EXPECTED_ORDER)
      || JSON.stringify(leagueOrder) === JSON.stringify(['fin_a', 'fin_b', 'fin_c', 'cap_b', 'cap_a', 'cap_c']),
    leagueOrder.join(' > '));
  check('league : app et serveur identiques (aux ex aequo près, ROW_NUMBER serveur)',
    JSON.stringify(appOrder(WITNESS, true).filter(n => n !== 'cap_b'))
      === JSON.stringify(leagueOrder.filter(n => n !== 'cap_b')));

  // EXECUTE direct révoqué pour authenticated depuis le lot 6A (A4) : la
  // fonction n'est appelée que par trg_recalc_division_points, en contexte
  // definer. On la joue donc en service_role, comme le trigger.
  const rRes = await svc.rpc('recalc_division_points', { p_tournament_id: tournamentId });
  if (rRes.error) throw rRes.error;
  const { data: members } = await svc.from('tournament_division_members')
    .select('athlete_id, points').eq('division_id', div.id);
  const pts = Object.fromEntries(members.map(m => [idToName[m.athlete_id], m.points]));
  check('recalc_division_points : points décroissants dans l\'ordre témoin',
    pts.fin_a > pts.fin_b && pts.fin_b > pts.fin_c && pts.fin_c > Math.max(pts.cap_a, pts.cap_b)
      && Math.min(pts.cap_a, pts.cap_b) > pts.cap_c,
    EXPECTED_ORDER.map(n => `${n}=${pts[n]}`).join(' '));
} catch (e) {
  console.error('💥', e.message ?? e);
  ko++;
} finally {
  if (tournamentId) await svc.from('tournaments').delete().eq('id', tournamentId);
  if (dailyId) await svc.from('daily_tournaments').delete().eq('id', dailyId);
  if (boxId) {
    await svc.from('wod_scores').delete().eq('box_id', boxId);
    await svc.from('boxes').delete().eq('id', boxId);
  }
  for (const u of users) await svc.auth.admin.deleteUser(u.id);
  const { data: leftovers } = await svc.from('profiles').select('id').like('username', `zz_pr6_%_${stamp}`);
  console.log(`fixtures purgées — résidu ${leftovers?.length ?? 0}`);
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
