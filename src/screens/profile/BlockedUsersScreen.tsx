import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { ArrowLeft, UserX } from 'lucide-react-native';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { getMyBlockedUsers, unblockUser } from '../../services/moderation';
import UserAvatar from '../../components/UserAvatar';
import GlassBackground from '../../components/glass/GlassBackground';
import { LinearGradient } from 'expo-linear-gradient';

export default function BlockedUsersScreen({ navigation }: any) {
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [users, setUsers] = useState<{ id: string; username: string; avatar_url: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getMyBlockedUsers();
    setUsers(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUnblock(id: string, username: string) {
    Alert.alert(
      'Débloquer ?',
      `Débloquer ${username} ? Cet utilisateur pourra à nouveau te contacter.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Débloquer', onPress: async () => {
            const ok = await unblockUser(id);
            if (ok) load();
            else Alert.alert('Erreur', 'Impossible de débloquer.');
          },
        },
      ],
    );
  }

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Utilisateurs bloqués</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={S.center}><ActivityIndicator color={theme.accent} /></View>
      ) : users.length === 0 ? (
        <View style={S.center}>
          <UserX size={48} color={theme.textMuted} />
          <Text style={S.emptyTitle}>Aucun utilisateur bloqué</Text>
          <Text style={S.emptyText}>
            Les utilisateurs que tu bloques apparaîtront ici. Tu peux les débloquer à tout moment.
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={S.row}>
              <UserAvatar size={42} name={item.username} uri={item.avatar_url ?? undefined} />
              <Text style={S.username}>{item.username}</Text>
              <TouchableOpacity onPress={() => handleUnblock(item.id, item.username)} activeOpacity={0.85}
                style={S.unblockBtn}>
                <Text style={S.unblockText}>Débloquer</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: t.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: t.text, marginTop: 8 },
  emptyText: { fontSize: 13, color: t.textMuted, textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: t.card, borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: t.border,
  },
  username: { flex: 1, fontSize: 15, fontWeight: '700', color: t.text },
  unblockBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.ctaBg,
    borderWidth: 1.5, borderColor: t.ctaBorder,
  },
  unblockText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
}); }
