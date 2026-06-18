import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, ScrollView,
} from 'react-native';
import { UserX, UserCheck, ChevronLeft, ChevronRight, X, Calendar, Clock, Check, Timer, ShieldCheck } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/designTokens';
import UserAvatar from '../../components/UserAvatar';

interface MemberRow {
  id: string;
  box_id: string;
  member_id: string;
  joined_at: string;
  status: 'active' | 'banned';
  role: 'member' | 'coach';
  profile: { username: string; email: string; level: string; elo: number; avatar_url?: string };
}

interface MemberReservation {
  id: string;
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

export default function BOMembersScreen({ navigation }: any) {
  const { currentBox } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [members,    setMembers]    = useState<MemberRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Member detail modal
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [memberRes,      setMemberRes]      = useState<MemberReservation[]>([]);
  const [resLoading,     setResLoading]     = useState(false);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    try {
    const { data } = await supabase
      .from('box_members')
      .select('*, role, profile:profiles(id, username, email, level, elo, avatar_url)')
      .eq('box_id', currentBox.id)
      .order('joined_at', { ascending: false });
    setMembers((data ?? []) as MemberRow[]);
    } catch (e) { captureError(e, { screen: 'BOMembers', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox]);

  useEffect(() => { load(); }, [load]);

  async function openMemberDetail(member: MemberRow) {
    setSelectedMember(member);
    setResLoading(true);
    const { data } = await supabase
      .from('class_reservations')
      .select('id, status, created_at, schedule:class_schedules(title, scheduled_date, start_time, end_time, coach)')
      .eq('member_id', member.member_id)
      .eq('box_id', currentBox!.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setMemberRes((data ?? []).map((r: any) => ({
      ...r,
      schedule: Array.isArray(r.schedule) ? r.schedule[0] ?? null : r.schedule,
    })));
    setResLoading(false);
  }

  async function toggleCoach(member: MemberRow) {
    const newRole = member.role === 'coach' ? 'member' : 'coach';
    const label = newRole === 'coach' ? 'Promouvoir coach' : 'Retirer le rôle coach';
    Alert.alert(
      `${label} ?`,
      newRole === 'coach'
        ? `${member.profile.username} pourra créer et gérer les WODs.`
        : `${member.profile.username} redeviendra un membre classique.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: label,
          onPress: async () => {
            await supabase.from('box_members').update({ role: newRole }).eq('id', member.id);
            load();
            setSelectedMember(null);
          },
        },
      ]
    );
  }

  async function toggleBan(member: MemberRow) {
    const newStatus = member.status === 'active' ? 'banned' : 'active';
    const label = newStatus === 'banned' ? 'Bannir' : 'Réactiver';
    Alert.alert(
      `${label} ${member.profile.username} ?`,
      newStatus === 'banned' ? 'Ce membre ne pourra plus accéder à la box.' : 'Ce membre retrouvera l\'accès.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: label,
          style: newStatus === 'banned' ? 'destructive' : 'default',
          onPress: async () => {
            await supabase.from('box_members').update({ status: newStatus }).eq('id', member.id);
            load();
          },
        },
      ]
    );
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const active = members.filter(m => m.status === 'active').length;
  const banned = members.filter(m => m.status === 'banned').length;

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <View>
          <Text style={S.headerTitle}>Membres</Text>
          <Text style={S.headerSub}>{active} actifs · {banned} bannis</Text>
        </View>
      </View>

      <FlatList
        data={members}
        keyExtractor={m => m.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
        renderItem={({ item: m }) => (
          <TouchableOpacity
            style={[S.row, m.status === 'banned' && S.rowBanned]}
            onPress={() => openMemberDetail(m)}
            activeOpacity={0.7}
          >
            <UserAvatar uri={m.profile.avatar_url} name={m.profile.username} size={40} borderRadius={14} backgroundColor={theme.accentShadow} />
            <View style={S.mid}>
              <View style={S.nameRow}>
                <Text style={[S.name, m.status === 'banned' && S.nameBanned]}>{m.profile.username}</Text>
                {m.role === 'coach' && (
                  <View style={[S.levelPill, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                    <Text style={[S.levelText, { color: '#3B82F6' }]}>COACH</Text>
                  </View>
                )}
                <View style={[S.levelPill, { backgroundColor: `${LevelColors[m.profile.level] ?? theme.surface}18` }]}>
                  <Text style={[S.levelText, { color: LevelColors[m.profile.level] ?? theme.textMuted }]}>
                    {m.profile.level?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={S.email}>{m.profile.email}</Text>
              <Text style={S.elo}>{m.profile.elo} ELO · depuis {new Date(m.joined_at).toLocaleDateString('fr-FR')}</Text>
            </View>
            <ChevronRight color={theme.textMuted} size={16} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={S.empty}>
            <Text style={S.emptyText}>Aucun membre pour l'instant.{'\n'}Partage le code d'invitation !</Text>
          </View>
        }
      />

      {/* Member Detail Modal */}
      <Modal visible={!!selectedMember} transparent animationType="slide" onRequestClose={() => setSelectedMember(null)}>
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            {/* Modal header */}
            <View style={S.modalHeader}>
              <View style={S.modalHeaderLeft}>
                <UserAvatar
                  uri={selectedMember?.profile?.avatar_url}
                  name={selectedMember?.profile?.username ?? '?'}
                  size={44}
                  borderRadius={16}
                  borderWidth={2}
                  borderColor={LevelColors[selectedMember?.profile?.level ?? ''] ?? theme.accent}
                  backgroundColor={theme.surface}
                  textColor={theme.text}
                />
                <View style={{ flex: 1 }}>
                  <Text style={S.modalName}>{selectedMember?.profile?.username}</Text>
                  <Text style={S.modalSub}>
                    {selectedMember?.profile?.email} · {selectedMember?.profile?.elo} ELO
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedMember(null)} style={S.modalClose}>
                <X color={theme.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            {/* Coach promote/demote + Ban/Unban actions */}
            {selectedMember && selectedMember.status === 'active' && (
              <TouchableOpacity
                style={[S.banBtn, { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.25)' }]}
                onPress={() => toggleCoach(selectedMember)}
                activeOpacity={0.8}
              >
                <ShieldCheck color="#3B82F6" size={15} />
                <Text style={[S.banBtnText, { color: '#3B82F6' }]}>
                  {selectedMember.role === 'coach' ? 'Retirer le rôle coach' : 'Promouvoir coach'}
                </Text>
              </TouchableOpacity>
            )}
            {selectedMember && (
              <TouchableOpacity
                style={[S.banBtn, selectedMember.status === 'banned' && S.unbanBtn]}
                onPress={() => { setSelectedMember(null); toggleBan(selectedMember); }}
                activeOpacity={0.8}
              >
                {selectedMember.status === 'active'
                  ? <UserX color={theme.error} size={15} />
                  : <UserCheck color={theme.success} size={15} />}
                <Text style={[S.banBtnText, selectedMember.status === 'banned' && { color: theme.success }]}>
                  {selectedMember.status === 'active' ? 'Bannir ce membre' : 'Réactiver ce membre'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Reservations section */}
            <View style={S.resSection}>
              <Text style={S.resSectionTitle}>Réservations</Text>
            </View>

            {resLoading ? (
              <ActivityIndicator style={{ marginVertical: 30 }} size="large" color={theme.accent} />
            ) : memberRes.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <Calendar color={theme.textMuted} size={32} strokeWidth={1.5} />
                <Text style={[S.modalSub, { marginTop: 10 }]}>Aucune réservation</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
                {memberRes.map(r => {
                  const s = r.schedule;
                  if (!s) return null;
                  const isPast = s.scheduled_date < todayISO;
                  const isConfirmed = r.status === 'confirmed';
                  return (
                    <View key={r.id} style={[S.resCard, isPast && S.resCardPast]}>
                      <View style={[S.resDot, { backgroundColor: isConfirmed ? theme.accent : '#f59e0b' }]} />
                      <View style={S.resBody}>
                        <View style={S.resTop}>
                          <Text style={S.resTitle}>{s.title}</Text>
                          <View style={[S.resBadge, isConfirmed ? S.resBadgeOk : S.resBadgeWait]}>
                            {isConfirmed ? <Check color="#C9A227" size={10} /> : <Timer color="#f59e0b" size={10} />}
                            <Text style={[S.resBadgeText, isConfirmed ? { color: '#C9A227' } : { color: '#f59e0b' }]}>
                              {isConfirmed ? 'Confirmé' : 'Attente'}
                            </Text>
                          </View>
                        </View>
                        <View style={S.resDetails}>
                          <View style={S.resDetailRow}>
                            <Calendar color={theme.textMuted} size={11} />
                            <Text style={S.resDetailText}>{formatDate(s.scheduled_date)}</Text>
                          </View>
                          <View style={S.resDetailRow}>
                            <Clock color={theme.textMuted} size={11} />
                            <Text style={S.resDetailText}>{s.start_time} – {s.end_time}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    flexDirection: 'row', alignItems: 'flex-end', gap: 12,
  },
  back:        { paddingBottom: 2 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: theme.text },
  headerSub:   { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.border,
  },
  rowBanned:   { opacity: 0.55 },
  avatar:      { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { fontSize: 16, fontWeight: '900', color: theme.text },
  mid:         { flex: 1, gap: 2 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name:        { fontSize: 14, fontWeight: '800', color: theme.text },
  nameBanned:  { textDecorationLine: 'line-through', color: theme.textMuted },
  levelPill:   { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  levelText:   { fontSize: 10, fontWeight: '800' },
  email:       { fontSize: 11, color: theme.textMuted },
  elo:         { fontSize: 11, color: theme.textSecondary },
  actionBtn:   { padding: 6 },
  empty:       { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText:   { fontSize: 14, color: theme.textMuted, textAlign: 'center', lineHeight: 22 },

  // Modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:      { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 34, maxHeight: '80%' },
  modalHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  modalAvatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  modalAvatarText: { fontSize: 18, fontWeight: '900', color: theme.text },
  modalName:       { fontSize: 16, fontWeight: '900', color: theme.text },
  modalSub:        { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  modalClose:      { padding: 6 },

  banBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 20, marginTop: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  unbanBtn: {
    backgroundColor: `${theme.success}15`, borderColor: `${theme.success}30`,
  },
  banBtnText: { fontSize: 13, fontWeight: '700', color: theme.error },

  resSection: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  resSectionTitle: { fontSize: 15, fontWeight: '800', color: theme.text },

  resCard: {
    flexDirection: 'row', alignItems: 'stretch', marginHorizontal: 20, marginBottom: 8,
    backgroundColor: theme.surface, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: theme.border,
  },
  resCardPast: { opacity: 0.5 },
  resDot:  { width: 4 },
  resBody: { flex: 1, padding: 12 },
  resTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  resTitle: { fontSize: 13, fontWeight: '800', color: theme.text, flex: 1 },
  resBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  resBadgeOk:   { backgroundColor: 'rgba(201,162,39,0.12)' },
  resBadgeWait: { backgroundColor: 'rgba(245,158,11,0.12)' },
  resBadgeText: { fontSize: 10, fontWeight: '700' },
  resDetails:    { flexDirection: 'row', gap: 12 },
  resDetailRow:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  resDetailText: { fontSize: 11, color: theme.textMuted, fontWeight: '600' },
}); }
