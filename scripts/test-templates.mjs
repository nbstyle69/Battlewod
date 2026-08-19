/**
 * test-templates.mjs — Semaines types (lot 3) au vrai JWT.
 *
 * Ce que cette suite exige, et qui n'était pas vrai avant elle :
 *   1. une semaine du Whiteboard s'enregistre comme semaine type sans nouvelle
 *      table (une `box_programming` interne, `is_template`) ;
 *   2. une semaine type reste privée : invisible au catalogue, inaccessible à
 *      une autre box, non convertible en offre payante ;
 *   3. le conflit se mesure sur le JOUR du calendrier — un WOD saisi à la main
 *      compte, alors que l'ancienne version ne voyait que la même programmation ;
 *   4. le remplacement N'EFFACE JAMAIS un WOD qui porte un score ou une
 *      complétion, et le dit — pour les DEUX sources (`template` ET
 *      `subscription`), puisque c'est le même `p_replace` ;
 *   5. les time caps restent à la seconde à travers l'aller-retour.
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-templates.mjs
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
const PASSWORD = 'TestTpl1234!';

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

/** Lundi ISO à N semaines du lundi de la semaine courante. */
function mondayIn(weeks) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1) + weeks * 7);
  return d.toISOString().slice(0, 10);
}
function plusDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  // ── Décor : deux box indépendantes, chacune avec son gérant ────────────────
  const emailA = `zz_tpl_a_${stamp}@test.athlex.local`;
  const emailB = `zz_tpl_b_${stamp}@test.athlex.local`;
  const emailM = `zz_tpl_m_${stamp}@test.athlex.local`;

  const ownerA = await createUser(db, { email: emailA, password: PASSWORD, username: `zz_tpl_a_${stamp}`, role: 'box_owner' });
  const ownerB = await createUser(db, { email: emailB, password: PASSWORD, username: `zz_tpl_b_${stamp}`, role: 'box_owner' });
  const member = await createUser(db, { email: emailM, password: PASSWORD, username: `zz_tpl_m_${stamp}` });

  const boxA = await createOwnedBox(db, { tag: `tplA${stamp}`, ownerId: ownerA, name: `zz_tpl_boxA_${stamp}` });
  const boxB = await createOwnedBox(db, { tag: `tplB${stamp}`, ownerId: ownerB, name: `zz_tpl_boxB_${stamp}` });
  onCleanup(() => dropBoxAndOwner(db, boxB, ownerB));
  onCleanup(() => dropBoxAndOwner(db, boxA, ownerA));
  onCleanup(() => db.auth.admin.deleteUser(member));

  await db.from('box_members').upsert(
    { box_id: boxA, member_id: member, role: 'member', status: 'active' },
    { onConflict: 'box_id,member_id' },
  );

  const A = await signInAs(emailA, PASSWORD);
  const B = await signInAs(emailB, PASSWORD);

  // ── Semaine source : trois WOD enrichis, dont un time cap à la seconde ─────
  const src = mondayIn(-2);
  const seed = [
    { d: 0, title: 'zz Lundi Force', wod_type: 'strength', time_cap_seconds: 750, block_name: 'strength', notes: 'zz notes lundi', leaderboard_enabled: false, rounds: 5 },
    { d: 1, title: 'zz Mardi AMRAP', wod_type: 'amrap', time_cap_seconds: 1230, block_name: 'metcon', notes: null, leaderboard_enabled: true, rounds: null },
    { d: 2, title: 'zz Mercredi EMOM', wod_type: 'emom', time_cap_seconds: 600, block_name: 'metcon', notes: null, leaderboard_enabled: true, rounds: null, emom_interval_minutes: 2 },
  ];
  for (const w of seed) {
    const { error } = await db.from('box_wods').insert({
      box_id: boxA, created_by: ownerA, title: w.title,
      description: '21 Thruster (43 kg)', wod_type: w.wod_type,
      scheduled_date: plusDays(src, w.d), time_cap_seconds: w.time_cap_seconds,
      rounds: w.rounds, is_published: true, sort_order: 0,
      block_name: w.block_name, notes: w.notes,
      leaderboard_enabled: w.leaderboard_enabled,
      emom_interval_minutes: w.emom_interval_minutes ?? null,
    });
    if (error) throw new Error(`décor WOD ${w.title} : ${error.message}`);
  }

  console.log('\n── 1. Enregistrer la semaine comme semaine type ─────────────────');
  const { data: saved, error: saveErr } = await A.client.rpc('save_week_as_template', {
    p_box_id: boxA, p_source_monday: src, p_title: `zz Semaine type ${stamp}`,
  });
  assert('save_week_as_template réussit pour le gérant', !saveErr, saveErr?.message);
  const templateId = saved?.template_id ?? null;
  assertEq('3 WOD enregistrés sur 3 jours', [saved?.wods, saved?.days], [3, 3]);

  const { data: tplRow } = await db.from('box_programming')
    .select('is_template,is_published,billing,price_cents,weeks_count,publisher_box_id')
    .eq('id', templateId).single();
  assertEq('la semaine type est une programmation interne, privée et gratuite',
    [tplRow?.is_template, tplRow?.is_published, tplRow?.billing, tplRow?.price_cents, tplRow?.weeks_count, tplRow?.publisher_box_id],
    [true, false, 'free', 0, 1, boxA]);

  const { data: tplWods } = await db.from('box_programming_wods')
    .select('day_of_week,title,time_cap_seconds,block_name,notes,leaderboard_enabled,emom_interval_minutes')
    .eq('programming_id', templateId).order('day_of_week');
  assertEq('les jours sont conservés (lundi, mardi, mercredi)',
    (tplWods ?? []).map(w => w.day_of_week), [1, 2, 3]);
  assertEq('le time cap traverse à la seconde (750, pas 780)',
    (tplWods ?? []).map(w => w.time_cap_seconds), [750, 1230, 600]);
  assertEq('bloc, notes, classement et intervalle EMOM suivent',
    [tplWods?.[0]?.block_name, tplWods?.[0]?.notes, tplWods?.[0]?.leaderboard_enabled, tplWods?.[2]?.emom_interval_minutes],
    ['strength', 'zz notes lundi', false, 2]);

  // Une semaine vide n'a rien à enregistrer : refus explicite, pas un template creux.
  const { error: emptyErr } = await A.client.rpc('save_week_as_template', {
    p_box_id: boxA, p_source_monday: mondayIn(40),
  });
  assertRefused('une semaine sans WOD refuse de devenir une semaine type', emptyErr);

  console.log('\n── 2. La semaine type reste privée ──────────────────────────────');
  const { data: bList, error: bListErr } = await B.client.rpc('list_week_templates', { p_box_id: boxA });
  assertRefused('une autre box ne liste pas les semaines types de la box A', bListErr);
  assertEq('… et n\'en reçoit aucune ligne', (bList ?? []).length, 0);

  const { data: bRead } = await B.client.from('box_programming').select('id').eq('id', templateId);
  assertEq('une autre box ne lit pas la ligne de la semaine type (RLS)', (bRead ?? []).length, 0);

  const { error: bSaveErr } = await B.client.rpc('save_week_as_template', {
    p_box_id: boxA, p_source_monday: src,
  });
  assertRefused('une autre box ne peut pas enregistrer une semaine chez A', bSaveErr);

  const { error: bApplyErr } = await B.client.rpc('apply_program_week', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1,
    p_target_monday: mondayIn(3), p_group_ids: null, p_replace: false,
  });
  assertRefused('une autre box ne peut pas appliquer la semaine type de A', bApplyErr);

  const { data: mList } = await db.from('box_programming')
    .select('id').eq('is_published', true).eq('id', templateId);
  assertEq('la semaine type n\'apparaît pas au catalogue publié', (mList ?? []).length, 0);

  const { error: monetizeErr } = await db.from('box_programming')
    .update({ is_published: true, billing: 'monthly', price_cents: 4900 })
    .eq('id', templateId);
  assertRefused('une semaine type ne devient pas une offre payante (contrainte en table)', monetizeErr);

  console.log('\n── 3. Appliquer sur une semaine vierge ──────────────────────────');
  const t1 = mondayIn(3);
  const { data: applied, error: applyErr } = await A.client.rpc('apply_program_week', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1,
    p_target_monday: t1, p_group_ids: null, p_replace: false,
  });
  assert('la source « template » est disponible', !applyErr, applyErr?.message);
  assertEq('3 WOD posés, rien remplacé, rien conservé',
    [applied?.inserted, applied?.replaced, applied?.kept_with_results], [3, 0, 0]);

  const { data: posed } = await db.from('box_wods')
    .select('scheduled_date,title,time_cap_seconds,source_programming_id')
    .eq('box_id', boxA).gte('scheduled_date', t1).lt('scheduled_date', plusDays(t1, 7))
    .order('scheduled_date');
  assertEq('les WOD sont posés aux bons jours avec leurs caps exacts',
    (posed ?? []).map(w => [w.scheduled_date, w.time_cap_seconds]),
    [[t1, 750], [plusDays(t1, 1), 1230], [plusDays(t1, 2), 600]]);
  assertEq('ils portent la semaine type comme source',
    (posed ?? []).every(w => w.source_programming_id === templateId), true);

  console.log('\n── 4. Le conflit se mesure sur le jour, pas sur la source ───────');
  const t2 = mondayIn(4);
  const { data: manual, error: manErr } = await db.from('box_wods').insert({
    box_id: boxA, created_by: ownerA, title: 'zz WOD maison mardi',
    wod_type: 'for_time', scheduled_date: plusDays(t2, 1), is_published: true,
  }).select('id').single();
  if (manErr) throw new Error(`décor WOD maison : ${manErr.message}`);

  const { data: conflictCount } = await A.client.rpc('count_program_week_conflicts', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1, p_target_monday: t2,
  });
  assertEq('un WOD saisi à la main compte comme conflit (avant : 0)', conflictCount, 1);

  const { data: conflictRows } = await A.client.rpc('list_program_week_conflicts', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1, p_target_monday: t2,
  });
  assertEq('le conflit est nommé avec son jour, sa provenance et son état',
    (conflictRows ?? []).map(r => [r.scheduled_date, r.origin, r.has_results]),
    [[plusDays(t2, 1), 'manual', false]]);

  // Un jour que la semaine source ne remplit pas n'est pas un conflit : une
  // semaine type du lundi au mercredi ne regarde pas le samedi.
  const { data: sat } = await db.from('box_wods').insert({
    box_id: boxA, created_by: ownerA, title: 'zz WOD samedi hors source',
    wod_type: 'for_time', scheduled_date: plusDays(t2, 5), is_published: true,
  }).select('id').single();
  const { data: countAfterSat } = await A.client.rpc('count_program_week_conflicts', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1, p_target_monday: t2,
  });
  assertEq('un jour non rempli par la source reste hors conflit', countAfterSat, 1);

  const { error: refuseErr } = await A.client.rpc('apply_program_week', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1,
    p_target_monday: t2, p_group_ids: null, p_replace: false,
  });
  assertRefused('appliquer sans remplacement refuse quand un jour est occupé', refuseErr);

  console.log('\n── 5. Le remplacement épargne les WOD qui portent des résultats ──');
  // Le WOD maison du mardi reçoit un score : il devient intouchable.
  const { error: scoreErr } = await db.from('wod_scores').insert({
    wod_id: manual.id, member_id: member, box_id: boxA,
    score_type: 'reps', score_value: 142, rx: true,
  });
  if (scoreErr) throw new Error(`décor score : ${scoreErr.message}`);

  const { data: conflictScored } = await A.client.rpc('list_program_week_conflicts', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1, p_target_monday: t2,
  });
  assertEq('le conflit signale désormais un WOD qui porte un score',
    (conflictScored ?? []).map(r => r.has_results), [true]);

  const { data: replaced, error: replaceErr } = await A.client.rpc('apply_program_week', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1,
    p_target_monday: t2, p_group_ids: null, p_replace: true,
  });
  assert('le remplacement passe', !replaceErr, replaceErr?.message);
  assertEq('rien n\'est supprimé, le WOD scoré est conservé et compté',
    [replaced?.replaced, replaced?.kept_with_results], [0, 1]);
  assertEq('le retour nomme ce qu\'il a conservé',
    (replaced?.kept_details ?? []).map(r => [r.date, r.title]),
    [[plusDays(t2, 1), 'zz WOD maison mardi']]);

  const { data: scoreStill } = await db.from('wod_scores').select('id').eq('wod_id', manual.id);
  assertEq('le score de l\'athlète existe toujours', (scoreStill ?? []).length, 1);
  const { data: manualStill } = await db.from('box_wods').select('id').eq('id', manual.id);
  assertEq('le WOD scoré existe toujours', (manualStill ?? []).length, 1);

  // Une complétion (WOD marqué « fait ») protège autant qu'un score.
  const t3 = mondayIn(5);
  const { data: doneWod } = await db.from('box_wods').insert({
    box_id: boxA, created_by: ownerA, title: 'zz WOD marqué fait',
    wod_type: 'for_time', scheduled_date: t3, is_published: true,
  }).select('id').single();
  await db.from('wod_completions').insert({ wod_id: doneWod.id, member_id: member, box_id: boxA });
  const { data: vierge } = await db.from('box_wods').insert({
    box_id: boxA, created_by: ownerA, title: 'zz WOD vierge mardi',
    wod_type: 'for_time', scheduled_date: plusDays(t3, 1), is_published: true,
  }).select('id').single();

  const { data: mixed, error: mixedErr } = await A.client.rpc('apply_program_week', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1,
    p_target_monday: t3, p_group_ids: null, p_replace: true,
  });
  assert('le remplacement mixte passe', !mixedErr, mixedErr?.message);
  assertEq('le WOD vierge est remplacé, le WOD marqué fait est conservé',
    [mixed?.replaced, mixed?.kept_with_results], [1, 1]);
  const { data: doneStill } = await db.from('box_wods').select('id').eq('id', doneWod.id);
  const { data: viergeGone } = await db.from('box_wods').select('id').eq('id', vierge.id);
  assertEq('la complétion protège son WOD, le vierge est parti',
    [(doneStill ?? []).length, (viergeGone ?? []).length], [1, 0]);

  console.log('\n── 6. Réapplication : pas de doublon, pas de perte ──────────────');
  const { data: again, error: againErr } = await A.client.rpc('apply_program_week', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1,
    p_target_monday: t1, p_group_ids: null, p_replace: true,
  });
  assert('réappliquer la même semaine passe', !againErr, againErr?.message);
  assertEq('3 remplacés, 3 reposés', [again?.replaced, again?.inserted], [3, 3]);
  const { count: t1Count } = await db.from('box_wods')
    .select('id', { count: 'exact', head: true })
    .eq('box_id', boxA).gte('scheduled_date', t1).lt('scheduled_date', plusDays(t1, 7));
  assertEq('la semaine cible porte toujours 3 WOD (aucune pile)', t1Count, 3);

  // Réapplication sur une semaine dont un WOD issu de CETTE semaine type porte
  // un score : le WOD survit, et il n'est pas doublé par sa propre source.
  const { data: fromTpl } = await db.from('box_wods')
    .select('id').eq('box_id', boxA).eq('scheduled_date', t1).limit(1).single();
  await db.from('wod_scores').insert({
    wod_id: fromTpl.id, member_id: member, box_id: boxA,
    score_type: 'time', score_value: 421, rx: true,
  });
  const { data: third, error: thirdErr } = await A.client.rpc('apply_program_week', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1,
    p_target_monday: t1, p_group_ids: null, p_replace: true,
  });
  assert('troisième application passe', !thirdErr, thirdErr?.message);
  assertEq('le WOD scoré issu de la semaine type est conservé, non dupliqué',
    [third?.kept_with_results, third?.skipped, third?.inserted], [1, 1, 2]);
  const { count: t1Again } = await db.from('box_wods')
    .select('id', { count: 'exact', head: true })
    .eq('box_id', boxA).gte('scheduled_date', t1).lt('scheduled_date', plusDays(t1, 7));
  assertEq('toujours 3 WOD sur la semaine, le lundi n\'est pas en double', t1Again, 3);

  console.log('\n── 7. Le chemin marketplace hérite de la même règle ─────────────');
  // Même `p_replace` : une programmation souscrite ne doit pas non plus effacer
  // un score. Sans ce contrôle, la règle ne vaudrait que pour la source neuve.
  const { data: offer } = await db.from('box_programming').insert({
    publisher_box_id: boxB, title: `zz Offre ${stamp}`, weeks_count: 1,
    days_per_week: 1, billing: 'free', price_cents: 0, is_published: true,
    created_by: ownerB,
  }).select('id').single();
  await db.from('box_programming_wods').insert({
    programming_id: offer.id, week_number: 1, day_of_week: 1,
    title: 'zz Offre lundi', wod_type: 'for_time', time_cap_seconds: 900, sort_order: 0,
  });
  const { data: sub } = await db.from('box_programming_subscriptions').insert({
    programming_id: offer.id, subscriber_box_id: boxA, status: 'active',
    created_by: ownerA, week_anchor: mondayIn(0),
  }).select('id').single();

  const t4 = mondayIn(6);
  const { data: scoredThere } = await db.from('box_wods').insert({
    box_id: boxA, created_by: ownerA, title: 'zz WOD scoré lundi (marketplace)',
    wod_type: 'for_time', scheduled_date: t4, is_published: true,
  }).select('id').single();
  await db.from('wod_scores').insert({
    wod_id: scoredThere.id, member_id: member, box_id: boxA,
    score_type: 'time', score_value: 512, rx: true,
  });

  const { data: subApplied, error: subApplyErr } = await A.client.rpc('apply_program_week', {
    p_source_kind: 'subscription', p_source_id: sub.id, p_week: 1,
    p_target_monday: t4, p_group_ids: null, p_replace: true,
  });
  assert('appliquer une programmation souscrite passe', !subApplyErr, subApplyErr?.message);
  assertEq('la souscription non plus n\'efface pas un WOD scoré',
    [subApplied?.replaced, subApplied?.kept_with_results], [0, 1]);
  const { data: mktStill } = await db.from('box_wods').select('id').eq('id', scoredThere.id);
  assertEq('le WOD scoré du chemin marketplace survit', (mktStill ?? []).length, 1);

  console.log('\n── 8. Gardes d\'appel ───────────────────────────────────────────');
  const { error: dowErr } = await A.client.rpc('apply_program_week', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1,
    p_target_monday: plusDays(t1, 2), p_group_ids: null, p_replace: false,
  });
  assertRefused('une cible qui n\'est pas un lundi est refusée', dowErr);

  const { error: weekErr } = await A.client.rpc('apply_program_week', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 4,
    p_target_monday: mondayIn(7), p_group_ids: null, p_replace: false,
  });
  assertRefused('une semaine hors de la semaine type est refusée', weekErr);

  const { error: groupErr } = await A.client.rpc('apply_program_week', {
    p_source_kind: 'template', p_source_id: templateId, p_week: 1,
    p_target_monday: mondayIn(8), p_group_ids: [boxB], p_replace: false,
  });
  assertRefused('un groupe hors de la box cible est refusé', groupErr);

  const { error: unknownErr } = await A.client.rpc('apply_program_week', {
    p_source_kind: 'zz_inconnu', p_source_id: templateId, p_week: 1,
    p_target_monday: mondayIn(8), p_group_ids: null, p_replace: false,
  });
  assertRefused('une source inconnue est refusée', unknownErr);

  console.log('\n── 9. Mise à jour et suppression d\'une semaine type ────────────');
  const { data: updated, error: updErr } = await A.client.rpc('save_week_as_template', {
    p_box_id: boxA, p_source_monday: src, p_title: `zz Semaine type ${stamp} (v2)`,
    p_template_id: templateId,
  });
  assert('réenregistrer écrase le contenu de la semaine type', !updErr, updErr?.message);
  assertEq('3 lignes remplacées par 3 lignes', [updated?.replaced_wods, updated?.wods], [3, 3]);
  const { count: tplCount } = await db.from('box_programming_wods')
    .select('id', { count: 'exact', head: true }).eq('programming_id', templateId);
  assertEq('la semaine type ne contient pas 6 WOD empilés', tplCount, 3);

  const { data: listed } = await A.client.rpc('list_week_templates', { p_box_id: boxA });
  assertEq('la semaine type est listée avec son décompte',
    (listed ?? []).filter(t => t.template_id === templateId).map(t => [t.wods_count, t.days_count]),
    [[3, 3]]);

  const { error: bDelErr } = await B.client.rpc('delete_week_template', { p_template_id: templateId });
  assertRefused('une autre box ne supprime pas la semaine type de A', bDelErr);

  const { count: beforeDelete } = await db.from('box_wods')
    .select('id', { count: 'exact', head: true })
    .eq('box_id', boxA).eq('source_programming_id', templateId);
  const { error: delErr } = await A.client.rpc('delete_week_template', { p_template_id: templateId });
  assert('le gérant supprime sa semaine type', !delErr, delErr?.message);
  const { count: survivors } = await db.from('box_wods')
    .select('id', { count: 'exact', head: true })
    .eq('box_id', boxA).gte('scheduled_date', t1).lt('scheduled_date', plusDays(t1, 7));
  assert('les WOD déjà posés survivent à la suppression de la semaine type',
    survivors === 3 && beforeDelete >= 3, `posés avant : ${beforeDelete}, survivants : ${survivors}`);

  // Purge du décor de la box B (l'offre et la souscription tombent avec la box).
  onCleanup(async () => {
    await db.from('box_programming_subscriptions').delete().eq('id', sub.id);
    await db.from('box_programming').delete().eq('id', offer.id);
    await db.from('wod_scores').delete().eq('box_id', boxA);
    await db.from('wod_completions').delete().eq('box_id', boxA);
    await db.from('box_wods').delete().eq('box_id', boxA);
  });
}

try {
  await main();
} catch (e) {
  fail('suite interrompue', e?.message ?? String(e));
} finally {
  await runCleanup();
  // Le décor est préfixé zz : on vérifie son absence plutôt que de l'affirmer.
  const { count: leftovers } = await db.from('box_wods')
    .select('id', { count: 'exact', head: true }).ilike('title', 'zz %');
  console.log(`\n  décor résiduel « zz » : ${leftovers ?? 0} WOD`);
  console.log(`\n${passed} ✅ · ${failed} ❌`);
  process.exit(failed ? 1 : 0);
}
