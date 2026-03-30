import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ArrowLeft, Sparkles, Bug, RefreshCw } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

interface ChangelogEntry {
  id: string;
  title: string;
  body: string;
  type: 'fix' | 'feature' | 'update';
  created_at: string;
  isRead: boolean;
}

const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  feature: { icon: '✨', label: 'Nouveauté', color: '#10B981' },
  fix:     { icon: '🐛', label: 'Correction', color: '#EF4444' },
  update:  { icon: '🔄', label: 'Mise à jour', color: '#3B82F6' },
};

export default function ChangelogScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation();
  const S = createStyles(theme);

  const [entries, setEntries]   = useState<ChangelogEntry[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
    const [{ data: changelog }, { data: reads }] = await Promise.all([
      supabase
        .from('app_changelog')
        .select('id, title, body, type, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('changelog_reads')
        .select('changelog_id')
        .eq('user_id', user.id),
    ]);

    const readSet = new Set((reads ?? []).map(r => r.changelog_id));

    setEntries((changelog ?? []).map(c => ({
      ...c,
      type: c.type as 'fix' | 'feature' | 'update',
      isRead: readSet.has(c.id),
    })));
    setLoading(false);

    // Mark all unread as read
    const unread = (changelog ?? []).filter(c => !readSet.has(c.id));
    if (unread.length > 0) {
      const rows = unread.map(c => ({ user_id: user.id, changelog_id: c.id }));
      await supabase.from('changelog_reads').upsert(rows, { onConflict: 'user_id,changelog_id' });
    }
    } catch (e) { captureError(e, { screen: 'Changelog', action: 'load' }); setLoading(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderEntry({ item }: { item: ChangelogEntry }) {
    const meta = TYPE_META[item.type] ?? TYPE_META.update;
    return (
      <View style={[S.card, !item.isRead && S.cardUnread]}>
        <View style={S.cardHeader}>
          <View style={[S.typeBadge, { backgroundColor: meta.color + '22' }]}>
            <Text style={S.typeBadgeText}>{meta.icon} {meta.label}</Text>
          </View>
          <Text style={S.date}>{formatDate(item.created_at)}</Text>
          {!item.isRead && <View style={S.unreadDot} />}
        </View>
        <Text style={S.title}>{item.title}</Text>
        {item.body ? <Text style={S.body}>{item.body}</Text> : null}
      </View>
    );
  }

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Nouveautés</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={S.empty}>
          <Sparkles size={48} color={theme.textSecondary} />
          <Text style={S.emptyText}>Aucune nouveauté pour le moment</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={e => e.id}
          renderItem={renderEntry}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
      backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
    card: {
      backgroundColor: theme.card, borderRadius: 14, padding: 16, marginBottom: 12,
      borderWidth: 1, borderColor: theme.border,
    },
    cardUnread: {
      borderLeftWidth: 3, borderLeftColor: theme.accent,
    },
    cardHeader: {
      flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8,
    },
    typeBadge: {
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    },
    typeBadgeText: { fontSize: 12, fontWeight: '600', color: theme.text },
    date: { fontSize: 12, color: theme.textSecondary, flex: 1, textAlign: 'right' },
    unreadDot: {
      width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent, marginLeft: 4,
    },
    title: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 },
    body: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyText: { fontSize: 15, color: theme.textSecondary },
  });
}
