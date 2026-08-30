import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Alert,
  ActivityIndicator,
} from 'react-native';
import {
  ArrowLeft, Bell, BellOff, Clock, Users, Trophy, Zap, MessageCircle, Heart,
  Dumbbell, CalendarClock, TrendingUp, Megaphone, Award,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { HueName, hue } from '../../theme/hues';
import {
  NotificationPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPrefs,
  saveNotificationPrefs,
  registerForPushNotifications,
  savePushToken,
} from '../../services/notifications';
import GlassBackground from '../../components/glass/GlassBackground';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

type BoolKey = Exclude<keyof NotificationPrefs, 'reminder_hour' | 'notifications_enabled'>;

interface Toggle {
  key: BoolKey;
  label: string;
  sub: string;
  Icon: typeof Bell;
  /** Couleur de catégorie — teinte de domaine, résolue selon le thème. */
  hue: HueName;
}

// Chaque clé de la table `notification_preferences` est exposée ici : une clé
// gouvernée côté serveur mais absente de cet écran serait un réglage que
// l'utilisateur subit sans pouvoir le changer.
const GROUPS: { title: string; toggles: Toggle[] }[] = [
  {
    title: 'Rappels',
    toggles: [
      { key: 'score_reminder', label: 'Rappel de score (18 h)', sub: 'Si tu n\'as pas encore entré ton score du jour', Icon: Clock, hue: 'amber' },
      { key: 'class_reminders', label: 'Rappel de cours', sub: '1 h avant un cours que tu as réservé', Icon: CalendarClock, hue: 'cyan' },
    ],
  },
  {
    title: 'Social',
    toggles: [
      { key: 'friend_requests', label: 'Demandes d\'amis', sub: 'Demandes reçues et acceptées', Icon: Users, hue: 'violet' },
      { key: 'group_messages', label: 'Messages de groupe', sub: 'Nouveaux messages dans tes groupes', Icon: MessageCircle, hue: 'blue' },
      { key: 'score_comments', label: 'Commentaires', sub: 'Quand quelqu\'un commente ton score', Icon: MessageCircle, hue: 'blue' },
      { key: 'score_reactions', label: 'Likes & réactions', sub: 'Quand quelqu\'un réagit à ton score', Icon: Heart, hue: 'pink' },
    ],
  },
  {
    title: 'Entraînement',
    toggles: [
      { key: 'new_wod', label: 'Nouveau WOD', sub: 'Quand ta box publie un WOD', Icon: Dumbbell, hue: 'emerald' },
      { key: 'badge_unlocks', label: 'Badges débloqués', sub: 'Quand tu débloques un badge', Icon: Award, hue: 'orange' },
    ],
  },
  {
    title: 'Compétition',
    toggles: [
      { key: 'tournament_updates', label: 'Tournois', sub: 'Démarrage, ouverture des WOD, rappels, résultats', Icon: Trophy, hue: 'yellow' },
      { key: 'score_updates', label: 'Scores', sub: 'Quand un score est validé ou que tu es dépassé', Icon: Zap, hue: 'red' },
      { key: 'elo_updates', label: 'ELO & inter-box', sub: 'Gains et pertes d\'ELO, résultats inter-box', Icon: TrendingUp, hue: 'indigo' },
    ],
  },
  {
    title: 'Annonces de la box',
    toggles: [
      { key: 'box_announcements', label: 'Annonces', sub: 'Messages envoyés par ta box', Icon: Megaphone, hue: 'teal' },
    ],
  },
];

export default function NotificationSettingsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<keyof NotificationPrefs | null>(null);

  useEffect(() => {
    if (!user) return;
    getNotificationPrefs(user.id).then(p => {
      setPrefs(p);
      setLoaded(true);
    });
  }, [user]);

  // L'affichage ne bouge qu'après l'écriture : pendant l'appel les réglages sont
  // inertes et la ligne en cours porte un indicateur. Un affichage optimiste
  // montrerait un réglage absent de la base tant que la requête n'a pas répondu
  // — sur un échec lent, pendant toute sa durée.
  async function update(key: keyof NotificationPrefs, value: boolean | number) {
    if (!user || saving) return;
    setSaving(key);
    try {
      // saveNotificationPrefs annule aussi les rappels déjà programmés sur
      // l'appareil : l'écran n'a pas à connaître cette mécanique.
      await saveNotificationPrefs(user.id, { [key]: value });
      setPrefs(p => ({ ...p, [key]: value }));
    } catch {
      Alert.alert('Réglage non enregistré', 'Vérifie ta connexion et réessaie.');
    } finally {
      setSaving(null);
    }
  }

  async function testPush() {
    const token = await registerForPushNotifications();
    if (token && user) {
      await savePushToken(user.id, token);
      Alert.alert('✅ Token enregistré', `Token: ${token.slice(0, 30)}…`);
    } else {
      Alert.alert('⚠️ Permission refusée', 'Active les notifications dans les réglages de ton téléphone.');
    }
  }

  if (!loaded) return null;

  const master = prefs.notifications_enabled;

  function renderToggle(t: Toggle) {
    const value = prefs[t.key] && master;
    const tint = hue(theme.mode, t.hue);
    return (
      <View style={S.row} key={t.key}>
        <View style={S.rowLeft}>
          <t.Icon color={master ? tint : theme.textMuted} size={18} />
          <View style={{ flex: 1 }}>
            <Text style={[S.rowLabel, !master && S.rowLabelOff]}>{t.label}</Text>
            <Text style={S.rowSub}>{t.sub}</Text>
          </View>
        </View>
        {saving === t.key ? (
          <ActivityIndicator size="small" color={tint} style={S.pending} />
        ) : (
          <Switch
            value={value}
            disabled={!master || saving !== null}
            onValueChange={v => update(t.key, v)}
            trackColor={{ false: theme.border, true: `${tint}60` }}
            thumbColor={value ? tint : theme.textMuted}
          />
        )}
      </View>
    );
  }

  return (
    <View style={S.screen}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Notifications</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={S.content}>
        {/* Interrupteur maître */}
        <View style={S.section}>
          <View style={S.row}>
            <View style={S.rowLeft}>
              {master ? <Bell color={theme.accent} size={18} /> : <BellOff color={theme.textMuted} size={18} />}
              <View style={{ flex: 1 }}>
                <Text style={S.rowLabel}>Toutes les notifications</Text>
                <Text style={S.rowSub}>
                  {master
                    ? 'Coupe tout d\'un coup, y compris les rappels déjà programmés'
                    : 'Aucune notification ne t\'est envoyée'}
                </Text>
              </View>
            </View>
            {saving === 'notifications_enabled' ? (
              <ActivityIndicator size="small" color={theme.accent} style={S.pending} />
            ) : (
              <Switch
                value={master}
                disabled={saving !== null}
                onValueChange={v => update('notifications_enabled', v)}
                trackColor={{ false: theme.border, true: `${theme.accent}60` }}
                thumbColor={master ? theme.accent : theme.textMuted}
              />
            )}
          </View>
        </View>

        {/* Rappel quotidien + son heure */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Rappel quotidien</Text>
          <View style={S.row}>
            <View style={S.rowLeft}>
              <Bell color={master ? theme.accent : theme.textMuted} size={18} />
              <View style={{ flex: 1 }}>
                <Text style={[S.rowLabel, !master && S.rowLabelOff]}>Rappel d'entraînement</Text>
                <Text style={S.rowSub}>Notification chaque jour pour t'entraîner</Text>
              </View>
            </View>
            {saving === 'daily_reminder' ? (
              <ActivityIndicator size="small" color={theme.accent} style={S.pending} />
            ) : (
              <Switch
                value={prefs.daily_reminder && master}
                disabled={!master || saving !== null}
                onValueChange={v => update('daily_reminder', v)}
                trackColor={{ false: theme.border, true: `${theme.accent}60` }}
                thumbColor={prefs.daily_reminder && master ? theme.accent : theme.textMuted}
              />
            )}
          </View>

          {prefs.daily_reminder && master && (
            <View style={S.hourSection}>
              <View style={S.rowLeft}>
                <Clock color={theme.textMuted} size={16} />
                <Text style={S.rowLabel}>Heure du rappel</Text>
                {saving === 'reminder_hour' && (
                  <ActivityIndicator size="small" color={theme.accent} />
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.hourScroll}>
                {HOURS.map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[
                      S.hourChip,
                      prefs.reminder_hour === h && S.hourChipSel,
                      saving !== null && S.hourChipOff,
                    ]}
                    onPress={() => update('reminder_hour', h)}
                    disabled={saving !== null}
                    activeOpacity={0.7}
                  >
                    <Text style={[S.hourTxt, prefs.reminder_hour === h && S.hourTxtSel]}>
                      {String(h).padStart(2, '0')}:00
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {GROUPS.map(g => (
          <View style={S.section} key={g.title}>
            <Text style={S.sectionTitle}>{g.title}</Text>
            {g.toggles.map(renderToggle)}
          </View>
        ))}

        {/* Test button */}
        <TouchableOpacity style={S.testBtn} onPress={testPush} activeOpacity={0.8}>
          <Bell color={theme.onAccent} size={16} />
          <Text style={S.testBtnTxt}>Tester les notifications</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: t.text },
  content: { padding: 16, gap: 20, paddingBottom: 140 },
  section: {
    backgroundColor: t.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: t.border, gap: 14,
  },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: t.text },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowLabel: { fontSize: 13, fontWeight: '700', color: t.text },
  rowLabelOff: { color: t.textMuted },
  rowSub: { fontSize: 11, color: t.textMuted, marginTop: 1 },
  hourSection: { gap: 8 },
  hourScroll: { marginTop: 4 },
  hourChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface,
    marginRight: 6,
  },
  hourChipSel: { backgroundColor: `${t.accent}15`, borderColor: t.accent },
  hourChipOff: { backgroundColor: t.surfaceAlt, borderStyle: 'dashed' },
  pending: { width: 51, alignItems: 'flex-end' },
  hourTxt: { fontSize: 12, fontWeight: '700', color: t.textMuted },
  hourTxtSel: { color: t.accentText, fontWeight: '900' },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: t.accent, borderRadius: 12, padding: 14,
  },
  testBtnTxt: { color: t.onAccent, fontSize: 14, fontWeight: '900' },
}); }
