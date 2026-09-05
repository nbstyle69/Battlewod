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

describe('Libellés athlète : une seule terminologie (les 3 occurrences laissées par #250)', () => {
  it('i18n FR/EN : benchmarks, exemple de nom de box, bio — plus de CrossFit/Hyrox visibles', () => {
    for (const f of ['i18n/locales/fr.json', 'i18n/locales/en.json']) {
      const json = JSON.parse(read(f));
      expect(json.profile.pr.categories.benchmarks).toMatch(/Functional/);
      expect(json.bo.boxInfo.namePlaceholder).toMatch(/^Functional Lyon/);
      expect(json.profile.account.bioPlaceholder).toContain('#functional');
      expect(read(f)).not.toMatch(/CrossFit|Hyrox|#crossfit/);
    }
  });

  it("TimerRun : le prompt d'analyse vidéo dit Functional", () => {
    const src = read('screens/timer/TimerRunScreen.tsx');
    expect(src).toContain('Analyse cette vidéo Functional AthleX');
    expect(src).not.toMatch(/vidéo CrossFit/);
  });

  it('la clé de stockage historique des PR « Benchmarks CrossFit » est conservée (migration des données)', () => {
    expect(read('screens/profile/prStorage.ts')).toContain("'Benchmarks CrossFit': 'benchmarks'");
  });
});
