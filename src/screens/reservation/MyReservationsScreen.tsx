import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { ChevronLeft, Calendar, Clock, Check, Timer, X as XIcon } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import GlassBackground from '../../components/glass/GlassBackground';

interface ReservationRow {
  id: string;
  schedule_id: string;
  status: 'confirmed' | 'waiting';
  created_at: string;
  schedule: {
    title: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    coach: string | null;
  } | null;
}

const CANCEL_CUTOFF_MIN = 20;

function minutesUntilSlot(scheduled_date: string, start_time: string): number {
  const slotTime = new Date(`${scheduled_date}T${start_time}:00`);
  return (slotTime.getTime() - Date.now()) / 60_000;
}

export default function MyReservationsScreen() {
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const S = createStyles(theme);

  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const todayISO = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!user || !currentBox) { setLoading(false); return; }

    const { data } = await supabase
      .from('class_reservations')
      .select('id, schedule_id, status, created_at, schedule:class_schedules(title, scheduled_date, start_time, end_time, coach)')
      .eq('member_id', user.id)
      .eq('box_id', currentBox.id)
      .order('created_at', { ascending: false });

    setReservations((data ?? []).map((r: any) => ({
      ...r,
      schedule: Array.isArray(r.schedule) ? r.schedule[0] ?? null : r.schedule,
    })));
    setLoading(false);
    setRefreshing(false);
  }, [user, currentBox]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Sort by slot datetime (scheduled_date + start_time)
  function slotKey(r: ReservationRow) {
    if (!r.schedule) return '';
    return `${r.schedule.scheduled_date}T${r.schedule.start_time}`;
  }
  const upcoming = reservations
    .filter(r => r.schedule && r.schedule.scheduled_date >= todayISO)
    .sort((a, b) => slotKey(a).localeCompare(slotKey(b))); // soonest first
  const past = reservations
    .filter(r => r.schedule && r.schedule.scheduled_date < todayISO)
    .sort((a, b) => slotKey(b).localeCompare(slotKey(a))); // most recent first
  const displayed = tab === 'upcoming' ? upcoming : past;

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    const locale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={S.back}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <View>
          <Text style={S.headerTitle}>{t('myReservations.title')}</Text>
          <Text style={S.headerSub}>{t('myReservations.summary', { upcoming: upcoming.length, past: past.length })}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={S.tabs}>
        <TouchableOpacity
          style={[S.tab, tab === 'upcoming' && S.tabActive]}
          onPress={() => setTab('upcoming')}
        >
          <Text style={[S.tabText, tab === 'upcoming' && S.tabTextActive]}>
            {t('myReservations.tabUpcoming', { count: upcoming.length })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.tab, tab === 'past' && S.tabActive]}
          onPress={() => setTab('past')}
        >
          <Text style={[S.tabText, tab === 'past' && S.tabTextActive]}>
            {t('myReservations.tabPast', { count: past.length })}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color={theme.accent} />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 140 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />
          }
          ListEmptyComponent={
            <View style={S.empty}>
              <Calendar color={theme.textMuted} size={40} strokeWidth={1.5} />
              <Text style={S.emptyTitle}>
                {tab === 'upcoming' ? t('myReservations.emptyUpcomingTitle') : t('myReservations.emptyPastTitle')}
              </Text>
              <Text style={S.emptySub}>
                {tab === 'upcoming' ? t('myReservations.emptyUpcomingSub') : t('myReservations.emptyPastSub')}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const s = item.schedule;
            if (!s) return null;
            const isPast = s.scheduled_date < todayISO;
            const isConfirmed = item.status === 'confirmed';

            return (
              <View style={[S.card, isPast && S.cardPast]}>
                <View style={[S.statusDot, { backgroundColor: isConfirmed ? theme.accent : '#f59e0b' }]} />
                <View style={S.cardBody}>
                  <View style={S.cardTop}>
                    <Text style={S.cardTitle}>{s.title}</Text>
                    <View style={[S.statusBadge, isConfirmed ? S.statusConfirmed : S.statusWaiting]}>
                      {isConfirmed ? <Check color="#C9A227" size={11} /> : <Timer color="#f59e0b" size={11} />}
                      <Text style={[S.statusText, isConfirmed ? { color: '#C9A227' } : { color: '#f59e0b' }]}>
                        {isConfirmed ? t('myReservations.confirmed') : t('myReservations.waiting')}
                      </Text>
                    </View>
                  </View>
                  <View style={S.cardDetails}>
                    <View style={S.detailRow}>
                      <Calendar color={theme.textMuted} size={12} />
                      <Text style={S.detailText}>{formatDate(s.scheduled_date)}</Text>
                    </View>
                    <View style={S.detailRow}>
                      <Clock color={theme.textMuted} size={12} />
                      <Text style={S.detailText}>{s.start_time} – {s.end_time}</Text>
                    </View>
                  </View>
                  {s.coach && <Text style={S.coach}>{t('myReservations.coach', { name: s.coach })}</Text>}
                  {!isPast && minutesUntilSlot(s.scheduled_date, s.start_time) >= CANCEL_CUTOFF_MIN && (
                    <TouchableOpacity
                      style={S.cancelBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        const minsLeft = minutesUntilSlot(s.scheduled_date, s.start_time);
                        if (minsLeft < CANCEL_CUTOFF_MIN) {
                          Alert.alert(
                            t('reservation.tooLateTitle'),
                            t('reservation.cancelTooLate', { min: CANCEL_CUTOFF_MIN }),
                          );
                          return;
                        }
                        Alert.alert(
                          isConfirmed ? t('reservation.cancelReservationTitle') : t('reservation.leaveWaitlistTitle'),
                          isConfirmed
                            ? t('myReservations.cancelConfirmedBody')
                            : t('myReservations.cancelWaitingBody'),
                          [
                            { text: t('common.no'), style: 'cancel' },
                            {
                              text: t('myReservations.yesCancel'),
                              style: 'destructive',
                              onPress: async () => {
                                const { error } = await supabase
                                  .from('class_reservations')
                                  .delete()
                                  .eq('id', item.id);
                                if (error) Alert.alert(t('common.error'), error.message);
                                else load();
                              },
                            },
                          ],
                        );
                      }}
                    >
                      <XIcon color={'#ef4444'} size={13} />
                      <Text style={S.cancelBtnText}>{t('myReservations.cancel')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: {
      paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
      backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border,
      flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    },
    back: { paddingBottom: 2 },
    headerTitle: { fontSize: 22, fontWeight: '900', color: t.text },
    headerSub: { fontSize: 12, color: t.textMuted, marginTop: 1 },

    tabs: {
      flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 8,
    },
    tab: {
      flex: 1, alignItems: 'center', paddingVertical: 10,
      borderRadius: 12, backgroundColor: t.surface,
      borderWidth: 1, borderColor: t.border,
    },
    tabActive: {
      backgroundColor: `${t.accent}15`, borderColor: `${t.accent}40`,
    },
    tabText: { fontSize: 13, fontWeight: '700', color: t.textMuted },
    tabTextActive: { color: t.accent },

    empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: t.text },
    emptySub: { fontSize: 13, color: t.textMuted, textAlign: 'center', paddingHorizontal: 32 },

    card: {
      flexDirection: 'row', alignItems: 'stretch',
      backgroundColor: t.card, borderRadius: 14,
      borderWidth: 1, borderColor: t.border, overflow: 'hidden',
    },
    cardPast: { opacity: 0.55 },
    statusDot: { width: 4, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
    cardBody: { flex: 1, padding: 14 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    cardTitle: { fontSize: 15, fontWeight: '800', color: t.text, flex: 1 },
    statusBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    },
    statusConfirmed: { backgroundColor: 'rgba(201,162,39,0.12)' },
    statusWaiting: { backgroundColor: 'rgba(245,158,11,0.12)' },
    statusText: { fontSize: 11, fontWeight: '700' },
    cardDetails: { flexDirection: 'row', gap: 16 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    detailText: { fontSize: 12, color: t.textMuted, fontWeight: '600' },
    coach: { fontSize: 12, color: t.textSecondary, marginTop: 4 },
    cancelBtn: {
      flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end',
      gap: 5, marginTop: 10, paddingHorizontal: 12, paddingVertical: 7,
      borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.10)',
      borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    },
    cancelBtnText: { fontSize: 12, fontWeight: '700', color: '#ef4444' },
  });
}
