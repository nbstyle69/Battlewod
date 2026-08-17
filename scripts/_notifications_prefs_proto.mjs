// Protocole « les préférences de notification sont réellement respectées »
// (20261030 + send-push + send-box-notification) — pile jetable, vrais JWT,
// VRAIES fonctions edge exécutées par Deno.
//
// Ce qui est prouvé se lit dans la RÉPONSE de la fonction, jamais à l'écran :
// `recipients` est le nombre de destinataires retenus APRÈS le filtre de
// préférence, `pref_disabled` ceux écartés par leur réglage, `dropped` ceux
// écartés par l'autorisation par relation.
//
// Pourquoi les fonctions sont réellement lancées et non simulées : le bug ne
// vivait pas dans une règle métier mais dans la FRONTIÈRE — un appelant qui
// omettait `pref_key` sautait le réglage. Un test qui réimplémenterait le
// filtre passerait sur le code fautif. Ici, chaque assertion traverse le vrai
// handler HTTP, avec un vrai JWT d'utilisateur.
//
// Cas central : un appel « à l'ancienne » (sans `pref_key`, comme le fait toute
// version d'app déjà installée) doit désormais respecter le réglage, parce que
// la catégorie est déduite côté serveur de `data.type`.
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error('Variables TEST_* manquantes'); process.exit(1); }
if (URL.includes('lkwdlqlbrbxaiydokfp')) { console.error('❌ Cible = PRODUCTION — refusé'); process.exit(1); }

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let ok = 0, ko = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

const stamp = Date.now();
const FN_PORT = 8000; // port par défaut de `serve()` de std/http
const FN_URL = `http://127.0.0.1:${FN_PORT}`;

// ── Lancement d'une fonction edge réelle ────────────────────────────────────
// `serve()` de std/http écoute le port passé par PORT ; les secrets sont ceux
// de la pile jetable. Aucun secret de production n'entre ici.
async function startFunction(name) {
  const proc = spawn('deno', [
    'run', '--allow-net', '--allow-env', '--quiet', '--no-config',
    `supabase/functions/${name}/index.ts`,
  ], {
    env: {
      ...process.env,
      PORT: String(FN_PORT),
      SUPABASE_URL: URL,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderr.on('data', d => {
    const s = d.toString();
    if (!/Listening|Warning|Download|Check /.test(s)) process.stderr.write(`[${name}] ${s}`);
  });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(FN_URL, { method: 'OPTIONS' });
      if (r.ok) { await r.text(); return proc; }
    } catch { /* pas encore prête */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`fonction ${name} injoignable sur ${FN_URL}`);
}
const stopFunction = async (proc) => {
  proc.kill('SIGKILL');
  await new Promise(r => setTimeout(r, 300));
};

const callFn = async (jwt, body) => {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
};

const created = { users: [], boxes: [] };

const mkUser = async (suffix) => {
  const email = `zz_ntf_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({
    email, password: 'Test1234!', email_confirm: true,
  });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_ntf_${suffix}_${stamp}`, level: 'inter', role: 'member',
  });
  if (pErr) throw pErr;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: session, error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  created.users.push(data.user.id);
  // Un token push par utilisateur : le chemin complet (jusqu'à la table des
  // tokens) est traversé, sinon `recipients` serait atteint sans jamais
  // toucher au fan-out réel.
  await svc.from('push_tokens').insert({
    user_id: data.user.id, token: `ExponentPushToken[zz-${suffix}-${stamp}]`, platform: 'android',
  });
  return { id: data.user.id, jwt: session.session.access_token, client };
};

const setPrefs = async (userId, prefs) => {
  const { error } = await svc.from('notification_preferences')
    .upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' });
  if (error) throw error;
};

const cleanup = async () => {
  for (const id of created.boxes) await svc.from('boxes').delete().eq('id', id);
  for (const id of created.users) {
    await svc.from('notification_preferences').delete().eq('user_id', id);
    await svc.from('push_tokens').delete().eq('user_id', id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }
};

(async () => {
  let fn = null;
  try {
    // ── Décor : une box, un gérant, quatre membres actifs ────────────────────
    const owner = await mkUser('own');
    const off = await mkUser('off');       // tout coupé
    const on = await mkUser('on');         // tout activé explicitement
    const naked = await mkUser('nak');     // AUCUNE ligne de préférence
    const partial = await mkUser('par');   // seulement certaines familles coupées
    const stranger = await mkUser('str');  // hors de la box

    const { data: box, error: bErr } = await svc.from('boxes').insert({
      owner_id: owner.id, name: `ZZ NTF ${stamp}`, slug: `zz-ntf-${stamp}`,
      invite_code: `ZN${String(stamp).slice(-5)}`, is_active: true, city: 'Lyon',
    }).select('id').single();
    if (bErr) throw bErr;
    created.boxes.push(box.id);

    await svc.from('box_members').insert(
      [owner, off, on, naked, partial].map(u => ({
        box_id: box.id, member_id: u.id,
        role: u.id === owner.id ? 'owner' : 'member', status: 'active',
      })),
    );

    const ALL_OFF = {
      daily_reminder: false, friend_requests: false, tournament_updates: false,
      score_updates: false, score_comments: false, score_reactions: false,
      score_reminder: false, class_reminders: false, new_wod: false,
      group_messages: false, elo_updates: false, box_announcements: false,
      badge_unlocks: false,
    };
    await setPrefs(off.id, ALL_OFF);
    await setPrefs(on.id, Object.fromEntries(Object.keys(ALL_OFF).map(k => [k, true])));
    await setPrefs(partial.id, { new_wod: false, group_messages: true, box_announcements: false });

    // ═══ send-push ══════════════════════════════════════════════════════════
    fn = await startFunction('send-push');
    console.log('\n── send-push (vraie fonction, vrais JWT) ──');

    const push = (caller, recipients, extra = {}) => callFn(caller.jwt, { recipients, ...extra });
    const rcp = (u, type) => ({
      user_id: u.id, title: 'T', body: 'B', data: { type },
    });

    // 1. LE BUG : appel « à l'ancienne » (aucun pref_key), famille sans clé
    //    historique. La catégorie est déduite de data.type côté serveur.
    const r1 = await push(owner, [rcp(off, 'wod_published')]);
    check('nouveau WOD · préférence coupée → 0 envoi',
      r1.recipients === 0 && r1.sent === 0 && r1.pref_disabled === 1 && r1.category === 'new_wod',
      JSON.stringify(r1));

    // 2. Préférence active → envoi.
    const r2 = await push(owner, [rcp(on, 'wod_published')]);
    check('nouveau WOD · préférence active → envoi',
      r2.recipients === 1 && r2.pref_disabled === 0, JSON.stringify(r2));

    // 3. Aucune ligne de préférence → envoi (défaut true, coexistence-safe).
    const r3 = await push(owner, [rcp(naked, 'wod_published')]);
    check('nouveau WOD · utilisateur sans ligne de préférence → envoi',
      r3.recipients === 1 && r3.pref_disabled === 0, JSON.stringify(r3));

    // 4. Fan-out mixte : seuls les destinataires qui l'acceptent sont retenus.
    const r4 = await push(owner, [rcp(off, 'wod_published'), rcp(on, 'wod_published'), rcp(naked, 'wod_published'), rcp(partial, 'wod_published')]);
    check('fan-out de 4 · 2 coupés → 2 retenus',
      r4.recipients === 2 && r4.pref_disabled === 2, JSON.stringify(r4));

    // 5. Les autres familles jusqu'ici non gouvernées.
    for (const [type, key] of [
      ['new_message', 'group_messages'],
      ['inter_competition_closed', 'elo_updates'],
      ['inter_bracket_match', 'tournament_updates'],
      ['inter_wod_revealed', 'tournament_updates'],
      ['inter_pool_match', 'tournament_updates'],
      ['inter_bracket_result', 'tournament_updates'],
    ]) {
      const r = await push(owner, [rcp(off, type)]);
      check(`${type} · préférence coupée → 0 envoi`,
        r.recipients === 0 && r.sent === 0 && r.category === key, JSON.stringify(r));
    }

    // 6. Fail-closed : aucune catégorie déductible → refus, pas d'envoi.
    const r6 = await callFn(owner.jwt, { recipients: [{ user_id: on.id, title: 'T', body: 'B' }] });
    check('appel sans catégorie → refusé (400), 0 envoi',
      r6.status === 400 && r6.sent === 0, JSON.stringify(r6));

    const r6b = await push(owner, [{ user_id: on.id, title: 'T', body: 'B', data: { type: 'famille_inventee' } }]);
    check('type inconnu → refusé (400), 0 envoi',
      r6b.status === 400 && r6b.sent === 0, JSON.stringify(r6b));

    const r6c = await push(owner, [rcp(on, 'wod_published')], { category: 'bogus' });
    check('catégorie explicite inconnue → refusée sans repli (400)',
      r6c.status === 400, JSON.stringify(r6c));

    // 7. Lot mélangeant deux familles : aucun réglage unique ne le gouverne.
    const r7 = await push(owner, [rcp(on, 'wod_published'), rcp(naked, 'new_message')]);
    check('lot mélangeant deux familles → refusé (400)',
      r7.status === 400, JSON.stringify(r7));

    // 8. Compat : le `pref_key` des versions d'app installées reste honoré.
    const r8 = await push(owner, [rcp(off, 'friend_request')], { pref_key: 'friend_requests' });
    check('pref_key historique · préférence coupée → 0 envoi',
      r8.recipients === 0 && r8.category === 'friend_requests', JSON.stringify(r8));

    // 9. Indépendance des clés : couper les annonces ne coupe pas les messages.
    const r9 = await push(owner, [rcp(partial, 'new_message')]);
    check('clés indépendantes · annonces coupées, messages actifs → envoi',
      r9.recipients === 1 && r9.pref_disabled === 0, JSON.stringify(r9));

    // 10. L'autorisation par relation (Lot 1C-a) n'a pas bougé.
    const r10 = await push(owner, [rcp(stranger, 'wod_published')]);
    check('destinataire hors de la box → écarté par l\'autorisation',
      r10.recipients === 0 && r10.sent === 0 && r10.dropped === 1, JSON.stringify(r10));

    await stopFunction(fn); fn = null;

    // ═══ send-box-notification ══════════════════════════════════════════════
    fn = await startFunction('send-box-notification');
    console.log('\n── send-box-notification (annonces du back-office) ──');

    const mkNotif = async (target) => {
      const { data, error } = await svc.from('box_notifications').insert({
        box_id: box.id, title: 'Annonce', body: 'Corps', target, created_by: owner.id,
      }).select('id').single();
      if (error) throw error;
      return data.id;
    };

    const nAll = await mkNotif('all');
    const rb1 = await callFn(owner.jwt, { notification_id: nAll });
    // Membres actifs : owner + off + on + naked + partial = 5.
    // Coupés : off et partial (box_announcements = false) → 3 retenus.
    check('annonce à tous · 2 membres l\'ont coupée → 3 retenus sur 5',
      rb1.recipients === 3 && rb1.pref_disabled === 2, JSON.stringify(rb1));

    const nOff = await mkNotif(off.id);
    const rb2 = await callFn(owner.jwt, { notification_id: nOff });
    check('annonce nominative · destinataire l\'a coupée → 0 envoi',
      rb2.recipients === 0 && rb2.sent === 0 && rb2.pref_disabled === 1, JSON.stringify(rb2));

    const nNaked = await mkNotif(naked.id);
    const rb3 = await callFn(owner.jwt, { notification_id: nNaked });
    check('annonce nominative · membre sans ligne de préférence → envoi',
      rb3.recipients === 1 && rb3.pref_disabled === 0, JSON.stringify(rb3));

    const rb4 = await callFn(on.jwt, { notification_id: nAll });
    check('non-gérant → 403 (garde de propriété intacte)',
      rb4.status === 403, JSON.stringify(rb4));

    await stopFunction(fn); fn = null;
  } catch (e) {
    console.error('\n💥 Protocole interrompu :', e?.message ?? e);
    ko++;
  } finally {
    if (fn) await stopFunction(fn);
    await cleanup();
  }

  console.log(`\n${ok} ✅ · ${ko} ❌`);
  process.exit(ko === 0 ? 0 : 1);
})();
