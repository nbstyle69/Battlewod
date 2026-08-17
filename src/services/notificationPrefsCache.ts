import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Préférences de notification : type, défauts et cache local ───────
// Module volontairement sans dépendance native (ni expo-notifications ni
// expo-device) : `gamification` et les tests doivent pouvoir consulter une
// préférence sans embarquer tout le module de notifications.
//
// Une notification LOCALE ne passe par aucun serveur : le filtre doit donc
// vivre dans l'app. Il est placé DANS les fonctions de programmation plutôt que
// chez leurs appelants, pour que tout appel — présent ou futur — en hérite
// mécaniquement : c'est l'oubli d'un appelant (`AuthContext`, qui programmait le
// rappel de 18 h à chaque connexion) qui a produit le bug.
//
// Le cache évite un aller-retour réseau à chaque programmation et fonctionne
// hors ligne. Il est écrit par `getNotificationPrefs` / `saveNotificationPrefs`.

export interface NotificationPrefs {
  notifications_enabled: boolean;
  daily_reminder: boolean;
  reminder_hour: number;
  score_reminder: boolean;
  class_reminders: boolean;
  friend_requests: boolean;
  group_messages: boolean;
  tournament_updates: boolean;
  elo_updates: boolean;
  new_wod: boolean;
  score_updates: boolean;
  score_comments: boolean;
  score_reactions: boolean;
  box_announcements: boolean;
  badge_unlocks: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  notifications_enabled: true,
  daily_reminder: true,
  reminder_hour: 9,
  score_reminder: true,
  class_reminders: true,
  friend_requests: true,
  group_messages: true,
  tournament_updates: true,
  elo_updates: true,
  new_wod: true,
  score_updates: true,
  score_comments: true,
  score_reactions: true,
  box_announcements: true,
  badge_unlocks: true,
};

const PREFS_CACHE_KEY = '@athlex:notification_prefs';
let prefsCache: NotificationPrefs | null = null;

export async function readCachedPrefs(): Promise<NotificationPrefs | null> {
  if (prefsCache) return prefsCache;
  try {
    const raw = await AsyncStorage.getItem(PREFS_CACHE_KEY);
    if (raw) prefsCache = JSON.parse(raw) as NotificationPrefs;
  } catch { /* cache illisible : on retombe sur le défaut */ }
  return prefsCache;
}

export async function writeCachedPrefs(prefs: NotificationPrefs) {
  prefsCache = prefs;
  try {
    await AsyncStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(prefs));
  } catch { /* écriture de cache non critique */ }
}

export async function clearCachedPrefs() {
  prefsCache = null;
  try { await AsyncStorage.removeItem(PREFS_CACHE_KEY); } catch { /* rien */ }
}

export type LocalPrefKey =
  | 'daily_reminder' | 'score_reminder' | 'class_reminders'
  | 'tournament_updates' | 'badge_unlocks';

/**
 * Cette famille de notification locale est-elle autorisée ?
 * Défaut `true` quand rien n'est connu — aligne l'app sur le défaut du serveur
 * (utilisateur sans ligne de préférence = tout activé). L'interrupteur maître
 * l'emporte sur la clé de famille.
 */
export async function isLocalCategoryEnabled(key: LocalPrefKey): Promise<boolean> {
  const prefs = await readCachedPrefs();
  if (!prefs) return true;
  if (prefs.notifications_enabled === false) return false;
  return prefs[key] !== false;
}
