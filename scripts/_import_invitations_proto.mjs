// Protocole « Portabilité — lot A : import en masse d'invitations » (20261029).
//
// Ce que le lot doit prouver, au vrai JWT :
//   • un import n'écrit JAMAIS un membre — seulement des invitations ;
//   • une ligne pourrie ne bloque pas les lignes valides (rapport ligne à ligne) ;
//   • les gardes du chantier invitations valent aussi sur le chemin bulk :
//     formule d'une AUTRE box refusée, membre exclu refusé, membre actif ignoré,
//     invitation déjà en attente ignorée ;
//   • un doublon interne au fichier ne crée qu'une invitation ;
//   • un gérant d'une autre box, un athlète et anon sont refusés ;
//   • le plafond de 500 lignes est un refus net, pas une troncature silencieuse ;
//   • aucun jeton n'est renvoyé par le lot ;
//   • les deux gardes manquantes valent aussi sur la création UNITAIRE.
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
  const email = `zz_imp_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_imp_${suffix}_${stamp}`, level: 'inter', role, elo: 1000,
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  return { id: data.user.id, email, client };
};

// Indexé par NUMÉRO DE LIGNE : deux lignes peuvent porter la même adresse, et
// c'est justement le cas que le doublon interne doit distinguer.
const verdicts = report => Object.fromEntries(
  (report?.results ?? []).map(r => [r.line, `${r.verdict}${r.reason ? ':' + r.reason : ''}`]),
);

try {
  const ownerA = await mkUser('ownerA', 'box_owner');
  const ownerB = await mkUser('ownerB', 'box_owner');
  const athlete = await mkUser('athlete');

  const mkBox = async (owner, tag) => {
    const { data, error } = await svc.from('boxes').insert({
      owner_id: owner.id, name: `ZZ IMP ${tag} ${stamp}`, slug: `zz-imp-${tag}-${stamp}`,
      invite_code: `ZI${tag}${String(stamp).slice(-4)}`, is_active: true, city: 'Lyon',
    }).select('id').single();
    if (error) throw error;
    created.boxes.push(data.id);
    return data.id;
  };
  const boxA = await mkBox(ownerA, 'A');
  const boxB = await mkBox(ownerB, 'B');

  const mkPlan = async (boxId, name) => {
    const { data, error } = await svc.from('membership_plans').insert({
      box_id: boxId, name, price_cents: 6900, plan_type: 'subscription', is_active: true,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  };
  const planA = await mkPlan(boxA, `Illimité ${stamp}`);
  const planB = await mkPlan(boxB, `Étranger ${stamp}`);

  // Membres déjà en place : un actif (à ignorer) et un exclu (à refuser).
  const actif = await mkUser('actif');
  const exclu = await mkUser('exclu');
  const parti = await mkUser('parti');
  await svc.from('box_members').insert([
    { box_id: boxA, member_id: actif.id, role: 'member', status: 'active' },
    { box_id: boxA, member_id: exclu.id, role: 'member', status: 'banned' },
    { box_id: boxA, member_id: parti.id, role: 'member', status: 'inactive' },
  ]);

  // Invitation déjà vivante pour une adresse du fichier.
  const dejaInvite = `zz_deja_${stamp}@test.io`;
  await svc.from('box_invitations').insert({
    box_id: boxA, email: dejaInvite, token_hash: `hdeja_${stamp}`,
    expires_at: new Date(Date.now() + 6 * 86400000).toISOString(), status: 'pending',
  });

  // ── L'export Excel français, avec ses lignes moches ──────────────────────
  const neuf1 = `zz_neuf1_${stamp}@test.io`;
  const neuf2 = `zz_neuf2_${stamp}@test.io`;
  const rows = [
    { line: 1, email: neuf1,        first_name: ' Élodie ', last_name: 'Durand', plan_id: planA },
    { line: 2, email: neuf2,        first_name: 'Jean',     last_name: 'Bon' },
    { line: 3, email: neuf1,        first_name: 'Doublon',  last_name: 'Interne' },
    { line: 4, email: actif.email,  first_name: 'Déjà',     last_name: 'Membre' },
    { line: 5, email: exclu.email,  first_name: 'Personne', last_name: 'Exclue' },
    { line: 6, email: dejaInvite,   first_name: 'Déjà',     last_name: 'Invité' },
    { line: 7, email: 'pas-un-email', first_name: 'Faux',   last_name: 'Mail' },
    { line: 8, email: `zz_piege_${stamp}@test.io`, plan_id: planB },
    { line: 9, email: parti.email,  first_name: 'Ancien',   last_name: 'Membre' },
  ];

  const { data: repRaw, error: eBulk } = await ownerA.client.rpc('create_box_invitations_bulk', {
    p_box_id: boxA, p_rows: rows,
  });
  const rep = repRaw;
  check('le gérant importe son fichier', !eBulk && rep?.ok === true, eBulk?.message ?? '');

  const v = verdicts(rep);
  check('ligne valide → créée', v[1] === 'creee', v[1]);
  check('deuxième ligne valide → créée (une ligne pourrie ne bloque pas)', v[2] === 'creee', v[2]);
  check('doublon interne au fichier → ignoré', v[3] === 'ignoree:doublon_fichier', v[3]);
  check('membre déjà actif → ignoré', v[4] === 'ignoree:deja_membre', v[4]);
  check('membre exclu → REFUSÉ (et non découvert à la consommation)', v[5] === 'refusee:membre_exclu', v[5]);
  check('invitation déjà en attente → ignorée', v[6] === 'ignoree:invitation_en_attente', v[6]);
  check('e-mail invalide → refusé', v[7] === 'refusee:email_invalide', v[7]);
  check('formule d\'une AUTRE box → refusée', v[8] === 'refusee:formule_inconnue', v[8]);
  check('ancien membre inactif → invité (le renouvellement reste ouvert)', v[9] === 'creee', v[9]);
  check('totaux cohérents avec les lignes', rep.total === 9 && rep.created === 3
    && rep.ignored === 3 && rep.refused === 3,
    `total ${rep.total} · créées ${rep.created} · ignorées ${rep.ignored} · refusées ${rep.refused}`);

  const tokens = JSON.stringify(rep.results).match(/"token"/g);
  check('aucun jeton renvoyé par le lot', tokens === null);

  // ── L'import n'a écrit AUCUN membre ──────────────────────────────────────
  const membres = sql(`SELECT count(*) FROM box_members WHERE box_id = '${boxA}'`);
  check('aucun membre créé par l\'import', membres === '3', membres);
  const invits = sql(`SELECT count(*) FROM box_invitations WHERE box_id = '${boxA}' AND status = 'pending'`);
  check('4 invitations vivantes (3 créées + celle qui existait)', invits === '4', invits);
  const planPose = sql(`SELECT plan_id FROM box_invitations WHERE box_id = '${boxA}' AND email = '${neuf1}'`);
  check('la formule de la ligne est bien posée', planPose === planA, planPose);
  const prenom = sql(`SELECT first_name FROM box_invitations WHERE box_id = '${boxA}' AND email = '${neuf1}'`);
  check('les espaces du fichier sont nettoyés', prenom === 'Élodie', `"${prenom}"`);

  // ── Frontières ────────────────────────────────────────────────────────────
  const { error: eOther } = await ownerB.client.rpc('create_box_invitations_bulk', {
    p_box_id: boxA, p_rows: [{ line: 1, email: `zz_intrus_${stamp}@test.io` }],
  });
  check('un gérant d\'une AUTRE box est refusé', !!eOther, eOther?.message ?? '');

  const { error: eAthlete } = await athlete.client.rpc('create_box_invitations_bulk', {
    p_box_id: boxA, p_rows: [{ line: 1, email: `zz_ath_${stamp}@test.io` }],
  });
  check('un athlète est refusé', !!eAthlete, eAthlete?.message ?? '');

  const { error: eAnon } = await anon.rpc('create_box_invitations_bulk', {
    p_box_id: boxA, p_rows: [{ line: 1, email: `zz_anon_${stamp}@test.io` }],
  });
  check('anon est refusé', !!eAnon, eAnon?.code ?? '');

  const apresIntrusions = sql(`SELECT count(*) FROM box_invitations WHERE box_id = '${boxA}'`);
  check('aucune invitation créée par les trois refus', apresIntrusions === '4', apresIntrusions);

  // ── Le fichier de 501 lignes ─────────────────────────────────────────────
  const gros = Array.from({ length: 501 }, (_, i) => ({ line: i + 1, email: `zz_gros_${i}_${stamp}@test.io` }));
  const { error: eGros } = await ownerA.client.rpc('create_box_invitations_bulk', {
    p_box_id: boxA, p_rows: gros,
  });
  check('501 lignes → refus net', !!eGros && /TOO_MANY_ROWS/.test(eGros?.message ?? ''), eGros?.message ?? '');
  const apresGros = sql(`SELECT count(*) FROM box_invitations WHERE box_id = '${boxA}'`);
  check('le refus du plafond n\'a rien écrit du tout (pas de troncature)', apresGros === '4', apresGros);

  const { data: rep500 } = await ownerA.client.rpc('create_box_invitations_bulk', {
    p_box_id: boxA, p_rows: gros.slice(0, 500),
  });
  check('500 lignes passent', rep500?.created === 500, `${rep500?.created}`);

  // ── Les mêmes gardes sur la création UNITAIRE ────────────────────────────
  const uni = (email, plan) => ownerA.client.rpc('create_box_invitation', {
    p_box_id: boxA, p_email: email, p_plan_id: plan ?? null,
  });
  const { error: eUniActif } = await uni(actif.email);
  check('unitaire : membre actif → message explicite',
    /MEMBER_EXISTS/.test(eUniActif?.message ?? ''), eUniActif?.message ?? '');
  const { error: eUniExclu } = await uni(exclu.email);
  check('unitaire : membre exclu → refusé à la création',
    /MEMBER_BANNED/.test(eUniExclu?.message ?? ''), eUniExclu?.message ?? '');
  const { error: eUniPlan } = await uni(`zz_uni_${stamp}@test.io`, planB);
  check('unitaire : formule d\'une autre box toujours refusée',
    /PLAN_NOT_IN_BOX/.test(eUniPlan?.message ?? ''), eUniPlan?.message ?? '');
  const { data: uniOk, error: eUniOk } = await uni(`zz_uni_ok_${stamp}@test.io`);
  check('unitaire : une invitation légitime passe toujours, avec son jeton',
    !eUniOk && typeof uniOk?.token === 'string', eUniOk?.message ?? '');

  // ── Grants et search_path ────────────────────────────────────────────────
  const gBulk = sql(`SELECT coalesce(string_agg(DISTINCT r.rolname, ',' ORDER BY r.rolname), '')
                       FROM pg_proc p, aclexplode(p.proacl) a JOIN pg_roles r ON r.oid = a.grantee
                      WHERE p.proname = 'create_box_invitations_bulk'`);
  check('grants : pas d\'anon sur l\'import', !gBulk.split(',').includes('anon'), gBulk);

  const gBlocker = sql(`SELECT coalesce(string_agg(DISTINCT r.rolname, ',' ORDER BY r.rolname), '')
                          FROM pg_proc p, aclexplode(p.proacl) a JOIN pg_roles r ON r.oid = a.grantee
                         WHERE p.proname = 'invitation_target_blocker'`);
  check('grants : la fonction interne n\'est ouverte ni à anon ni à authenticated',
    !gBlocker.split(',').some(r => r === 'anon' || r === 'authenticated'), gBlocker);

  const paths = sql(`SELECT count(*) FROM pg_proc
                      WHERE proname IN ('create_box_invitations_bulk','invitation_target_blocker','create_box_invitation')
                        AND 'search_path=public, pg_temp' = ANY(proconfig)`);
  check('search_path figé sur les 3 fonctions', paths === '3', paths);
} catch (e) {
  console.error('❌ Erreur du protocole :', e?.message ?? e);
  ko++;
} finally {
  for (const b of created.boxes) sql(`DELETE FROM boxes WHERE id = '${b}'`);
  for (const u of created.users) {
    await svc.auth.admin.deleteUser(u).catch(() => {});
    sql(`DELETE FROM profiles WHERE id = '${u}'`);
  }
  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
}
