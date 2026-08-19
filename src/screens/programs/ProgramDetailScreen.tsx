import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { ChevronLeft, ChevronRight, Check, Clock, StickyNote } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ProgramWOD, ProgramScore } from '../../types';
import { formatCap } from '../../utils/scoreFormat';
import { annotateStrengthLoads, parseStrengthLine, resolveStrengthLoadKg, StrengthEntry } from '../../utils/strengthBlock';
import { recordStrengthPRs } from '../../services/strengthPR';
import { useMyOneRepMax } from '../../hooks/useMyOneRepMax';

const WOD_TYPE_COLORS: Record<string, string> = {
  'for-time': '#EF4444',
  amrap: '#3B82F6',
  emom: '#8B5CF6',
  strength: '#16A34A',
  custom: '#6B7280',
};

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Scoring options offered to the athlete when logging a result.
const SCORE_TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'time', label: 'Temps', hint: 'mm:ss' },
  { value: 'reps', label: 'Reps', hint: 'nombre' },
  { value: 'load', label: 'Charge', hint: 'kg' },
];

// Default scoring type inferred from the WOD type.
function defaultScoreType(wodType?: string): string {
  if (wodType === 'for-time' || wodType === 'emom') return 'time';
  if (wodType === 'strength') return 'load';
  return 'reps';
}

function formatScore(s: ProgramScore): string {
  if (s.score_type === 'time') {
    const m = Math.floor(s.score_value / 60);
    const sec = s.score_value % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  if (s.score_type === 'load') return `${s.score_value} kg`;
  return `${s.score_value} reps`;
}

export default function ProgramDetailScreen({ navigation, route }: any) {
  const { programId, programTitle, startDate, progType, durationWeeks, daysPerWeek } = route.params;
  const { user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const oneRepMaxFor = useMyOneRepMax();

  const totalWeeks = durationWeeks ?? 12;
  const dpw = daysPerWeek ?? 5;

  const [wods, setWods] = useState<ProgramWOD[]>([]);
  const [scores, setScores] = useState<Record<string, ProgramScore>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Current week derived from the athlete's start_date (day 1 = start_date).
  const currentWeek = useMemo(() => {
    if (!startDate) return 1;
    const start = new Date(startDate + 'T00:00:00');
    const days = Math.floor((Date.now() - start.getTime()) / 86400000);
    return Math.max(1, Math.floor(days / 7) + 1);
  }, [startDate]);

  const [weekIdx, setWeekIdx] = useState(0);

  // Detail modal
  const [selected, setSelected] = useState<ProgramWOD | null>(null);
  // Log modal
  const [logOpen, setLogOpen] = useState(false);
  const [logWod, setLogWod] = useState<ProgramWOD | null>(null);
  const [fScoreType, setFScoreType] = useState('reps');
  const [fMin, setFMin] = useState('');
  const [fSec, setFSec] = useState('');
  const [fValue, setFValue] = useState('');
  const [fRx, setFRx] = useState(false);
  const [fNotes, setFNotes] = useState('');
  // Charges réellement soulevées sur les blocs musculation du WOD ouvert.
  const [strengthLoads, setStrengthLoads] = useState<Record<number, string>>({});
  const [strengthEntries, setStrengthEntries] = useState<StrengthEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: wodData } = await supabase
        .from('program_wods')
        .select('*')
        .eq('program_id', programId)
        .order('day_number')
        .order('sort_order');
      const list = (wodData ?? []) as ProgramWOD[];
      setWods(list);

      if (user && list.length > 0) {
        const { data: scoreData } = await supabase
          .from('program_scores')
          .select('*')
          .eq('user_id', user.id)
          .in('program_wod_id', list.map(w => w.id));
        const map: Record<string, ProgramScore> = {};
        (scoreData ?? []).forEach((s: any) => { map[s.program_wod_id] = s as ProgramScore; });
        setScores(map);
      }
    } catch (e: any) {
      captureError(e, { screen: 'ProgramDetail', action: 'load' });
    }
    setLoading(false);
    setRefreshing(false);
  }, [programId, user]);

  useEffect(() => { load(); }, [load]);

  // Start on the athlete's current week (clamped to the program length).
  useEffect(() => {
    const target = progType === 'fixed' ? Math.min(currentWeek, totalWeeks) : currentWeek;
    setWeekIdx(target - 1);
  }, [currentWeek, progType, totalWeeks]);

  const weekStart = weekIdx * 7;
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart + i + 1);
  const wodsForDay = (dayNum: number) => wods.filter(w => w.day_number === dayNum);

  function openLog(w: ProgramWOD) {
    const existing = scores[w.id];
    setLogWod(w);
    const st = existing?.score_type ?? defaultScoreType(w.wod_type);
    setFScoreType(st);
    if (existing) {
      if (existing.score_type === 'time') {
        setFMin(String(Math.floor(existing.score_value / 60)));
        setFSec(String(existing.score_value % 60));
        setFValue('');
      } else {
        setFValue(String(existing.score_value));
        setFMin(''); setFSec('');
      }
      setFRx(existing.rx);
      setFNotes(existing.notes ?? '');
    } else {
      setFMin(''); setFSec(''); setFValue(''); setFRx(false); setFNotes('');
    }
    const entries = (w.description ?? '')
      .split('\n')
      .map(parseStrengthLine)
      .filter((e): e is StrengthEntry => e !== null);
    setStrengthEntries(entries);
    // La prescription pré-remplit ; un %1RM sans 1RM connu reste vide.
    const prefill: Record<number, string> = {};
    entries.forEach((e, i) => {
      const kg = resolveStrengthLoadKg(e, oneRepMaxFor(e.name));
      if (kg != null) prefill[i] = String(kg);
    });
    setStrengthLoads(prefill);
    setSelected(null);
    setLogOpen(true);
  }

  async function saveScore() {
    if (!logWod || !user) return;
    let value = 0;
    if (fScoreType === 'time') {
      value = (parseInt(fMin || '0') * 60) + parseInt(fSec || '0');
    } else {
      value = parseInt(fValue || '0');
    }
    if (!value || value <= 0) { Alert.alert('Score invalide', 'Renseigne ton résultat.'); return; }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('program_scores')
        .upsert({
          program_wod_id: logWod.id,
          user_id: user.id,
          score_type: fScoreType,
          score_value: value,
          rx: fRx,
          notes: fNotes.trim() || null,
        }, { onConflict: 'program_wod_id,user_id' });
      if (error) throw error;

      // Les charges réellement soulevées alimentent les 1RM.
      const performed = strengthEntries
        .map((e, i) => ({ name: e.name, loadKg: parseFloat((strengthLoads[i] ?? '').replace(',', '.')), reps: e.reps }))
        .filter(s => Number.isFinite(s.loadKg) && s.loadKg > 0);
      if (performed.length > 0) {
        const beaten = await recordStrengthPRs(performed);
        if (beaten.length > 0) {
          Alert.alert('Nouveau 1RM 🏋️', beaten
            .map(b => `${b.movement} : ${b.kg} kg${b.previousKg != null ? ` (avant ${b.previousKg} kg)` : ''}`)
            .join('\n'));
        }
      }

      setLogOpen(false);
      load();
    } catch (e: any) {
      Alert.alert('Erreur', e.message);
    }
    setSubmitting(false);
  }

  const doneCount = Object.keys(scores).length;

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle} numberOfLines={1}>{programTitle}</Text>
          <Text style={S.headerSub}>
            {progType === 'fixed' ? `${totalWeeks} semaines · ${dpw}j/sem` : `Ongoing · ${dpw}j/sem`}
            {doneCount > 0 ? ` · ${doneCount} WOD${doneCount > 1 ? 's' : ''} fait${doneCount > 1 ? 's' : ''}` : ''}
          </Text>
        </View>
      </View>

      {/* Week navigation */}
      <View style={S.weekNav}>
        <TouchableOpacity onPress={() => setWeekIdx(w => Math.max(0, w - 1))} style={S.weekArrow} disabled={weekIdx === 0}>
          <ChevronLeft color={weekIdx === 0 ? theme.textMuted : theme.text} size={20} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={S.weekLabel}>Semaine {weekIdx + 1}{progType === 'fixed' ? ` / ${totalWeeks}` : ''}</Text>
          {weekIdx + 1 === currentWeek && <Text style={S.weekNow}>Semaine en cours</Text>}
        </View>
        <TouchableOpacity
          onPress={() => setWeekIdx(w => progType === 'fixed' ? Math.min(totalWeeks - 1, w + 1) : w + 1)}
          style={S.weekArrow}
          disabled={progType === 'fixed' && weekIdx >= totalWeeks - 1}
        >
          <ChevronRight color={progType === 'fixed' && weekIdx >= totalWeeks - 1 ? theme.textMuted : theme.text} size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.accent} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {weekDays.map((dayNum, i) => {
            const dayWods = wodsForDay(dayNum);
            const isRest = dayWods.length === 0;
            return (
              <View key={dayNum} style={S.dayBlock}>
                <View style={S.dayHeader}>
                  <Text style={S.dayLabel}>{DAY_LABELS[i]} — Jour {dayNum}</Text>
                  {isRest && <Text style={S.restBadge}>Repos</Text>}
                </View>
                {dayWods.map(w => {
                  const tc = WOD_TYPE_COLORS[w.wod_type] ?? '#6B7280';
                  const score = scores[w.id];
                  return (
                    <TouchableOpacity key={w.id} style={S.wodRow} onPress={() => setSelected(w)} activeOpacity={0.7}>
                      <View style={[S.wodTypeBar, { backgroundColor: tc }]} />
                      <View style={S.wodContent}>
                        <Text style={S.wodType}>{(w.wod_type ?? 'WOD').toUpperCase()}</Text>
                        <Text style={S.wodTitle}>{w.title}</Text>
                        <Text style={S.wodDesc} numberOfLines={2}>{w.description}</Text>
                      </View>
                      {score ? (
                        <View style={S.doneChip}>
                          <Check color={theme.success} size={12} />
                          <Text style={S.doneText}>{formatScore(score)}</Text>
                        </View>
                      ) : (
                        <ChevronRight color={theme.textMuted} size={16} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* WOD detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        <View style={S.modalContainer}>
          <View style={S.modalHeader}>
            <Text style={S.modalTitle} numberOfLines={1}>{selected?.title}</Text>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={S.modalCancel}>Fermer</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={S.modalBody}>
            <View style={S.detailBadges}>
              <View style={[S.typeBadge, { backgroundColor: `${WOD_TYPE_COLORS[selected?.wod_type ?? 'custom'] ?? '#6B7280'}22` }]}>
                <Text style={[S.typeBadgeText, { color: WOD_TYPE_COLORS[selected?.wod_type ?? 'custom'] ?? '#6B7280' }]}>
                  {(selected?.wod_type ?? 'WOD').toUpperCase()}
                </Text>
              </View>
              {!!selected?.time_cap_seconds && (
                <View style={S.metaBadge}>
                  <Clock color={theme.textSecondary} size={13} />
                  <Text style={S.metaBadgeText}>Cap {formatCap(selected.time_cap_seconds)}</Text>
                </View>
              )}
            </View>

            <Text style={S.sectionLabel}>SÉANCE</Text>
            <Text style={S.detailDesc}>
              {annotateStrengthLoads(selected?.description ?? '', oneRepMaxFor)}
            </Text>

            {!!selected?.notes && (
              <>
                <View style={S.noteHeader}>
                  <StickyNote color={theme.accent} size={14} />
                  <Text style={S.sectionLabel}>NOTES COACH</Text>
                </View>
                <Text style={S.detailNotes}>{selected.notes}</Text>
              </>
            )}

            {selected && scores[selected.id] && (
              <View style={S.myScoreCard}>
                <Text style={S.myScoreLabel}>TON RÉSULTAT</Text>
                <Text style={S.myScoreValue}>
                  {formatScore(scores[selected.id])}{scores[selected.id].rx ? ' · RX' : ''}
                </Text>
              </View>
            )}

            <TouchableOpacity style={S.logBtn} onPress={() => selected && openLog(selected)} activeOpacity={0.85}>
              <Text style={S.logBtnText}>
                {selected && scores[selected.id] ? 'Modifier mon résultat' : 'Enregistrer mon résultat'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Log score modal */}
      <Modal visible={logOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLogOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={S.modalContainer}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle} numberOfLines={1}>{logWod?.title}</Text>
              <TouchableOpacity onPress={() => setLogOpen(false)}>
                <Text style={S.modalCancel}>Annuler</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={S.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={S.mLabel}>TYPE DE SCORE</Text>
              <View style={S.typeGrid}>
                {SCORE_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[S.scoreChip, fScoreType === t.value && S.scoreChipActive]}
                    onPress={() => setFScoreType(t.value)}
                  >
                    <Text style={[S.scoreChipText, fScoreType === t.value && S.scoreChipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {fScoreType === 'time' ? (
                <>
                  <Text style={S.mLabel}>TEMPS</Text>
                  <View style={S.timeRow}>
                    <TextInput style={[S.mInput, { flex: 1 }]} value={fMin} onChangeText={setFMin} keyboardType="numeric" placeholder="min" placeholderTextColor={theme.textMuted} />
                    <Text style={S.timeColon}>:</Text>
                    <TextInput style={[S.mInput, { flex: 1 }]} value={fSec} onChangeText={setFSec} keyboardType="numeric" placeholder="sec" placeholderTextColor={theme.textMuted} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={S.mLabel}>{fScoreType === 'load' ? 'CHARGE (kg)' : 'REPS'}</Text>
                  <TextInput style={S.mInput} value={fValue} onChangeText={setFValue} keyboardType="numeric" placeholder={fScoreType === 'load' ? '80' : '120'} placeholderTextColor={theme.textMuted} />
                </>
              )}

              <TouchableOpacity style={S.rxRow} onPress={() => setFRx(v => !v)} activeOpacity={0.7}>
                <View style={[S.checkbox, fRx && S.checkboxOn]}>
                  {fRx && <Check color="#fff" size={13} />}
                </View>
                <Text style={S.rxLabel}>Réalisé en RX (prescrit)</Text>
              </TouchableOpacity>

              {strengthEntries.length > 0 && (
                <>
                  <Text style={S.mLabel}>CHARGES RÉALISÉES (MUSCULATION)</Text>
                  {strengthEntries.map((e, i) => (
                    <View key={i} style={S.strengthRow}>
                      <Text style={S.strengthName} numberOfLines={1}>{e.name} · {e.sets} × {e.reps}</Text>
                      <TextInput
                        style={[S.mInput, S.strengthInput]}
                        value={strengthLoads[i] ?? ''}
                        onChangeText={txt => setStrengthLoads(prev => ({ ...prev, [i]: txt }))}
                        keyboardType="decimal-pad"
                        placeholder="kg"
                        placeholderTextColor={theme.textMuted}
                      />
                    </View>
                  ))}
                  <Text style={S.strengthHint}>La série la plus lourde met à jour ton 1RM si elle le dépasse.</Text>
                </>
              )}

              <Text style={S.mLabel}>NOTES</Text>
              <TextInput style={[S.mInput, { minHeight: 70, textAlignVertical: 'top' }]} value={fNotes} onChangeText={setFNotes} placeholder="Ressenti, scaling…" placeholderTextColor={theme.textMuted} multiline />

              <TouchableOpacity
                style={[S.saveBtn, submitting && S.saveBtnDisabled]}
                onPress={saveScore}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={S.saveBtnText}>Enregistrer</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
    back: { padding: 4, marginRight: 8 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: t.text },
    headerSub: { fontSize: 12, color: t.textSecondary, marginTop: 2 },

    weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
    weekArrow: { padding: 6 },
    weekLabel: { fontSize: 16, fontWeight: '700', color: t.text },
    weekNow: { fontSize: 11, color: t.accent, fontWeight: '700', marginTop: 1 },

    dayBlock: { marginBottom: 2 },
    dayHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
    dayLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: t.text },
    restBadge: { fontSize: 11, color: t.textMuted, fontWeight: '700', backgroundColor: t.surface, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },

    wodRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border, backgroundColor: t.background },
    wodTypeBar: { width: 3, height: '80%', minHeight: 30, borderRadius: 2, marginRight: 10 },
    wodContent: { flex: 1 },
    wodType: { fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 0.5 },
    wodTitle: { fontSize: 14, fontWeight: '700', color: t.text, marginTop: 1 },
    wodDesc: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
    doneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${t.success}18`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginLeft: 8 },
    doneText: { fontSize: 12, fontWeight: '700', color: t.success },

    modalContainer: { flex: 1, backgroundColor: t.background },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20, borderBottomWidth: 1, borderBottomColor: t.border, gap: 12 },
    modalTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: t.text },
    modalCancel: { fontSize: 15, color: t.accent, fontWeight: '600' },
    modalBody: { padding: 16, paddingBottom: 60 },

    detailBadges: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    typeBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    typeBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
    metaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    metaBadgeText: { fontSize: 12, fontWeight: '600', color: t.textSecondary },

    sectionLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted, letterSpacing: 0.5, marginBottom: 6 },
    detailDesc: { fontSize: 15, color: t.text, lineHeight: 22, marginBottom: 16 },
    noteHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    detailNotes: { fontSize: 14, color: t.textSecondary, lineHeight: 20, marginBottom: 16, fontStyle: 'italic' },

    myScoreCard: { backgroundColor: `${t.success}12`, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: `${t.success}30` },
    myScoreLabel: { fontSize: 11, fontWeight: '700', color: t.success, letterSpacing: 0.5 },
    myScoreValue: { fontSize: 20, fontWeight: '800', color: t.text, marginTop: 2 },

    logBtn: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    logBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

    mLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted, letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
    strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    strengthName: { flex: 1, fontSize: 13, color: t.textSecondary },
    strengthInput: { width: 90, textAlign: 'center' },
    strengthHint: { fontSize: 11, color: t.textMuted, marginTop: 6 },
    mInput: { backgroundColor: t.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: t.text, fontSize: 15, borderWidth: 1, borderColor: t.border },

    typeGrid: { flexDirection: 'row', gap: 8 },
    scoreChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: t.border },
    scoreChipActive: { borderColor: t.accent, backgroundColor: t.accent },
    scoreChipText: { fontSize: 13, fontWeight: '700', color: t.textSecondary },
    scoreChipTextActive: { color: '#fff' },

    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeColon: { fontSize: 20, fontWeight: '800', color: t.text },

    rxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    checkboxOn: { backgroundColor: t.accent, borderColor: t.accent },
    rxLabel: { fontSize: 14, fontWeight: '600', color: t.text },

    saveBtn: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
