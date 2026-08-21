/**
 * test-admin-boxes.mjs — Lot 5-B : « quelles box j'administre, et à quel titre »
 * est-il prononcé par le SERVEUR, et le titre discrimine-t-il réellement ?
 *
 * Avant cette RPC, la règle vivait à trois endroits (résolveur serveur,
 * résolveur client, appel séparé à `is_box_owner_admin`) et aucun des deux
 * résolveurs ne connaissait `role = 'coach'` : un coach ne pouvait pas ouvrir
 * le back-office du tout. Le titre décide maintenant des routes argent côté
 * serveur — donc il doit être mesuré, pas supposé.
 *
 * Ce que la suite exige :
 *   1. gérant principal → sa box, `my_role = 'owner'` ;
 *   2. co-gérant (box_members role='owner' actif) → `'owner'` ;
 *   3. coach actif → sa box, `my_role = 'coach'` — la ligne qui n'existait pas ;
 *   4. CONTRÔLE NÉGATIF : membre simple → aucune ligne ;
 *   5. coach désactivé (`status = 'inactive'`) → aucune ligne ;
 *   6. titre le plus fort : coach promu co-gérant → `'owner'`, jamais `'coach'` ;
 *   7. étanchéité : le coach de la box A ne voit pas la box B ;
 *   8. la clé anon est refusée PAR LE GRANT (message de grant, pas de corps).
 *
 * Sans 1/2 (contrôle positif), « personne n'administre rien » se lirait comme
 * un succès alors que ce serait une panne du back-office.
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-admin-boxes.mjs
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
const PASSWORD = 'TestAdminBoxes1234!';

let passed = 0;
let failed = 0;
/** Dérivé de la liste d'assertions, pas écrit en dur (règle 16). */
let ATTENDU = null;

function ok(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, detail) {
  console.log(`  ❌ ${label}`);
  if (detail) console.log(`     → ${detail}`);
  failed++;
}
function assert(label, condition, detail = '') {
  if (condition) ok(label); else fail(label, detail);
}

/** Ce que l'app appelle vraiment : la RPC, avec le JWT de l'utilisateur. */
async function adminBoxes(client) {
  const { data, error } = await client.rpc('get_my_admin_boxes');
  if (error) return { rows: [], error };
  return { rows: data ?? [], error: null };
}

function roleOn(rows, boxId) {
  const row = rows.find(r => r.id === boxId);
  return row ? row.my_role : null;
}

async function main() {
  const mk = suffix => `zz_ab_${suffix}_${stamp}@test.athlex.local`;

  const ownerA = await createUser(db, { email: mk('owa'), password: PASSWORD, username: `zz_ab_owa_${stamp}`, role: 'box_owner' });
  const ownerB = await createUser(db, { email: mk('owb'), password: PASSWORD, username: `zz_ab_owb_${stamp}`, role: 'box_owner' });
  const boxA = await createOwnedBox(db, { tag: `ab-a-${stamp}`, ownerId: ownerA });
  const boxB = await createOwnedBox(db, { tag: `ab-b-${stamp}`, ownerId: ownerB });
  onCleanup(() => dropBoxAndOwner(db, boxA, ownerA));
  onCleanup(() => dropBoxAndOwner(db, boxB, ownerB));

  const coOwner = await createUser(db, { email: mk('co'), password: PASSWORD, username: `zz_ab_co_${stamp}` });
  const coach = await createUser(db, { email: mk('co4'), password: PASSWORD, username: `zz_ab_co4_${stamp}` });
  const exCoach = await createUser(db, { email: mk('ex'), password: PASSWORD, username: `zz_ab_ex_${stamp}` });
  const member = await createUser(db, { email: mk('mb'), password: PASSWORD, username: `zz_ab_mb_${stamp}` });
  const promu = await createUser(db, { email: mk('pr'), password: PASSWORD, username: `zz_ab_pr_${stamp}` });
  for (const id of [coOwner, coach, exCoach, member, promu]) {
    onCleanup(() => db.auth.admin.deleteUser(id));
  }

  const { error: memErr } = await db.from('box_members').insert([
    { box_id: boxA, member_id: coOwner, role: 'owner', status: 'active' },
    { box_id: boxA, member_id: coach, role: 'coach', status: 'active' },
    { box_id: boxA, member_id: exCoach, role: 'coach', status: 'inactive' },
    { box_id: boxA, member_id: member, role: 'member', status: 'active' },
    // Deux titres sur la même box : le plus fort doit gagner.
    { box_id: boxA, member_id: promu, role: 'owner', status: 'active' },
    { box_id: boxB, member_id: promu, role: 'coach', status: 'active' },
  ]);
  if (memErr) throw new Error(`box_members : ${memErr.message}`);

  console.log('\n=== Lot 5-B — get_my_admin_boxes() : le titre est-il prononcé par le serveur ? ===\n');

  // Une connexion par personne, puis une lecture par personne : les assertions
  // portent ensuite sur des valeurs déjà mesurées.
  const vu = {};
  const clients = {};
  for (const [nom, mail] of [['gerant', mk('owa')], ['cogerant', mk('co')], ['coach', mk('co4')], ['membre', mk('mb')], ['exCoach', mk('ex')], ['promu', mk('pr')]]) {
    const { client } = await signInAs(mail, PASSWORD);
    clients[nom] = client;
    vu[nom] = await adminBoxes(client);
  }
  const anonRefus = await anonClient().rpc('get_my_admin_boxes');

  // `/stats` est la seule page mixte : l'argent y est un BLOC dans une page
  // par ailleurs légitime. La décision d'autorisation du bloc argent n'est donc
  // pas déléguée à la route : elle est prononcée par les RPC elles-mêmes. On la
  // mesure ici, sinon « le coach ne voit pas l'argent » ne repose que sur le
  // fait qu'aucun lien ne l'y mène.
  const periode = ['2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z'];
  const argentCoach = await clients.coach.rpc('get_box_money_summary', { p_box_id: boxA, p_from: periode[0], p_to: periode[1] });
  const argentGerant = await clients.gerant.rpc('get_box_money_summary', { p_box_id: boxA, p_from: periode[0], p_to: periode[1] });
  const assiduiteCoach = await clients.coach.rpc('get_box_attendance_summary', { p_box_id: boxA, p_from: '2026-01-01', p_to: '2026-12-31' });

  // L'attendu est DÉRIVÉ de cette liste, jamais recopié : ajouter une assertion
  // sans toucher un compteur écrit en dur rendrait la suite incomplète en
  // silence (règle 16).
  const ASSERTIONS = [
    // Contrôle positif : sans lui, « personne n'administre rien » se lirait
    // comme un succès alors que ce serait une panne du back-office.
    ['gérant principal : sa box est rendue', () => roleOn(vu.gerant.rows, boxA) !== null, () => vu.gerant.error?.message ?? `rows=${vu.gerant.rows.length}`],
    ["gérant principal : my_role = 'owner'", () => roleOn(vu.gerant.rows, boxA) === 'owner', () => `my_role=${roleOn(vu.gerant.rows, boxA)}`],
    ['gérant principal : ne voit pas la box d’autrui', () => roleOn(vu.gerant.rows, boxB) === null],
    ["co-gérant : my_role = 'owner' (même frontière argent que le gérant)", () => roleOn(vu.cogerant.rows, boxA) === 'owner', () => `my_role=${roleOn(vu.cogerant.rows, boxA)}`],
    // La ligne qui n'existait pas : le coach entre, et il entre EN TANT QUE coach.
    ['coach actif : sa box est rendue (le back-office lui est ouvert)', () => roleOn(vu.coach.rows, boxA) !== null, () => `rows=${vu.coach.rows.length}`],
    ["coach actif : my_role = 'coach', pas 'owner'", () => roleOn(vu.coach.rows, boxA) === 'coach', () => `my_role=${roleOn(vu.coach.rows, boxA)}`],
    ['membre simple : aucune box', () => vu.membre.rows.length === 0, () => `rows=${vu.membre.rows.length}`],
    ["coach status = 'inactive' : aucune box", () => vu.exCoach.rows.length === 0, () => `rows=${vu.exCoach.rows.length}`],
    ["double titre : 'owner' gagne sur la box A", () => roleOn(vu.promu.rows, boxA) === 'owner', () => `my_role=${roleOn(vu.promu.rows, boxA)}`],
    ["étanchéité : reste 'coach' sur la box B", () => roleOn(vu.promu.rows, boxB) === 'coach', () => `my_role=${roleOn(vu.promu.rows, boxB)}`],
    // Refus prononcé par le GRANT, pas par le corps de la fonction.
    ['clé anon : refusée par le grant (permission denied for function)',
      () => !!anonRefus.error && /permission denied for function/i.test(anonRefus.error.message),
      () => anonRefus.error ? anonRefus.error.message : 'aucune erreur — la RPC a répondu à anon'],
    // Le bloc argent de /stats : refus prononcé par le serveur, pas par la nav.
    ['bloc argent : le coach est refusé par get_box_money_summary',
      () => !!argentCoach.error && /FORBIDDEN/.test(argentCoach.error.message),
      () => argentCoach.error ? argentCoach.error.message : 'aucune erreur — le coach a reçu le MRR'],
    // Contrôle positif : sans lui, une RPC cassée pour tout le monde passerait
    // pour une frontière argent qui tient.
    ['bloc argent : le gérant, lui, est servi',
      () => !argentGerant.error && Array.isArray(argentGerant.data),
      () => argentGerant.error?.message ?? 'aucune ligne'],
    // La page est mixte pour de vrai : l'assiduité reste ouverte au coach côté
    // serveur (c'est le périmètre du lot 6). Le refus de la route /stats est
    // donc un choix de périmètre, pas la barrière qui protège l'argent.
    ['assiduité : le coach est servi côté serveur (périmètre lot 6)',
      () => !assiduiteCoach.error,
      () => assiduiteCoach.error?.message ?? ''],
  ];
  ATTENDU = ASSERTIONS.length;

  for (const [label, test, detail] of ASSERTIONS) {
    assert(label, test(), detail ? detail() : '');
  }
}

/** Le compte est imprimé même si le processus meurt entre deux assertions. */
process.on('exit', () => {
  const total = passed + failed;
  console.log(`\n=== ${passed} ✅ · ${failed} ❌ ===`);
  console.log(`ADMIN_BOXES_ASSERTIONS=${total}/${ATTENDU ?? '?'}`);
  if (ATTENDU === null || total !== ATTENDU) {
    console.log(`  ❌ suite incomplète — ${total}/${ATTENDU ?? '?'} assertions exécutées`);
    process.exitCode = 1;
  } else if (failed > 0) {
    process.exitCode = 1;
  }
});

main()
  .catch(err => { console.error('\n💥', err.message); process.exitCode = 1; })
  .finally(runCleanup);
