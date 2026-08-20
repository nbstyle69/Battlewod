/**
 * test-strength-journal.mjs — Journal des séries réalisées (lot 4) au vrai JWT.
 *
 * Ce que cette suite exige, et qui n'était pas vrai avant elle :
 *   1. une série réalisée s'écrit, avec sa provenance (source, mouvement, index)
 *      et l'écart au prescrit ;
 *   2. corriger sa saisie CORRIGE l'historique au lieu de l'empiler : ré-écrire
 *      les mêmes séries ne duplique rien, et trois séries déclarées après cinq
 *      laissent trois séries — c'est le `upsert` puis purge du client, filtre
 *      PostgREST compris ;
 *   3. la trace d'un athlète n'est lisible par personne d'autre EN DIRECT : la
 *      table refuse, seule la RPC répond ;
 *   4. la RPC autorise exactement ce que `get_athlete_private_profile()`
 *      autorise — l'athlète, le gérant principal, le co-gérant, le coach d'une
 *      box où l'athlète est membre actif — et refuse le reste, dont une autre
 *      box et l'appel non authentifié ;
 *   5. le journal n'écrit rien dans `movement_logs` : les blocs de force
 *      restent invisibles au crédit de badges (décision du lot 2).
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-strength-journal.mjs
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
const PASSWORD = 'TestJournal1234!';
const CONFLICT = 'user_id,source_type,source_id,movement,set_index';

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
function assertEq(label, actual, expected) {
  assert(label, JSON.stringify(actual) === JSON.stringify(expected),
    `attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
}
/** Une frontière doit REFUSER, et le refus doit être nommé (pas un retour vide). */
function assertRefused(label, error) {
  assert(label, Boolean(error), 'aucune erreur : le geste a été autorisé');
  if (error) console.log(`     (refus : ${error.code ?? '—'} ${error.message})`);
}

/** Une ligne du journal, telle que l'app la construit depuis la grille. */
function row(userId, sourceId, over = {}) {
  return {
    user_id: userId,
    source_type: 'whiteboard',
    source_id: sourceId,
    source_title: 'zz Lundi Force',
    movement: 'Back Squat',
    movement_label: 'Back Squat',
    set_index: 1,
    reps: 3,
    load_kg: 120,
    prescribed_reps: 3,
    prescribed_load_kg: 120,
    ...over,
  };
}

/**
 * Réplique exacte du chemin d'écriture de `src/services/strengthSets.ts` :
 * upsert des séries courantes, PUIS purge de celles de la même séance qui n'ont
 * pas été réécrites. Jamais delete-puis-insert : un insert qui échoue après le
 * delete détruirait l'historique.
 */
async function writeJournal(client, rows, { userId, sourceType, sourceId }) {
  const { data, error } = await client.from('strength_set_logs')
    .upsert(rows, { onConflict: CONFLICT })
    .select('id, movement, set_index, reps, load_kg');
  if (error) return { error, kept: [] };
  const keptIds = data.map(r => r.id);
  const { error: pruneErr } = await client.from('strength_set_logs')
    .delete()
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .not('id', 'in', `(${keptIds.join(',')})`);
  return { error: pruneErr ?? null, kept: data };
}

async function main() {
  // ── Décor : deux box, tout le staff de A, un intrus, un athlète ────────────
  const mk = suffix => `zz_j_${suffix}_${stamp}@test.athlex.local`;

  const ownerA = await createUser(db, { email: mk('oa'), password: PASSWORD, username: `zz_j_oa_${stamp}`, role: 'box_owner' });
  const ownerB = await createUser(db, { email: mk('ob'), password: PASSWORD, username: `zz_j_ob_${stamp}`, role: 'box_owner' });
  const coOwner = await createUser(db, { email: mk('co'), password: PASSWORD, username: `zz_j_co_${stamp}`, role: 'box_owner' });
  // Le rôle de coach vit dans `box_members`, pas dans `profiles` (dont le CHECK
  // ne connaît pas 'coach') : c'est bien la relation à la box qui autorise.
  const coach = await createUser(db, { email: mk('ch'), password: PASSWORD, username: `zz_j_ch_${stamp}`, role: 'member' });
  const athlete = await createUser(db, { email: mk('at'), password: PASSWORD, username: `zz_j_at_${stamp}` });
  const stranger = await createUser(db, { email: mk('st'), password: PASSWORD, username: `zz_j_st_${stamp}` });

  const boxA = await createOwnedBox(db, { tag: `jA${stamp}`, ownerId: ownerA, name: `zz_j_boxA_${stamp}` });
  const boxB = await createOwnedBox(db, { tag: `jB${stamp}`, ownerId: ownerB, name: `zz_j_boxB_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, boxB, ownerB));
  onCleanup(() => dropBoxAndOwner(db, boxA, ownerA));
  for (const id of [coOwner, coach, athlete, stranger]) {
    onCleanup(() => db.auth.admin.deleteUser(id));
  }

  for (const [box, member, role] of [
    [boxA, athlete, 'member'],
    [boxA, coOwner, 'owner'],
    [boxA, coach, 'coach'],
    [boxB, stranger, 'member'],
  ]) {
    const { error } = await db.from('box_members').upsert(
      { box_id: box, member_id: member, role, status: 'active' },
      { onConflict: 'box_id,member_id' },
    );
    if (error) throw new Error(`décor box_members ${role} : ${error.message}`);
  }

  const AT = await signInAs(mk('at'), PASSWORD);
  const OA = await signInAs(mk('oa'), PASSWORD);
  const OB = await signInAs(mk('ob'), PASSWORD);
  const CO = await signInAs(mk('co'), PASSWORD);
  const CH = await signInAs(mk('ch'), PASSWORD);
  const ST = await signInAs(mk('st'), PASSWORD);

  const wod = crypto.randomUUID();
  const prog = crypto.randomUUID();

  console.log('\n── 1. L\'athlète écrit ses séries réalisées ─────────────────────');
  const five = [1, 2, 3, 4, 5].map(i => row(athlete, wod, {
    set_index: i,
    reps: i <= 2 ? 5 : 3, // prévu 5 × 3, réellement fait 5, 5, 3, 3, 3
    load_kg: 120,
  }));
  const first = await writeJournal(AT.client, five, {
    userId: athlete, sourceType: 'whiteboard', sourceId: wod,
  });
  assert('les 5 séries s\'écrivent au vrai JWT', !first.error, first.error?.message);

  const { data: afterFirst } = await db.from('strength_set_logs')
    .select('set_index,reps,load_kg,prescribed_reps,source_title')
    .eq('user_id', athlete).eq('source_id', wod).order('set_index');
  assertEq('5 lignes, une par série', afterFirst?.length, 5);
  assertEq('les reps RÉALISÉES sont conservées, pas les prescrites',
    afterFirst?.map(r => r.reps), [5, 5, 3, 3, 3]);
  assertEq('le prescrit reste lisible à côté du réalisé',
    afterFirst?.map(r => r.prescribed_reps), [3, 3, 3, 3, 3]);

  console.log('\n── 2. Ré-enregistrer ne duplique pas, corriger corrige ─────────');
  await writeJournal(AT.client, five, { userId: athlete, sourceType: 'whiteboard', sourceId: wod });
  const { count: afterReplay } = await db.from('strength_set_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', athlete).eq('source_id', wod);
  assertEq('une soumission identique laisse 5 lignes (pas 10)', afterReplay, 5);

  const idsBefore = new Map((await db.from('strength_set_logs')
    .select('id,set_index').eq('user_id', athlete).eq('source_id', wod)).data
    .map(r => [r.set_index, r.id]));

  const three = [1, 2, 3].map(i => row(athlete, wod, { set_index: i, reps: 4, load_kg: 125 }));
  const corrected = await writeJournal(AT.client, three, {
    userId: athlete, sourceType: 'whiteboard', sourceId: wod,
  });
  assert('la correction passe', !corrected.error, corrected.error?.message);
  const { data: afterFix } = await db.from('strength_set_logs')
    .select('id,set_index,reps,load_kg').eq('user_id', athlete).eq('source_id', wod)
    .order('set_index');
  assertEq('trois séries après cinq laissent trois séries', afterFix?.length, 3);
  assertEq('les valeurs corrigées sont celles du journal',
    afterFix?.map(r => [r.reps, Number(r.load_kg)]), [[4, 125], [4, 125], [4, 125]]);
  assertEq('les séries conservées gardent leur identité (upsert, pas re-création)',
    afterFix?.map(r => r.id), [1, 2, 3].map(i => idsBefore.get(i)));

  // Le filtre de purge est un `not in` PostgREST : s'il était inopérant, le test
  // ci-dessus passerait aussi (5 lignes réécrites = 5 lignes). C'est le retour à
  // 3 lignes qui le prouve — et une purge avec UNE seule série gardée le
  // confirme sur le cas limite d'une liste d'un seul id.
  const one = [row(athlete, wod, { set_index: 1, reps: 2, load_kg: 130 })];
  await writeJournal(AT.client, one, { userId: athlete, sourceType: 'whiteboard', sourceId: wod });
  const { count: afterOne } = await db.from('strength_set_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', athlete).eq('source_id', wod);
  assertEq('une liste d\'un seul id gardé purge bien les autres', afterOne, 1);

  console.log('\n── 3. Deux séances, deux mouvements : rien ne se mélange ────────');
  const mixed = [
    row(athlete, prog, { source_type: 'program', source_title: 'zz Semaine 2 — Jour 1', set_index: 1, movement: 'Deadlift', movement_label: 'Deadlift', reps: 5, load_kg: 180 }),
    row(athlete, prog, { source_type: 'program', source_title: 'zz Semaine 2 — Jour 1', set_index: 2, movement: 'Deadlift', movement_label: 'Deadlift', reps: 5, load_kg: 180 }),
    row(athlete, prog, { source_type: 'program', source_title: 'zz Semaine 2 — Jour 1', set_index: 1, movement: 'Strict Press', movement_label: 'Strict Press', reps: 8, load_kg: 45 }),
  ];
  const mixErr = await writeJournal(AT.client, mixed, {
    userId: athlete, sourceType: 'program', sourceId: prog,
  });
  assert('deux mouvements cohabitent dans la même séance', !mixErr.error, mixErr.error?.message);
  const { count: stillOne } = await db.from('strength_set_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', athlete).eq('source_id', wod);
  assertEq('la purge d\'une séance ne touche pas l\'autre', stillOne, 1);

  console.log('\n── 4. La table ne se lit pas en direct, même par le staff ──────');
  const { data: byStaff } = await OA.client.from('strength_set_logs')
    .select('id').eq('user_id', athlete);
  assertEq('le gérant ne lit AUCUNE ligne en direct (RLS propriétaire)', byStaff?.length, 0);
  const { data: byStranger } = await ST.client.from('strength_set_logs')
    .select('id').eq('user_id', athlete);
  assertEq('un athlète d\'une autre box non plus', byStranger?.length, 0);
  const { data: byAnon } = await anonClient().from('strength_set_logs').select('id');
  assertEq('la clé anon ne lit rien', byAnon?.length ?? 0, 0);
  assertRefused('un tiers ne peut pas écrire dans la trace d\'autrui',
    (await ST.client.from('strength_set_logs').insert(row(athlete, wod, { set_index: 9 })).select('id')).error);

  console.log('\n── 5. La RPC autorise exactement ce que le profil privé autorise ─');
  const rpc = (c, args) => c.rpc('list_athlete_strength_sets', args);

  const self = await rpc(AT.client, { p_user_id: athlete });
  assert('l\'athlète lit sa propre trace', !self.error, self.error?.message);
  assertEq('et il y voit ses 4 séries (1 whiteboard + 3 programme)', self.data?.length, 4);

  for (const [label, session] of [
    ['le gérant principal', OA], ['le co-gérant', CO], ['le coach actif', CH],
  ]) {
    const res = await rpc(session.client, { p_user_id: athlete });
    assert(`${label} lit la trace de son athlète`, !res.error, res.error?.message);
    assertEq(`${label} voit les 4 séries`, res.data?.length, 4);
  }

  assertRefused('un athlète tiers est refusé',
    (await rpc(ST.client, { p_user_id: athlete })).error);
  assertRefused('le gérant d\'une AUTRE box est refusé (isolation)',
    (await rpc(OB.client, { p_user_id: athlete })).error);
  assertRefused('l\'appel non authentifié est refusé',
    (await rpc(anonClient(), { p_user_id: athlete })).error);

  // Un coach exclu ne lit plus : l'autorisation suit le membership, pas l'ancienneté.
  await db.from('box_members').update({ status: 'inactive' })
    .eq('box_id', boxA).eq('member_id', coach);
  assertRefused('un coach devenu inactif est refusé',
    (await rpc(CH.client, { p_user_id: athlete })).error);
  await db.from('box_members').update({ status: 'active' })
    .eq('box_id', boxA).eq('member_id', coach);

  // Un athlète qui quitte la box coupe la lecture staff : c'est la même
  // condition que `get_athlete_private_profile()` (membre ACTIF).
  await db.from('box_members').update({ status: 'inactive' })
    .eq('box_id', boxA).eq('member_id', athlete);
  assertRefused('l\'athlète parti n\'est plus lisible par le staff',
    (await rpc(OA.client, { p_user_id: athlete })).error);
  const stillSelf = await rpc(AT.client, { p_user_id: athlete });
  assert('mais il lit toujours sa propre trace', !stillSelf.error, stillSelf.error?.message);
  await db.from('box_members').update({ status: 'active' })
    .eq('box_id', boxA).eq('member_id', athlete);

  console.log('\n── 6. Tri et plafond ───────────────────────────────────────────');
  const ordered = await rpc(OA.client, { p_user_id: athlete });
  const keys = (ordered.data ?? []).map(r => `${r.performed_at}|${r.movement}|${r.set_index}`);
  assertEq('trié par date décroissante, puis mouvement, puis index',
    keys, [...keys].sort((a, b) => {
      const [da, ma, sa] = a.split('|');
      const [dbb, mb, sb] = b.split('|');
      if (da !== dbb) return dbb.localeCompare(da);
      if (ma !== mb) return ma.localeCompare(mb);
      return Number(sa) - Number(sb);
    }));

  const capped = await rpc(OA.client, { p_user_id: athlete, p_limit: 2 });
  assertEq('p_limit est respecté', capped.data?.length, 2);
  const huge = await rpc(OA.client, { p_user_id: athlete, p_limit: 99999 });
  assert('un plafond absurde ne fait pas échouer l\'appel (LEAST 1000)', !huge.error, huge.error?.message);
  const zero = await rpc(OA.client, { p_user_id: athlete, p_limit: 0 });
  assertEq('p_limit=0 rend au moins une ligne (GREATEST 1), jamais un vide trompeur',
    zero.data?.length, 1);

  console.log('\n── 7. Aucun crédit de badges au passage ────────────────────────');
  const { count: creditRows } = await db.from('movement_logs')
    .select('id', { count: 'exact', head: true }).eq('user_id', athlete);
  assertEq('movement_logs reste vide pour cet athlète', creditRows ?? 0, 0);
  const { count: statRows } = await db.from('user_movement_stats')
    .select('user_id', { count: 'exact', head: true }).eq('user_id', athlete);
  assertEq('user_movement_stats aussi', statRows ?? 0, 0);

  console.log('\n── 8. Les gardes de colonne refusent l\'absurde ─────────────────');
  for (const [label, over] of [
    ['une charge de 900 kg', { set_index: 20, load_kg: 900 }],
    ['une charge nulle', { set_index: 21, load_kg: 0 }],
    ['0 rep', { set_index: 22, reps: 0 }],
    ['une 51e série', { set_index: 51 }],
    ['une source inconnue', { set_index: 23, source_type: 'guess' }],
    ['un mouvement vide', { set_index: 24, movement: '   ' }],
  ]) {
    assertRefused(`${label} est refusée en base`,
      (await AT.client.from('strength_set_logs').insert(row(athlete, wod, over)).select('id')).error);
  }
  // Une charge absente reste légitime : un bloc « à l'appréciation de
  // l'athlète » se journalise sans charge, il ne produit simplement pas de 1RM.
  const noLoad = await AT.client.from('strength_set_logs')
    .insert(row(athlete, wod, { set_index: 30, load_kg: null })).select('id');
  assert('une série sans charge s\'écrit (pas de 1RM, mais du travail fait)',
    !noLoad.error, noLoad.error?.message);
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
