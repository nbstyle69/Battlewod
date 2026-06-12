import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Layers, ArrowUp, ArrowDown } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useTheme, AppTheme } from '../../context/ThemeContext';

type Division = {
  id: string;
  name: string;
  level: number;
  max_members: number;
  promote_count: number;
  relegate_count: number;
};

type Member = {
  id: string;
  division_id: string;
  athlete_id: string;
  points: number;
  rank: number | null;
};

type Profile = { id: string; username: string; level?: string; elo?: number };

interface Props {
  tournamentId: string;
  currentUserId?: string;
}

export default function TournamentDivisionsView({ tournamentId, currentUserId }: Props) {
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [loading, setLoading] = useState(true);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: divs } = await (supabase as any)
        .from('tournament_divisions').select('*')
        .eq('tournament_id', tournamentId).order('level');
      if (cancelled) return;
      const dList = (divs ?? []) as Division[];
      setDivisions(dList);

      const divIds = dList.map(d => d.id);
      if (divIds.length === 0) { setMembers([]); setLoading(false); return; }

      const { data: mems } = await (supabase as any)
        .from('tournament_division_members').select('*')
        .in('division_id', divIds);
      if (cancelled) return;
      const mList = (mems ?? []) as Member[];
      setMembers(mList);

      const ids = Array.from(new Set(mList.map(m => m.athlete_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles').select('id, username, level, elo').in('id', ids);
        const map: Record<string, Profile> = {};
        (profs ?? []).forEach((p: any) => { map[p.id] = p; });
        if (!cancelled) setProfiles(map);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tournamentId]);

  if (loading) {
    return <View style={S.center}><ActivityIndicator color={theme.accent} /></View>;
  }
  if (divisions.length === 0) {
    return (
      <View style={S.center}>
        <Layers color={theme.textMuted} size={32} />
        <Text style={S.empty}>Aucune division configurée pour ce tournoi.</Text>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {divisions.map((d, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === divisions.length - 1;
        const rows = members
          .filter(m => m.division_id === d.id)
          .sort((a, b) => b.points - a.points || (a.rank ?? 999) - (b.rank ?? 999));

        return (
          <View key={d.id} style={S.divCard}>
            <View style={S.divHeader}>
              <View style={S.divBadge}><Text style={S.divBadgeTxt}>{d.level}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={S.divName}>{d.name}</Text>
                <Text style={S.divMeta}>
                  {rows.length} / {d.max_members} athlètes
                  {!isFirst && d.promote_count > 0 ? `  ·  ↑ ${d.promote_count} promus` : ''}
                  {!isLast && d.relegate_count > 0 ? `  ·  ↓ ${d.relegate_count} relégués` : ''}
                </Text>
              </View>
            </View>

            {rows.length === 0 ? (
              <Text style={S.divEmpty}>Aucun athlète.</Text>
            ) : rows.map((m, rIdx) => {
              const p = profiles[m.athlete_id];
              const isMe = currentUserId && m.athlete_id === currentUserId;
              const willPromote = !isFirst && rIdx < d.promote_count;
              const willRelegate = !isLast && rIdx >= rows.length - d.relegate_count;
              return (
                <View key={m.id} style={[S.row, isMe && S.rowMe]}>
                  <Text style={S.rank}>{rIdx + 1}</Text>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[S.username, isMe && S.usernameMe]} numberOfLines={1}>
                      {p?.username ?? '—'}
                    </Text>
                    {willPromote && <View style={[S.tag, { backgroundColor: 'rgba(34,197,94,0.15)' }]}><ArrowUp color="#22C55E" size={9} /><Text style={[S.tagTxt, { color: '#22C55E' }]}>PROMU</Text></View>}
                    {willRelegate && <View style={[S.tag, { backgroundColor: 'rgba(239,68,68,0.15)' }]}><ArrowDown color="#EF4444" size={9} /><Text style={[S.tagTxt, { color: '#EF4444' }]}>RELÉG.</Text></View>}
                  </View>
                  <Text style={S.points}>{m.points} pts</Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  center: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center', gap: 12 },
  empty: { color: theme.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  divCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  divHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  divBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(168,85,247,0.18)', alignItems: 'center', justifyContent: 'center' },
  divBadgeTxt: { color: '#A855F7', fontWeight: '900', fontSize: 13 },
  divName: { color: theme.textPrimary, fontWeight: '900', fontSize: 14 },
  divMeta: { color: theme.textMuted, fontSize: 10, marginTop: 1 },
  divEmpty: { color: theme.textMuted, fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  rowMe: { backgroundColor: 'rgba(245,197,24,0.06)', borderRadius: 8, paddingHorizontal: 8 },
  rank: { color: theme.textMuted, fontWeight: '700', fontSize: 12, width: 22 },
  username: { color: theme.textPrimary, fontWeight: '600', fontSize: 13 },
  usernameMe: { color: '#F5C518', fontWeight: '900' },
  points: { color: theme.accent, fontWeight: '900', fontSize: 12 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  tagTxt: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
});
