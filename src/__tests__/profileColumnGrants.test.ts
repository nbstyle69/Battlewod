/**
 * Garde structurelle du Lot 0-bis (partie 2).
 *
 * `full_name`, `gender` et `personal_records` ne sont plus grantées à
 * `authenticated` : un `select` qui les mentionne échoue en 42501 — et il fait
 * échouer TOUTE la requête, y compris la partie légitime. Un classement entier
 * peut donc disparaître en silence pour une seule colonne de trop (c'est
 * exactement ce qui est arrivé au classement de WODDetailScreen).
 *
 * Ce test relit les `select` du code source : les trois colonnes ne se lisent
 * que par RPC (`get_my_profile`, `get_athlete_private_profile`,
 * `get_box_members_private_profiles`), jamais par la table.
 */
import fs from 'fs';
import path from 'path';

const REVOKED = ['full_name', 'gender', 'personal_records'];
const SRC = path.join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(p, out); }
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Extrait les chaînes passées à `.select(...)`, y compris les jointures imbriquées. */
function selectStrings(code: string): string[] {
  return [...code.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)].map(m => m[2]);
}

describe('colonnes de profil révoquées (Lot 0-bis partie 2)', () => {
  const files = walk(SRC);

  it('trouve bien les fichiers source (le test doit pouvoir échouer)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(REVOKED)('aucun select de table ne mentionne %s sur profiles', col => {
    const faults: string[] = [];
    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      for (const sel of selectStrings(code)) {
        // On ne s'intéresse qu'aux `select` qui touchent `profiles` : la table
        // elle-même (`from('profiles')`) ou une jointure `profiles(...)`.
        const touchesProfiles = sel.includes('profiles(') || /from\(\s*['"`]profiles['"`]/.test(code);
        if (touchesProfiles && new RegExp(`\\b${col}\\b`).test(sel)) {
          faults.push(`${path.relative(SRC, file)} → select('${sel.slice(0, 90)}')`);
        }
      }
    }
    expect(faults).toEqual([]);
  });
});
