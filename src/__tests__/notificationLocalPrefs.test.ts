/**
 * Bug produit : le rappel local « entre ton score » (18 h) sonnait alors que
 * les préférences étaient coupées. Deux causes, deux familles d'assertions ici :
 *
 *   1. aucune clé ne gouvernait le rappel → la garde est DANS chaque
 *      `schedule*`, donc un appelant ne peut plus l'oublier ;
 *   2. la désactivation n'annulait que les PROCHAINES programmations → les
 *      occurrences déjà posées sur l'appareil doivent être supprimées.
 *
 * Les assertions vérifient les appels réels à expo-notifications (ce qui est
 * programmé et ce qui est annulé), pas un booléen interne.
 */

interface ScheduledNotification {
  identifier: string;
  content: { data?: Record<string, unknown> };
}

interface ScheduleRequest {
  content: { data?: Record<string, unknown> };
  trigger: { type: string; date?: Date; hour?: number };
}

const scheduled: ScheduledNotification[] = [];
const requests: ScheduleRequest[] = [];
const cancelled: string[] = [];

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async (req: ScheduleRequest) => {
    requests.push(req);
    const identifier = `n${requests.length}`;
    scheduled.push({ identifier, content: req.content });
    return identifier;
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...scheduled]),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    cancelled.push(id);
    const i = scheduled.findIndex(n => n.identifier === id);
    if (i >= 0) scheduled.splice(i, 1);
  }),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));

jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn(), functions: { invoke: jest.fn() } } }));
jest.mock('../lib/sentry', () => ({ captureError: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  scheduleDailyReminder,
  scheduleScoreReminder,
  scheduleClassReminder,
  scheduleTournamentReminder,
  cancelTodayScoreReminder,
  cancelAllLocalReminders,
} from '../services/notifications';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationPrefs,
  clearCachedPrefs,
  isLocalCategoryEnabled,
} from '../services/notificationPrefsCache';

const CACHE_KEY = '@athlex:notification_prefs';

async function setPrefs(patch: Partial<NotificationPrefs>) {
  await clearCachedPrefs();
  await AsyncStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, ...patch }),
  );
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(async () => {
  scheduled.length = 0;
  requests.length = 0;
  cancelled.length = 0;
  await clearCachedPrefs();
  await AsyncStorage.removeItem(CACHE_KEY);
});

describe('isLocalCategoryEnabled', () => {
  it('autorise quand aucune préférence n\'est connue (défaut du serveur : envoyer)', async () => {
    expect(await isLocalCategoryEnabled('score_reminder')).toBe(true);
  });

  it('refuse quand la clé de famille est explicitement false', async () => {
    await setPrefs({ score_reminder: false });
    expect(await isLocalCategoryEnabled('score_reminder')).toBe(false);
    // et n'affecte que sa famille
    expect(await isLocalCategoryEnabled('daily_reminder')).toBe(true);
  });

  it('refuse toutes les familles quand l\'interrupteur maître est coupé', async () => {
    await setPrefs({ notifications_enabled: false });
    for (const key of ['daily_reminder', 'score_reminder', 'class_reminders', 'tournament_updates', 'badge_unlocks'] as const) {
      expect(await isLocalCategoryEnabled(key)).toBe(false);
    }
  });
});

describe('programmation gouvernée par la préférence', () => {
  it('ne programme AUCUN rappel de score quand score_reminder est false', async () => {
    await setPrefs({ score_reminder: false });
    await scheduleScoreReminder();
    expect(requests).toHaveLength(0);
  });

  it('programme le rappel de score de 18 h quand la clé est active', async () => {
    await setPrefs({ score_reminder: true });
    await scheduleScoreReminder();
    expect(requests).toHaveLength(1);
    expect(requests[0].trigger).toMatchObject({ type: 'daily', hour: 18 });
  });

  it('ne repose pas le rappel de demain après une soumission si la clé est coupée', async () => {
    await setPrefs({ score_reminder: false });
    scheduled.push({ identifier: 'old', content: { data: { type: 'score_reminder' } } });

    await cancelTodayScoreReminder();

    expect(cancelled).toContain('old');
    expect(requests).toHaveLength(0);
  });

  it('ne programme ni rappel quotidien, ni cours, ni tournoi quand leurs clés sont coupées', async () => {
    await setPrefs({ daily_reminder: false, class_reminders: false, tournament_updates: false });

    await scheduleDailyReminder(9);
    await scheduleClassReminder('sched-1', 'Cours A', futureDate(2), '18:00');
    await scheduleTournamentReminder('t-1', 'Open', new Date(Date.now() + 5 * 86400_000).toISOString());

    expect(requests).toHaveLength(0);
  });

  it('coupe tout d\'un coup avec l\'interrupteur maître', async () => {
    await setPrefs({ notifications_enabled: false });

    await scheduleDailyReminder(9);
    await scheduleScoreReminder();
    await scheduleClassReminder('sched-1', 'Cours A', futureDate(2), '18:00');

    expect(requests).toHaveLength(0);
  });
});

describe('annulation des occurrences déjà programmées', () => {
  it('supprime les rappels locaux déjà posés sans toucher aux bips du minuteur', async () => {
    scheduled.push(
      { identifier: 'daily', content: { data: { type: 'daily_reminder' } } },
      { identifier: 'score', content: { data: { type: 'score_reminder' } } },
      { identifier: 'class', content: { data: { type: 'class_reminder', scheduleId: 's1' } } },
      { identifier: 'tour', content: { data: { type: 'tournament_reminder', tournamentId: 't1' } } },
      { identifier: 'beep', content: { data: { timerBeep: true } } },
    );

    await cancelAllLocalReminders();

    expect(cancelled.sort()).toEqual(['class', 'daily', 'score', 'tour']);
    expect(scheduled.map(n => n.identifier)).toEqual(['beep']);
  });
});
