/**
 * test-comptoir-programmes.mjs — Lot 5-D : « Payé au comptoir » pour les
 * programmes, et le retrait d'un accès payé ne dépend plus du client.
 *
 * Ce que la suite mesure, cas par cas :
 *
 *   Le geste, et qui le tient
 *     1. le coach n'encaisse pas (encaisser est une décision d'argent) ;
 *     2. le gérant encaisse : l'accès existe, provenance 'cash' ;
 *     3. le montant N'EST PAS sur la ligne d'accès (il vit dans le journal) ;
 *     4. le journal porte une ligne `source='program'`, au montant demandé,
 *        rattachée au programme et signée par l'encaisseur ;
 *     5. le co-gérant encaisse aussi ;
 *     6. un non-membre de la box n'est pas encaissable.
 *
 *   La borne du montant (le journal est en ajout seul : un chiffre faux y est
 *   définitif, donc la borne est la seule protection)
 *     7. montant au-dessus du prix : refusé ;
 *     8. montant nul : refusé ;
 *     9. remise (montant < prix) : acceptée, et c'est CE montant qui compte ;
 *    10. programme sans prix : refusé (rien à quoi borner la remise).
 *
 *   La porte unique
 *    11. `join_program('cash')` appelé directement est refusé — sinon on
 *        obtiendrait un accès « payé » sans trace comptable.
 *
 *   L'échelle de provenance : stripe > cash > staff
 *    12. une assignation du staff ne dégrade PAS un accès comptoir ;
 *    13. un paiement Stripe requalifie un accès comptoir ;
 *    14. un encaissement comptoir ne dégrade PAS un accès Stripe.
 *
 *   Les deux surfaces d'argent, dans les deux sens
 *    15. une ligne comptoir fait monter « Programmes » du montant exact ;
 *    16. et ne fait PAS monter « Encaissé au comptoir » (le même euro compté
 *        deux fois est le bug du lot 0-bis, dans une autre robe) ;
 *    17. une ligne staff ne fait monter NI l'un NI l'autre ;
 *    18. CONTRÔLE POSITIF : un achat Stripe reste compté ;
 *    19. un encaissement d'ABONNEMENT entre bien, lui, dans « comptoir » ;
 *    20. la box voisine ne voit rien de ces montants ;
 *    21. le coach ne lit pas la synthèse d'argent.
 *
 *   Le retrait
 *    22. le gérant retire un accès comptoir (bouton présent, geste possible) ;
 *    23. le gérant NE PEUT PAS retirer un accès Stripe — refus du SERVEUR, pas
 *        du client : jusqu'à ce lot, un client modifié y parvenait ;
 *    24. le backend signé, lui, pose bien `refunded` (chemin du remboursement).
 *
 *   Le journal reste un grand livre
 *    25. UPDATE d'une ligne du journal : refusé ;
 *    26. DELETE : refusé ;
 *    27. le coach ne lit pas le journal ;
 *    28. `anon` ne lit pas le journal.
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-comptoir-programmes.mjs
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
const PASSWORD = 'TestComptoir1234!';
const TODAY = new Date().toISOString().slice(0, 10);

const PRIX = 6000;       // prix du programme, en centimes
const REMISE = 4500;     // encaissé au comptoir : une remise descend
const PRIX_ABO = 3900;   // formule d'abonnement, pour l'encaissement voisin

// Le total attendu est dérivé du plan, pas écrit à la main : une section
// allongée sans mise à jour du compteur rendrait un « n/n » faux.
const PLAN = [
  6,  // le geste et qui le tient
  4,  // la borne du montant
  1,  // la porte unique
  3,  // l'échelle de provenance
  7,  // les deux surfaces d'argent
  3,  // le retrait
  4,  // le journal reste un grand livre
];

let passed = 0;
let failed = 0;
let attendu = null;

process.on('exit', () => {
  if (attendu !== null) {
    console.log(`COMPTOIR_PROGRAMMES_ASSERTIONS=${passed + failed}/${attendu}`);
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

/** Un refus se constate par son message, pas par une absence de ligne. */
function refus(error, motif) {
  return !!error && new RegExp(motif, 'i').test(error.message ?? '');
}

async function provenanceDe(programId, userId) {
  const { data } = await db.from('program_members')
    .select('id, provenance, status, amount_cents')
    .eq('program_id', programId).eq('user_id', userId).maybeSingle();
  return data;
}

async function synthese(client, boxId, from, to) {
  const { data, error } = await client.rpc('get_box_money_summary', {
    p_box_id: boxId, p_from: from, p_to: to,
  });
  const row = Array.isArray(data) ? data[0] : data;
  return { row, error };
}

async function main() {
  const mk = suffix => `zz_cp_${suffix}_${stamp}@test.athlex.local`;

  const owner = await createUser(db, { email: mk('ow'), password: PASSWORD, username: `zz_cp_ow_${stamp}`, role: 'box_owner' });
  const coOwner = await createUser(db, { email: mk('co'), password: PASSWORD, username: `zz_cp_co_${stamp}` });
  const coach = await createUser(db, { email: mk('ch'), password: PASSWORD, username: `zz_cp_ch_${stamp}` });
  const m1 = await createUser(db, { email: mk('m1'), password: PASSWORD, username: `zz_cp_m1_${stamp}` });
  const m2 = await createUser(db, { email: mk('m2'), password: PASSWORD, username: `zz_cp_m2_${stamp}` });
  const m3 = await createUser(db, { email: mk('m3'), password: PASSWORD, username: `zz_cp_m3_${stamp}` });
  const m4 = await createUser(db, { email: mk('m4'), password: PASSWORD, username: `zz_cp_m4_${stamp}` });
  const dehors = await createUser(db, { email: mk('out'), password: PASSWORD, username: `zz_cp_out_${stamp}` });

  const box = await createOwnedBox(db, { tag: `cp${stamp}`, ownerId: owner, name: `zz_cp_box_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, box, owner));

  // Une box voisine : l'isolation se mesure, elle ne se suppose pas.
  const voisinOwner = await createUser(db, { email: mk('vo'), password: PASSWORD, username: `zz_cp_vo_${stamp}`, role: 'box_owner' });
  const boxVoisine = await createOwnedBox(db, { tag: `cpv${stamp}`, ownerId: voisinOwner, name: `zz_cp_boxv_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, boxVoisine, voisinOwner));

  for (const id of [coOwner, coach, m1, m2, m3, m4, dehors]) {
    onCleanup(() => db.auth.admin.deleteUser(id));
  }

  for (const [id, role] of [[coOwner, 'owner'], [coach, 'coach'], [m1, 'member'], [m2, 'member'], [m3, 'member'], [m4, 'member']]) {
    const { error } = await db.from('box_members').upsert(
      { box_id: box, member_id: id, role, status: 'active' },
      { onConflict: 'box_id,member_id' },
    );
    if (error) throw new Error(`décor box_members ${role} : ${error.message}`);
  }

  const mkProgram = async (titre, prix) => {
    const { data, error } = await db.from('programs').insert({
      box_id: box, owner_id: owner, title: titre, price_cents: prix,
      type: 'ongoing', invite_code: `${titre}`.slice(-12), is_active: true,
      duration_weeks: 4, days_per_week: 3,
    }).select('id').single();
    if (error) throw new Error(`décor programme ${titre} : ${error.message}`);
    onCleanup(() => db.from('programs').delete().eq('id', data.id));
    return data.id;
  };

  const prog = await mkProgram(`zzcp${stamp}a`, PRIX);
  const progGratuit = await mkProgram(`zzcp${stamp}b`, 0);
  const progEchelle = await mkProgram(`zzcp${stamp}c`, PRIX);

  const sOwner = await signInAs(mk('ow'), PASSWORD);
  const sCo = await signInAs(mk('co'), PASSWORD);
  const sCoach = await signInAs(mk('ch'), PASSWORD);
  const anon = anonClient();

  const encaisse = (client, programId, userId, cents) => client.rpc('assign_program_cash', {
    p_program_id: programId, p_user_id: userId, p_amount_cents: cents,
  });

  console.log('\n=== Lot 5-D — Payé au comptoir (programmes) ===\n');

  // ── 1..6 : le geste, et qui le tient ──────────────────────────────────────
  console.log('— Le geste, et qui le tient');

  const rCoach = await encaisse(sCoach.client, prog, m1, REMISE);
  assert('le coach n\'encaisse pas un programme',
    refus(rCoach.error, 'gérant ou co-gérant'),
    rCoach.error?.message ?? 'aucune erreur : le coach a encaissé');

  const rOwner = await encaisse(sOwner.client, prog, m1, REMISE);
  const ligne1 = await provenanceDe(prog, m1);
  assert('le gérant encaisse : accès actif, provenance « cash »',
    !rOwner.error && ligne1?.provenance === 'cash' && ligne1?.status === 'active',
    rOwner.error?.message ?? `provenance=${ligne1?.provenance} status=${ligne1?.status}`);

  assert('le montant n\'est pas sur la ligne d\'accès (il vit dans le journal)',
    ligne1?.amount_cents === null,
    `amount_cents=${ligne1?.amount_cents}`);

  const { data: journal1 } = await db.from('box_cash_payments')
    .select('id, source, program_id, plan_id, amount_cents, collected_by, member_id')
    .eq('box_id', box).eq('program_id', prog);
  const j1 = (journal1 ?? [])[0];
  assert('le journal porte l\'encaissement : source « program », montant demandé, signé',
    (journal1 ?? []).length === 1 && j1?.source === 'program'
      && j1?.amount_cents === REMISE && j1?.plan_id === null
      && j1?.collected_by === owner && j1?.member_id === m1,
    JSON.stringify(j1 ?? null));

  const rCo = await encaisse(sCo.client, prog, m2, PRIX);
  const ligne2 = await provenanceDe(prog, m2);
  assert('le co-gérant encaisse aussi',
    !rCo.error && ligne2?.provenance === 'cash',
    rCo.error?.message ?? `provenance=${ligne2?.provenance}`);

  const rDehors = await encaisse(sOwner.client, prog, dehors, PRIX);
  assert('un non-membre de la box n\'est pas encaissable',
    refus(rDehors.error, 'membre actif'),
    rDehors.error?.message ?? 'aucune erreur : un non-membre a reçu un accès');

  // ── 7..10 : la borne du montant ───────────────────────────────────────────
  console.log('\n— La borne du montant (le journal est en ajout seul)');

  const rTrop = await encaisse(sOwner.client, prog, m3, PRIX + 1);
  assert('un montant au-dessus du prix est refusé',
    refus(rTrop.error, 'AMOUNT_ABOVE_PRICE'),
    rTrop.error?.message ?? 'aucune erreur : un CA arbitraire est entrable');

  const rZero = await encaisse(sOwner.client, prog, m3, 0);
  assert('un montant nul est refusé',
    refus(rZero.error, 'AMOUNT_INVALID'),
    rZero.error?.message ?? 'aucune erreur : un encaissement à zéro est journalisable');

  const rRemise = await encaisse(sOwner.client, prog, m3, 1);
  const { data: jRemise } = await db.from('box_cash_payments')
    .select('amount_cents').eq('box_id', box).eq('program_id', prog).eq('member_id', m3);
  assert('une remise passe, et c\'est le montant remisé qui est journalisé',
    !rRemise.error && (jRemise ?? [])[0]?.amount_cents === 1,
    rRemise.error?.message ?? JSON.stringify(jRemise));

  const rGratuit = await encaisse(sOwner.client, progGratuit, m4, 1000);
  assert('un programme sans prix ne s\'encaisse pas (rien à quoi borner)',
    refus(rGratuit.error, 'NO_PRICE'),
    rGratuit.error?.message ?? 'aucune erreur : un prix a été inventé');

  // ── 11 : la porte unique ──────────────────────────────────────────────────
  console.log('\n— La porte unique');

  const rJoinCash = await sOwner.client.rpc('join_program', {
    p_program_id: progEchelle, p_source: 'cash', p_user_id: m4,
  });
  assert('join_program(\'cash\') direct est refusé (sinon accès payé sans trace)',
    refus(rJoinCash.error, 'assign_program_cash'),
    rJoinCash.error?.message ?? 'aucune erreur : un accès « payé » sans journal est créable');

  // ── 12..14 : l'échelle de provenance ──────────────────────────────────────
  console.log('\n— L\'échelle de provenance : stripe > cash > staff');

  await encaisse(sOwner.client, progEchelle, m1, PRIX);
  const rStaffApres = await sOwner.client.rpc('join_program', {
    p_program_id: progEchelle, p_source: 'staff', p_user_id: m1,
  });
  const apresStaff = await provenanceDe(progEchelle, m1);
  assert('une assignation du staff ne dégrade pas un accès comptoir',
    !rStaffApres.error && apresStaff?.provenance === 'cash',
    rStaffApres.error?.message ?? `provenance=${apresStaff?.provenance}`);

  // Le paiement Stripe emprunte la porte du backend signé : c'est le webhook.
  const rStripeApres = await db.rpc('join_program', {
    p_program_id: progEchelle, p_source: 'stripe', p_user_id: m1,
    p_amount_cents: PRIX, p_stripe_payment_intent: `pi_zzcp_${stamp}`,
  });
  const apresStripe = await provenanceDe(progEchelle, m1);
  assert('un paiement Stripe requalifie un accès comptoir',
    !rStripeApres.error && apresStripe?.provenance === 'stripe',
    rStripeApres.error?.message ?? `provenance=${apresStripe?.provenance}`);

  const rCashApres = await encaisse(sOwner.client, progEchelle, m1, PRIX);
  const apresCash = await provenanceDe(progEchelle, m1);
  assert('un encaissement comptoir ne dégrade pas un accès Stripe',
    !rCashApres.error && apresCash?.provenance === 'stripe',
    rCashApres.error?.message ?? `provenance=${apresCash?.provenance}`);

  // ── 15..21 : les deux surfaces d'argent, dans les deux sens ───────────────
  console.log('\n— Les deux surfaces d\'argent, dans les deux sens');

  const from = new Date(Date.now() - 86400_000).toISOString();
  const to = new Date(Date.now() + 86400_000).toISOString();

  const progMesure = await mkProgram(`zzcp${stamp}d`, PRIX);
  const avant = (await synthese(sOwner.client, box, from, to)).row;

  await encaisse(sOwner.client, progMesure, m4, REMISE);
  const apresComptoir = (await synthese(sOwner.client, box, from, to)).row;

  assert('une ligne comptoir fait monter « Programmes » du montant exact',
    Number(apresComptoir.program_revenue_cents) - Number(avant.program_revenue_cents) === REMISE
      && apresComptoir.program_sales_period - avant.program_sales_period === 1,
    `Δ=${Number(apresComptoir.program_revenue_cents) - Number(avant.program_revenue_cents)} (attendu ${REMISE}) · ventes Δ=${apresComptoir.program_sales_period - avant.program_sales_period}`);

  assert('… et ne la compte pas une seconde fois dans « Encaissé au comptoir »',
    Number(apresComptoir.cash_collected_cents) === Number(avant.cash_collected_cents)
      && apresComptoir.cash_collected_count === avant.cash_collected_count,
    `comptoir Δ=${Number(apresComptoir.cash_collected_cents) - Number(avant.cash_collected_cents)} (attendu 0)`);

  const progStaff = await mkProgram(`zzcp${stamp}e`, PRIX);
  await sOwner.client.rpc('join_program', { p_program_id: progStaff, p_source: 'staff', p_user_id: m3 });
  const apresStaffArgent = (await synthese(sOwner.client, box, from, to)).row;
  assert('une ligne staff ne fait monter ni « Programmes » ni « comptoir »',
    Number(apresStaffArgent.program_revenue_cents) === Number(apresComptoir.program_revenue_cents)
      && apresStaffArgent.program_sales_period === apresComptoir.program_sales_period
      && Number(apresStaffArgent.cash_collected_cents) === Number(apresComptoir.cash_collected_cents),
    `programmes Δ=${Number(apresStaffArgent.program_revenue_cents) - Number(apresComptoir.program_revenue_cents)} · ventes Δ=${apresStaffArgent.program_sales_period - apresComptoir.program_sales_period}`);

  // Contrôle positif : sans lui, « plus rien ne compte » passerait pour un succès.
  const progStripe = await mkProgram(`zzcp${stamp}f`, PRIX);
  await db.rpc('join_program', {
    p_program_id: progStripe, p_source: 'stripe', p_user_id: m2,
    p_amount_cents: PRIX, p_stripe_payment_intent: `pi_zzcp2_${stamp}`,
  });
  const apresStripeArgent = (await synthese(sOwner.client, box, from, to)).row;
  assert('CONTRÔLE POSITIF : un achat Stripe reste compté dans « Programmes »',
    Number(apresStripeArgent.program_revenue_cents) - Number(apresStaffArgent.program_revenue_cents) === PRIX,
    `Δ=${Number(apresStripeArgent.program_revenue_cents) - Number(apresStaffArgent.program_revenue_cents)} (attendu ${PRIX})`);

  // Un encaissement d'ABONNEMENT, lui, est bien du comptoir — et il passe par sa
  // porte réelle. Trois paramètres ajoutés au journal ne remplacent pas la
  // fonction : ils en créent une seconde, et un appel à 5 arguments devient
  // ambigu. Ce chemin-là est donc un contrôle de non-régression, pas un décor.
  const { data: plan, error: planErr } = await db.from('membership_plans').insert({
    box_id: box, name: `zz_cp_plan_${stamp}`, price_cents: PRIX_ABO, is_active: true, plan_type: 'subscription',
  }).select('id').single();
  if (planErr) throw new Error(`décor formule : ${planErr.message}`);
  onCleanup(() => db.from('membership_plans').delete().eq('id', plan.id));
  const { data: adhesion, error: adhErr } = await db.from('box_members')
    .update({ plan_id: plan.id }).eq('box_id', box).eq('member_id', m1).select('id').single();
  if (adhErr) throw new Error(`décor adhésion : ${adhErr.message}`);

  const rAbo = await sOwner.client.rpc('record_member_cash_payment', { p_box_member_id: adhesion.id });
  const apresAbo = (await synthese(sOwner.client, box, from, to)).row;
  assert('un encaissement d\'abonnement entre, lui, dans « Encaissé au comptoir »',
    !rAbo.error
      && Number(apresAbo.cash_collected_cents) - Number(apresStripeArgent.cash_collected_cents) === PRIX_ABO
      && Number(apresAbo.program_revenue_cents) === Number(apresStripeArgent.program_revenue_cents),
    rAbo.error?.message ?? `comptoir Δ=${Number(apresAbo.cash_collected_cents) - Number(apresStripeArgent.cash_collected_cents)} · programmes Δ=${Number(apresAbo.program_revenue_cents) - Number(apresStripeArgent.program_revenue_cents)}`);

  const sVoisin = await signInAs(mk('vo'), PASSWORD);
  const voisine = (await synthese(sVoisin.client, boxVoisine, from, to)).row;
  assert('la box voisine ne voit rien de ces montants',
    Number(voisine.program_revenue_cents) === 0 && Number(voisine.cash_collected_cents) === 0,
    `programmes=${voisine.program_revenue_cents} comptoir=${voisine.cash_collected_cents}`);

  const rCoachArgent = await synthese(sCoach.client, box, from, to);
  assert('le coach ne lit pas la synthèse d\'argent',
    refus(rCoachArgent.error, 'FORBIDDEN|administr'),
    rCoachArgent.error?.message ?? `lignes servies : ${JSON.stringify(rCoachArgent.row)}`);

  // ── 22..24 : le retrait ───────────────────────────────────────────────────
  console.log('\n— Le retrait');

  const accesCash = await provenanceDe(prog, m2);
  const rRetraitCash = await sOwner.client.from('program_members')
    .update({ status: 'cancelled' }).eq('id', accesCash.id).select('id');
  assert('le gérant retire un accès comptoir',
    !rRetraitCash.error && (rRetraitCash.data ?? []).length === 1,
    rRetraitCash.error?.message ?? `lignes touchées : ${(rRetraitCash.data ?? []).length}`);

  const accesStripe = await provenanceDe(progStripe, m2);
  const rRetraitStripe = await sOwner.client.from('program_members')
    .update({ status: 'cancelled' }).eq('id', accesStripe.id).select('id');
  assert('le gérant NE PEUT PAS retirer un accès Stripe — refus du serveur',
    refus(rRetraitStripe.error, 'PAID_ACCESS'),
    rRetraitStripe.error?.message ?? `lignes touchées : ${(rRetraitStripe.data ?? []).length} (le refus n\'existait que côté client)`);

  const rRefund = await db.from('program_members')
    .update({ status: 'refunded' }).eq('id', accesStripe.id).select('id');
  assert('le backend signé pose bien « refunded » (chemin du remboursement)',
    !rRefund.error && (rRefund.data ?? []).length === 1,
    rRefund.error?.message ?? `lignes touchées : ${(rRefund.data ?? []).length}`);

  // ── 25..28 : le journal reste un grand livre ──────────────────────────────
  console.log('\n— Le journal reste un grand livre');

  const rUpd = await sOwner.client.from('box_cash_payments')
    .update({ amount_cents: 1 }).eq('id', j1.id).select('id');
  assert('une ligne du journal ne se réécrit pas',
    !!rUpd.error || (rUpd.data ?? []).length === 0,
    `lignes touchées : ${(rUpd.data ?? []).length}`);

  const rDel = await sOwner.client.from('box_cash_payments')
    .delete().eq('id', j1.id).select('id');
  assert('une ligne du journal ne se supprime pas',
    !!rDel.error || (rDel.data ?? []).length === 0,
    `lignes supprimées : ${(rDel.data ?? []).length}`);

  const { data: coachJournal, error: coachJournalErr } = await sCoach.client
    .from('box_cash_payments').select('id').eq('box_id', box);
  assert('le coach ne lit pas le journal',
    !!coachJournalErr || (coachJournal ?? []).length === 0,
    `lignes servies : ${(coachJournal ?? []).length}`);

  const { data: anonJournal, error: anonJournalErr } = await anon
    .from('box_cash_payments').select('id').eq('box_id', box);
  assert('anon ne lit pas le journal',
    !!anonJournalErr || (anonJournal ?? []).length === 0,
    `lignes servies : ${(anonJournal ?? []).length}`);

  // Purge des lignes créées dans le journal et les accès : append-only côté
  // client, pas côté service_role.
  onCleanup(() => db.from('box_cash_payments').delete().eq('box_id', box));
  onCleanup(() => db.from('program_members').delete().in('program_id', [prog, progGratuit, progEchelle, progMesure, progStaff, progStripe]));

  console.log(`\n=== ${passed} ✅ · ${failed} ❌ ===\n`);
}

attendu = PLAN.reduce((a, b) => a + b, 0);

main()
  .catch(err => { console.error('\n💥', err?.message ?? err); failed++; })
  .finally(async () => {
    await runCleanup();
    process.exit(failed > 0 ? 1 : 0);
  });
