import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Crown, GitBranch, Trophy } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useTheme, AppTheme } from '../../context/ThemeContext';

type Match = {
  id: string;
  round: number;
  match_number: number;
  side: 'winner' | 'loser' | 'grand_final';
  participant1_id: string | null;
  participant2_id: string | null;
  winner_id: string | null;
  loser_id: string | null;
  status: 'pending' | 'active' | 'completed' | 'bye';
  wod_id: string | null;
};

type Profile = { id: string; username: string; level?: string };
type WodLite = { id: string; title: string; bracket_stage: number | null };

interface Props {
  tournamentId: string;
  format: 'bracket' | 'swiss';
  currentUserId?: string;
}

export default function TournamentBracketView({ tournamentId, format, currentUserId }: Props) {
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [wods, setWods] = useState<WodLite[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: m } = await (supabase as any)
        .from('tournament_bracket_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round')
        .order('side')
        .order('match_number');
      if (cancelled) return;
      const list = (m ?? []) as Match[];
      setMatches(list);

      const { data: w } = await (supabase as any)
        .from('tournament_wods')
        .select('id, title, bracket_stage')
        .eq('tournament_id', tournamentId);
      if (!cancelled) setWods((w ?? []) as WodLite[]);

      const ids = Array.from(new Set(
        list.flatMap(x => [x.participant1_id, x.participant2_id, x.winner_id, x.loser_id])
            .filter((x): x is string => !!x)
      ));
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles').select('id, username, level').in('id', ids);
        const map: Record<string, Profile> = {};
        (profs ?? []).forEach((p: any) => { map[p.id] = p; });
        if (!cancelled) setProfiles(map);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tournamentId]);

  const grouped = useMemo(() => {
    const wb: Record<number, Match[]> = {};
    const lb: Record<number, Match[]> = {};
    let gf: Match | null = null;
    matches.forEach(m => {
      if (m.side === 'grand_final') gf = m;
      else if (m.side === 'winner') (wb[m.round] ??= []).push(m);
      else (lb[m.round] ??= []).push(m);
    });
    Object.values(wb).forEach(a => a.sort((x, y) => x.match_number - y.match_number));
    Object.values(lb).forEach(a => a.sort((x, y) => x.match_number - y.match_number));
    return { wb, lb, gf };
  }, [matches]);

  if (loading) {
    return (
      <View style={S.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (matches.length === 0) {
    return (
      <View style={S.center}>
        <GitBranch color={theme.textMuted} size={32} />
        <Text style={S.empty}>Le bracket sera généré par l'organisateur après les inscriptions.</Text>
      </View>
    );
  }

  const wbRounds = Object.keys(grouped.wb).map(Number).sort((a, b) => a - b);
  const lbRounds = Object.keys(grouped.lb).map(Number).sort((a, b) => a - b);

  // Map each WB round to its assigned WOD via bracket_stage (distance to final).
  const maxWBRound = wbRounds.length ? wbRounds[wbRounds.length - 1] : 0;
  function wodNameForRound(r: number): string | null {
    const stage = maxWBRound - r;
    return wods.find(w => w.bracket_stage === stage)?.title ?? null;
  }

  function name(id: string | null) {
    if (!id) return '—';
    return profiles[id]?.username ?? id.slice(0, 6);
  }

  function MatchBox({ m }: { m: Match }) {
    const involvesMe = currentUserId && (m.participant1_id === currentUserId || m.participant2_id === currentUserId);
    const won = currentUserId && m.winner_id === currentUserId;
    const lost = currentUserId && m.loser_id === currentUserId;
    return (
      <View style={[S.match, involvesMe && S.matchMine, won && S.matchWon, lost && S.matchLost]}>
        <Text style={S.matchNum}>#{m.match_number}{m.status === 'bye' ? ' · BYE' : ''}</Text>
        <PlayerRow id={m.participant1_id} winner={m.winner_id === m.participant1_id} loser={m.loser_id === m.participant1_id} name={name} S={S} />
        <PlayerRow id={m.participant2_id} winner={m.winner_id === m.participant2_id} loser={m.loser_id === m.participant2_id} name={name} S={S} />
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={S.sectionTitle}><Crown color="#F5C518" size={14} />  {format === 'swiss' ? 'Winner Bracket' : 'Bracket'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {wbRounds.map(r => {
            const wodName = wodNameForRound(r);
            return (
              <View key={`wb-${r}`} style={S.column}>
                <Text style={S.colTitle}>Round {r}</Text>
                {wodName ? (
                  <View style={S.wodPill}><Text style={S.wodPillText} numberOfLines={1}>🏋️ {wodName}</Text></View>
                ) : null}
                {grouped.wb[r].map(m => <MatchBox key={m.id} m={m} />)}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {format === 'swiss' && lbRounds.length > 0 && (
        <>
          <Text style={S.sectionTitle}>Loser Bracket</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {lbRounds.map(r => (
                <View key={`lb-${r}`} style={S.column}>
                  <Text style={S.colTitle}>LB Round {r}</Text>
                  {grouped.lb[r].map(m => <MatchBox key={m.id} m={m} />)}
                </View>
              ))}
            </View>
          </ScrollView>
        </>
      )}

      {format === 'swiss' && grouped.gf && (
        <>
          <Text style={[S.sectionTitle, { color: '#F5C518' }]}><Trophy color="#F5C518" size={14} />  Grande finale</Text>
          <View style={[S.column, { width: 220 }]}>
            <MatchBox m={grouped.gf} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function PlayerRow({ id, winner, loser, name, S }: { id: string | null; winner: boolean; loser: boolean; name: (id: string | null) => string; S: any }) {
  return (
    <View style={[S.player, winner && S.playerWinner, loser && S.playerLoser]}>
      <Text style={[S.playerName, winner && S.playerNameWinner, loser && S.playerNameLoser]} numberOfLines={1}>
        {name(id)}
      </Text>
      {winner && <Crown color="#F5C518" size={11} />}
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  center: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center', gap: 12 },
  empty: { color: theme.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  sectionTitle: { color: theme.textPrimary, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  column: { width: 200, gap: 10 },
  colTitle: { color: theme.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
  wodPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  wodPillText: { color: '#C4A0F5', fontSize: 10, fontWeight: '800' },
  match: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  matchMine: { borderColor: theme.accent + '60' },
  matchWon: { backgroundColor: 'rgba(34,197,94,0.08)' },
  matchLost: { opacity: 0.55 },
  matchNum: { color: theme.textMuted, fontSize: 9, fontWeight: '700', marginBottom: 4 },
  player: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)', marginBottom: 4 },
  playerWinner: { backgroundColor: 'rgba(245,197,24,0.12)' },
  playerLoser: { backgroundColor: 'rgba(255,255,255,0.02)' },
  playerName: { color: theme.textPrimary, fontSize: 12, fontWeight: '600', flex: 1 },
  playerNameWinner: { color: '#F5C518', fontWeight: '900' },
  playerNameLoser: { color: theme.textMuted, textDecorationLine: 'line-through' },
});
