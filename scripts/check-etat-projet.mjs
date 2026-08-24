#!/usr/bin/env node
/**
 * « Un lot qui se ferme sans sa ligne dans l'état du projet est un lot incomplet — même
 * statut que les types régénérés. » Une règle qui s'est déjà oubliée ne se réécrit pas :
 * elle devient un contrôle (règle 14 de REGLES_DE_VERIFICATION.md).
 *
 * Le contrôle est fail-closed : une PR qui touche le code applicatif ou la base sans
 * toucher docs/ETAT_DU_PROJET.md est rouge, sauf sortie explicite et motivée dans la
 * description de la PR :
 *
 *     État du projet : sans objet — <raison>
 *
 * Entrées (fournies par la CI) : la liste des fichiers changés sur stdin (un par ligne),
 * et la description de la PR dans PR_BODY.
 */
import fs from 'fs';

const DOC = 'docs/ETAT_DU_PROJET.md';
/** Un changement ici ferme ou déplace une capacité visible : il doit se dire dans l'état. */
const WATCHED = [/^src\//, /^supabase\/migrations\//, /^supabase\/functions\//, /^app\.json$/];
const EXEMPT_LINE = /État du projet\s*:\s*sans objet\s*[—-]\s*(.+)$/u;

function fail(msg) {
  console.error(`\u001b[31m✕ ${msg}\u001b[0m`);
  process.exit(1);
}

const changed = fs
  .readFileSync(process.argv[2] ?? 0, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

// Une liste vide n'est pas un succès : c'est une entrée manquante (règle 16).
if (changed.length === 0) fail('aucun fichier changé reçu — le contrôle n’a rien pu examiner.');

const watched = changed.filter((f) => WATCHED.some((re) => re.test(f)));
console.log(`${changed.length} fichier(s) changé(s), dont ${watched.length} sous surveillance.`);

if (watched.length === 0) {
  console.log('✓ aucun fichier sous surveillance — rien à déclarer dans l’état du projet.');
  process.exit(0);
}

if (changed.includes(DOC)) {
  console.log(`✓ ${DOC} est dans la même PR.`);
  process.exit(0);
}

const body = process.env.PR_BODY ?? '';
const exempt = body.split('\n').map((l) => l.match(EXEMPT_LINE)).find(Boolean);
if (exempt) {
  const reason = exempt[1].trim();
  if (reason.length < 10) {
    fail(`sortie déclarée sans raison utilisable : « ${reason} ».`);
  }
  console.log(`✓ sortie explicite déclarée : ${reason}`);
  process.exit(0);
}

fail(
  `cette PR touche ${watched.length} fichier(s) sous surveillance (ex. ${watched[0]}) ` +
    `sans mettre ${DOC} à jour.\n` +
    `  Ajoute la ligne du lot dans ${DOC}, ou déclare la sortie dans la description :\n` +
    `  « État du projet : sans objet — <raison> »`,
);
