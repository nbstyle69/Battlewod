/**
 * Un update EAS ne s'applique qu'aux builds du même runtime : publié sur un
 * runtime sans build, il est ignoré en silence par les appareils. Sort en échec
 * si aucun build terminé ne porte le runtime visé.
 *
 * usage : node scripts/ota-runtime-guard.mjs <builds.json> <runtime>
 */
import { readFileSync } from 'node:fs';

const [file, runtime] = process.argv.slice(2);
if (!file || !runtime) {
  console.error('usage : node scripts/ota-runtime-guard.mjs <builds.json> <runtime>');
  process.exit(2);
}

const builds = JSON.parse(readFileSync(file, 'utf8'));
// `runtimeVersion` est absent de la sortie de `build:list` ; avec la policy
// appVersion, `appVersion` le porte.
const match = builds.filter(
  (b) => b.status === 'FINISHED' && (b.runtimeVersion ?? b.appVersion) === runtime,
);

if (match.length === 0) {
  const seen = [...new Set(builds.map((b) => b.runtimeVersion ?? b.appVersion))].join(', ');
  console.error(`aucun build terminé sur le runtime ${runtime} (runtimes vus : ${seen || 'aucun'})`);
  process.exit(1);
}

console.log(`${match.length} build(s) terminé(s) sur le runtime ${runtime} : ${match.map((b) => b.platform).join(', ')}`);
