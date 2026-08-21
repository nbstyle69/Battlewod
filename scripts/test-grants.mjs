/**
 * test-grants.mjs — contrôle mécanique des grants EXECUTE du schéma public.
 *
 * Le motif « REVOKE ALL ON FUNCTION ... FROM PUBLIC » est appliqué depuis le
 * lot 6a et présent dans une vingtaine de migrations. Il a quand même été
 * oublié sur `list_athlete_strength_sets` (lot 4) et n'avait jamais été appliqué
 * aux 67 fonctions antérieures : une convention qu'on relit s'oublie, une
 * convention que la CI applique ne s'oublie pas.
 *
 * Deux règles, interrogées dans le catalogue plutôt que dans les migrations —
 * c'est l'état de la base qui décide, pas l'intention du SQL :
 *
 *   R1  aucune fonction du schéma `public` n'accorde EXECUTE à PUBLIC.
 *       Sans liste blanche : un grant hérité n'est jamais l'intention.
 *   R2  `anon` n'exécute que les fonctions de la liste blanche ci-dessous,
 *       chacune avec sa raison. Un grant nominatif à `anon` est un choix ;
 *       il doit être écrit ici pour exister.
 *
 * R2 subsume R1 (PUBLIC ⇒ anon), mais les deux sont vérifiées séparément :
 * une fonction whitelistée pour `anon` ne doit pas l'être *par héritage*.
 *
 * Usage : ./scripts/test-stack.sh up && node scripts/test-grants.mjs
 * Cible : TEST_ADMIN_DB_URL (pile jetable). Jamais la production.
 */

import { execFileSync } from 'child_process';
import { requireTestTarget, PROD_PROJECT_REF } from './lib/test-env.mjs';
import { ANON_WHITELIST, SONDES_ANONYMES } from './lib/anon-whitelist.mjs';

const { url: SUPABASE_URL, anonKey: ANON_KEY } = requireTestTarget();

const DB_URL = process.env.TEST_ADMIN_DB_URL
  ?? 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres';

if (DB_URL.includes(PROD_PROJECT_REF)) {
  console.error('TEST_ADMIN_DB_URL pointe la production — refus.');
  process.exit(1);
}

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
  const out = execFileSync('psql', [DB_URL, '-tA', '-F', '|', '-c', sql], {
    encoding: 'utf-8',
  });
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|'));
}

console.log('\n=== Contrôle des grants EXECUTE (schéma public) ===\n');

// ── R1 : aucun EXECUTE à PUBLIC ──────────────────────────────────────────────
const heritePublic = query(`
  select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and exists (
      select 1 from aclexplode(p.proacl) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    )
  order by 1
`).map(r => r[0]);

assert(
  'R1 — aucune fonction du schéma public n\'accorde EXECUTE à PUBLIC',
  heritePublic.length === 0,
  heritePublic.length
    ? `${heritePublic.length} fonction(s) : ${heritePublic.join(', ')}\n`
      + '       → ajoute « REVOKE ALL ON FUNCTION ... FROM PUBLIC » à la migration '
      + 'qui les crée, puis un GRANT nominatif au rôle qui doit les appeler.'
    : '',
);

// ── R2 : anon n'exécute que la liste blanche ─────────────────────────────────
const anonPeut = query(`
  select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and pg_catalog.pg_get_function_result(p.oid) <> 'trigger'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
  order by 1
`).map(r => r[0]);

const horsListe = [...new Set(anonPeut.filter(f => !ANON_WHITELIST.has(f)))];

assert(
  'R2 — `anon` n\'exécute que les fonctions de la liste blanche annotée',
  horsListe.length === 0,
  horsListe.length
    ? `${horsListe.length} fonction(s) hors liste : ${horsListe.join(', ')}\n`
      + '       → soit elle n\'a rien à faire chez `anon` (REVOKE), soit son accès '
      + 'anonyme est un choix : inscris-le dans ANON_WHITELIST avec sa raison.'
    : '',
);

// La liste blanche doit rester une liste vivante : une entrée qui ne correspond
// plus à rien laisse croire qu'un accès anonyme est encore contrôlé.
const obsoletes = [...ANON_WHITELIST.keys()].filter(f => !anonPeut.includes(f));
assert(
  'la liste blanche ne contient aucune entrée obsolète',
  obsoletes.length === 0,
  obsoletes.length ? `entrées sans effet : ${obsoletes.join(', ')}` : '',
);

// La liste blanche porte des *noms*, or PostgreSQL autorise la surcharge : une
// seconde signature du même nom hériterait de l'autorisation sans être relue.
// L'hypothèse s'assume donc explicitement au lieu de rester tacite.
const surchargees = query(`
  select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
  group by p.proname having count(*) > 1
  order by 1
`).map(r => r[0]).filter(f => ANON_WHITELIST.has(f));

assert(
  'aucune fonction de la liste blanche n\'est surchargée (la liste porte des noms)',
  surchargees.length === 0,
  surchargees.length
    ? `surcharges : ${surchargees.join(', ')}\n`
      + '       → passe ces entrées en signature complète, sinon une seconde '
      + 'surcharge héritera de l\'accès anonyme sans relecture.'
    : '',
);

// ── R3 : une fonction neuve ne naît pas atteignable ──────────────────────────
// R1 et R2 constatent l'état ; R3 porte sur la cause. Sans les privilèges par
// défaut refermés, chaque migration à venir devrait penser au REVOKE — et douze
// occurrences disent que « penser à » n'est pas un contrôle. La sonde est créée
// puis annulée : rien ne subsiste dans la base.
// psql n'affiche que le résultat de la dernière requête d'un `-c` : la sonde
// passe donc par trois `-c` successifs, qui partagent la même session et donc
// la même transaction.
const naissance = execFileSync('psql', [
  DB_URL, '-tA', '-q',
  '-c', "begin; create function public.zz_sonde_grants() returns int language sql as 'select 1';",
  '-c', `select 'R3=' || (has_function_privilege('anon', 'public.zz_sonde_grants()', 'EXECUTE')
           or exists (
             select 1 from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace, aclexplode(p.proacl) a
             where n.nspname = 'public' and p.proname = 'zz_sonde_grants'
               and a.grantee = 0 and a.privilege_type = 'EXECUTE'
           ))::text`,
  '-c', 'rollback;',
], { encoding: 'utf-8' })
  .split('\n').map(l => l.trim()).filter(l => l.startsWith('R3='));

assert(
  'R3 — une fonction créée sans grant explicite n\'est atteignable ni par PUBLIC ni par `anon`',
  naissance.length === 1 && naissance[0] === 'R3=false',
  naissance[0] === 'R3=true'
    ? 'les privilèges par défaut du schéma public ouvrent encore : '
      + 'ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon'
    : `réponse inattendue de la sonde : ${JSON.stringify(naissance)}`,
);

// ── Le grant refuse *avant* le corps, et le message le prouve ────────────────
// C'est le piège du lot 4 : deux gardes différentes rendent le même 42501. Une
// assertion posée sur le code de retour passe dans les deux états — elle valide
// qu'on refuse, pas *qui* refuse. Le message, lui, distingue.
async function refusAnonyme(fn, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, message: json?.message ?? '' };
}

for (const [fn, body] of SONDES_ANONYMES) {
  const { status, message } = await refusAnonyme(fn, body);
  assert(
    `à la clé anon, ${fn} est refusée par le grant (pas par son corps)`,
    status >= 400 && message.includes('permission denied for function'),
    `HTTP ${status} — message : ${message || '—'}`,
  );
}

// Le contre-exemple : une fonction whitelistée doit rester atteignable, sinon
// « tout est refusé » passerait pour un succès sans rien prouver.
const publique = await refusAnonyme('peek_box_invitation', { p_token: 'inexistant' });
assert(
  'peek_box_invitation reste atteignable sans session (contre-exemple)',
  publique.status === 200 && !publique.message.includes('permission denied'),
  `HTTP ${publique.status} — message : ${publique.message || '—'}`,
);

console.log(`\n=== ${passed} ✅ · ${failed} ❌ ===\n`);
process.exit(failed === 0 ? 0 : 1);
