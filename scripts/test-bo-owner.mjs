#!/usr/bin/env node
/**
 * AthleX — Back Office Owner Test
 * ─────────────────────────────────────────────────────────────────────────────
 * Simule toutes les actions possibles d'un owner dans le BO web :
 *
 *  Suite 1 — Réglages        : READ box, UPDATE infos (nom, adresse, email…)
 *  Suite 2 — Membres         : list, ban/unban, role coach→member, plan, groupe
 *  Suite 3 — Actualités      : CREATE article, UPDATE, DELETE
 *  Suite 4 — Horaires        : CREATE créneau, UPDATE, DELETE
 *  Suite 5 — Whiteboard      : CREATE WOD, publish, unpublish, UPDATE, DELETE
 *  Suite 6 — Programmation   : CREATE programme, add WOD, deactivate, DELETE
 *  Suite 7 — Groupes         : CREATE groupe, add member, UPDATE, remove member, DELETE
 *  Suite 8 — Tournois        : CREATE (classique), WOD, participants, score submit,
 *                              validate, reject, close, DELETE
 *  Suite 9 — Dashboard KPIs  : vérif compteurs cohérents
 */

import {
  requireTestTarget, serviceClient, createUser, createOwnedBox, dropBoxAndOwner,
  onCleanup, runCleanup, installCleanupTraps,
} from './lib/test-env.mjs';

requireTestTarget();
installCleanupTraps();

const db = serviceClient();

const TS  = Date.now();
const TAG = `bo_${TS}`;
let passed = 0, failed = 0;
const ok     = m => { console.log(`  ✅ ${m}`); passed++; };
const fail   = (m, e) => { console.log(`  ❌ ${m}${e ? '\n     → ' + (e.message ?? JSON.stringify(e)) : ''}`); failed++; };
const assert = (c, m, e = null) => { c ? ok(m) : fail(m, e); return c; };
const sep    = label => console.log(`\n${'═'.repeat(72)}\n  Suite — ${label}\n${'─'.repeat(72)}`);

// ── Shared state ──────────────────────────────────────────────────────────────
let box = null;
let ownerId = null;       // auth agent that acts as owner
const members = [];       // 3 member agents

// Cleanup tracking
const cleanup = { articles: [], schedules: [], wods: [], programs: [], groups: [], plans: [], memberIds: [] };

// ── Agents setup ──────────────────────────────────────────────────────────────
async function setup() {
  console.log('\n── Setup: box + 1 owner agent + 3 member agents ────────────────────────────');

  // Owner jetable, puis SA box : cette suite modifiait les réglages d'une box
  // existante (nom, adresse, contact…) avant de tenter de les restaurer.
  const ownerEmail = `bo_owner_${TAG}@test.athlex.io`;
  ownerId = await createUser(db, {
    email: ownerEmail, password: `AthleX!${TS}`, username: `BOOwner_${TS}`, role: 'box_owner',
  });
  assert(!!ownerId, 'Owner agent créé');

  const boxId = await createOwnedBox(db, { tag: TAG, ownerId });
  onCleanup(() => dropBoxAndOwner(db, boxId, ownerId));
  const { data: b } = await db.from('boxes')
    .select('id,name,address,website_url,contact_email,phone').eq('id', boxId).single();
  box = b;
  assert(!!box, `Box jetable créée: "${box?.name}"`);

  // Create 3 member agents
  for (let i = 1; i <= 3; i++) {
    const email = `bo_m${i}_${TAG}@test.athlex.io`;
    const { data: auth } = await db.auth.admin.createUser({ email, password: `AthleX!${TS}`, email_confirm: true });
    const id = auth?.user?.id;
    if (!id) { fail(`Member ${i} auth`); continue; }
    await db.from('profiles').upsert({ id, email, username: `BOMbr${i}_${TS}`, role: 'athlete', level: 'rx', elo: 1000, total_matches: 0, wins: 0 }, { onConflict: 'id' });
    await db.from('box_members').insert({ box_id: box.id, member_id: id, status: 'active', role: 'member', joined_at: new Date().toISOString() });
    members.push({ id, email, username: `BOMbr${i}_${TS}` });
    cleanup.memberIds.push(id);
  }
  ok(`3 member agents créés & joints à la box`);
}

// ── Suite 1 — Réglages ────────────────────────────────────────────────────────
async function suiteSettings() {
  sep('Réglages (box settings)');

  const original = { name: box.name, address: box.address };

  // UPDATE box info
  const { error: uErr } = await db.from('boxes').update({
    name: `[TEST-BO] ${box.name}`,
    address: '12 rue du Test, 69001 Lyon',
    website_url: 'https://test.athlex.io',
    contact_email: `contact_${TAG}@athlex.io`,
    phone: '+33612345678',
    google_maps_url: 'https://maps.google.com/test',
    founded_at: '2020-01-01',
  }).eq('id', box.id);
  assert(!uErr, 'UPDATE box: nom, adresse, email, téléphone, maps, founded_at', uErr);

  // READ back
  const { data: bRead } = await db.from('boxes').select('name,address,website_url,contact_email,phone').eq('id', box.id).single();
  assert(bRead?.name === `[TEST-BO] ${box.name}`, `Nom mis à jour: "${bRead?.name}"`);
  assert(bRead?.address === '12 rue du Test, 69001 Lyon', `Adresse: "${bRead?.address}"`);
  assert(bRead?.contact_email === `contact_${TAG}@athlex.io`, `Email contact OK`);
  assert(bRead?.phone === '+33612345678', `Téléphone OK`);

  // RESTORE
  await db.from('boxes').update({ name: original.name, address: original.address, website_url: null, contact_email: null, phone: null, google_maps_url: null, founded_at: null }).eq('id', box.id);
  ok('Box restaurée à l\'état initial');
}

// ── Suite 2 — Membres ─────────────────────────────────────────────────────────
async function suiteMembers() {
  sep('Membres');
  const m = members[0]; if (!m) { fail('Pas de member agent'); return; }

  // LIST
  const { data: list, count } = await db.from('box_members').select('member_id, status, role', { count: 'exact' }).eq('box_id', box.id).in('status', ['active', 'banned']);
  assert(!!list && list.length >= 3, `Liste membres: ${list?.length} actifs/bannis`);

  // BAN
  const { error: banErr } = await db.from('box_members').update({ status: 'banned' }).eq('member_id', m.id).eq('box_id', box.id);
  assert(!banErr, `Ban ${m.username}`, banErr);
  const { data: banned } = await db.from('box_members').select('status').eq('member_id', m.id).eq('box_id', box.id).single();
  assert(banned?.status === 'banned', `Statut confirmé: banned`);

  // UNBAN
  const { error: unbanErr } = await db.from('box_members').update({ status: 'active' }).eq('member_id', m.id).eq('box_id', box.id);
  assert(!unbanErr, `Unban ${m.username}`, unbanErr);
  const { data: unbanned } = await db.from('box_members').select('status').eq('member_id', m.id).eq('box_id', box.id).single();
  assert(unbanned?.status === 'active', `Statut confirmé: active`);

  // ROLE → coach
  const { error: roleErr } = await db.from('box_members').update({ role: 'coach' }).eq('member_id', m.id).eq('box_id', box.id);
  assert(!roleErr, `Rôle ${m.username} → coach`, roleErr);
  const { data: roleRow } = await db.from('box_members').select('role').eq('member_id', m.id).eq('box_id', box.id).single();
  assert(roleRow?.role === 'coach', 'Rôle confirmé: coach');

  // ROLE → member (reset)
  await db.from('box_members').update({ role: 'member' }).eq('member_id', m.id).eq('box_id', box.id);
  ok('Rôle remis à member');

  // CREATE membership plan
  const { data: plan, error: planErr } = await db.from('membership_plans').insert({ box_id: box.id, name: `[TEST] Plan ${TAG}`, max_sessions_per_week: 3, color: '#C9A227' }).select('id').single();
  assert(!planErr && plan, 'Création contrat "3x/semaine"', planErr);
  if (plan) cleanup.plans.push(plan.id);

  // ASSIGN plan to member
  const { error: assignErr } = await db.from('box_members').update({ plan_id: plan?.id ?? null }).eq('member_id', m.id).eq('box_id', box.id);
  assert(!assignErr, `Assignation contrat → ${m.username}`, assignErr);

  // UNASSIGN plan
  await db.from('box_members').update({ plan_id: null }).eq('member_id', m.id).eq('box_id', box.id);
  ok('Plan désassigné');
}

// ── Suite 3 — Actualités ──────────────────────────────────────────────────────
async function suiteArticles() {
  sep('Actualités (articles)');

  // CREATE
  const { data: art, error: cErr } = await db.from('box_articles').insert({
    box_id: box.id, author_id: ownerId, title: `[TEST] Article ${TAG}`, body: 'Contenu de test automatique.', image_url: null,
  }).select('id').single();
  assert(!cErr && art, 'CREATE article', cErr);
  if (art) cleanup.articles.push(art.id);

  // READ
  const { data: artRead } = await db.from('box_articles').select('title, body').eq('id', art?.id).single();
  assert(artRead?.title === `[TEST] Article ${TAG}`, 'READ article OK');

  // UPDATE
  const { error: uErr } = await db.from('box_articles').update({ title: `[TEST] Article UPDATED ${TAG}`, body: 'Contenu mis à jour.' }).eq('id', art?.id);
  assert(!uErr, 'UPDATE article (titre + corps)', uErr);

  // Verify update
  const { data: artUp } = await db.from('box_articles').select('title').eq('id', art?.id).single();
  assert(artUp?.title?.includes('UPDATED'), `Titre mis à jour: "${artUp?.title}"`);
}

// ── Suite 4 — Horaires ────────────────────────────────────────────────────────
async function suiteSchedules() {
  sep('Horaires (class schedules)');
  const today = new Date().toISOString().split('T')[0];

  // CREATE
  const { data: sched, error: cErr } = await db.from('class_schedules').insert({
    box_id: box.id, title: `[TEST] WOD ${TAG}`, description: 'Test créneau automatique',
    coach: 'Coach Test', scheduled_date: today, start_time: '09:00', end_time: '10:00', max_capacity: 15,
  }).select('id').single();
  assert(!cErr && sched, 'CREATE créneau', cErr);
  if (sched) cleanup.schedules.push(sched.id);

  // READ
  const { data: sr } = await db.from('class_schedules').select('title, max_capacity').eq('id', sched?.id).single();
  assert(sr?.max_capacity === 15, `READ: capacity=15 ✓`);

  // UPDATE max_capacity + coach
  const { error: uErr } = await db.from('class_schedules').update({ max_capacity: 20, coach: 'Coach Updated' }).eq('id', sched?.id);
  assert(!uErr, 'UPDATE créneau (capacity 15→20, coach)', uErr);

  const { data: su } = await db.from('class_schedules').select('max_capacity, coach').eq('id', sched?.id).single();
  assert(su?.max_capacity === 20, `Capacity mise à jour: ${su?.max_capacity}`);
  assert(su?.coach === 'Coach Updated', `Coach mis à jour`);
}

// ── Suite 5 — Whiteboard ─────────────────────────────────────────────────────
async function suiteWODs() {
  sep('Whiteboard (box WODs)');
  const today = new Date().toISOString().split('T')[0];

  // CREATE (draft)
  const { data: wod, error: cErr } = await db.from('box_wods').insert({
    box_id: box.id, created_by: ownerId,
    title: `[TEST] WOD ${TAG}`, description: '5 rounds: 10 burpees, 10 thrusters', wod_type: 'for-time',
    scheduled_date: today, time_cap_seconds: 1200, rounds: 5, is_published: false, sort_order: 0,
  }).select('id').single();
  assert(!cErr && wod, 'CREATE WOD (brouillon)', cErr);
  if (wod) cleanup.wods.push(wod.id);

  // READ
  const { data: wr } = await db.from('box_wods').select('title, is_published').eq('id', wod?.id).single();
  assert(wr?.is_published === false, 'WOD non publié par défaut');

  // PUBLISH
  const { error: pubErr } = await db.from('box_wods').update({ is_published: true }).eq('id', wod?.id);
  assert(!pubErr, 'PUBLISH WOD', pubErr);
  const { data: wp } = await db.from('box_wods').select('is_published').eq('id', wod?.id).single();
  assert(wp?.is_published === true, 'Publié ✓');

  // UPDATE title
  const { error: uErr } = await db.from('box_wods').update({ title: `[TEST] WOD UPDATED ${TAG}`, rounds: 7 }).eq('id', wod?.id);
  assert(!uErr, 'UPDATE WOD (titre, rounds 5→7)', uErr);

  // UNPUBLISH
  const { error: unpubErr } = await db.from('box_wods').update({ is_published: false }).eq('id', wod?.id);
  assert(!unpubErr, 'UNPUBLISH WOD', unpubErr);
  const { data: wu } = await db.from('box_wods').select('is_published, rounds').eq('id', wod?.id).single();
  assert(wu?.is_published === false, 'Non publié ✓');
  assert(wu?.rounds === 7, 'Rounds = 7 ✓');
}

// ── Suite 6 — Programmation ───────────────────────────────────────────────────
async function suitePrograms() {
  sep('Programmation (programmes + WODs)');
  const code = `BO${TAG.slice(-6)}`;

  // CREATE program
  const { data: prog, error: pErr } = await db.from('programs').insert({
    box_id: box.id, owner_id: ownerId,
    title: `[TEST] Programme ${TAG}`, description: 'Programme test automatique',
    price_cents: 0, currency: 'EUR', type: 'fixed',
    duration_weeks: 6, days_per_week: 5,
    invite_code: code, is_active: true,
  }).select('id').single();
  assert(!pErr && prog, 'CREATE programme', pErr);
  if (prog) cleanup.programs.push(prog.id);

  // ADD WOD to program — chemin canonique : un box_wods daté, rattaché par
  // wod_program_access. Le contenu d'un programme n'a plus de schéma à lui.
  const { data: pw, error: pwErr } = await db.from('box_wods').insert({
    box_id: box.id, scheduled_date: new Date().toISOString().slice(0, 10),
    title: 'Jour 1 — Squat', description: '5x5 Back Squat 80%', wod_type: 'strength',
    sort_order: 0, is_published: true,
  }).select('id').single();
  assert(!pwErr && pw, 'ADD WOD au programme (box_wods)', pwErr);

  const { error: linkErr } = await db.from('wod_program_access')
    .insert({ wod_id: pw?.id, program_id: prog?.id });
  assert(!linkErr, 'RATTACHER le WOD au programme (wod_program_access)', linkErr);

  // READ WOD count
  const { count: wodCount } = await db.from('wod_program_access')
    .select('wod_id', { count: 'exact', head: true }).eq('program_id', prog?.id);
  assert(wodCount === 1, `Programme: ${wodCount} WOD attaché`);

  // UPDATE program (deactivate)
  const { error: deactErr } = await db.from('programs').update({ is_active: false }).eq('id', prog?.id);
  assert(!deactErr, 'DEACTIVATE programme', deactErr);
  const { data: pr } = await db.from('programs').select('is_active').eq('id', prog?.id).single();
  assert(pr?.is_active === false, 'Programme désactivé ✓');

  // DELETE program WOD
  const { error: delWodErr } = await db.from('box_wods').delete().eq('id', pw?.id);
  assert(!delWodErr, 'DELETE WOD du programme', delWodErr);
}

// ── Suite 7 — Groupes ─────────────────────────────────────────────────────────
async function suiteGroups() {
  sep('Groupes');
  const m = members[1]; if (!m) { fail('Pas de member agent 2'); return; }

  // CREATE group
  const { data: group, error: gErr } = await db.from('message_groups').insert({
    box_id: box.id, name: `[TEST] Groupe ${TAG}`, color: '#3B82F6', wod_visibility_mode: 'weekly', members: [],
  }).select('id').single();
  assert(!gErr && group, 'CREATE groupe', gErr);
  if (group) cleanup.groups.push(group.id);

  // ADD member
  const { error: amErr } = await db.from('message_group_members').insert({ member_id: m.id, group_id: group?.id });
  assert(!amErr, `ADD membre "${m.username}" au groupe`, amErr);

  // READ membership
  const { count: mc } = await db.from('message_group_members').select('*', { count: 'exact', head: true }).eq('group_id', group?.id);
  assert(mc === 1, `Groupe: ${mc} membre`);

  // UPDATE group name + color
  const { error: ugErr } = await db.from('message_groups').update({ name: `[TEST] Groupe UPDATED ${TAG}`, color: '#EF4444' }).eq('id', group?.id);
  assert(!ugErr, 'UPDATE groupe (nom + couleur)', ugErr);

  // REMOVE member
  const { error: rmErr } = await db.from('message_group_members').delete().eq('member_id', m.id).eq('group_id', group?.id);
  assert(!rmErr, `REMOVE membre du groupe`, rmErr);
  const { count: mc2 } = await db.from('message_group_members').select('*', { count: 'exact', head: true }).eq('group_id', group?.id);
  assert(mc2 === 0, `Groupe vide après retrait ✓`);
}

// ── Suite 8 — Tournois ────────────────────────────────────────────────────────
async function suiteTournaments() {
  sep('Tournois (création → WOD → participants → scores → validate/reject → close → delete)');
  const today = new Date().toISOString().split('T')[0];

  // CREATE tournament (classique)
  const { data: t, error: tErr } = await db.from('tournaments').insert({
    box_id: box.id, created_by: ownerId,
    name: `[TEST-BO] Tournoi ${TAG}`,
    description: 'Test BO owner complet', status: 'open', level: 'rx', format: 'simple',
    start_date: today,
    end_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    max_participants: 10,
  }).select('id').single();
  assert(!tErr && t, 'CREATE tournoi (simple)', tErr);

  // ADD WOD
  const { data: wod, error: wErr } = await db.from('tournament_wods').insert({
    tournament_id: t?.id, order_index: 1, title: 'WOD BO Test', type: 'AMRAP', duration_minutes: 10,
    movements: '[]', scoring: 'Reps', status: 'active',
  }).select('id').single();
  assert(!wErr && wod, 'ADD WOD au tournoi', wErr);

  // ADD participants (3 members)
  let added = 0;
  for (const m of members) {
    const { error } = await db.from('tournament_participants').insert({ tournament_id: t?.id, athlete_id: m.id, score: 0 });
    if (!error) added++;
  }
  assert(added === 3, `ADD ${added}/3 participants`, null);

  // SUBMIT 3 scores (pending)
  const scores = [155, 130, 110];
  const scoreIds = [];
  for (let i = 0; i < members.length; i++) {
    const { data: s, error } = await db.from('tournament_scores').insert({
      tournament_id: t?.id, tournament_wod_id: wod?.id, athlete_id: members[i].id,
      score_value: String(scores[i]), status: 'pending',
    }).select('id').single();
    if (!error && s) scoreIds.push(s.id);
  }
  assert(scoreIds.length === 3, `SUBMIT 3 scores (pending)`, null);

  const { count: pending } = await db.from('tournament_scores').select('*', { count: 'exact', head: true }).in('id', scoreIds).eq('status', 'pending');
  assert(pending === 3, `Scores en attente: ${pending}`);

  // VALIDATE score[0]
  const { error: valErr } = await db.from('tournament_scores').update({ status: 'validated' }).eq('id', scoreIds[0]);
  assert(!valErr, `VALIDATE score de ${members[0].username}`, valErr);

  // REJECT score[1]
  const { error: rejErr } = await db.from('tournament_scores').update({ status: 'rejected' }).eq('id', scoreIds[1]);
  assert(!rejErr, `REJECT score de ${members[1].username}`, rejErr);

  // Verify distribution
  const { data: dist } = await db.from('tournament_scores').select('status').in('id', scoreIds);
  const statuses = (dist ?? []).map(s => s.status);
  assert(statuses.includes('validated') && statuses.includes('rejected') && statuses.includes('pending'), `Statuts: validated/rejected/pending ✓`);

  // READ leaderboard
  const { data: lb } = await db.from('tournament_participants').select('athlete_id, score').eq('tournament_id', t?.id).order('score', { ascending: false });
  assert(lb && lb.length === 3, `Leaderboard: ${lb?.length} participants`);

  // CLOSE tournament
  const { error: closeErr } = await db.from('tournaments').update({ status: 'completed' }).eq('id', t?.id);
  assert(!closeErr, 'CLOSE tournoi (status=completed)', closeErr);
  const { data: closed } = await db.from('tournaments').select('status').eq('id', t?.id).single();
  assert(closed?.status === 'completed', `Statut: ${closed?.status}`);

  // DELETE tournament
  const { error: delErr } = await db.from('tournaments').delete().eq('id', t?.id);
  assert(!delErr, 'DELETE tournoi', delErr);
  const { data: gone } = await db.from('tournaments').select('id').eq('id', t?.id).maybeSingle();
  assert(!gone, 'Tournoi supprimé de la DB ✓');
}

// ── Suite 9 — Dashboard KPIs ─────────────────────────────────────────────────
async function suiteDashboard() {
  sep('Dashboard KPIs');

  const { count: activeTournaments } = await db.from('tournaments').select('*', { count: 'exact', head: true }).eq('box_id', box.id).in('status', ['open', 'active']);
  assert(activeTournaments !== null, `Tournois actifs: ${activeTournaments}`);

  const { count: membersCount } = await db.from('box_members').select('*', { count: 'exact', head: true }).eq('box_id', box.id).eq('status', 'active');
  assert(membersCount !== null && membersCount >= 3, `Membres actifs: ${membersCount} (≥3 attendus)`);

  const { data: tournIds } = await db.from('tournaments').select('id').eq('box_id', box.id);
  if (tournIds && tournIds.length > 0) {
    const ids = tournIds.map(t => t.id);
    const { count: pendingCount } = await db.from('tournament_scores').select('*', { count: 'exact', head: true }).in('tournament_id', ids).eq('status', 'pending');
    assert(pendingCount !== null, `Scores en attente: ${pendingCount}`);
  } else {
    ok('Pas de tournoi actif → scores en attente = 0');
  }

  const { count: wodsCount } = await db.from('box_wods').select('*', { count: 'exact', head: true }).eq('box_id', box.id);
  assert(wodsCount !== null, `WODs box: ${wodsCount}`);

  const { count: articlesCount } = await db.from('box_articles').select('*', { count: 'exact', head: true }).eq('box_id', box.id);
  assert(articlesCount !== null, `Articles: ${articlesCount}`);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function doCleanup() {
  console.log('\n── Cleanup ──────────────────────────────────────────────────────────────────');

  for (const id of cleanup.articles)  await db.from('box_articles').delete().eq('id', id);
  if (cleanup.articles.length)         ok(`${cleanup.articles.length} article(s) supprimé(s)`);

  for (const id of cleanup.schedules) await db.from('class_schedules').delete().eq('id', id);
  if (cleanup.schedules.length)        ok(`${cleanup.schedules.length} créneau(x) supprimé(s)`);

  for (const id of cleanup.wods)      await db.from('box_wods').delete().eq('id', id);
  if (cleanup.wods.length)             ok(`${cleanup.wods.length} WOD(s) supprimé(s)`);

  for (const id of cleanup.programs)  { await db.from('wod_program_access').delete().eq('program_id', id); await db.from('programs').delete().eq('id', id); }
  if (cleanup.programs.length)         ok(`${cleanup.programs.length} programme(s) supprimé(s)`);

  for (const id of cleanup.groups)    { await db.from('message_group_members').delete().eq('group_id', id); await db.from('message_groups').delete().eq('id', id); }
  if (cleanup.groups.length)           ok(`${cleanup.groups.length} groupe(s) supprimé(s)`);

  for (const id of cleanup.plans)     await db.from('membership_plans').delete().eq('id', id);
  if (cleanup.plans.length)            ok(`${cleanup.plans.length} contrat(s) supprimé(s)`);

  // Remove test members from box, then delete auth users
  for (const id of cleanup.memberIds) await db.from('box_members').delete().eq('member_id', id).eq('box_id', box.id);
  for (const id of cleanup.memberIds) await db.auth.admin.deleteUser(id);
  if (cleanup.memberIds.length)        ok(`${cleanup.memberIds.length} member agents supprimés`);

}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   AthleX — Back Office Owner · Toutes les actions possibles             ║');
  console.log(`║   Tag: ${TAG.padEnd(62)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  onCleanup(doCleanup);
  try {
    await setup();
    await suiteSettings();
    await suiteMembers();
    await suiteArticles();
    await suiteSchedules();
    await suiteWODs();
    await suitePrograms();
    await suiteGroups();
    await suiteTournaments();
    await suiteDashboard();
  } finally {
    await runCleanup();
  }

  const total = passed + failed;
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  RÉSULTATS  ${passed} ✅ · ${failed} ❌ · ${total} total`);
  console.log(`${'═'.repeat(72)}\n`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('\n💥 Fatal:', e.message); runCleanup().finally(() => process.exit(1)); });
