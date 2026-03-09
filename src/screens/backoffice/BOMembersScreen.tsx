import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { UserX, UserCheck, ChevronLeft } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';

interface MemberRow {
  id: string;
  box_id: string;
  member_id: string;
  joined_at: string;
  status: 'active' | 'banned';
  profile: { username: string; email: string; level: string; elo: number; avatar_url?: string };
}

export default function BOMembersScreen({ navigation }: any) {
  const { currentBox } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [members,    setMembers]    = useState<MemberRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    const { data } = await supabase
      .from('box_members')
      .select('*, profile:profiles(id, username, email, level, elo, avatar_url)')
      .eq('box_id', currentBox.id)
      .order('joined_at', { ascending: false });
    setMembers((data ?? []) as MemberRow[]);
    setLoading(false);
    setRefreshing(false);
  }, [currentBox]);

  useEffect(() => { load(); }, [load]);

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
          <View style={[S.row, m.status === 'banned' && S.rowBanned]}>
            <View style={S.avatar}>
              <Text style={S.avatarText}>{m.profile.username[0].toUpperCase()}</Text>
            </View>
            <View style={S.mid}>
              <View style={S.nameRow}>
                <Text style={[S.name, m.status === 'banned' && S.nameBanned]}>{m.profile.username}</Text>
                <View style={[S.levelPill, { backgroundColor: `${LevelColors[m.profile.level] ?? theme.surface}18` }]}>
                  <Text style={[S.levelText, { color: LevelColors[m.profile.level] ?? theme.textMuted }]}>
                    {m.profile.level?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={S.email}>{m.profile.email}</Text>
              <Text style={S.elo}>{m.profile.elo} ELO · depuis {new Date(m.joined_at).toLocaleDateString('fr-FR')}</Text>
            </View>
            <TouchableOpacity onPress={() => toggleBan(m)} style={S.actionBtn} activeOpacity={0.7}>
              {m.status === 'active'
                ? <UserX color={theme.error} size={18} />
                : <UserCheck color={theme.success} size={18} />}
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={S.empty}>
            <Text style={S.emptyText}>Aucun membre pour l'instant.{'\n'}Partage le code d'invitation !</Text>
          </View>
        }
      />
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
}); }
