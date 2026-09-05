import fs from 'fs';
import path from 'path';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'fr' }] }));

import i18n from '../i18n';

const SRC = fs.readFileSync(path.join(__dirname, '../screens/home/HomeScreen.tsx'), 'utf8');
const section = SRC.slice(SRC.indexOf('── Tournois'), SRC.indexOf('── Résultats récents') > 0 ? SRC.indexOf('── Résultats récents') : undefined);

// 1.0.52 L1 : « Voir tout » de la section Tournois ne faisait rien et le
// libellé sortait dans la mauvaise langue.
describe('HomeScreen — section Tournois (L1)', () => {
  it('le bouton « tous les tournois » navigue vers la liste des tournois', () => {
    expect(section).toContain("nav.navigate('Competitions', { screen: 'CompetitionList', params: { initialTab: 0 } })");
  });

  it('le libellé suit la langue courante', async () => {
    await i18n.changeLanguage('fr');
    expect(i18n.t('home.seeAllTournaments')).toBe('Tous les tournois');
    expect(i18n.t('home.tournamentStatus.closed')).toBe('Terminé');
    await i18n.changeLanguage('en');
    expect(i18n.t('home.seeAllTournaments')).toBe('All tournaments');
    expect(i18n.t('home.tournamentStatus.closed')).toBe('Finished');
    expect(i18n.t('home.tournamentParticipants', { n: 3, max: 16 })).toBe('3/16 participants');
  });

  it("aucune chaîne française en dur dans les cartes tournoi", () => {
    expect(section).not.toMatch(/'Ouvert'|'En cours'|'Terminé'|} participants</);
  });
});

// Sans box sélectionnée, la requête partait avec `box_id=eq.` (filtre vide) :
// PostgREST répondait 400 et l'erreur n'était jamais lue.
describe('HomeScreen — chargement des tournois sans box', () => {
  const query = SRC.slice(SRC.indexOf('const boxFilter = currentBox?.id'), SRC.indexOf('const mapped: CompetitionSummary[]'));

  it("ne requête pas `tournaments` sans boxFilter, et jamais avec un filtre vide", () => {
    expect(query).toMatch(/boxFilter\s*\?\s*await readRows\(/);
    expect(query).toMatch(/\.eq\('box_id', boxFilter\)/);
    expect(query).not.toMatch(/boxFilter \?\? ''/);
  });

  it("l'erreur PostgREST passe par readRows au lieu d'être avalée", () => {
    expect(query).toContain("{ screen: 'Home', action: 'tournaments' }");
    expect(query).not.toMatch(/const \{ data: tourns \} = await supabase/);
  });
});
