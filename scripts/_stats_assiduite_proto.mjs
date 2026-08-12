// Protocole « Statistiques — lot 2 Assiduité » (20261027).
//
// Frontières et exactitude à prouver, au vrai JWT :
//   • gérant et coach de LA box lisent ; gérant d'une AUTRE box, athlète et
//     anon sont REFUSÉS par exception, pas par un zéro ligne qui se lirait
//     « aucune absence » ;
//   • « à risque » ne compte QUE les membres ayant déjà réservé ; ceux qui n'ont
//     jamais réservé sortent en population distincte ;
//   • un membre revenu récemment n'est ni à risque ni « jamais venu » ;
//   • une réservation POUR DEMAIN ne fait pas revenir un décroché ;
//   • la fenêtre porte sur la date du cours, pas sur celle de la réservation ;
//   • présence : pointés et présents sont distincts, un cours non pointé n'est
//     pas une absence ;
//   • aucune donnée d'une autre box dans les agrégats ni dans la heatmap.
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
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const sql = q => execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf-8' }).trim();

let ok = 0, ko = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

const stamp = Date.now();
const created = { users: [], boxes: [] };

const mkUser = async (suffix, role = 'member') => {
  const email = `zz_att_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_att_${suffix}_${stamp}`, level: 'inter', role, elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, email, client };
};

/** Date décalée de `days` par rapport à aujourd'hui, au format 'YYYY-MM-DD'. */
const day = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

try {
  const ownerA = await mkUser('ownerA', 'box_owner');
  const ownerB = await mkUser('ownerB', 'box_owner');
  const coachA = await mkUser('coachA');
  const athleteA = await mkUser('athleteA');

  const mkBox = async (owner, tag) => {
    const { data, error } = await svc.from('boxes').insert({
      owner_id: owner.id, name: `ZZ ATT ${tag} ${stamp}`, slug: `zz-att-${tag}-${stamp}`,
      invite_code: `ZA${tag}${String(stamp).slice(-4)}`, is_active: true, is_listed: true, city: 'Lyon',
    }).select('id').single();
    if (error) throw error;
    created.boxes.push(data.id);
    return data.id;
  };
  const boxA = await mkBox(ownerA, 'A');
  const boxB = await mkBox(ownerB, 'B');

  const mkMember = async (boxId, tag, role = 'member') => {
    const u = await mkUser(tag);
    const { error } = await svc.from('box_members').insert({
      box_id: boxId, member_id: u.id, role, status: 'active',
    });
    if (error) throw error;
    return u;
  };

  // Box A : quatre profils de fréquentation, un par cas à distinguer.
  const assidu = await mkMember(boxA, 'assidu');      // venu il y a 2 jours
  const decroche = await mkMember(boxA, 'decroche');  // dernière venue il y a 40 jours
  const jamais = await mkMember(boxA, 'jamais');      // aucune réservation
  const futur = await mkMember(boxA, 'futur');        // réservé demain, jamais venu
  await svc.from('box_members').insert({ box_id: boxA, member_id: coachA.id, role: 'coach', status: 'active' });
  await svc.from('box_members').insert({ box_id: boxA, member_id: athleteA.id, role: 'member', status: 'active' });
  const membreB = await mkMember(boxB, 'membreB');

  const mkClass = async (boxId, date, startTime, capacity = 10) => {
    const { data, error } = await svc.from('class_schedules').insert({
      box_id: boxId, title: `ZZ COURS ${startTime}`, scheduled_date: date,
      start_time: startTime, end_time: '10:00', max_capacity: capacity,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  };

  const mkResa = async (boxId, scheduleId, member, extra = {}) => {
    const { error } = await svc.from('class_reservations').insert({
      box_id: boxId, schedule_id: scheduleId, member_id: member.id, status: 'confirmed', ...extra,
    });
    if (error) throw error;
  };

  // Cours passés dans la fenêtre de 30 jours.
  const coursHier = await mkClass(boxA, day(-2), '09:00', 10);
  const coursSemaine = await mkClass(boxA, day(-6), '18:00', 10);
  const coursVieux = await mkClass(boxA, day(-40), '09:00', 10);   // hors fenêtre
  const coursDemain = await mkClass(boxA, day(1), '09:00', 10);    // à venir
  const coursB = await mkClass(boxB, day(-2), '19:00', 30);

  await mkResa(boxA, coursHier, assidu, { attended: true });
  await mkResa(boxA, coursSemaine, assidu);                        // non pointée
  await mkResa(boxA, coursHier, athleteA, { attended: false });    // pointée absente
  await mkResa(boxA, coursVieux, decroche, { attended: true });    // dernière venue : J-40
  await mkResa(boxA, coursDemain, futur);                          // à venir seulement
  await mkResa(boxB, coursB, membreB, { attended: true });

  const call = (client, fn, args) => client.rpc(fn, args);
  const winArgs = { p_box_id: boxA, p_from: day(-30), p_to: day(1) };

  // ── Lecture autorisée ─────────────────────────────────────────────────────
  const { data: sA, error: eA } = await call(ownerA.client, 'get_box_attendance_summary', winArgs);
  const row = Array.isArray(sA) ? sA[0] : sA;
  check('le gérant de la box lit la synthèse', !eA && !!row, eA?.message ?? '');

  const { error: eCoach } = await call(coachA.client, 'get_box_attendance_summary', winArgs);
  check('le coach de la box lit la synthèse', !eCoach, eCoach?.message ?? '');

  // ── Remplissage ───────────────────────────────────────────────────────────
  check('2 cours passés dans la fenêtre (le cours de demain est exclu)',
    row.classes_count === 2, `${row.classes_count}`);
  check('capacité offerte = 20, réservations = 3',
    row.capacity_total === 20 && row.reservations_count === 3,
    `${row.capacity_total}/${row.reservations_count}`);

  // ── Présence : pointer n'est pas venir ────────────────────────────────────
  check('2 réservations pointées, 1 présent — la non pointée n\'est pas une absence',
    row.marked_count === 2 && row.attended_count === 1,
    `pointées=${row.marked_count} présents=${row.attended_count}`);

  // ── Les deux populations ──────────────────────────────────────────────────
  check('à risque = 1 (le décroché), pas les 4 autres membres',
    row.members_at_risk === 1, `${row.members_at_risk}`);
  check('jamais venus via l\'app = 2 (dont celui qui n\'a qu\'une résa à venir)',
    row.members_never_booked === 2, `${row.members_never_booked}`);
  check('5 adhérents comptés, 3 ont déjà réservé — le coach n\'est pas un adhérent',
    row.members_active === 5 && row.members_ever_booked === 3,
    `${row.members_active}/${row.members_ever_booked}`);

  // ── Listes nominatives ────────────────────────────────────────────────────
  const { data: people } = await call(ownerA.client, 'get_box_attendance_people', { p_box_id: boxA });
  const byId = Object.fromEntries((people ?? []).map(p => [p.member_id, p]));
  check('le décroché est listé « à risque », avec sa dernière venue',
    byId[decroche.id]?.kind === 'at_risk' && byId[decroche.id]?.last_class === day(-40),
    `${byId[decroche.id]?.kind}/${byId[decroche.id]?.last_class}`);
  check('l\'assidu n\'est dans aucune des deux listes', !byId[assidu.id], byId[assidu.id]?.kind ?? '');
  check('celui qui n\'a jamais réservé est « jamais venu », sans date',
    byId[jamais.id]?.kind === 'never_booked' && byId[jamais.id]?.last_class === null,
    `${byId[jamais.id]?.kind}`);
  check('une réservation POUR DEMAIN ne fait pas d\'un membre un habitué',
    byId[futur.id]?.kind === 'never_booked' && byId[futur.id]?.reservations_total === 1,
    `${byId[futur.id]?.kind}/${byId[futur.id]?.reservations_total}`);
  check('aucun membre de la box B dans les listes de A', !byId[membreB.id], '');
  check('le coach n\'est pas listé « à embarquer » — il anime, il ne réserve pas',
    !byId[coachA.id], byId[coachA.id]?.kind ?? '');

  // ── Le seuil est un paramètre, pas une constante figée ────────────────────
  const { data: people60 } = await call(ownerA.client, 'get_box_attendance_people',
    { p_box_id: boxA, p_risk_days: 60 });
  check('à 60 jours, le décroché n\'est plus à risque',
    !(people60 ?? []).some(p => p.member_id === decroche.id && p.kind === 'at_risk'), '');

  // ── Heatmap ───────────────────────────────────────────────────────────────
  const { data: heat } = await call(ownerA.client, 'get_box_reservation_heatmap', winArgs);
  const cells = (heat ?? []).map(h => `${h.dow}@${h.hour}:${h.reservations}`).sort().join(' ');
  const total = (heat ?? []).reduce((s, h) => s + h.reservations, 0);
  check('heatmap : 3 réservations réparties sur les heures des cours',
    total === 3 && (heat ?? []).every(h => h.hour === 9 || h.hour === 18), cells);
  check('heatmap : rien de la box B (19h n\'existe pas côté A)',
    !(heat ?? []).some(h => h.hour === 19), cells);

  // ── La fenêtre filtre bien ────────────────────────────────────────────────
  const { data: sOld } = await call(ownerA.client, 'get_box_attendance_summary',
    { p_box_id: boxA, p_from: day(-400), p_to: day(-300) });
  const rowOld = Array.isArray(sOld) ? sOld[0] : sOld;
  check('période sans cours : tout à zéro, mais les populations restent un stock',
    rowOld.classes_count === 0 && rowOld.reservations_count === 0 && rowOld.members_at_risk === 1,
    `${rowOld.classes_count}/${rowOld.reservations_count}/${rowOld.members_at_risk}`);

  // ── Refus ─────────────────────────────────────────────────────────────────
  const { error: eOther } = await call(ownerB.client, 'get_box_attendance_summary', winArgs);
  check('le gérant d\'une AUTRE box est refusé', !!eOther, eOther?.code ?? '');

  const { error: eOtherPeople } = await call(ownerB.client, 'get_box_attendance_people', { p_box_id: boxA });
  check('le gérant d\'une autre box n\'obtient pas les noms', !!eOtherPeople, eOtherPeople?.code ?? '');

  const { error: eOtherHeat } = await call(ownerB.client, 'get_box_reservation_heatmap', winArgs);
  check('le gérant d\'une autre box n\'obtient pas la heatmap', !!eOtherHeat, eOtherHeat?.code ?? '');

  const { error: eAth } = await call(athleteA.client, 'get_box_attendance_people', { p_box_id: boxA });
  check('un athlète de la box ne lit pas les listes nominatives', !!eAth, eAth?.code ?? '');

  const { error: eAnon } = await call(anon, 'get_box_attendance_summary', winArgs);
  check('anon est refusé', !!eAnon, eAnon?.code ?? '');

  // ── Étanchéité des grants et du search_path ───────────────────────────────
  const grants = sql(`SELECT coalesce(string_agg(DISTINCT r.rolname, ',' ORDER BY r.rolname), '')
                        FROM pg_proc p, aclexplode(p.proacl) a
                        JOIN pg_roles r ON r.oid = a.grantee
                       WHERE p.proname IN ('get_box_attendance_summary','get_box_attendance_people','get_box_reservation_heatmap')`);
  check('grants : pas d\'anon sur les RPC assiduité', !grants.split(',').includes('anon'), grants);

  const paths = sql(`SELECT count(*) FROM pg_proc
                      WHERE proname IN ('get_box_attendance_summary','get_box_attendance_people','get_box_reservation_heatmap')
                        AND 'search_path=public, pg_temp' = ANY(proconfig)`);
  check('search_path figé sur les 3 RPC', paths === '3', paths);
} finally {
  for (const b of created.boxes) sql(`DELETE FROM boxes WHERE id = '${b}'`);
  for (const u of created.users) {
    await svc.auth.admin.deleteUser(u).catch(() => {});
    sql(`DELETE FROM profiles WHERE id = '${u}'`);
  }
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
