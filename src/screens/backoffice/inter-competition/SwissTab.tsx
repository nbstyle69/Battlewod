import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppTheme } from '../../../context/ThemeContext';
import { SwissRound, SwissPairing, SwissStanding, TabStyleSheet } from './types';

function SwissPairingCard({ pairing, theme, S, onResolve }: {
  pairing: SwissPairing; theme: AppTheme; S: TabStyleSheet;
  onResolve: (pairing: SwissPairing, s1: number, s2: number) => void;
}) {
  const { t } = useTranslation();
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  if (pairing.status === 'bye') {
    return (
      <View style={[S.matchCard, { paddingVertical: 6 }]}>
        <View style={S.matchRow}>
          <Text style={[S.matchPlayer, S.matchWinner]}>{pairing.a1_username}</Text>
          <Text style={{ fontSize: 11, color: theme.textMuted }}>BYE</Text>
          <Text style={S.matchPlayer}>—</Text>
        </View>
      </View>
    );
  }
  if (pairing.status === 'completed') {
    return (
      <View style={[S.matchCard, { paddingVertical: 6 }]}>
        <View style={S.matchRow}>
          <Text style={[S.matchPlayer, pairing.winner_id === pairing.athlete1_id && S.matchWinner]}>{pairing.a1_username}</Text>
          <Text style={{ fontSize: 11, color: theme.textMuted }}>{pairing.score1} - {pairing.score2}</Text>
          <Text style={[S.matchPlayer, pairing.winner_id === pairing.athlete2_id && S.matchWinner]}>{pairing.a2_username}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[S.matchCard, { paddingVertical: 8 }]}>
      <View style={S.matchRow}>
        <Text style={S.matchPlayer}>{pairing.a1_username}</Text>
        <Text style={{ fontSize: 11, color: theme.textMuted }}>vs</Text>
        <Text style={S.matchPlayer}>{pairing.a2_username}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <TextInput
          style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 8, padding: 8, fontSize: 13, color: theme.text, textAlign: 'center', borderWidth: 1, borderColor: theme.border }}
          value={s1} onChangeText={setS1} placeholder={t('bo.interComp.score')} placeholderTextColor={theme.textMuted} keyboardType="numeric"
        />
        <Text style={{ fontSize: 11, color: theme.textMuted }}>-</Text>
        <TextInput
          style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 8, padding: 8, fontSize: 13, color: theme.text, textAlign: 'center', borderWidth: 1, borderColor: theme.border }}
          value={s2} onChangeText={setS2} placeholder={t('bo.interComp.score')} placeholderTextColor={theme.textMuted} keyboardType="numeric"
        />
        <TouchableOpacity
          style={{ backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
          onPress={() => {
            const n1 = parseFloat(s1); const n2 = parseFloat(s2);
            if (isNaN(n1) || isNaN(n2)) { Alert.alert(t('common.error'), t('bo.interComp.enterBothScores')); return; }
            onResolve(pairing, n1, n2);
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>OK</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface Props {
  swissRounds: SwissRound[];
  swissPairings: SwissPairing[];
  swissStandings: SwissStanding[];
  registrationCount: number;
  theme: AppTheme;
  S: TabStyleSheet;
  onGenerateRound: () => void;
  onResolvePairing: (pairing: SwissPairing, s1: number, s2: number) => void;
}

export default function SwissTab({
  swissRounds, swissPairings, swissStandings, registrationCount, theme, S,
  onGenerateRound, onResolvePairing,
}: Props) {
  const { t } = useTranslation();
  return (
    <View style={S.section}>
      {/* Standings */}
      {swissStandings.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={S.roundTitle}>{t('bo.interComp.standings')}</Text>
          {swissStandings.map((st, i) => (
            <View key={st.id} style={[S.matchCard, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[S.matchPlayer, { width: 20 }]}>{i + 1}.</Text>
                <Text style={S.matchPlayer}>{st.username}</Text>
              </View>
              <Text style={[S.matchPlayer, { color: theme.accent }]}>
                {t('bo.interComp.swissRecord', { points: st.points, w: st.wins, d: st.draws, l: st.losses, b: st.buchholz })}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Rounds */}
      {swissRounds.length === 0 ? (
        <View style={S.bracketEmpty}>
          <Text style={S.emptyText}>{t('bo.interComp.noSwissRound')}</Text>
          <TouchableOpacity style={S.generateBtn} onPress={onGenerateRound}>
            <Text style={S.generateBtnText}>{t('bo.interComp.generateRound1', { count: registrationCount })}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {swissRounds.map(round => {
            const roundPairings = swissPairings.filter(p => p.round_id === round.id);
            const completedCount = roundPairings.filter(p => p.status === 'completed' || p.status === 'bye').length;
            return (
              <View key={round.id} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={S.roundTitle}>{t('bo.interComp.roundLabel', { n: round.round_number })}</Text>
                  <Text style={{ fontSize: 11, color: round.status === 'completed' ? theme.success : theme.textMuted }}>
                    {round.status === 'completed' ? t('bo.interComp.statusCompleted') : `${completedCount}/${roundPairings.length}`}
                  </Text>
                </View>
                {roundPairings.map(pairing => (
                  <SwissPairingCard
                    key={pairing.id}
                    pairing={pairing}
                    theme={theme}
                    S={S}
                    onResolve={onResolvePairing}
                  />
                ))}
              </View>
            );
          })}
          {swissRounds.every(r => r.status === 'completed') && (
            <TouchableOpacity style={S.generateBtn} onPress={onGenerateRound}>
              <Text style={S.generateBtnText}>{t('bo.interComp.generateRoundN', { n: swissRounds.length + 1 })}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}
