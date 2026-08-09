/**
 * 4.10 — rappels locaux de cours : programmés à la réservation, annulés à la
 * désinscription. Et `cancelTodayScoreReminder` ne doit plus reposer un
 * déclencheur QUOTIDIEN (qui sonnait encore le jour même).
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
  getAllScheduledNotificationsAsync: jest.fn(async () => scheduled),
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

import {
  scheduleClassReminder,
  cancelClassReminder,
  cancelTodayScoreReminder,
  classStartDate,
} from '../services/notifications';

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  scheduled.length = 0;
  requests.length = 0;
  cancelled.length = 0;
});

describe('classStartDate', () => {
  it('construit une date LOCALE (pas de décalage UTC)', () => {
    const d = classStartDate('2026-03-15', '18:30');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(18);
    expect(d.getMinutes()).toBe(30);
  });
});

describe('rappel de cours', () => {
  it('programme un rappel 1 h avant le cours réservé', async () => {
    const date = futureDate(2);
    await scheduleClassReminder('sched-1', 'WOD du soir', date, '18:00');

    expect(requests).toHaveLength(1);
    expect(requests[0].content.data).toEqual({ type: 'class_reminder', scheduleId: 'sched-1' });
    expect(requests[0].trigger.date).toEqual(
      new Date(classStartDate(date, '18:00').getTime() - 60 * 60 * 1000),
    );
  });

  it('ne programme rien pour un créneau déjà passé', async () => {
    await scheduleClassReminder('sched-old', 'WOD passé', futureDate(-1), '18:00');
    expect(requests).toHaveLength(0);
  });

  it('annule le rappel du créneau à la désinscription, sans toucher aux autres', async () => {
    const date = futureDate(2);
    await scheduleClassReminder('sched-1', 'Cours A', date, '18:00');
    await scheduleClassReminder('sched-2', 'Cours B', date, '19:00');

    await cancelClassReminder('sched-1');

    expect(scheduled.map(n => n.content.data?.scheduleId)).toEqual(['sched-2']);
  });
});

describe('cancelTodayScoreReminder', () => {
  it('supprime le rappel du jour et repose une occurrence unique demain', async () => {
    scheduled.push({ identifier: 'daily-1', content: { data: { type: 'score_reminder' } } });

    await cancelTodayScoreReminder();

    expect(cancelled).toContain('daily-1');
    expect(requests).toHaveLength(1);
    expect(requests[0].trigger.type).toBe('date');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    expect(requests[0].trigger.date).toEqual(tomorrow);
  });
});
