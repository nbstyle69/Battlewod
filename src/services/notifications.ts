import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { captureError } from '../lib/sentry';

// ── Config par défaut ────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Beeps du minuteur : en PREMIER PLAN, les bips in-app (expo-av) gèrent le son.
    // On rend la notif silencieuse + sans bannière pour éviter le double-bip et le
    // spam de bannières pendant le chrono. En ARRIÈRE-PLAN, ce handler n'est pas
    // consulté : le système joue le son de la notif (fallback quand le JS est gelé).
    if (notification.request?.content?.data?.timerBeep === true) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
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
    // Push notifications need a physical device
    return null;
  }

  const perms = await Notifications.getPermissionsAsync() as any;
  let finalStatus = perms.status;

  if (finalStatus !== 'granted') {
    const req = await Notifications.requestPermissionsAsync() as any;
    finalStatus = req.status;
  }

  if (finalStatus !== 'granted') {
    // Push notification permission not granted
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
  if (error) captureError(error, { service: 'notifications', action: 'savePushToken' });
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

  const defaults: NotificationPrefs = {
    daily_reminder: true,
    reminder_hour: 9,
    friend_requests: true,
    tournament_updates: true,
    score_updates: true,
    score_comments: true,
    score_reactions: true,
  };
  if (!data) return defaults;
  return {
    daily_reminder: data.daily_reminder ?? defaults.daily_reminder,
    reminder_hour: data.reminder_hour ?? defaults.reminder_hour,
    friend_requests: data.friend_requests ?? defaults.friend_requests,
    tournament_updates: data.tournament_updates ?? defaults.tournament_updates,
    score_updates: data.score_updates ?? defaults.score_updates,
    score_comments: data.score_comments ?? defaults.score_comments,
    score_reactions: data.score_reactions ?? defaults.score_reactions,
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

// ── Helper: fan-out des push via la fonction service-role send-push ──
// push_tokens et notification_preferences sont RLS-lockés par utilisateur,
// donc le client ne peut ni lire les tokens ni les prefs d'un AUTRE user.
// Tout envoi cross-utilisateur passe par l'Edge Function send-push.
interface PushRecipient {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

async function invokePush(recipients: PushRecipient[], prefKey?: string) {
  if (!recipients.length) return;
  try {
    await supabase.functions.invoke('send-push', {
      body: { recipients, ...(prefKey ? { pref_key: prefKey } : {}) },
    });
  } catch (err) {
    captureError(err, { service: 'notifications', action: 'invokePush' });
  }
}

// ── Envoyer une push notification pour commentaire/réaction sur un score ──
export async function sendScoreNotification(
  targetUserId: string,
  senderUsername: string,
  type: 'comment' | 'reaction',
  emoji?: string,
) {
  const title = type === 'comment'
    ? `💬 ${senderUsername} a commenté ton score`
    : `${emoji ?? '❤️'} ${senderUsername} a réagi à ton score`;

  const body = type === 'comment'
    ? 'Va voir ce qu\'il a dit !'
    : `Réaction ${emoji ?? '❤️'}`;

  await invokePush(
    [{ user_id: targetUserId, title, body, data: { type: `score_${type}`, targetUserId } }],
    type === 'comment' ? 'score_comments' : 'score_reactions',
  );
}

// ── #1 WOD publié → notifier les membres de la box ─────────────────
export async function sendWodPublishedNotification(
  boxId: string,
  wodTitle: string,
  senderUserId: string,
) {
  // Get all active box members except the sender
  const { data: members } = await supabase
    .from('box_members')
    .select('member_id')
    .eq('box_id', boxId)
    .eq('status', 'active')
    .neq('member_id', senderUserId);
  if (!members || members.length === 0) return;

  const memberIds = members.map(m => m.member_id).filter((id): id is string => id != null);

  await invokePush(
    memberIds.map(uid => ({
      user_id: uid,
      title: '💪 Nouveau WOD !',
      body: `${wodTitle} — C'est parti !`,
      data: { type: 'wod_published', boxId },
    })),
  );
}

// ── #2 Demande d'ami envoyée ────────────────────────────────────────
export async function sendFriendRequestNotification(
  targetUserId: string,
  senderUsername: string,
) {
  await invokePush(
    [{
      user_id: targetUserId,
      title: '👋 Demande d\'ami',
      body: `${senderUsername} veut t'ajouter en ami !`,
      data: { type: 'friend_request', senderUsername },
    }],
    'friend_requests',
  );
}

// ── #3 Demande d'ami acceptée ───────────────────────────────────────
export async function sendFriendAcceptedNotification(
  targetUserId: string,
  accepterUsername: string,
) {
  await invokePush(
    [{
      user_id: targetUserId,
      title: '✅ Ami ajouté',
      body: `${accepterUsername} a accepté ta demande d'ami !`,
      data: { type: 'friend_accepted', accepterUsername },
    }],
    'friend_requests',
  );
}

// ── #4 Tournoi clôturé → notifier les participants ──────────────────
export async function sendTournamentClosedNotification(
  tournamentId: string,
  tournamentName: string,
  eloChanges: { athleteId: string; change: number }[],
) {
  if (eloChanges.length === 0) return;

  await invokePush(
    eloChanges.map(ec => {
      const sign = ec.change >= 0 ? '+' : '';
      return {
        user_id: ec.athleteId,
        title: `🏆 ${tournamentName} terminé !`,
        body: `Ton ELO : ${sign}${ec.change} points`,
        data: { type: 'tournament_closed', tournamentId },
      };
    }),
    'tournament_updates',
  );
}

// ── #5 Nouveau message dans un groupe ───────────────────────────────
export async function sendNewMessageNotification(
  groupId: string,
  groupName: string,
  senderUserId: string,
  senderUsername: string,
  messagePreview: string,
) {
  // Get group members
  const { data: group } = await supabase
    .from('message_groups')
    .select('members')
    .eq('id', groupId)
    .single();
  if (!group?.members || group.members.length === 0) return;

  // Exclude sender
  const recipientIds = (group.members as string[]).filter(id => id !== senderUserId);
  if (recipientIds.length === 0) return;

  const preview = messagePreview.length > 60
    ? messagePreview.substring(0, 57) + '…'
    : messagePreview;

  await invokePush(
    recipientIds.map(uid => ({
      user_id: uid,
      title: `💬 ${senderUsername} dans ${groupName}`,
      body: preview,
      data: { type: 'new_message', groupId },
    })),
  );
}

// ── #6 Score dépassé → "X t'a dépassé !" ────────────────────────────
export async function sendScoreOvertakenNotification(
  overtakenUserIds: string[],
  senderUsername: string,
  wodTitle: string,
) {
  if (overtakenUserIds.length === 0) return;

  await invokePush(
    overtakenUserIds.map(uid => ({
      user_id: uid,
      title: '📊 Tu as été dépassé !',
      body: `${senderUsername} t'a dépassé sur "${wodTitle}"`,
      data: { type: 'score_overtaken' },
    })),
    'score_updates',
  );
}

// ── #7 Rappel tournoi J-1 (notification locale planifiée) ───────────
export async function scheduleTournamentReminder(
  tournamentId: string,
  tournamentName: string,
  startDate: string,
) {
  const start = new Date(startDate);
  const reminderDate = new Date(start.getTime() - 24 * 60 * 60 * 1000); // J-1
  const now = new Date();
  if (reminderDate <= now) return; // already past

  // Cancel existing reminder for this tournament
  await cancelTournamentReminder(tournamentId);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🏆 Tournoi demain !',
      body: `"${tournamentName}" commence demain — prépare-toi !`,
      sound: 'default',
      data: { type: 'tournament_reminder', tournamentId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderDate,
    },
  });
}

export async function cancelTournamentReminder(tournamentId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === 'tournament_reminder' && notif.content.data?.tournamentId === tournamentId) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

// ── #8 Rappel 18h "Tu n'as pas soumis ton score" ────────────────────
export async function scheduleScoreReminder() {
  await cancelScoreReminder();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '💪 WOD du jour',
      body: 'Tu n\'as pas encore soumis ton score aujourd\'hui !',
      sound: 'default',
      data: { type: 'score_reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 18,
      minute: 0,
    },
  });
}

export async function cancelScoreReminder() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === 'score_reminder') {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

// Cancel today's score reminder (called after submitting a score)
export async function cancelTodayScoreReminder() {
  await cancelScoreReminder();
  // 4.10 : re-programmer un déclencheur DAILY sonne encore aujourd'hui 18h,
  // donc le rappel tombait alors que le score venait d'être soumis. On pose une
  // occurrence unique demain ; le rappel quotidien est ré-armé au démarrage
  // suivant (AuthContext).
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '💪 WOD du jour',
      body: 'Tu n\'as pas encore soumis ton score aujourd\'hui !',
      sound: 'default',
      data: { type: 'score_reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: tomorrow,
    },
  });
}

// ── 4.10 Rappel de cours réservé (1 h avant) ─────────────────────────
const CLASS_REMINDER_LEAD_MIN = 60;

/** Date locale d'un créneau : `YYYY-MM-DD` + `HH:MM[:SS]`, sans passer par UTC. */
export function classStartDate(scheduledDate: string, startTime: string): Date {
  const [y, m, d] = scheduledDate.split('-').map(Number);
  const [hh, mm] = startTime.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm ?? 0, 0, 0);
}

export async function scheduleClassReminder(
  scheduleId: string,
  className: string,
  scheduledDate: string,
  startTime: string,
) {
  await cancelClassReminder(scheduleId);

  const remindAt = new Date(
    classStartDate(scheduledDate, startTime).getTime() - CLASS_REMINDER_LEAD_MIN * 60 * 1000,
  );
  if (remindAt <= new Date()) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⏰ Ton cours approche',
      body: `"${className}" commence dans ${CLASS_REMINDER_LEAD_MIN} minutes.`,
      sound: 'default',
      data: { type: 'class_reminder', scheduleId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: remindAt,
    },
  });
}

export async function cancelClassReminder(scheduleId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === 'class_reminder' && notif.content.data?.scheduleId === scheduleId) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// INTER-BOX COMPETITION NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════

// ── #9 Nouveau WOD révélé dans une competition inter-box ─────────────
export async function sendInterWodRevealedNotification(
  competitionId: string,
  competitionTitle: string,
  wodTitle: string,
) {
  const { data: registrations } = await supabase
    .from('inter_registrations')
    .select('athlete_id')
    .eq('competition_id', competitionId)
    .eq('status', 'active');
  if (!registrations || registrations.length === 0) return;

  const athleteIds = registrations.map((r: any) => r.athlete_id).filter(Boolean);
  await invokePush(
    athleteIds.map((uid: string) => ({
      user_id: uid,
      title: `🏆 ${competitionTitle}`,
      body: `Nouveau WOD revele : ${wodTitle}`,
      data: { type: 'inter_wod_revealed', competitionId },
    })),
  );
}

// ── #10 Match de bracket assigné (ton prochain adversaire) ───────────
export async function sendInterBracketMatchNotification(
  athleteId: string,
  competitionTitle: string,
  opponentName: string,
  round: number,
) {
  await invokePush([
    {
      user_id: athleteId,
      title: `⚔️ ${competitionTitle}`,
      body: `Round ${round} : tu affrontes ${opponentName} !`,
      data: { type: 'inter_bracket_match', competitionTitle, round },
    },
  ]);
}

// ── #11 Résultat de match bracket (tu as gagné/perdu) ────────────────
export async function sendInterBracketResultNotification(
  athleteId: string,
  competitionTitle: string,
  won: boolean,
  round: number,
) {
  await invokePush([
    {
      user_id: athleteId,
      title: won ? `🎉 Victoire !` : `😤 Defaite`,
      body: won
        ? `Tu avances au round ${round + 1} de ${competitionTitle} !`
        : `Tu es elimine au round ${round} de ${competitionTitle}.`,
      data: { type: 'inter_bracket_result', competitionTitle, won, round },
    },
  ]);
}

// ── #12 Competition inter-box clôturée (ELO distribué) ───────────────
export async function sendInterCompetitionClosedNotification(
  competitionId: string,
  competitionTitle: string,
  eloChanges: { athleteId: string; delta: number }[],
) {
  if (eloChanges.length === 0) return;

  await invokePush(
    eloChanges.map((change) => {
      const sign = change.delta >= 0 ? '+' : '';
      return {
        user_id: change.athleteId,
        title: `🏆 ${competitionTitle} terminee`,
        body: `Ton ELO : ${sign}${change.delta} points`,
        data: { type: 'inter_competition_closed', competitionId, delta: change.delta },
      };
    }),
  );
}

// ── #13 Pool match assigné ───────────────────────────────────────────
export async function sendInterPoolMatchNotification(
  athleteId: string,
  competitionTitle: string,
  opponentName: string,
  groupName: string,
) {
  await invokePush([
    {
      user_id: athleteId,
      title: `⚔️ ${competitionTitle}`,
      body: `${groupName} : tu affrontes ${opponentName}`,
      data: { type: 'inter_pool_match', competitionTitle, groupName },
    },
  ]);
}
