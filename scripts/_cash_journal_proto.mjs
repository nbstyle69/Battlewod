// Protocole « Journal des encaissements comptoir » (20261026).
//
// Frontières à prouver, au vrai JWT :
//   • le gérant journalise en encaissant une invitation, et le montant vient de
//     la FORMULE — il n'est jamais fourni par le client ;
//   • le même encaissement ne se journalise pas deux fois ;
//   • l'échéance d'un membre comptoir se déclare, celle d'un abonné Stripe non ;
//   • un gérant d'une AUTRE box n'écrit ni ne lit (exception / zéro ligne) ;
//   • athlète et anon refusés ;
//   • ajout seul : UPDATE et DELETE refusés, y compris en service_role, et
//     l'INSERT direct est fermé à `authenticated` ;
//   • la synthèse distingue l'encaissé PROUVÉ du MRR comptoir théorique, et
//     filtre bien par période.
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
const sqlFails = q => { try { sql(q); return null; } catch (e) { return String(e.stderr ?? e.message); } };

let ok = 0, ko = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

const stamp = Date.now();
const created = { users: [], boxes: [] };

const mkUser = async (suffix, role = 'member') => {
  const email = `zz_cash_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_cash_${suffix}_${stamp}`, level: 'inter', role, elo: 1000,
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
  const athleteA = await mkUser('athleteA');

  const mkBox = async (owner, tag) => {
    const { data, error } = await svc.from('boxes').insert({
      owner_id: owner.id, name: `ZZ CASH ${tag} ${stamp}`, slug: `zz-cash-${tag}-${stamp}`,
      invite_code: `ZC${tag}${String(stamp).slice(-4)}`, is_active: true, is_listed: true, city: 'Lyon',
    }).select('id').single();
    if (error) throw error;
    created.boxes.push(data.id);
    return data.id;
  };
  const boxA = await mkBox(ownerA, 'A');
  const boxB = await mkBox(ownerB, 'B');

  const mkPlan = async (boxId, name, cents) => {
    const { data, error } = await svc.from('membership_plans').insert({
      box_id: boxId, name, price_cents: cents, currency: 'eur',
      plan_type: 'subscription', is_active: true,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  };
  const planA = await mkPlan(boxA, 'ZZ Cash A', 6900);
  const planB = await mkPlan(boxB, 'ZZ Cash B', 12900);

  const mkInvit = async (boxId, planId, owner) => {
    const { data, error } = await svc.from('box_invitations').insert({
      box_id: boxId, email: `zz_inv_${Math.random().toString(36).slice(2, 7)}@test.athlex.io`,
      first_name: 'ZZ', last_name: 'Comptoir', plan_id: planId, payment_mode: 'box',
      cash_collected: false, token_hash: `h_${Math.random().toString(36).slice(2)}`,
      status: 'pending', expires_at: iso(now + 7 * 86400000), created_by: owner.id,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  };
  const invA = await mkInvit(boxA, planA, ownerA);
  const invB = await mkInvit(boxB, planB, ownerB);

  const call = (client, fn, args) => client.rpc(fn, args);

  // ── L'encaissement d'une invitation laisse une trace ──────────────────────
  const { error: eMark } = await call(ownerA.client, 'mark_box_invitation_paid', { p_invitation_id: invA });
  check('le gérant encaisse l\'invitation', !eMark, eMark?.message ?? '');

  const { data: journal } = await ownerA.client
    .from('box_cash_payments')
    .select('id, amount_cents, source, plan_name, collected_by, invitation_id')
    .eq('box_id', boxA);
  check('une ligne de journal, au prix de la FORMULE (jamais du client)',
    journal?.length === 1 && journal[0].amount_cents === 6900 && journal[0].source === 'invitation',
    `${journal?.length} ligne(s) / ${journal?.[0]?.amount_cents}`);
  check('la ligne porte qui a encaissé et la formule figée',
    journal?.[0]?.collected_by === ownerA.id && journal[0].plan_name === 'ZZ Cash A',
    `${journal?.[0]?.plan_name}`);

  // ── Deux clics n'encaissent pas deux fois ─────────────────────────────────
  await call(ownerA.client, 'mark_box_invitation_paid', { p_invitation_id: invA });
  const { count: dbl } = await ownerA.client
    .from('box_cash_payments').select('id', { count: 'exact', head: true }).eq('box_id', boxA);
  check('un second clic ne journalise pas le même argent', dbl === 1, `${dbl}`);

  // ── Échéance d'un membre comptoir ─────────────────────────────────────────
  const mkMember = async (boxId, planId, opts = {}) => {
    const u = await mkUser(`m${Math.random().toString(36).slice(2, 6)}`);
    const { data, error } = await svc.from('box_members').insert({
      box_id: boxId, member_id: u.id, role: 'member', status: 'active',
      plan_id: planId, subscription_status: 'active', ...opts,
    }).select('id').single();
    if (error) throw error;
    return { ...u, boxMemberId: data.id };
  };
  // `amount_cents` volontairement faux : le journal doit suivre la formule.
  const cashMember = await mkMember(boxA, planA, { amount_cents: 100 });
  const stripeMember = await mkMember(boxA, planA, {
    stripe_subscription_id: `sub_zzc_${stamp}`, amount_cents: 6900,
  });

  const { error: eRen } = await call(ownerA.client, 'record_member_cash_payment', {
    p_box_member_id: cashMember.boxMemberId,
  });
  check('l\'échéance d\'un membre comptoir se déclare', !eRen, eRen?.message ?? '');

  const { data: ren } = await ownerA.client.from('box_cash_payments')
    .select('amount_cents, source, member_id').eq('source', 'renewal');
  check('le renouvellement est journalisé au prix de la formule, pas au montant du membre',
    ren?.length === 1 && ren[0].amount_cents === 6900 && ren[0].member_id === cashMember.id,
    `${ren?.[0]?.amount_cents}`);

  const { error: eStripe } = await call(ownerA.client, 'record_member_cash_payment', {
    p_box_member_id: stripeMember.boxMemberId,
  });
  check('un abonné Stripe ne peut pas être encaissé au comptoir', !!eStripe, eStripe?.code ?? '');

  // ── Étanchéité entre box ──────────────────────────────────────────────────
  const { error: eOtherMark } = await call(ownerB.client, 'mark_box_invitation_paid', { p_invitation_id: invA });
  check('le gérant d\'une AUTRE box n\'encaisse pas', !!eOtherMark, eOtherMark?.code ?? '');

  const { error: eOtherRen } = await call(ownerB.client, 'record_member_cash_payment', {
    p_box_member_id: cashMember.boxMemberId,
  });
  check('le gérant d\'une autre box ne déclare pas d\'échéance', !!eOtherRen, eOtherRen?.code ?? '');

  await call(ownerB.client, 'mark_box_invitation_paid', { p_invitation_id: invB });
  const { data: seenByB } = await ownerB.client
    .from('box_cash_payments').select('box_id, amount_cents');
  check('le gérant de B ne voit que les encaissements de B',
    (seenByB ?? []).length === 1 && seenByB[0].box_id === boxB,
    (seenByB ?? []).map(r => r.amount_cents).join(','));

  const { data: seenByAthlete } = await athleteA.client.from('box_cash_payments').select('id');
  check('un athlète ne voit aucun encaissement', (seenByAthlete ?? []).length === 0,
    `${(seenByAthlete ?? []).length}`);

  const { data: seenByAnon } = await anon.from('box_cash_payments').select('id');
  check('anon ne voit aucun encaissement', (seenByAnon ?? []).length === 0,
    `${(seenByAnon ?? []).length}`);

  const { error: eAnonRpc } = await call(anon, 'record_member_cash_payment', {
    p_box_member_id: cashMember.boxMemberId,
  });
  check('anon ne déclare pas d\'encaissement', !!eAnonRpc, eAnonRpc?.code ?? '');

  // ── Ajout seul, pour de vrai ──────────────────────────────────────────────
  const { error: eIns } = await ownerA.client.from('box_cash_payments').insert({
    box_id: boxA, amount_cents: 999900, source: 'renewal',
  });
  check('l\'écriture directe est fermée au gérant', !!eIns, eIns?.code ?? '');

  const upd = sqlFails(`UPDATE box_cash_payments SET amount_cents = 1 WHERE box_id = '${boxA}'`);
  check('corriger un montant est refusé même en direct sur la base',
    !!upd && upd.includes('APPEND_ONLY'), (upd ?? 'aucune erreur').split('\n')[0].slice(0, 60));

  const updDate = sqlFails(`UPDATE box_cash_payments SET collected_at = now() - interval '1 year' WHERE box_id = '${boxA}'`);
  check('antidater un encaissement est refusé',
    !!updDate && updDate.includes('APPEND_ONLY'), (updDate ?? 'aucune erreur').split('\n')[0].slice(0, 60));

  const del = sqlFails(`DELETE FROM box_cash_payments WHERE box_id = '${boxA}'`);
  check('supprimer une ligne est refusé même en direct sur la base',
    !!del && del.includes('APPEND_ONLY'), (del ?? 'aucune erreur').split('\n')[0].slice(0, 60));

  const svcGrants = sql(`SELECT coalesce(string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type), 'aucun')
                           FROM pg_class c, aclexplode(c.relacl) a
                           JOIN pg_roles r ON r.oid = a.grantee
                          WHERE c.relname = 'box_cash_payments'
                            AND r.rolname IN ('authenticated','service_role')
                            AND a.privilege_type IN ('UPDATE','DELETE','TRUNCATE')`);
  check('aucun grant UPDATE/DELETE sur le journal', svcGrants === 'aucun', svcGrants);

  // ── La synthèse sépare le prouvé du théorique ─────────────────────────────
  const { data: sum } = await call(ownerA.client, 'get_box_money_summary', {
    p_box_id: boxA, p_from: FROM, p_to: TO,
  });
  const row = Array.isArray(sum) ? sum[0] : sum;
  check('encaissé comptoir PROUVÉ = 6900 + 6900 sur la période',
    Number(row.cash_collected_cents) === 13800 && row.cash_collected_count === 2,
    `${row.cash_collected_cents}/${row.cash_collected_count}`);
  check('le MRR comptoir théorique reste distinct de l\'encaissé',
    Number(row.mrr_cash_cents) === 100, `${row.mrr_cash_cents}`);
  check('aucun euro de la box B dans l\'encaissé de A',
    Number(row.cash_collected_cents) === 13800, `${row.cash_collected_cents}`);

  const { data: sOld } = await call(ownerA.client, 'get_box_money_summary', {
    p_box_id: boxA, p_from: iso(now - 400 * 86400000), p_to: iso(now - 300 * 86400000),
  });
  const rowOld = Array.isArray(sOld) ? sOld[0] : sOld;
  check('période passée : 0 encaissé (le flux est bien filtré)',
    Number(rowOld.cash_collected_cents) === 0, `${rowOld.cash_collected_cents}`);

  // ── Le helper interne reste hors de portée ────────────────────────────────
  const { error: eHelper } = await call(ownerA.client, '_log_box_cash_payment', {
    p_box_id: boxA, p_member_id: null, p_invitation_id: null, p_plan_id: planA, p_source: 'renewal',
  });
  check('le helper d\'écriture n\'est appelable par aucun client', !!eHelper, eHelper?.code ?? '');

  const paths = sql(`SELECT count(*) FROM pg_proc
                      WHERE proname IN ('record_member_cash_payment','_log_box_cash_payment','reject_cash_payment_rewrite')
                        AND 'search_path=public, pg_temp' = ANY(proconfig)`);
  check('search_path figé sur les 3 nouvelles fonctions', paths === '3', paths);

  // ── Les deux cascades doivent rester possibles ────────────────────────────
  // Un verrou aveugle rendrait la suppression d'un compte et celle d'une box
  // impossibles : la FK y écrit elle-même (SET NULL puis CASCADE).
  const purgeMember = await mkMember(boxA, planA, { amount_cents: 6900 });
  await call(ownerA.client, 'record_member_cash_payment', { p_box_member_id: purgeMember.boxMemberId });
  await svc.auth.admin.deleteUser(purgeMember.id).catch(() => {});
  const purgeErr = sqlFails(`DELETE FROM profiles WHERE id = '${purgeMember.id}'`);
  check('supprimer un compte reste possible (member_id passe à NULL)',
    !purgeErr, purgeErr ? purgeErr.split('\n')[0].slice(0, 60) : 'ok');
  const orphan = sql(`SELECT count(*) FROM box_cash_payments
                       WHERE box_id = '${boxA}' AND member_id IS NULL
                         AND source = 'renewal' AND amount_cents = 6900`);
  check('la ligne survit au compte supprimé, montant intact', orphan === '1', orphan);

  const boxPurge = sqlFails(`DELETE FROM boxes WHERE id = '${boxB}'`);
  check('supprimer une box reste possible (cascade du journal)',
    !boxPurge, boxPurge ? boxPurge.split('\n')[0].slice(0, 60) : 'ok');
} finally {
  for (const b of created.boxes) sql(`DELETE FROM boxes WHERE id = '${b}'`);
  for (const u of created.users) {
    await svc.auth.admin.deleteUser(u).catch(() => {});
    sql(`DELETE FROM profiles WHERE id = '${u}'`);
  }
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
