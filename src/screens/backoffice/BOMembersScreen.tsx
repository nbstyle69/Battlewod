import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { UserX, UserCheck, ChevronLeft } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, LevelColors } from '../../theme/colors';

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
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const active = members.filter(m => m.status === 'active').length;
  const banned = members.filter(m => m.status === 'banned').length;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft color={Colors.text} size={22} />
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Membres</Text>
          <Text style={s.headerSub}>{active} actifs · {banned} bannis</Text>
        </View>
      </View>

      <FlatList
        data={members}
        keyExtractor={m => m.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
        renderItem={({ item: m }) => (
          <View style={[s.row, m.status === 'banned' && s.rowBanned]}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{m.profile.username[0].toUpperCase()}</Text>
            </View>
            <View style={s.mid}>
              <View style={s.nameRow}>
                <Text style={[s.name, m.status === 'banned' && s.nameBanned]}>{m.profile.username}</Text>
                <View style={[s.levelPill, { backgroundColor: `${LevelColors[m.profile.level] ?? Colors.surface}18` }]}>
                  <Text style={[s.levelText, { color: LevelColors[m.profile.level] ?? Colors.textMuted }]}>
                    {m.profile.level?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={s.email}>{m.profile.email}</Text>
              <Text style={s.elo}>{m.profile.elo} ELO · depuis {new Date(m.joined_at).toLocaleDateString('fr-FR')}</Text>
            </View>
            <TouchableOpacity onPress={() => toggleBan(m)} style={s.actionBtn} activeOpacity={0.7}>
              {m.status === 'active'
                ? <UserX color={Colors.error} size={18} />
                : <UserCheck color={Colors.success} size={18} />}
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>Aucun membre pour l'instant.{'\n'}Partage le code d'invitation !</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border,
    flexDirection: 'row', alignItems: 'flex-end', gap: 12,
  },
  back:        { paddingBottom: 2 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: Colors.text },
  headerSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  rowBanned:   { opacity: 0.55 },
  avatar:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { fontSize: 16, fontWeight: '900', color: Colors.text },
  mid:         { flex: 1, gap: 2 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name:        { fontSize: 14, fontWeight: '800', color: Colors.text },
  nameBanned:  { textDecorationLine: 'line-through', color: Colors.textMuted },
  levelPill:   { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  levelText:   { fontSize: 10, fontWeight: '800' },
  email:       { fontSize: 11, color: Colors.textMuted },
  elo:         { fontSize: 11, color: Colors.textSecondary },
  actionBtn:   { padding: 6 },
  empty:       { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText:   { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
