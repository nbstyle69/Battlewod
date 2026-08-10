// Protocole « attribution des badges côté serveur » (20261018) — pile jetable, vrais JWT.
//
// Deux choses à prouver :
//   • la lecture des badges n'est plus ouverte à anon ;
//   • l'athlète déclenche mais le serveur décide : claim_badge() ne pose un
//     badge que si la condition est réellement vérifiée sur des données que
//     l'athlète ne peut pas écrire, est idempotente, et ne permet à personne de
//     réclamer pour autrui (elle ne prend pas d'identifiant d'athlète).
//
// Le chemin owner (crédit de badge à la validation d'un score / à la clôture)
// doit rester intact — il est scopé par is_box_admin_of_athlete() (20261017).
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.TEST_DB_URL;
if (!URL || !ANON || !SERVICE || !DB) { console.error('Variables TEST_* manquantes'); process.exit(1); }
if (URL.includes('lkwdlqlbrbxaiydkoxfp') || DB.includes('lkwdlqlbrbxaiydkoxfp')) {
  console.error('❌ Cible = PRODUCTION — refusé'); process.exit(1);
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const sql = q => execFileSync('psql', [DB, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf-8' }).trim();

let ok = 0, ko = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

const stamp = Date.now();
const created = { users: [], boxes: [], tournaments: [], catalog: [] };

// La pile jetable rejoue le schéma, pas les données : on sème les entrées du
// catalogue dont le protocole a besoin (elles existent toutes en prod).
const CATALOG = [
  ['level_scaled', 'Classement'], ['level_rx', 'Classement'], ['level_elite', 'Classement'],
  ['level_pro', 'Classement'], ['first_win', 'tournament'], ['champion_5', 'tournament'],
  ['podium', 'tournament'], ['first_score', 'wod'], ['timer_50', 'wod'],
  ['wod_gen_100', 'wod'], ['streak_1w', 'activity'],
];

const mkUser = async (suffix, role = 'member', elo = 1000) => {
  const email = `zz_bdg_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_bdg_${suffix}_${stamp}`,
    level: 'inter', role, elo,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, client };
};

const claim = async (user, key) => {
  const { data, error } = await user.client.rpc('claim_badge', { p_badge_key: key });
  return { data, error };
};
const hasBadge = async (id, key) => {
  const { data } = await svc.from('athlete_badges').select('id').eq('athlete_id', id).eq('badge_key', key);
  return (data?.length ?? 0) > 0;
};

try {
  for (const [key, category] of CATALOG) {
    const { error } = await svc.from('badges_catalog').upsert({
      badge_key: key, title: key, description: key, category,
    }, { onConflict: 'badge_key' });
    if (error) throw error;
    created.catalog.push(key);
  }

  const owner = await mkUser('owner', 'box_owner');
  const athlete = await mkUser('athlete', 'member', 1000);   // ELO plancher : aucun palier
  const climber = await mkUser('grimpeur', 'member', 1500);  // ELO 1500 : inter + rx, pas rx+
  const intruder = await mkUser('intrus', 'member', 1000);

  const { data: box, error: bErr } = await svc.from('boxes').insert({
    owner_id: owner.id, name: `ZZ BDG ${stamp}`, slug: `zz-bdg-${stamp}`,
    invite_code: `ZB${String(stamp).slice(-5)}`, is_active: true, is_listed: true,
  }).select('id').single();
  if (bErr) throw bErr;
  created.boxes.push(box.id);
  await svc.from('box_members').insert([
    { box_id: box.id, member_id: owner.id, role: 'owner', status: 'active' },
    { box_id: box.id, member_id: athlete.id, role: 'member', status: 'active' },
    { box_id: box.id, member_id: climber.id, role: 'member', status: 'active' },
  ]);

  // ── 1. Lecture : anon ne lit plus la gamification de personne ─────────────

  await svc.from('athlete_badges').insert({ athlete_id: athlete.id, badge_key: 'first_win' });

  const pol = sql(`SELECT coalesce(string_agg(policyname||':'||coalesce(array_to_string(roles,'+'),'')||':'||coalesce(qual,''), ', ' ORDER BY policyname), 'aucune')
                     FROM pg_policies
                    WHERE schemaname='public' AND tablename='athlete_badges' AND cmd='SELECT'
                      AND coalesce(qual,'') = 'true'`);
  check('inventaire — plus aucune policy SELECT en USING (true) ouverte à public sur athlete_badges',
    !pol.includes('{public}') && !pol.includes(':public:'), pol);

  const { data: anonRead } = await anon.from('athlete_badges').select('badge_key');
  check('anon — lecture des badges : REFUSÉE', (anonRead?.length ?? 0) === 0, `${anonRead?.length ?? 0} ligne(s)`);

  const { data: authRead } = await climber.client.from('athlete_badges').select('badge_key').eq('athlete_id', athlete.id);
  check('authenticated — lecture des badges d\'un autre athlète : toujours acceptée (profils publics in-app)',
    (authRead?.length ?? 0) === 1, `${authRead?.length ?? 0} ligne(s)`);

  await svc.from('athlete_badges').delete().eq('athlete_id', athlete.id);

  // ── 2. L'écriture directe reste fermée à l'athlète ────────────────────────

  const { error: selfInsert } = await athlete.client.from('athlete_badges')
    .insert({ athlete_id: athlete.id, badge_key: 'level_pro' });
  check('athlète — INSERT direct d\'un badge pour lui-même : REFUSÉ (chemin client supprimé)',
    !!selfInsert, selfInsert?.message ?? 'accepté (!)');

  const { error: otherInsert } = await intruder.client.from('athlete_badges')
    .insert({ athlete_id: athlete.id, badge_key: 'level_pro' });
  check('tiers — INSERT direct d\'un badge pour autrui : REFUSÉ',
    !!otherInsert, otherInsert?.message ?? 'accepté (!)');

  // ── 3. claim_badge : condition remplie / non remplie ──────────────────────

  const rSelf = await claim(athlete, 'level_scaled');
  check('claim_badge — badge de bienvenue (condition remplie) : POSÉ',
    rSelf.data?.awarded === true && await hasBadge(athlete.id, 'level_scaled'),
    rSelf.error?.message ?? JSON.stringify(rSelf.data));

  const rNo = await claim(athlete, 'level_pro');
  check('claim_badge — palier ELO non atteint (1000 < 1800) : REFUSÉ',
    rNo.data?.awarded === false && rNo.data?.reason === 'condition_non_remplie'
      && !(await hasBadge(athlete.id, 'level_pro')),
    JSON.stringify(rNo.data ?? rNo.error?.message));

  const rYes = await claim(climber, 'level_rx');
  const rNext = await claim(climber, 'level_elite');
  check('claim_badge — palier ELO atteint (1500 ≥ 1200) : POSÉ',
    rYes.data?.awarded === true, JSON.stringify(rYes.data ?? rYes.error?.message));
  check('claim_badge — palier immédiatement supérieur (1500 < 1600) : REFUSÉ',
    rNext.data?.awarded === false, JSON.stringify(rNext.data ?? rNext.error?.message));

  // L'ELO est figé par prevent_role_escalation : l'athlète ne peut pas se
  // hisser au palier suivant pour forcer la condition.
  const { error: eloErr } = await climber.client.from('profiles').update({ elo: 2000 }).eq('id', climber.id);
  const { data: eloAfter } = await svc.from('profiles').select('elo').eq('id', climber.id).single();
  const rForged = await claim(climber, 'level_pro');
  check('athlète — tentative de forger la condition en montant son propre ELO : sans effet',
    eloAfter?.elo === 1500 && rForged.data?.awarded === false,
    `error=${eloErr?.message ?? 'aucune'} · elo=${eloAfter?.elo} · claim=${JSON.stringify(rForged.data)}`);

  // ── 4. Idempotence ────────────────────────────────────────────────────────

  const rAgain = await claim(athlete, 'level_scaled');
  const { count } = await svc.from('athlete_badges')
    .select('id', { count: 'exact', head: true })
    .eq('athlete_id', athlete.id).eq('badge_key', 'level_scaled');
  check('claim_badge — re-réclamation : idempotente (ok, awarded=false, 1 seule ligne)',
    rAgain.data?.ok === true && rAgain.data?.awarded === false && count === 1,
    `${JSON.stringify(rAgain.data)} · ${count} ligne(s)`);

  // ── 5. Réclamer pour autrui est impossible par construction ───────────────

  const sig = sql(`SELECT pg_get_function_identity_arguments(oid) FROM pg_proc
                    WHERE proname='claim_badge' AND pronamespace='public'::regnamespace`);
  check('claim_badge — la signature ne porte aucun identifiant d\'athlète', sig === 'p_badge_key text', sig);

  const rIntruder = await claim(intruder, 'level_scaled');
  const intruderGotOwn = await hasBadge(intruder.id, 'level_scaled');
  const athleteUntouched = (await svc.from('athlete_badges').select('badge_key').eq('athlete_id', athlete.id)).data?.length;
  check('tiers — sa réclamation ne pose un badge que sur SON profil',
    rIntruder.data?.awarded === true && intruderGotOwn && athleteUntouched === 1,
    `intrus=${intruderGotOwn} · athlète=${athleteUntouched} badge(s)`);

  const { error: anonClaim } = await anon.rpc('claim_badge', { p_badge_key: 'level_scaled' });
  check('anon — appel de claim_badge : REFUSÉ', !!anonClaim, anonClaim?.message ?? 'accepté (!)');

  // ── 6. Conditions adossées à des données réelles ──────────────────────────

  const rWin = await claim(climber, 'first_win');
  check('claim_badge — « première victoire » sans palmarès : REFUSÉE',
    rWin.data?.awarded === false, JSON.stringify(rWin.data));

  const { data: tour, error: tErr } = await svc.from('tournaments').insert({
    name: `ZZ BDG ${stamp}`, level: 'rx', status: 'completed', box_id: box.id,
    created_by: owner.id, format: 'simple', max_participants: 16,
  }).select('id').single();
  if (tErr) throw tErr;
  created.tournaments.push(tour.id);
  const { error: hErr } = await svc.from('tournament_elo_history').insert({
    tournament_id: tour.id, athlete_id: climber.id, final_rank: 1,
    elo_before: 1500, elo_after: 1520, elo_change: 20, participants_count: 8,
    avg_opponent_elo: 1450,
  });
  if (hErr) throw hErr;

  const rWin2 = await claim(climber, 'first_win');
  check('claim_badge — « première victoire » avec un rang 1 réel à l\'historique d\'ELO : POSÉE',
    rWin2.data?.awarded === true, JSON.stringify(rWin2.data));

  const rChampion = await claim(climber, 'champion_5');
  check('claim_badge — « 5 victoires » avec une seule : REFUSÉE',
    rChampion.data?.awarded === false, JSON.stringify(rChampion.data));

  const rPodium = await claim(climber, 'podium');
  check('claim_badge — « podium » dérivé du même rang réel : POSÉ',
    rPodium.data?.awarded === true, JSON.stringify(rPodium.data));

  const rFirstScore = await claim(athlete, 'first_score');
  check('claim_badge — « premier score » sans aucun score en base : REFUSÉE',
    rFirstScore.data?.awarded === false, JSON.stringify(rFirstScore.data));

  const { data: wod, error: wErr } = await svc.from('tournament_wods').insert({
    tournament_id: tour.id, title: `ZZ BDG WOD ${stamp}`, type: 'For Time',
    duration_minutes: 12, status: 'active',
  }).select('id').single();
  if (wErr) throw wErr;
  await svc.from('tournament_scores').insert({
    tournament_id: tour.id, tournament_wod_id: wod.id, athlete_id: athlete.id,
    score_value: '300', status: 'pending',
  });

  const rFirstScore2 = await claim(athlete, 'first_score');
  check('claim_badge — « premier score » avec une ligne de score réelle : POSÉE',
    rFirstScore2.data?.awarded === true, JSON.stringify(rFirstScore2.data));

  // ── 7. Badges sans source serveur fiable : jamais réclamables ─────────────

  for (const key of ['timer_50', 'wod_gen_100', 'streak_1w']) {
    await svc.from('profiles').update({
      total_timer_sessions: 9999, total_wods_generated: 9999,
    }).eq('id', athlete.id);
    const r = await claim(athlete, key);
    check(`claim_badge — « ${key} » (compteur client, non vérifiable) : REFUSÉ malgré un compteur gonflé`,
      r.data?.awarded === false, JSON.stringify(r.data));
  }

  const rUnknown = await claim(athlete, 'badge_qui_nexiste_pas');
  check('claim_badge — badge hors catalogue : REFUSÉ',
    rUnknown.data?.awarded === false && rUnknown.data?.reason === 'badge_inconnu',
    JSON.stringify(rUnknown.data));

  // ── 8. Le chemin owner reste intact ───────────────────────────────────────

  const { error: ownerAward } = await owner.client.from('athlete_badges')
    .insert({ athlete_id: athlete.id, badge_key: 'podium' });
  check('owner de la box — crédit direct d\'un badge à son adhérent : toujours accepté (chemin BOTournamentScreen)',
    !ownerAward, ownerAward?.message ?? 'accepté');

  const { data: ownerRead } = await owner.client.from('athlete_badges').select('badge_key').eq('athlete_id', athlete.id);
  check('owner de la box — relecture des badges de son adhérent : toujours acceptée',
    (ownerRead?.length ?? 0) >= 1, `${ownerRead?.length ?? 0} ligne(s)`);

  // ── 9. Grants sur les fonctions ───────────────────────────────────────────

  const grants = sql(`SELECT coalesce(string_agg(p.proname||':'||pg_get_userbyid(a.grantee), ', ' ORDER BY 1), 'aucun')
                        FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
                       WHERE p.pronamespace='public'::regnamespace
                         AND p.proname IN ('claim_badge','badge_condition_met')
                         AND pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role','public')`);
  check('grants — badge_condition_met n\'est exposée à aucun rôle client, claim_badge ne l\'est pas à anon',
    !grants.includes('badge_condition_met') && !grants.includes('claim_badge:anon')
      && grants.includes('claim_badge:authenticated'), grants);
} catch (err) {
  console.error('❌ protocole interrompu :', err?.message ?? err);
  ko++;
} finally {
  for (const id of created.tournaments) {
    await svc.from('tournament_scores').delete().eq('tournament_id', id);
    await svc.from('tournament_elo_history').delete().eq('tournament_id', id);
    await svc.from('tournament_wods').delete().eq('tournament_id', id);
  }
  await svc.from('tournaments').delete().in('id', created.tournaments.length ? created.tournaments : ['00000000-0000-0000-0000-000000000000']);
  for (const boxId of created.boxes) {
    await svc.from('box_members').delete().eq('box_id', boxId);
    await svc.from('boxes').delete().eq('id', boxId);
  }
  for (const id of created.users) {
    await svc.from('athlete_badges').delete().eq('athlete_id', id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }
  if (created.catalog.length) await svc.from('badges_catalog').delete().in('badge_key', created.catalog);
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
