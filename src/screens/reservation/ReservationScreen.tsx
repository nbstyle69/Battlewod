import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, FlatList,
} from 'react-native';
import { CalendarClock, ChevronLeft, ChevronRight, Users, Check, Clock, Dumbbell, Timer, X, CalendarCheck } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import WeekDayPicker from '../../components/WeekDayPicker';

interface ClassSchedule {
  id: string;
  title: string;
  description: string | null;
  coach: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  confirmed_count: number;
  waiting_count: number;
  available_spots: number;
  my_status: 'confirmed' | 'waiting' | null;
  my_waiting_position: number;
}

interface DayWOD {
  id: string;
  title: string;
  wod_type: string | null;
  scheduled_date: string;
}

function getWeekDates(offset = 0): Date[] {
  const today = new Date();
  const monday = new Date(today);
  const day = today.getDay();
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface SlotParticipant {
  member_id: string;
  username: string;
  status: 'confirmed' | 'waiting';
}

const WOD_TYPE_LABELS: Record<string, string> = {
  'for-time': 'For Time', amrap: 'AMRAP', emom: 'EMOM',
  tabata: 'Tabata', strength: 'Strength', custom: 'Custom',
};

export default function ReservationScreen() {
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const S = createStyles(theme);

  const [schedules,  setSchedules]  = useState<ClassSchedule[]>([]);
  const [wods,       setWods]       = useState<DayWOD[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [booking,    setBooking]    = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()));
  const [detailItem,  setDetailItem]  = useState<ClassSchedule | null>(null);
  const [participants, setParticipants] = useState<SlotParticipant[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const weekDates = getWeekDates(weekOffset);

  const load = useCallback(async () => {
    if (!currentBox || !user) { setLoading(false); return; }
    const start = toISO(weekDates[0]);
    const end   = toISO(weekDates[6]);

    const [{ data: schedulesData }, { data: wodsData }] = await Promise.all([
      supabase
        .from('class_schedules')
        .select('*')
        .eq('box_id', currentBox.id)
        .gte('scheduled_date', start)
        .lte('scheduled_date', end)
        .order('scheduled_date')
        .order('start_time'),
      supabase
        .from('box_wods')
        .select('id, title, wod_type, scheduled_date')
        .eq('box_id', currentBox.id)
        .eq('is_published', true)
        .gte('scheduled_date', start)
        .lte('scheduled_date', end),
    ]);

    setWods((wodsData ?? []) as DayWOD[]);

    const items = (schedulesData ?? []) as Omit<ClassSchedule, 'confirmed_count' | 'waiting_count' | 'available_spots' | 'my_status' | 'my_waiting_position'>[];

    if (items.length > 0) {
      const ids = items.map(s => s.id);
      const { data: allRes } = await supabase
        .from('class_reservations')
        .select('schedule_id, member_id, status, created_at')
        .in('schedule_id', ids)
        .order('created_at', { ascending: true });

      const dataMap: Record<string, { confirmed: number; waiting: { id: string; member_id: string }[] }> = {};
      ids.forEach(id => { dataMap[id] = { confirmed: 0, waiting: [] }; });

      (allRes ?? []).forEach((r: any) => {
        if (!dataMap[r.schedule_id]) return;
        if (r.status === 'confirmed') {
          dataMap[r.schedule_id].confirmed++;
        } else {
          dataMap[r.schedule_id].waiting.push({ id: r.id, member_id: r.member_id });
        }
      });

      const enriched: ClassSchedule[] = items.map(s => {
        const d = dataMap[s.id];
        const myConfirmed = (allRes ?? []).some(
          (r: any) => r.schedule_id === s.id && r.member_id === user.id && r.status === 'confirmed'
        );
        const myWaitIdx = d.waiting.findIndex(w => w.member_id === user.id);
        return {
          ...s,
          confirmed_count: d.confirmed,
          waiting_count: d.waiting.length,
          available_spots: Math.max(0, s.max_capacity - d.confirmed),
          my_status: myConfirmed ? 'confirmed' : myWaitIdx >= 0 ? 'waiting' : null,
          my_waiting_position: myWaitIdx >= 0 ? myWaitIdx + 1 : 0,
        };
      });
      setSchedules(enriched);
    } else {
      setSchedules([]);
    }

    setLoading(false);
    setRefreshing(false);
  }, [currentBox, user, weekOffset]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function openParticipants(item: ClassSchedule) {
    setDetailItem(item);
    setDetailLoading(true);
    const { data } = await supabase
      .from('class_reservations')
      .select('member_id, status, profile:profiles(username)')
      .eq('schedule_id', item.id)
      .order('created_at', { ascending: true });
    const list: SlotParticipant[] = (data ?? []).map((r: any) => {
      const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      return { member_id: r.member_id, username: p?.username ?? '?', status: r.status };
    });
    setParticipants(list);
    setDetailLoading(false);
  }

  async function toggleBooking(item: ClassSchedule) {
    if (!user || !currentBox) return;
    setBooking(item.id);

    if (item.my_status) {
      const label = item.my_status === 'confirmed'
        ? 'Annuler ta réservation ? Ta place sera libérée et le premier en liste d\'attente sera inscrit.'
        : 'Quitter la liste d\'attente ?';
      Alert.alert(
        item.my_status === 'confirmed' ? 'Annuler la réservation' : 'Quitter la liste d\'attente',
        label,
        [
          { text: 'Non', style: 'cancel', onPress: () => setBooking(null) },
          {
            text: 'Oui',
            style: 'destructive',
            onPress: async () => {
              const { error } = await supabase
                .from('class_reservations')
                .delete()
                .eq('schedule_id', item.id)
                .eq('member_id', user.id);
              if (error) Alert.alert('Erreur', error.message);
              setBooking(null);
              load();
            },
          },
        ]
      );
    } else {
      // Check weekly limit before booking
      try {
        const { data: limitData } = await supabase.rpc('check_weekly_limit', {
          p_user_id: user.id, p_box_id: currentBox.id, p_target_date: item.scheduled_date,
        });
        const wl = limitData as { allowed: boolean; max: number; used: number } | null;
        if (wl && !wl.allowed) {
          Alert.alert(
            'Limite atteinte',
            `Tu as utilis\u00e9 tes ${wl.max} s\u00e9ance(s) cette semaine (${wl.used}/${wl.max}). Contacte ton coach pour changer de contrat.`,
          );
          setBooking(null);
          return;
        }
      } catch (e) { captureError(e, { screen: 'Reservation', action: 'checkWeeklyLimit' }); }

      // Check daily limit (1 créneau/jour sauf illimité)
      try {
        const { data: dailyData } = await supabase.rpc('check_daily_limit', {
          p_user_id: user.id, p_box_id: currentBox.id, p_date: item.scheduled_date,
        });
        const dl = dailyData as { allowed: boolean } | null;
        if (dl && !dl.allowed) {
          Alert.alert(
            'Limite journalière',
            'Tu as déjà réservé un créneau ce jour. Ton abonnement permet 1 séance par jour.',
          );
          setBooking(null);
          return;
        }
      } catch (e) { captureError(e, { screen: 'Reservation', action: 'checkDailyLimit' }); }

      const status = item.available_spots > 0 ? 'confirmed' : 'waiting';
      if (status === 'waiting') {
        Alert.alert(
          'Créneau complet',
          `Tu vas être ajouté(e) en liste d'attente (#${item.waiting_count + 1}). Tu seras inscrit(e) automatiquement si une place se libère.`,
          [
            { text: 'Annuler', style: 'cancel', onPress: () => setBooking(null) },
            {
              text: 'Rejoindre la liste',
              onPress: async () => {
                const { error } = await supabase.from('class_reservations').insert({
                  schedule_id: item.id, member_id: user.id, box_id: currentBox.id, status,
                });
                if (error) Alert.alert('Erreur', error.message);
                setBooking(null);
                load();
              },
            },
          ]
        );
        return;
      }
      const { error } = await supabase.from('class_reservations').insert({
        schedule_id: item.id, member_id: user.id, box_id: currentBox.id, status,
      });
      if (error) Alert.alert('Erreur', error.message);
      setBooking(null);
      load();
    }
  }

  const todayISO = toISO(new Date());

  if (!currentBox) {
    return (
      <View style={S.emptyContainer}>
        <CalendarClock color={theme.textMuted} size={48} strokeWidth={1.5} />
        <Text style={S.emptyTitle}>Pas de box associée</Text>
        <Text style={S.emptySubtitle}>Rejoins une box pour voir les créneaux disponibles.</Text>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <View style={S.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <ChevronLeft color={theme.text} size={22} />
          </TouchableOpacity>
          <View>
            <Text style={S.headerTitle}>Réservation</Text>
            <Text style={S.headerSub}>{currentBox.name}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={S.myResBtn}
        onPress={() => navigation.navigate('MyReservations')}
        activeOpacity={0.8}
      >
        <CalendarCheck size={16} color={theme.accent} />
        <Text style={S.myResBtnText}>Mes réservations</Text>
        <ChevronRight size={16} color={theme.accent} />
      </TouchableOpacity>

      <WeekDayPicker
        weekOffset={weekOffset}
        setWeekOffset={setWeekOffset}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        theme={theme}
      />

      {loading
        ? <ActivityIndicator style={{ marginTop: 60 }} size="large" color={theme.accent} />
        : (() => {
          const isPast   = selectedDate < todayISO;
          const dayItems = schedules.filter(s => s.scheduled_date === selectedDate);
          const dayWod   = wods.find(w => w.scheduled_date === selectedDate);

          return (
            <ScrollView
              contentContainerStyle={{ paddingBottom: 40 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
            >
              <View style={S.dayBlock}>
                {/* WOD of the day banner */}
                {dayWod && (
                  <View style={S.wodBanner}>
                    <Dumbbell color={theme.accent} size={13} />
                    <Text style={S.wodBannerText} numberOfLines={1}>
                      WOD · {dayWod.title}
                    </Text>
                    {dayWod.wod_type && (
                      <View style={S.wodTypePill}>
                        <Text style={S.wodTypeText}>
                          {WOD_TYPE_LABELS[dayWod.wod_type] ?? dayWod.wod_type}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Schedule slots */}
                {dayItems.length === 0 ? (
                  <View style={S.noSlots}>
                    <Text style={S.noSlotsText}>Aucun cours ce jour</Text>
                  </View>
                ) : (
                  dayItems.map(item => {
                    const isBusy    = booking === item.id;
                    const isWaiting = item.my_status === 'waiting';
                    const isFull    = item.available_spots === 0;

                    return (
                      <TouchableOpacity
                        key={item.id}
                        activeOpacity={0.7}
                        onPress={() => openParticipants(item)}
                        style={[
                          S.slotCard,
                          item.my_status === 'confirmed' && S.slotCardBooked,
                          isWaiting && S.slotCardWaiting,
                          isPast && S.slotCardPast,
                        ]}
                      >
                        <View style={S.slotLeft}>
                          <View style={S.slotTimeRow}>
                            <Clock color={item.my_status === 'confirmed' ? '#C9A227' : theme.textMuted} size={12} />
                            <Text style={[S.slotTime, item.my_status === 'confirmed' && { color: '#C9A227' }]}>
                              {item.start_time} – {item.end_time}
                            </Text>
                          </View>
                          <Text style={S.slotTitle}>{item.title}</Text>
                          {item.coach ? <Text style={S.slotCoach}>👤 {item.coach}</Text> : null}
                          {item.description ? <Text style={S.slotDesc} numberOfLines={1}>{item.description}</Text> : null}
                        </View>

                        <View style={S.slotRight}>
                          {/* Capacity info */}
                          <View style={S.capacityRow}>
                            <View style={[S.capacityBadge, isFull && !item.my_status && S.capacityFull]}>
                              <Users color={isFull && !item.my_status ? theme.error : theme.accent} size={11} />
                              <Text style={[S.capacityText, isFull && !item.my_status && { color: theme.error }]}>
                                {item.confirmed_count}/{item.max_capacity}
                              </Text>
                            </View>
                            {item.waiting_count > 0 && (
                              <View style={S.waitingBadge}>
                                <Timer color="#f59e0b" size={10} />
                                <Text style={S.waitingBadgeText}>{item.waiting_count}</Text>
                              </View>
                            )}
                          </View>

                          {/* Spots label */}
                          {!isPast && !item.my_status && (
                            <Text style={[S.spotsLabel, isFull && { color: theme.error }]}>
                              {isFull
                                ? `Complet${item.waiting_count > 0 ? ` · ${item.waiting_count} en attente` : ''}`
                                : `${item.available_spots} place${item.available_spots > 1 ? 's' : ''} dispo`}
                            </Text>
                          )}
                          {isWaiting && (
                            <Text style={S.waitingPositionLabel}>
                              #{item.my_waiting_position} en liste d'attente
                            </Text>
                          )}

                          {/* Action button */}
                          {!isPast && (
                            <TouchableOpacity
                              style={[
                                S.bookBtn,
                                item.my_status === 'confirmed' && S.bookBtnBooked,
                                isWaiting && S.bookBtnWaiting,
                                isFull && !item.my_status && S.bookBtnQueue,
                                isBusy && { opacity: 0.5 },
                              ]}
                              onPress={() => toggleBooking(item)}
                              disabled={isBusy}
                            >
                              {item.my_status === 'confirmed' && <Check color={'#C9A227'} size={13} />}
                              {isWaiting && <Timer color="#f59e0b" size={13} />}
                              <Text style={[
                                S.bookBtnText,
                                item.my_status === 'confirmed' && S.bookBtnTextBooked,
                                isWaiting && S.bookBtnTextWaiting,
                                isFull && !item.my_status && { color: theme.textMuted },
                              ]}>
                                {isBusy
                                  ? '…'
                                  : item.my_status === 'confirmed'
                                    ? 'Réservé'
                                    : isWaiting
                                      ? `Attente #${item.my_waiting_position}`
                                      : isFull
                                        ? 'File d\'attente'
                                        : 'Réserver'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              {dayItems.length === 0 && !dayWod && (
                <View style={S.emptyWeek}>
                  <CalendarClock color={theme.textMuted} size={40} strokeWidth={1.5} />
                  <Text style={S.emptyWeekTitle}>Aucun créneau ce jour</Text>
                  <Text style={S.emptyWeekSub}>Ton coach n'a pas encore publié de cours.</Text>
                </View>
              )}
            </ScrollView>
          );
        })()    
      }

      {/* Participant detail modal */}
      <Modal visible={!!detailItem} transparent animationType="slide" onRequestClose={() => setDetailItem(null)}>
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            {/* Modal header */}
            <View style={S.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={S.modalTitle}>{detailItem?.title}</Text>
                <Text style={S.modalSubtitle}>
                  {detailItem?.start_time} – {detailItem?.end_time}
                  {detailItem?.coach ? `  ·  ${detailItem.coach}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDetailItem(null)} style={S.modalClose}>
                <X color={theme.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <ActivityIndicator style={{ marginVertical: 40 }} size="large" color={theme.accent} />
            ) : participants.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Users color={theme.textMuted} size={32} />
                <Text style={[S.modalSubtitle, { marginTop: 12 }]}>Aucun inscrit</Text>
              </View>
            ) : (
              <FlatList
                data={participants}
                keyExtractor={p => p.member_id}
                style={{ maxHeight: 350 }}
                renderItem={({ item: p, index }) => {
                  const isMe = p.member_id === user?.id;
                  const isConfirmed = p.status === 'confirmed';
                  return (
                    <View style={S.participantRow}>
                      <View style={[S.participantAvatar, { backgroundColor: isConfirmed ? `${theme.accent}20` : 'rgba(245,158,11,0.15)' }]}>
                        <Text style={[S.participantAvatarText, { color: isConfirmed ? theme.accent : '#f59e0b' }]}>
                          {p.username[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[S.participantName, isMe && { color: theme.accent }]}>
                          {p.username}{isMe ? ' (toi)' : ''}
                        </Text>
                        <Text style={S.participantStatus}>
                          {isConfirmed ? 'Inscrit' : `Attente #${participants.filter(x => x.status === 'waiting').indexOf(p) + 1}`}
                        </Text>
                      </View>
                      <View style={[S.participantDot, { backgroundColor: isConfirmed ? theme.accent : '#f59e0b' }]} />
                    </View>
                  );
                }}
              />
            )}

            {/* Action buttons */}
            {detailItem && !detailItem.my_status && detailItem.available_spots > 0 && (
              <TouchableOpacity
                style={[S.modalActionBtn, { backgroundColor: theme.accent }]}
                onPress={() => { setDetailItem(null); toggleBooking(detailItem); }}
              >
                <Text style={S.modalActionBtnText}>Réserver ce créneau</Text>
              </TouchableOpacity>
            )}
            {detailItem && detailItem.my_status && (
              <TouchableOpacity
                style={[S.modalActionBtn, { backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }]}
                onPress={() => { setDetailItem(null); toggleBooking(detailItem); }}
              >
                <Text style={[S.modalActionBtnText, { color: '#ef4444' }]}>
                  {detailItem.my_status === 'confirmed' ? 'Se désinscrire' : "Quitter la file d'attente"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    container:          { flex: 1, backgroundColor: t.background },
    emptyContainer:     { flex: 1, backgroundColor: t.background, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 12 },
    emptyTitle:         { fontSize: 20, fontWeight: '800', color: t.text },
    emptySubtitle:      { fontSize: 14, color: t.textMuted, textAlign: 'center' },

    myResBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginHorizontal: 20, marginTop: 8, marginBottom: 4,
      backgroundColor: `${t.accent}15`,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
      borderWidth: 1, borderColor: `${t.accent}25`,
    },
    myResBtnText: { fontSize: 13, fontWeight: '700' as const, color: t.accent },

    header:             { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
    headerTitle:        { fontSize: 26, fontWeight: '900', color: t.text, letterSpacing: -0.5 },
    headerSub:          { fontSize: 13, color: t.textMuted, marginTop: 2 },

    weekNav:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border },
    weekArrow:          { padding: 8 },
    weekLabelBtn:       { flex: 1, alignItems: 'center' },
    weekLabel:          { fontSize: 13, fontWeight: '700', color: t.text, textAlign: 'center' },

    dayBlock:           { marginHorizontal: 16, marginTop: 14 },
    dayHeader:          { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 6, borderWidth: 1, borderColor: t.border },
    dayHeaderToday:     { backgroundColor: t.accent, borderColor: t.accent },
    dayLabel:           { fontSize: 13, fontWeight: '700', color: t.text, flex: 1 },
    dayLabelToday:      { color: '#fff' },
    dayLabelPast:       { color: t.textMuted },
    todayBadge:         { fontSize: 11, fontWeight: '700', color: '#fff', marginRight: 6 },
    slotCount:          { fontSize: 11, color: t.textMuted },

    wodBanner:          { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${t.accent}10`, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 6, borderWidth: 1, borderColor: `${t.accent}25` },
    wodBannerText:      { flex: 1, fontSize: 12, fontWeight: '700', color: t.accent },
    wodTypePill:        { backgroundColor: `${t.accent}20`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    wodTypeText:        { fontSize: 11, fontWeight: '700', color: t.accent },

    noSlots:            { paddingVertical: 10, paddingHorizontal: 4 },
    noSlotsText:        { fontSize: 12, color: t.textMuted, fontStyle: 'italic' },

    slotCard:           { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: t.border },
    slotCardBooked:     { borderColor: '#C9A227', backgroundColor: 'rgba(201,162,39,0.08)' },
    slotCardWaiting:    { borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.05)' },
    slotCardPast:       { opacity: 0.45 },
    slotLeft:           { flex: 1 },
    slotTimeRow:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
    slotTime:           { fontSize: 12, fontWeight: '700', color: t.textMuted },
    slotTitle:          { fontSize: 16, fontWeight: '800', color: t.text, marginBottom: 2 },
    slotCoach:          { fontSize: 12, color: t.textMuted },
    slotDesc:           { fontSize: 12, color: t.textMuted, marginTop: 2 },
    slotRight:          { alignItems: 'flex-end', gap: 6, marginLeft: 12 },

    capacityRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
    capacityBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${t.accent}12`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    capacityFull:       { backgroundColor: `${t.error}12` },
    capacityText:       { fontSize: 11, fontWeight: '700', color: t.accent },
    waitingBadge:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
    waitingBadgeText:   { fontSize: 11, fontWeight: '700', color: '#f59e0b' },

    spotsLabel:         { fontSize: 11, fontWeight: '600', color: t.accent },
    waitingPositionLabel: { fontSize: 11, fontWeight: '700', color: '#f59e0b' },

    bookBtn:            { backgroundColor: t.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
    bookBtnBooked:      { backgroundColor: 'rgba(201,162,39,0.15)', borderWidth: 1, borderColor: '#C9A227' },
    bookBtnWaiting:     { backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: '#f59e0b' },
    bookBtnQueue:       { backgroundColor: t.card, borderWidth: 1, borderColor: t.border },
    bookBtnText:        { fontSize: 12, fontWeight: '800', color: '#fff' },
    bookBtnTextBooked:  { color: '#C9A227' },
    bookBtnTextWaiting: { color: '#f59e0b' },

    emptyWeek:          { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyWeekTitle:     { fontSize: 18, fontWeight: '800', color: t.text },
    emptyWeekSub:       { fontSize: 13, color: t.textMuted, textAlign: 'center', paddingHorizontal: 32 },

    modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalSheet:         { backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 34, maxHeight: '75%' },
    modalHeader:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: t.border },
    modalTitle:         { fontSize: 18, fontWeight: '900', color: t.text },
    modalSubtitle:      { fontSize: 13, color: t.textMuted, marginTop: 2 },
    modalClose:         { padding: 6 },

    participantRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border },
    participantAvatar:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    participantAvatarText: { fontSize: 14, fontWeight: '800' },
    participantName:    { fontSize: 14, fontWeight: '700', color: t.text },
    participantStatus:  { fontSize: 12, color: t.textMuted, marginTop: 1 },
    participantDot:     { width: 8, height: 8, borderRadius: 4 },

    modalActionBtn:     { marginHorizontal: 20, marginTop: 16, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    modalActionBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  });
}
