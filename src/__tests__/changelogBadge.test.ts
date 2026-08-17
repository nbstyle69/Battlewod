/**
 * Badge « Nouveautés » : le compteur doit porter sur la MÊME fenêtre que celle
 * que l'écran peut marquer « lu ». La régression corrigée ici : le compteur
 * soustrayait le total de la table (68) des lignes lues (50 marquables au
 * maximum), laissant un résidu de 18 — donc « 9+ » à chaque relance.
 */

jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));

interface Row { id?: string; changelog_id?: string }

let allEntries: string[] = [];
let readIds: string[] = [];
const calls: { table: string; limit?: number; inIds?: string[] }[] = [];

function makeBuilder(table: string) {
  const entry: { table: string; limit?: number; inIds?: string[] } = { table };
  calls.push(entry);
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    limit: (n: number) => { entry.limit = n; return builder; },
    in: (_col: string, ids: string[]) => { entry.inIds = ids; return builder; },
    then: (resolve: (r: { data: Row[]; error: null }) => unknown) => {
      const data: Row[] =
        table === 'app_changelog'
          ? allEntries.slice(0, entry.limit ?? allEntries.length).map(id => ({ id }))
          : readIds
              .filter(id => !entry.inIds || entry.inIds.includes(id))
              .map(id => ({ changelog_id: id }));
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
  return builder;
}

jest.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));

import { countUnreadChangelog, CHANGELOG_WINDOW } from '../lib/changelog';

const ctx = { screen: 'Test', action: 'test' };

beforeEach(() => { calls.length = 0; allEntries = []; readIds = []; });

// 68 entrées en base, comme la production au moment du bug.
const seed68 = () => { allEntries = Array.from({ length: 68 }, (_, i) => `e${i}`); };

test('base plus grande que la fenêtre : tout lu dans la fenêtre → badge 0', async () => {
  seed68();
  readIds = allEntries.slice(0, CHANGELOG_WINDOW); // ce que l'écran peut marquer
  expect(await countUnreadChangelog('u1', ctx)).toBe(0);
});

test('le compteur ne regarde que la fenêtre affichable', async () => {
  seed68();
  readIds = allEntries.slice(0, CHANGELOG_WINDOW);
  await countUnreadChangelog('u1', ctx);
  const clRead = calls.find(c => c.table === 'app_changelog');
  const readsRead = calls.find(c => c.table === 'changelog_reads');
  expect(clRead?.limit).toBe(CHANGELOG_WINDOW);
  expect(readsRead?.inIds).toHaveLength(CHANGELOG_WINDOW);
});

test('nouvelle annonce publiée → badge au bon compte, pas un résidu', async () => {
  seed68();
  readIds = allEntries.slice(0, CHANGELOG_WINDOW);
  allEntries = ['neuf1', 'neuf2', ...allEntries]; // 2 entrées plus récentes
  expect(await countUnreadChangelog('u1', ctx)).toBe(2);
});

test('utilisateur neuf : badge = taille de la fenêtre, pas le total de la table', async () => {
  seed68();
  readIds = [];
  expect(await countUnreadChangelog('u1', ctx)).toBe(CHANGELOG_WINDOW);
});

test('des lectures hors fenêtre ne créent jamais un badge négatif ni un résidu', async () => {
  allEntries = ['a', 'b', 'c'];
  readIds = ['a', 'b', 'c', 'vieux1', 'vieux2'];
  expect(await countUnreadChangelog('u1', ctx)).toBe(0);
});

test('table vide : aucune requête de lectures, badge 0', async () => {
  allEntries = [];
  expect(await countUnreadChangelog('u1', ctx)).toBe(0);
  expect(calls.some(c => c.table === 'changelog_reads')).toBe(false);
});
