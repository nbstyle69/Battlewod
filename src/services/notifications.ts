import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// ── Config par défaut ────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Canal Android ────────────────────────────────────────────────────
export async function setupAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'AthleX',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10B981',
      sound: 'default',
    });
  }
}

// ── Demande de permission + récupération du token ────────────────────
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications need a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  await setupAndroidChannel();

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: projectId ?? undefined,
  });

  return tokenData.data;
}

// ── Sauvegarder le token dans Supabase ───────────────────────────────
export async function savePushToken(userId: string, token: string) {
  const platform = Platform.OS;
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    );
  if (error) console.error('Error saving push token:', error.message);
}

// ── Supprimer le token (logout) ──────────────────────────────────────
export async function removePushToken(userId: string) {
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId ?? undefined,
  }).catch(() => null);

  if (tokenData?.data) {
    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', tokenData.data);
  }
}

// ── Notifications locales (rappels) ──────────────────────────────────
export async function scheduleDailyReminder(hour: number = 9) {
  // Annule les rappels existants
  await cancelDailyReminder();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '💪 C\'est l\'heure !',
      body: 'Génère ton WOD du jour et dépasse-toi !',
      sound: 'default',
      data: { type: 'daily_reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
    },
  });
}

export async function cancelDailyReminder() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === 'daily_reminder') {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

// ── Charger/sauvegarder les préférences ──────────────────────────────
export interface NotificationPrefs {
  daily_reminder: boolean;
  reminder_hour: number;
  friend_requests: boolean;
  tournament_updates: boolean;
  score_updates: boolean;
  score_comments: boolean;
  score_reactions: boolean;
}

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  return data ?? {
    daily_reminder: true,
    reminder_hour: 9,
    friend_requests: true,
    tournament_updates: true,
    score_updates: true,
    score_comments: true,
    score_reactions: true,
  };
}

export async function saveNotificationPrefs(userId: string, prefs: Partial<NotificationPrefs>) {
  await supabase
    .from('notification_preferences')
    .upsert(
      { user_id: userId, ...prefs, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  // Sync local schedule
  if (prefs.daily_reminder === false) {
    await cancelDailyReminder();
  } else if (prefs.daily_reminder === true || prefs.reminder_hour !== undefined) {
    const full = await getNotificationPrefs(userId);
    if (full.daily_reminder) {
      await scheduleDailyReminder(full.reminder_hour);
    }
  }
}

// ── Envoyer une push notification pour commentaire/réaction sur un score ──
export async function sendScoreNotification(
  targetUserId: string,
  senderUsername: string,
  type: 'comment' | 'reaction',
  emoji?: string,
) {
  // Check if the target user has this notification type enabled
  const prefs = await getNotificationPrefs(targetUserId);
  if (type === 'comment' && !prefs.score_comments) return;
  if (type === 'reaction' && !prefs.score_reactions) return;

  // Get target user's push tokens
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', targetUserId);

  if (!tokens || tokens.length === 0) return;

  const title = type === 'comment'
    ? `💬 ${senderUsername} a commenté ton score`
    : `${emoji ?? '❤️'} ${senderUsername} a réagi à ton score`;

  const body = type === 'comment'
    ? 'Va voir ce qu\'il a dit !'
    : `Réaction ${emoji ?? '❤️'}`;

  // Send via Expo Push API
  const messages = tokens.map(t => ({
    to: t.token,
    sound: 'default' as const,
    title,
    body,
    data: { type: `score_${type}`, targetUserId },
  }));

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error('Error sending score notification:', err);
  }
}
