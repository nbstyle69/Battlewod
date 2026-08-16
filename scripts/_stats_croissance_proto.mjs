// Protocole « Statistiques — lot 3 Croissance » (20261028).
//
// Frontières et exactitude à prouver, au vrai JWT :
//   • le funnel est une COHORTE : « abonnés » est un sous-ensemble de
//     « membres » de la même période, jamais un compteur indépendant ;
//   • une invitation est comptée « envoyée » à sa création et « acceptée » à sa
//     date d'acceptation, pas à celle de l'envoi ;
//   • gérant d'une AUTRE box, athlète et anon sont REFUSÉS par exception ;
//   • le récapitulatif hebdomadaire est réservé au service : un gérant, même
//     légitime sur sa box, ne peut pas récolter les e-mails de tous les gérants ;
//   • une box qui s'est désabonnée sort du lot d'envoi, les autres restent ;
//   • aucune ligne d'une box ne contient les chiffres d'une autre.
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
  const email = `zz_fun_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_fun_${suffix}_${stamp}`, level: 'inter', role, elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, email, client };
};

const iso = days => new Date(Date.now() + days * 86400000).toISOString();
const day = days => iso(days).slice(0, 10);

try {
  const ownerA = await mkUser('ownerA', 'box_owner');
  const ownerB = await mkUser('ownerB', 'box_owner');
  const athleteA = await mkUser('athleteA');

  const mkBox = async (owner, tag) => {
    const { data, error } = await svc.from('boxes').insert({
      owner_id: owner.id, name: `ZZ FUN ${tag} ${stamp}`, slug: `zz-fun-${tag}-${stamp}`,
      invite_code: `ZF${tag}${String(stamp).slice(-4)}`, is_active: true, is_listed: true, city: 'Lyon',
    }).select('id').single();
    if (error) throw error;
    created.boxes.push(data.id);
    return data.id;
  };
  const boxA = await mkBox(ownerA, 'A');
  const boxB = await mkBox(ownerB, 'B');

  const mkMember = async (boxId, tag, patch = {}) => {
    const u = await mkUser(tag);
    const { error } = await svc.from('box_members').insert({
      box_id: boxId, member_id: u.id, role: 'member', status: 'active', ...patch,
    });
    if (error) throw error;
    return u;
  };

  // ── Cohorte de la box A ───────────────────────────────────────────────────
  // 3 adhésions dans la fenêtre, dont 1 abonnée ; 1 adhésion hors fenêtre mais
  // abonnée — elle ne doit gonfler aucun des deux étages.
  await mkMember(boxA, 'm1', { joined_at: iso(-5), subscription_status: 'active' });
  await mkMember(boxA, 'm2', { joined_at: iso(-10) });
  await mkMember(boxA, 'm3', { joined_at: iso(-20), subscription_status: 'past_due' });
  await mkMember(boxA, 'vieux', { joined_at: iso(-90), subscription_status: 'active' });
  // Un coach n'est pas une acquisition commerciale.
  const coachA = await mkUser('coachA');
  await svc.from('box_members').insert({
    box_id: boxA, member_id: coachA.id, role: 'coach', status: 'active', joined_at: iso(-3),
  });
  await mkMember(boxB, 'mB', { joined_at: iso(-5), subscription_status: 'active' });

  // Prospects (funnel C3) : 2 sur la période, dont 1 converti ; 1 hors fenêtre.
  const prospect1 = await mkUser('prospect1');
  const prospect2 = await mkUser('prospect2');
  const prospect3 = await mkUser('prospect3');
  await svc.from('session_followups').insert([
    { box_id: boxA, member_id: prospect1.id, status: 'pending', first_seen_at: iso(-4) },
    { box_id: boxA, member_id: prospect2.id, status: 'converted', first_seen_at: iso(-8) },
    { box_id: boxA, member_id: prospect3.id, status: 'pending', first_seen_at: iso(-95) },
  ]);

  // Invitations : 2 créées dans la fenêtre (dont 1 acceptée), et 1 créée AVANT
  // la fenêtre mais acceptée DEDANS — la conversion appartient à la période.
  await svc.from('box_invitations').insert([
    { box_id: boxA, email: `zz1_${stamp}@test.io`, token_hash: `h1_${stamp}`, expires_at: iso(10), created_at: iso(-6), status: 'pending' },
    { box_id: boxA, email: `zz2_${stamp}@test.io`, token_hash: `h2_${stamp}`, expires_at: iso(10), created_at: iso(-7), status: 'accepted', accepted_at: iso(-6) },
    { box_id: boxA, email: `zz3_${stamp}@test.io`, token_hash: `h3_${stamp}`, expires_at: iso(10), created_at: iso(-80), status: 'accepted', accepted_at: iso(-9) },
    { box_id: boxB, email: `zz4_${stamp}@test.io`, token_hash: `h4_${stamp}`, expires_at: iso(10), created_at: iso(-6), status: 'pending' },
  ]);

  const win = { p_box_id: boxA, p_from: iso(-30), p_to: iso(1) };

  // ── Funnel ────────────────────────────────────────────────────────────────
  const { data: fA, error: eA } = await ownerA.client.rpc('get_box_funnel_summary', win);
  const f = Array.isArray(fA) ? fA[0] : fA;
  check('le gérant lit son funnel', !eA && !!f, eA?.message ?? '');
  check('2 prospects sur la période, dont 1 converti (le 3e est hors fenêtre)',
    f.prospects === 2 && f.prospects_converted === 1, `${f.prospects}/${f.prospects_converted}`);
  check('2 invitations envoyées, 2 acceptées — dont une envoyée avant la fenêtre',
    f.invitations_sent === 2 && f.invitations_accepted === 2,
    `${f.invitations_sent}/${f.invitations_accepted}`);
  check('3 adhésions dans la fenêtre — ni le coach, ni le membre de 90 jours',
    f.members_joined === 3, `${f.members_joined}`);
  check('1 seule abonnée dans la cohorte : un impayé n\'est pas un abonné',
    f.members_subscribed === 1, `${f.members_subscribed}`);
  check('les abonnés sont un sous-ensemble des membres (taux ≤ 100 %)',
    f.members_subscribed <= f.members_joined, `${f.members_subscribed}/${f.members_joined}`);

  const { data: fB } = await ownerB.client.rpc('get_box_funnel_summary', { ...win, p_box_id: boxB });
  const fb = Array.isArray(fB) ? fB[0] : fB;
  check('la box B ne voit que ses propres chiffres',
    fb.members_joined === 1 && fb.invitations_sent === 1 && fb.prospects === 0,
    `${fb.members_joined}/${fb.invitations_sent}/${fb.prospects}`);

  // ── Refus ─────────────────────────────────────────────────────────────────
  const { error: eOther } = await ownerB.client.rpc('get_box_funnel_summary', win);
  check('le gérant d\'une AUTRE box est refusé', !!eOther, eOther?.code ?? '');
  const { error: eAth } = await athleteA.client.rpc('get_box_funnel_summary', win);
  check('un athlète est refusé', !!eAth, eAth?.code ?? '');
  const { error: eAnon } = await anon.rpc('get_box_funnel_summary', win);
  check('anon est refusé', !!eAnon, eAnon?.code ?? '');

  // ── Récapitulatif hebdomadaire : réservé au service ───────────────────────
  const { error: eDigestOwner } = await ownerA.client.rpc('get_weekly_digest_batch', { p_days: 7 });
  check('un gérant ne récolte pas les e-mails de tous les gérants', !!eDigestOwner, eDigestOwner?.code ?? '');
  const { error: eDigestAnon } = await anon.rpc('get_weekly_digest_batch', { p_days: 7 });
  check('anon n\'appelle pas le récapitulatif', !!eDigestAnon, eDigestAnon?.code ?? '');

  const { data: batch, error: eBatch } = await svc.rpc('get_weekly_digest_batch', { p_days: 30 });
  check('le service obtient le lot d\'envoi', !eBatch && Array.isArray(batch), eBatch?.message ?? '');
  const lineA = (batch ?? []).find(r => r.box_id === boxA);
  const lineB = (batch ?? []).find(r => r.box_id === boxB);
  check('la ligne de la box A porte son gérant et ses chiffres',
    lineA?.owner_email === ownerA.email && lineA?.new_members === 3,
    `${lineA?.owner_email} / ${lineA?.new_members}`);
  check('la box A ne contient aucun chiffre de la box B',
    lineA?.new_members !== lineB?.new_members && lineB?.new_members === 1,
    `A=${lineA?.new_members} B=${lineB?.new_members}`);
  check('l\'impayé de la box A est signalé au gérant', lineA?.past_due_count === 1, `${lineA?.past_due_count}`);

  // ── Opt-out ───────────────────────────────────────────────────────────────
  const { error: eOptOut } = await ownerA.client.from('box_owner_email_prefs')
    .upsert({ box_id: boxA, user_id: ownerA.id, weekly_digest: false });
  check('le gérant se désabonne lui-même', !eOptOut, eOptOut?.message ?? '');

  const { data: batch2 } = await svc.rpc('get_weekly_digest_batch', { p_days: 30 });
  check('la box désabonnée sort du lot, les autres y restent',
    !(batch2 ?? []).some(r => r.box_id === boxA) && (batch2 ?? []).some(r => r.box_id === boxB), '');

  const { error: eForeign } = await ownerB.client.from('box_owner_email_prefs')
    .upsert({ box_id: boxA, user_id: ownerB.id, weekly_digest: false });
  check('un gérant tiers n\'écrit pas de préférence sur une box étrangère', !!eForeign, eForeign?.code ?? '');

  const { data: readOther } = await ownerB.client.from('box_owner_email_prefs')
    .select('box_id').eq('box_id', boxA);
  check('un gérant tiers ne lit pas la préférence d\'une autre box',
    (readOther ?? []).length === 0, `${(readOther ?? []).length}`);

  // ── Grants et search_path ─────────────────────────────────────────────────
  const gFunnel = sql(`SELECT coalesce(string_agg(DISTINCT r.rolname, ',' ORDER BY r.rolname), '')
                         FROM pg_proc p, aclexplode(p.proacl) a JOIN pg_roles r ON r.oid = a.grantee
                        WHERE p.proname = 'get_box_funnel_summary'`);
  check('grants : pas d\'anon sur le funnel', !gFunnel.split(',').includes('anon'), gFunnel);

  const gDigest = sql(`SELECT coalesce(string_agg(DISTINCT r.rolname, ',' ORDER BY r.rolname), '')
                         FROM pg_proc p, aclexplode(p.proacl) a JOIN pg_roles r ON r.oid = a.grantee
                        WHERE p.proname = 'get_weekly_digest_batch'`);
  check('grants : ni anon ni authenticated sur le récapitulatif',
    !gDigest.split(',').some(r => r === 'anon' || r === 'authenticated'), gDigest);

  const paths = sql(`SELECT count(*) FROM pg_proc
                      WHERE proname IN ('get_box_funnel_summary','get_weekly_digest_batch')
                        AND 'search_path=public, pg_temp' = ANY(proconfig)`);
  check('search_path figé sur les 2 RPC', paths === '2', paths);

  const anonTable = sql(`SELECT count(*) FROM information_schema.role_table_grants
                          WHERE table_name = 'box_owner_email_prefs' AND grantee = 'anon'`);
  check('anon n\'a aucun droit sur la table de préférences', anonTable === '0', anonTable);
  void day;
} finally {
  for (const b of created.boxes) sql(`DELETE FROM boxes WHERE id = '${b}'`);
  for (const u of created.users) {
    await svc.auth.admin.deleteUser(u).catch(() => {});
    sql(`DELETE FROM profiles WHERE id = '${u}'`);
  }
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
