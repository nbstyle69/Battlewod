import fs from 'fs';
import path from 'path';

/**
 * Deux rubriques quasi homonymes, deux publics : le back-office vend et achète
 * des programmations entre box (« Marketplace »), et vend des programmes à ses
 * membres (« Programmes athlètes »). Côté athlète, le nom reste « Programmes » —
 * c'est celui que voit l'acheteur.
 *
 * Le contrôle lit les fichiers depuis le disque : un libellé qui revient à
 * l'ancien nom dans une seule des surfaces le fait échouer.
 */
const ROOT = path.join(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const locale = (lang: 'fr' | 'en') =>
  JSON.parse(read('src', 'i18n', 'locales', `${lang}.json`)) as Record<string, unknown>;

type Bo = {
  programming: { title: string; subtitle: string };
  programs: { title: string };
  dashboard: { qaProgramming: string; qaPrograms: string };
};
const bo = (lang: 'fr' | 'en') => locale(lang).bo as Bo;

describe('libellés back-office : Marketplace vs Programmes athlètes', () => {
  const CASES: Array<{
    lang: 'fr' | 'en';
    marketplace: string;
    athletePrograms: string;
    subtitleContains: string;
  }> = [
    {
      lang: 'fr',
      marketplace: 'Marketplace',
      athletePrograms: 'Programmes athlètes',
      subtitleContains: 'entre box',
    },
    {
      lang: 'en',
      marketplace: 'Marketplace',
      athletePrograms: 'Athlete programs',
      subtitleContains: 'between boxes',
    },
  ];

  let checked = 0;

  it.each(CASES)('$lang : les deux rubriques portent des noms distincts', (c) => {
    const b = bo(c.lang);
    expect(b.programming.title).toBe(c.marketplace);
    expect(b.dashboard.qaProgramming).toBe(c.marketplace);
    expect(b.programs.title).toBe(c.athletePrograms);
    expect(b.dashboard.qaPrograms).toBe(c.athletePrograms);
    expect(b.programming.title).not.toBe(b.programs.title);
    checked += 1;
  });

  it.each(CASES)('$lang : le sous-titre de la Marketplace nomme le circuit box→box', (c) => {
    expect(bo(c.lang).programming.subtitle).toContain(c.subtitleContains);
  });

  it('a bien examiné les deux langues', () => {
    expect(checked).toBe(CASES.length);
  });
});

describe('libellés côté athlète', () => {
  it('l’écran d’exploration s’appelle « Programmes », pas « Programmation »', () => {
    const screen = read('src', 'screens', 'explorer', 'ProgrammationScreen.tsx');
    expect(screen).toContain('>Programmes</Text>');
    expect(screen).not.toContain('>Programmation</Text>');
  });

  it('les boutons du générateur de WOD qui y mènent portent le même nom', () => {
    expect(read('src', 'components', 'WodGeneratorCard.tsx')).not.toContain(
      '>Programmation</Text>',
    );
    for (const lang of ['fr', 'en'] as const) {
      const wodGenerator = locale(lang).wodGenerator as { programming: string };
      expect(wodGenerator.programming).toBe(lang === 'fr' ? 'Programmes' : 'Programs');
    }
  });

  it('les noms techniques ne suivent pas le renommage (route et écran inchangés)', () => {
    // Renommer la route casserait les navigate() ; seul l'affichage bouge.
    expect(read('src', 'navigation', 'index.tsx')).toContain('Programmation:');
    expect(fs.existsSync(path.join(ROOT, 'src/screens/explorer/ProgrammationScreen.tsx'))).toBe(
      true,
    );
  });
});
