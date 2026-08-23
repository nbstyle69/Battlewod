/**
 * test-heures.mjs — la garde de format HH:MM sur les trois `start_time`.
 *
 * Ces colonnes sont du `text` et tout ce qui les consomme suppose exactement
 * `HH:MM` : l'app construit l'instant du créneau par concaténation
 * (`${date}T${start_time}:00` → `Invalid Date` sur `9:00`), le tri des créneaux
 * est un tri de chaînes (`9:00` se classe après `10:00`), et la génération
 * depuis les semaines types déduplique sur l'égalité de chaîne (`9:00` face à
 * `09:00` crée un doublon).
 *
 * Ce que la suite exige :
 *   1. les trois tables REFUSENT une heure hors format — nommément (23514),
 *      pas par un « 0 ligne » silencieux ;
 *   2. le refus tient même au service_role : une contrainte n'est pas une
 *      policy, aucune clé ne passe outre ;
 *   3. le contrôle positif est dans la même passe — `09:00` s'écrit, se relit,
 *      et la génération depuis un modèle reste idempotente ;
 *   4. `physical_competitions.start_time` accepte toujours NULL (le formulaire
 *      admin écrit `startTime || null`).
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-heures.mjs
 * Cible fournie par TEST_SUPABASE_* (jamais la prod).
 */
import {
  requireTestTarget, serviceClient, signInAs, createUser, createOwnedBox,
  dropBoxAndOwner, onCleanup, runCleanup, installCleanupTraps,
} from './lib/test-env.mjs';

requireTestTarget();
installCleanupTraps();

const db = serviceClient();
const stamp = Date.now();
const PASSWORD = 'TestHeure1234!';

let passed = 0;
let failed = 0;

function ok(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, detail) {
  console.log(`  ❌ ${label}`);
  if (detail) console.log(`     → ${detail}`);
  failed++;
}
function assert(label, condition, detail = '') {
  if (condition) ok(label); else fail(label, detail);
}
/**
 * Un refus de contrainte doit être nommé — et nommé PAR LA BONNE contrainte :
 * `physical_competitions` porte aussi un `status_check`, qui lève le même 23514.
 * Un décor fautif y donnait un vert pour la mauvaise raison.
 */
function assertCheckViolation(label, error, contrainte) {
  if (!error) { fail(label, 'aucune erreur : l’heure hors format a été acceptée'); return; }
  const bonne = error.code === '23514' && error.message.includes(contrainte);
  assert(label, bonne, `code ${error.code} — ${error.message} (attendu : ${contrainte})`);
  if (bonne) console.log(`     (refus : 23514 ${contrainte})`);
}

const HORS_FORMAT = ['9:00', '24:00', '18:30:00', '9h00', '', '9:5'];

async function main() {
  const email = `zz_heure_${stamp}@test.athlex.local`;
  const owner = await createUser(db, { email, password: PASSWORD, username: `zz_heure_${stamp}`, role: 'box_owner' });
  const box = await createOwnedBox(db, { tag: `heure${stamp}`, ownerId: owner, name: `zz_heure_box_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, box, owner));

  const jour = new Date().toISOString().slice(0, 10);

  // ── 1. class_schedules : chaque graphie hors format est refusée ────────────
  console.log('\n── class_schedules.start_time ──');
  for (const heure of HORS_FORMAT) {
    const { error } = await db.from('class_schedules').insert({
      box_id: box, title: `zz_h_${stamp}`, scheduled_date: jour,
      start_time: heure, end_time: '10:00', max_capacity: 10,
    });
    assertCheckViolation(`« ${heure || '(vide)'} » refusé`, error, 'class_schedules_start_time_hhmm');
  }

  const { data: creneau, error: creneauErr } = await db.from('class_schedules').insert({
    box_id: box, title: `zz_h_ok_${stamp}`, scheduled_date: jour,
    start_time: '09:00', end_time: '10:00', max_capacity: 10,
  }).select('id, start_time').single();
  assert('contrôle positif : « 09:00 » s’écrit et se relit',
    !creneauErr && creneau?.start_time === '09:00',
    creneauErr?.message ?? `obtenu ${JSON.stringify(creneau)}`);

  // Un UPDATE aussi : la garde ne protège pas seulement la naissance de la ligne.
  const { error: majErr } = await db.from('class_schedules')
    .update({ start_time: '9:00' }).eq('id', creneau?.id);
  assertCheckViolation('un UPDATE vers « 9:00 » est refusé aussi', majErr, 'class_schedules_start_time_hhmm');

  // ── 2. schedule_templates + idempotence du générateur ─────────────────────
  console.log('\n── schedule_templates.start_time ──');
  for (const heure of HORS_FORMAT) {
    const { error } = await db.from('schedule_templates').insert({
      box_id: box, title: `zz_t_${stamp}`, day_of_week: 1,
      start_time: heure, end_time: '11:00', max_capacity: 10,
    });
    assertCheckViolation(`« ${heure || '(vide)'} » refusé`, error, 'schedule_templates_start_time_hhmm');
  }

  const { error: modeleErr } = await db.from('schedule_templates').insert({
    box_id: box, title: `zz_t_ok_${stamp}`, day_of_week: 1,
    start_time: '10:00', end_time: '11:00', max_capacity: 10, is_active: true,
  });
  assert('contrôle positif : un modèle à « 10:00 » s’enregistre', !modeleErr, modeleErr?.message);

  // Le générateur déduplique sur l'égalité de chaîne : deux passes ne doivent
  // produire les créneaux qu'une fois. Sans la garde, un modèle à `9:00` et un
  // créneau à `09:00` seraient deux créneaux distincts pour la même heure.
  // La génération exige une session : elle est appelée au JWT du gérant, pas au
  // service_role (qui n'a pas d'`auth.uid()` et se ferait refuser).
  const { client: gerant } = await signInAs(email, PASSWORD);
  const { data: gen1, error: gen1Err } = await gerant.rpc('generate_class_schedules_from_templates', { p_box_id: box, p_weeks_ahead: 2 });
  const { data: gen2, error: gen2Err } = await gerant.rpc('generate_class_schedules_from_templates', { p_box_id: box, p_weeks_ahead: 2 });
  assert('contrôle positif : la génération pose des créneaux puis reste idempotente',
    !gen1Err && !gen2Err && (gen1 ?? 0) >= 1 && gen2 === 0,
    `1re passe ${gen1} (${gen1Err?.message ?? 'ok'}), 2e passe ${gen2} (${gen2Err?.message ?? 'ok'})`);

  // ── 3. physical_competitions : nullable, mais pas déformable ───────────────
  console.log('\n── physical_competitions.start_time ──');
  const compBase = {
    name: `zz_pc_${stamp}`, date: jour, location: 'zz', status: 'open',
  };
  // Le nettoyage porte sur le NOM, pas sur les ids retenus : sous mutation
  // inverse (contrainte retirée) les insertions hors format réussissent, et une
  // ligne `9:00` laissée derrière ferait échouer le rejeu de la migration.
  onCleanup(() => db.from('physical_competitions').delete().eq('name', compBase.name));
  for (const heure of HORS_FORMAT.filter(h => h !== '')) {
    const { error } = await db.from('physical_competitions').insert({ ...compBase, start_time: heure });
    assertCheckViolation(`« ${heure} » refusé`, error, 'physical_competitions_start_time_hhmm');
  }

  const { data: compNull, error: compNullErr } = await db.from('physical_competitions')
    .insert({ ...compBase, start_time: null }).select('id, start_time').single();
  assert('contrôle positif : NULL reste accepté (le formulaire écrit `startTime || null`)',
    !compNullErr && compNull?.start_time === null, compNullErr?.message);

  const { data: compOk, error: compOkErr } = await db.from('physical_competitions')
    .insert({ ...compBase, start_time: '18:30' }).select('id, start_time').single();
  assert('contrôle positif : « 18:30 » s’écrit et se relit',
    !compOkErr && compOk?.start_time === '18:30', compOkErr?.message);

  console.log(`\nHEURES_ASSERTIONS=${passed + failed}`);
  console.log(`${passed} ✅ · ${failed} ❌`);
}

main()
  .catch((e) => { console.error(e); failed++; })
  .finally(async () => {
    await runCleanup();
    process.exit(failed > 0 ? 1 : 0);
  });
