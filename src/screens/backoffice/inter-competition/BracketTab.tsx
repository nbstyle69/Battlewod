import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Trophy, GitBranch, Play } from 'lucide-react-native';
import { AppTheme } from '../../../context/ThemeContext';
import { BracketMatch, TabStyleSheet } from './types';

interface Props {
  bracketMatches: BracketMatch[];
  registrationCount: number;
  theme: AppTheme;
  S: TabStyleSheet;
  onGenerateBracket: () => void;
  onResolveMatch: (match: BracketMatch, winnerId: string) => void;
  onAdvanceRound: () => void;
}

export default function BracketTab({
  bracketMatches, registrationCount, theme, S,
  onGenerateBracket, onResolveMatch, onAdvanceRound,
}: Props) {
  if (bracketMatches.length === 0) {
    return (
      <View style={S.section}>
        <View style={S.bracketEmpty}>
          <GitBranch color={theme.textMuted} size={32} />
          <Text style={S.emptyText}>Bracket non genere.</Text>
          <TouchableOpacity style={S.generateBtn} onPress={onGenerateBracket}>
            <Text style={S.generateBtnText}>Generer le bracket ({registrationCount} inscrits)</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={S.section}>
      <TouchableOpacity style={S.advanceBtn} onPress={onAdvanceRound}>
        <Play color="#fff" size={12} />
        <Text style={S.advanceBtnText}>Avancer au round suivant</Text>
      </TouchableOpacity>

      {Object.entries(
        bracketMatches.reduce((acc, m) => {
          (acc[m.round] ??= []).push(m);
          return acc;
        }, {} as Record<number, BracketMatch[]>)
      ).sort(([a], [b]) => Number(a) - Number(b)).map(([round, matches]) => (
        <View key={round} style={S.roundSection}>
          <Text style={S.roundTitle}>Round {round}</Text>
          {matches.map(match => (
            <View key={match.id} style={S.matchCard}>
              <View style={S.matchRow}>
                <Text style={[S.matchPlayer, match.winner_id === match.participant1_id && S.matchWinner]}>
                  {match.p1_username ?? 'BYE'}
                </Text>
                <Text style={S.matchVs}>vs</Text>
                <Text style={[S.matchPlayer, match.winner_id === match.participant2_id && S.matchWinner]}>
                  {match.p2_username ?? 'BYE'}
                </Text>
              </View>

              {(match.p1_score || match.p2_score) && (
                <View style={S.matchScores}>
                  <Text style={S.matchScoreText}>
                    {match.p1_score?.score_display ?? match.p1_score?.score_value ?? '—'}
                  </Text>
                  <Text style={S.matchScoreSep}>-</Text>
                  <Text style={S.matchScoreText}>
                    {match.p2_score?.score_display ?? match.p2_score?.score_value ?? '—'}
                  </Text>
                </View>
              )}

              {match.status !== 'completed' && match.status !== 'bye' && match.participant1_id && match.participant2_id && (
                <View style={S.resolveRow}>
                  <TouchableOpacity
                    style={S.resolveBtn}
                    onPress={() => onResolveMatch(match, match.participant1_id!)}
                  >
                    <Trophy color="#fff" size={10} />
                    <Text style={S.resolveBtnText}>{match.p1_username}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.resolveBtn, { backgroundColor: theme.error }]}
                    onPress={() => onResolveMatch(match, match.participant2_id!)}
                  >
                    <Trophy color="#fff" size={10} />
                    <Text style={S.resolveBtnText}>{match.p2_username}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {match.status === 'completed' && (
                <Text style={S.matchResolved}>
                  Gagnant : {match.winner_id === match.participant1_id ? match.p1_username : match.p2_username}
                </Text>
              )}
              {match.status === 'bye' && (
                <Text style={S.matchBye}>BYE — avance automatiquement</Text>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
