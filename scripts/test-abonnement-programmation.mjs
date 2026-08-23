/**
 * test-abonnement-programmation.mjs — Lot 5-F : une offre de programmation
 * payante ne s'obtient plus sans payer, et fixer un prix reste une décision
 * d'argent.
 *
 * Ce que la suite mesure, cas par cas :
 *
 *   La porte payante est fermée au client
 *     1. baseline : le staff de la box cible ne lit PAS le contenu payant ;
 *     2. le coach ne pose pas lui-même un abonnement `active` sur une offre
 *        payante — refus NOMMÉ (avant ce lot : accordé) ;
 *     3. le gérant non plus (le défaut n'était pas propre au coach) ;
 *     4. la RPC du gratuit refuse une offre payante — elle lit le prix dans
 *        l'offre, elle ne le reçoit pas du client ;
 *     5. INVARIANT : après ces trois refus, aucune ligne d'abonnement, et le
 *        contenu payant reste illisible (un refus qui laisse la porte ouverte
 *        n'est pas un refus) ;
 *     6. un client ne pose pas les références Stripe (il se déclarerait payé).
 *
 *   La porte du gratuit, vérifiée par le serveur
 *     7. le coach abonne sa box à une offre gratuite par la RPC : accordé ;
 *     8. CONTRÔLE POSITIF de bout en bout : le contenu gratuit devient lisible ;
 *     9. rappel de la RPC : toujours un seul abonnement (idempotence) ;
 *    10. offre non publiée : refusée ;
 *    11. une box ne s'abonne pas à sa propre offre ;
 *    12. le coach d'une AUTRE box n'abonne pas la box cible.
 *
 *   Le chemin légitime du paiement reste ouvert
 *    13. le backend signé pose l'abonnement `active` sur l'offre payante ;
 *    14. et le contenu payant devient lisible pour le staff de la box abonnée ;
 *    15. la bascule `auto_apply_weekly` du staff reste possible (la garde ne
 *        se déclenche que sur le PASSAGE à `active`) ;
 *    16. la résiliation par le staff reste possible, et le contenu redevient
 *        illisible.
 *
 *   Publier et fixer un prix : gérant ou co-gérant
 *    17. le coach ne publie pas une offre au nom de la box ;
 *    18. le coach ne change pas le prix d'une offre existante ;
 *    19. le gérant publie et fixe le prix : accordé ;
 *    20. le co-gérant aussi ;
 *    21. le coach d'une AUTRE box ne crée rien au nom de la box cible ;
 *    22. CONTRÔLE POSITIF : le coach LIT toujours le catalogue publié —
 *        consulter n'est pas vendre.
 *
 *   La clé anonyme
 *    23. `anon` ne lit pas le catalogue ;
 *    24. `anon` n'appelle pas la RPC d'abonnement.
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-abonnement-programmation.mjs
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
const PASSWORD = 'TestProgSub1234!';

const PLAN = [6, 6, 4, 6, 2];

let passed = 0;
let failed = 0;
let attendu = null;

process.on('exit', () => {
  if (attendu !== null) {
    console.log(`ABONNEMENT_PROGRAMMATION_ASSERTIONS=${passed + failed}/${attendu}`);
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

/**
 * Un refus se constate par son message : un appel qui échoue parce que la
 * signature est fausse serait vert sans jamais atteindre la garde.
 */
function refus(error, motif) {
  return !!error && new RegExp(motif, 'i').test(error.message ?? '');
}
const motifDe = e => (e ? (e.message ?? String(e)) : 'aucune erreur — accordé');

async function lignesAbonnement(programmingId, boxId) {
  const { data } = await db.from('box_programming_subscriptions')
    .select('id, status, stripe_subscription_id, auto_apply_weekly')
    .eq('programming_id', programmingId).eq('subscriber_box_id', boxId);
  return data ?? [];
}

/** Ce que le staff de la box cible lit du contenu de l'offre. */
async function contenuLisible(client, programmingId) {
  const { data, error } = await client.from('box_programming_wods')
    .select('id, title').eq('programming_id', programmingId);
  return { lignes: (data ?? []).length, error };
}

async function offre(db_, { publisherBoxId, titre, priceCents, billing, published = true }) {
  const { data, error } = await db_.from('box_programming').insert({
    publisher_box_id: publisherBoxId,
    title: titre,
    is_published: published,
    price_cents: priceCents,
    billing,
    weeks_count: 4,
  }).select('id').single();
  if (error) throw new Error(`offre ${titre} : ${error.message}`);
  return data.id;
}

async function contenu(programmingId, titre) {
  const { error } = await db.from('box_programming_wods').insert({
    programming_id: programmingId,
    week_number: 1,
    day_of_week: 1,
    title: titre,
    description: '10 burpees',
    wod_type: 'For Time',
  });
  if (error) throw new Error(`contenu ${titre} : ${error.message}`);
}

async function main() {
  const mk = s => `zz_pf_${s}_${stamp}@test.athlex.local`;

  const owner = await createUser(db, { email: mk('ow'), password: PASSWORD, username: `zz_pf_ow_${stamp}`, role: 'box_owner' });
  const coOwner = await createUser(db, { email: mk('co'), password: PASSWORD, username: `zz_pf_co_${stamp}` });
  const coach = await createUser(db, { email: mk('ch'), password: PASSWORD, username: `zz_pf_ch_${stamp}` });
  const pubOwner = await createUser(db, { email: mk('pu'), password: PASSWORD, username: `zz_pf_pu_${stamp}`, role: 'box_owner' });
  const otherOwner = await createUser(db, { email: mk('oo'), password: PASSWORD, username: `zz_pf_oo_${stamp}`, role: 'box_owner' });
  const otherCoach = await createUser(db, { email: mk('oc'), password: PASSWORD, username: `zz_pf_oc_${stamp}` });

  const box = await createOwnedBox(db, { tag: `pf${stamp}`, ownerId: owner, name: `zz_pf_box_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, box, owner));
  const pubBox = await createOwnedBox(db, { tag: `pfp${stamp}`, ownerId: pubOwner, name: `zz_pf_pub_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, pubBox, pubOwner));
  const otherBox = await createOwnedBox(db, { tag: `pfo${stamp}`, ownerId: otherOwner, name: `zz_pf_other_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, otherBox, otherOwner));

  const membres = [
    { box_id: box, member_id: coOwner, role: 'owner', status: 'active' },
    { box_id: box, member_id: coach, role: 'coach', status: 'active' },
    { box_id: otherBox, member_id: otherCoach, role: 'coach', status: 'active' },
  ];
  const { error: mErr } = await db.from('box_members').insert(membres);
  if (mErr) throw new Error(`box_members : ${mErr.message}`);

  const progPaid = await offre(db, { publisherBoxId: pubBox, titre: `zz_pf_payante_${stamp}`, priceCents: 9900, billing: 'monthly' });
  // Deuxième offre payante : le refus du gérant doit être mesuré sur une offre
  // VIERGE, sinon l'état saboté ferait échouer son insert sur la clé unique —
  // un rouge pour la mauvaise raison serait un vert pour la mauvaise raison
  // dans l'état sécurisé.
  const progPaid2 = await offre(db, { publisherBoxId: pubBox, titre: `zz_pf_payante2_${stamp}`, priceCents: 19900, billing: 'one_time' });
  const progFree = await offre(db, { publisherBoxId: pubBox, titre: `zz_pf_gratuite_${stamp}`, priceCents: 0, billing: 'free' });
  const progBrouillon = await offre(db, { publisherBoxId: pubBox, titre: `zz_pf_brouillon_${stamp}`, priceCents: 0, billing: 'free', published: false });
  await contenu(progPaid, `zz_pf_wod_payant_${stamp}`);
  await contenu(progFree, `zz_pf_wod_gratuit_${stamp}`);

  const g = await signInAs(mk('ow'), PASSWORD);         // gérant de la box cible
  const cg = await signInAs(mk('co'), PASSWORD);        // co-gérant
  const c = await signInAs(mk('ch'), PASSWORD);         // coach de la box cible
  const oc = await signInAs(mk('oc'), PASSWORD);        // coach d'une AUTRE box
  const anon = anonClient();

  attendu = PLAN.reduce((a, b) => a + b, 0);

  // ── 1. La porte payante est fermée au client ────────────────────────────────
  console.log('\nLa porte payante est fermée au client');

  const avant = await contenuLisible(c.client, progPaid);
  assert('baseline : le staff ne lit pas le contenu payant', avant.lignes === 0,
    `${avant.lignes} ligne(s) lisible(s) — le décor n'est pas neutre`);

  const insCoach = await c.client.from('box_programming_subscriptions').insert({
    programming_id: progPaid, subscriber_box_id: box, status: 'active', created_by: c.userId,
  });
  assert('le coach ne pose pas un abonnement actif sur une offre payante',
    refus(insCoach.error, 'PAID_PROGRAMMING'), motifDe(insCoach.error));

  const insOwner = await g.client.from('box_programming_subscriptions').insert({
    programming_id: progPaid2, subscriber_box_id: box, status: 'active', created_by: g.userId,
  });
  assert('le gérant non plus (le défaut n\'était pas propre au coach)',
    refus(insOwner.error, 'PAID_PROGRAMMING'), motifDe(insOwner.error));

  const rpcPaid = await g.client.rpc('subscribe_free_programming', {
    p_programming_id: progPaid, p_subscriber_box_id: box,
  });
  assert('la RPC du gratuit refuse une offre payante (elle lit le prix dans l\'offre)',
    refus(rpcPaid.error, 'PAID_PROGRAMMING'), motifDe(rpcPaid.error));

  const apres = await contenuLisible(c.client, progPaid);
  const lignesPaid = await lignesAbonnement(progPaid, box);
  assert('INVARIANT : aucun abonnement posé, contenu payant toujours illisible',
    lignesPaid.length === 0 && apres.lignes === 0,
    `${lignesPaid.length} abonnement(s), ${apres.lignes} ligne(s) de contenu`);

  const insStripe = await g.client.from('box_programming_subscriptions').insert({
    programming_id: progFree, subscriber_box_id: box, status: 'canceled',
    stripe_subscription_id: `sub_faux_${stamp}`,
  });
  assert('le client ne pose pas les références de paiement',
    refus(insStripe.error, 'références de paiement'), motifDe(insStripe.error));

  // ── 2. La porte du gratuit, vérifiée par le serveur ─────────────────────────
  console.log('\nLa porte du gratuit, vérifiée par le serveur');

  const rpcFree = await c.client.rpc('subscribe_free_programming', {
    p_programming_id: progFree, p_subscriber_box_id: box,
  });
  assert('le coach abonne sa box à une offre gratuite par la RPC',
    !rpcFree.error && rpcFree.data?.status === 'active', motifDe(rpcFree.error));

  const libre = await contenuLisible(c.client, progFree);
  assert('CONTRÔLE POSITIF : le contenu gratuit devient lisible', libre.lignes === 1,
    `${libre.lignes} ligne(s) — attendu 1`);

  const rpcFree2 = await c.client.rpc('subscribe_free_programming', {
    p_programming_id: progFree, p_subscriber_box_id: box,
  });
  const lignesFree = await lignesAbonnement(progFree, box);
  assert('rappel de la RPC : toujours un seul abonnement',
    !rpcFree2.error && lignesFree.length === 1,
    `${motifDe(rpcFree2.error)} · ${lignesFree.length} ligne(s)`);

  const rpcBrouillon = await g.client.rpc('subscribe_free_programming', {
    p_programming_id: progBrouillon, p_subscriber_box_id: box,
  });
  assert('une offre non publiée ne s\'abonne pas',
    refus(rpcBrouillon.error, "n'est pas publiée"), motifDe(rpcBrouillon.error));

  const pu = await signInAs(mk('pu'), PASSWORD);
  const rpcSelf = await pu.client.rpc('subscribe_free_programming', {
    p_programming_id: progFree, p_subscriber_box_id: pubBox,
  });
  assert('une box ne s\'abonne pas à sa propre offre',
    refus(rpcSelf.error, 'propre offre'), motifDe(rpcSelf.error));

  const rpcEtranger = await oc.client.rpc('subscribe_free_programming', {
    p_programming_id: progFree, p_subscriber_box_id: box,
  });
  assert('le coach d\'une AUTRE box n\'abonne pas la box cible',
    refus(rpcEtranger.error, 'Accès refusé'), motifDe(rpcEtranger.error));

  // ── 3. Le chemin légitime du paiement reste ouvert ──────────────────────────
  console.log('\nLe chemin légitime du paiement reste ouvert');

  const backend = await db.from('box_programming_subscriptions').upsert({
    programming_id: progPaid, subscriber_box_id: box, status: 'active',
    created_by: g.userId, stripe_subscription_id: `sub_stripe_${stamp}`,
  }, { onConflict: 'programming_id,subscriber_box_id' }).select('id').single();
  assert('le backend signé pose l\'abonnement payant (chemin du webhook)',
    !backend.error && !!backend.data?.id, motifDe(backend.error));
  const abonnementPayant = backend.data?.id ?? (await lignesAbonnement(progPaid, box))[0]?.id ?? null;

  const payantLisible = await contenuLisible(c.client, progPaid);
  assert('et le contenu payant devient lisible pour le staff abonné',
    payantLisible.lignes === 1, `${payantLisible.lignes} ligne(s) — attendu 1`);

  const bascule = await g.client.from('box_programming_subscriptions')
    .update({ auto_apply_weekly: true }).eq('id', abonnementPayant).select('id');
  assert('la bascule d\'application auto reste possible au staff',
    !bascule.error && (bascule.data ?? []).length === 1, motifDe(bascule.error));

  const resil = await g.client.from('box_programming_subscriptions')
    .update({ status: 'canceled' }).eq('id', abonnementPayant).select('id');
  const apresResil = await contenuLisible(c.client, progPaid);
  assert('la résiliation par le staff reste possible, et le contenu se referme',
    !resil.error && (resil.data ?? []).length === 1 && apresResil.lignes === 0,
    `${motifDe(resil.error)} · ${apresResil.lignes} ligne(s) après résiliation`);

  // ── 4. Publier et fixer un prix : gérant ou co-gérant ───────────────────────
  console.log('\nPublier et fixer un prix : gérant ou co-gérant');

  const pubCoach = await c.client.from('box_programming').insert({
    publisher_box_id: box, title: `zz_pf_coach_${stamp}`,
    is_published: true, price_cents: 4900, billing: 'monthly', weeks_count: 4,
  }).select('id');
  assert('le coach ne publie pas une offre au nom de la box',
    refus(pubCoach.error, 'row-level security|permission denied|violates'), motifDe(pubCoach.error));

  const offreBox = await offre(db, { publisherBoxId: box, titre: `zz_pf_offre_box_${stamp}`, priceCents: 0, billing: 'free', published: false });
  const prixCoach = await c.client.from('box_programming')
    .update({ price_cents: 100, billing: 'monthly' }).eq('id', offreBox).select('id');
  const { data: apresPrix } = await db.from('box_programming')
    .select('price_cents, billing').eq('id', offreBox).single();
  assert('le coach ne change pas le prix d\'une offre existante',
    (prixCoach.data ?? []).length === 0 && apresPrix.price_cents === 0 && apresPrix.billing === 'free',
    `${(prixCoach.data ?? []).length} ligne(s) modifiée(s) · prix ${apresPrix.price_cents} / ${apresPrix.billing}`);

  const prixOwner = await g.client.from('box_programming')
    .update({ price_cents: 2900, billing: 'monthly', is_published: true }).eq('id', offreBox).select('id');
  assert('le gérant publie et fixe le prix', !prixOwner.error && (prixOwner.data ?? []).length === 1,
    motifDe(prixOwner.error));

  const prixCoGerant = await cg.client.from('box_programming')
    .update({ price_cents: 3900 }).eq('id', offreBox).select('id');
  assert('le co-gérant aussi', !prixCoGerant.error && (prixCoGerant.data ?? []).length === 1,
    motifDe(prixCoGerant.error));

  const offreEtranger = await oc.client.from('box_programming').insert({
    publisher_box_id: box, title: `zz_pf_etr_${stamp}`, price_cents: 0, billing: 'free', weeks_count: 1,
  }).select('id');
  assert('le coach d\'une AUTRE box ne crée rien au nom de la box cible',
    refus(offreEtranger.error, 'row-level security|permission denied|violates'), motifDe(offreEtranger.error));

  const catalogue = await c.client.from('box_programming')
    .select('id, title, price_cents').eq('id', progPaid);
  assert('CONTRÔLE POSITIF : le coach LIT toujours le catalogue publié',
    !catalogue.error && (catalogue.data ?? []).length === 1, motifDe(catalogue.error));

  // ── 5. La clé anonyme ──────────────────────────────────────────────────────
  console.log('\nLa clé anonyme');

  const anonCat = await anon.from('box_programming').select('id').eq('id', progPaid);
  assert('anon ne lit pas le catalogue',
    (anonCat.data ?? []).length === 0, `${(anonCat.data ?? []).length} ligne(s)`);

  const anonRpc = await anon.rpc('subscribe_free_programming', {
    p_programming_id: progFree, p_subscriber_box_id: box,
  });
  assert('anon n\'appelle pas la RPC d\'abonnement',
    refus(anonRpc.error, 'permission denied|Accès refusé'), motifDe(anonRpc.error));

  await db.from('box_programming').delete().in('id', [progPaid, progPaid2, progFree, progBrouillon, offreBox]);
}

main()
  .catch((e) => { console.error('\n💥', e.message); failed++; })
  .finally(async () => {
    await runCleanup();
    console.log(`\n${passed} ✅ · ${failed} ❌`);
    process.exit(failed > 0 ? 1 : 0);
  });
