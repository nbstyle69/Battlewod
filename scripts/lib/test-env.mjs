/**
 * Socle commun des suites d'intégration (`scripts/test-*.mjs`).
 *
 * Trois garanties :
 *   1. la cible vient de l'environnement — aucune URL en dur ;
 *   2. la production est refusée, sans échappatoire (fail-closed) ;
 *   3. le décor est purgé même si la suite meurt (finally + signaux).
 *
 * Variables attendues (fournies par le job CI ou un .env local) :
 *   TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY / TEST_SUPABASE_ANON_KEY
 * Le préfixe TEST_ est exigé : SUPABASE_URL / EXPO_PUBLIC_* pointent la prod
 * dans le .env de dev, un repli sur ces noms rouvrirait exactement la brèche.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/** Ref du projet de production : toute cible qui la contient est refusée. */
export const PROD_PROJECT_REF = 'lkwdlqlbrbxaiydkoxfp';

function loadDotEnv() {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    for (const line of readFileSync(join(root, '.env'), 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
    }
  } catch {
    /* pas de .env : les variables viennent du job CI */
  }
}
loadDotEnv();

const read = name => {
  const v = process.env[name];
  return v && v.length > 0 ? v : null;
};

export const SUPABASE_URL = read('TEST_SUPABASE_URL');
export const SERVICE_ROLE_KEY = read('TEST_SUPABASE_SERVICE_ROLE_KEY');
export const ANON_KEY = read('TEST_SUPABASE_ANON_KEY');
export const KEEP_DATA = process.argv.includes('--keep-data');

/**
 * Refuse de démarrer si la cible est absente, incomplète, ou si c'est la
 * production. Pas d'échappatoire : ces suites créent puis suppriment des
 * comptes, des box et des scores.
 */
export function requireTestTarget() {
  const missing = [
    !SUPABASE_URL && 'TEST_SUPABASE_URL',
    !SERVICE_ROLE_KEY && 'TEST_SUPABASE_SERVICE_ROLE_KEY',
    !ANON_KEY && 'TEST_SUPABASE_ANON_KEY',
  ].filter(Boolean);
  if (missing.length) {
    console.error(`❌  Variables manquantes : ${missing.join(', ')}`);
    console.error('    Ces suites écrivent (comptes, box, scores) : elles visent une base jetable,');
    console.error('    pas la production. Lance `supabase start` puis exporte les clés locales.');
    process.exit(1);
  }
  if (SUPABASE_URL.includes(PROD_PROJECT_REF)) {
    console.error('❌  Cible = PRODUCTION — refusé.');
    console.error(`    ${SUPABASE_URL}`);
    console.error('    Ces suites créent puis suppriment des comptes, des box et des scores.');
    console.error('    Vise une base jetable (`supabase start`) ou un projet de staging.');
    process.exit(1);
  }
  return { url: SUPABASE_URL, serviceKey: SERVICE_ROLE_KEY, anonKey: ANON_KEY };
}

const clientOpts = { auth: { autoRefreshToken: false, persistSession: false } };

/** Client service_role : provisioning du décor uniquement, jamais les RPC gardées. */
export function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, clientOpts);
}

export function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, clientOpts);
}

/**
 * Client porteur d'un vrai JWT. Indispensable pour les RPC gardées par
 * `is_box_admin()`/`is_box_coach()` : avec service_role, `auth.uid()` est NULL
 * et le contrôle refuse — c'est ce qui faisait échouer ces suites.
 */
export async function signInAs(email, password) {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Connexion ${email} impossible : ${error.message}`);
  return { client, userId: data.user.id, accessToken: data.session.access_token };
}

/** Crée un compte confirmé + son profil, et renvoie son id. */
export async function createUser(db, { email, password, username, role = 'athlete', level = 'rx', elo = 1000, extra = {} }) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${email} : ${error.message}`);
  const id = data.user.id;
  const { error: pErr } = await db.from('profiles').upsert(
    { id, email, username, role, level, elo, total_matches: 0, wins: 0, ...extra },
    { onConflict: 'id' },
  );
  if (pErr) throw new Error(`profil ${username} : ${pErr.message}`);
  return id;
}

/**
 * Box jetable avec son propre propriétaire : les suites ne doivent jamais
 * emprunter (ni modifier) une box existante.
 */
export async function createOwnedBox(db, { tag, ownerId, name = `[TEST] Box ${tag}` }) {
  const { data, error } = await db.from('boxes').insert({
    name,
    slug: `test-${tag}`.toLowerCase().slice(0, 60),
    owner_id: ownerId,
    invite_code: `T${tag}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
  }).select('id').single();
  if (error) throw new Error(`createOwnedBox : ${error.message}`);
  await db.from('box_members').upsert(
    { box_id: data.id, member_id: ownerId, role: 'owner', status: 'active' },
    { onConflict: 'box_id,member_id' },
  );
  return data.id;
}

/**
 * Purge d'une box et de son owner, dans l'ordre : la FK `boxes.owner_id` est en
 * NO ACTION, donc supprimer le compte avant la box échoue silencieusement.
 */
export async function dropBoxAndOwner(db, boxId, ownerId) {
  // Ces trois FK vers `boxes` sont en NO ACTION : sans purge préalable, le
  // DELETE de la box échoue et le compte owner reste (FK boxes.owner_id).
  for (const table of ['wod_scores', 'score_comments', 'message_replies']) {
    await db.from(table).delete().eq('box_id', boxId);
  }
  const { error: bErr } = await db.from('boxes').delete().eq('id', boxId).select('id');
  if (bErr) throw new Error(`purge box ${boxId} : ${bErr.message}`);
  const { error: uErr } = await db.auth.admin.deleteUser(ownerId);
  if (uErr) throw new Error(`purge owner ${ownerId} : ${uErr.message}`);
}

// ── Purge fail-safe ──────────────────────────────────────────────────────────
const cleanups = [];
let running = null;

/** Enregistre une purge exécutée même si la suite meurt en cours de route. */
export function onCleanup(fn) {
  cleanups.push(fn);
}

async function drain() {
  if (KEEP_DATA) {
    console.log('  ℹ️  --keep-data : décor conservé');
    return;
  }
  // Ordre inverse de création : les dépendants tombent avant leurs parents.
  while (cleanups.length) {
    const fn = cleanups.pop();
    try {
      await fn();
    } catch (e) {
      console.error(`  ⚠️  purge partielle : ${e?.message ?? e}`);
    }
  }
}

/** Idempotent et ré-entrant : un second appel attend la purge en cours. */
export function runCleanup() {
  running ??= drain();
  return running;
}

/**
 * Branche la purge sur les sorties anormales (Ctrl-C, timeout du runner,
 * exception non rattrapée) en plus du `finally` de la suite.
 */
export function installCleanupTraps() {
  const bail = code => () => {
    runCleanup().finally(() => process.exit(code));
  };
  process.on('SIGINT', bail(130));
  process.on('SIGTERM', bail(143));
  process.on('uncaughtException', err => {
    console.error('\n💥 Exception non rattrapée :', err?.message ?? err);
    bail(1)();
  });
  process.on('unhandledRejection', err => {
    console.error('\n💥 Rejet non rattrapé :', err?.message ?? err);
    bail(1)();
  });
}
