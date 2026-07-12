import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, FlatList, SafeAreaView,
} from 'react-native';
import {
  ChevronRight, Users, UserPlus, Trash2, Crown,
  CheckCircle2, XCircle, Search, Shield, X,
} from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import UserAvatar from '../../components/UserAvatar';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { CompetitionStackParamList } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';
import { useTranslation } from 'react-i18next';

type Nav   = NativeStackNavigationProp<CompetitionStackParamList, 'InterTeam'>;
type Route = RouteProp<CompetitionStackParamList, 'InterTeam'>;

interface Member {
  id: string;
  user_id: string;
  username: string;
  level: string;
  status: 'pending' | 'accepted' | 'declined';
  invited_at: string;
}

export default function InterTeamScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const { competitionId, teamSize } = route.params;
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const S = createStyles(theme);

  const [team,        setTeam]        = useState<any>(null);
  const [members,     setMembers]     = useState<Member[]>([]);
  const [myInvite,    setMyInvite]    = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [teamName,    setTeamName]    = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [inviting,    setInviting]    = useState<string | null>(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [allBoxMembers,    setAllBoxMembers]    = useState<any[]>([]);
  const [loadingMembers,   setLoadingMembers]   = useState(false);
  const [memberSearch,     setMemberSearch]     = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
    const { data: existingTeam } = await supabase
      .from('inter_teams')
      .select('*')
      .eq('competition_id', competitionId)
      .or(`captain_id.eq.${user.id}`)
      .maybeSingle();

    if (existingTeam) {
      setTeam(existingTeam);
      const { data: m } = await supabase
        .from('inter_team_members')
        .select('*, profile:profiles!user_id(username, level, avatar_url)')
        .eq('team_id', existingTeam.id);
      setMembers((m ?? []).map((x: any) => ({
        id: x.id,
        user_id: x.user_id,
        username: (Array.isArray(x.profile) ? x.profile[0] : x.profile)?.username ?? '—',
        level:    (Array.isArray(x.profile) ? x.profile[0] : x.profile)?.level ?? '',
        status: x.status,
        invited_at: x.invited_at,
      })));
    } else {
      const { data: inv } = await supabase
        .from('inter_team_members')
        .select('*, team:inter_teams(id, name, captain_id, competition_id)')
        .eq('user_id', user.id)
        .in('status', ['pending', 'accepted'])
        .filter('team.competition_id', 'eq', competitionId)
        .maybeSingle();
      if (inv) {
        const teamData = Array.isArray(inv.team) ? inv.team[0] : inv.team;
        if (teamData?.competition_id === competitionId) {
          setMyInvite({ ...inv, team: teamData });
          if (inv.status === 'accepted') setTeam(teamData);
        }
      }
    }
    } catch (e) { captureError(e, { screen: 'InterTeam', action: 'load' }); }
    setLoading(false);
  }, [user, competitionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCreateTeam() {
    if (!user) return;
    if (!teamName.trim()) { Alert.alert(t('interTeam.nameRequired'), t('interTeam.nameRequiredMsg')); return; }
    setSaving(true);
    const { data: newTeam, error } = await supabase.from('inter_teams').insert({
      competition_id: competitionId,
      name: teamName.trim(),
      captain_id: user.id,
      box_id: currentBox?.id ?? null,
    }).select('*').single();
    if (error) { Alert.alert(t('common.error'), error.message); setSaving(false); return; }

    await supabase.from('inter_registrations').upsert({
      competition_id: competitionId,
      team_id: newTeam.id,
      athlete_id: null,
      box_id: currentBox?.id ?? null,
    });
    await load();
    setSaving(false);
  }

  async function openMembersModal() {
    setShowMembersModal(true);
    setLoadingMembers(true);
    setMemberSearch('');
    const alreadyInvited = new Set([user?.id, ...members.map(m => m.user_id)]);
    if (currentBox) {
      const { data: bm } = await supabase
        .from('box_members')
        .select('member_id')
        .eq('box_id', currentBox.id)
        .neq('member_id', user?.id ?? '');
      const userIds = (bm ?? []).map((x: any) => x.member_id).filter((id: string) => !alreadyInvited.has(id));
      if (userIds.length === 0) { setAllBoxMembers([]); setLoadingMembers(false); return; }
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, level, elo, avatar_url')
        .in('id', userIds);
      setAllBoxMembers((profiles ?? []).map((p: any) => ({ id: p.id, username: p.username, level: p.level, elo: p.elo })));
    } else {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, level, elo, avatar_url')
        .neq('id', user?.id ?? '')
        .limit(50);
      const list = (data ?? []).filter((p: any) => !alreadyInvited.has(p.id));
      setAllBoxMembers(list);
    }
    setLoadingMembers(false);
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    let results: { id: string; username: string; level: string }[] = [];
    if (currentBox) {
      const { data } = await supabase
        .from('box_members')
        .select('user_id, profile:profiles!user_id(id, username, level, avatar_url)')
        .eq('box_id', currentBox.id)
        .neq('user_id', user?.id ?? '');
      results = (data ?? []).map((x: any) => ({
        id: Array.isArray(x.profile) ? x.profile[0]?.id : x.profile?.id,
        username: Array.isArray(x.profile) ? x.profile[0]?.username : x.profile?.username,
        level: Array.isArray(x.profile) ? x.profile[0]?.level : x.profile?.level,
      })).filter(p => p.username?.toLowerCase().includes(searchQuery.toLowerCase()));
    } else {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, level, avatar_url')
        .ilike('username', `%${searchQuery.trim()}%`)
        .neq('id', user?.id ?? '')
        .limit(20);
      results = (data ?? []).map((p: any) => ({ id: p.id, username: p.username, level: p.level }));
    }
    const alreadyInvited = new Set(members.map(m => m.user_id));
    setSearchResults(results.filter(p => p.id && !alreadyInvited.has(p.id)));
    setSearching(false);
  }

  async function handleInvite(targetUserId: string) {
    if (!team) return;
    const accepted = members.filter(m => m.status === 'accepted').length + 1; // +1 for captain
    if (accepted >= teamSize) {
      Alert.alert(t('interTeam.teamFull'), t('interTeam.teamFullMsg', { n: teamSize }));
      return;
    }
    setInviting(targetUserId);
    const { error } = await supabase.from('inter_team_members').insert({
      team_id: team.id,
      user_id: targetUserId,
      status: 'pending',
    });
    if (error) Alert.alert(t('common.error'), error.code === '23505' ? t('interTeam.alreadyInvited') : error.message);
    else { await load(); setSearchResults([]); setSearchQuery(''); }
    setInviting(null);
  }

  async function handleRemoveMember(memberId: string) {
    Alert.alert(t('interTeam.remove'), t('interTeam.removeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('interTeam.remove'), style: 'destructive',
        onPress: async () => {
          await supabase.from('inter_team_members').delete().eq('id', memberId);
          await load();
        },
      },
    ]);
  }

  async function handleAnswerInvite(status: 'accepted' | 'declined') {
    if (!myInvite) return;
    setSaving(true);
    await supabase.from('inter_team_members').update({ status, answered_at: new Date().toISOString() }).eq('id', myInvite.id);
    if (status === 'accepted') {
      await supabase.from('inter_registrations').upsert({
        competition_id: competitionId,
        team_id: myInvite.team.id,
        athlete_id: user?.id,
        box_id: currentBox?.id ?? null,
      });
    }
    await load();
    setSaving(false);
  }

  const isCaptain = team && team.captain_id === user?.id;
  const acceptedCount = members.filter(m => m.status === 'accepted').length + (isCaptain ? 1 : 0);

  if (loading) return (
    <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <GlassBackground />
      <ActivityIndicator color={theme.accent} size="large" />
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={S.container}>
      <GlassBackground />
        {/* Header */}
        <View style={S.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
            <ChevronRight size={22} color={theme.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View style={S.headerIcon}>
            <Users size={18} color={theme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={S.headerTitle}>{team ? team.name : t('interTeam.myTeam')}</Text>
            <Text style={S.headerSub}>
              {team ? t('interTeam.membersCount', { count: acceptedCount, max: teamSize }) : t('interTeam.teamOf', { n: teamSize })}
            </Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content} keyboardShouldPersistTaps="handled">

          {/* ── No team: invitation pending ── */}
          {!team && myInvite && myInvite.status === 'pending' && (
            <View style={S.inviteCard}>
              <View style={S.inviteHeader}>
                <Users size={22} color={theme.accent} />
                <Text style={S.inviteTitle}>{t('interTeam.inviteReceived')}</Text>
              </View>
              <Text style={S.inviteTeamName}>« {myInvite.team?.name ?? '—'} »</Text>
              <Text style={S.inviteSub}>{t('interTeam.inviteSub')}</Text>
              <View style={S.inviteActions}>
                <TouchableOpacity
                  style={[S.answerBtn, { backgroundColor: `${theme.success}20`, borderColor: `${theme.success}40` }]}
                  onPress={() => handleAnswerInvite('accepted')}
                  disabled={saving}
                >
                  <CheckCircle2 size={16} color={theme.success} />
                  <Text style={[S.answerBtnText, { color: theme.success }]}>{t('interTeam.accept')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.answerBtn, { backgroundColor: `${theme.error}15`, borderColor: `${theme.error}30` }]}
                  onPress={() => handleAnswerInvite('declined')}
                  disabled={saving}
                >
                  <XCircle size={16} color={theme.error} />
                  <Text style={[S.answerBtnText, { color: theme.error }]}>{t('interTeam.decline')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── No team: create form ── */}
          {!team && (!myInvite || myInvite.status === 'declined') && (
            <View style={S.createCard}>
              <Text style={S.sectionLabel}>{t('interTeam.createTeam')}</Text>
              <Text style={S.sectionHint}>{t('interTeam.createHint')}</Text>
              <View style={S.inputRow}>
                <View style={S.inputWrapper}>
                  <Shield size={15} color={theme.textMuted} />
                  <TextInput
                    style={S.input}
                    value={teamName}
                    onChangeText={setTeamName}
                    placeholder={t('interTeam.teamNamePlaceholder')}
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
                <TouchableOpacity
                  style={[S.createBtn, saving && { opacity: 0.6 }]}
                  onPress={handleCreateTeam}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.createBtnText}>{t('interTeam.create')}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Team exists ── */}
          {team && (
            <>
              {/* Roster */}
              <View style={S.section}>
                <View style={S.sectionRow}>
                  <Text style={S.sectionLabel}>{t('interTeam.membersTitle', { count: acceptedCount, max: teamSize })}</Text>
                  {acceptedCount < teamSize && (
                    <View style={[S.chip, { backgroundColor: `${theme.accent}15` }]}>
                      <Text style={[S.chipText, { color: theme.accent }]}>{t('interTeam.freeSlots', { count: teamSize - acceptedCount })}</Text>
                    </View>
                  )}
                </View>

                {/* Captain row */}
                <View style={S.memberRow}>
                  <UserAvatar uri={user?.avatar_url} name={user?.username ?? '?'} size={34} borderRadius={10} backgroundColor={`${theme.accent}20`} textColor={theme.accent} fontSize={13} />
                  <View style={{ flex: 1 }}>
                    <Text style={S.memberName}>{user?.username ?? '—'} {isCaptain ? t('interTeam.me') : ''}</Text>
                    <Text style={S.memberLevel}>{user?.level ?? ''}</Text>
                  </View>
                  <View style={[S.statusBadge, { backgroundColor: `${theme.accent}20` }]}>
                    <Crown size={10} color={theme.accent} />
                    <Text style={[S.statusText, { color: theme.accent }]}>{t('interTeam.captain')}</Text>
                  </View>
                </View>

                {/* Members */}
                {members.map(m => (
                  <View key={m.id} style={[S.memberRow, m.status === 'declined' && { opacity: 0.5 }]}>
                    <UserAvatar uri={(m as any).avatar_url} name={m.username ?? '?'} size={34} borderRadius={10} backgroundColor={`${theme.accent}20`} textColor={theme.accent} fontSize={13} />
                    <View style={{ flex: 1 }}>
                      <Text style={S.memberName}>{m.username}</Text>
                      <Text style={S.memberLevel}>{m.level}</Text>
                    </View>
                    <View style={S.memberRight}>
                      <View style={[S.statusBadge, {
                        backgroundColor: m.status === 'accepted' ? `${theme.success}15` : m.status === 'declined' ? `${theme.error}15` : `${theme.gold}15`,
                      }]}>
                        <Text style={[S.statusText, {
                          color: m.status === 'accepted' ? theme.success : m.status === 'declined' ? theme.error : theme.gold,
                        }]}>
                          {m.status === 'accepted' ? t('interTeam.accepted') : m.status === 'declined' ? t('interTeam.declined') : t('interTeam.pending')}
                        </Text>
                      </View>
                      {isCaptain && (
                        <TouchableOpacity onPress={() => handleRemoveMember(m.id)} style={S.removeBtn}>
                          <Trash2 size={14} color={theme.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>

              {/* Invite */}
              {isCaptain && acceptedCount < teamSize && (
                <View style={S.section}>
                  <Text style={S.sectionLabel}>{t('interTeam.inviteAthlete')}</Text>
                  <Text style={S.sectionHint}>{t('interTeam.inviteAthleteHint')}</Text>
                  <TouchableOpacity style={S.openMembersBtn} onPress={openMembersModal}>
                    <Users size={16} color="#fff" />
                    <Text style={S.openMembersBtnText}>{t('interTeam.seeBoxMembers')}</Text>
                    <ChevronRight size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Members picker modal */}
              <Modal visible={showMembersModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowMembersModal(false)}>
                <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
                  {/* Modal header */}
                  <View style={S.modalHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={S.modalTitle}>{t('interTeam.membersModalTitle', { name: currentBox?.name ?? t('interTeam.athletes') })}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowMembersModal(false)} style={S.modalClose}>
                      <X size={20} color={theme.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Search bar */}
                  <View style={S.modalSearchBar}>
                    <Search size={15} color={theme.textMuted} />
                    <TextInput
                      style={[S.input, { flex: 1 }]}
                      value={memberSearch}
                      onChangeText={setMemberSearch}
                      placeholder={t('interTeam.searchByUsername')}
                      placeholderTextColor={theme.textMuted}
                      autoFocus
                    />
                  </View>

                  {loadingMembers ? (
                    <ActivityIndicator style={{ marginTop: 40 }} color={theme.accent} />
                  ) : (
                    <FlatList
                      data={allBoxMembers.filter(p =>
                        !memberSearch.trim() || p.username?.toLowerCase().includes(memberSearch.toLowerCase())
                      )}
                      keyExtractor={item => item.id}
                      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
                      ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 60 }}>
                          <Users size={40} color={theme.textMuted} />
                          <Text style={{ color: theme.textMuted, marginTop: 12, fontWeight: '600' }}>{t('interTeam.noMemberFound')}</Text>
                        </View>
                      }
                      renderItem={({ item, index }) => (
                        <View style={[S.modalMemberRow, index === 0 && { borderTopWidth: 0 }]}>
                          <View style={S.modalRank}>
                            <Text style={S.modalRankText}>{index + 1}</Text>
                          </View>
                          <UserAvatar uri={(item as any).avatar_url} name={item.username ?? '?'} size={34} borderRadius={10} backgroundColor={`${theme.accent}20`} textColor={theme.accent} fontSize={13} />
                          <View style={{ flex: 1 }}>
                            <Text style={S.memberName}>{item.username}</Text>
                            <Text style={S.memberLevel}>{item.level?.toUpperCase() ?? ''}</Text>
                          </View>
                          <Text style={S.modalElo}>{t('interTeam.eloValue', { elo: item.elo ?? 1000 })}</Text>
                          <TouchableOpacity
                            style={[S.inviteBtn, inviting === item.id && { opacity: 0.5 }]}
                            onPress={async () => {
                              await handleInvite(item.id);
                              setAllBoxMembers(prev => prev.filter(p => p.id !== item.id));
                            }}
                            disabled={!!inviting}
                          >
                            {inviting === item.id
                              ? <ActivityIndicator color="#fff" size="small" />
                              : <><UserPlus size={13} color="#fff" /><Text style={S.inviteBtnText}>{t('interTeam.invite')}</Text></>
                            }
                          </TouchableOpacity>
                        </View>
                      )}
                    />
                  )}
                </SafeAreaView>
              </Modal>

              {/* Team complete */}
              {acceptedCount >= teamSize && (
                <View style={[S.infoBox, { borderColor: `${theme.success}30`, backgroundColor: `${theme.success}10` }]}>
                  <CheckCircle2 size={18} color={theme.success} />
                  <Text style={[S.infoText, { color: theme.success }]}>
                    {t('interTeam.teamComplete')}
                  </Text>
                </View>
              )}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container:   { flex: 1, backgroundColor: 'transparent' },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    backBtn:    { padding: 4 },
    headerIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: `${theme.accent}20`, justifyContent: 'center', alignItems: 'center' },
    headerTitle:{ fontSize: 18, fontWeight: '800', color: theme.text },
    headerSub:  { fontSize: 11, color: theme.textMuted, marginTop: 1 },
    content:    { padding: 16, gap: 16, paddingBottom: 140 },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    sectionLabel:{ fontSize: 13, fontWeight: '800', color: theme.text, marginBottom: 4 },
    sectionHint: { fontSize: 11, color: theme.textMuted, marginBottom: 10 },
    section:    { backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 16 },
    createCard: { backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 16 },
    inputRow:   { flexDirection: 'row', gap: 8 },
    inputWrapper: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: theme.surface, borderRadius: 12,
      borderWidth: 1, borderColor: theme.border,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    input: { flex: 1, fontSize: 14, color: theme.text },
    createBtn: {
      backgroundColor: theme.accent, borderRadius: 12,
      paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center',
    },
    createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    memberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    memberAvatar: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: `${theme.accent}20`,
      justifyContent: 'center', alignItems: 'center',
    },
    memberAvatarText: { fontSize: 13, fontWeight: '800', color: theme.accent },
    memberName:   { fontSize: 13, fontWeight: '700', color: theme.text },
    memberLevel:  { fontSize: 11, color: theme.textMuted, textTransform: 'uppercase' },
    memberRight:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    statusText:   { fontSize: 10, fontWeight: '700' },
    removeBtn:    { padding: 6 },
    searchRow:    { flexDirection: 'row', gap: 8, marginBottom: 10 },
    searchBtn:    { backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' },
    searchBtnText:{ color: '#fff', fontWeight: '700', fontSize: 13 },
    resultRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    inviteBtn:  { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
    inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    openMembersBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: theme.accent, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 13,
    },
    openMembersBtnText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 14 },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    modalTitle: { fontSize: 16, fontWeight: '800', color: theme.text },
    modalClose: { padding: 6, backgroundColor: theme.surface, borderRadius: 10 },
    modalSearchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginVertical: 10,
      backgroundColor: theme.card, borderRadius: 12,
      borderWidth: 1, borderColor: theme.border,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    modalMemberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border,
    },
    modalRank: { width: 22, alignItems: 'center' },
    modalRankText: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
    modalElo: { fontSize: 12, fontWeight: '700', color: theme.textMuted, marginRight: 8 },
    inviteCard: {
      backgroundColor: theme.card, borderRadius: 16,
      borderWidth: 1, borderColor: `${theme.accent}30`,
      padding: 16,
    },
    inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    inviteTitle:  { fontSize: 16, fontWeight: '800', color: theme.text },
    inviteTeamName:{ fontSize: 18, fontWeight: '900', color: theme.accent, marginBottom: 4 },
    inviteSub:    { fontSize: 13, color: theme.textMuted, marginBottom: 14 },
    inviteActions:{ flexDirection: 'row', gap: 10 },
    answerBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, borderRadius: 12, borderWidth: 1, padding: 12,
    },
    answerBtnText: { fontWeight: '700', fontSize: 14 },
    chip:  { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    chipText: { fontSize: 11, fontWeight: '700' },
    infoBox: {
      flexDirection: 'row', gap: 10, alignItems: 'flex-start',
      borderRadius: 14, borderWidth: 1, padding: 14,
    },
    infoText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  });
}
