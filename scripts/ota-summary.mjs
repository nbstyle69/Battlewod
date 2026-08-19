/**
 * Écrit l'identité de l'update publié dans le résumé du job : c'est ce qui rend
 * le constat d'appareil falsifiable (comparer `Updates.updateId` à cet ID).
 *
 * usage : node scripts/ota-summary.mjs <update.json> <commit>
 */
import { readFileSync } from 'node:fs';

const [file, commit] = process.argv.slice(2);
const parsed = JSON.parse(readFileSync(file, 'utf8'));
const updates = Array.isArray(parsed) ? parsed : [parsed];

const lines = [
  '### Update publié',
  '',
  '| Plateforme | Update ID | Groupe | Runtime | Branche |',
  '|---|---|---|---|---|',
  ...updates.map(
    (u) => `| ${u.platform} | \`${u.id}\` | \`${u.group}\` | ${u.runtimeVersion} | ${u.branch ?? 'production'} |`,
  ),
  '',
  `Commit : \`${commit}\``,
  '',
  "Constat d'appareil : comparer `Updates.updateId` sur l'appareil à l'ID ci-dessus.",
  "« L'écran s'affiche » ne prouve rien — l'ancien code s'affiche aussi.",
];

console.log(lines.join('\n'));
