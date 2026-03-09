import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  Modal, TextInput, ActivityIndicator, Alert, RefreshControl,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import {
  Plus, ChevronLeft, ChevronRight, Trophy, MapPin, Calendar,
  Video, Clock, Zap, Settings, X, Check, Play,
} from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { CompetitionStackParamList, TimerType } from '../../navigation';

type Nav = NativeStackNavigationProp<CompetitionStackParamList, 'PhysicalCompetition'>;

interface PhysWOD {
  id: string;
  name: string;
  description: string;
  timer_type: TimerType;
  total_seconds: number;
  max_time: number;
  interval_seconds: number;
  rounds: number;
  work_time: number;
  rest_time: number;
  with_camera: boolean;
  order_index: number;
}

interface PhysComp {
  id: string;
  name: string;
  date: string;
  location: string;
  description: string;
  status: 'open' | 'active' | 'closed';
  created_by: string;
  wods?: PhysWOD[];
}

const TIMER_TYPES: { key: TimerType; label: string }[] = [
  { key: 'for-time', label: 'For Time' },
  { key: 'amrap',    label: 'AMRAP' },
  { key: 'emom',     label: 'EMOM' },
  { key: 'tabata',   label: 'Tabata' },
];

const STATUS_COLORS: Record<string, string> = {
  open:   '#10B981',
  active: '#F59E0B',
  closed: '#6B7280',
};

export default function PhysicalCompetitionScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const S = createStyles(theme);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'box_owner';

  const [competitions, setCompetitions] = useState<PhysComp[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [selected,     setSelected]     = useState<PhysComp | null>(null);

  // Create competition modal
  const [createModal,  setCreateModal]  = useState(false);
  const [compName,     setCompName]     = useState('');
  const [compDate,     setCompDate]     = useState('');
  const [compLoc,      setCompLoc]      = useState('');
  const [compDesc,     setCompDesc]     = useState('');
  const [saving,       setSaving]       = useState(false);

  // Create WOD modal
  const [wodModal,     setWodModal]     = useState(false);
  const [wodName,      setWodName]      = useState('');
  const [wodDesc,      setWodDesc]      = useState('');
  const [wodTimer,     setWodTimer]     = useState<TimerType>('for-time');
  const [wodDurMin,    setWodDurMin]    = useState('15');
  const [wodRounds,    setWodRounds]    = useState('3');
  const [wodWork,      setWodWork]      = useState('40');
  const [wodRest,      setWodRest]      = useState('20');
  const [wodCamera,    setWodCamera]    = useState(true);
  const [savingWod,    setSavingWod]    = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('physical_competitions')
      .select('*')
      .order('date', { ascending: true });
    setCompetitions((data ?? []) as PhysComp[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadWods = useCallback(async (comp: PhysComp) => {
    const { data } = await supabase
      .from('physical_wods')
      .select('*')
      .eq('competition_id', comp.id)
      .order('order_index', { ascending: true });
    const updated = { ...comp, wods: (data ?? []) as PhysWOD[] };
    setSelected(updated);
  }, []);

  async function createCompetition() {
    if (!compName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('physical_competitions').insert({
      name: compName.trim(),
      date: compDate.trim() || new Date().toISOString().slice(0, 10),
      location: compLoc.trim(),
      description: compDesc.trim(),
      status: 'open',
      created_by: user?.id,
    }).select().single();
    setSaving(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setCreateModal(false);
    setCompName(''); setCompDate(''); setCompLoc(''); setCompDesc('');
    load();
  }

  async function createWod() {
    if (!wodName.trim() || !selected) return;
    setSavingWod(true);
    const dur = parseInt(wodDurMin) || 15;
    const rnd = parseInt(wodRounds) || 3;
    const wk  = parseInt(wodWork) || 40;
    const rst = parseInt(wodRest) || 20;
    const { error } = await supabase.from('physical_wods').insert({
      competition_id:   selected.id,
      name:             wodName.trim(),
      description:      wodDesc.trim(),
      timer_type:       wodTimer,
      total_seconds:    dur * 60,
      max_time:         wodTimer === 'for-time' ? dur * 60 : 0,
      interval_seconds: wodTimer === 'emom' ? 60 : 0,
      rounds:           rnd,
      work_time:        wk,
      rest_time:        rst,
      with_camera:      wodCamera,
      order_index:      (selected.wods?.length ?? 0) + 1,
    });
    setSavingWod(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setWodModal(false);
    setWodName(''); setWodDesc(''); setWodTimer('for-time');
    setWodDurMin('15'); setWodRounds('3'); setWodWork('40'); setWodRest('20'); setWodCamera(true);
    loadWods(selected);
  }

  function launchWOD(wod: PhysWOD) {
    const dur = wod.total_seconds || 900;
    const params = {
      timerType:    wod.timer_type,
      countdown:    10,
      totalSeconds: wod.timer_type === 'amrap' ? dur : 0,
      maxTime:      wod.timer_type === 'for-time' ? (wod.max_time || dur) : 0,
      interval:     wod.timer_type === 'emom' ? Math.max(1, Math.floor((wod.interval_seconds || 60) / 60)) : 0,
      rounds:       wod.rounds || 3,
      workTime:     wod.work_time || 40,
      restTime:     wod.rest_time || 20,
      withCamera:   wod.with_camera,
      sequence:     '[]',
      videoTitle:   wod.name,
      withTimestamp: true,
    };
    navigation.navigate('TimerRun', params);
  }

  // ── Detail view (selected competition)
  if (selected) {
    return (
      <View style={S.container}>
        <View style={S.header}>
          <TouchableOpacity onPress={() => setSelected(null)} style={S.backBtn} activeOpacity={0.7}>
            <ChevronLeft color={theme.text} size={24} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={S.headerTitle} numberOfLines={1}>{selected.name}</Text>
            <View style={S.metaRow}>
              {selected.location ? <><MapPin color={theme.textMuted} size={12} /><Text style={S.metaTxt}>{selected.location}</Text></> : null}
              {selected.date ? <><Calendar color={theme.textMuted} size={12} /><Text style={S.metaTxt}>{selected.date}</Text></> : null}
            </View>
          </View>
          {isAdmin && (
            <TouchableOpacity onPress={() => setWodModal(true)} style={S.addBtn} activeOpacity={0.8}>
              <Plus color="#fff" size={18} />
            </TouchableOpacity>
          )}
        </View>

        {selected.description ? (
          <View style={S.descBox}>
            <Text style={S.descText}>{selected.description}</Text>
          </View>
        ) : null}

        <FlatList
          data={selected.wods ?? []}
          keyExtractor={w => w.id}
          contentContainerStyle={S.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.emptyBox}>
              <Text style={S.emptyEmoji}>🏋️</Text>
              <Text style={S.emptyText}>
                {isAdmin ? 'Appuie sur + pour ajouter un WOD.' : 'Aucun WOD configuré pour cette compétition.'}
              </Text>
            </View>
          }
          renderItem={({ item: wod, index }) => (
            <View style={S.wodCard}>
              <View style={S.wodTop}>
                <View style={S.wodIndexCircle}>
                  <Text style={S.wodIndexText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.wodName}>{wod.name}</Text>
                  {wod.description ? <Text style={S.wodDescText} numberOfLines={2}>{wod.description}</Text> : null}
                </View>
              </View>
              <View style={S.wodMeta}>
                <View style={[S.timerBadge, { backgroundColor: `${theme.accent}20` }]}>
                  <Clock color={theme.accent} size={11} />
                  <Text style={[S.timerBadgeTxt, { color: theme.accent }]}>
                    {TIMER_TYPES.find(t => t.key === wod.timer_type)?.label ?? wod.timer_type}
                    {' · '}
                    {Math.round((wod.total_seconds || 0) / 60)} min
                  </Text>
                </View>
                {wod.with_camera && (
                  <View style={[S.timerBadge, { backgroundColor: '#EF444420' }]}>
                    <Video color="#EF4444" size={11} />
                    <Text style={[S.timerBadgeTxt, { color: '#EF4444' }]}>Caméra</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={S.launchBtn} onPress={() => launchWOD(wod)} activeOpacity={0.85}>
                <Play color="#fff" size={15} />
                <Text style={S.launchBtnTxt}>LANCER CE WOD</Text>
              </TouchableOpacity>
            </View>
          )}
        />

        {/* Add WOD Modal */}
        <Modal visible={wodModal} animationType="slide" transparent onRequestClose={() => setWodModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.modalOverlay}>
            <View style={S.sheet}>
              <View style={S.sheetHandle} />
              <View style={S.sheetHeader}>
                <Text style={S.sheetTitle}>Nouveau WOD</Text>
                <TouchableOpacity onPress={() => setWodModal(false)} activeOpacity={0.7}><X color={theme.textMuted} size={22} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={S.inputLabel}>NOM DU WOD</Text>
                <TextInput style={S.input} placeholder="ex: WOD 1 — Fran" placeholderTextColor={theme.textMuted} value={wodName} onChangeText={setWodName} />

                <Text style={S.inputLabel}>DESCRIPTION / MOUVEMENTS</Text>
                <TextInput style={[S.input, S.inputMulti]} placeholder="ex: 21-15-9 Thrusters 43kg / Pull-ups" placeholderTextColor={theme.textMuted} value={wodDesc} onChangeText={setWodDesc} multiline numberOfLines={3} />

                <Text style={S.inputLabel}>TYPE DE TIMER</Text>
                <View style={S.timerGrid}>
                  {TIMER_TYPES.map(t => (
                    <TouchableOpacity key={t.key} onPress={() => setWodTimer(t.key)} activeOpacity={0.8}
                      style={[S.timerChip, wodTimer === t.key && S.timerChipSel]}>
                      <Text style={[S.timerChipTxt, wodTimer === t.key && S.timerChipTxtSel]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={S.inputLabel}>DURÉE (minutes)</Text>
                <TextInput style={S.input} placeholder="15" placeholderTextColor={theme.textMuted} value={wodDurMin} onChangeText={setWodDurMin} keyboardType="number-pad" />

                {(wodTimer === 'tabata' || wodTimer === 'emom') && (<>
                  <Text style={S.inputLabel}>ROUNDS</Text>
                  <TextInput style={S.input} placeholder="3" placeholderTextColor={theme.textMuted} value={wodRounds} onChangeText={setWodRounds} keyboardType="number-pad" />
                </>)}

                {wodTimer === 'tabata' && (<>
                  <Text style={S.inputLabel}>TRAVAIL (secondes)</Text>
                  <TextInput style={S.input} placeholder="40" placeholderTextColor={theme.textMuted} value={wodWork} onChangeText={setWodWork} keyboardType="number-pad" />
                  <Text style={S.inputLabel}>REPOS (secondes)</Text>
                  <TextInput style={S.input} placeholder="20" placeholderTextColor={theme.textMuted} value={wodRest} onChangeText={setWodRest} keyboardType="number-pad" />
                </>)}

                <View style={S.switchRow}>
                  <View style={S.switchLeft}>
                    <Video color={theme.accent} size={18} />
                    <View>
                      <Text style={S.switchLabel}>Caméra pré-configurée</Text>
                      <Text style={S.switchSub}>L'athlète démarre l'enregistrement automatiquement</Text>
                    </View>
                  </View>
                  <Switch
                    value={wodCamera}
                    onValueChange={setWodCamera}
                    trackColor={{ true: theme.accent, false: theme.border }}
                    thumbColor="#fff"
                  />
                </View>

                <TouchableOpacity style={[S.saveBtn, (!wodName.trim() || savingWod) && { opacity: 0.5 }]}
                  onPress={createWod} disabled={!wodName.trim() || savingWod} activeOpacity={0.85}>
                  {savingWod ? <ActivityIndicator color="#fff" /> : <><Check color="#fff" size={16} /><Text style={S.saveBtnTxt}>AJOUTER CE WOD</Text></>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  // ── List view
  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn} activeOpacity={0.7}>
          <ChevronLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>Compétitions Physiques</Text>
          <Text style={S.headerSub}>Événements · Performances · Podium</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity onPress={() => setCreateModal(true)} style={S.addBtn} activeOpacity={0.8}>
            <Plus color="#fff" size={18} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={S.center}><ActivityIndicator size="large" color={theme.accent} /></View>
      ) : (
        <FlatList
          data={competitions}
          keyExtractor={c => c.id}
          contentContainerStyle={S.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={S.emptyBox}>
              <Text style={S.emptyEmoji}>🏆</Text>
              <Text style={S.emptyText}>
                {isAdmin ? 'Crée ta première compétition avec le bouton +.' : 'Aucune compétition physique disponible.'}
              </Text>
            </View>
          }
          renderItem={({ item: comp }) => (
            <TouchableOpacity style={S.compCard} onPress={() => loadWods(comp)} activeOpacity={0.8}>
              <View style={S.compTop}>
                <Text style={S.compName}>{comp.name}</Text>
                <View style={[S.statusBadge, { backgroundColor: `${STATUS_COLORS[comp.status]}20` }]}>
                  <Text style={[S.statusTxt, { color: STATUS_COLORS[comp.status] }]}>
                    {comp.status === 'open' ? '🟢 Ouvert' : comp.status === 'active' ? '🔴 Live' : '⚫ Fermé'}
                  </Text>
                </View>
              </View>
              {comp.description ? <Text style={S.compDesc} numberOfLines={2}>{comp.description}</Text> : null}
              <View style={S.compMeta}>
                {comp.location ? <View style={S.metaPill}><MapPin color={theme.textMuted} size={12} /><Text style={S.metaTxt}>{comp.location}</Text></View> : null}
                {comp.date ? <View style={S.metaPill}><Calendar color={theme.textMuted} size={12} /><Text style={S.metaTxt}>{comp.date}</Text></View> : null}
              </View>
              <View style={S.compFooter}>
                <View style={S.metaPill}>
                  <Zap color={theme.accent} size={12} />
                  <Text style={[S.metaTxt, { color: theme.accent }]}>Voir les WODs</Text>
                </View>
                <ChevronRight color={theme.textMuted} size={16} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Create competition modal */}
      <Modal visible={createModal} animationType="slide" transparent onRequestClose={() => setCreateModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.modalOverlay}>
          <View style={S.sheet}>
            <View style={S.sheetHandle} />
            <View style={S.sheetHeader}>
              <Text style={S.sheetTitle}>Nouvelle compétition</Text>
              <TouchableOpacity onPress={() => setCreateModal(false)} activeOpacity={0.7}><X color={theme.textMuted} size={22} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={S.inputLabel}>NOM DE LA COMPÉTITION *</Text>
              <TextInput style={S.input} placeholder="ex: Open NBS 2025" placeholderTextColor={theme.textMuted} value={compName} onChangeText={setCompName} />

              <Text style={S.inputLabel}>DATE</Text>
              <TextInput style={S.input} placeholder="ex: 2025-06-15" placeholderTextColor={theme.textMuted} value={compDate} onChangeText={setCompDate} />

              <Text style={S.inputLabel}>LIEU</Text>
              <TextInput style={S.input} placeholder="ex: CrossFit NBS, Paris" placeholderTextColor={theme.textMuted} value={compLoc} onChangeText={setCompLoc} />

              <Text style={S.inputLabel}>DESCRIPTION</Text>
              <TextInput style={[S.input, S.inputMulti]} placeholder="ex: Compétition annuelle open, 3 WODs chronométrés…" placeholderTextColor={theme.textMuted} value={compDesc} onChangeText={setCompDesc} multiline numberOfLines={3} />

              <TouchableOpacity style={[S.saveBtn, (!compName.trim() || saving) && { opacity: 0.5 }]}
                onPress={createCompetition} disabled={!compName.trim() || saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color="#fff" /> : <><Check color="#fff" size={16} /><Text style={S.saveBtnTxt}>CRÉER LA COMPÉTITION</Text></>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
      paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
      flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    backBtn:     { padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
    headerSub:   { fontSize: 11, color: theme.textMuted, marginTop: 1 },
    addBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center',
    },
    descBox: { backgroundColor: `${theme.accent}10`, margin: 16, borderRadius: 10, padding: 12 },
    descText: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
    list: { padding: 16, gap: 12, paddingBottom: 40 },
    emptyBox:  { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyEmoji:{ fontSize: 40 },
    emptyText: { fontSize: 14, color: theme.textMuted, textAlign: 'center', paddingHorizontal: 32 },
    compCard: {
      backgroundColor: theme.card, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: theme.border, gap: 10,
    },
    compTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    compName:  { fontSize: 16, fontWeight: '900', color: theme.text, flex: 1, marginRight: 8 },
    compDesc:  { fontSize: 12, color: theme.textSecondary, lineHeight: 17 },
    compMeta:  { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    compFooter:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
    statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    statusTxt:   { fontSize: 11, fontWeight: '700' },
    metaPill:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
    metaTxt:     { fontSize: 11, color: theme.textMuted },
    wodCard: {
      backgroundColor: theme.card, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: theme.border, gap: 10,
    },
    wodTop:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    wodIndexCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: `${theme.accent}20`, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    wodIndexText:   { fontSize: 14, fontWeight: '900', color: theme.accent },
    wodName:        { fontSize: 15, fontWeight: '800', color: theme.text },
    wodDescText:    { fontSize: 12, color: theme.textSecondary, marginTop: 3, lineHeight: 17 },
    wodMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    timerBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    timerBadgeTxt: { fontSize: 11, fontWeight: '700' },
    launchBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: theme.accent, borderRadius: 12, padding: 13,
    },
    launchBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, paddingBottom: 40, maxHeight: '90%',
    },
    sheetHandle: { width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    sheetTitle:  { fontSize: 18, fontWeight: '900', color: theme.text },
    inputLabel:  { fontSize: 10, fontWeight: '800', color: theme.textMuted, letterSpacing: 1.2, marginBottom: 6, marginTop: 14 },
    input: {
      backgroundColor: theme.surface, borderRadius: 10, padding: 13,
      fontSize: 14, color: theme.text, borderWidth: 1, borderColor: theme.border,
    },
    inputMulti: { minHeight: 80, textAlignVertical: 'top' },
    timerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    timerChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
    timerChipSel: { backgroundColor: `${theme.accent}15`, borderColor: theme.accent },
    timerChipTxt: { fontSize: 13, fontWeight: '700', color: theme.textMuted },
    timerChipTxtSel: { color: theme.accent, fontWeight: '900' },
    switchRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: theme.surface, borderRadius: 12, padding: 14, marginTop: 14,
      borderWidth: 1, borderColor: theme.border,
    },
    switchLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    switchLabel: { fontSize: 14, fontWeight: '700', color: theme.text },
    switchSub:   { fontSize: 11, color: theme.textMuted, marginTop: 2, maxWidth: 220 },
    saveBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: theme.accent, borderRadius: 14, padding: 16, marginTop: 20,
    },
    saveBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  });
}
