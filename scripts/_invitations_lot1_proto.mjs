// Protocole « invitations nominatives — lot 1 serveur » (20261020).
//
// Frontières à prouver, dans les deux sens :
//   • seul un admin de LA box crée une invitation ;
//   • expirée / consommée / révoquée → refusée ;
//   • la lecture publique par jeton ne révèle que le nécessaire : ni le
//     créateur, ni les autres invitations, ni les autres membres ;
//   • un jeton de la box A ne rattache jamais à la box B ;
//   • une inscription SANS invitation ne gagne rien (non-régression) ;
//   • en mode stripe, la consommation n'active PAS le membre — seul le
//     webhook le fera (lot 4).
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
  const email = `zz_inv_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_inv_${suffix}_${stamp}`, level: 'inter', role, elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, email, client };
};

const invite = (as, args) => as.client.rpc('create_box_invitation', args);
const memberRow = async (boxId, uid) => (await svc.from('box_members')
  .select('status, subscription_status, plan_id, payment_method_type')
  .eq('box_id', boxId).eq('member_id', uid).maybeSingle()).data;

try {
  // ── Décor : deux box distinctes, chacune avec son gérant et sa formule ────
  const ownerA = await mkUser('ownerA', 'box_owner');
  const ownerB = await mkUser('ownerB', 'box_owner');
  const coachA = await mkUser('coachA');
  const athlete = await mkUser('athlete');
  const intruder = await mkUser('intrus');

  const mkBox = async (owner, tag) => {
    const { data, error } = await svc.from('boxes').insert({
      owner_id: owner.id, name: `ZZ INV ${tag} ${stamp}`, slug: `zz-inv-${tag}-${stamp}`,
      invite_code: `ZI${tag}${String(stamp).slice(-4)}`, is_active: true, is_listed: true,
      city: 'Lyon',
    }).select('id').single();
    if (error) throw error;
    created.boxes.push(data.id);
    await svc.from('box_members').insert({ box_id: data.id, member_id: owner.id, role: 'owner', status: 'active' });
    return data.id;
  };
  const boxA = await mkBox(ownerA, 'A');
  const boxB = await mkBox(ownerB, 'B');
  await svc.from('box_members').insert({ box_id: boxA, member_id: coachA.id, role: 'coach', status: 'active' });

  const mkPlan = async (boxId, name) => (await svc.from('membership_plans').insert({
    box_id: boxId, name, price_cents: 5900, currency: 'eur', plan_type: 'subscription',
    max_sessions_per_week: 3, is_active: true,
  }).select('id').single()).data.id;
  const planA = await mkPlan(boxA, `Illimité ${stamp}`);
  const planB = await mkPlan(boxB, `Illimité B ${stamp}`);

  // ── 1. Qui peut créer une invitation ──────────────────────────────────────

  const r1 = await invite(ownerA, {
    p_box_id: boxA, p_email: `ZZ.Nouveau.${stamp}@Test.athlex.io`,
    p_first_name: 'Léa', p_last_name: 'Martin', p_plan_id: planA,
    p_payment_mode: 'box', p_cash_collected: true,
  });
  check('gérant de la box — création d\'une invitation : ACCEPTÉE',
    r1.data?.ok === true && typeof r1.data?.token === 'string' && r1.data.token.length === 64,
    r1.error?.message ?? `jeton de ${r1.data?.token?.length} caractères`);
  check('l\'e-mail est normalisé en minuscules', r1.data?.email === `zz.nouveau.${stamp}@test.athlex.io`, r1.data?.email);

  const r2 = await invite(coachA, { p_box_id: boxA, p_email: `zz.coachinvite.${stamp}@test.athlex.io` });
  check('coach de la box — création : ACCEPTÉE (is_box_admin)', r2.data?.ok === true, r2.error?.message ?? 'ok');

  const r3 = await invite(ownerB, { p_box_id: boxA, p_email: `zz.pirate.${stamp}@test.athlex.io` });
  check('gérant d\'une AUTRE box — création sur la box A : REFUSÉE',
    !!r3.error && /FORBIDDEN/.test(r3.error.message), r3.error?.message ?? 'acceptée (!)');

  const r4 = await invite(athlete, { p_box_id: boxA, p_email: `zz.pirate2.${stamp}@test.athlex.io` });
  check('athlète simple — création : REFUSÉE',
    !!r4.error && /FORBIDDEN/.test(r4.error.message), r4.error?.message ?? 'acceptée (!)');

  const { error: anonCreate } = await anon.rpc('create_box_invitation', {
    p_box_id: boxA, p_email: `zz.anon.${stamp}@test.athlex.io`,
  });
  check('anon — création : REFUSÉE', !!anonCreate, anonCreate?.message ?? 'acceptée (!)');

  // Une formule d'une autre box ne peut pas être attachée.
  const r5 = await invite(ownerA, { p_box_id: boxA, p_email: `zz.plan.${stamp}@test.athlex.io`, p_plan_id: planB });
  check('formule appartenant à une autre box : REFUSÉE',
    !!r5.error && /PLAN_NOT_IN_BOX/.test(r5.error.message), r5.error?.message ?? 'acceptée (!)');

  const r6 = await invite(ownerA, { p_box_id: boxA, p_email: `zz.nouveau.${stamp}@test.athlex.io` });
  check('doublon — 2e invitation en attente pour la même adresse : REFUSÉE',
    !!r6.error && /INVITATION_EXISTS/.test(r6.error.message), r6.error?.message ?? 'acceptée (!)');

  const r7 = await invite(ownerA, { p_box_id: boxA, p_email: 'pas-une-adresse' });
  check('adresse invalide : REFUSÉE', !!r7.error && /INVALID_EMAIL/.test(r7.error.message), r7.error?.message ?? 'acceptée (!)');

  // ── 2. Le jeton n'existe en clair nulle part ──────────────────────────────

  const clearCols = sql(`SELECT count(*) FROM public.box_invitations WHERE token_hash = '${r1.data.token}'`);
  check('le jeton brut n\'est PAS stocké : la table ne garde que son SHA-256', clearCols === '0', `${clearCols} ligne(s)`);
  const hashed = sql(`SELECT count(*) FROM public.box_invitations WHERE token_hash = encode(sha256('${r1.data.token}'::bytea),'hex')`);
  check('… et le haché correspond bien à l\'invitation créée', hashed === '1', `${hashed} ligne(s)`);

  // ── 3. Lecture directe de la table ────────────────────────────────────────

  const { data: anonRows } = await anon.from('box_invitations').select('id, email, token_hash');
  check('anon — lecture directe de box_invitations : REFUSÉE', (anonRows?.length ?? 0) === 0, `${anonRows?.length ?? 0} ligne(s)`);

  const { data: athleteRows } = await athlete.client.from('box_invitations').select('id, email');
  check('athlète — lecture directe de box_invitations : REFUSÉE', (athleteRows?.length ?? 0) === 0, `${athleteRows?.length ?? 0} ligne(s)`);

  const { data: ownerBRows } = await ownerB.client.from('box_invitations').select('id, email');
  check('gérant d\'une autre box — lecture des invitations de la box A : REFUSÉE',
    (ownerBRows?.length ?? 0) === 0, `${ownerBRows?.length ?? 0} ligne(s)`);

  const { data: ownerARows } = await ownerA.client.from('box_invitations').select('id, email, status');
  check('gérant de la box — lecture de SES invitations : acceptée',
    (ownerARows?.length ?? 0) === 2, `${ownerARows?.length ?? 0} ligne(s)`);

  const { error: forgeErr } = await ownerB.client.from('box_invitations')
    .insert({ box_id: boxA, email: `zz.forge.${stamp}@test.athlex.io`, token_hash: 'ff', expires_at: new Date(Date.now() + 86400000).toISOString() });
  check('gérant d\'une autre box — INSERT direct dans la table : REFUSÉ',
    !!forgeErr, forgeErr?.message ?? 'accepté (!)');

  // ── 4. La lecture publique par jeton, et ce qu'elle ne dit pas ────────────

  const { data: peek } = await anon.rpc('peek_box_invitation', { p_token: r1.data.token });
  const peekKeys = Object.keys(peek ?? {}).sort().join(',');
  check('anon — peek d\'un jeton valide : renvoie box + formule + destinataire',
    peek?.ok === true && peek.box?.name?.includes('ZZ INV A') && peek.plan?.price_cents === 5900 && peek.first_name === 'Léa',
    peekKeys);
  const peekJson = JSON.stringify(peek);
  check('peek — ne fuite ni le créateur, ni le jeton, ni les identifiants internes',
    !peekJson.includes(ownerA.id) && !peekJson.includes(r1.data.token) && !peekJson.includes(planA)
      && !/created_by|invited_by|token/.test(peekKeys),
    peekKeys);
  check('peek — ne fuite aucun autre membre ni aucune autre invitation',
    !peekJson.includes(coachA.id) && !peekJson.includes('coachinvite'), 'aucune trace');

  const { data: peekUnknown } = await anon.rpc('peek_box_invitation', { p_token: 'f'.repeat(64) });
  check('peek — jeton inconnu : refus sans rien révéler',
    peekUnknown?.ok === false && peekUnknown.reason === 'invitation_introuvable', JSON.stringify(peekUnknown));

  // ── 5. Consommation : l'e-mail fait foi ───────────────────────────────────

  const rWrongMail = await athlete.client.rpc('consume_box_invitation', { p_token: r1.data.token });
  check('compte dont l\'e-mail ne correspond pas : REFUSÉ (lien qui fuite = inutilisable)',
    rWrongMail.data?.ok === false && rWrongMail.data.reason === 'email_non_correspondant',
    JSON.stringify(rWrongMail.data ?? rWrongMail.error?.message));
  check('… et aucun rattachement n\'a eu lieu', (await memberRow(boxA, athlete.id)) === null, 'aucune ligne box_members');

  const { error: anonConsume } = await anon.rpc('consume_box_invitation', { p_token: r1.data.token });
  check('anon — consommation : REFUSÉE', !!anonConsume, anonConsume?.message ?? 'acceptée (!)');

  // Le destinataire crée son compte (chemin réel : e-mail de l'invitation).
  const invitee = await mkUser(`invite`, 'member');
  await svc.from('profiles').update({ email: `zz.nouveau.${stamp}@test.athlex.io` }).eq('id', invitee.id);

  const rConsume = await invitee.client.rpc('consume_box_invitation', { p_token: r1.data.token });
  const mConsume = await memberRow(boxA, invitee.id);
  check('destinataire — consommation : rattaché à la box avec la formule',
    rConsume.data?.ok === true && mConsume?.plan_id === planA,
    JSON.stringify(rConsume.data ?? rConsume.error?.message));
  check('mode box + « déjà encaissé » — membre ACTIF et visible dans Abonnés',
    mConsume?.status === 'active' && mConsume?.subscription_status === 'active' && mConsume?.payment_method_type === 'cash',
    JSON.stringify(mConsume));

  const rReuse = await invitee.client.rpc('consume_box_invitation', { p_token: r1.data.token });
  check('rejeu du même lien par la même personne : idempotent',
    rReuse.data?.ok === true && rReuse.data.already === true, JSON.stringify(rReuse.data));

  const rStolen = await intruder.client.rpc('consume_box_invitation', { p_token: r1.data.token });
  check('usage unique — un tiers rejouant un lien déjà consommé : REFUSÉ',
    rStolen.data?.ok === false && rStolen.data.reason === 'invitation_deja_utilisee'
      && (await memberRow(boxA, intruder.id)) === null,
    JSON.stringify(rStolen.data));

  const { data: peekUsed } = await anon.rpc('peek_box_invitation', { p_token: r1.data.token });
  check('peek — après consommation : refusé', peekUsed?.ok === false && peekUsed.reason === 'invitation_deja_utilisee', JSON.stringify(peekUsed));

  // ── 6. Expiration et révocation ───────────────────────────────────────────

  const rExp = await invite(ownerA, { p_box_id: boxA, p_email: `zz.expire.${stamp}@test.athlex.io` });
  sql(`UPDATE public.box_invitations SET expires_at = now() - interval '1 hour'
        WHERE token_hash = encode(sha256('${rExp.data.token}'::bytea),'hex')`);
  const expUser = await mkUser('expire');
  await svc.from('profiles').update({ email: `zz.expire.${stamp}@test.athlex.io` }).eq('id', expUser.id);
  const { data: peekExp } = await anon.rpc('peek_box_invitation', { p_token: rExp.data.token });
  const rExpConsume = await expUser.client.rpc('consume_box_invitation', { p_token: rExp.data.token });
  check('invitation expirée — peek ET consommation : REFUSÉES',
    peekExp?.reason === 'invitation_expiree' && rExpConsume.data?.reason === 'invitation_expiree'
      && (await memberRow(boxA, expUser.id)) === null,
    `${peekExp?.reason} / ${rExpConsume.data?.reason}`);

  const rRev = await invite(ownerA, { p_box_id: boxA, p_email: `zz.revoque.${stamp}@test.athlex.io` });
  const revUser = await mkUser('revoque');
  await svc.from('profiles').update({ email: `zz.revoque.${stamp}@test.athlex.io` }).eq('id', revUser.id);
  const { error: revokeErr } = await ownerA.client.from('box_invitations')
    .update({ status: 'revoked' }).eq('id', rRev.data.id);
  const { data: peekRev } = await anon.rpc('peek_box_invitation', { p_token: rRev.data.token });
  const rRevConsume = await revUser.client.rpc('consume_box_invitation', { p_token: rRev.data.token });
  check('invitation révoquée par le gérant — peek ET consommation : REFUSÉES',
    !revokeErr && peekRev?.reason === 'invitation_revoquee' && rRevConsume.data?.reason === 'invitation_revoquee'
      && (await memberRow(boxA, revUser.id)) === null,
    `${revokeErr?.message ?? ''} ${peekRev?.reason} / ${rRevConsume.data?.reason}`);

  // Une invitation expirée libère la place : le gérant peut réinviter.
  const rAgain = await invite(ownerA, { p_box_id: boxA, p_email: `zz.expire.${stamp}@test.athlex.io` });
  check('après expiration — le gérant peut réinviter la même adresse', rAgain.data?.ok === true,
    rAgain.error?.message ?? 'ok');

  // ── 7. Un jeton de la box A ne rattache jamais à la box B ─────────────────

  const rB = await invite(ownerB, { p_box_id: boxB, p_email: `zz.croise.${stamp}@test.athlex.io`, p_plan_id: planB, p_cash_collected: true });
  const crossUser = await mkUser('croise');
  await svc.from('profiles').update({ email: `zz.croise.${stamp}@test.athlex.io` }).eq('id', crossUser.id);
  const rCross = await crossUser.client.rpc('consume_box_invitation', { p_token: rB.data.token });
  const sig = sql(`SELECT pg_get_function_identity_arguments(oid) FROM pg_proc
                    WHERE proname='consume_box_invitation' AND pronamespace='public'::regnamespace`);
  check('consume_box_invitation — sa signature ne porte AUCUN identifiant de box', sig === 'p_token text', sig);
  check('jeton de la box B — rattache à B, et à B seulement',
    rCross.data?.box_id === boxB && (await memberRow(boxA, crossUser.id)) === null
      && (await memberRow(boxB, crossUser.id))?.status === 'active',
    `box_id=${rCross.data?.box_id === boxB ? 'B' : rCross.data?.box_id}`);

  // ── 8. Mode « à encaisser » et bascule en un clic ─────────────────────────

  const rCash = await invite(ownerA, { p_box_id: boxA, p_email: `zz.acaisser.${stamp}@test.athlex.io`, p_plan_id: planA, p_payment_mode: 'box', p_cash_collected: false });
  const cashUser = await mkUser('acaisser');
  await svc.from('profiles').update({ email: `zz.acaisser.${stamp}@test.athlex.io` }).eq('id', cashUser.id);
  await cashUser.client.rpc('consume_box_invitation', { p_token: rCash.data.token });
  const mBefore = await memberRow(boxA, cashUser.id);
  check('mode box NON encaissé — rattaché « à encaisser », SANS accès',
    mBefore?.status === 'inactive' && mBefore?.subscription_status === 'pending_cash', JSON.stringify(mBefore));

  const { error: cashOther } = await ownerB.client.rpc('mark_box_invitation_paid', { p_invitation_id: rCash.data.id });
  check('encaissement par le gérant d\'une AUTRE box : REFUSÉ', !!cashOther, cashOther?.message ?? 'accepté (!)');

  const { data: cashOk } = await ownerA.client.rpc('mark_box_invitation_paid', { p_invitation_id: rCash.data.id });
  const mAfter = await memberRow(boxA, cashUser.id);
  check('encaissement par le gérant de la box — le membre passe ACTIF',
    cashOk?.ok === true && mAfter?.status === 'active' && mAfter?.subscription_status === 'active'
      && mAfter?.payment_method_type === 'cash',
    JSON.stringify(mAfter));

  // ── 9. Mode stripe : la consommation n'active JAMAIS ──────────────────────

  const rStripe = await invite(ownerA, { p_box_id: boxA, p_email: `zz.stripe.${stamp}@test.athlex.io`, p_plan_id: planA, p_payment_mode: 'stripe' });
  const stripeUser = await mkUser('stripe');
  await svc.from('profiles').update({ email: `zz.stripe.${stamp}@test.athlex.io` }).eq('id', stripeUser.id);
  const rStripeConsume = await stripeUser.client.rpc('consume_box_invitation', { p_token: rStripe.data.token });
  const mStripe = await memberRow(boxA, stripeUser.id);
  check('mode stripe — la consommation inscrit « en attente de paiement », sans accès',
    rStripeConsume.data?.ok === true && mStripe?.status === 'inactive'
      && mStripe?.subscription_status === 'pending_payment',
    JSON.stringify(mStripe));
  check('mode stripe — le membre n\'a PAS accès à la box (get_user_box_ids exige status actif)',
    sql(`SELECT count(*) FROM public.box_members WHERE member_id='${stripeUser.id}' AND status='active'`) === '0',
    'aucune adhésion active');

  const { error: cashOnStripe } = await ownerA.client.rpc('mark_box_invitation_paid', { p_invitation_id: rStripe.data.id });
  check('« encaissé au comptoir » sur une invitation Stripe : REFUSÉ',
    !!cashOnStripe && /NOT_CASH_MODE/.test(cashOnStripe.message), cashOnStripe?.message ?? 'accepté (!)');

  // ── 10. Un membre exclu ne revient pas par une invitation ─────────────────

  const banned = await mkUser('banni');
  await svc.from('box_members').insert({ box_id: boxA, member_id: banned.id, role: 'member', status: 'banned' });
  const rBan = await invite(ownerA, { p_box_id: boxA, p_email: banned.email, p_cash_collected: true });
  const rBanConsume = await banned.client.rpc('consume_box_invitation', { p_token: rBan.data.token });
  check('membre exclu de la box — consommation : REFUSÉE, il reste banni',
    rBanConsume.data?.ok === false && rBanConsume.data.reason === 'membre_exclu'
      && (await memberRow(boxA, banned.id))?.status === 'banned',
    JSON.stringify(rBanConsume.data));

  // ── 11. Non-régression : une inscription SANS invitation ne gagne rien ────

  const plain = await mkUser('sansinvit');
  const { data: plainBoxes } = await svc.from('box_members').select('box_id').eq('member_id', plain.id);
  check('inscription SANS invitation — aucun rattachement, aucune formule (non-régression)',
    (plainBoxes?.length ?? 0) === 0, `${plainBoxes?.length ?? 0} adhésion(s)`);

  const joinCode = await plain.client.rpc('join_box_by_invite', { p_invite_code: `ZIA${String(stamp).slice(-4)}` });
  check('adhésion par code partagé — toujours fonctionnelle (non-régression)',
    !joinCode.error && (await memberRow(boxA, plain.id))?.status === 'active',
    joinCode.error?.message ?? 'ok');

  // ── 12. Grants ────────────────────────────────────────────────────────────

  const grants = sql(`SELECT coalesce(string_agg(p.proname||':'||pg_get_userbyid(a.grantee), ', ' ORDER BY 1), 'aucun')
                        FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
                       WHERE p.pronamespace='public'::regnamespace
                         AND p.proname LIKE '%box_invitation%'
                         AND pg_get_userbyid(a.grantee) IN ('anon','authenticated','public')`);
  check('grants — seule peek_box_invitation est ouverte à anon',
    grants.includes('peek_box_invitation:anon')
      && !grants.includes('create_box_invitation:anon')
      && !grants.includes('consume_box_invitation:anon')
      && !grants.includes('mark_box_invitation_paid:anon'),
    grants);

  const tableGrants = sql(`SELECT coalesce(string_agg(grantee||':'||privilege_type, ',' ORDER BY 1), 'aucun')
                             FROM information_schema.role_table_grants
                            WHERE table_schema='public' AND table_name='box_invitations' AND grantee='anon'`);
  check('grants — anon n\'a aucun droit sur la table box_invitations', tableGrants === 'aucun', tableGrants);
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
