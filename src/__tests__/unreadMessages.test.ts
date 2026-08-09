/**
 * 4.2 — badge de messages non lus.
 * Le comptage doit venir de `group_messages` + `box_messages` (la table
 * `messages` n'est plus alimentée), filtré par la dernière ouverture de
 * l'écran Messages.
 */

const mockGetItem = jest.fn<Promise<string | null>, [string]>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: (k: string) => mockGetItem(k) },
}));

jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));

interface CountResult { count: number | null; error: null }
interface GroupsResult { data: { id: string }[]; error: null }

const groupsResult: GroupsResult = { data: [], error: null };
const counts: Record<string, number> = { group_messages: 0, box_messages: 0 };
const calls: { table: string; filters: string[] }[] = [];

function makeBuilder(table: string) {
  const filters: string[] = [];
  const entry = { table, filters };
  calls.push(entry);
  const builder = {
    select: () => builder,
    eq: (col: string, val: string) => { filters.push(`eq:${col}=${val}`); return builder; },
    neq: (col: string, val: string) => { filters.push(`neq:${col}=${val}`); return builder; },
    is: (col: string, val: null) => { filters.push(`is:${col}=${String(val)}`); return builder; },
    in: (col: string, vals: string[]) => { filters.push(`in:${col}=${vals.join(',')}`); return builder; },
    or: (expr: string) => { filters.push(`or:${expr}`); return builder; },
    gt: (col: string, val: string) => { filters.push(`gt:${col}=${val}`); return builder; },
    contains: (col: string, vals: string[]) => { filters.push(`contains:${col}=${vals.join(',')}`); return builder; },
    then: (resolve: (r: CountResult | GroupsResult) => unknown) =>
      Promise.resolve(
        table === 'message_groups'
          ? groupsResult
          : ({ count: counts[table] ?? 0, error: null } as CountResult),
      ).then(resolve),
  };
  return builder;
}

jest.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));

import { countUnreadMessages, lastSeenMessagesKey, markMessagesSeen, subscribeMessagesSeen } from '../lib/unreadMessages';

beforeEach(() => {
  calls.length = 0;
  groupsResult.data = [];
  counts.group_messages = 0;
  counts.box_messages = 0;
  mockGetItem.mockReset();
  mockGetItem.mockResolvedValue(null);
});

describe('countUnreadMessages', () => {
  it('compte un nouveau message de groupe posté par un co-membre', async () => {
    groupsResult.data = [{ id: 'g1' }];
    counts.group_messages = 1;
    mockGetItem.mockResolvedValue('2026-01-01T00:00:00.000Z');

    expect(await countUnreadMessages('u1', 'b1')).toBe(1);

    const gm = calls.find(c => c.table === 'group_messages');
    expect(gm?.filters).toEqual(expect.arrayContaining([
      'in:group_id=g1',
      'neq:sender_id=u1',
      'gt:created_at=2026-01-01T00:00:00.000Z',
    ]));
  });

  it('retombe à 0 une fois l’écran ouvert (lastSeen postérieur au message)', async () => {
    groupsResult.data = [{ id: 'g1' }];
    counts.group_messages = 0;
    mockGetItem.mockResolvedValue('2026-02-01T00:00:00.000Z');

    expect(await countUnreadMessages('u1', 'b1')).toBe(0);
    expect(mockGetItem).toHaveBeenCalledWith(lastSeenMessagesKey('u1', 'b1'));
  });

  it('additionne les annonces box destinées au membre', async () => {
    groupsResult.data = [{ id: 'g1' }, { id: 'g2' }];
    counts.group_messages = 2;
    counts.box_messages = 3;

    expect(await countUnreadMessages('u1', 'b1')).toBe(5);
    const bm = calls.find(c => c.table === 'box_messages');
    expect(bm?.filters).toContain('or:target_group_id.is.null,target_group_id.in.(g1,g2)');
  });

  it('sans groupe, ne compte que les annonces adressées à tous', async () => {
    counts.box_messages = 1;

    expect(await countUnreadMessages('u1', 'b1')).toBe(1);
    expect(calls.some(c => c.table === 'group_messages')).toBe(false);
    expect(calls.find(c => c.table === 'box_messages')?.filters).toContain('is:target_group_id=null');
  });
});

describe('markMessagesSeen', () => {
  it('notifie les abonnés puis les libère au désabonnement', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeMessagesSeen(listener);
    markMessagesSeen();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    markMessagesSeen();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
