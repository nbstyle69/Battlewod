/**
 * test-wod-derived-reads.mjs — Lot 5-A bis : ce qui est ACCROCHÉ à un WOD
 * restreint est-il fermé comme le WOD lui-même ?
 *
 * 20261113 a fermé la lecture du WOD (`box_wods.member_see_published` appelle
 * `wod_access_allowed`). Restaient ouvertes, à la clé `authenticated`, toutes
 * les lectures dérivées : le classement (`wod_scores`), les complétions
 * (`wod_completions`), les gains d'ELO (`elo_history`, `box_elo_history`), les
 * commentaires (`score_comments`) et les réactions (`score_reactions`, dont la
 * policy était `USING (true)` — donc lisible à la clé anon). Un membre hors
 * groupe ne voyait plus le WOD mais lisait toujours son classement : une garde
 * sur deux.
 *
 * Trois cas par surface, et le troisième est celui sans lequel la suite ne
 * mesure rien :
 *   1. membre de la box SANS accès au WOD → la ligne dérivée est absente ;
 *   2. membre AVEC accès (inscription active / groupe) → il la lit ;
 *   3. CONTRÔLE POSITIF : la même ligne dérivée d'un WOD SANS restriction reste
 *      lisible de tous les membres. Sans lui, « plus personne ne lit rien »
 *      passerait pour un succès.
 *
 * Plus trois frontières : sa propre ligne reste lisible même sans accès (un
 * athlète ne perd pas son historique), le staff lit ce qu'il programme, et la
 * clé anonyme ne lit rien.
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-wod-derived-reads.mjs
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
const PASSWORD = 'TestWodDerived1234!';
const TODAY = new Date().toISOString().slice(0, 10);

let passed = 0;
let failed = 0;
let attendu = null;

// Un contrôle affirme qu'il a tourné, pas seulement ce qu'il a trouvé : le
// compte s'imprime même si le processus meurt entre deux assertions.
process.on('exit', () => {
  if (attendu !== null) {
    console.log(`WOD_DERIVED_ASSERTIONS=${passed + failed}/${attendu}`);
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
  const mk = suffix => `zz_wd_${suffix}_${stamp}@test.athlex.local`;

  const owner = await createUser(db, { email: mk('ow'), password: PASSWORD, username: `zz_wd_ow_${stamp}`, role: 'box_owner' });
  const coach = await createUser(db, { email: mk('ch'), password: PASSWORD, username: `zz_wd_ch_${stamp}` });
  const buyer = await createUser(db, { email: mk('bu'), password: PASSWORD, username: `zz_wd_bu_${stamp}` });
  const author = await createUser(db, { email: mk('au'), password: PASSWORD, username: `zz_wd_au_${stamp}` });
  const plain = await createUser(db, { email: mk('pl'), password: PASSWORD, username: `zz_wd_pl_${stamp}` });

  const box = await createOwnedBox(db, { tag: `wd${stamp}`, ownerId: owner, name: `zz_wd_box_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, box, owner));
  for (const id of [coach, buyer, author, plain]) {
    onCleanup(() => db.auth.admin.deleteUser(id));
  }

  for (const [member, role] of [
    [coach, 'coach'], [buyer, 'member'], [author, 'member'], [plain, 'member'],
  ]) {
    const { error } = await db.from('box_members').upsert(
      { box_id: box, member_id: member, role, status: 'active' },
      { onConflict: 'box_id,member_id' },
    );
    if (error) throw new Error(`décor box_members ${role} : ${error.message}`);
  }

  // Un programme payant, deux inscrits actifs : `author` produit les lignes
  // dérivées, `buyer` les lit — sinon on prouverait la branche « ma propre
  // ligne » et non la lecture de box.
  const { data: program, error: progErr } = await db.from('programs').insert({
    box_id: box, owner_id: owner, title: `zz_wd_prog_${stamp}`,
    price_cents: 4000, type: 'ongoing', invite_code: `zzwd${stamp}`.slice(-12),
  }).select('id').single();
  if (progErr) throw new Error(`décor programs : ${progErr.message}`);

  for (const user of [buyer, author]) {
    const { error } = await db.from('program_members').insert({
      program_id: program.id, user_id: user, status: 'active', provenance: 'stripe',
      start_date: TODAY, stripe_checkout_session_id: `cs_test_zzwd_${stamp}_${user.slice(0, 8)}`,
    });
    if (error) throw new Error(`décor program_members : ${error.message}`);
  }

  // Deux WOD publiés : un libre, un réservé au programme.
  const wodRows = [
    { box_id: box, created_by: owner, title: `zz_wd_libre_${stamp}`, scheduled_date: TODAY, is_published: true, sort_order: 1 },
    { box_id: box, created_by: owner, title: `zz_wd_prog_wod_${stamp}`, scheduled_date: TODAY, is_published: true, sort_order: 2 },
  ];
  const { data: wods, error: wodErr } = await db.from('box_wods').insert(wodRows).select('id, title');
  if (wodErr) throw new Error(`décor box_wods : ${wodErr.message}`);
  const freeWod = wods.find(w => w.title === wodRows[0].title).id;
  const progWod = wods.find(w => w.title === wodRows[1].title).id;

  {
    const { error } = await db.from('wod_program_access').insert({ wod_id: progWod, program_id: program.id });
    if (error) throw new Error(`décor wod_program_access : ${error.message}`);
  }

  // Les lignes dérivées, en double : une sur le WOD restreint, une sur le libre.
  async function insertOne(table, row) {
    const { data, error } = await db.from(table).insert(row).select('id').single();
    if (error) throw new Error(`décor ${table} : ${error.message}`);
    return data.id;
  }

  const scoreRestricted = await insertOne('wod_scores', {
    wod_id: progWod, member_id: author, box_id: box, score_type: 'reps', score_value: 120,
  });
  const scoreFree = await insertOne('wod_scores', {
    wod_id: freeWod, member_id: author, box_id: box, score_type: 'reps', score_value: 100,
  });
  // Le score du membre sans accès, sur le WOD restreint : sa propre ligne doit
  // lui rester lisible (un athlète ne perd pas son historique).
  const scoreOwnNoAccess = await insertOne('wod_scores', {
    wod_id: progWod, member_id: plain, box_id: box, score_type: 'reps', score_value: 80,
  });

  /**
   * Les six surfaces dérivées. Le nombre d'assertions attendu est DÉRIVÉ de
   * cette liste : ajouter une surface sans toucher au compteur rendrait la
   * suite incomplète en silence (règle 16).
   */
  const SURFACES = [
    {
      table: 'wod_completions', libelle: 'la complétion',
      restricted: await insertOne('wod_completions', { wod_id: progWod, member_id: author, box_id: box }),
      free: await insertOne('wod_completions', { wod_id: freeWod, member_id: author, box_id: box }),
    },
    {
      table: 'wod_scores', libelle: 'le score',
      restricted: scoreRestricted, free: scoreFree,
    },
    {
      table: 'elo_history', libelle: 'le gain d\'ELO',
      restricted: await insertOne('elo_history', { wod_id: progWod, member_id: author, box_id: box, elo_before: 1000, elo_after: 1020, elo_delta: 20 }),
      free: await insertOne('elo_history', { wod_id: freeWod, member_id: author, box_id: box, elo_before: 1020, elo_after: 1030, elo_delta: 10 }),
    },
    {
      table: 'box_elo_history', libelle: 'le gain d\'ELO de box',
      restricted: await insertOne('box_elo_history', { wod_id: progWod, member_id: author, box_id: box, elo_before: 1000, elo_after: 1020, elo_delta: 20 }),
      free: await insertOne('box_elo_history', { wod_id: freeWod, member_id: author, box_id: box, elo_before: 1020, elo_after: 1030, elo_delta: 10 }),
    },
    {
      table: 'score_comments', libelle: 'le commentaire',
      restricted: await insertOne('score_comments', { score_id: scoreRestricted, box_id: box, author_id: author, content: 'zz restreint' }),
      free: await insertOne('score_comments', { score_id: scoreFree, box_id: box, author_id: author, content: 'zz libre' }),
    },
    {
      table: 'score_reactions', libelle: 'la réaction',
      restricted: await insertOne('score_reactions', { score_id: scoreRestricted, user_id: author, emoji: '🔥' }),
      free: await insertOne('score_reactions', { score_id: scoreFree, user_id: author, emoji: '💪' }),
    },
  ];

  // 3 assertions par surface + 2 « ma propre ligne » + 2 staff + 2 anon.
  attendu = SURFACES.length * 3 + 6;

  const BU = await signInAs(mk('bu'), PASSWORD);
  const PL = await signInAs(mk('pl'), PASSWORD);
  const OW = await signInAs(mk('ow'), PASSWORD);
  const CH = await signInAs(mk('ch'), PASSWORD);

  console.log('\n── 1. Membre de la box SANS accès au WOD : rien de dérivé ───────');
  for (const s of SURFACES) {
    const { seen } = await readsRow(PL.client, s.table, s.restricted);
    assert(`${s.libelle} du WOD restreint est absent de sa lecture (${s.table})`, !seen);
  }

  console.log('\n── 2. Membre AVEC accès : il lit ────────────────────────────────');
  for (const s of SURFACES) {
    const { seen, error } = await readsRow(BU.client, s.table, s.restricted);
    assert(`${s.libelle} du WOD restreint est lu par l'inscrit (${s.table})`, seen,
      error?.message ?? 'aucune ligne');
  }

  console.log('\n── 3. Contrôle positif : le dérivé d\'un WOD LIBRE reste lisible ─');
  for (const s of SURFACES) {
    const { seen, error } = await readsRow(PL.client, s.table, s.free);
    assert(`${s.libelle} d'un WOD sans restriction reste lu par tout membre (${s.table})`, seen,
      error?.message ?? 'aucune ligne');
  }

  console.log('\n── 4. Sa propre ligne reste lisible sans accès ──────────────────');
  {
    const { seen, error } = await readsRow(PL.client, 'wod_scores', scoreOwnNoAccess);
    assert('le membre sans accès lit SON score sur le WOD restreint', seen,
      error?.message ?? 'aucune ligne');
  }
  {
    const { seen } = await readsRow(PL.client, 'wod_scores', scoreRestricted);
    assert('mais pas celui d\'un autre sur ce même WOD', !seen);
  }

  console.log('\n── 5. Le staff lit ce qu\'il programme ──────────────────────────');
  for (const [label, session] of [['gérant', OW], ['coach', CH]]) {
    const { seen, error } = await readsRow(session.client, 'wod_scores', scoreRestricted);
    assert(`le ${label} lit le score du WOD restreint`, seen, error?.message ?? 'aucune ligne');
  }

  console.log('\n── 6. La clé anonyme ne lit rien ───────────────────────────────');
  // `score_reactions` portait `USING (true)` avec le grant SELECT à `anon` :
  // les couples (score, athlète) étaient lisibles sans aucune authentification.
  for (const table of ['score_reactions', 'wod_scores']) {
    const anon = anonClient();
    const { data } = await anon.from(table).select('id').limit(5);
    assert(`aucune ligne de ${table} à la clé anon`, (data ?? []).length === 0,
      `vu : ${JSON.stringify(data)}`);
  }

  if (passed + failed !== attendu) {
    fail(`audit incomplet — ${passed + failed}/${attendu} assertions exécutées`);
  }
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
