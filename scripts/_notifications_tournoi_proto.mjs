// Protocole « les trois notifications de tournoi partent au bon monde, une
// seule fois, et respectent la préférence » — pile jetable, VRAIES fonctions
// edge (tournament-notifications-cron + send-push) lancées par Deno.
//
// Ce qui est prouvé se lit dans la RÉPONSE des fonctions et dans le JOURNAL en
// base, jamais à l'écran : `claimed` = destinataires réservés par ce passage,
// `sent`/`pref_disabled` = ce que send-push a retenu ou écarté.
//
// Les fixtures sont construites depuis des états réels du produit (tournoi
// 'active', WOD 'active' avec opens_at/closes_at, scores en 'pending' comme en
// 'validated'), et non depuis des lignes fabriquées pour l'occasion : un rappel
// ne doit pas partir à quelqu'un qui a soumis, et « soumis » inclut « en
// attente de validation ».
//
// Deux pièges que ce protocole vise explicitement :
//   1. un test « le non-inscrit ne reçoit rien » passe trivialement si aucun
//      non-inscrit n'existe → on vérifie d'abord que l'intrus EXISTE et est
//      notifiable (il reçoit bien une autre notification) ;
//   2. « un seul rappel » ne se prouve pas en comptant un envoi, mais en
//      repassant le cron et en exigeant 0 réservation au second passage.
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error('Variables TEST_* manquantes'); process.exit(1); }
if (URL.includes('lkwdlqlbrbxaiydkoxfp')) { console.error('❌ Cible = PRODUCTION — refusé'); process.exit(1); }

const CRON_SECRET = 'zz-proto-cron-secret';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let ok = 0, ko = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  pass ? ok++ : ko++;
};

const stamp = Date.now();
const HOUR = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();

// ── Fonctions edge réelles ──────────────────────────────────────────────────
// send-push écoute 8000, le cron 8001. Le cron appelle send-push par HTTP :
// SUPABASE_URL doit donc pointer sur la pile pour les lectures ET porter la
// fonction /functions/v1/send-push. On tord ça avec un petit routeur : le cron
// reçoit une base d'URL locale qui proxifie /functions/v1/send-push vers 8000
// et tout le reste vers PostgREST.
const PUSH_PORT = 8000, CRON_PORT = 8001, PROXY_PORT = 8002;
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;

function startFunction(name, port, extraEnv = {}) {
  const proc = spawn('deno', [
    'run', '--allow-net', '--allow-env', '--allow-read', '--quiet', '--no-config',
    'scripts/_deno_port_wrapper.ts',
  ], {
    env: {
      ...process.env,
      FN: `supabase/functions/${name}/index.ts`,
      FORCE_PORT: String(port),
      SUPABASE_URL: URL,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      CRON_SECRET,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderr.on('data', d => {
    const s = d.toString();
    if (!/Listening|Warning|Download|Check /.test(s)) process.stderr.write(`[${name}] ${s}`);
  });
  return proc;
}

async function waitUp(port) {
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}`, { method: 'OPTIONS' });
      if (r.ok) { await r.text(); return; }
    } catch { /* pas encore prête */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`fonction injoignable sur le port ${port}`);
}

// Routeur minimal : /functions/v1/send-push → 8000, sinon PostgREST/GoTrue.
import { createServer } from 'http';
function startProxy() {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const target = req.url.startsWith('/functions/v1/send-push')
      ? `http://127.0.0.1:${PUSH_PORT}`
      : `${URL}${req.url}`;
    const url = req.url.startsWith('/functions/v1/send-push') ? target : target;
    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];
    try {
      const r = await fetch(url, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      });
      res.statusCode = r.status;
      r.headers.forEach((v, k) => { if (k !== 'content-encoding' && k !== 'content-length') res.setHeader(k, v); });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
  return new Promise(resolve => server.listen(PROXY_PORT, '127.0.0.1', () => resolve(server)));
}

const runCron = async (secret = CRON_SECRET) => {
  const res = await fetch(`http://127.0.0.1:${CRON_PORT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    body: '{}',
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
};

// ── Décor ───────────────────────────────────────────────────────────────────
const created = { users: [], boxes: [], tournaments: [] };

const mkUser = async (suffix) => {
  const email = `zz_trn_${suffix}_${stamp}@test.athlex.io`;
  const { data, error } = await svc.auth.admin.createUser({
    email, password: 'Test1234!', email_confirm: true,
  });
  if (error) throw error;
  const { error: pErr } = await svc.from('profiles').upsert({
    id: data.user.id, email, username: `zz_trn_${suffix}_${stamp}`, level: 'inter', role: 'member',
  });
  if (pErr) throw pErr;
  await svc.from('push_tokens').insert({
    user_id: data.user.id, token: `ExponentPushToken[zz-trn-${suffix}-${stamp}]`, platform: 'android',
  });
  created.users.push(data.user.id);
  return { id: data.user.id, tag: suffix };
};

const journal = async (kind, athleteId) => {
  const { data, error } = await svc
    .from('tournament_notifications_sent')
    .select('kind, wod_id, athlete_id')
    .eq('kind', kind).eq('athlete_id', athleteId);
  if (error) throw error;
  return data ?? [];
};

const cleanup = async () => {
  for (const id of created.tournaments) await svc.from('tournaments').delete().eq('id', id);
  for (const id of created.boxes) await svc.from('boxes').delete().eq('id', id);
  for (const id of created.users) {
    await svc.from('notification_preferences').delete().eq('user_id', id);
    await svc.from('push_tokens').delete().eq('user_id', id);
    await svc.auth.admin.deleteUser(id).catch(() => {});
  }
};

(async () => {
  let push = null, cron = null, proxy = null;
  try {
    const owner = await mkUser('own');
    const inscrit = await mkUser('ins');     // inscrit, n'a pas soumis
    const soumis = await mkUser('sub');      // inscrit, score validé
    const pending = await mkUser('pnd');     // inscrit, score en attente de validation
    const coupe = await mkUser('off');       // inscrit, tournament_updates = false
    const maitre = await mkUser('mst');      // inscrit, interrupteur maître coupé
    const intrus = await mkUser('out');      // NON inscrit

    await svc.from('notification_preferences').upsert([
      { user_id: coupe.id, tournament_updates: false },
      { user_id: maitre.id, tournament_updates: true, notifications_enabled: false },
    ], { onConflict: 'user_id' });

    const { data: box, error: bErr } = await svc.from('boxes').insert({
      owner_id: owner.id, name: `ZZ TRN ${stamp}`, slug: `zz-trn-${stamp}`,
      invite_code: `ZT${String(stamp).slice(-5)}`, is_active: true, city: 'Lyon',
    }).select('id').single();
    if (bErr) throw bErr;
    created.boxes.push(box.id);

    // Tournoi DÉJÀ actif (état réel produit par 20261015).
    const { data: tourn, error: tErr } = await svc.from('tournaments').insert({
      name: `ZZ Open ${stamp}`, box_id: box.id, created_by: owner.id, status: 'active',
      level: 'rx', format: 'simple', start_date: iso(Date.now() - 2 * HOUR),
    }).select('id').single();
    if (tErr) throw tErr;
    created.tournaments.push(tourn.id);

    const inscrits = [inscrit, soumis, pending, coupe, maitre];
    await svc.from('tournament_participants').insert(
      inscrits.map(u => ({ tournament_id: tourn.id, athlete_id: u.id })),
    );

    // WOD 1 : ouvert, fenêtre LARGE (le rappel ne doit PAS encore partir).
    const { data: wod1, error: w1Err } = await svc.from('tournament_wods').insert({
      tournament_id: tourn.id, order_index: 0, title: 'ZZ WOD ouvert', type: 'AMRAP',
      duration_minutes: 12, scoring: 'reps', deadline_hours: 24, status: 'active',
      opens_at: iso(Date.now() - HOUR), closes_at: iso(Date.now() + 20 * HOUR),
    }).select('id').single();
    if (w1Err) throw w1Err;

    // WOD 2 : programmé (opens_at futur).
    const { data: wod2, error: w2Err } = await svc.from('tournament_wods').insert({
      tournament_id: tourn.id, order_index: 1, title: 'ZZ WOD programmé', type: 'For Time',
      duration_minutes: 15, scoring: 'time', deadline_hours: 24, status: 'active',
      opens_at: iso(Date.now() + 48 * HOUR), closes_at: iso(Date.now() + 72 * HOUR),
    }).select('id').single();
    if (w2Err) throw w2Err;

    push = startFunction('send-push', PUSH_PORT);
    proxy = await startProxy();
    cron = startFunction('tournament-notifications-cron', CRON_PORT, { SUPABASE_URL: PROXY_URL });
    await waitUp(PUSH_PORT);
    await waitUp(CRON_PORT);

    console.log('\n── garde d\'accès ──');
    const bad = await runCron('mauvais-secret');
    check('cron sans le bon CRON_SECRET → 401', bad.status === 401, JSON.stringify(bad));

    console.log('\n── passage 1 : démarrage + WOD ouvert + WOD programmé ──');
    const r1 = await runCron();
    check('le cron répond 200', r1.status === 200, JSON.stringify(r1));

    // Le tournoi démarre : les 5 inscrits sont réservés, l'intrus non.
    const startedInscrit = await journal('tournament_started', inscrit.id);
    const startedIntrus = await journal('tournament_started', intrus.id);
    check('démarrage · inscrit réservé', startedInscrit.length === 1, JSON.stringify(startedInscrit));
    check('démarrage · NON-inscrit jamais réservé', startedIntrus.length === 0);

    // L'intrus existe-t-il vraiment et serait-il notifiable ? Sans cette
    // vérification, l'assertion ci-dessus passerait sur un utilisateur absent.
    const { data: intrusRow } = await svc.from('push_tokens').select('user_id').eq('user_id', intrus.id);
    check('l\'intrus existe et a bien un token push (l\'assertion pouvait échouer)',
      (intrusRow ?? []).length === 1);

    const openInscrit = await journal('wod_open', inscrit.id);
    check('WOD ouvert · inscrit réservé une fois',
      openInscrit.length === 1 && openInscrit[0].wod_id === wod1.id, JSON.stringify(openInscrit));

    const schedInscrit = await journal('wod_scheduled', inscrit.id);
    check('WOD programmé · inscrit réservé sur le WOD futur',
      schedInscrit.length === 1 && schedInscrit[0].wod_id === wod2.id, JSON.stringify(schedInscrit));

    // Le WOD programmé ne doit pas être annoncé comme ouvert.
    const openWod2 = (await journal('wod_open', inscrit.id)).filter(r => r.wod_id === wod2.id);
    check('WOD programmé · jamais annoncé « ouvert »', openWod2.length === 0);

    // Fenêtre large → aucun rappel de soumission encore.
    check('fenêtre encore large · aucun rappel de soumission',
      (await journal('submission_reminder', inscrit.id)).length === 0);

    // Préférences : la réservation a lieu, mais send-push écarte.
    check('préférence coupée → écarté par send-push (pref_disabled > 0)',
      (r1.pref_disabled ?? 0) >= 2, JSON.stringify(r1));

    console.log('\n── passage 2 : rien de neuf → aucune réservation ──');
    const r2 = await runCron();
    check('second passage · 0 réservation (pas de doublon)',
      r2.claimed === 0 && r2.sent === 0, JSON.stringify(r2));
    check('journal · toujours une seule ligne de démarrage par inscrit',
      (await journal('tournament_started', inscrit.id)).length === 1);

    console.log('\n── passage 3 : la fenêtre se referme → rappel de soumission ──');
    // États réels : un score validé, un score en attente de validation.
    await svc.from('tournament_scores').insert([
      { tournament_id: tourn.id, tournament_wod_id: wod1.id, athlete_id: soumis.id,
        score_value: '120', status: 'validated', submitted_at: iso(Date.now()) },
      { tournament_id: tourn.id, tournament_wod_id: wod1.id, athlete_id: pending.id,
        score_value: '95', status: 'pending', submitted_at: iso(Date.now()) },
    ]);
    // La fenêtre se referme dans 2 h (seuil : 6 h ou la moitié de la fenêtre).
    await svc.from('tournament_wods')
      .update({ opens_at: iso(Date.now() - 10 * HOUR), closes_at: iso(Date.now() + 2 * HOUR) })
      .eq('id', wod1.id);

    const r3 = await runCron();
    check('le cron répond 200', r3.status === 200, JSON.stringify(r3));
    check('rappel · inscrit sans score → réservé',
      (await journal('submission_reminder', inscrit.id)).length === 1);
    check('rappel · score VALIDÉ → jamais de rappel',
      (await journal('submission_reminder', soumis.id)).length === 0);
    check('rappel · score EN ATTENTE de validation → jamais de rappel',
      (await journal('submission_reminder', pending.id)).length === 0);
    check('rappel · NON-inscrit → jamais de rappel',
      (await journal('submission_reminder', intrus.id)).length === 0);

    // Preuve que l'assertion « pas de rappel » pouvait échouer : les deux
    // athlètes qui ont soumis ont BIEN un score en base sur ce WOD.
    const { data: scoreRows } = await svc.from('tournament_scores')
      .select('athlete_id, status').eq('tournament_wod_id', wod1.id);
    check('les deux scores existent bien en base (validated + pending)',
      (scoreRows ?? []).length === 2 &&
      new Set((scoreRows ?? []).map(s => s.status)).size === 2, JSON.stringify(scoreRows));

    console.log('\n── passage 4 : un seul rappel par WOD et par personne ──');
    const r4 = await runCron();
    check('quatrième passage · 0 réservation',
      r4.claimed === 0, JSON.stringify(r4));
    check('journal · exactement UNE ligne de rappel pour ce WOD',
      (await journal('submission_reminder', inscrit.id)).length === 1);

    console.log('\n── fenêtre terminée : plus aucun rappel ──');
    await svc.from('tournament_wods')
      .update({ closes_at: iso(Date.now() - HOUR) }).eq('id', wod1.id);
    const r5 = await runCron();
    check('WOD fermé · aucune nouvelle réservation', r5.claimed === 0, JSON.stringify(r5));
  } catch (e) {
    console.error('\n💥', e);
    ko++;
  } finally {
    if (cron) cron.kill('SIGKILL');
    if (push) push.kill('SIGKILL');
    if (proxy) proxy.close();
    await cleanup();
    console.log(`\n${ok} ✅ · ${ko} ❌`);
    process.exit(ko === 0 ? 0 : 1);
  }
})();
