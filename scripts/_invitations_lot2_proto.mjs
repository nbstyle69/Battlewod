// Protocole « invitations nominatives — lot 2 : consommation depuis le serveur
// d'inscription » (20261021).
//
// Le lot 2 ajoute une seconde entrée à la consommation, pour que la route
// /rejoindre/[token] puisse rattacher un compte qu'elle vient de créer sans
// dépendre d'une session. Ce protocole prouve qu'elle ne relâche RIEN :
//
//   • consume_box_invitation_for est inexécutable par anon et authenticated ;
//   • la fonction interne _consume_box_invitation n'est exécutable par
//     AUCUN rôle client ;
//   • l'e-mail du compte doit toujours correspondre à celui de l'invitation :
//     nommer l'utilisateur ne permet PAS de rattacher n'importe qui ;
//   • expirée / révoquée / déjà consommée / membre exclu → refusées ;
//   • un jeton de la box A ne rattache jamais à la box B ;
//   • les trois statuts (comptoir encaissé, à encaisser, Stripe) sont
//     identiques à ceux de l'entrée client ;
//   • l'entrée client (auth.uid()) reste intacte — non-régression du lot 1.
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
  const email = emailOverride ?? `zz_l2_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_l2_${suffix}_${stamp}`, level: 'inter', role, elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, email, client };
};

const memberRow = async (boxId, uid) => (await svc.from('box_members')
  .select('status, subscription_status, plan_id, payment_method_type')
  .eq('box_id', boxId).eq('member_id', uid).maybeSingle()).data;

// Ce que fait la route serveur : elle nomme l'utilisateur qu'elle vient de créer.
const consumeAsServer = (token, userId) =>
  svc.rpc('consume_box_invitation_for', { p_token: token, p_user_id: userId });

try {
  const ownerA = await mkUser('ownerA', 'box_owner');
  const ownerB = await mkUser('ownerB', 'box_owner');

  const mkBox = async (owner, tag) => {
    const { data, error } = await svc.from('boxes').insert({
      owner_id: owner.id, name: `ZZ L2 ${tag} ${stamp}`, slug: `zz-l2-${tag}-${stamp}`,
      invite_code: `ZL${tag}${String(stamp).slice(-4)}`, is_active: true, is_listed: true, city: 'Lyon',
    }).select('id').single();
    if (error) throw error;
    created.boxes.push(data.id);
    await svc.from('box_members').insert({ box_id: data.id, member_id: owner.id, role: 'owner', status: 'active' });
    return data.id;
  };
  const boxA = await mkBox(ownerA, 'A');
  const boxB = await mkBox(ownerB, 'B');

  const mkPlan = async (boxId, name) => (await svc.from('membership_plans').insert({
    box_id: boxId, name, price_cents: 4900, currency: 'eur', plan_type: 'subscription',
    max_sessions_per_week: 3, is_active: true,
  }).select('id').single()).data.id;
  const planA = await mkPlan(boxA, `L2 A ${stamp}`);
  const planB = await mkPlan(boxB, `L2 B ${stamp}`);

  const invite = (as, args) => as.client.rpc('create_box_invitation', args);

  // ── 1. Qui peut appeler l'entrée serveur ──────────────────────────────────

  const target = await mkUser('cible');

  const { error: anonFor } = await anon.rpc('consume_box_invitation_for', {
    p_token: 'x'.repeat(64), p_user_id: target.id,
  });
  check('anon — consume_box_invitation_for : REFUSÉE', !!anonFor, anonFor?.message ?? 'acceptée (!)');

  const { error: authFor } = await target.client.rpc('consume_box_invitation_for', {
    p_token: 'x'.repeat(64), p_user_id: target.id,
  });
  check('utilisateur connecté — consume_box_invitation_for : REFUSÉE (service_role seul)',
    !!authFor && /permission denied|not exist/i.test(authFor.message), authFor?.message ?? 'acceptée (!)');

  const { error: ownerFor } = await ownerA.client.rpc('consume_box_invitation_for', {
    p_token: 'x'.repeat(64), p_user_id: target.id,
  });
  check('gérant de box — consume_box_invitation_for : REFUSÉE (elle n\'est pas un outil de gestion)',
    !!ownerFor, ownerFor?.message ?? 'acceptée (!)');

  for (const [role, label] of [['anon', 'anon'], ['authenticated', 'authenticated'], ['service_role', 'service_role']]) {
    const has = sql(`SELECT has_function_privilege('${role}', 'public._consume_box_invitation(text,uuid)', 'EXECUTE')`);
    check(`fonction interne _consume_box_invitation — inexécutable par ${label}`, has === 'f', has);
  }

  const grants = sql(`SELECT coalesce(string_agg(pg_get_userbyid(a.grantee), ',' ORDER BY 1), 'aucun')
                        FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
                       WHERE p.pronamespace='public'::regnamespace
                         AND p.proname='consume_box_invitation_for'
                         AND pg_get_userbyid(a.grantee) IN ('anon','authenticated','public','service_role')`);
  check('grants — consume_box_invitation_for n\'est ouverte qu\'à service_role (ni anon, ni authenticated, ni public)',
    grants === 'service_role', grants);

  // ── 2. Nommer l'utilisateur ne permet pas de rattacher n'importe qui ──────

  const rInv = await invite(ownerA, {
    p_box_id: boxA, p_email: `zz.l2.legit.${stamp}@test.athlex.io`,
    p_first_name: 'Sam', p_plan_id: planA, p_payment_mode: 'box', p_cash_collected: true,
  });
  check('gérant — création de l\'invitation de référence', rInv.data?.ok === true, rInv.error?.message ?? 'ok');

  const rWrong = await consumeAsServer(rInv.data.token, target.id);
  check('serveur — rattacher un compte dont l\'e-mail diffère : REFUSÉ',
    rWrong.data?.ok === false && rWrong.data.reason === 'email_non_correspondant',
    JSON.stringify(rWrong.data ?? rWrong.error?.message));
  check('… et aucune adhésion n\'a été créée', (await memberRow(boxA, target.id)) === null, 'aucune ligne');

  const rNoUser = await consumeAsServer(rInv.data.token, null);
  check('serveur — sans utilisateur nommé : REFUSÉ',
    !!rNoUser.error || rNoUser.data?.ok === false,
    rNoUser.error?.message ?? JSON.stringify(rNoUser.data));

  const rUnknown = await consumeAsServer('a'.repeat(64), target.id);
  check('serveur — jeton inconnu : REFUSÉ',
    rUnknown.data?.ok === false && rUnknown.data.reason === 'invitation_introuvable',
    JSON.stringify(rUnknown.data));

  // ── 3. Le chemin nominal de la page /rejoindre ────────────────────────────

  const invitee = await mkUser('invite', 'member', `zz.l2.legit.${stamp}@test.athlex.io`);
  const rOk = await consumeAsServer(rInv.data.token, invitee.id);
  const mOk = await memberRow(boxA, invitee.id);
  check('serveur — compte portant l\'adresse invitée : rattaché avec la formule',
    rOk.data?.ok === true && mOk?.plan_id === planA, JSON.stringify(rOk.data ?? rOk.error?.message));
  check('mode box + encaissé — membre ACTIF, visible dans Abonnés',
    mOk?.status === 'active' && mOk?.subscription_status === 'active' && mOk?.payment_method_type === 'cash',
    JSON.stringify(mOk));

  const rReplay = await consumeAsServer(rInv.data.token, invitee.id);
  check('rejeu par le même compte (double soumission du formulaire) : idempotent',
    rReplay.data?.ok === true && rReplay.data.already === true, JSON.stringify(rReplay.data));

  const thief = await mkUser('tiers');
  const rThief = await consumeAsServer(rInv.data.token, thief.id);
  check('jeton déjà consommé, rejoué pour un autre compte : REFUSÉ',
    rThief.data?.ok === false && rThief.data.reason === 'invitation_deja_utilisee'
      && (await memberRow(boxA, thief.id)) === null,
    JSON.stringify(rThief.data));

  // ── 4. Expiration, révocation, exclusion ──────────────────────────────────

  const rExp = await invite(ownerA, { p_box_id: boxA, p_email: `zz.l2.exp.${stamp}@test.athlex.io` });
  sql(`UPDATE public.box_invitations SET expires_at = now() - interval '1 hour'
        WHERE token_hash = encode(sha256('${rExp.data.token}'::bytea),'hex')`);
  const expUser = await mkUser('exp', 'member', `zz.l2.exp.${stamp}@test.athlex.io`);
  const rExpC = await consumeAsServer(rExp.data.token, expUser.id);
  check('invitation expirée — la voie serveur la refuse aussi',
    rExpC.data?.reason === 'invitation_expiree' && (await memberRow(boxA, expUser.id)) === null,
    JSON.stringify(rExpC.data));

  const rRev = await invite(ownerA, { p_box_id: boxA, p_email: `zz.l2.rev.${stamp}@test.athlex.io` });
  await ownerA.client.from('box_invitations').update({ status: 'revoked' }).eq('id', rRev.data.id);
  const revUser = await mkUser('rev', 'member', `zz.l2.rev.${stamp}@test.athlex.io`);
  const rRevC = await consumeAsServer(rRev.data.token, revUser.id);
  check('invitation révoquée — la voie serveur la refuse aussi',
    rRevC.data?.reason === 'invitation_revoquee' && (await memberRow(boxA, revUser.id)) === null,
    JSON.stringify(rRevC.data));

  // L'invitation est émise avant le bannissement : depuis 20261029 la création
  // refuse un exclu, et c'est la garde de consommation qu'on éprouve ici.
  const banned = await mkUser('banni');
  const rBan = await invite(ownerA, { p_box_id: boxA, p_email: banned.email, p_cash_collected: true });
  await svc.from('box_members').insert({ box_id: boxA, member_id: banned.id, role: 'member', status: 'banned' });
  const rBanC = await consumeAsServer(rBan.data.token, banned.id);
  check('membre exclu — la voie serveur ne le réintègre pas',
    rBanC.data?.ok === false && rBanC.data.reason === 'membre_exclu'
      && (await memberRow(boxA, banned.id))?.status === 'banned',
    JSON.stringify(rBanC.data));

  // ── 5. Étanchéité inter-box, par la signature ─────────────────────────────

  const sig = sql(`SELECT pg_get_function_identity_arguments(oid) FROM pg_proc
                    WHERE proname='consume_box_invitation_for' AND pronamespace='public'::regnamespace`);
  check('consume_box_invitation_for — aucun identifiant de box dans sa signature',
    sig === 'p_token text, p_user_id uuid', sig);

  const rCross = await invite(ownerB, {
    p_box_id: boxB, p_email: `zz.l2.cross.${stamp}@test.athlex.io`, p_plan_id: planB, p_cash_collected: true,
  });
  const crossUser = await mkUser('cross', 'member', `zz.l2.cross.${stamp}@test.athlex.io`);
  const rCrossC = await consumeAsServer(rCross.data.token, crossUser.id);
  check('jeton de la box B via la voie serveur — rattache à B, et à B seulement',
    rCrossC.data?.box_id === boxB && (await memberRow(boxA, crossUser.id)) === null
      && (await memberRow(boxB, crossUser.id))?.status === 'active',
    JSON.stringify(rCrossC.data?.box_id === boxB ? 'boxB' : rCrossC.data));

  // ── 6. Les trois statuts, à l'identique de l'entrée client ────────────────

  const rCash = await invite(ownerA, {
    p_box_id: boxA, p_email: `zz.l2.cash.${stamp}@test.athlex.io`, p_plan_id: planA, p_cash_collected: false,
  });
  const cashUser = await mkUser('cash', 'member', `zz.l2.cash.${stamp}@test.athlex.io`);
  await consumeAsServer(rCash.data.token, cashUser.id);
  const mCash = await memberRow(boxA, cashUser.id);
  check('mode box non encaissé — « à encaisser », sans accès',
    mCash?.status === 'inactive' && mCash?.subscription_status === 'pending_cash', JSON.stringify(mCash));

  const { data: paid } = await ownerA.client.rpc('mark_box_invitation_paid', { p_invitation_id: rCash.data.id });
  check('… et le gérant l\'active en un clic depuis son écran',
    paid?.ok === true && (await memberRow(boxA, cashUser.id))?.status === 'active', JSON.stringify(paid));

  const rStripe = await invite(ownerA, {
    p_box_id: boxA, p_email: `zz.l2.stripe.${stamp}@test.athlex.io`, p_plan_id: planA, p_payment_mode: 'stripe',
  });
  const stripeUser = await mkUser('stripe', 'member', `zz.l2.stripe.${stamp}@test.athlex.io`);
  const rStripeC = await consumeAsServer(rStripe.data.token, stripeUser.id);
  const mStripe = await memberRow(boxA, stripeUser.id);
  check('mode stripe — la voie serveur n\'active PAS non plus (webhook seul, lot 4)',
    rStripeC.data?.ok === true && mStripe?.status === 'inactive'
      && mStripe?.subscription_status === 'pending_payment',
    JSON.stringify(mStripe));

  // ── 7. Non-régression : l'entrée client du lot 1 est intacte ──────────────

  const rClient = await invite(ownerA, {
    p_box_id: boxA, p_email: `zz.l2.client.${stamp}@test.athlex.io`, p_plan_id: planA, p_cash_collected: true,
  });
  const clientUser = await mkUser('client', 'member', `zz.l2.client.${stamp}@test.athlex.io`);
  const rClientC = await clientUser.client.rpc('consume_box_invitation', { p_token: rClient.data.token });
  check('entrée client (auth.uid()) — toujours fonctionnelle',
    rClientC.data?.ok === true && (await memberRow(boxA, clientUser.id))?.status === 'active',
    JSON.stringify(rClientC.data ?? rClientC.error?.message));

  const sigClient = sql(`SELECT pg_get_function_identity_arguments(oid) FROM pg_proc
                          WHERE proname='consume_box_invitation' AND pronamespace='public'::regnamespace`);
  check('entrée client — sa signature ne prend toujours qu\'un jeton', sigClient === 'p_token text', sigClient);

  const wrongUser = await mkUser('mauvais');
  const rWrongClient = await wrongUser.client.rpc('consume_box_invitation', { p_token: rClient.data.token });
  check('entrée client — un tiers sur un jeton consommé : toujours refusé',
    rWrongClient.data?.ok === false, JSON.stringify(rWrongClient.data));
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
