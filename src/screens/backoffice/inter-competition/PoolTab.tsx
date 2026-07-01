import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert } from 'react-native';
import { AppTheme } from '../../../context/ThemeContext';
import { PoolGroup, PoolMember, PoolMatch, TabStyleSheet } from './types';

function PoolMatchCard({ match, theme, S, onResolve }: {
  match: PoolMatch; theme: AppTheme; S: TabStyleSheet;
  onResolve: (match: PoolMatch, s1: number, s2: number) => void;
}) {
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  if (match.status === 'completed') {
    return (
      <View style={[S.matchCard, { paddingVertical: 6 }]}>
        <View style={S.matchRow}>
          <Text style={[S.matchPlayer, match.winner_id === match.athlete1_id && S.matchWinner]}>{match.a1_username}</Text>
          <Text style={{ fontSize: 11, color: theme.textMuted }}>{match.score1} - {match.score2}</Text>
          <Text style={[S.matchPlayer, match.winner_id === match.athlete2_id && S.matchWinner]}>{match.a2_username}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[S.matchCard, { paddingVertical: 8 }]}>
      <View style={S.matchRow}>
        <Text style={S.matchPlayer}>{match.a1_username}</Text>
        <Text style={{ fontSize: 11, color: theme.textMuted }}>vs</Text>
        <Text style={S.matchPlayer}>{match.a2_username}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <TextInput
          style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 8, padding: 8, fontSize: 13, color: theme.text, textAlign: 'center', borderWidth: 1, borderColor: theme.border }}
          value={s1} onChangeText={setS1} placeholder="Score" placeholderTextColor={theme.textMuted} keyboardType="numeric"
        />
        <Text style={{ fontSize: 11, color: theme.textMuted }}>-</Text>
        <TextInput
          style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 8, padding: 8, fontSize: 13, color: theme.text, textAlign: 'center', borderWidth: 1, borderColor: theme.border }}
          value={s2} onChangeText={setS2} placeholder="Score" placeholderTextColor={theme.textMuted} keyboardType="numeric"
        />
        <TouchableOpacity
          style={{ backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
          onPress={() => {
            const n1 = parseFloat(s1); const n2 = parseFloat(s2);
            if (isNaN(n1) || isNaN(n2)) { Alert.alert('Erreur', 'Entrez les deux scores'); return; }
            onResolve(match, n1, n2);
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>OK</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface Props {
  poolGroups: PoolGroup[];
  poolMembers: PoolMember[];
  poolMatches: PoolMatch[];
  registrationCount: number;
  theme: AppTheme;
  S: TabStyleSheet;
  onGeneratePool: () => void;
  onResolveMatch: (match: PoolMatch, s1: number, s2: number) => void;
}

export default function PoolTab({
  poolGroups, poolMembers, poolMatches, registrationCount, theme, S,
  onGeneratePool, onResolveMatch,
}: Props) {
  if (poolGroups.length === 0) {
    return (
      <View style={S.section}>
        <View style={S.bracketEmpty}>
          <Text style={S.emptyText}>Poules non generees.</Text>
          <TouchableOpacity style={S.generateBtn} onPress={onGeneratePool}>
            <Text style={S.generateBtnText}>Generer les poules ({registrationCount} inscrits)</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={S.section}>
      {poolGroups.map(group => {
        const members = poolMembers.filter(m => m.group_id === group.id).sort((a, b) => b.points - a.points);
        const matches = poolMatches.filter(m => m.group_id === group.id);
        return (
          <View key={group.id} style={{ marginBottom: 16 }}>
            <Text style={S.roundTitle}>{group.group_name}</Text>
            {members.map((m, i) => (
              <View key={m.id} style={[S.matchCard, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[S.matchPlayer, { width: 20 }]}>{i + 1}.</Text>
                  <Text style={S.matchPlayer}>{m.username}</Text>
                </View>
                <Text style={[S.matchPlayer, { color: theme.accent }]}>
                  {m.points}pts ({m.wins}V {m.draws}N {m.losses}D)
                </Text>
              </View>
            ))}
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted, marginTop: 8, marginBottom: 4 }}>
              Matchs ({matches.filter(m => m.status === 'completed').length}/{matches.length})
            </Text>
            {matches.map(match => (
              <PoolMatchCard
                key={match.id}
                match={match}
                theme={theme}
                S={S}
                onResolve={onResolveMatch}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}
