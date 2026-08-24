/**
 * test-essai-lot-base.mjs — Offre Essai, lot base : le serveur du tunnel.
 *
 * Le parcours est la seule écriture anonyme du produit. La suite ne mesure donc
 * pas « un écran affiche une confirmation », mais ce que la BASE contient après
 * le geste, sous la vraie clé publique — et ce qu'elle refuse.
 *
 *   L'offre Essai est gratuite parce que la base le refuse autrement
 *     1. `plan_type='trial'` à 30 € : refusé (sinon il part en abonnement
 *        mensuel — le checkout ne regarde que le prix nul, pas le type) ;
 *     2. la même offre à 0 € : acceptée ;
 *     3. une seconde offre Essai dans la même box : refusée ;
 *     4. CONTRÔLE NÉGATIF : un `plan_type` inventé reste refusé — le CHECK a
 *        été étendu, pas ouvert.
 *
 *   Le calendrier public (anon ne lit NI class_schedules NI class_reservations)
 *     5. box sans offre Essai : `offre_essai_absente` ;
 *     6. box inexistante : `box_introuvable` ;
 *     7. le créneau à venir est proposé, places restantes = capacité ;
 *     8. un créneau passé n'est pas proposé ;
 *     9. un créneau complet n'est pas proposé ;
 *    10. CONTRÔLE NÉGATIF : la RPC n'est pas un grant — `anon` ne lit toujours
 *        pas `class_schedules` en direct.
 *
 *   La réservation
 *    11. prénom absent → refus nommé ;
 *    12. e-mail malformé → refus nommé ;
 *    13. réservation légitime : prospect créé, réservation `is_trial`,
 *        `confirmed`, `member_id` NULL ;
 *    14. la place est réellement décomptée dans le calendrier public ;
 *    15. doublon (même e-mail, même créneau) : refusé, et aucune 2e ligne ;
 *    16. le même e-mail sur un AUTRE créneau : accepté (2e essai) ;
 *    17. le 3e : plafond par e-mail atteint ;
 *    18. créneau complet : refusé — et AUCUNE ligne `waiting` créée (le trigger
 *        bascule en liste d'attente en silence ; un essai ne doit jamais y
 *        aller, donc la fonction relit le statut écrit) ;
 *    19. créneau passé : refusé ;
 *    20. box sans offre Essai : refusé.
 *
 *   Le NULL n'est jamais libre
 *    21. `member_id` NULL hors essai : refusé par la contrainte ;
 *    22. un essai AVEC membre : refusé aussi (le triplet est cohérent ou rien) ;
 *    23. CONTRÔLE POSITIF : la réservation d'un adhérent passe toujours.
 *
 *   Les coordonnées ne fuient pas
 *    24. l'adhérent lambda voit la RÉSERVATION d'essai (la table est lue par
 *        toute la box — c'est le fait mesuré qui a écarté les coordonnées) ;
 *    25. …et ne lit AUCUNE ligne de `box_prospects` ;
 *    26. `anon` non plus, et le refus est nommé sur le grant ;
 *    27. le gérant lit ses prospects ; la box voisine n'en lit aucun.
 *
 *   « venu / pas venu » viennent du pointage, pas d'une seconde saisie
 *    28. `attended = true`  → statut `venu` ;
 *    29. `attended = false` → statut `pas_venu` ;
 *    30. un prospect `converti` ne redescend pas sur un pointage.
 *
 *   Quota et crédits ne s'appliquent pas à un essai
 *    31. deux essais la même semaine dans une box à 1 séance/semaine : passent ;
 *    32. aucun crédit consommé (`credit_id` NULL).
 *
 *   Le funnel legacy ne casse pas
 *    33. un essai pointé présent : `detect_trial_followups()` traverse et ne
 *        crée aucun suivi pour le prospect.
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-essai-lot-base.mjs
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
const PASSWORD = 'TestEssai1234!';

const PLAN = [4, 6, 10, 3, 4, 3, 2, 1];

let passed = 0;
let failed = 0;
let attendu = null;

process.on('exit', () => {
  if (attendu !== null) {
    console.log(`ESSAI_LOT_BASE_ASSERTIONS=${passed + failed}/${attendu}`);
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

/** Un refus se constate par son message, jamais par une absence de ligne. */
function refus(error, motif) {
  return !!error && new RegExp(motif, 'i').test(error.message ?? '');
}

const jour = decalage => {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const mk = suffix => `zz_es_${suffix}_${stamp}@test.athlex.local`;
  const visiteur = n => `zz.visiteur${n}.${stamp}@exemple.test`;

  const owner = await createUser(db, { email: mk('ow'), password: PASSWORD, username: `zz_es_ow_${stamp}`, role: 'box_owner' });
  const adherent = await createUser(db, { email: mk('ad'), password: PASSWORD, username: `zz_es_ad_${stamp}` });
  const voisinOwner = await createUser(db, { email: mk('vo'), password: PASSWORD, username: `zz_es_vo_${stamp}`, role: 'box_owner' });

  const box = await createOwnedBox(db, { tag: `es${stamp}`, ownerId: owner, name: `zz_es_box_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, box, owner));
  const boxVoisine = await createOwnedBox(db, { tag: `esv${stamp}`, ownerId: voisinOwner, name: `zz_es_boxv_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, boxVoisine, voisinOwner));
  onCleanup(() => db.auth.admin.deleteUser(adherent));

  const { error: eMembre } = await db.from('box_members').upsert(
    { box_id: box, member_id: adherent, role: 'member', status: 'active' },
    { onConflict: 'box_id,member_id' },
  );
  if (eMembre) throw new Error(`décor box_members : ${eMembre.message}`);

  const mkCreneau = async ({ date, heure = '18:00', capacite = 3, titre = 'WOD' }) => {
    const { data, error } = await db.from('class_schedules').insert({
      box_id: box, title: titre, scheduled_date: date,
      start_time: heure, end_time: '19:00', max_capacity: capacite,
    }).select('id').single();
    if (error) throw new Error(`décor créneau : ${error.message}`);
    onCleanup(() => db.from('class_schedules').delete().eq('id', data.id));
    return data.id;
  };

  const cFutur = await mkCreneau({ date: jour(3), capacite: 3, titre: 'zz Essai A' });
  const cFutur2 = await mkCreneau({ date: jour(4), capacite: 3, titre: 'zz Essai B' });
  const cFutur3 = await mkCreneau({ date: jour(5), capacite: 3, titre: 'zz Essai C' });
  const cPasse = await mkCreneau({ date: jour(-2), capacite: 3, titre: 'zz Essai passé' });
  const cPlein = await mkCreneau({ date: jour(6), capacite: 1, titre: 'zz Essai plein' });
  const cQuota = await mkCreneau({ date: jour(2), heure: '09:00', capacite: 5, titre: 'zz Essai quota 1' });
  const cQuota2 = await mkCreneau({ date: jour(2), heure: '11:00', capacite: 5, titre: 'zz Essai quota 2' });

  const anon = anonClient();
  const sOwner = await signInAs(mk('ow'), PASSWORD);
  const sVoisin = await signInAs(mk('vo'), PASSWORD);
  const sAdherent = await signInAs(mk('ad'), PASSWORD);

  const slots = (client, boxId) => client.rpc('list_public_trial_slots', { p_box_id: boxId });
  const reserve = (client, args) => client.rpc('book_trial_slot', args);
  const reserveEssai = (schedule, email, prenom = 'Zoé') => reserve(anon, {
    p_box_id: box, p_schedule_id: schedule,
    p_first_name: prenom, p_last_name: 'Testeuse',
    p_email: email, p_phone: '0600000000',
  });

  attendu = PLAN.reduce((a, b) => a + b, 0);
  console.log('\n=== Offre Essai — lot base ===\n');

  // ── 1..4 : gratuit parce que la base le refuse autrement ──────────────────
  console.log('— L\'offre Essai est gratuite parce que la base le refuse autrement');

  const trialPayant = await db.from('membership_plans').insert({
    box_id: box, name: `zz Essai payant ${stamp}`, plan_type: 'trial', price_cents: 3000,
  }).select('id').maybeSingle();
  assert('une offre « trial » à 30 € est refusée par la base',
    refus(trialPayant.error, 'membership_plans_trial_gratuit'),
    trialPayant.error?.message ?? 'acceptée : un essai payant partirait en abonnement mensuel');

  const trial = await db.from('membership_plans').insert({
    box_id: box, name: `zz Essai ${stamp}`, plan_type: 'trial', price_cents: 0,
    description: 'Séance découverte offerte', is_active: true,
  }).select('id').maybeSingle();
  assert('la même offre à 0 € est acceptée',
    !trial.error && !!trial.data?.id,
    trial.error?.message ?? 'aucune ligne rendue');
  if (trial.data?.id) onCleanup(() => db.from('membership_plans').delete().eq('id', trial.data.id));

  const trialBis = await db.from('membership_plans').insert({
    box_id: box, name: `zz Essai bis ${stamp}`, plan_type: 'trial', price_cents: 0,
  }).select('id').maybeSingle();
  assert('une seconde offre Essai dans la même box est refusée',
    refus(trialBis.error, 'membership_plans_une_offre_trial_par_box|duplicate key'),
    trialBis.error?.message ?? 'acceptée : le parcours public aurait deux Essai concurrents');

  const typeInvente = await db.from('membership_plans').insert({
    box_id: box, name: `zz Essai inventé ${stamp}`, plan_type: 'essai', price_cents: 0,
  }).select('id').maybeSingle();
  assert('CONTRÔLE NÉGATIF : un plan_type inventé reste refusé',
    refus(typeInvente.error, 'plan_type_check'),
    typeInvente.error?.message ?? 'accepté : le CHECK a été ouvert, pas étendu');

  // ── 5..10 : le calendrier public ──────────────────────────────────────────
  console.log('\n— Le calendrier public passe par la RPC, pas par un grant');

  const sansOffre = await slots(anon, boxVoisine);
  assert('box sans offre Essai : refus nommé « offre_essai_absente »',
    sansOffre.data?.ok === false && sansOffre.data?.reason === 'offre_essai_absente',
    JSON.stringify(sansOffre.data ?? sansOffre.error));

  const boxFantome = await slots(anon, '00000000-0000-0000-0000-000000000000');
  assert('box inexistante : refus nommé « box_introuvable »',
    boxFantome.data?.ok === false && boxFantome.data?.reason === 'box_introuvable',
    JSON.stringify(boxFantome.data ?? boxFantome.error));

  const vue1 = await slots(anon, box);
  const trouve = (payload, id) => (payload?.slots ?? []).find(s => s.schedule_id === id);
  assert('le créneau à venir est proposé, places restantes = capacité',
    vue1.data?.ok === true && trouve(vue1.data, cFutur)?.seats_left === 3,
    JSON.stringify(vue1.data ?? vue1.error));

  assert('un créneau passé n\'est pas proposé',
    vue1.data?.ok === true && !trouve(vue1.data, cPasse),
    `créneau passé présent : ${JSON.stringify(trouve(vue1.data, cPasse))}`);

  // Le créneau « plein » est rempli par un adhérent, pas par un essai : la
  // capacité doit être vue de la même façon quelle que soit l'origine.
  const { error: eRemplit } = await db.from('class_reservations').insert({
    schedule_id: cPlein, box_id: box, member_id: adherent, status: 'confirmed',
  });
  if (eRemplit) throw new Error(`décor créneau plein : ${eRemplit.message}`);

  const vue2 = await slots(anon, box);
  assert('un créneau complet n\'est pas proposé',
    vue2.data?.ok === true && !trouve(vue2.data, cPlein),
    `créneau complet présent : ${JSON.stringify(trouve(vue2.data, cPlein))}`);

  const lectureDirecte = await anon.from('class_schedules').select('id').eq('box_id', box);
  assert('CONTRÔLE NÉGATIF : anon ne lit pas class_schedules en direct',
    (lectureDirecte.data ?? []).length === 0,
    `${(lectureDirecte.data ?? []).length} ligne(s) lues sans session`);

  // ── 11..20 : la réservation ───────────────────────────────────────────────
  console.log('\n— La réservation : chaque refus est nommé, la place est réelle');

  const sansPrenom = await reserveEssai(cFutur, visiteur('x'), '   ');
  assert('prénom absent : refus nommé',
    sansPrenom.data?.ok === false && sansPrenom.data?.reason === 'prenom_absent',
    JSON.stringify(sansPrenom.data ?? sansPrenom.error));

  const mailFaux = await reserveEssai(cFutur, 'pas-un-email');
  assert('e-mail malformé : refus nommé',
    mailFaux.data?.ok === false && mailFaux.data?.reason === 'email_invalide',
    JSON.stringify(mailFaux.data ?? mailFaux.error));

  const r1 = await reserveEssai(cFutur, visiteur(1));
  const { data: ligne1 } = await db.from('class_reservations')
    .select('id, status, is_trial, member_id, prospect_id, credit_id')
    .eq('prospect_id', r1.data?.prospect_id ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle();
  const { data: prospect1 } = await db.from('box_prospects')
    .select('id, status, email, phone, plan_id, schedule_id')
    .eq('id', r1.data?.prospect_id ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle();
  assert('réservation légitime : prospect créé, réservation d\'essai confirmée sans membre',
    r1.data?.ok === true
    && ligne1?.status === 'confirmed' && ligne1?.is_trial === true && ligne1?.member_id === null
    && prospect1?.status === 'essai_reserve' && prospect1?.email === visiteur(1)
    && prospect1?.plan_id === trial.data?.id && prospect1?.schedule_id === cFutur,
    JSON.stringify({ rpc: r1.data ?? r1.error, ligne1, prospect1 }));

  const vue3 = await slots(anon, box);
  assert('la place est réellement décomptée dans le calendrier public',
    trouve(vue3.data, cFutur)?.seats_left === 2,
    `seats_left=${trouve(vue3.data, cFutur)?.seats_left}`);

  const doublon = await reserveEssai(cFutur, visiteur(1));
  const { count: nbDoublon } = await db.from('box_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('box_id', box).eq('email', visiteur(1)).eq('schedule_id', cFutur);
  assert('doublon (même e-mail, même créneau) : refusé, et aucune 2e ligne',
    doublon.data?.ok === false && doublon.data?.reason === 'deja_reserve' && nbDoublon === 1,
    JSON.stringify({ rpc: doublon.data ?? doublon.error, lignes: nbDoublon }));

  const second = await reserveEssai(cFutur2, visiteur(1));
  assert('le même e-mail sur un autre créneau : accepté (2e essai)',
    second.data?.ok === true,
    JSON.stringify(second.data ?? second.error));

  const troisieme = await reserveEssai(cFutur3, visiteur(1));
  assert('le 3e essai du même e-mail : plafond nommé',
    troisieme.data?.ok === false && troisieme.data?.reason === 'plafond_box_atteint',
    JSON.stringify(troisieme.data ?? troisieme.error));

  const plein = await reserveEssai(cPlein, visiteur(2));
  const { data: attente } = await db.from('class_reservations')
    .select('id, status').eq('schedule_id', cPlein).eq('status', 'waiting');
  assert('créneau complet : refusé, et aucune ligne « waiting » créée',
    plein.data?.ok === false && plein.data?.reason === 'creneau_complet'
    && (attente ?? []).length === 0,
    JSON.stringify({ rpc: plein.data ?? plein.error, waiting: attente }));

  const passe = await reserveEssai(cPasse, visiteur(3));
  assert('créneau passé : refus nommé',
    passe.data?.ok === false && passe.data?.reason === 'creneau_passe',
    JSON.stringify(passe.data ?? passe.error));

  const horsOffre = await reserve(anon, {
    p_box_id: boxVoisine, p_schedule_id: cFutur,
    p_first_name: 'Zoé', p_last_name: null, p_email: visiteur(4), p_phone: null,
  });
  assert('box sans offre Essai : refus nommé',
    horsOffre.data?.ok === false && horsOffre.data?.reason === 'offre_essai_absente',
    JSON.stringify(horsOffre.data ?? horsOffre.error));

  // ── 21..23 : le NULL n'est jamais libre ───────────────────────────────────
  console.log('\n— Le NULL n\'est jamais libre');

  const nuLibre = await db.from('class_reservations').insert({
    schedule_id: cFutur2, box_id: box, member_id: null, status: 'confirmed',
  }).select('id').maybeSingle();
  assert('une réservation sans membre et sans essai est refusée',
    refus(nuLibre.error, 'class_reservations_essai_ou_membre'),
    nuLibre.error?.message ?? 'acceptée : le NULL est redevenu libre');

  const essaiAvecMembre = await db.from('class_reservations').insert({
    schedule_id: cFutur2, box_id: box, member_id: adherent,
    is_trial: true, prospect_id: r1.data?.prospect_id, status: 'confirmed',
  }).select('id').maybeSingle();
  assert('un essai rattaché à un membre est refusé (le triplet est cohérent ou rien)',
    refus(essaiAvecMembre.error, 'class_reservations_essai_ou_membre'),
    essaiAvecMembre.error?.message ?? 'accepté');

  const resaAdherent = await db.from('class_reservations').insert({
    schedule_id: cFutur3, box_id: box, member_id: adherent, status: 'confirmed',
  }).select('id, status').maybeSingle();
  assert('CONTRÔLE POSITIF : la réservation d\'un adhérent passe toujours',
    !resaAdherent.error && resaAdherent.data?.status === 'confirmed',
    resaAdherent.error?.message ?? JSON.stringify(resaAdherent.data));

  // ── 24..27 : les coordonnées ne fuient pas ────────────────────────────────
  console.log('\n— Les coordonnées ne fuient pas');

  const resaVueParAdherent = await sAdherent.client.from('class_reservations')
    .select('id, is_trial').eq('schedule_id', cFutur).eq('is_trial', true);
  assert('l\'adhérent lambda voit bien la RÉSERVATION d\'essai (toute la box la lit)',
    (resaVueParAdherent.data ?? []).length === 1,
    JSON.stringify(resaVueParAdherent.data ?? resaVueParAdherent.error));

  const prospectsVusParAdherent = await sAdherent.client.from('box_prospects')
    .select('id, email').eq('box_id', box);
  assert('…et ne lit AUCUNE ligne de box_prospects',
    (prospectsVusParAdherent.data ?? []).length === 0,
    JSON.stringify(prospectsVusParAdherent.data ?? prospectsVusParAdherent.error));

  const prospectsAnon = await anon.from('box_prospects').select('id, email').eq('box_id', box);
  assert('anon non plus, et le refus vient du grant (message nommé)',
    refus(prospectsAnon.error, 'permission denied for (table|view)')
    && (prospectsAnon.data ?? []).length === 0,
    prospectsAnon.error?.message ?? `${(prospectsAnon.data ?? []).length} ligne(s) lues sans session`);

  const prospectsOwner = await sOwner.client.from('box_prospects').select('id, email').eq('box_id', box);
  const prospectsVoisin = await sVoisin.client.from('box_prospects').select('id, email').eq('box_id', box);
  assert('le gérant lit ses prospects ; la box voisine n\'en lit aucun',
    (prospectsOwner.data ?? []).length === 2 && (prospectsVoisin.data ?? []).length === 0,
    JSON.stringify({ gerant: prospectsOwner.data ?? prospectsOwner.error, voisin: prospectsVoisin.data ?? prospectsVoisin.error }));

  // ── 28..30 : venu / pas venu depuis le pointage ───────────────────────────
  console.log('\n— « venu / pas venu » viennent du pointage');

  const statutProspect = async id => {
    const { data } = await db.from('box_prospects').select('status').eq('id', id).maybeSingle();
    return data?.status;
  };

  await db.from('class_reservations').update({ attended: true }).eq('id', ligne1?.id);
  assert('pointé présent : le prospect passe à « venu »',
    (await statutProspect(r1.data.prospect_id)) === 'venu',
    await statutProspect(r1.data.prospect_id));

  await db.from('class_reservations').update({ attended: false }).eq('id', ligne1?.id);
  assert('pointage corrigé en absent : le prospect passe à « pas_venu »',
    (await statutProspect(r1.data.prospect_id)) === 'pas_venu',
    await statutProspect(r1.data.prospect_id));

  await db.from('box_prospects').update({ status: 'converti' }).eq('id', r1.data.prospect_id);
  await db.from('class_reservations').update({ attended: true }).eq('id', ligne1?.id);
  assert('un prospect « converti » ne redescend pas sur un pointage',
    (await statutProspect(r1.data.prospect_id)) === 'converti',
    await statutProspect(r1.data.prospect_id));

  // ── 31..32 : quota et crédits ne s'appliquent pas à un essai ──────────────
  console.log('\n— Quota et crédits ne s\'appliquent pas à un essai');

  const { data: formule, error: eFormule } = await db.from('membership_plans').insert({
    box_id: box, name: `zz 1 séance ${stamp}`, plan_type: 'subscription',
    price_cents: 4900, max_sessions_per_week: 1, is_active: true,
  }).select('id').single();
  if (eFormule) throw new Error(`décor formule : ${eFormule.message}`);
  onCleanup(() => db.from('membership_plans').delete().eq('id', formule.id));

  const q1 = await reserveEssai(cQuota, visiteur(5));
  const q2 = await reserveEssai(cQuota2, visiteur(5));
  assert('deux essais la même semaine dans une box à 1 séance/semaine : les deux passent',
    q1.data?.ok === true && q2.data?.ok === true,
    JSON.stringify({ q1: q1.data ?? q1.error, q2: q2.data ?? q2.error }));

  const { data: lignesEssai } = await db.from('class_reservations')
    .select('id, credit_id').in('prospect_id', [q1.data?.prospect_id, q2.data?.prospect_id]);
  assert('aucun crédit d\'adhérent consommé par un essai',
    (lignesEssai ?? []).length === 2 && (lignesEssai ?? []).every(l => l.credit_id === null),
    JSON.stringify(lignesEssai));

  // ── 33 : le funnel legacy ne casse pas ────────────────────────────────────
  console.log('\n— Le funnel legacy ne casse pas');

  await db.from('class_reservations').update({ attended: true })
    .eq('prospect_id', q1.data?.prospect_id);
  const detect = await db.rpc('detect_trial_followups');
  const { count: suivis } = await db.from('session_followups')
    .select('id', { count: 'exact', head: true }).eq('box_id', box);
  assert('detect_trial_followups() traverse l\'essai pointé présent et ne crée aucun suivi',
    !detect.error && suivis === 0,
    detect.error?.message ?? `${suivis} suivi(s) créés pour un prospect sans compte`);

  console.log(`\n${passed} vert(s), ${failed} rouge(s) — ${passed + failed}/${attendu} assertion(s) exécutée(s)\n`);
}

main()
  .then(() => runCleanup())
  .then(() => process.exit(failed === 0 ? 0 : 1))
  .catch(async (e) => {
    console.error('\n💥', e.message);
    await runCleanup();
    process.exit(1);
  });
