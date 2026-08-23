/**
 * test-programs-par-box.mjs — Lot 5-C : un programme appartient à sa box, son
 * contenu vit dans `box_wods`, et dispenser de payer reste une décision d'argent.
 *
 * Ce que la suite mesure, cas par cas :
 *
 *   Frontière owner / co-gérant / coach
 *     1. le co-gérant crée un programme dans sa box ;
 *     2. le gérant principal édite CE programme (l'ancien `owner_id = auth.uid()`
 *        produisait deux stocks mutuellement inéditables) ;
 *     3. le coach ne crée pas de programme ;
 *     4. le coach ne change pas un prix ;
 *     5. le coach ne lit pas les inscrits d'un programme de sa box.
 *
 *   Le contenu payé arrive à l'acheteur
 *     6. l'acheteur inscrit lit le WOD du programme MÊME hors de la box vendeuse
 *        — sans ça, tout achat public reste devant une page vide ;
 *     7. il lit le rattachement `wod_program_access` qui le lui désigne ;
 *     8. un membre de la box SANS inscription ne voit pas ce WOD (garde 5-A) ;
 *     9. CONTRÔLE POSITIF : un WOD sans restriction reste visible des membres.
 *        Sans lui, « plus personne ne voit rien » passerait pour un succès.
 *
 *   Grants anonymes (motif R1/R2)
 *    10..13. `programs` ne sert à `anon` que les colonnes de la page publique ;
 *        `invite_code`, `stripe_price_id`, `stripe_product_id`, `owner_id` non ;
 *    14..15. `program_members` et `wod_program_access` : rien pour `anon` ;
 *    16. `box_wods` : plus d'écriture anonyme (TRUNCATE échappait à la RLS).
 *
 *   join_program('staff')
 *    17. le coach est refusé (il ne dispense pas de payer) ;
 *    18. le gérant assigne, et la provenance reste 'staff' (pas 'stripe') ;
 *    19. le co-gérant assigne aussi ;
 *    20. un non-membre de la box n'est pas assignable.
 *
 *   Tables legacy
 *    21..22. `program_wods` et `program_scores` n'existent plus.
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-programs-par-box.mjs
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
const PASSWORD = 'TestProgBox1234!';
const TODAY = new Date().toISOString().slice(0, 10);

/** Colonnes de `programs` qui n'ont rien à faire dans une réponse anonyme. */
const COLONNES_PRIVEES = ['invite_code', 'stripe_price_id', 'stripe_product_id', 'owner_id'];
/** Tables qu'aucune surface publique ne lit. */
const TABLES_FERMEES_ANON = ['program_members', 'wod_program_access'];
/** Tables supprimées par la migration. */
const TABLES_LEGACY = ['program_wods', 'program_scores'];

// Le total attendu est dérivé des listes ci-dessus, pas écrit à la main : une
// liste allongée sans mettre le compteur à jour rendrait un « n/n » faux.
const PLAN = [
  6,                              // frontière owner / co-gérant / coach
  4,                              // le contenu payé arrive à l'acheteur
  1 + COLONNES_PRIVEES.length + TABLES_FERMEES_ANON.length + 1, // grants anon
  5,                              // join_program('staff')
  TABLES_LEGACY.length,           // tables legacy
];

let passed = 0;
let failed = 0;
let attendu = null;

// Un contrôle affirme qu'il a tourné, pas seulement ce qu'il a trouvé : le
// compte s'imprime même si le processus meurt entre deux assertions.
process.on('exit', () => {
  if (attendu !== null) {
    console.log(`PROGRAMS_BOX_ASSERTIONS=${passed + failed}/${attendu}`);
  }
});

function ok(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, detail) {
  console.log(`  ❌ ${label}`);
  if (detail) console.log(`     → ${detail}`);
  failed++;
}
function assert(label, condition, detail = '') {
  if (condition) ok(label); else fail(label, detail);
}

/** Une ligne demandée par son id : une policy qui filtre mal se voit ici. */
async function readsRow(client, table, id) {
  const { data, error } = await client.from(table).select('id').eq('id', id);
  return { seen: (data ?? []).length > 0, error };
}

async function main() {
  const mk = suffix => `zz_pb_${suffix}_${stamp}@test.athlex.local`;

  const owner = await createUser(db, { email: mk('ow'), password: PASSWORD, username: `zz_pb_ow_${stamp}`, role: 'box_owner' });
  const coOwner = await createUser(db, { email: mk('co'), password: PASSWORD, username: `zz_pb_co_${stamp}` });
  const coach = await createUser(db, { email: mk('ch'), password: PASSWORD, username: `zz_pb_ch_${stamp}` });
  const member = await createUser(db, { email: mk('me'), password: PASSWORD, username: `zz_pb_me_${stamp}` });
  // L'acheteur n'est PAS membre de la box vendeuse : c'est le cas de l'achat
  // public, celui qui prouve que le contenu suit le paiement et non la box.
  const buyer = await createUser(db, { email: mk('bu'), password: PASSWORD, username: `zz_pb_bu_${stamp}` });

  const box = await createOwnedBox(db, { tag: `pb${stamp}`, ownerId: owner, name: `zz_pb_box_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, box, owner));
  for (const id of [coOwner, coach, member, buyer]) {
    onCleanup(() => db.auth.admin.deleteUser(id));
  }

  for (const [id, role] of [[coOwner, 'owner'], [coach, 'coach'], [member, 'member']]) {
    const { error } = await db.from('box_members').upsert(
      { box_id: box, member_id: id, role, status: 'active' },
      { onConflict: 'box_id,member_id' },
    );
    if (error) throw new Error(`décor box_members ${role} : ${error.message}`);
  }

  const sOwner = await signInAs(mk('ow'), PASSWORD);
  const sCo = await signInAs(mk('co'), PASSWORD);
  const sCoach = await signInAs(mk('ch'), PASSWORD);
  const sMember = await signInAs(mk('me'), PASSWORD);
  const sBuyer = await signInAs(mk('bu'), PASSWORD);
  const anon = anonClient();

  console.log('\n=== Lot 5-C — Programmes administrés par la box ===\n');

  // ── 1..2 : la box administre, pas la personne ─────────────────────────────
  console.log('— Frontière owner / co-gérant / coach');

  const progRow = {
    box_id: box, owner_id: coOwner, title: `zz_pb_prog_${stamp}`,
    price_cents: 4900, type: 'ongoing', invite_code: `zzpb${stamp}`.slice(-12),
    is_active: true, duration_weeks: 4, days_per_week: 3,
  };
  const { data: created, error: createErr } = await sCo.client
    .from('programs').insert(progRow).select('id').maybeSingle();
  assert('le co-gérant crée un programme dans sa box', !createErr && created?.id,
    createErr?.message ?? 'aucune ligne rendue');

  const programId = created?.id
    ?? (await db.from('programs').insert(progRow).select('id').single()).data.id;

  const { data: edited, error: editErr } = await sOwner.client
    .from('programs').update({ price_cents: 5900 }).eq('id', programId).select('id');
  assert('le gérant principal édite le programme créé par le co-gérant',
    !editErr && (edited ?? []).length === 1,
    editErr?.message ?? 'aucune ligne modifiée (policy owner_id = auth.uid() ?)');

  // ── 3..5 : le coach n'est pas dans l'argent ───────────────────────────────
  const { data: coachIns, error: coachInsErr } = await sCoach.client
    .from('programs').insert({
      box_id: box, owner_id: coach, title: `zz_pb_coach_${stamp}`,
      price_cents: 100, type: 'ongoing', invite_code: `zzpc${stamp}`.slice(-12),
    }).select('id');
  assert('le coach ne crée pas de programme',
    !!coachInsErr || (coachIns ?? []).length === 0,
    'insertion acceptée');

  const { data: coachUpd, error: coachUpdErr } = await sCoach.client
    .from('programs').update({ price_cents: 1 }).eq('id', programId).select('id');
  assert('le coach ne change pas un prix',
    !!coachUpdErr || (coachUpd ?? []).length === 0,
    'update acceptée');
  const { data: priceNow } = await db.from('programs').select('price_cents').eq('id', programId).single();
  assert('le prix en base est celui du gérant (5900), pas celui du coach',
    priceNow?.price_cents === 5900, `price_cents = ${priceNow?.price_cents}`);

  // ── Inscription de l'acheteur (par la porte backend, comme le webhook) ────
  const { error: pmErr } = await db.from('program_members').insert({
    program_id: programId, user_id: buyer, status: 'active', provenance: 'stripe',
    start_date: TODAY, stripe_checkout_session_id: `cs_test_zzpb_${stamp}`,
  });
  if (pmErr) throw new Error(`décor program_members : ${pmErr.message}`);

  const { data: coachPm } = await sCoach.client
    .from('program_members').select('id').eq('program_id', programId);
  assert('le coach ne lit pas les inscrits d\'un programme de sa box',
    (coachPm ?? []).length === 0, `${(coachPm ?? []).length} ligne(s) lue(s)`);

  // ── 6..9 : le contenu payé arrive à l'acheteur ───────────────────────────
  console.log('\n— Le contenu payé arrive à l\'acheteur');

  const { data: wods, error: wodErr } = await db.from('box_wods').insert([
    { box_id: box, created_by: owner, title: `zz_pb_libre_${stamp}`, scheduled_date: TODAY, is_published: true, sort_order: 1 },
    { box_id: box, created_by: owner, title: `zz_pb_vendu_${stamp}`, scheduled_date: TODAY, is_published: true, sort_order: 2 },
  ]).select('id, title');
  if (wodErr) throw new Error(`décor box_wods : ${wodErr.message}`);
  const freeWod = wods.find(w => w.title === `zz_pb_libre_${stamp}`).id;
  const soldWod = wods.find(w => w.title === `zz_pb_vendu_${stamp}`).id;

  const { data: access, error: accErr } = await db.from('wod_program_access')
    .insert({ wod_id: soldWod, program_id: programId }).select('id').single();
  if (accErr) throw new Error(`décor wod_program_access : ${accErr.message}`);

  const buyerSold = await readsRow(sBuyer.client, 'box_wods', soldWod);
  assert('l\'acheteur lit le WOD de son programme, hors de la box vendeuse',
    buyerSold.seen, buyerSold.error?.message ?? 'WOD absent (page vide côté athlète)');

  const buyerAccess = await readsRow(sBuyer.client, 'wod_program_access', access.id);
  assert('l\'acheteur lit le rattachement qui lui désigne ce WOD',
    buyerAccess.seen, buyerAccess.error?.message ?? 'rattachement absent');

  const memberSold = await readsRow(sMember.client, 'box_wods', soldWod);
  assert('un membre de la box sans inscription ne voit pas le WOD vendu',
    !memberSold.seen, 'WOD servi à un non-acheteur');

  const memberFree = await readsRow(sMember.client, 'box_wods', freeWod);
  assert('CONTRÔLE POSITIF : le WOD sans restriction reste visible des membres',
    memberFree.seen, memberFree.error?.message ?? 'WOD libre invisible — la garde est trop large');

  // ── 10..16 : grants anonymes ─────────────────────────────────────────────
  console.log('\n— Grants anonymes (motif R1/R2)');

  const { data: anonPublic, error: anonPublicErr } = await anon
    .from('programs').select('id, title, price_cents, type, image_url').eq('id', programId);
  assert('anon lit les colonnes publiques de programs (page /box/[slug])',
    !anonPublicErr && (anonPublic ?? []).length === 1,
    anonPublicErr?.message ?? 'aucune ligne — la page publique casserait');

  for (const col of COLONNES_PRIVEES) {
    const { error } = await anon.from('programs').select(col).eq('id', programId);
    assert(`anon ne lit pas programs.${col}`, !!error, 'colonne servie');
  }

  for (const table of TABLES_FERMEES_ANON) {
    const { data, error } = await anon.from(table).select('id');
    assert(`anon ne lit pas ${table}`,
      !!error || (data ?? []).length === 0, `${(data ?? []).length} ligne(s)`);
  }

  const { error: anonWriteErr } = await anon.from('box_wods').insert({
    box_id: box, title: `zz_pb_anon_${stamp}`, scheduled_date: TODAY,
  });
  assert('anon n\'écrit pas dans box_wods (TRUNCATE échappait à la RLS)',
    !!anonWriteErr, 'insertion anonyme acceptée');

  // ── 17..20 : join_program('staff') ───────────────────────────────────────
  console.log('\n— join_program(\'staff\') : dispenser de payer est une décision d\'argent');

  const staffCall = (client, userId) => client.rpc('join_program', {
    p_program_id: programId, p_source: 'staff', p_user_id: userId,
  });

  const { error: coachStaffErr } = await staffCall(sCoach.client, member);
  assert('le coach ne dispense pas de payer (join_program staff refusé)',
    !!coachStaffErr, 'assignation acceptée');

  const { error: ownerStaffErr } = await staffCall(sOwner.client, member);
  assert('le gérant assigne un membre de sa box',
    !ownerStaffErr, ownerStaffErr?.message);
  const { data: assigned } = await db.from('program_members')
    .select('provenance').eq('program_id', programId).eq('user_id', member).maybeSingle();
  assert('l\'assignation reste tracée \'staff\', jamais \'stripe\'',
    assigned?.provenance === 'staff', `provenance = ${assigned?.provenance}`);

  await db.from('program_members').delete().eq('program_id', programId).eq('user_id', member);
  const { error: coStaffErr } = await staffCall(sCo.client, member);
  assert('le co-gérant assigne aussi', !coStaffErr, coStaffErr?.message);

  const { error: outsiderErr } = await staffCall(sOwner.client, buyer === member ? owner : buyer);
  // `buyer` n'est pas membre actif de la box : la seconde garde de la RPC doit
  // le refuser, même pour un gérant.
  assert('un non-membre de la box n\'est pas assignable',
    !!outsiderErr, 'assignation d\'un non-membre acceptée');

  // ── 21..22 : les tables legacy ont disparu ───────────────────────────────
  console.log('\n— Tables legacy');
  for (const table of TABLES_LEGACY) {
    const { error } = await db.from(table).select('id').limit(1);
    assert(`${table} n'existe plus`, !!error, 'table encore interrogeable');
  }

  console.log(`\n=== ${passed} ✅ · ${failed} ❌ ===`);
}

attendu = PLAN.reduce((a, b) => a + b, 0);

main()
  .catch(e => { console.error(`\n💥 ${e?.message ?? e}`); failed++; })
  .finally(async () => {
    await runCleanup();
    process.exit(failed > 0 ? 1 : 0);
  });
