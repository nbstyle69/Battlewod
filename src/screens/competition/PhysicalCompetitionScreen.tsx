import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, RefreshControl, Image, Linking, TextInput, Share,
} from 'react-native';
import {
  ChevronLeft, ChevronRight, MapPin, Calendar,
  Video, Clock, Zap, Play, ExternalLink, Info, DollarSign, Search, Share2, Users, Filter,
} from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { CompetitionStackParamList, TimerType } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';
import { useTranslation } from 'react-i18next';

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
  start_date: string | null;
  end_date: string | null;
  location: string;
  description: string;
  status: 'open' | 'active' | 'closed';
  mode: 'qualification' | 'info';
  logo_url: string | null;
  registration_url: string | null;
  format: string;
  price: string | null;
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

const MODE_COLORS: Record<string, string> = {
  qualification: '#8B5CF6',
  info:          '#3B82F6',
};

export default function PhysicalCompetitionScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<CompetitionStackParamList, 'PhysicalCompetition'>>();
  const modeFilter = route.params.mode;
  const selectedId = (route.params as any).selectedId as string | undefined;
  const S = createStyles(theme);

  const [competitions, setCompetitions] = useState<PhysComp[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [selected,     setSelected]     = useState<PhysComp | null>(null);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [filterFormat,  setFilterFormat]  = useState<'all' | 'individual' | 'team'>('all');
  const [filterPrice,   setFilterPrice]   = useState(false);
  const autoOpenedRef = useRef(false);

  const load = useCallback(async () => {
    try {
    const { data } = await supabase
      .from('physical_competitions')
      .select('*')
      .order('date', { ascending: true });
    const list = (data ?? []) as PhysComp[];
    setCompetitions(list);

    // Auto-open a specific competition if selectedId is provided
    if (selectedId && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      const target = list.find(c => c.id === selectedId);
      if (target) {
        const { data: wData } = await supabase
          .from('physical_wods')
          .select('*')
          .eq('competition_id', target.id)
          .order('order_index', { ascending: true });
        setSelected({ ...target, wods: (wData ?? []) as PhysWOD[] });
      }
    }
    } catch (e) { captureError(e, { screen: 'PhysicalCompetition', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [selectedId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadWods = useCallback(async (comp: PhysComp) => {
    try {
    const { data } = await supabase
      .from('physical_wods')
      .select('*')
      .eq('competition_id', comp.id)
      .order('order_index', { ascending: true });
    const updated = { ...comp, wods: (data ?? []) as PhysWOD[] };
    setSelected(updated);
    } catch (e) { captureError(e, { screen: 'PhysicalCompetition', action: 'loadWods' }); }
  }, []);

  function launchWOD(wod: PhysWOD, comp: PhysComp) {
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
      competitionLogoUrl: comp.mode === 'qualification' ? (comp.logo_url || undefined) : undefined,
    };
    navigation.navigate('TimerRun', params);
  }

  function openURL(url: string) {
    Linking.openURL(url).catch(e => captureError(e, { action: 'openURL' }));
  }

  // ── Detail view (selected competition)
  if (selected) {
    const isQualif = selected.mode === 'qualification';
    const modeColor = MODE_COLORS[selected.mode] ?? theme.accent;

    return (
      <View style={S.container}>
      <GlassBackground />
        <View style={S.header}>
          <TouchableOpacity onPress={() => setSelected(null)} style={S.backBtn} activeOpacity={0.7}>
            <ChevronLeft color={theme.text} size={24} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={S.headerTitle} numberOfLines={1}>{selected.name}</Text>
            <View style={S.metaRow}>
              {selected.location ? <><MapPin color={theme.textMuted} size={12} /><Text style={S.metaTxt}>{selected.location}</Text></> : null}
              {selected.mode === 'qualification' && selected.start_date ? (
                <><Calendar color={theme.textMuted} size={12} /><Text style={S.metaTxt}>{selected.start_date}{selected.end_date ? ` → ${selected.end_date}` : ''}</Text></>
              ) : selected.date ? (
                <><Calendar color={theme.textMuted} size={12} /><Text style={S.metaTxt}>{selected.date}</Text></>
              ) : null}
            </View>
          </View>
          <TouchableOpacity onPress={() => Share.share({ message: t('phys.shareMessage', { name: selected.name, id: selected.id }) })} style={{ padding: 4 }}>
            <Share2 color={theme.text} size={20} />
          </TouchableOpacity>
          {selected.logo_url ? (
            <Image source={{ uri: selected.logo_url }} style={S.headerLogo} />
          ) : null}
        </View>

        {/* Mode + Format badges */}
        <View style={S.badgeRow}>
          <View style={[S.modeBadge, { backgroundColor: `${modeColor}20` }]}>
            {isQualif ? <Zap color={modeColor} size={11} /> : <Info color={modeColor} size={11} />}
            <Text style={[S.modeBadgeTxt, { color: modeColor }]}>
              {isQualif ? t('phys.qualifBadge') : t('phys.noQualifBadge')}
            </Text>
          </View>
          <View style={[S.modeBadge, { backgroundColor: `${theme.textMuted}15` }]}>
            <Text style={[S.modeBadgeTxt, { color: theme.textMuted }]}>
              {selected.format === 'team' ? t('phys.team') : t('phys.individual')}
            </Text>
          </View>
          {selected.price ? (
            <View style={[S.modeBadge, { backgroundColor: '#F59E0B20' }]}>
              <DollarSign color="#F59E0B" size={11} />
              <Text style={[S.modeBadgeTxt, { color: '#F59E0B' }]}>{selected.price}</Text>
            </View>
          ) : null}
        </View>

        {selected.description ? (
          <View style={[S.descBox, { borderLeftColor: modeColor }]}>
            <Text style={S.descText}>{selected.description}</Text>
          </View>
        ) : null}

        {/* Registration URL button */}
        {selected.registration_url ? (
          <TouchableOpacity
            style={[S.registerBtn, { backgroundColor: modeColor }]}
            onPress={() => openURL(selected.registration_url!)}
            activeOpacity={0.85}
          >
            <ExternalLink color="#fff" size={16} />
            <Text style={S.registerBtnTxt}>{t('phys.registerEvent')}</Text>
          </TouchableOpacity>
        ) : null}

        <FlatList
          data={selected.wods ?? []}
          keyExtractor={w => w.id}
          contentContainerStyle={S.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={S.emptyBox}>
              <Text style={S.emptyEmoji}>{isQualif ? '🏋️' : '📋'}</Text>
              <Text style={S.emptyText}>
                {isQualif ? t('phys.wodsSoon') : t('phys.noWod')}
              </Text>
            </View>
          }
          renderItem={({ item: wod, index }) => (
            <View style={S.wodCard}>
              <View style={S.wodTop}>
                <View style={[S.wodIndexCircle, { backgroundColor: `${modeColor}20` }]}>
                  <Text style={[S.wodIndexText, { color: modeColor }]}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.wodName}>{wod.name}</Text>
                  {wod.description ? <Text style={S.wodDescText}>{wod.description}</Text> : null}
                </View>
              </View>
              <View style={S.wodMeta}>
                <View style={[S.timerBadge, { backgroundColor: `${modeColor}20` }]}>
                  <Clock color={modeColor} size={11} />
                  <Text style={[S.timerBadgeTxt, { color: modeColor }]}>
                    {TIMER_TYPES.find(tt => tt.key === wod.timer_type)?.label ?? wod.timer_type}
                    {' · '}
                    {t('phys.minutes', { n: Math.round((wod.total_seconds || 0) / 60) })}
                  </Text>
                </View>
                {wod.with_camera && (
                  <View style={[S.timerBadge, { backgroundColor: '#EF444420' }]}>
                    <Video color="#EF4444" size={11} />
                    <Text style={[S.timerBadgeTxt, { color: '#EF4444' }]}>{t('phys.camera')}</Text>
                  </View>
                )}
              </View>
              {isQualif && (() => {
                const now = new Date().toISOString().slice(0, 10);
                const before = selected.start_date && now < selected.start_date;
                const after = selected.end_date && now > selected.end_date;
                const outsidePeriod = before || after;
                return outsidePeriod ? (
                  <View style={[S.launchBtn, { backgroundColor: theme.textMuted + '30' }]}>
                    <Clock color={theme.textMuted} size={15} />
                    <Text style={[S.launchBtnTxt, { color: theme.textMuted }]}>
                      {before ? t('phys.availableOn', { date: selected.start_date }) : t('phys.periodEnded')}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity style={[S.launchBtn, { backgroundColor: modeColor }]} onPress={() => launchWOD(wod, selected)} activeOpacity={0.85}>
                    <Play color="#fff" size={15} />
                    <Text style={S.launchBtnTxt}>{t('phys.launchWod')}</Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          )}
        />
      </View>
    );
  }

  const query = searchQuery.trim().toLowerCase();
  const filteredComps = competitions
    .filter(c => c.mode === modeFilter)
    .filter(c => !query || c.name.toLowerCase().includes(query)
      || (c.location && c.location.toLowerCase().includes(query))
      || (c.description && c.description.toLowerCase().includes(query)))
    .filter(c => {
      if (filterFormat === 'individual') return c.format === 'individual' || c.format === 'both' || (c as any).has_individual;
      if (filterFormat === 'team') return c.format === 'team' || c.format === 'both' || (c as any).has_team;
      return true;
    })
    .filter(c => !filterPrice || (c.price && c.price.trim() !== ''));

  // ── Filtered list view
  const isQualifList = modeFilter === 'qualification';

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn} activeOpacity={0.7}>
          <ChevronLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>
            {isQualifList ? t('phys.qualifTitle') : t('phys.noQualifTitle')}
          </Text>
          <Text style={S.headerSub}>
            {isQualifList ? t('phys.qualifSub') : t('phys.noQualifSub')}
          </Text>
        </View>
      </View>

      <View style={S.searchBar}>
        <Search color={theme.textMuted} size={16} />
        <TextInput
          style={S.searchInput}
          placeholder={t('phys.searchPlaceholder')}
          placeholderTextColor={theme.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
      </View>

      <View style={S.filterRow}>
        {[
          { key: 'all',        label: t('phys.filterAll') },
          { key: 'individual', label: t('phys.individual') },
          { key: 'team',       label: t('phys.team') },
        ].map(f => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilterFormat(f.key as any)}
            style={[S.filterChip, filterFormat === f.key && S.filterChipActive]}
            activeOpacity={0.7}
          >
            <Text style={[S.filterChipTxt, filterFormat === f.key && S.filterChipTxtActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => setFilterPrice(v => !v)}
          style={[S.filterChip, filterPrice && S.filterChipActive]}
          activeOpacity={0.7}
        >
          <DollarSign size={12} color={filterPrice ? '#fff' : theme.textMuted} />
          <Text style={[S.filterChipTxt, filterPrice && S.filterChipTxtActive]}>{t('phys.filterPrice')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={S.center}><ActivityIndicator size="large" color={theme.accent} /></View>
      ) : (
        <FlatList
          data={filteredComps}
          keyExtractor={c => c.id}
          contentContainerStyle={S.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={S.emptyBox}>
              <Text style={S.emptyEmoji}>{isQualifList ? '�️' : '📋'}</Text>
              <Text style={S.emptyText}>
                {isQualifList
                  ? t('phys.emptyQualif')
                  : t('phys.emptyInfo')}
              </Text>
            </View>
          }
          renderItem={({ item: comp }) => {
            const modeColor = MODE_COLORS[comp.mode] ?? theme.accent;
            return (
              <TouchableOpacity style={S.compCard} onPress={() => loadWods(comp)} activeOpacity={0.8}>
                <View style={S.compTop}>
                  {comp.logo_url ? (
                    <Image source={{ uri: comp.logo_url }} style={S.compLogo} />
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={S.compName}>{comp.name}</Text>
                    <View style={[S.compBadges]}>
                      <View style={[S.statusBadge, { backgroundColor: `${STATUS_COLORS[comp.status]}20` }]}>
                        <Text style={[S.statusTxt, { color: STATUS_COLORS[comp.status] }]}>
                          {comp.status === 'open' ? t('phys.statusOpen') : comp.status === 'active' ? t('phys.statusLive') : t('phys.statusClosed')}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                {comp.description ? <Text style={S.compDesc} numberOfLines={2}>{comp.description}</Text> : null}
                <View style={S.compMeta}>
                  {comp.location ? <View style={S.metaPill}><MapPin color={theme.textMuted} size={12} /><Text style={S.metaTxt}>{comp.location}</Text></View> : null}
                  {comp.date ? <View style={S.metaPill}><Calendar color={theme.textMuted} size={12} /><Text style={S.metaTxt}>{comp.date}</Text></View> : null}
                  {comp.price ? <View style={S.metaPill}><DollarSign color="#F59E0B" size={12} /><Text style={[S.metaTxt, { color: '#F59E0B' }]}>{comp.price}</Text></View> : null}
                </View>
                <View style={S.compFooter}>
                  <View style={S.metaPill}>
                    {comp.logo_url ? (
                      <Image source={{ uri: comp.logo_url }} style={{ width: 20, height: 20, borderRadius: 5 }} />
                    ) : (
                      <Zap color={modeColor} size={12} />
                    )}
                    <Text style={[S.metaTxt, { color: modeColor }]}>
                      {isQualifList ? t('phys.seeWods') : t('phys.seeDetails')}
                    </Text>
                  </View>
                  <ChevronRight color={theme.textMuted} size={16} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
      paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
      flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    backBtn:     { padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
    headerSub:   { fontSize: 11, color: theme.textMuted, marginTop: 1 },
    headerLogo:  { width: 40, height: 40, borderRadius: 10 },
    badgeRow:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 12 },
    modeBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    modeBadgeTxt:{ fontSize: 11, fontWeight: '700' },
    descBox: { backgroundColor: `${theme.accent}10`, marginHorizontal: 16, marginTop: 12, borderRadius: 10, padding: 12, borderLeftWidth: 3 },
    descText: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
    registerBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 14,
    },
    registerBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
    list: { padding: 16, gap: 12, paddingBottom: 140 },
    emptyBox:  { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyEmoji:{ fontSize: 40 },
    emptyText: { fontSize: 14, color: theme.textMuted, textAlign: 'center', paddingHorizontal: 32 },
    compCard: {
      backgroundColor: theme.card, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: theme.border, gap: 10,
    },
    compTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    compLogo: { width: 44, height: 44, borderRadius: 10 },
    compName:  { fontSize: 16, fontWeight: '900', color: theme.text, marginBottom: 4 },
    compBadges:{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
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
    wodIndexCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    wodIndexText:   { fontSize: 14, fontWeight: '900' },
    wodName:        { fontSize: 15, fontWeight: '800', color: theme.text },
    wodDescText:    { fontSize: 12, color: theme.textSecondary, marginTop: 3, lineHeight: 17 },
    wodMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    timerBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    timerBadgeTxt: { fontSize: 11, fontWeight: '700' },
    launchBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: 12, padding: 13,
    },
    launchBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12, marginBottom: 4,
      backgroundColor: theme.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
      borderWidth: 1, borderColor: theme.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: theme.text, padding: 0 },
    filterRow: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 10, marginBottom: 4, flexWrap: 'wrap',
    },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
      borderWidth: 1, borderColor: theme.border,
    },
    filterChipActive: {
      backgroundColor: theme.accent, borderColor: theme.accent,
    },
    filterChipTxt: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
    filterChipTxtActive: { color: '#fff' },
  });
}
