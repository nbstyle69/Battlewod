import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const MIGRATION = fs.readFileSync(
  path.join(__dirname, '../../supabase/migrations/20261202_physical_competitions_served.sql'),
  'utf8',
);

// Une compétition physique passée ne doit plus être servie « open » : l'app lit
// la vue physical_competitions_served (statut recalculé par date), jamais la
// table brute. La preuve fonctionnelle (passée → closed, à venir → open) est la
// suite `phys-served` d'integration.yml ; ici on affirme le câblage.
describe('physical_competitions_served — passée ≠ ouverte', () => {
  it("l'app lit la vue, pas la table brute", () => {
    for (const f of ['screens/home/HomeScreen.tsx', 'screens/competition/PhysicalCompetitionScreen.tsx']) {
      const src = read(f);
      expect(src).toContain(".from('physical_competitions_served')");
      expect(src).not.toContain(".from('physical_competitions')");
    }
  });

  it('la vue recalcule le statut par date, security_invoker, lisible par anon et authenticated', () => {
    expect(MIGRATION).toMatch(/CREATE OR REPLACE VIEW public\.physical_competitions_served/);
    expect(MIGRATION).toMatch(/security_invoker = true/);
    expect(MIGRATION).toMatch(/WHEN c\.status <> 'closed' AND c\.date::date < current_date THEN 'closed'/);
    expect(MIGRATION).toMatch(/GRANT SELECT ON public\.physical_competitions_served TO anon, authenticated/);
  });
});
