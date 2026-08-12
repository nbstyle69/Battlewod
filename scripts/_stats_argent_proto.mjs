// Protocole « Statistiques — lot 1 Argent » (20261025).
//
// Frontières à prouver, au vrai JWT :
//   • le gérant et le coach de LA box lisent les agrégats ;
//   • le gérant d'une AUTRE box est REFUSÉ (exception, pas zéro ligne) ;
//   • un athlète de la box et anon sont refusés ;
//   • aucune donnée d'une autre box ne fuit dans les agrégats ;
//   • exactitude : MRR, formules, impayés, comptoir, résiliations, programmes ;
//   • la voie fermée reste fermée : les colonnes d'argent de box_members ne sont
//     toujours pas lisibles directement par `authenticated`.
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
const created = { users: [], boxes: [] };

const mkUser = async (suffix, role = 'member') => {
  const email = `zz_money_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_money_${suffix}_${stamp}`, level: 'inter', role, elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, email, client };
};

const iso = d => new Date(d).toISOString();
const now = Date.now();
const FROM = iso(now - 30 * 86400000);
const TO = iso(now + 86400000);

try {
  const ownerA = await mkUser('ownerA', 'box_owner');
  const ownerB = await mkUser('ownerB', 'box_owner');
  const coachA = await mkUser('coachA');
  const athleteA = await mkUser('athleteA');

  const mkBox = async (owner, tag) => {
    const { data, error } = await svc.from('boxes').insert({
      owner_id: owner.id, name: `ZZ MONEY ${tag} ${stamp}`, slug: `zz-money-${tag}-${stamp}`,
      invite_code: `ZM${tag}${String(stamp).slice(-4)}`, is_active: true, is_listed: true, city: 'Lyon',
    }).select('id').single();
    if (error) throw error;
    created.boxes.push(data.id);
    return data.id;
  };
  const boxA = await mkBox(ownerA, 'A');
  const boxB = await mkBox(ownerB, 'B');

  const mkPlan = async (boxId, name, cents, order) => {
    const { data, error } = await svc.from('membership_plans').insert({
      box_id: boxId, name, price_cents: cents, currency: 'eur', is_active: true,
      plan_type: 'subscription', sort_order: order, color: '#FFFFFF',
    }).select('id').single();
    if (error) throw error;
    return data.id;
  };
  const planA1 = await mkPlan(boxA, 'ZZ 2x', 6900, 1);
  const planA2 = await mkPlan(boxA, 'ZZ Illimité', 9900, 2);
  const planB1 = await mkPlan(boxB, 'ZZ B', 12900, 1);

  // Membres de la box A : 2 abos Stripe, 1 abo comptoir, 1 impayé.
  const mkMember = async (boxId, planId, opts) => {
    const u = await mkUser(`m${Math.random().toString(36).slice(2, 7)}`);
    const { data, error } = await svc.from('box_members').insert({
      box_id: boxId, member_id: u.id, role: 'member', status: 'active',
      plan_id: planId, subscription_status: 'active', ...opts,
    }).select('id').single();
    if (error) throw error;
    return { ...u, boxMemberId: data.id };
  };

  await mkMember(boxA, planA1, { stripe_subscription_id: `sub_zz1_${stamp}`, amount_cents: 6900 });
  await mkMember(boxA, planA2, { stripe_subscription_id: `sub_zz2_${stamp}`, amount_cents: 9900 });
  await mkMember(boxA, planA1, { amount_cents: 6900 });                       // comptoir : pas de sub Stripe
  // Impayé : le webhook Stripe bascule le membre en `past_due`, il n'est donc
  // PLUS `active`. Le fixture doit refléter ça, sinon le protocole valide un
  // agrégat qui ne trouverait jamais rien en production.
  const dunned = await mkMember(boxA, planA2, {
    subscription_status: 'past_due',
    stripe_subscription_id: `sub_zz3_${stamp}`, amount_cents: 9900,
    past_due_since: iso(now - 5 * 86400000), dunning_attempts: 2,
    last_payment_error: 'card_declined',
  });
  // Box B : montant volontairement énorme, il ne doit jamais apparaître côté A.
  await mkMember(boxB, planB1, { stripe_subscription_id: `sub_zzB_${stamp}`, amount_cents: 12900 });

  await svc.from('box_members').insert({
    box_id: boxA, member_id: coachA.id, role: 'coach', status: 'active',
  });
  await svc.from('box_members').insert({
    box_id: boxA, member_id: athleteA.id, role: 'member', status: 'active',
  });

  // Invitations comptoir non encaissées (une par box) + une révoquée (ignorée).
  const mkInvit = async (boxId, planId, owner, extra = {}) => {
    const { error } = await svc.from('box_invitations').insert({
      box_id: boxId, email: `zz_inv_${Math.random().toString(36).slice(2, 7)}@test.athlex.io`,
      first_name: 'ZZ', last_name: 'Comptoir', plan_id: planId, payment_mode: 'box',
      cash_collected: false, token_hash: `h_${Math.random().toString(36).slice(2)}`,
      status: 'pending', expires_at: iso(now + 7 * 86400000), created_by: owner.id, ...extra,
    });
    if (error) throw error;
  };
  await mkInvit(boxA, planA1, ownerA);
  await mkInvit(boxA, planA2, ownerA, { status: 'revoked' });
  await mkInvit(boxB, planB1, ownerB);

  const call = (client, fn, args) => client.rpc(fn, args);
  const sumArgs = { p_box_id: boxA, p_from: FROM, p_to: TO };

  // ── Lecture autorisée ─────────────────────────────────────────────────────
  const { data: sA, error: eA } = await call(ownerA.client, 'get_box_money_summary', sumArgs);
  const rowA = Array.isArray(sA) ? sA[0] : sA;
  check('le gérant de la box lit la synthèse', !eA && !!rowA, eA?.message ?? '');

  const { error: eCoach } = await call(coachA.client, 'get_box_money_summary', sumArgs);
  check('le coach de la box lit la synthèse', !eCoach, eCoach?.message ?? '');

  // ── Exactitude ────────────────────────────────────────────────────────────
  check('MRR Stripe = 6900+9900 (l\'impayé n\'est pas du MRR)',
    Number(rowA.mrr_stripe_cents) === 16800, `${rowA.mrr_stripe_cents}`);
  check('2 abonnements Stripe comptés', rowA.mrr_stripe_subs === 2, `${rowA.mrr_stripe_subs}`);
  check('MRR comptoir isolé = 6900', Number(rowA.mrr_cash_cents) === 6900, `${rowA.mrr_cash_cents}`);
  check('1 impayé, 9900 en jeu',
    rowA.past_due_count === 1 && Number(rowA.past_due_cents) === 9900,
    `${rowA.past_due_count}/${rowA.past_due_cents}`);
  check('1 invitation comptoir à encaisser (la révoquée est ignorée)',
    rowA.cash_to_collect_count === 1 && Number(rowA.cash_to_collect_cents) === 6900,
    `${rowA.cash_to_collect_count}/${rowA.cash_to_collect_cents}`);
  check('aucun euro de la box B dans les agrégats de A',
    Number(rowA.mrr_stripe_cents) + Number(rowA.mrr_cash_cents) === 23700,
    `total=${Number(rowA.mrr_stripe_cents) + Number(rowA.mrr_cash_cents)}`);

  // ── Comparaison de période : la fenêtre filtre bien les flux ──────────────
  const { data: sOld } = await call(ownerA.client, 'get_box_money_summary', {
    p_box_id: boxA, p_from: iso(now - 400 * 86400000), p_to: iso(now - 300 * 86400000),
  });
  const rowOld = Array.isArray(sOld) ? sOld[0] : sOld;
  check('période passée : 0 nouveau, mais le MRR courant reste un stock',
    rowOld.new_subs_period === 0 && Number(rowOld.mrr_stripe_cents) === 16800,
    `new=${rowOld.new_subs_period} mrr=${rowOld.mrr_stripe_cents}`);

  // ── Répartition par formule ───────────────────────────────────────────────
  const { data: plans } = await call(ownerA.client, 'get_box_plan_breakdown', { p_box_id: boxA });
  const byName = Object.fromEntries((plans ?? []).map(p => [p.plan_name, p]));
  check('répartition : l\'impayé ne compte pas dans sa formule',
    byName['ZZ Illimité']?.subs === 1, `${byName['ZZ Illimité']?.subs}`);
  check('répartition : 2 formules de la box A, aucune de B',
    (plans ?? []).length === 2 && !byName['ZZ B'], (plans ?? []).map(p => p.plan_name).join(','));
  check('répartition : 2x → 2 abonnés / 13800',
    byName['ZZ 2x']?.subs === 2 && Number(byName['ZZ 2x']?.mrr_cents) === 13800,
    `${byName['ZZ 2x']?.subs}/${byName['ZZ 2x']?.mrr_cents}`);

  // ── Les personnes derrière les chiffres ───────────────────────────────────
  const { data: people } = await call(ownerA.client, 'get_box_money_people', { p_box_id: boxA });
  const kinds = (people ?? []).map(p => p.kind).sort().join(',');
  check('liste nominative : 1 impayé + 1 comptoir', kinds === 'cash,past_due', kinds);
  const pd = (people ?? []).find(p => p.kind === 'past_due');
  check('l\'impayé porte le membre, le motif et le montant',
    pd?.member_id === dunned.id && pd?.detail === 'card_declined' && pd?.amount_cents === 9900,
    `${pd?.detail}/${pd?.amount_cents}`);

  // ── Refus ─────────────────────────────────────────────────────────────────
  const { error: eOther } = await call(ownerB.client, 'get_box_money_summary', sumArgs);
  check('le gérant d\'une AUTRE box est refusé', !!eOther, eOther?.code ?? '');

  const { error: eOtherPeople } = await call(ownerB.client, 'get_box_money_people', { p_box_id: boxA });
  check('le gérant d\'une autre box n\'obtient pas les personnes', !!eOtherPeople, eOtherPeople?.code ?? '');

  const { error: eAth } = await call(athleteA.client, 'get_box_money_summary', sumArgs);
  check('un athlète de la box est refusé', !!eAth, eAth?.code ?? '');

  const { error: eAnon } = await call(anon, 'get_box_money_summary', sumArgs);
  check('anon est refusé', !!eAnon, eAnon?.code ?? '');

  // ── La voie fermée le reste ───────────────────────────────────────────────
  const { error: eDirect } = await ownerA.client.from('box_members')
    .select('amount_cents, past_due_since').eq('box_id', boxA);
  check('les colonnes d\'argent restent illisibles en direct', !!eDirect, eDirect?.code ?? '');

  const grants = sql(`SELECT string_agg(DISTINCT r.rolname, ',' ORDER BY r.rolname)
                        FROM pg_proc p, aclexplode(p.proacl) a
                        JOIN pg_roles r ON r.oid = a.grantee
                       WHERE p.proname LIKE 'get_box_money%' OR p.proname = 'get_box_plan_breakdown'`);
  check('grants : pas d\'anon sur les RPC argent', !grants.split(',').includes('anon'), grants);

  const paths = sql(`SELECT count(*) FROM pg_proc
                      WHERE proname IN ('get_box_money_summary','get_box_plan_breakdown','get_box_money_people')
                        AND 'search_path=public, pg_temp' = ANY(proconfig)`);
  check('search_path figé sur les 3 RPC', paths === '3', paths);
} finally {
  for (const b of created.boxes) sql(`DELETE FROM boxes WHERE id = '${b}'`);
  for (const u of created.users) {
    await svc.auth.admin.deleteUser(u).catch(() => {});
    sql(`DELETE FROM profiles WHERE id = '${u}'`);
  }
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
