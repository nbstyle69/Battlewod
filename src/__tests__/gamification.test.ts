import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Supabase chainable mock ────────────────────────────────────────────────────
const makeChain = (overrides: Record<string, any> = {}) => {
  const chain: any = {};
  chain.select   = jest.fn(() => chain);
  chain.insert   = jest.fn().mockResolvedValue({ data: null, error: null });
  chain.update   = jest.fn(() => chain);
  chain.delete   = jest.fn(() => chain);
  chain.eq       = jest.fn(() => chain);
  chain.neq      = jest.fn(() => chain);
  chain.in       = jest.fn(() => chain);
  chain.order    = jest.fn(() => chain);
  chain.single   = jest.fn().mockResolvedValue({
    data: { title: 'Badge Test', icon: '🏅', description: 'Test description' },
  });
  chain.maybySingle = jest.fn().mockResolvedValue({ data: null });
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: null });
  Object.assign(chain, overrides);
  return chain;
};

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => makeChain()),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      // Par défaut : session d'un tiers (chemin owner). Les tests du chemin
      // athlète repositionnent l'identifiant sur celui du porteur du badge.
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'owner-1' } } } }),
    },
  },
}));

jest.mock('../lib/haptics', () => ({
  hapticHeavy:     jest.fn(),
  hapticLight:     jest.fn(),
  hapticMedium:    jest.fn(),
  hapticSuccess:   jest.fn(),
  hapticError:     jest.fn(),
  hapticSelection: jest.fn(),
}));

jest.mock('../lib/sentry', () => ({
  captureError:      jest.fn(),
  setUserContext:    jest.fn(),
  clearUserContext:  jest.fn(),
}));

import {
  isBadgeUnobtainable,
  readBadgeQueue,
  clearBadgeQueue,
  checkAndAwardBadges,
  getBadgesCatalog,
  getEarnedBadges,
  type BadgeQueueItem,
} from '../services/gamification';

// ── readBadgeQueue / clearBadgeQueue ──────────────────────────────────────────

describe('readBadgeQueue', () => {
  beforeEach(() => {
    (AsyncStorage.clear as jest.Mock).mockClear();
    (AsyncStorage.getItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockReset();
    (AsyncStorage.removeItem as jest.Mock).mockReset();
  });

  it('returns empty array when key does not exist', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const result = await readBadgeQueue('user-1');
    expect(result).toEqual([]);
  });

  it('returns parsed array when key exists', async () => {
    const items: BadgeQueueItem[] = [
      { badge_key: 'first_score', title: 'First Score', icon: '🏅', description: 'Submit your first score' },
    ];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(items));
    const result = await readBadgeQueue('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].badge_key).toBe('first_score');
  });

  it('returns empty array on malformed JSON', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('parse error'));
    const result = await readBadgeQueue('user-1');
    expect(result).toEqual([]);
  });

  it('uses correct storage key per userId', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    await readBadgeQueue('user-abc');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('@athlex:badge_queue_user-abc');
  });

  it('returns multiple badges from queue', async () => {
    const items: BadgeQueueItem[] = [
      { badge_key: 'first_score', title: 'First Score', icon: '🏅', description: '' },
      { badge_key: 'wod_gen_100', title: 'Generator', icon: '⚙️', description: '' },
    ];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(items));
    const result = await readBadgeQueue('user-1');
    expect(result).toHaveLength(2);
    expect(result[1].badge_key).toBe('wod_gen_100');
  });
});

describe('clearBadgeQueue', () => {
  it('calls removeItem with correct key', async () => {
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValueOnce(undefined);
    await clearBadgeQueue('user-42');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@athlex:badge_queue_user-42');
  });

  it('does not throw on error', async () => {
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('storage error'));
    await expect(clearBadgeQueue('user-1')).resolves.not.toThrow();
  });
});

// ── checkAndAwardBadges ───────────────────────────────────────────────────────

describe('checkAndAwardBadges', () => {
  const { supabase } = require('../lib/supabase');

  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockImplementation(() => makeChain());
  });

  it('returns empty array when no conditions met', async () => {
    const result = await checkAndAwardBadges('user-1', {
      total_scores_submitted: 0,
      total_wods_generated: 0,
      total_timer_sessions: 0,
    });
    expect(result).toEqual([]);
  });

  it('awards first_score when total_scores_submitted >= 1', async () => {
    const result = await checkAndAwardBadges('user-1', { total_scores_submitted: 1 });
    expect(result).toContain('first_score');
  });

  it('awards wod_gen_100 when total_wods_generated >= 100', async () => {
    const result = await checkAndAwardBadges('user-1', { total_wods_generated: 100 });
    expect(result).toContain('wod_gen_100');
  });

  it('awards timer_50 when total_timer_sessions >= 50', async () => {
    const result = await checkAndAwardBadges('user-1', { total_timer_sessions: 50 });
    expect(result).toContain('timer_50');
  });

  it('awards chatty_50 when total_messages_sent >= 50', async () => {
    const result = await checkAndAwardBadges('user-1', { total_messages_sent: 50 });
    expect(result).toContain('chatty_50');
  });

  it('awards social_5 when total_friends >= 5', async () => {
    const result = await checkAndAwardBadges('user-1', { total_friends: 5 });
    expect(result).toContain('social_5');
  });

  it('awards veteran_10 when total_tournaments >= 10', async () => {
    const result = await checkAndAwardBadges('user-1', { total_tournaments: 10 });
    expect(result).toContain('veteran_10');
  });

  it('awards first_win when total_tournament_wins >= 1', async () => {
    const result = await checkAndAwardBadges('user-1', { total_tournament_wins: 1 });
    expect(result).toContain('first_win');
  });

  it('awards champion_5 when total_tournament_wins >= 5', async () => {
    const result = await checkAndAwardBadges('user-1', { total_tournament_wins: 5 });
    expect(result).toContain('champion_5');
  });

  it('awards both first_win and champion_5 when wins >= 5', async () => {
    const result = await checkAndAwardBadges('user-1', { total_tournament_wins: 5 });
    expect(result).toContain('first_win');
    expect(result).toContain('champion_5');
  });

  it('awards ELO level badges at correct thresholds', async () => {
    const result1 = await checkAndAwardBadges('user-1', { elo: 1001 });
    expect(result1).toContain('level_inter');

    const result2 = await checkAndAwardBadges('user-2', { elo: 1200 });
    expect(result2).toContain('level_rx');

    const result3 = await checkAndAwardBadges('user-3', { elo: 1600 });
    expect(result3).toContain('level_elite');
  });

  it('does not award ELO badge below threshold', async () => {
    const result = await checkAndAwardBadges('user-1', { elo: 999 });
    expect(result).not.toContain('level_inter');
  });

  it('does not award badge if already earned (maybeSingle returns existing data)', async () => {
    supabase.from.mockImplementation(() =>
      makeChain({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'existing-badge' } }) }),
    );
    const result = await checkAndAwardBadges('user-1', { total_scores_submitted: 1 });
    expect(result).not.toContain('first_score');
  });

  it('does not award badge on Supabase insert error', async () => {
    supabase.from.mockImplementation(() =>
      makeChain({ insert: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }) }),
    );
    const result = await checkAndAwardBadges('user-1', { total_scores_submitted: 1 });
    expect(result).not.toContain('first_score');
  });

  it('awards multiple badges in a single call', async () => {
    const result = await checkAndAwardBadges('user-1', {
      total_scores_submitted: 1,
      total_wods_generated: 100,
      total_friends: 5,
    });
    expect(result).toContain('first_score');
    expect(result).toContain('wod_gen_100');
    expect(result).toContain('social_5');
  });

  it('treats missing counters as 0 (no false positives)', async () => {
    const result = await checkAndAwardBadges('user-1', {});
    expect(result).toEqual([]);
  });
});

// ── Badges sans source d'attribution ──────────────────────────────────────────

describe('isBadgeUnobtainable', () => {
  it('flags the client-counter and tutorial badges', () => {
    ['timer_50', 'wod_gen_100', 'first_step', 'streak_1w', 'streak_26w']
      .forEach(k => expect(isBadgeUnobtainable(k)).toBe(true));
  });

  it('leaves every server-verifiable and owner-credited badge visible', () => {
    ['level_scaled', 'level_pro', 'first_score', 'first_win', 'podium',
     'champion_5', 'veteran_10', 'social_5', 'chatty_50', 'mv_thrusters_100']
      .forEach(k => expect(isBadgeUnobtainable(k)).toBe(false));
  });
});

// ── Chemin athlète : le serveur décide ────────────────────────────────────────

describe('badge claimed by the athlete themselves', () => {
  const { supabase } = require('../lib/supabase');

  beforeEach(() => {
    supabase.from.mockImplementation(() => makeChain());
    supabase.rpc.mockReset();
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  });

  afterAll(() => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner-1' } } } });
  });

  it('goes through claim_badge instead of inserting from the client session', async () => {
    supabase.rpc.mockResolvedValue({ data: { ok: true, awarded: true }, error: null });
    const result = await checkAndAwardBadges('user-1', { total_scores_submitted: 1 });
    expect(supabase.rpc).toHaveBeenCalledWith('claim_badge', { p_badge_key: 'first_score' });
    expect(result).toContain('first_score');
  });

  it('does not report a badge the server refused', async () => {
    supabase.rpc.mockResolvedValue({
      data: { ok: false, awarded: false, reason: 'condition_non_remplie' }, error: null,
    });
    const result = await checkAndAwardBadges('user-1', { total_scores_submitted: 1 });
    expect(result).not.toContain('first_score');
  });

  it('does not report a badge on RPC error', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const result = await checkAndAwardBadges('user-1', { total_scores_submitted: 1 });
    expect(result).not.toContain('first_score');
  });
});

// ── getBadgesCatalog / getEarnedBadges ────────────────────────────────────────

describe('getBadgesCatalog', () => {
  const { supabase } = require('../lib/supabase');

  beforeEach(() => jest.clearAllMocks());

  it('returns badges from Supabase', async () => {
    const mockBadges = [
      { badge_key: 'first_score', title: 'First Score', icon: '🏅', description: '', category: 'training', sort_order: 1 },
    ];
    supabase.from.mockImplementation(() =>
      makeChain({ order: jest.fn().mockResolvedValue({ data: mockBadges }) }),
    );
    const result = await getBadgesCatalog();
    expect(result).toEqual(mockBadges);
  });

  it('returns empty array when Supabase returns null', async () => {
    supabase.from.mockImplementation(() =>
      makeChain({ order: jest.fn().mockResolvedValue({ data: null }) }),
    );
    const result = await getBadgesCatalog();
    expect(result).toEqual([]);
  });
});

describe('getEarnedBadges', () => {
  const { supabase } = require('../lib/supabase');

  beforeEach(() => jest.clearAllMocks());

  it('returns earned badges for a user', async () => {
    const mockEarned = [{ badge_key: 'first_score', achieved_at: '2026-01-01T00:00:00Z' }];
    supabase.from.mockImplementation(() =>
      makeChain({ eq: jest.fn().mockResolvedValue({ data: mockEarned }) }),
    );
    const result = await getEarnedBadges('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].badge_key).toBe('first_score');
  });

  it('returns empty array when user has no badges', async () => {
    supabase.from.mockImplementation(() =>
      makeChain({ eq: jest.fn().mockResolvedValue({ data: null }) }),
    );
    const result = await getEarnedBadges('user-1');
    expect(result).toEqual([]);
  });
});
