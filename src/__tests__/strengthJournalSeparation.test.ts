// Verrou structurel du lot 4 : les séries de force ne financent pas les badges.
//
// `movement_logs` crédite les badges de mouvement et les reps à vie, et le lot 2
// a délibérément rendu les blocs de force invisibles à ce crédit. Écrire les
// séries réalisées dans cette table déferait cette décision en silence : le
// journal a donc sa propre table, et ce test empêche la confusion de revenir.

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');

// Les commentaires du service PARLENT de movement_logs et de program_wods (ils
// expliquent justement pourquoi il ne les touche pas) : le verrou porte sur le
// code, donc on retire commentaires de ligne et de bloc avant de chercher.
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const service = stripComments(read('services/strengthSets.ts'));
const screens = [
  'screens/whiteboard/WODDetailScreen.tsx',
  'screens/programs/ProgramDetailScreen.tsx',
];

describe('journal des séries et crédit de badges restent séparés', () => {
  it('le service du journal n’écrit que dans strength_set_logs', () => {
    expect(service).toContain("from('strength_set_logs')");
    expect(service).not.toContain('movement_logs');
    expect(service).not.toContain('logMovementReps');
    expect(service).not.toContain('user_movement_stats');
  });

  it('les deux écrans de saisie envoient les séries au journal, pas au crédit', () => {
    for (const file of screens) {
      const code = stripComments(read(file));
      expect(code).toContain('logStrengthSets(');
      // Le crédit de badges reste alimenté par les mouvements du WOD
      // (computeCompletedMovements), jamais par la grille de force.
      const creditCall = code.match(/logMovementReps\(\s*[^)]*\)/g) ?? [];
      for (const call of creditCall) {
        expect(call).not.toMatch(/strengthDrafts|performed/);
      }
    }
  });

  it('le journal ne dépend pas de program_wods, qui disparaît au lot 5', () => {
    expect(service).not.toContain('program_wods');
    expect(service).toContain('StrengthSourceType');
  });
});
