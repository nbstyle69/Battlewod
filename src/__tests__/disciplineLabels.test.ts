import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('Libellés gérant : Functional / Hybrid (valeurs internes inchangées)', () => {
  it('BOProgramming : crossfit → Functional, hyrox → Hybrid, valeurs conservées', () => {
    const src = read('screens/backoffice/BOProgrammingScreen.tsx');
    expect(src).toMatch(/const DISCIPLINES = \['crossfit', 'hyrox', 'hybrid', 'haltero', 'endurance'\]/);
    expect(src).toMatch(/crossfit: 'Functional'/);
    expect(src).toMatch(/hyrox: 'Hybrid'/);
    expect(src).toMatch(/\{disciplineLabel\(d\)\}/);
    expect(src).toMatch(/\{disciplineLabel\(p\.discipline\)\}/);
    expect(src).not.toMatch(/>\{d\}</);
    expect(src).not.toMatch(/>\{p\.discipline\}</);
  });

  it("annuaire des box : plus de « CrossFit » / « Hyrox » comme catégorie", () => {
    for (const f of ['screens/explorer/BoxDirectoryScreen.tsx', 'screens/explorer/BoxDirectoryDetailScreen.tsx']) {
      const src = read(f);
      expect(src).toMatch(/crossfit: 'Functional'/);
      expect(src).toMatch(/hyrox: 'Hybrid'/);
      expect(src).not.toMatch(/'CrossFit'|'Hyrox'/);
    }
  });
});
