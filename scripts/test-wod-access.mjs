/**
 * test-wod-access.mjs — Lot 5-A : la restriction d'accès à un WOD est-elle
 * prononcée par le SERVEUR ?
 *
 * Avant cette suite, `wod_program_access` et `wod_group_access` n'étaient lues
 * que par `canSee()` dans `WhiteboardScreen` : la policy de `box_wods` ne les
 * regardait pas. Un membre de la box lisait donc à la clé `authenticated` le
 * contenu réservé aux acheteurs d'un programme payant.
 *
 * Ce que la suite exige :
 *   1. membre NON acheteur → le WOD réservé au programme n'est pas dans sa
 *      lecture, et il ne l'obtient pas non plus en le demandant par son id ;
 *   2. membre acheteur (inscription ACTIVE) → il l'obtient ;
 *   3. CONTRÔLE POSITIF : un WOD sans restriction reste visible de TOUS les
 *      membres. Sans cette assertion, « plus personne ne voit rien » se lirait
 *      comme un succès — c'est la leçon de `peek_box_invitation` face à une
 *      révocation massive.
 *
 * Et trois frontières voisines, parce qu'une garde vérifiée sur un seul cas ne
 * dit pas où elle s'arrête : le groupe (l'autre table d'accès, fermée dans la
 * même migration), l'inscription non active, et le staff qui doit continuer à
 * voir ce qu'il programme.
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-wod-access.mjs
 * Cible fournie par TEST_SUPABASE_* (jamais la prod).
 */
import {
  requireTestTarget, serviceClient, anonClient, signInAs, createUser,
  createOwnedBox, dropBoxAndOwner, onCleanup, runCleanup, installCleanupTraps,
} from './lib/test-env.mjs';

requireTestTarget();
installCleanupTraps();

const db = serviceClient();
const stamp = Date.now();
const PASSWORD = 'TestWodAccess1234!';
const TODAY = new Date().toISOString().slice(0, 10);

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
 * Ce que l'app lit vraiment : la liste du jour pour la box. Retourne les titres
 * visibles, pour que l'assertion porte sur un ensemble et non sur un booléen.
 */
async function readDay(client, boxId) {
  const { data, error } = await client.from('box_wods')
    .select('id, title')
    .eq('box_id', boxId)
    .eq('scheduled_date', TODAY);
  return { titles: (data ?? []).map(r => r.title), error };
}

async function visibleTitles(client, boxId) {
  const { titles, error } = await readDay(client, boxId);
  if (error) throw new Error(`lecture box_wods : ${error.message}`);
  return titles;
}

/** Demander une ligne par son id : une policy de liste qui filtre mal se voit ici. */
async function readsById(client, wodId) {
  const { data } = await client.from('box_wods').select('id').eq('id', wodId);
  return (data ?? []).length > 0;
}

async function main() {
  const mk = suffix => `zz_wa_${suffix}_${stamp}@test.athlex.local`;

  const owner = await createUser(db, { email: mk('ow'), password: PASSWORD, username: `zz_wa_ow_${stamp}`, role: 'box_owner' });
  const coach = await createUser(db, { email: mk('ch'), password: PASSWORD, username: `zz_wa_ch_${stamp}`, role: 'member' });
  const buyer = await createUser(db, { email: mk('bu'), password: PASSWORD, username: `zz_wa_bu_${stamp}` });
  const plain = await createUser(db, { email: mk('pl'), password: PASSWORD, username: `zz_wa_pl_${stamp}` });
  const grouped = await createUser(db, { email: mk('gr'), password: PASSWORD, username: `zz_wa_gr_${stamp}` });
  const expired = await createUser(db, { email: mk('ex'), password: PASSWORD, username: `zz_wa_ex_${stamp}` });

  const box = await createOwnedBox(db, { tag: `wa${stamp}`, ownerId: owner, name: `zz_wa_box_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, box, owner));
  for (const id of [coach, buyer, plain, grouped, expired]) {
    onCleanup(() => db.auth.admin.deleteUser(id));
  }

  for (const [member, role] of [
    [coach, 'coach'], [buyer, 'member'], [plain, 'member'],
    [grouped, 'member'], [expired, 'member'],
  ]) {
    const { error } = await db.from('box_members').upsert(
      { box_id: box, member_id: member, role, status: 'active' },
      { onConflict: 'box_id,member_id' },
    );
    if (error) throw new Error(`décor box_members ${role} : ${error.message}`);
  }

  // Un programme payant de la box, et ses inscrits : un actif, un annulé.
  const { data: program, error: progErr } = await db.from('programs').insert({
    box_id: box, owner_id: owner, title: `zz_wa_prog_${stamp}`,
    price_cents: 4000, type: 'ongoing', invite_code: `zzwa${stamp}`.slice(-12),
  }).select('id').single();
  if (progErr) throw new Error(`décor programs : ${progErr.message}`);

  for (const [user, status] of [[buyer, 'active'], [expired, 'cancelled']]) {
    // La provenance `stripe` exige une référence de paiement (garde du lot 0-bis).
    const { error } = await db.from('program_members').insert({
      program_id: program.id, user_id: user, status, provenance: 'stripe',
      start_date: TODAY, stripe_checkout_session_id: `cs_test_zzwa_${stamp}_${status}`,
    });
    if (error) throw new Error(`décor program_members ${status} : ${error.message}`);
  }

  // Un groupe de la box, dont un seul membre.
  const { data: group, error: grpErr } = await db.from('message_groups').insert({
    box_id: box, name: `zz_wa_group_${stamp}`, created_by: owner, members: [grouped],
  }).select('id').single();
  if (grpErr) throw new Error(`décor message_groups : ${grpErr.message}`);

  // Trois WOD publiés le même jour : un libre, un réservé au programme, un
  // réservé au groupe.
  const wodRows = [
    { box_id: box, created_by: owner, title: `zz_libre_${stamp}`, scheduled_date: TODAY, is_published: true, sort_order: 1 },
    { box_id: box, created_by: owner, title: `zz_programme_${stamp}`, scheduled_date: TODAY, is_published: true, sort_order: 2 },
    { box_id: box, created_by: owner, title: `zz_groupe_${stamp}`, scheduled_date: TODAY, is_published: true, sort_order: 3 },
  ];
  const { data: wods, error: wodErr } = await db.from('box_wods').insert(wodRows).select('id, title');
  if (wodErr) throw new Error(`décor box_wods : ${wodErr.message}`);
  const byTitle = new Map(wods.map(w => [w.title, w.id]));
  const freeWod = byTitle.get(wodRows[0].title);
  const progWod = byTitle.get(wodRows[1].title);
  const groupWod = byTitle.get(wodRows[2].title);

  {
    const { error } = await db.from('wod_program_access').insert({ wod_id: progWod, program_id: program.id });
    if (error) throw new Error(`décor wod_program_access : ${error.message}`);
  }
  {
    const { error } = await db.from('wod_group_access').insert({ wod_id: groupWod, group_id: group.id });
    if (error) throw new Error(`décor wod_group_access : ${error.message}`);
  }

  const BU = await signInAs(mk('bu'), PASSWORD);
  const PL = await signInAs(mk('pl'), PASSWORD);
  const GR = await signInAs(mk('gr'), PASSWORD);
  const EX = await signInAs(mk('ex'), PASSWORD);
  const OW = await signInAs(mk('ow'), PASSWORD);
  const CH = await signInAs(mk('ch'), PASSWORD);

  console.log('\n── 1. Le membre non acheteur ne lit pas le contenu payant ───────');
  const plainSees = await visibleTitles(PL.client, box);
  assert('le WOD réservé au programme est absent de sa lecture',
    !plainSees.includes(wodRows[1].title), `vu : ${JSON.stringify(plainSees)}`);
  assert('il ne l\'obtient pas davantage en le demandant par son id',
    !(await readsById(PL.client, progWod)));

  console.log('\n── 2. Le membre acheteur le lit ─────────────────────────────────');
  const buyerSees = await visibleTitles(BU.client, box);
  assert('l\'inscription active donne accès au WOD du programme',
    buyerSees.includes(wodRows[1].title), `vu : ${JSON.stringify(buyerSees)}`);

  console.log('\n── 3. Contrôle positif : le WOD libre reste visible de tous ─────');
  // Sans cette assertion, une policy qui refuserait TOUT passerait les deux
  // premières : « plus personne ne voit rien » n'est pas « le payant est fermé ».
  for (const [label, titles] of [
    ['non acheteur', plainSees], ['acheteur', buyerSees],
    ['membre du groupe', await visibleTitles(GR.client, box)],
  ]) {
    assert(`le WOD sans restriction reste visible du ${label}`,
      titles.includes(wodRows[0].title), `vu : ${JSON.stringify(titles)}`);
  }
  assert('et il s\'obtient aussi par son id (la garde ne bloque pas le libre)',
    await readsById(PL.client, freeWod));

  console.log('\n── 4. L\'autre table d\'accès est fermée aussi (groupe) ──────────');
  const groupSees = await visibleTitles(GR.client, box);
  assert('le membre du groupe lit le WOD réservé au groupe',
    groupSees.includes(wodRows[2].title), `vu : ${JSON.stringify(groupSees)}`);
  assert('le membre hors groupe ne le lit pas',
    !plainSees.includes(wodRows[2].title), `vu : ${JSON.stringify(plainSees)}`);
  assert('et ne l\'obtient pas par son id',
    !(await readsById(PL.client, groupWod)));

  console.log('\n── 5. Une inscription non active ne vaut pas un accès ───────────');
  const expiredSees = await visibleTitles(EX.client, box);
  assert('l\'inscription annulée ne donne plus accès au WOD du programme',
    !expiredSees.includes(wodRows[1].title), `vu : ${JSON.stringify(expiredSees)}`);
  assert('mais elle n\'ôte pas l\'accès au WOD libre',
    expiredSees.includes(wodRows[0].title), `vu : ${JSON.stringify(expiredSees)}`);

  console.log('\n── 6. Le staff voit ce qu\'il programme ─────────────────────────');
  for (const [label, session] of [['gérant', OW], ['coach', CH]]) {
    const seen = await visibleTitles(session.client, box);
    assert(`le ${label} voit les trois WOD, restrictions comprises`,
      [0, 1, 2].every(i => seen.includes(wodRows[i].title)), `vu : ${JSON.stringify(seen)}`);
  }

  console.log('\n── 7. La clé anonyme ne lit aucun des trois ─────────────────────');
  // La lecture anonyme est désormais refusée par le GRANT de la garde, et non
  // par un « zéro ligne » : le message nomme la barrière, le code seul non
  // (règle 13). Aucune surface publique ne lit box_wods — vérifié côté web
  // (dashboard, export, admin) et mobile (whiteboard authentifié).
  const anonRead = await readDay(anonClient(), box);
  assert('aucun WOD de box à la clé anon',
    anonRead.titles.length === 0, `vu : ${JSON.stringify(anonRead.titles)}`);
  assert('et le refus porte le message du grant, pas un silence',
    (anonRead.error?.message ?? '').includes('permission denied for function'),
    anonRead.error?.message ?? 'aucune erreur');
}

main()
  .then(async () => {
    await runCleanup();
    console.log(`\n${passed} ✅ · ${failed} ❌`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async e => {
    console.error('\n💥', e.message);
    await runCleanup();
    process.exit(1);
  });
