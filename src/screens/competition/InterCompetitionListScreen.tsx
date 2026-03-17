import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Globe2, Users, Calendar, Trophy, ChevronRight, Zap } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { CompetitionStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<CompetitionStackParamList, 'InterCompetitionList'>;

const FORMAT_LABEL: Record<string, string> = {
  league: 'Ligue', bracket: 'Élimination', pool: 'Poules', swiss: 'Suisse',
};
const STATUS_COLOR: Record<string, string> = {
  open: '#22C55E', active: '#C9A227', closed: '#6B7280',
};
const STATUS_LABEL: Record<string, string> = {
  open: 'Inscriptions ouvertes', active: 'En cours', closed: 'Terminé',
};

interface InterComp {
  id: string;
  title: string;
  description: string | null;
  format: string;
  type: string;
  team_size: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  max_participants: number | null;
  reg_count: number;
  my_registration: boolean;
}

export default function InterCompetitionListScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);

  const [comps, setComps] = useState<InterComp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('inter_competitions')
      .select('*')
      .neq('status', 'draft')
      .order('created_at', { ascending: false });

    const list = await Promise.all((data ?? []).map(async (c: any) => {
      const [{ count: reg_count }, { data: myReg }] = await Promise.all([
        supabase.from('inter_registrations').select('*', { count: 'exact', head: true }).eq('competition_id', c.id),
        user ? supabase.from('inter_registrations')
          .select('id').eq('competition_id', c.id).eq('athlete_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return { ...c, reg_count: reg_count ?? 0, my_registration: !!myReg };
    }));
    setComps(list);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function onRefresh() { setRefreshing(true); load(); }

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ChevronRight size={22} color={theme.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
        </TouchableOpacity>
        <View>
          <Text style={S.headerTitle}>Compétitions Inter-box</Text>
          <Text style={S.headerSub}>Affronte les meilleurs de toutes les box</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={S.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {comps.length === 0 ? (
            <View style={S.empty}>
              <Globe2 size={48} color={theme.textMuted} />
              <Text style={S.emptyTitle}>Aucune compétition disponible</Text>
              <Text style={S.emptyText}>Les prochaines compétitions inter-box apparaîtront ici.</Text>
            </View>
          ) : (
            comps.map(c => {
              const statusColor = STATUS_COLOR[c.status] ?? theme.textMuted;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={S.card}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('InterCompetitionDetail', { competitionId: c.id })}
                >
                  {/* Top accent line for active */}
                  {c.status === 'active' && <View style={S.activeBar} />}

                  <View style={S.cardHeader}>
                    <View style={S.cardIcon}>
                      <Globe2 size={20} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.cardTitle}>{c.title}</Text>
                      <View style={S.badgeRow}>
                        <View style={[S.badge, { backgroundColor: `${statusColor}18` }]}>
                          <Text style={[S.badgeText, { color: statusColor }]}>{STATUS_LABEL[c.status] ?? c.status}</Text>
                        </View>
                        <View style={[S.badge, { backgroundColor: `${theme.accent}15` }]}>
                          <Text style={[S.badgeText, { color: theme.accent }]}>{FORMAT_LABEL[c.format] ?? c.format}</Text>
                        </View>
                        <View style={[S.badge, { backgroundColor: theme.surface }]}>
                          <Text style={[S.badgeText, { color: theme.textMuted }]}>
                            {c.type === 'individual' ? 'Individuel' : `Équipe ×${c.team_size}`}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {c.description ? (
                    <Text style={S.cardDesc} numberOfLines={2}>{c.description}</Text>
                  ) : null}

                  <View style={S.cardFooter}>
                    <View style={S.footerItem}>
                      <Users size={12} color={theme.textMuted} />
                      <Text style={S.footerText}>
                        {c.reg_count}{c.max_participants ? `/${c.max_participants}` : ''} inscrits
                      </Text>
                    </View>
                    {c.starts_at && (
                      <View style={S.footerItem}>
                        <Calendar size={12} color={theme.textMuted} />
                        <Text style={S.footerText}>{new Date(c.starts_at).toLocaleDateString('fr-FR')}</Text>
                      </View>
                    )}
                    {c.my_registration && (
                      <View style={[S.badge, { backgroundColor: `${theme.accent}20` }]}>
                        <Text style={[S.badgeText, { color: theme.accent }]}>✓ Inscrit</Text>
                      </View>
                    )}
                    <ChevronRight size={16} color={theme.textMuted} style={{ marginLeft: 'auto' as any }} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
      backgroundColor: theme.card,
      borderBottomWidth: 1, borderBottomColor: theme.border,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
    headerSub:   { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    content:     { padding: 16 },
    card: {
      backgroundColor: theme.card, borderRadius: 18,
      borderWidth: 1, borderColor: theme.border,
      marginBottom: 12, overflow: 'hidden',
      padding: 16,
    },
    activeBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#C9A227' },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
    cardIcon: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: '#C9A22720',
      justifyContent: 'center', alignItems: 'center',
    },
    cardTitle: { fontSize: 15, fontWeight: '800', color: theme.text, marginBottom: 6 },
    badgeRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    cardDesc: { fontSize: 13, color: theme.textMuted, lineHeight: 18, marginBottom: 12 },
    cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    footerText: { fontSize: 12, color: theme.textMuted },
    empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    emptyText:  { fontSize: 13, color: theme.textMuted, textAlign: 'center' },
  });
}
