/**
 * audit-lectures-publiques-prod.mjs — les pages publiques, rejouées à la clé
 * anon de PRODUCTION, comparées à ce que la base contient vraiment.
 *
 * Pourquoi ce contrôle existe (D1, mesuré le 2026-06-09) : la page publique
 * d'une box lisait `programs` en triant sur `created_at`, la seule colonne de
 * cette table que `anon` ne peut pas lire. PostgREST refuse alors la requête
 * ENTIÈRE (42501) ; l'`error` était ignoré, `data` valait `null`, et le bloc
 * « Programmes » disparaissait. 3 programmes actifs en base — 30 €, 49 €,
 * 40 € — invendables depuis la page publique, sans aucune erreur visible.
 *
 * Ce que ce contrôle prouve, et que ni les tests d'intégration ni l'audit de
 * grants ne prouvaient :
 *   • l'intégration monte une pile jetable — elle ne connaît pas les grants de
 *     colonne posés à la main en prod ;
 *   • l'audit de grants vérifie qu'anon n'a pas TROP de droits — il ne dit rien
 *     de ce dont la page a BESOIN.
 * Ici l'attendu s'établit en SQL avant la lecture REST, puis les deux se
 * comparent ligne à ligne : une liste vide n'est un succès que si la base est
 * vide elle aussi.
 *
 * Strictement en lecture : des SELECT de catalogue et des GET REST. Aucune
 * écriture, aucun décor.
 *
 * Usage : PROD_DB_URL=… PROD_SUPABASE_URL=… PROD_SUPABASE_ANON_KEY=… \
 *           node scripts/audit-lectures-publiques-prod.mjs
 */

import { execFileSync } from 'child_process';
import { PROD_PROJECT_REF } from './lib/prod-ref.mjs';

const DB_URL = process.env.PROD_DB_URL ?? '';
const SUPABASE_URL = process.env.PROD_SUPABASE_URL ?? '';
const ANON_KEY = process.env.PROD_SUPABASE_ANON_KEY ?? '';

const manquants = [
  ['PROD_DB_URL', DB_URL],
  ['PROD_SUPABASE_URL', SUPABASE_URL],
  ['PROD_SUPABASE_ANON_KEY', ANON_KEY],
].filter(([, v]) => !v).map(([k]) => k);

if (manquants.length) {
  console.error(`Variables absentes : ${manquants.join(', ')}.`);
  console.error('Un audit sans cible ne « passe » pas : il échoue.');
  process.exit(1);
}

if (!DB_URL.includes(PROD_PROJECT_REF) || !SUPABASE_URL.includes(PROD_PROJECT_REF)) {
  console.error(`La cible ne porte pas la référence de production (${PROD_PROJECT_REF}) — refus.`);
  process.exit(1);
}

/**
 * Nombre d'assertions attendues. Même raison que l'audit de grants : un script
 * mort au chargement et un script qui trouve une régression rendent tous les
 * deux le job rouge. Le compte sépare « une lecture publique est cassée » de
 * « le contrôle n'a rien constaté ».
 */
const ASSERTIONS_ATTENDUES = 8;

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    if (detail) console.log(`     → ${detail}`);
    failed++;
  }
}

function query(sql) {
  const out = execFileSync('psql', [DB_URL, '-tA', '-F', '|', '-c', sql], { encoding: 'utf-8' });
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|'));
}

/** GET REST à la clé anon — exactement ce que fait `@supabase/supabase-js`. */
async function anonGet(chemin) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${chemin}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  const corps = await res.text();
  let json = null;
  try { json = JSON.parse(corps); } catch { /* PostgREST rend du texte sur certaines erreurs */ }
  return { status: res.status, json, corps };
}

console.log('\n=== Lectures des pages publiques — PRODUCTION (clé anon, lecture seule) ===\n');

// ── D1 : la section « Programmes » de /box/[slug] ────────────────────────────
// L'attendu vient de la base, box par box : le contrôle ne peut pas être vert
// parce qu'il regarde une box sans programme.
const boxAvecProgrammes = query(`
  select b.id, b.slug, count(p.id)
  from public.boxes b
  join public.programs p on p.box_id = b.id and p.is_active
  where b.is_active and b.slug is not null
  group by b.id, b.slug
  order by count(p.id) desc
  limit 1
`);

assert(
  'D1 — la base contient au moins une box publique avec des programmes actifs (sinon ce contrôle ne prouve rien)',
  boxAvecProgrammes.length === 1 && Number(boxAvecProgrammes[0][2]) > 0,
  'aucune box publique ne porte de programme actif : l\'assertion suivante serait vide-vide, donc non discriminante',
);

if (boxAvecProgrammes.length === 1) {
  const [boxId, boxSlug, attendus] = boxAvecProgrammes[0];

  const idsAttendus = query(`
    select id from public.programs
    where box_id = '${boxId}' and is_active order by title
  `).map(r => r[0]).sort();

  // La requête EXACTE de la page (colonnes, filtres, tri comprises).
  const select = 'id,title,description,price_cents,type,duration_weeks,days_per_week,image_url';
  const rest = await anonGet(
    `programs?select=${select}&box_id=eq.${boxId}&is_active=eq.true&order=title.asc`,
  );

  assert(
    `D1 — la requête publique de /box/${boxSlug} aboutit à la clé anon (HTTP 200)`,
    rest.status === 200,
    `HTTP ${rest.status} : ${rest.corps.slice(0, 300)}`,
  );

  const idsLus = Array.isArray(rest.json) ? rest.json.map(p => p.id).sort() : [];
  assert(
    `D1 — les ${attendus} programme(s) actif(s) de la base arrivent tous sur la page publique`,
    idsLus.length === idsAttendus.length && idsLus.every((id, i) => id === idsAttendus[i]),
    `base = ${idsAttendus.length} ligne(s), clé anon = ${idsLus.length} ligne(s)`,
  );

  assert(
    'D1 — chaque programme public porte un prix et un titre lisibles (une carte muette ne se vend pas)',
    Array.isArray(rest.json) && rest.json.every(p => p.title && p.price_cents != null),
    Array.isArray(rest.json)
      ? JSON.stringify(rest.json.filter(p => !p.title || p.price_cents == null))
      : 'aucune ligne',
  );

  // Discriminant : la requête d'AVANT le correctif doit rester refusée. Si elle
  // passait, c'est qu'un grant de colonne interne a été ouvert à anon — le
  // périmètre minimal aurait bougé sans que personne ne le dise.
  const ancienne = await anonGet(
    `programs?select=${select}&box_id=eq.${boxId}&is_active=eq.true&order=created_at.desc`,
  );
  assert(
    'D1 — trier sur `created_at` reste refusé à anon (la colonne interne n\'est pas rouverte)',
    ancienne.status !== 200,
    `HTTP ${ancienne.status} — `
    + 'un tri qui aboutit signifie que created_at est devenu lisible par la clé publique',
  );
}

// ── D1 bis : les formules payantes de la même page ───────────────────────────
const plansAttendus = query(`
  select count(*) from public.membership_plans
  where is_active and price_cents > 0
`)[0][0];

const restPlans = await anonGet(
  'membership_plans?select=id,name,description,price_cents,max_sessions_per_week,color,plan_type,credits,validity_days,commitment_months,terms'
  + '&is_active=eq.true&price_cents=gt.0&order=price_cents.asc',
);

assert(
  'D1 bis — la lecture publique des formules payantes aboutit et rend le compte de la base',
  restPlans.status === 200
  && Array.isArray(restPlans.json)
  && restPlans.json.length === Number(plansAttendus),
  `HTTP ${restPlans.status} — base = ${plansAttendus}, clé anon = ${
    Array.isArray(restPlans.json) ? restPlans.json.length : restPlans.corps.slice(0, 200)
  }`,
);

// ── D2 : l'annuaire /box ─────────────────────────────────────────────────────
// Le filtre `.not('slug','is',null)` de l'annuaire élimine une box AVANT le
// filtre d'abonnement : une box active et listée sans slug est invisible
// partout, et sa page publique est inatteignable (l'URL se construit dessus).
const sansSlug = query(`
  select name from public.boxes
  where is_active and is_listed and (slug is null or slug = '')
  order by 1
`).map(r => r[0]);

assert(
  'D2 — aucune box active et listée n\'est privée de slug (sinon elle est invisible dans /box ET sur sa page)',
  sansSlug.length === 0,
  sansSlug.join(', '),
);

const boxAttendues = query(`
  select count(*) from public.boxes
  where is_active and is_listed and slug is not null
`)[0][0];

const restBoxes = await anonGet(
  'boxes?select=id,name,slug,tagline,logo_url,cover_url,city,sport_type,member_count,stripe_onboarding_complete'
  + '&is_active=eq.true&is_listed=eq.true&slug=not.is.null&order=member_count.desc.nullslast',
);

assert(
  'D2 — la requête de l\'annuaire /box aboutit à la clé anon et rend le compte de la base',
  restBoxes.status === 200
  && Array.isArray(restBoxes.json)
  && restBoxes.json.length === Number(boxAttendues),
  `HTTP ${restBoxes.status} — base = ${boxAttendues}, clé anon = ${
    Array.isArray(restBoxes.json) ? restBoxes.json.length : restBoxes.corps.slice(0, 200)
  }`,
);

// ── Bilan ────────────────────────────────────────────────────────────────────
const executees = passed + failed;
console.log(`\n${passed} vert(s), ${failed} rouge(s) — ${executees}/${ASSERTIONS_ATTENDUES} assertion(s) exécutée(s)`);
console.log(`AUDIT_PUBLIC_ASSERTIONS=${executees}/${ASSERTIONS_ATTENDUES}`);

if (executees !== ASSERTIONS_ATTENDUES) {
  console.log('  ❌ audit incomplet — il n\'a pas constaté tout ce qu\'il prétend constater');
  process.exit(1);
}
process.exit(failed === 0 ? 0 : 1);
