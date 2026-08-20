/**
 * audit-grants-prod.mjs — les mêmes règles de grants, mais sur la production.
 *
 * Pourquoi un second contrôle alors que `test-grants.mjs` tourne déjà en CI :
 * la CI prouve l'état de *sa* base. Elle repart d'une baseline et rejoue nos
 * migrations, donc elle ne voit que ce que notre SQL produit — pas une fonction
 * créée depuis le SQL editor, pas une extension installée par la plateforme,
 * pas un grant posé à la main un soir de dépannage. « Mergé n'est pas chez
 * l'utilisateur » (règle 10) a un équivalent ici : *vert en CI n'est pas fermé
 * en prod*.
 *
 * Ce contrôle est strictement en lecture : quatre requêtes de catalogue et des
 * appels REST qui doivent être **refusés**. Aucune écriture, aucune transaction,
 * aucun décor — la règle « prod sans création » est respectée par construction.
 *
 * D1 remplace la sonde par création annulée que j'avais proposée, et couvre
 * davantage : une sonde ne teste que le rôle avec lequel je me connecte, alors
 * que pg_default_acl expose le défaut de *tous* les créateurs possibles — dont
 * `supabase_admin`, que `postgres` ne peut pas modifier.
 *
 * Il échoue le job. Un contrôle qui journalise est un journal, pas un contrôle.
 *
 * Usage : PROD_DB_URL=… PROD_SUPABASE_URL=… PROD_SUPABASE_ANON_KEY=… \
 *           node scripts/audit-grants-prod.mjs
 */

import { execFileSync } from 'child_process';
import { ANON_WHITELIST, SONDES_ANONYMES } from './lib/anon-whitelist.mjs';
import { PROD_PROJECT_REF } from './lib/test-env.mjs';

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

// Garde en miroir de celle de test-grants.mjs : là-bas on refuse de viser la
// prod, ici on refuse de viser autre chose. Un audit de production qui
// interroge une base locale rendrait un vert qui ne prouve rien.
if (!DB_URL.includes(PROD_PROJECT_REF) || !SUPABASE_URL.includes(PROD_PROJECT_REF)) {
  console.error(`La cible ne porte pas la référence de production (${PROD_PROJECT_REF}) — refus.`);
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

console.log('\n=== Audit des grants EXECUTE — PRODUCTION (lecture seule) ===\n');

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
  'R1 — en prod, aucune fonction du schéma public n\'accorde EXECUTE à PUBLIC',
  heritePublic.length === 0,
  heritePublic.length
    ? `${heritePublic.length} fonction(s) : ${heritePublic.join(', ')}\n`
      + '       → la clé anon est publique par nature (elle est dans le bundle de '
      + 'l\'app) : ces fonctions sont appelables depuis n\'importe où.'
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
  'R2 — en prod, `anon` n\'exécute que les fonctions de la liste blanche',
  horsListe.length === 0,
  horsListe.length
    ? `${horsListe.length} fonction(s) hors liste : ${horsListe.join(', ')}\n`
      + '       → cette liste est la même que celle de la CI : un écart ici est un '
      + 'grant qui n\'est passé par aucune migration.'
    : '',
);

const obsoletes = [...ANON_WHITELIST.keys()].filter(f => !anonPeut.includes(f));
assert(
  'la liste blanche ne contient aucune entrée obsolète en prod',
  obsoletes.length === 0,
  obsoletes.length
    ? `entrées sans effet : ${obsoletes.join(', ')}\n`
      + '       → soit la fonction a disparu, soit son grant anon a été retiré : '
      + 'dans les deux cas la liste ne protège plus rien.'
    : '',
);

const surchargees = query(`
  select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
  group by p.proname having count(*) > 1
  order by 1
`).map(r => r[0]).filter(f => ANON_WHITELIST.has(f));

assert(
  'aucune fonction de la liste blanche n\'est surchargée en prod',
  surchargees.length === 0,
  surchargees.length ? `surcharges : ${surchargees.join(', ')}` : '',
);

// ── D1 : ce qui naîtra ouvert demain, pour chaque créateur possible ──────────
// R1/R2 constatent aujourd'hui. D1 porte sur demain, et sans rien créer.
//
// Sémantique mesurée, pas déduite : le défaut câblé du moteur accorde EXECUTE à
// PUBLIC sur toute fonction neuve. Une ligne pg_default_acl **globale** (sans
// schéma) est ce qui l'annule ; la forme « IN SCHEMA public » ne l'annule pas.
// Donc pour un rôle donné : absence de ligne globale = PUBLIC encore ouvert.
const createurs = query(`
  select r.rolname,
         coalesce((select 'oui' from pg_default_acl d
                   where d.defaclrole = r.oid and d.defaclobjtype = 'f'
                     and d.defaclnamespace = 0), 'non'),
         coalesce((select string_agg(distinct a.grantee::regrole::text, ',')
                   from pg_default_acl d, aclexplode(d.defaclacl) a
                   where d.defaclrole = r.oid and d.defaclobjtype = 'f'
                     and d.defaclnamespace in (0, 'public'::regnamespace::oid)
                     and a.privilege_type = 'EXECUTE'
                     and a.grantee in (0, 'anon'::regrole::oid)), '')
  from pg_roles r
  where has_schema_privilege(r.rolname, 'public', 'CREATE')
    and r.rolname not like 'pg\\_%'
  order by 1
`);

/**
 * Exceptions assumées, avec leur raison et ce qui les rendrait caduques.
 *
 * `supabase_admin` appartient à la plateforme : `postgres` n'en est pas membre
 * (`pg_has_role` → false, `SET ROLE` refusé), donc ce défaut est hors de notre
 * portée. Le laisser échouer chaque nuit ferait d'un contrôle rouge en
 * permanence un contrôle qu'on n'ouvre plus — l'exception est donc écrite ici,
 * et c'est D2 qui garde les dents : le risque est latent, pas réalisé.
 */
const EXCEPTIONS_D1 = new Map([
  ['supabase_admin', 'rôle de la plateforme Supabase — non modifiable depuis `postgres`'],
]);

for (const [role, ligneGlobale, ouverts] of createurs) {
  const ferme = ligneGlobale === 'oui' && ouverts === '';
  const excuse = EXCEPTIONS_D1.get(role);

  if (excuse) {
    // Une exception doit rester nécessaire : si la plateforme referme ce défaut
    // un jour, l'exception devient un trou qu'on croit surveillé.
    assert(
      `l'exception D1 sur \`${role}\` est encore nécessaire (${excuse})`,
      !ferme,
      'ce défaut est désormais fermé : retire l\'entrée de EXCEPTIONS_D1, '
        + 'sinon un rôle réellement ouvert passerait à travers demain.',
    );
    continue;
  }

  assert(
    `D1 — une fonction créée par \`${role}\` dans public naîtra fermée`,
    ferme,
    ferme ? '' :
      (ligneGlobale === 'non'
        ? 'aucun privilège par défaut global : le défaut câblé du moteur accorde '
          + `encore EXECUTE à PUBLIC.\n       → ALTER DEFAULT PRIVILEGES FOR ROLE ${role} `
          + 'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC (exige d\'être membre du rôle).'
        : `privilèges par défaut ouverts à : ${ouverts}\n`
          + `       → ALTER DEFAULT PRIVILEGES FOR ROLE ${role} IN SCHEMA public `
          + 'REVOKE EXECUTE ON FUNCTIONS FROM anon.'),
  );
}

assert(
  'au moins un rôle créateur a été audité',
  createurs.length > 0,
  'aucun rôle ne peut créer dans public : requête suspecte, pas base rassurante.',
);

// ── D2 : le risque d'un défaut ouvert reste latent ───────────────────────────
// Nos migrations s'exécutent en `postgres`, et le SQL editor aussi : aucune
// fonction du schéma public n'appartient à un rôle d'exception aujourd'hui. Le
// jour où l'une y apparaît, elle sera née ouverte à PUBLIC — R1 l'attrapera la
// nuit suivante, D2 nomme la cause.
const proprietairesInterdits = createurs.length
  ? query(`
      select p.proname || ' (' || p.proowner::regrole::text || ')'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
        and p.proowner::regrole::text in (${[...EXCEPTIONS_D1.keys()].map(r => `'${r}'`).join(', ')})
      order by 1
    `).map(r => r[0])
  : [];

assert(
  'D2 — aucune fonction de public n\'appartient à un rôle dont le défaut reste ouvert',
  proprietairesInterdits.length === 0,
  proprietairesInterdits.length
    ? `${proprietairesInterdits.length} fonction(s) : ${proprietairesInterdits.join(', ')}\n`
      + '       → créée(s) par un rôle dont le défaut accorde EXECUTE à PUBLIC : '
      + 'ajoute un REVOKE explicite, ou recrée-la(s) en `postgres`.'
    : '',
);

// ── L'effet à la clé publique, pas seulement dans le catalogue ───────────────
async function appelAnonyme(fn, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, message: json?.message ?? '' };
}

for (const [fn, body] of SONDES_ANONYMES) {
  const { status, message } = await appelAnonyme(fn, body);
  assert(
    `à la clé anon de prod, ${fn} est refusée par le grant (pas par son corps)`,
    status >= 400 && message.includes('permission denied for function'),
    `HTTP ${status} — message : ${message || '—'}`,
  );
}

// Le contre-exemple, et il pèse autant que les refus : une révocation massive
// sans contrôle positif est indistinguable d'une panne massive.
const publique = await appelAnonyme('peek_box_invitation', { p_token: 'audit-inexistant' });
assert(
  'peek_box_invitation reste atteignable sans session (les pages publiques vivent)',
  publique.status === 200 && !publique.message.includes('permission denied'),
  `HTTP ${publique.status} — message : ${publique.message || '—'}`,
);

const lectures = [
  ['boxes', 'boxes?select=id&limit=1'],
  ['profiles', 'profiles?select=username&limit=1'],
];

for (const [nom, chemin] of lectures) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${chemin}`, {
    headers: { apikey: ANON_KEY },
  });
  assert(
    `l'annuaire /box et /classement lisent encore \`${nom}\` sans session`,
    res.ok,
    `HTTP ${res.status}`,
  );
}

console.log(`\n=== ${passed} ✅ · ${failed} ❌ ===\n`);
process.exit(failed === 0 ? 0 : 1);
