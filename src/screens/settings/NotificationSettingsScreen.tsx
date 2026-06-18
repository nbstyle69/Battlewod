import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Alert,
} from 'react-native';
import { ArrowLeft, Bell, Clock, Users, Trophy, Zap, MessageCircle, Heart } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import {
  NotificationPrefs,
  getNotificationPrefs,
  saveNotificationPrefs,
  registerForPushNotifications,
  savePushToken,
} from '../../services/notifications';
import GlassBackground from '../../components/glass/GlassBackground';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function NotificationSettingsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [prefs, setPrefs] = useState<NotificationPrefs>({
    daily_reminder: true,
    reminder_hour: 9,
    friend_requests: true,
    tournament_updates: true,
    score_updates: true,
    score_comments: true,
    score_reactions: true,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    getNotificationPrefs(user.id).then(p => {
      setPrefs(p);
      setLoaded(true);
    });
  }, [user]);

  async function update(key: keyof NotificationPrefs, value: boolean | number) {
    if (!user) return;
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    await saveNotificationPrefs(user.id, { [key]: value });
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

  return (
    <View style={S.screen}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Notifications</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={S.content}>
        {/* Daily reminder */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Rappel quotidien</Text>
          <View style={S.row}>
            <View style={S.rowLeft}>
              <Bell color={theme.accent} size={18} />
              <View>
                <Text style={S.rowLabel}>Rappel d'entraînement</Text>
                <Text style={S.rowSub}>Notification chaque jour pour t'entraîner</Text>
              </View>
            </View>
            <Switch
              value={prefs.daily_reminder}
              onValueChange={v => update('daily_reminder', v)}
              trackColor={{ false: theme.border, true: `${theme.accent}60` }}
              thumbColor={prefs.daily_reminder ? theme.accent : theme.textMuted}
            />
          </View>

          {prefs.daily_reminder && (
            <View style={S.hourSection}>
              <View style={S.rowLeft}>
                <Clock color={theme.textMuted} size={16} />
                <Text style={S.rowLabel}>Heure du rappel</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.hourScroll}>
                {HOURS.map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[S.hourChip, prefs.reminder_hour === h && S.hourChipSel]}
                    onPress={() => update('reminder_hour', h)}
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

        {/* Push categories */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Catégories</Text>

          <View style={S.row}>
            <View style={S.rowLeft}>
              <Users color="#8B5CF6" size={18} />
              <View>
                <Text style={S.rowLabel}>Demandes d'amis</Text>
                <Text style={S.rowSub}>Quand quelqu'un t'envoie une demande</Text>
              </View>
            </View>
            <Switch
              value={prefs.friend_requests}
              onValueChange={v => update('friend_requests', v)}
              trackColor={{ false: theme.border, true: '#8B5CF660' }}
              thumbColor={prefs.friend_requests ? '#8B5CF6' : theme.textMuted}
            />
          </View>

          <View style={S.row}>
            <View style={S.rowLeft}>
              <Trophy color={theme.gold} size={18} />
              <View>
                <Text style={S.rowLabel}>Tournois</Text>
                <Text style={S.rowSub}>Mises à jour, résultats, nouveaux WODs</Text>
              </View>
            </View>
            <Switch
              value={prefs.tournament_updates}
              onValueChange={v => update('tournament_updates', v)}
              trackColor={{ false: theme.border, true: `${theme.gold}60` }}
              thumbColor={prefs.tournament_updates ? theme.gold : theme.textMuted}
            />
          </View>

          <View style={S.row}>
            <View style={S.rowLeft}>
              <Zap color="#EF4444" size={18} />
              <View>
                <Text style={S.rowLabel}>Scores</Text>
                <Text style={S.rowSub}>Quand un score est validé ou battu</Text>
              </View>
            </View>
            <Switch
              value={prefs.score_updates}
              onValueChange={v => update('score_updates', v)}
              trackColor={{ false: theme.border, true: '#EF444460' }}
              thumbColor={prefs.score_updates ? '#EF4444' : theme.textMuted}
            />
          </View>

          <View style={S.row}>
            <View style={S.rowLeft}>
              <MessageCircle color="#3B82F6" size={18} />
              <View>
                <Text style={S.rowLabel}>Commentaires</Text>
                <Text style={S.rowSub}>Quand quelqu'un commente ton score</Text>
              </View>
            </View>
            <Switch
              value={prefs.score_comments}
              onValueChange={v => update('score_comments', v)}
              trackColor={{ false: theme.border, true: '#3B82F660' }}
              thumbColor={prefs.score_comments ? '#3B82F6' : theme.textMuted}
            />
          </View>

          <View style={S.row}>
            <View style={S.rowLeft}>
              <Heart color="#EC4899" size={18} />
              <View>
                <Text style={S.rowLabel}>Likes & réactions</Text>
                <Text style={S.rowSub}>Quand quelqu'un réagit à ton score</Text>
              </View>
            </View>
            <Switch
              value={prefs.score_reactions}
              onValueChange={v => update('score_reactions', v)}
              trackColor={{ false: theme.border, true: '#EC489960' }}
              thumbColor={prefs.score_reactions ? '#EC4899' : theme.textMuted}
            />
          </View>
        </View>

        {/* Test button */}
        <TouchableOpacity style={S.testBtn} onPress={testPush} activeOpacity={0.8}>
          <Bell color="#fff" size={16} />
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
  rowSub: { fontSize: 11, color: t.textMuted, marginTop: 1 },
  hourSection: { gap: 8 },
  hourScroll: { marginTop: 4 },
  hourChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface,
    marginRight: 6,
  },
  hourChipSel: { backgroundColor: `${t.accent}15`, borderColor: t.accent },
  hourTxt: { fontSize: 12, fontWeight: '700', color: t.textMuted },
  hourTxtSel: { color: t.accent, fontWeight: '900' },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: t.accent, borderRadius: 12, padding: 14,
  },
  testBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
}); }
