import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Plus, Play } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  return (
    <View style={S.section}>
      {/* Standings */}
      <Text style={S.roundTitle}>{t('bo.interComp.leagueStandings')}</Text>
      {leagueStandings.length === 0 ? (
        <Text style={S.emptyText}>{t('bo.interComp.noStandings')}</Text>
      ) : (
        leagueStandings.map((s, i) => (
          <View key={s.id} style={[S.matchCard, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[S.matchPlayer, { width: 24 }]}>{i + 1}.</Text>
              <Text style={S.matchPlayer}>{s.username ?? s.athlete_id.slice(0, 8)}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Text style={[S.matchPlayer, { color: theme.accent }]}>{t('bo.interComp.pts', { n: s.total_points })}</Text>
              <Text style={{ fontSize: 11, color: theme.textMuted }}>{t('bo.interComp.leagueRecord', { w: s.wins, p: s.podiums, j: s.rounds_played })}</Text>
            </View>
          </View>
        ))
      )}

      {/* Rounds (journees) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <Text style={S.roundTitle}>{t('bo.interComp.rounds')}</Text>
        <TouchableOpacity style={S.generateBtn} onPress={onCreateRound}>
          <Plus color="#fff" size={12} />
          <Text style={S.generateBtnText}>{t('bo.interComp.addRound')}</Text>
        </TouchableOpacity>
      </View>

      {leagueRounds.length === 0 ? (
        <Text style={S.emptyText}>{t('bo.interComp.noRounds')}</Text>
      ) : (
        leagueRounds.map(r => (
          <View key={r.id} style={S.matchCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={S.matchPlayer}>{r.title ?? t('bo.interComp.roundN', { n: r.round_number })}</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: r.status === 'completed' ? theme.success : theme.textMuted }}>
                {r.status === 'completed' ? t('bo.interComp.statusCompleted') : r.status === 'active' ? t('bo.interComp.statusActive') : t('bo.interComp.statusUpcoming')}
              </Text>
            </View>
            {r.wod_id && (
              <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>{t('bo.interComp.wodLabel', { title: wods.find(w => w.id === r.wod_id)?.title ?? '—' })}</Text>
            )}
            {r.status !== 'completed' && (
              <TouchableOpacity
                style={[S.advanceBtn, { marginTop: 8 }]}
                onPress={() => onComputeRound(r.round_number)}
              >
                <Play color="#fff" size={12} />
                <Text style={S.advanceBtnText}>{t('bo.interComp.computePoints')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </View>
  );
}
