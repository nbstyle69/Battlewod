import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl, Share,
} from 'react-native';
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2, Users, CalendarClock, Timer, Check, X, UserPlus, Search, Download, ClipboardCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import DateField from '../../components/DateField';

interface ClassSchedule {
  id: string;
  box_id: string;
  title: string;
  description: string | null;
  coach: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  created_at: string;
  confirmed_count: number;
  waiting_count: number;
}

interface Reservation {
  id: string;
  member_id: string;
  status: string;
  attended: boolean | null;
  username: string;
}

interface BoxMember {
  id: string;
  username: string;
}

const CLASS_TYPES = [
  'WOD', 'Haltérophilie', 'Cardio', 'Open Gym', 'Strength', 'Mobility', 'Kids', 'Teens', 'Autre',
];

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
  return d.toISOString().split('T')[0];
}

export default function BOScheduleScreen({ navigation }: any) {
  const { user, currentBox, boxRole } = useAuth();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
  const S = createStyles(theme);

  const [schedules,   setSchedules]   = useState<ClassSchedule[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editItem,    setEditItem]    = useState<ClassSchedule | null>(null);

  const [title,       setTitle]       = useState('WOD');
  const [customTitle, setCustomTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coach,       setCoach]       = useState('');
  const [date,        setDate]        = useState('');
  const [startTime,   setStartTime]   = useState('09:00');
  const [endTime,     setEndTime]     = useState('10:00');
  const [maxCapacity, setMaxCapacity] = useState('15');
  const [submitting,  setSubmitting]  = useState(false);

  const [coaches, setCoaches] = useState<{ id: string; username: string }[]>([]);

  // ── Attendance modal state ──
  const [attendanceOpen, setAttendanceOpen]     = useState(false);
  const [attendanceSlot, setAttendanceSlot]     = useState<ClassSchedule | null>(null);
  const [reservations, setReservations]         = useState<Reservation[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [addMemberOpen, setAddMemberOpen]       = useState(false);
  const [memberSearch, setMemberSearch]         = useState('');
  const [boxMembers, setBoxMembers]             = useState<BoxMember[]>([]);
  const [membersLoading, setMembersLoading]     = useState(false);

  const isOwner = boxRole === 'owner';

  const weekDates = getWeekDates(weekOffset);

  // Fetch coaches list for the current box
  useEffect(() => {
    if (!currentBox) return;
    (async () => {
      const { data } = await supabase
        .from('box_members')
        .select('member_id, profiles:member_id(username)')
        .eq('box_id', currentBox.id)
        .eq('role', 'coach');
      setCoaches(
        (data ?? []).map((c: any) => ({
          id: c.member_id,
          username: (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles)?.username ?? 'Coach',
        }))
      );
    })();
  }, [currentBox]);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    try {
    const start = toISO(weekDates[0]);
    const end   = toISO(weekDates[6]);

    const { data } = await supabase
      .from('class_schedules')
      .select('*')
      .eq('box_id', currentBox.id)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date')
      .order('start_time');

    const rawItems = (data ?? []) as Omit<ClassSchedule, 'confirmed_count' | 'waiting_count'>[];

    let items: ClassSchedule[] = rawItems.map(s => ({ ...s, confirmed_count: 0, waiting_count: 0 }));

    if (rawItems.length > 0) {
      const ids = rawItems.map(s => s.id);
      const { data: resCounts } = await supabase
        .from('class_reservations')
        .select('schedule_id, status')
        .in('schedule_id', ids);

      const confirmedMap: Record<string, number> = {};
      const waitingMap:   Record<string, number> = {};
      ids.forEach(id => { confirmedMap[id] = 0; waitingMap[id] = 0; });
      (resCounts ?? []).forEach((r: any) => {
        if (r.status === 'waiting') { if (waitingMap[r.schedule_id] !== undefined) waitingMap[r.schedule_id]++; }
        else                        { if (confirmedMap[r.schedule_id] !== undefined) confirmedMap[r.schedule_id]++; }
      });
      items = items.map(s => ({ ...s, confirmed_count: confirmedMap[s.id] ?? 0, waiting_count: waitingMap[s.id] ?? 0 }));
    }

    setSchedules(items);
    } catch (e) { captureError(e, { screen: 'BOSchedule', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, weekOffset]);

  useEffect(() => { load(); }, [load]);

  function openCreate(selectedDate: string) {
    setEditItem(null);
    setTitle('WOD'); setCustomTitle(''); setDescription('');
    setCoach(''); setDate(selectedDate);
    setStartTime('09:00'); setEndTime('10:00'); setMaxCapacity('15');
    setModalOpen(true);
  }

  function openEdit(item: ClassSchedule) {
    setEditItem(item);
    const isPreset = CLASS_TYPES.includes(item.title);
    setTitle(isPreset ? item.title : 'Autre');
    setCustomTitle(isPreset ? '' : item.title);
    setDescription(item.description ?? '');
    setCoach(item.coach ?? '');
    setDate(item.scheduled_date);
    setStartTime(item.start_time);
    setEndTime(item.end_time);
    setMaxCapacity(String(item.max_capacity));
    setModalOpen(true);
  }

  async function save() {
    const finalTitle = title === 'Autre' ? customTitle.trim() : title;
    if (!finalTitle || !date || !startTime || !endTime || !currentBox || !user) return;
    const cap = parseInt(maxCapacity);
    if (isNaN(cap) || cap < 1) { Alert.alert(t('bo.schedule.invalidCapacity')); return; }

    setSubmitting(true);
    const payload = {
      box_id: currentBox.id,
      title: finalTitle,
      description: description.trim() || null,
      coach: coach.trim() || null,
      scheduled_date: date,
      start_time: startTime,
      end_time: endTime,
      max_capacity: cap,
    };

    const { error } = editItem
      ? await supabase.from('class_schedules').update(payload).eq('id', editItem.id)
      : await supabase.from('class_schedules').insert(payload);

    setSubmitting(false);
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    setModalOpen(false);
    load();
  }

  async function deleteItem(item: ClassSchedule) {
    Alert.alert(t('bo.schedule.deleteTitle'), `${item.title} — ${item.start_time}`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          await supabase.from('class_schedules').delete().eq('id', item.id);
          load();
        },
      },
    ]);
  }

  // ── Attendance helpers ──

  async function openAttendance(slot: ClassSchedule) {
    setAttendanceSlot(slot);
    setAttendanceOpen(true);
    setAttendanceLoading(true);
    setAddMemberOpen(false);
    setMemberSearch('');
    try {
      const { data } = await supabase
        .from('class_reservations')
        .select('id, member_id, status, attended, profiles:member_id(username)')
        .eq('schedule_id', slot.id);
      setReservations(
        (data ?? []).map((r: any) => ({
          id: r.id,
          member_id: r.member_id,
          status: r.status,
          attended: r.attended,
          username: (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.username ?? '—',
        }))
      );
    } catch (e) { captureError(e, { screen: 'BOSchedule', action: 'openAttendance' }); }
    setAttendanceLoading(false);
  }

  async function toggleAttended(resId: string, current: boolean | null) {
    const next = current === true ? false : true;
    setReservations(prev => prev.map(r => r.id === resId ? { ...r, attended: next } : r));
    const { error } = await supabase
      .from('class_reservations')
      .update({ attended: next })
      .eq('id', resId);
    if (error) {
      Alert.alert(t('common.error'), error.message);
      setReservations(prev => prev.map(r => r.id === resId ? { ...r, attended: current } : r));
    }
  }

  async function loadBoxMembers() {
    if (!currentBox) return;
    setMembersLoading(true);
    try {
      const { data } = await supabase
        .from('box_members')
        .select('member_id, profiles:member_id(username)')
        .eq('box_id', currentBox.id)
        .eq('status', 'active');
      setBoxMembers(
        (data ?? []).map((m: any) => ({
          id: m.member_id,
          username: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.username ?? '—',
        }))
      );
    } catch (e) { captureError(e, { screen: 'BOSchedule', action: 'loadBoxMembers' }); }
    setMembersLoading(false);
  }

  function openAddMember() {
    setAddMemberOpen(true);
    setMemberSearch('');
    loadBoxMembers();
  }

  async function addMemberToSlot(memberId: string, username: string) {
    if (!attendanceSlot || !currentBox) return;
    const { error } = await supabase
      .from('class_reservations')
      .insert({
        schedule_id: attendanceSlot.id,
        member_id: memberId,
        box_id: currentBox.id,
        status: 'confirmed',
        attended: true,
      });
    if (error) {
      if (error.code === '23505') Alert.alert(t('bo.schedule.alreadyRegistered'), t('bo.schedule.alreadyRegisteredMsg'));
      else Alert.alert(t('common.error'), error.message);
      return;
    }
    setReservations(prev => [
      ...prev,
      { id: `tmp-${memberId}`, member_id: memberId, status: 'confirmed', attended: true, username },
    ]);
    setAddMemberOpen(false);
    load();
  }

  async function exportAttendance(mode: 'day' | 'week') {
    if (!currentBox) return;
    try {
      let targetSchedules: ClassSchedule[] = [];
      if (mode === 'day' && attendanceSlot) {
        targetSchedules = schedules.filter(s => s.scheduled_date === attendanceSlot.scheduled_date);
      } else {
        targetSchedules = schedules;
      }

      if (targetSchedules.length === 0) {
        Alert.alert(t('bo.schedule.noSlot'), t('bo.schedule.noSlotMsg'));
        return;
      }

      const ids = targetSchedules.map(s => s.id);
      const { data: allRes } = await supabase
        .from('class_reservations')
        .select('schedule_id, member_id, status, attended, profiles:member_id(username)')
        .in('schedule_id', ids);

      let csv = t('bo.schedule.csvHeader') + '\n';
      for (const s of targetSchedules) {
        const slotRes = (allRes ?? []).filter((r: any) => r.schedule_id === s.id);
        if (slotRes.length === 0) {
          csv += `${s.scheduled_date},${s.start_time}-${s.end_time},${s.title},${s.coach ?? ''},—,—,—\n`;
        } else {
          for (const r of slotRes) {
            const uname = (Array.isArray((r as any).profiles) ? (r as any).profiles[0] : (r as any).profiles)?.username ?? '—';
            const att = r.attended === true ? t('bo.schedule.yes') : r.attended === false ? t('bo.schedule.no') : '—';
            csv += `${s.scheduled_date},${s.start_time}-${s.end_time},${s.title},${s.coach ?? ''},${uname},${r.status},${att}\n`;
          }
        }
      }

      const label = mode === 'day'
        ? t('bo.schedule.exportDayLabel', { date: attendanceSlot?.scheduled_date })
        : t('bo.schedule.exportWeekLabel', { start: toISO(weekDates[0]), end: toISO(weekDates[6]) });

      await Share.share({ title: label, message: csv });
    } catch (e) { captureError(e, { screen: 'BOSchedule', action: 'exportAttendance' }); }
  }

  const DAY_LABELS = t('bo.schedule.dayLabels', { returnObjects: true }) as string[];
  const todayISO = toISO(new Date());

  return (
    <View style={S.container}>
      <View style={S.header}>
        <Text style={S.headerTitle}>{t('bo.schedule.title')}</Text>
        <Text style={S.headerSub}>{currentBox?.name ?? ''}</Text>
      </View>

      <View style={S.weekNav}>
        <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={S.weekArrow}>
          <ChevronLeft color={theme.text} size={20} />
        </TouchableOpacity>
        <Text style={S.weekLabel}>
          {weekDates[0].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
          {' — '}
          {weekDates[6].toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={S.weekArrow}>
          <ChevronRight color={theme.text} size={20} />
        </TouchableOpacity>
      </View>

      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.accent} />
        : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 140 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          >
            {weekDates.map((d, i) => {
              const iso = toISO(d);
              const isToday = iso === todayISO;
              const dayItems = schedules.filter(s => s.scheduled_date === iso);
              return (
                <View key={iso} style={S.dayBlock}>
                  <View style={[S.dayHeader, isToday && S.dayHeaderToday]}>
                    <Text style={[S.dayLabel, isToday && S.dayLabelToday]}>
                      {DAY_LABELS[i]} {d.getDate()}
                    </Text>
                    {isToday && <Text style={S.todayBadge}>{t('bo.schedule.today')}</Text>}
                    <TouchableOpacity onPress={() => openCreate(iso)} style={S.addDayBtn}>
                      <Plus color={isToday ? theme.card : theme.accent} size={16} />
                    </TouchableOpacity>
                  </View>

                  {dayItems.length === 0 ? (
                    <TouchableOpacity style={S.emptyDay} onPress={() => openCreate(iso)} activeOpacity={0.7}>
                      <Text style={S.emptyDayText}>{t('bo.schedule.addSlot')}</Text>
                    </TouchableOpacity>
                  ) : (
                    dayItems.map(item => (
                      <TouchableOpacity key={item.id} style={S.slotCard} activeOpacity={0.7} onPress={() => openAttendance(item)}>
                        <View style={S.slotLeft}>
                          <Text style={S.slotTime}>{item.start_time} – {item.end_time}</Text>
                          <Text style={S.slotTitle}>{item.title}</Text>
                          {item.coach ? <Text style={S.slotCoach}>👤 {item.coach}</Text> : null}
                        </View>
                        <View style={S.slotRight}>
                          <View style={S.capacityRow}>
                            <TouchableOpacity onPress={() => openAttendance(item)} style={S.capacityBadge}>
                              <Users color={item.confirmed_count >= item.max_capacity ? theme.error : theme.accent} size={12} />
                              <Text style={[S.capacityText, item.confirmed_count >= item.max_capacity && { color: theme.error }]}>
                                {item.confirmed_count}/{item.max_capacity}
                              </Text>
                            </TouchableOpacity>
                            {item.waiting_count > 0 && (
                              <View style={S.waitingBadge}>
                                <Timer color="#f59e0b" size={11} />
                                <Text style={S.waitingText}>{item.waiting_count}</Text>
                              </View>
                            )}
                          </View>
                          <View style={S.slotActions}>
                            {isOwner && (
                              <>
                                <TouchableOpacity onPress={() => openEdit(item)} style={S.actionBtn}>
                                  <Pencil color={theme.textMuted} size={16} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => deleteItem(item)} style={S.actionBtn}>
                                  <Trash2 color={theme.error} size={16} />
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              );
            })}
          </ScrollView>
        )
      }

      <Modal visible={modalOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={S.modalOverlay}
        >
          <View style={S.modalSheet}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{editItem ? t('bo.schedule.editSlot') : t('bo.schedule.newSlot')}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Text style={S.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={S.fieldLabel}>{t('bo.schedule.classType')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {CLASS_TYPES.map(ct => (
                  <TouchableOpacity
                    key={ct}
                    style={[S.typePill, title === ct && S.typePillActive]}
                    onPress={() => setTitle(ct)}
                  >
                    <Text style={[S.typePillText, title === ct && S.typePillTextActive]}>{ct}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {title === 'Autre' && (
                <>
                  <Text style={S.fieldLabel}>{t('bo.schedule.customName')}</Text>
                  <TextInput
                    style={S.input}
                    value={customTitle}
                    onChangeText={setCustomTitle}
                    placeholder={t('bo.schedule.customNamePlaceholder')}
                    placeholderTextColor={theme.textMuted}
                  />
                </>
              )}

              <Text style={S.fieldLabel}>{t('bo.schedule.coachOptional')}</Text>
              {coaches.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {coaches.map(c => {
                    const selected = coach === c.username;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[S.typePill, selected && S.typePillActive]}
                        onPress={() => setCoach(selected ? '' : c.username)}
                      >
                        <Text style={[S.typePillText, selected && S.typePillTextActive]}>
                          {c.username}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>
                  {t('bo.schedule.noCoach')}
                </Text>
              )}

              <Text style={S.fieldLabel}>{t('bo.schedule.dateLabel')}</Text>
              <DateField
                style={S.input}
                value={date}
                onChangeText={setDate}
                theme={theme}
              />

              <View style={S.row}>
                <View style={{ flex: 1 }}>
                  <Text style={S.fieldLabel}>{t('bo.schedule.start')}</Text>
                  <TextInput
                    style={S.input}
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="09:00"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={S.fieldLabel}>{t('bo.schedule.end')}</Text>
                  <TextInput
                    style={S.input}
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="10:00"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={S.fieldLabel}>{t('bo.schedule.capacity')}</Text>
                  <TextInput
                    style={S.input}
                    value={maxCapacity}
                    onChangeText={setMaxCapacity}
                    placeholder="15"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={S.fieldLabel}>{t('bo.schedule.descriptionOptional')}</Text>
              <TextInput
                style={[S.input, { height: 72, textAlignVertical: 'top' }]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('bo.schedule.descriptionPlaceholder')}
                placeholderTextColor={theme.textMuted}
                multiline
              />

              <TouchableOpacity
                style={[S.saveBtn, submitting && { opacity: 0.6 }]}
                onPress={save}
                disabled={submitting}
              >
                <Text style={S.saveBtnText}>{submitting ? t('bo.schedule.saving') : editItem ? t('common.edit') : t('bo.schedule.createSlot')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Attendance Modal ── */}
      <Modal visible={attendanceOpen} animationType="slide" transparent>
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <View style={S.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={S.modalTitle}>
                  {attendanceSlot?.title} — {attendanceSlot?.start_time}–{attendanceSlot?.end_time}
                </Text>
                {attendanceSlot?.coach ? (
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{t('bo.schedule.coachName', { name: attendanceSlot.coach })}</Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setAttendanceOpen(false)}>
                <Text style={S.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('bo.schedule.registeredCount', { count: reservations.length, max: attendanceSlot?.max_capacity ?? '—' })}
            </Text>

            {attendanceLoading ? (
              <ActivityIndicator style={{ marginVertical: 30 }} color={theme.accent} />
            ) : reservations.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', marginVertical: 30 }}>
                {t('bo.schedule.noRegistered')}
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ paddingBottom: 8 }}>
                {reservations.map(r => (
                  <View key={r.id} style={S.attRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={S.attName}>{r.username}</Text>
                      <Text style={S.attStatus}>
                        {r.status === 'waiting' ? t('bo.schedule.statusWaiting') : t('bo.schedule.statusConfirmed')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => toggleAttended(r.id, r.attended)}
                      style={[
                        S.attToggle,
                        r.attended === true && S.attTogglePresent,
                        r.attended === false && S.attToggleAbsent,
                      ]}
                    >
                      {r.attended === true ? (
                        <Check color="#fff" size={18} />
                      ) : r.attended === false ? (
                        <X color="#fff" size={18} />
                      ) : (
                        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: theme.textMuted }} />
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Add member button */}
            <TouchableOpacity onPress={openAddMember} style={S.attAddBtn}>
              <UserPlus color={theme.accent} size={16} />
              <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '700', marginLeft: 8 }}>{t('bo.schedule.addMember')}</Text>
            </TouchableOpacity>

            {/* Add member sub-modal */}
            {addMemberOpen && (
              <View style={S.attAddSection}>
                <View style={S.attSearchRow}>
                  <Search color={theme.textMuted} size={16} />
                  <TextInput
                    style={S.attSearchInput}
                    value={memberSearch}
                    onChangeText={setMemberSearch}
                    placeholder={t('bo.schedule.searchMember')}
                    placeholderTextColor={theme.textMuted}
                    autoFocus
                  />
                  <TouchableOpacity onPress={() => setAddMemberOpen(false)}>
                    <X color={theme.textMuted} size={16} />
                  </TouchableOpacity>
                </View>
                {membersLoading ? (
                  <ActivityIndicator style={{ marginVertical: 16 }} color={theme.accent} />
                ) : (
                  <ScrollView style={{ maxHeight: 180 }}>
                    {boxMembers
                      .filter(m => !reservations.some(r => r.member_id === m.id))
                      .filter(m => memberSearch === '' || m.username.toLowerCase().includes(memberSearch.toLowerCase()))
                      .map(m => (
                        <TouchableOpacity key={m.id} style={S.attMemberRow} onPress={() => addMemberToSlot(m.id, m.username)}>
                          <Text style={{ color: theme.text, fontSize: 14 }}>{m.username}</Text>
                          <Plus color={theme.accent} size={16} />
                        </TouchableOpacity>
                      ))
                    }
                  </ScrollView>
                )}
              </View>
            )}

            {/* Export buttons (owner only) */}
            {isOwner && (
              <View style={S.attExportRow}>
                <TouchableOpacity style={S.attExportBtn} onPress={() => exportAttendance('day')}>
                  <Download color={theme.accent} size={14} />
                  <Text style={S.attExportText}>{t('bo.schedule.exportDay')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={S.attExportBtn} onPress={() => exportAttendance('week')}>
                  <Download color={theme.accent} size={14} />
                  <Text style={S.attExportText}>{t('bo.schedule.exportWeek')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    container:       { flex: 1, backgroundColor: t.background },
    header:          { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
    headerTitle:     { fontSize: 26, fontWeight: '900', color: t.text, letterSpacing: -0.5 },
    headerSub:       { fontSize: 13, color: t.textMuted, marginTop: 2 },
    weekNav:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border },
    weekArrow:       { padding: 6 },
    weekLabel:       { fontSize: 13, fontWeight: '700', color: t.text },
    dayBlock:        { marginHorizontal: 16, marginTop: 16 },
    dayHeader:       { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 6, borderWidth: 1, borderColor: t.border },
    dayHeaderToday:  { backgroundColor: t.accent, borderColor: t.accent },
    dayLabel:        { fontSize: 13, fontWeight: '700', color: t.text, flex: 1 },
    dayLabelToday:   { color: t.card },
    todayBadge:      { fontSize: 11, fontWeight: '700', color: t.card, marginRight: 8 },
    addDayBtn:       { padding: 4 },
    emptyDay:        { borderWidth: 1, borderColor: t.border, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    emptyDayText:    { fontSize: 13, color: t.textMuted },
    slotCard:        { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: t.border },
    slotLeft:        { flex: 1 },
    slotTime:        { fontSize: 12, fontWeight: '700', color: t.accent, marginBottom: 2 },
    slotTitle:       { fontSize: 15, fontWeight: '800', color: t.text },
    slotCoach:       { fontSize: 12, color: t.textMuted, marginTop: 2 },
    slotRight:       { alignItems: 'flex-end', gap: 8 },
    capacityRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
    capacityBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${t.accent}12`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    capacityFull:    { backgroundColor: `${t.error}12` },
    capacityText:    { fontSize: 12, fontWeight: '700', color: t.accent },
    waitingBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
    waitingText:     { fontSize: 11, fontWeight: '700', color: '#f59e0b' },
    slotActions:     { flexDirection: 'row', gap: 8 },
    actionBtn:       { padding: 6 },
    row:             { flexDirection: 'row', marginBottom: 0 },
    modalOverlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet:      { backgroundColor: t.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '92%' },
    modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle:      { fontSize: 18, fontWeight: '900', color: t.text },
    modalClose:      { fontSize: 20, color: t.textMuted, padding: 4 },
    fieldLabel:      { fontSize: 12, fontWeight: '700', color: t.textMuted, marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    input:           { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, color: t.text, fontSize: 15, marginBottom: 4 },
    typePill:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, marginRight: 8 },
    typePillActive:  { backgroundColor: t.accent, borderColor: t.accent },
    typePillText:    { fontSize: 13, fontWeight: '600', color: t.textMuted },
    typePillTextActive: { color: '#fff' },
    saveBtn:         { backgroundColor: t.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
    saveBtnText:     { fontSize: 16, fontWeight: '800', color: '#fff' },
    // ── Attendance styles ──
    attRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: t.border },
    attName:         { fontSize: 15, fontWeight: '700', color: t.text },
    attStatus:       { fontSize: 11, color: t.textMuted, marginTop: 1 },
    attToggle:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.card, borderWidth: 2, borderColor: t.border },
    attTogglePresent:{ backgroundColor: '#22c55e', borderColor: '#22c55e' },
    attToggleAbsent: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
    attAddBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 8, borderWidth: 1, borderColor: t.accent, borderRadius: 12, borderStyle: 'dashed' },
    attAddSection:   { marginTop: 10, backgroundColor: t.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: t.border },
    attSearchRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    attSearchInput:  { flex: 1, color: t.text, fontSize: 14, paddingVertical: 6 },
    attMemberRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: t.border },
    attExportRow:    { flexDirection: 'row', gap: 10, marginTop: 14 },
    attExportBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: `${t.accent}15`, borderRadius: 10, borderWidth: 1, borderColor: `${t.accent}30` },
    attExportText:   { fontSize: 13, fontWeight: '700', color: t.accent },
  });
}
