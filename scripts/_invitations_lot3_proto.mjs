// Protocole « invitations nominatives — lot 3 : relance, révocation, suivi
// d'envoi » (20261022).
//
// Le lot 3 donne au gérant trois gestes de plus. Chacun agit sur une invitation
// désignée par son identifiant — c'est exactement le motif qui produit des
// IDOR. Les frontières à prouver sont donc, pour les TROIS RPC :
//
//   • le gérant d'une AUTRE box ne peut rien faire sur l'invitation ;
//   • un athlète ni anon non plus ;
//   • la relance régénère le jeton : l'ancien lien MEURT ;
//   • on ne relance pas une invitation acceptée ou révoquée ;
//   • on ne révoque pas une invitation déjà acceptée (faux geste de sécurité) ;
//   • la trace d'envoi enregistre l'échec, et un envoi réussi l'efface.
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

const mkUser = async (suffix, role = 'member', emailOverride = null) => {
  const email = emailOverride ?? `zz_l3_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_l3_${suffix}_${stamp}`, level: 'inter', role, elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, email, client };
};

try {
  const ownerA = await mkUser('ownerA', 'box_owner');
  const ownerB = await mkUser('ownerB', 'box_owner');
  const coachA = await mkUser('coachA');
  const athlete = await mkUser('athlete');

  const mkBox = async (owner, tag) => {
    const { data, error } = await svc.from('boxes').insert({
      owner_id: owner.id, name: `ZZ L3 ${tag} ${stamp}`, slug: `zz-l3-${tag}-${stamp}`,
      invite_code: `ZM${tag}${String(stamp).slice(-4)}`, is_active: true, is_listed: true, city: 'Lyon',
    }).select('id').single();
    if (error) throw error;
    created.boxes.push(data.id);
    await svc.from('box_members').insert({ box_id: data.id, member_id: owner.id, role: 'owner', status: 'active' });
    return data.id;
  };
  const boxA = await mkBox(ownerA, 'A');
  const boxB = await mkBox(ownerB, 'B');
  await svc.from('box_members').insert({ box_id: boxA, member_id: coachA.id, role: 'coach', status: 'active' });

  const planA = (await svc.from('membership_plans').insert({
    box_id: boxA, name: `L3 A ${stamp}`, price_cents: 5900, currency: 'eur',
    plan_type: 'subscription', max_sessions_per_week: 3, is_active: true,
  }).select('id').single()).data.id;

  const invite = (as, args) => as.client.rpc('create_box_invitation', args);

  const rInv = await invite(ownerA, {
    p_box_id: boxA, p_email: `zz.l3.a.${stamp}@test.athlex.io`,
    p_first_name: 'Nora', p_plan_id: planA, p_payment_mode: 'box', p_cash_collected: false,
  });
  check('gérant — création de l\'invitation de référence', rInv.data?.ok === true, rInv.error?.message ?? 'ok');

  // ── 1. Relance : le jeton change, l'ancien lien meurt ─────────────────────

  const { data: peekBefore } = await anon.rpc('peek_box_invitation', { p_token: rInv.data.token });
  check('avant relance — l\'ancien lien est valide', peekBefore?.ok === true, JSON.stringify(peekBefore?.reason ?? 'ok'));

  const rRot = await ownerA.client.rpc('rotate_box_invitation_token', { p_invitation_id: rInv.data.id });
  check('gérant — relance : nouveau jeton émis',
    rRot.data?.ok === true && typeof rRot.data.token === 'string'
      && rRot.data.token.length === 64 && rRot.data.token !== rInv.data.token,
    rRot.error?.message ?? 'jeton renouvelé');

  const { data: peekOld } = await anon.rpc('peek_box_invitation', { p_token: rInv.data.token });
  check('après relance — l\'ANCIEN lien ne fonctionne plus',
    peekOld?.ok === false && peekOld.reason === 'invitation_introuvable', JSON.stringify(peekOld));

  const { data: peekNew } = await anon.rpc('peek_box_invitation', { p_token: rRot.data.token });
  check('après relance — le NOUVEAU lien pointe sur la même invitation',
    peekNew?.ok === true && peekNew.first_name === 'Nora' && peekNew.email === rInv.data.email,
    JSON.stringify(peekNew?.reason ?? 'ok'));

  const clear = sql(`SELECT count(*) FROM public.box_invitations WHERE token_hash = '${rRot.data.token}'`);
  check('le jeton régénéré n\'est pas stocké en clair non plus', clear === '0', `${clear} ligne(s)`);

  // ── 2. Qui peut relancer ──────────────────────────────────────────────────

  const rRotB = await ownerB.client.rpc('rotate_box_invitation_token', { p_invitation_id: rInv.data.id });
  check('gérant d\'une AUTRE box — relance : REFUSÉE',
    !!rRotB.error && /FORBIDDEN/.test(rRotB.error.message), rRotB.error?.message ?? 'acceptée (!)');

  const rRotAth = await athlete.client.rpc('rotate_box_invitation_token', { p_invitation_id: rInv.data.id });
  check('athlète — relance : REFUSÉE',
    !!rRotAth.error && /FORBIDDEN/.test(rRotAth.error.message), rRotAth.error?.message ?? 'acceptée (!)');

  const { error: rRotAnon } = await anon.rpc('rotate_box_invitation_token', { p_invitation_id: rInv.data.id });
  check('anon — relance : REFUSÉE', !!rRotAnon, rRotAnon?.message ?? 'acceptée (!)');

  const rRotCoach = await coachA.client.rpc('rotate_box_invitation_token', { p_invitation_id: rInv.data.id });
  check('coach de la box — relance : ACCEPTÉE (is_box_admin)', rRotCoach.data?.ok === true,
    rRotCoach.error?.message ?? 'ok');

  // Et le jeton du coach est bien le seul valide désormais.
  const { data: peekAfterCoach } = await anon.rpc('peek_box_invitation', { p_token: rRot.data.token });
  check('chaque relance invalide la précédente', peekAfterCoach?.ok === false, JSON.stringify(peekAfterCoach));

  // ── 3. Trace d'envoi ──────────────────────────────────────────────────────

  const rFail = await ownerA.client.rpc('mark_box_invitation_sent', {
    p_invitation_id: rInv.data.id, p_error: 'The athlex.app domain is not verified',
  });
  const { data: afterFail } = await ownerA.client.from('box_invitations')
    .select('last_send_error, send_count, last_sent_at').eq('id', rInv.data.id).maybeSingle();
  check('échec Resend — l\'erreur est enregistrée, pas avalée',
    rFail.data?.delivered === false && /not verified/.test(afterFail?.last_send_error ?? '')
      && afterFail?.send_count === 1 && !!afterFail?.last_sent_at,
    JSON.stringify(afterFail));

  await ownerA.client.rpc('mark_box_invitation_sent', { p_invitation_id: rInv.data.id });
  const { data: afterOk } = await ownerA.client.from('box_invitations')
    .select('last_send_error, send_count').eq('id', rInv.data.id).maybeSingle();
  check('envoi réussi — l\'erreur précédente est effacée',
    afterOk?.last_send_error === null && afterOk?.send_count === 2, JSON.stringify(afterOk));

  const rSentB = await ownerB.client.rpc('mark_box_invitation_sent', { p_invitation_id: rInv.data.id });
  check('gérant d\'une AUTRE box — trace d\'envoi : REFUSÉE',
    !!rSentB.error && /FORBIDDEN/.test(rSentB.error.message), rSentB.error?.message ?? 'acceptée (!)');

  const { error: rSentAnon } = await anon.rpc('mark_box_invitation_sent', { p_invitation_id: rInv.data.id });
  check('anon — trace d\'envoi : REFUSÉE', !!rSentAnon, rSentAnon?.message ?? 'acceptée (!)');

  // ── 4. Révocation ─────────────────────────────────────────────────────────

  const rRevB = await ownerB.client.rpc('revoke_box_invitation', { p_invitation_id: rInv.data.id });
  check('gérant d\'une AUTRE box — révocation : REFUSÉE',
    !!rRevB.error && /FORBIDDEN/.test(rRevB.error.message), rRevB.error?.message ?? 'acceptée (!)');

  const rRev = await ownerA.client.rpc('revoke_box_invitation', { p_invitation_id: rInv.data.id });
  const { data: peekRevoked } = await anon.rpc('peek_box_invitation', { p_token: rRotCoach.data.token });
  check('gérant de la box — révocation : le lien vivant devient inutilisable',
    rRev.data?.ok === true && peekRevoked?.reason === 'invitation_revoquee',
    JSON.stringify(peekRevoked));

  const rRotRevoked = await ownerA.client.rpc('rotate_box_invitation_token', { p_invitation_id: rInv.data.id });
  check('relance d\'une invitation révoquée : REFUSÉE (elle se recrée, elle ne ressuscite pas)',
    !!rRotRevoked.error && /NOT_PENDING/.test(rRotRevoked.error.message),
    rRotRevoked.error?.message ?? 'acceptée (!)');

  // ── 5. Une invitation acceptée ne se relance ni ne se révoque ─────────────

  const rUsed = await invite(ownerA, {
    p_box_id: boxA, p_email: `zz.l3.used.${stamp}@test.athlex.io`, p_plan_id: planA, p_cash_collected: true,
  });
  const usedUser = await mkUser('used', 'member', `zz.l3.used.${stamp}@test.athlex.io`);
  await usedUser.client.rpc('consume_box_invitation', { p_token: rUsed.data.token });

  const rRotUsed = await ownerA.client.rpc('rotate_box_invitation_token', { p_invitation_id: rUsed.data.id });
  check('relance d\'une invitation déjà acceptée : REFUSÉE',
    !!rRotUsed.error && /NOT_PENDING/.test(rRotUsed.error.message), rRotUsed.error?.message ?? 'acceptée (!)');

  const rRevUsed = await ownerA.client.rpc('revoke_box_invitation', { p_invitation_id: rUsed.data.id });
  check('révocation d\'une invitation déjà acceptée : REFUSÉE (elle ne retirerait rien au membre)',
    !!rRevUsed.error && /ALREADY_ACCEPTED/.test(rRevUsed.error.message), rRevUsed.error?.message ?? 'acceptée (!)');

  const memberStillThere = (await svc.from('box_members').select('status')
    .eq('box_id', boxA).eq('member_id', usedUser.id).maybeSingle()).data;
  check('… et le membre reste actif', memberStillThere?.status === 'active', JSON.stringify(memberStillThere));

  // ── 6. Ce que l'écran lit ─────────────────────────────────────────────────

  const rCash = await invite(ownerA, {
    p_box_id: boxA, p_email: `zz.l3.cash.${stamp}@test.athlex.io`, p_plan_id: planA,
    p_payment_mode: 'box', p_cash_collected: false,
  });
  const { data: aCaisser } = await ownerA.client.from('box_invitations')
    .select('id, email, payment_mode, cash_collected, status')
    .eq('box_id', boxA).eq('status', 'pending').eq('payment_mode', 'box').eq('cash_collected', false);
  check('filtre « à encaisser » — la liste du gérant le sert directement',
    (aCaisser ?? []).some(r => r.id === rCash.data.id), `${aCaisser?.length ?? 0} invitation(s)`);

  const { data: crossRead } = await ownerB.client.from('box_invitations').select('id').eq('box_id', boxA);
  check('gérant d\'une autre box — lecture de la liste de A : 0 ligne',
    (crossRead?.length ?? 0) === 0, `${crossRead?.length ?? 0} ligne(s)`);

  const { data: anonRead } = await anon.from('box_invitations').select('id, last_send_error');
  check('anon — lecture des nouvelles colonnes : REFUSÉE', (anonRead?.length ?? 0) === 0,
    `${anonRead?.length ?? 0} ligne(s)`);

  // ── 7. Grants ─────────────────────────────────────────────────────────────

  const grants = sql(`SELECT coalesce(string_agg(p.proname||':'||pg_get_userbyid(a.grantee), ', ' ORDER BY 1), 'aucun')
                        FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
                       WHERE p.pronamespace='public'::regnamespace
                         AND p.proname IN ('rotate_box_invitation_token','revoke_box_invitation','mark_box_invitation_sent')
                         AND pg_get_userbyid(a.grantee) IN ('anon','public')`);
  check('grants — aucune des trois RPC n\'est ouverte à anon', grants === 'aucun', grants);

  for (const fn of ['rotate_box_invitation_token(uuid,integer)', 'revoke_box_invitation(uuid)', 'mark_box_invitation_sent(uuid,text)']) {
    const sp = sql(`SELECT coalesce(array_to_string(proconfig, ','), 'aucun') FROM pg_proc
                     WHERE oid = 'public.${fn}'::regprocedure`);
    check(`search_path figé sur ${fn.split('(')[0]}`, sp.includes('search_path=public, pg_temp') || sp.includes('search_path="public", "pg_temp"'), sp);
  }
} catch (err) {
  console.error('❌ protocole interrompu :', err?.message ?? err);
  ko++;
} finally {
  for (const boxId of created.boxes) {
    await svc.from('box_invitations').delete().eq('box_id', boxId);
    await svc.from('box_members').delete().eq('box_id', boxId);
    await svc.from('membership_plans').delete().eq('box_id', boxId);
    await svc.from('boxes').delete().eq('id', boxId);
  }
  for (const id of created.users) await svc.auth.admin.deleteUser(id).catch(() => {});
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
