/**
 * Historique unifié « Mes entraînements » : WOD générés + scores de box +
 * WOD de box marqués « réalisés » sans score (`wod_completions`), en une seule
 * liste chronologique, chaque ligne ouvrant son détail.
 */
import fs from 'fs';
import path from 'path';
import { buildHistoryEntries, countScores, BoxScoreRow, CompletionRow } from '../lib/wodHistoryEntries';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const screen = read('screens/wod/WodHistoryScreen.tsx');
const fr = JSON.parse(read('i18n/locales/fr.json'));
const en = JSON.parse(read('i18n/locales/en.json'));

const generated = [{ id: 'g1', created_at: '2026-09-01T10:00:00Z', scores: [{ id: 'gs1' }] }];
const boxScore: BoxScoreRow = {
  id: 's1', wod_id: 'w-scored', score_value: 540, score_type: 'time', rx: true,
  submitted_at: '2026-09-03T10:00:00Z', wod: { title: 'Fran', wod_type: 'for_time' },
};
const completionNoScore: CompletionRow = {
  id: 'c1', wod_id: 'w-done', completed_at: '2026-09-02T10:00:00Z', wod: { title: 'Murph', wod_type: 'for_time' },
};
const completionAlsoScored: CompletionRow = {
  id: 'c2', wod_id: 'w-scored', completed_at: '2026-09-03T09:00:00Z', wod: { title: 'Fran', wod_type: 'for_time' },
};

describe('buildHistoryEntries', () => {
  it('un WOD marqué réalisé sans score apparaît dans l’historique, à sa date', () => {
    const entries = buildHistoryEntries(generated, [boxScore], [completionNoScore, completionAlsoScored]);
    expect(entries.map(e => e.kind)).toEqual(['boxScore', 'completion', 'generated']);
    const done = entries.find(e => e.kind === 'completion');
    expect(done).toMatchObject({ wodId: 'w-done', date: '2026-09-02T10:00:00Z' });
  });

  it('mutation inverse : sans les `wod_completions`, le WOD réalisé sans score disparaît', () => {
    const entries = buildHistoryEntries(generated, [boxScore], []);
    expect(entries.some(e => e.kind === 'completion')).toBe(false);
    expect(entries).toHaveLength(2);
  });

  it('un score sur le même WOD remplace la ligne « réalisé » (pas de doublon)', () => {
    const entries = buildHistoryEntries([], [boxScore], [completionAlsoScored]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('boxScore');
  });

  it('les scores comptés réunissent scores générés et scores de box', () => {
    expect(countScores(buildHistoryEntries(generated, [boxScore], [completionNoScore]))).toBe(2);
  });
});

describe('WodHistoryScreen — sources et rendu', () => {
  it('interroge les trois tables et fusionne via buildHistoryEntries', () => {
    expect(screen).toContain(".from('generated_wods')");
    expect(screen).toMatch(/\.from\('wod_scores'\)[\s\S]*?\.eq\('member_id', user\.id\)/);
    expect(screen).toMatch(/\.from\('wod_completions'\)[\s\S]*?\.eq\('member_id', user\.id\)/);
    expect(screen).toContain('buildHistoryEntries(');
  });

  it('une ligne de box porte la mention « réalisé, sans score » et ouvre WODDetail', () => {
    const fn = screen.slice(screen.indexOf('function renderBoxEntry('), screen.indexOf('function renderEntry('));
    expect(fn).toContain("navigation.navigate('WODDetail', { wodId: entry.wodId })");
    expect(fn).toContain("t('wodHistory.completedNoScore')");
    expect(fr.wodHistory.completedNoScore).toBe('Réalisé, sans score');
    expect(en.wodHistory.completedNoScore).toBe('Completed, no score');
  });
});
