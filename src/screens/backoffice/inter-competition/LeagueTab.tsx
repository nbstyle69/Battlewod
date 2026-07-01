import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Plus, Play } from 'lucide-react-native';
import { AppTheme } from '../../../context/ThemeContext';
import { LeagueRound, LeagueStanding, InterWod, TabStyleSheet } from './types';

interface Props {
  leagueRounds: LeagueRound[];
  leagueStandings: LeagueStanding[];
  wods: InterWod[];
  theme: AppTheme;
  S: TabStyleSheet;
  onCreateRound: () => void;
  onComputeRound: (roundNumber: number) => void;
}

export default function LeagueTab({
  leagueRounds, leagueStandings, wods, theme, S,
  onCreateRound, onComputeRound,
}: Props) {
  return (
    <View style={S.section}>
      {/* Standings */}
      <Text style={S.roundTitle}>Classement general</Text>
      {leagueStandings.length === 0 ? (
        <Text style={S.emptyText}>Aucun classement — calculez les points d'une journee</Text>
      ) : (
        leagueStandings.map((s, i) => (
          <View key={s.id} style={[S.matchCard, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[S.matchPlayer, { width: 24 }]}>{i + 1}.</Text>
              <Text style={S.matchPlayer}>{s.username ?? s.athlete_id.slice(0, 8)}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Text style={[S.matchPlayer, { color: theme.accent }]}>{s.total_points} pts</Text>
              <Text style={{ fontSize: 11, color: theme.textMuted }}>{s.wins}W {s.podiums}P | {s.rounds_played}j</Text>
            </View>
          </View>
        ))
      )}

      {/* Rounds (journees) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <Text style={S.roundTitle}>Journees</Text>
        <TouchableOpacity style={S.generateBtn} onPress={onCreateRound}>
          <Plus color="#fff" size={12} />
          <Text style={S.generateBtnText}>Ajouter journee</Text>
        </TouchableOpacity>
      </View>

      {leagueRounds.length === 0 ? (
        <Text style={S.emptyText}>Aucune journee creee</Text>
      ) : (
        leagueRounds.map(r => (
          <View key={r.id} style={S.matchCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={S.matchPlayer}>{r.title ?? `Journee ${r.round_number}`}</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: r.status === 'completed' ? theme.success : theme.textMuted }}>
                {r.status === 'completed' ? 'Termine' : r.status === 'active' ? 'En cours' : 'A venir'}
              </Text>
            </View>
            {r.wod_id && (
              <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>WOD: {wods.find(w => w.id === r.wod_id)?.title ?? '—'}</Text>
            )}
            {r.status !== 'completed' && (
              <TouchableOpacity
                style={[S.advanceBtn, { marginTop: 8 }]}
                onPress={() => onComputeRound(r.round_number)}
              >
                <Play color="#fff" size={12} />
                <Text style={S.advanceBtnText}>Calculer les points</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </View>
  );
}
