import fs from 'fs';
import path from 'path';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'fr' }] }));

import i18n from '../i18n';
import {
  EloEntry, MatchEloRow, matchEloRowToEntry, sortEloEntries, eloCurvePoints,
} from '../utils/eloHistoryEntries';

const SRC = fs.readFileSync(path.join(__dirname, '../screens/profile/EloHistoryScreen.tsx'), 'utf8');

const labels = {
  deletedMatch: 'Match supprimé',
  unknownOpponent: 'adversaire inconnu',
  versus: (o: string) => `vs ${o}`,
};

function matchRow(over: Partial<MatchEloRow> = {}): MatchEloRow {
  return {
    id: 'meh-1',
    match_id: 'bm-1',
    opponent_id: 'p-2',
    result: 'win',
    elo_before: 1230,
    elo_after: 1243,
    elo_delta: 13,
    created_at: '2026-08-19T19:12:00Z',
    tournament_bracket_matches: { tournament_id: 't-1', tournaments: { name: 'Battle AthleX #3' } },
    ...over,
  };
}

// trg_bracket_match_elo écrit dans tournament_match_elo_history ; l'écran ne lisait que elo_history,
// tournament_elo_history et daily_tournament_elo_history → la courbe d'un joueur de bracket ne
// retombait pas sur son ELO affiché.
describe('EloHistoryScreen — deltas des matchs de bracket', () => {
  it('lit tournament_match_elo_history filtré sur athlete_id, avec le tournoi via le match', () => {
    const q = SRC.slice(SRC.indexOf("from('tournament_match_elo_history')"));
    expect(q).toMatch(/\.select\('id, match_id, opponent_id, result, elo_before, elo_after, elo_delta, created_at, tournament_bracket_matches\(tournament_id, tournaments\(name\)\)'\)/);
    expect(q).toMatch(/\.eq\('athlete_id', user\.id\)/);
    expect(SRC).toMatch(/matchEloRowToEntry\(r, opponentNames, matchLabels\)/);
  });

  it('convertit une ligne de match en entrée typée « match », libellée tournoi · vs adversaire', () => {
    const e = matchEloRowToEntry(matchRow(), { 'p-2': 'Diego B.' }, labels);
    expect(e).toEqual<EloEntry>({
      id: 'meh-1', type: 'match', refId: 't-1', label: 'Battle AthleX #3 · vs Diego B.',
      delta: 13, eloBefore: 1230, eloAfter: 1243, rank: null, date: '2026-08-19T19:12:00Z',
    });
  });

  it('accepte la forme tableau des jointures PostgREST et un adversaire inconnu', () => {
    const e = matchEloRowToEntry(
      matchRow({ tournament_bracket_matches: [{ tournament_id: 't-1', tournaments: [{ name: 'Sprint #7' }] }], opponent_id: null }),
      {}, labels,
    );
    expect(e.label).toBe('Sprint #7 · vs adversaire inconnu');
  });

  it('un match supprimé (match_id NULL, ON DELETE SET NULL) garde son delta et un libellé traduit', async () => {
    const e = matchEloRowToEntry(matchRow({ match_id: null, tournament_bracket_matches: null }), {}, labels);
    expect(e.label).toBe('Match supprimé');
    expect(e.refId).toBeNull();
    expect(e.delta).toBe(13);
    await i18n.changeLanguage('fr');
    expect(i18n.t('eloHistory.deletedMatch')).toBe('Match supprimé');
    expect(i18n.t('eloHistory.versus', { opponent: 'Léa' })).toBe('vs Léa');
    await i18n.changeLanguage('en');
    expect(i18n.t('eloHistory.deletedMatch')).toBe('Deleted match');
  });

  it("le dernier point de la courbe retombe sur l'ELO du profil une fois les matchs intercalés", () => {
    const wod = (id: string, date: string, before: number, after: number): EloEntry => ({
      id, type: 'wod', refId: 'w', label: 'WOD', delta: after - before, eloBefore: before, eloAfter: after, rank: 3, date,
    });
    const entries = sortEloEntries([
      wod('w1', '2026-08-17T10:00:00Z', 1200, 1230),
      matchEloRowToEntry(matchRow({ id: 'm1', created_at: '2026-08-18T19:00:00Z', elo_before: 1230, elo_after: 1243, elo_delta: 13 }), {}, labels),
      wod('w2', '2026-08-20T10:00:00Z', 1243, 1270),
      matchEloRowToEntry(matchRow({ id: 'm2', created_at: '2026-08-21T19:00:00Z', elo_before: 1270, elo_after: 1253, elo_delta: -17, result: 'loss' }), {}, labels),
    ]);
    expect(entries.map(e => e.id)).toEqual(['m2', 'w2', 'm1', 'w1']);
    const profileElo = 1253;
    expect(eloCurvePoints(entries)).toEqual([1200, 1230, 1243, 1270, 1253]);
    expect(eloCurvePoints(entries).at(-1)).toBe(profileElo);
    // Sans les matchs, la courbe s'arrête à 1270 ≠ ELO profil : c'était le bug.
    expect(eloCurvePoints(entries.filter(e => e.type !== 'match')).at(-1)).not.toBe(profileElo);
  });
});
