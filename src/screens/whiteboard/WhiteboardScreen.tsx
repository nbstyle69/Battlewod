import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Clock, ChevronRight, Hash, Users, X, MessageCircle, FileText, Trophy, Upload, Sparkles, Newspaper } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { BoxWOD } from '../../types';
import { WhiteboardStackParamList } from '../../navigation';
import WeekDayPicker from '../../components/WeekDayPicker';

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const TYPE_COLORS: Record<string, string> = {
  'for-time': '#EF4444', amrap: '#3B82F6', emom: '#8B5CF6',
  tabata: '#F59E0B', strength: '#16A34A', custom: '#6B7280',
};

type Nav = NativeStackNavigationProp<WhiteboardStackParamList>;

interface BoxMember {
  id: string;
  username: string;
  level: string;
  elo: number;
  avatar_url?: string | null;
}

const TYPE_STYLES = StyleSheet.create({
  typeBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.5 },
});

function WodTypeBadge({ type }: { type?: string }) {
  const color = TYPE_COLORS[type ?? 'custom'] ?? '#6B7280';
  return (
    <View style={[TYPE_STYLES.typeBadge, { backgroundColor: `${color}18` }]}>
      <Text style={[TYPE_STYLES.typeBadgeText, { color }]}>{(type ?? 'custom').toUpperCase()}</Text>
    </View>
  );
}

export default function WhiteboardScreen() {
  const { user, currentBox, boxRole, joinBox } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const S = createStyles(theme);

  const [dayWODs,       setDayWODs]       = useState<BoxWOD[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [weekOffset,    setWeekOffset]    = useState(0);
  const [selectedDate,  setSelectedDate]  = useState(toISO(new Date()));
  const [membersModal,  setMembersModal]  = useState(false);
  const [members,       setMembers]       = useState<BoxMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Join box state
  const [joinModal, setJoinModal] = useState(false);
  const [joinCode,  setJoinCode]  = useState('');
  const [joining,   setJoining]   = useState(false);

  const loadMembers = useCallback(async () => {
    if (!currentBox) return;
    setMembersLoading(true);
    const { data } = await supabase
      .from('box_members')
      .select('member_id, profiles:member_id(id, username, level, elo, avatar_url)')
      .eq('box_id', currentBox.id)
      .eq('status', 'active');
    const profiles = (data ?? [])
      .map((row: any) => row.profiles)
      .filter(Boolean)
      .sort((a: any, b: any) => (b.elo ?? 0) - (a.elo ?? 0));
    setMembers(profiles as BoxMember[]);
    setMembersLoading(false);
  }, [currentBox]);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }

    // 1. Fetch user's group memberships (via members uuid[] array on message_groups)
    const { data: myGroupRows } = user
      ? await supabase.from('message_groups').select('id, wod_visibility_mode').eq('box_id', currentBox.id).contains('members', [user.id])
      : { data: [] };
    const myGroupIds = new Set((myGroupRows ?? []).map((r: any) => r.id));

    // Build visibility mode map from the same query (already fetched wod_visibility_mode)
    const groupVisibility: Record<string, string> = {};
    for (const g of (myGroupRows ?? []) as any[]) {
      groupVisibility[g.id] = g.wod_visibility_mode ?? 'weekly';
    }

    const todayISO = toISO(new Date());
    const isFutureDate = selectedDate > todayISO;

    const { data: dayData } = await supabase
      .from('box_wods')
      .select('*')
      .eq('box_id', currentBox.id)
      .eq('scheduled_date', selectedDate)
      .eq('is_published', true)
      .order('block_name');

    const allWodIds = (dayData ?? []).map((w: any) => w.id);

    // 2. Fetch group access restrictions
    let accessMap: Record<string, string[]> = {};
    if (allWodIds.length > 0) {
      const { data: accessRows } = await supabase
        .from('wod_group_access')
        .select('wod_id, group_id')
        .in('wod_id', allWodIds);
      for (const r of (accessRows ?? []) as any[]) {
        if (!accessMap[r.wod_id]) accessMap[r.wod_id] = [];
        accessMap[r.wod_id].push(r.group_id);
      }
    }

    // 3. Filter by group access + visibility mode
    function canSee(wod: any): boolean {
      if (boxRole === 'owner' || boxRole === 'coach') return true;
      const restricted = accessMap[wod.id];
      // No group restriction → visible to all
      if (!restricted || restricted.length === 0) return true;
      // Check if user belongs to any restricted group
      const myMatchingGroups = restricted.filter(gid => myGroupIds.has(gid));
      if (myMatchingGroups.length === 0) return false;
      // If future date, check visibility mode:
      // hidden only if ALL matching groups are 'daily'
      if (isFutureDate) {
        const hasWeekly = myMatchingGroups.some(gid => groupVisibility[gid] === 'weekly');
        if (!hasWeekly) return false;
      }
      return true;
    }

    setDayWODs((dayData ?? []).filter(canSee) as BoxWOD[]);
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, selectedDate, user, boxRole]);

  useEffect(() => { load(); }, [load]);

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setJoining(true);
    const { error } = await joinBox(joinCode.trim());
    setJoining(false);
    if (error) { Alert.alert('Erreur', error); return; }
    setJoinModal(false);
    setJoinCode('');
  }


  if (!currentBox) {
    return (
      <View style={S.container}>
        <View style={S.header}>
          <Text style={S.headerTitle}>Ma Box</Text>
        </View>
        <View style={S.empty}>
          <View style={S.noBoxCard}>
            <Text style={S.noBoxTitle}>MA BOX</Text>
            <Text style={S.noBoxSub}>Tu n'es rattaché à aucune box.</Text>
            <TouchableOpacity
              style={[S.membersBtn, { width: '100%', marginBottom: 10 }]}
              onPress={() => navigation.navigate('Documents')}
              activeOpacity={0.8}
            >
              <Upload size={16} color={theme.accent} />
              <Text style={S.membersBtnText}>Importation WOD</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.joinBtn} onPress={() => setJoinModal(true)} activeOpacity={0.85}>
              <Hash color="#fff" size={16} />
              <Text style={S.joinBtnText}>Rejoindre une box</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={joinModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setJoinModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.modalOverlay}>
            <View style={S.joinSheet}>
              <View style={S.joinHandle} />
              <Text style={S.joinSheetTitle}>Rejoindre une box</Text>
              <Text style={S.joinSheetSub}>Entre le code d'invitation (6 caractères)</Text>
              <TextInput
                style={S.codeInput}
                value={joinCode}
                onChangeText={text => setJoinCode(text.toUpperCase().slice(0, 6))}
                placeholder="EX: ABC123"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="characters"
                autoFocus
              />
              <TouchableOpacity
                style={[S.joinBtn, (!joinCode.trim() || joining) && { opacity: 0.5 }]}
                onPress={handleJoin}
                disabled={!joinCode.trim() || joining}
                activeOpacity={0.85}
              >
                {joining
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Hash color="#fff" size={16} /><Text style={S.joinBtnText}>Rejoindre</Text></>
                }
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={S.header}>
        <View style={S.headerRow}>
          <View>
            <Text style={S.headerTitle}>Ma Box</Text>
            <Text style={S.headerSub}>{currentBox.name}</Text>
          </View>
        </View>
        <View style={S.headerBtns}>
          <TouchableOpacity
            style={[S.membersBtn, { flex: 1 }]}
            onPress={() => { setMembersModal(true); loadMembers(); }}
            activeOpacity={0.8}
          >
            <Users size={16} color={theme.accent} />
            <Text style={S.membersBtnText}>Membres</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.membersBtn, { flex: 1 }]}
            onPress={() => navigation.navigate('Messages')}
            activeOpacity={0.8}
          >
            <MessageCircle size={16} color={theme.accent} />
            <Text style={S.membersBtnText}>Messages</Text>
          </TouchableOpacity>
        </View>
        <View style={[S.headerBtns, { marginTop: 8 }]}>
          <TouchableOpacity
            style={[S.membersBtn, { flex: 1 }]}
            onPress={() => navigation.navigate('Documents')}
            activeOpacity={0.8}
          >
            <Upload size={16} color={theme.accent} />
            <Text style={S.membersBtnText}>Import WOD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.membersBtn, { flex: 1 }]}
            onPress={() => navigation.navigate('Articles')}
            activeOpacity={0.8}
          >
            <Newspaper size={16} color={theme.accent} />
            <Text style={S.membersBtnText}>Actualités</Text>
          </TouchableOpacity>
        </View>
      </View>

      <WeekDayPicker
        weekOffset={weekOffset}
        setWeekOffset={setWeekOffset}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        theme={theme}
      />

      {/* Quick action buttons when a WOD block exists */}
      {(() => {
        const mainWod =
          dayWODs.find(w => w.block_name === 'wod') ??
          dayWODs.find(w => (w as any).leaderboard_enabled === true) ??
          dayWODs.find(w => w.wod_type === 'for-time' || w.wod_type === 'amrap') ??
          dayWODs[0];
        if (!mainWod) return null;
        return (
          <View style={S.quickActions}>
            <TouchableOpacity
              style={S.scoreBtn}
              onPress={() => navigation.navigate('WODDetail', { wodId: mainWod.id })}
              activeOpacity={0.85}
            >
              <Sparkles size={20} color="#fff" />
              <Text style={S.scoreBtnText}>ENTRER MON SCORE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={S.rankBtn}
              onPress={() => navigation.navigate('WODDetail', { wodId: mainWod.id, scrollToLeaderboard: true })}
              activeOpacity={0.85}
            >
              <Trophy size={18} color={theme.accent} />
              <Text style={S.rankBtnText}>Classement</Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={S.section}>
          <Text style={S.sectionTitle}>
            {selectedDate === toISO(new Date())
              ? 'Whiteboard — Séance du jour'
              : new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          {dayWODs.length > 0 ? (
            <View style={S.dayGroup}>
              {dayWODs.map(wod => {
                const tc = TYPE_COLORS[wod.wod_type ?? 'custom'] ?? '#6B7280';
                return (
                  <TouchableOpacity
                    key={wod.id}
                    style={S.wodCard}
                    onPress={() => navigation.navigate('WODDetail', { wodId: wod.id })}
                    activeOpacity={0.8}
                  >
                    <View style={S.wodCardTop}>
                      <WodTypeBadge type={wod.wod_type} />
                      
                      {wod.time_cap_seconds != null && (
                        <View style={S.timeCap}>
                          <Clock color={theme.textMuted} size={12} />
                          <Text style={S.timeCapText}>
                            Cap {Math.floor(wod.time_cap_seconds / 60)} min
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={S.wodTitle}>{wod.title}</Text>
                    {wod.description && (
                      <Text style={S.wodDesc} numberOfLines={2}>{wod.description}</Text>
                    )}
                    <View style={S.wodCardAction}>
                      <Text style={S.wodCardActionText}>Voir détails & score</Text>
                      <ChevronRight color={theme.accent} size={14} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={S.noWodCard}>
              <Text style={S.noWodEmoji}>📋</Text>
              <Text style={S.noWodText}>Pas de WOD publié ce jour</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Members Modal */}
      <Modal visible={membersModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMembersModal(false)}>
        <View style={S.membersContainer}>
          <View style={S.membersHeader}>
            <Text style={S.membersTitle}>Membres · {currentBox.name}</Text>
            <TouchableOpacity onPress={() => setMembersModal(false)} style={S.membersClose}>
              <X color={theme.textSecondary} size={22} />
            </TouchableOpacity>
          </View>
          {membersLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          ) : (
            <FlatList
              data={members}
              keyExtractor={m => m.id}
              contentContainerStyle={S.membersList}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={S.memberRow}
                  onPress={() => { setMembersModal(false); navigation.navigate('PublicProfile', { userId: item.id }); }}
                  activeOpacity={0.75}
                >
                  <Text style={S.memberRank}>{index + 1}</Text>
                  <View style={S.memberAvatar}>
                    <Text style={S.memberAvatarText}>{item.username[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.memberName}>{item.username}</Text>
                    <Text style={S.memberLevel}>{item.level?.toUpperCase()}</Text>
                  </View>
                  <Text style={S.memberElo}>{item.elo} ELO</Text>
                  <ChevronRight color={theme.textMuted} size={14} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={S.emptyText}>Aucun membre trouvé.</Text>}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const isDark = theme.mode === 'dark';
  const cardShadow = isDark ? {} : {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  };
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: theme.card,
    borderBottomWidth: isDark ? 1 : 0, borderBottomColor: theme.border,
    ...(isDark ? {} : { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }),
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: theme.text, letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  membersBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: isDark ? `${theme.accent}15` : `${theme.accent}08`,
    borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: `${theme.accent}25`,
  },
  membersBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },
  membersContainer: { flex: 1, backgroundColor: theme.background },
  membersHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.card,
  },
  membersTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  membersClose: { padding: 4 },
  membersList: { padding: 16, gap: 10 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.border,
    ...cardShadow,
  },
  memberRank: { width: 22, fontSize: 13, color: theme.textMuted, fontWeight: '700', textAlign: 'center' },
  memberAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.accentShadow, justifyContent: 'center', alignItems: 'center',
  },
  memberAvatarText: { fontSize: 15, fontWeight: '900', color: '#fff' },
  memberName: { fontSize: 14, fontWeight: '700', color: theme.text },
  memberLevel: { fontSize: 10, color: theme.textMuted, fontWeight: '600', marginTop: 1 },
  memberElo: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  section:      { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 12, letterSpacing: -0.2 },
  dayGroup:     { gap: 10 },
  wodCard: {
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.border, gap: 10,
    ...cardShadow,
  },
  wodCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  blockBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: `${theme.accent}12`, borderWidth: 1, borderColor: `${theme.accent}25`,
  },
  blockBadgeText: { fontSize: 10, fontWeight: '700', color: theme.accent },
  timeCap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeCapText: { fontSize: 11, color: theme.textMuted },
  wodTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  wodDesc: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
  wodCardAction: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  wodCardActionText: { fontSize: 12, fontWeight: '700', color: theme.accent },
  noWodCard: {
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 16, padding: 32,
    borderWidth: 1, borderColor: theme.border, alignItems: 'center', gap: 10,
    ...cardShadow,
  },
  noWodEmoji: { fontSize: 36 },
  noWodText:  { fontSize: 14, color: theme.textMuted, textAlign: 'center' },
  historyGroup: { marginBottom: 16 },
  historyGroupDate: {
    fontSize: 13, fontWeight: '700', color: theme.textSecondary,
    marginBottom: 8, textTransform: 'capitalize',
  },
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: isDark ? theme.card : theme.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: theme.border, marginBottom: 6, gap: 8,
    ...cardShadow,
  },
  historyTop:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  historyBlock: { fontSize: 10, fontWeight: '700', color: theme.accent },
  historyTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: theme.textMuted, textAlign: 'center' },
  noBoxCard: {
    width: '100%', backgroundColor: isDark ? theme.card : theme.card, borderRadius: 20,
    padding: 24, borderWidth: 1, borderColor: theme.border, gap: 12,
    ...cardShadow,
  },
  noBoxTitle: { fontSize: 13, fontWeight: '700', color: theme.textMuted, letterSpacing: 1 },
  noBoxSub: { fontSize: 15, color: theme.textSecondary },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: theme.accent, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 20, marginTop: 4,
  },
  joinBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  joinSheet: {
    backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 14,
  },
  joinHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: theme.border, alignSelf: 'center', marginBottom: 8,
  },
  joinSheetTitle: { fontSize: 20, fontWeight: '700', color: theme.text },
  joinSheetSub: { fontSize: 13, color: theme.textMuted },
  codeInput: {
    backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1,
    borderColor: theme.border, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 22, fontWeight: '700', color: theme.text,
    letterSpacing: 6, textAlign: 'center',
  },
  quickActions: {
    paddingHorizontal: 16, gap: 10, marginTop: 12,
  },
  scoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: '#10B981', borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 20,
  },
  scoreBtnText: {
    color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 0.5,
  },
  rankBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    backgroundColor: isDark ? `${theme.accent}15` : `${theme.accent}08`,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    borderWidth: 1, borderColor: `${theme.accent}30`,
  },
  rankBtnText: {
    fontSize: 14, fontWeight: '700', color: theme.accent,
  },
}); }
