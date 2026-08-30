/**
 * test-essai-digest.mjs — Le récapitulatif hebdomadaire cesse de confondre
 * un essai avec une présence d'adhérent, et compte l'acquisition à part.
 *
 * Ce qui se constate ici, c'est le CONTENU du lot renvoyé par
 * `get_weekly_digest_batch()`, pas qu'un e-mail parte :
 *
 *   1. la box abonnée apparaît dans le lot ;
 *   2. `attendances` = 1 — seule la présence de l'adhérent est comptée, alors
 *      que DEUX réservations du même créneau sont pointées présentes ;
 *   3. CONTRÔLE NÉGATIF : le même périmètre, compté sans le filtre, donne 2.
 *      Sans lui, un test vert ne distinguerait pas « le filtre trie » de
 *      « rien ne pouvait être trié » ;
 *   4. `trials` = 1 — l'essai a sa propre ligne ;
 *   5. un prospect hors fenêtre (35 jours) ne gonfle pas le chiffre ;
 *   6. le prospect de la box voisine n'entre pas dans le compte de la box ;
 *   7. le lot reste réservé au service : un gérant authentifié est refusé, et
 *      le refus est nommé (sinon la donnée nominative du voisin serait lisible).
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-essai-digest.mjs
 * Cible fournie par TEST_SUPABASE_* (jamais la prod).
 */
import {
  requireTestTarget, serviceClient, signInAs, createUser,
  createOwnedBox, dropBoxAndOwner, onCleanup, runCleanup, installCleanupTraps,
} from './lib/test-env.mjs';

requireTestTarget();
installCleanupTraps();

const db = serviceClient();
const stamp = Date.now();
const PASSWORD = 'TestDigest1234!';
const ATTENDU = 7;

let passed = 0;
let failed = 0;

process.on('exit', () => {
  console.log(`ESSAI_DIGEST_ASSERTIONS=${passed + failed}/${ATTENDU}`);
});

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    if (detail) console.log(`     → ${detail}`);
    failed++;
  }
}

const jour = decalage => {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const mk = suffix => `zz_dg_${suffix}_${stamp}@test.athlex.local`;

  const owner = await createUser(db, { email: mk('ow'), password: PASSWORD, username: `zz_dg_ow_${stamp}`, role: 'box_owner' });
  const adherent = await createUser(db, { email: mk('ad'), password: PASSWORD, username: `zz_dg_ad_${stamp}` });
  const voisinOwner = await createUser(db, { email: mk('vo'), password: PASSWORD, username: `zz_dg_vo_${stamp}`, role: 'box_owner' });

  const box = await createOwnedBox(db, { tag: `dg${stamp}`, ownerId: owner, name: `zz_dg_box_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, box, owner));
  const boxVoisine = await createOwnedBox(db, { tag: `dgv${stamp}`, ownerId: voisinOwner, name: `zz_dg_boxv_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, boxVoisine, voisinOwner));
  onCleanup(() => db.auth.admin.deleteUser(adherent));

  const { error: eMembre } = await db.from('box_members').upsert(
    { box_id: box, member_id: adherent, role: 'member', status: 'active' },
    { onConflict: 'box_id,member_id' },
  );
  if (eMembre) throw new Error(`décor box_members : ${eMembre.message}`);

  // Décor : un cours d'hier, deux présences pointées — un adhérent, un essai.
  const { data: creneau, error: eCreneau } = await db.from('class_schedules').insert({
    box_id: box, title: 'zz Digest hier', scheduled_date: jour(-1),
    start_time: '18:00', end_time: '19:00', max_capacity: 5,
  }).select('id').single();
  if (eCreneau) throw new Error(`décor créneau : ${eCreneau.message}`);
  onCleanup(() => db.from('class_schedules').delete().eq('id', creneau.id));

  const { error: eResaMembre } = await db.from('class_reservations').insert({
    box_id: box, schedule_id: creneau.id, member_id: adherent,
    status: 'confirmed', attended: true,
  });
  if (eResaMembre) throw new Error(`décor réservation adhérent : ${eResaMembre.message}`);

  const mkProspect = async (boxId, email, quand) => {
    const { data, error } = await db.from('box_prospects').insert({
      box_id: boxId, first_name: 'Zoé', last_name: 'Digest',
      email, status: 'essai_reserve', source: 'trial_booking',
      ...(quand ? { created_at: quand } : {}),
    }).select('id').single();
    if (error) throw new Error(`décor prospect : ${error.message}`);
    onCleanup(() => db.from('box_prospects').delete().eq('id', data.id));
    return data.id;
  };

  const prospect = await mkProspect(box, `zz.dg.${stamp}@exemple.test`);
  const { error: eResaEssai } = await db.from('class_reservations').insert({
    box_id: box, schedule_id: creneau.id, member_id: null,
    prospect_id: prospect, is_trial: true, status: 'confirmed', attended: true,
  });
  if (eResaEssai) throw new Error(`décor réservation essai : ${eResaEssai.message}`);

  const vieux = new Date();
  vieux.setDate(vieux.getDate() - 35);
  await mkProspect(box, `zz.dg.vieux.${stamp}@exemple.test`, vieux.toISOString());
  await mkProspect(boxVoisine, `zz.dg.voisin.${stamp}@exemple.test`);

  console.log('\n=== Essai — récapitulatif hebdomadaire ===\n');

  const { data: lot, error: eLot } = await db.rpc('get_weekly_digest_batch', { p_days: 7 });
  if (eLot) throw new Error(`get_weekly_digest_batch : ${eLot.message}`);
  const ligne = (lot ?? []).find(r => r.box_id === box);

  assert('la box abonnée apparaît dans le lot', !!ligne,
    `${(lot ?? []).length} ligne(s), aucune pour ${box}`);
  assert('les présences ne comptent que l\'adhérent (1)', ligne?.attendances === 1,
    `attendances=${ligne?.attendances}`);

  // Contrôle négatif : le même périmètre sans le filtre.
  const { count: brut, error: eBrut } = await db
    .from('class_reservations')
    .select('id', { count: 'exact', head: true })
    .eq('schedule_id', creneau.id)
    .eq('attended', true);
  if (eBrut) throw new Error(`contrôle négatif : ${eBrut.message}`);
  assert('CONTRÔLE NÉGATIF : sans le filtre, le même périmètre compte 2', brut === 2,
    `brut=${brut} — si ce n'est pas 2, l'assertion précédente ne prouve rien`);

  assert('l\'acquisition a sa ligne : trials = 1', ligne?.trials === 1,
    `trials=${ligne?.trials}`);

  const { data: lotLarge, error: eLarge } = await db.rpc('get_weekly_digest_batch', { p_days: 7 });
  if (eLarge) throw new Error(`get_weekly_digest_batch (2e appel) : ${eLarge.message}`);
  const ligne2 = (lotLarge ?? []).find(r => r.box_id === box);
  assert('un prospect de 35 jours ne gonfle pas la semaine', ligne2?.trials === 1,
    `trials=${ligne2?.trials} alors qu'un second prospect existe hors fenêtre`);

  const ligneVoisine = (lot ?? []).find(r => r.box_id === boxVoisine);
  assert('le prospect de la box voisine reste chez elle',
    ligneVoisine?.trials === 1 && ligne?.trials === 1,
    `voisine=${ligneVoisine?.trials}, box=${ligne?.trials}`);

  const sOwner = await signInAs(mk('ow'), PASSWORD);
  const { error: eOwner } = await sOwner.client.rpc('get_weekly_digest_batch', { p_days: 7 });
  assert('le lot reste réservé au service, refus nommé',
    !!eOwner && /FORBIDDEN|permission|denied|privilege/i.test(eOwner.message ?? ''),
    eOwner ? eOwner.message : 'aucune erreur : un gérant a lu les e-mails des autres box');
}

try {
  await main();
} finally {
  await runCleanup();
}

console.log(`\n=== ${passed} réussies, ${failed} échouées ===\n`);
process.exit(failed === 0 ? 0 : 1);
