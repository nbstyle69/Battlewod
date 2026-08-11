// Protocole « invitations nominatives — lot 4 : branche Stripe » (20261023).
//
// La frontière qui compte, celle que Nab a posée : « un membre qui ferme le
// navigateur après Checkout sans payer ne s'active pas ». Elle se prouve en
// montrant que RIEN dans le chemin de paiement, hors webhook, ne touche
// box_members — y compris la fonction que le webhook appelle, qui ferme
// l'invitation mais n'active personne.
//
// Le reste : les deux nouvelles RPC sont réservées au service_role (elles
// portent un identifiant d'utilisateur, donc elles seraient un outil de
// rattachement arbitraire si un navigateur pouvait les appeler), et nommer un
// utilisateur ne suffit jamais — l'e-mail du compte est relu et comparé.
//
// Suppose les migrations 20261020, 20261021 et 20261023 appliquées.
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
  const email = emailOverride ?? `zz_l4_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_l4_${suffix}_${stamp}`, level: 'inter', role, elo: 1000,
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
  const athlete = await mkUser('athlete');

  const { data: boxRow, error: boxErr } = await svc.from('boxes').insert({
    owner_id: ownerA.id, name: `ZZ L4 A ${stamp}`, slug: `zz-l4-a-${stamp}`,
    invite_code: `ZP${String(stamp).slice(-5)}`, is_active: true, is_listed: true, city: 'Lyon',
  }).select('id').single();
  if (boxErr) throw boxErr;
  const boxA = boxRow.id;
  created.boxes.push(boxA);
  await svc.from('box_members').insert({ box_id: boxA, member_id: ownerA.id, role: 'owner', status: 'active' });

  const planA = (await svc.from('membership_plans').insert({
    box_id: boxA, name: `L4 A ${stamp}`, price_cents: 5900, currency: 'eur',
    plan_type: 'subscription', max_sessions_per_week: 3, is_active: true,
  }).select('id').single()).data.id;

  const invite = args => ownerA.client.rpc('create_box_invitation', args);

  // ── 1. Résolution du jeton pour le Checkout ───────────────────────────────

  const stripeEmail = `zz.l4.stripe.${stamp}@test.athlex.io`;
  const rStripe = await invite({
    p_box_id: boxA, p_email: stripeEmail, p_first_name: 'Nora',
    p_plan_id: planA, p_payment_mode: 'stripe',
  });
  check('gérant — invitation Stripe créée', rStripe.data?.ok === true, rStripe.error?.message ?? 'ok');

  const rResolve = await svc.rpc('resolve_box_invitation_for_checkout', { p_token: rStripe.data.token });
  check('service — le jeton se résout en invitation payable',
    rResolve.data?.ok === true && rResolve.data.plan_id === planA && rResolve.data.email === stripeEmail,
    JSON.stringify(rResolve.data ?? rResolve.error?.message));

  check('… et la résolution ne révèle ni le jeton ni le créateur',
    !('token' in (rResolve.data ?? {})) && !('created_by' in (rResolve.data ?? {})),
    Object.keys(rResolve.data ?? {}).join(','));

  const rAnonResolve = await anon.rpc('resolve_box_invitation_for_checkout', { p_token: rStripe.data.token });
  check('anon — résolution du jeton : REFUSÉE', !!rAnonResolve.error, rAnonResolve.error?.message ?? 'acceptée (!)');

  const rAuthResolve = await athlete.client.rpc('resolve_box_invitation_for_checkout', { p_token: rStripe.data.token });
  check('athlète connecté — résolution du jeton : REFUSÉE', !!rAuthResolve.error, rAuthResolve.error?.message ?? 'acceptée (!)');

  const rOwnerResolve = await ownerA.client.rpc('resolve_box_invitation_for_checkout', { p_token: rStripe.data.token });
  check('gérant de la box — résolution du jeton : REFUSÉE (route serveur uniquement)',
    !!rOwnerResolve.error, rOwnerResolve.error?.message ?? 'acceptée (!)');

  const rUnknown = await svc.rpc('resolve_box_invitation_for_checkout', { p_token: 'jeton-inconnu' });
  check('jeton inconnu — pas de Checkout', rUnknown.data?.ok === false && rUnknown.data.reason === 'INVALID_TOKEN',
    JSON.stringify(rUnknown.data));

  const rCash = await invite({
    p_box_id: boxA, p_email: `zz.l4.cash.${stamp}@test.athlex.io`, p_plan_id: planA,
    p_payment_mode: 'box', p_cash_collected: true,
  });
  const rCashResolve = await svc.rpc('resolve_box_invitation_for_checkout', { p_token: rCash.data.token });
  check('invitation encaissée à la box — aucun Checkout possible',
    rCashResolve.data?.ok === false && rCashResolve.data.reason === 'NOT_STRIPE', JSON.stringify(rCashResolve.data));

  const rRevoked = await invite({
    p_box_id: boxA, p_email: `zz.l4.revoked.${stamp}@test.athlex.io`, p_plan_id: planA, p_payment_mode: 'stripe',
  });
  await ownerA.client.rpc('revoke_box_invitation', { p_invitation_id: rRevoked.data.id });
  const rRevokedResolve = await svc.rpc('resolve_box_invitation_for_checkout', { p_token: rRevoked.data.token });
  check('invitation révoquée — aucun Checkout possible',
    rRevokedResolve.data?.ok === false && rRevokedResolve.data.reason === 'REVOKED', JSON.stringify(rRevokedResolve.data));

  const rExpired = await invite({
    p_box_id: boxA, p_email: `zz.l4.expired.${stamp}@test.athlex.io`, p_plan_id: planA, p_payment_mode: 'stripe',
  });
  sql(`UPDATE public.box_invitations SET expires_at = now() - interval '1 day' WHERE id = '${rExpired.data.id}'`);
  const rExpiredResolve = await svc.rpc('resolve_box_invitation_for_checkout', { p_token: rExpired.data.token });
  check('invitation expirée non consommée — aucun Checkout possible',
    rExpiredResolve.data?.ok === false && rExpiredResolve.data.reason === 'EXPIRED', JSON.stringify(rExpiredResolve.data));

  // ── 2. Le compte est créé au lot 2, mais il n'a AUCUN accès ───────────────

  const buyer = await mkUser('buyer', 'member', stripeEmail);
  const rConsume = await svc.rpc('consume_box_invitation_for', {
    p_token: rStripe.data.token, p_user_id: buyer.id,
  });
  check('lot 2 — consommation de l\'invitation Stripe par le compte créé',
    rConsume.data?.ok === true, JSON.stringify(rConsume.data ?? rConsume.error?.message));

  const afterSignup = (await svc.from('box_members')
    .select('status, subscription_status, stripe_subscription_id')
    .eq('box_id', boxA).eq('member_id', buyer.id).maybeSingle()).data;
  check('après création du compte — membre INACTIF, en attente de paiement',
    afterSignup?.status === 'inactive' && afterSignup?.subscription_status === 'pending_payment'
      && !afterSignup?.stripe_subscription_id, JSON.stringify(afterSignup));

  // Retour navigateur : la page de succès n'écrit rien, on le vérifie en
  // relisant l'état sans avoir simulé le moindre webhook.
  const stillPending = (await svc.from('box_members')
    .select('status, subscription_status')
    .eq('box_id', boxA).eq('member_id', buyer.id).maybeSingle()).data;
  check('retour navigateur sans paiement — TOUJOURS inactif (le webhook seul active)',
    stillPending?.status === 'inactive' && stillPending?.subscription_status === 'pending_payment',
    JSON.stringify(stillPending));

  // Une invitation déjà consommée reste payable : c'est le cas nominal, le
  // compte existe et c'est maintenant qu'il paie.
  const rResolveAccepted = await svc.rpc('resolve_box_invitation_for_checkout', { p_token: rStripe.data.token });
  check('invitation consommée — le Checkout reste possible (le membre paie après son inscription)',
    rResolveAccepted.data?.ok === true && rResolveAccepted.data.status === 'accepted',
    JSON.stringify(rResolveAccepted.data));

  // ── 3. Fermeture de l'invitation au paiement ──────────────────────────────

  const rAnonAccept = await anon.rpc('accept_box_invitation_after_payment', {
    p_invitation_id: rStripe.data.id, p_user_id: buyer.id,
  });
  check('anon — fermeture de l\'invitation au nom d\'un tiers : REFUSÉE',
    !!rAnonAccept.error, rAnonAccept.error?.message ?? 'acceptée (!)');

  const rAuthAccept = await athlete.client.rpc('accept_box_invitation_after_payment', {
    p_invitation_id: rStripe.data.id, p_user_id: athlete.id,
  });
  check('athlète connecté — fermeture de l\'invitation : REFUSÉE',
    !!rAuthAccept.error, rAuthAccept.error?.message ?? 'acceptée (!)');

  const rAcceptIdem = await svc.rpc('accept_box_invitation_after_payment', {
    p_invitation_id: rStripe.data.id, p_user_id: buyer.id,
  });
  check('webhook — invitation déjà consommée par CE membre : succès idempotent',
    rAcceptIdem.data?.ok === true && rAcceptIdem.data.already === true, JSON.stringify(rAcceptIdem.data));

  const noAccessYet = (await svc.from('box_members')
    .select('status, subscription_status')
    .eq('box_id', boxA).eq('member_id', buyer.id).maybeSingle()).data;
  check('… et fermer l\'invitation N\'ACTIVE PAS le membre (seul le webhook écrit box_members)',
    noAccessYet?.status === 'inactive' && noAccessYet?.subscription_status === 'pending_payment',
    JSON.stringify(noAccessYet));

  const rAcceptOther = await svc.rpc('accept_box_invitation_after_payment', {
    p_invitation_id: rStripe.data.id, p_user_id: athlete.id,
  });
  check('paiement attribué à un AUTRE compte — refusé',
    rAcceptOther.data?.ok === false && ['EMAIL_MISMATCH', 'ACCEPTED_BY_OTHER'].includes(rAcceptOther.data.reason),
    JSON.stringify(rAcceptOther.data));

  // Invitation Stripe encore en attente + paiement d'un e-mail qui ne
  // correspond pas : l'identité ne se déduit pas du paiement.
  const pendingEmail = `zz.l4.pending.${stamp}@test.athlex.io`;
  const rPending = await invite({
    p_box_id: boxA, p_email: pendingEmail, p_plan_id: planA, p_payment_mode: 'stripe',
  });
  const rMismatch = await svc.rpc('accept_box_invitation_after_payment', {
    p_invitation_id: rPending.data.id, p_user_id: athlete.id,
  });
  check('e-mail du compte ≠ e-mail de l\'invitation — fermeture refusée',
    rMismatch.data?.ok === false && rMismatch.data.reason === 'EMAIL_MISMATCH', JSON.stringify(rMismatch.data));

  const pendingUser = await mkUser('pendingbuyer', 'member', pendingEmail);
  const rAcceptPending = await svc.rpc('accept_box_invitation_after_payment', {
    p_invitation_id: rPending.data.id, p_user_id: pendingUser.id,
  });
  check('paiement d\'une invitation encore en attente — elle se ferme',
    rAcceptPending.data?.ok === true && rAcceptPending.data.already === false, JSON.stringify(rAcceptPending.data));

  const pendingRow = (await svc.from('box_invitations')
    .select('status, accepted_by').eq('id', rPending.data.id).maybeSingle()).data;
  check('… au nom du payeur, pas d\'un autre',
    pendingRow?.status === 'accepted' && pendingRow?.accepted_by === pendingUser.id, JSON.stringify(pendingRow));

  // Le payeur porte ici la BONNE adresse : le refus vient donc bien de la
  // révocation, pas d'un contrôle d'identité qui masquerait le sujet.
  const revokedUser = await mkUser('revokedbuyer', 'member', `zz.l4.revoked.${stamp}@test.athlex.io`);
  const rAcceptRevoked = await svc.rpc('accept_box_invitation_after_payment', {
    p_invitation_id: rRevoked.data.id, p_user_id: revokedUser.id,
  });
  check('invitation révoquée — un paiement ne la ressuscite pas, même au bon nom',
    rAcceptRevoked.data?.ok === false && rAcceptRevoked.data.reason === 'REVOKED',
    JSON.stringify(rAcceptRevoked.data));

  const rUnknownUser = await svc.rpc('accept_box_invitation_after_payment', {
    p_invitation_id: rPending.data.id, p_user_id: '00000000-0000-0000-0000-000000000000',
  });
  check('utilisateur inconnu — fermeture refusée',
    rUnknownUser.data?.ok === false && rUnknownUser.data.reason === 'UNKNOWN_USER', JSON.stringify(rUnknownUser.data));

  // ── 4. Grants et search_path ──────────────────────────────────────────────

  const grants = sql(`SELECT coalesce(string_agg(p.proname||':'||pg_get_userbyid(a.grantee), ', ' ORDER BY 1), 'aucun')
                        FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
                       WHERE p.pronamespace='public'::regnamespace
                         AND p.proname IN ('resolve_box_invitation_for_checkout','accept_box_invitation_after_payment')
                         AND pg_get_userbyid(a.grantee) IN ('anon','authenticated','public')`);
  check('grants — les deux RPC sont fermées à anon ET à authenticated', grants === 'aucun', grants);

  for (const fn of ['resolve_box_invitation_for_checkout(text)', 'accept_box_invitation_after_payment(uuid,uuid)']) {
    const sp = sql(`SELECT coalesce(array_to_string(proconfig, ','), 'aucun') FROM pg_proc
                     WHERE oid = 'public.${fn}'::regprocedure`);
    check(`search_path figé sur ${fn.split('(')[0]}`,
      sp.includes('search_path=public, pg_temp') || sp.includes('search_path="public", "pg_temp"'), sp);
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
