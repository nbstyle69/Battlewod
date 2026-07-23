import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import {
  repsPerRoundFromMovements, roundsRepsToTotal, amrapTotalToRoundsReps,
  maskTimeInput, timeStringToSeconds, secondsToTimeString,
} from '../../utils/tournamentUtils';

export type ScoreKind = 'for-time' | 'reps' | 'free';

interface Props {
  /** How the score is entered: masked time, structured reps, or free text. */
  kind: ScoreKind;
  /** WOD movements (used to auto-derive reps-per-round for the recap). */
  movements?: string[] | null;
  /** Owner-set reps-per-round; falls back to the sum derived from movements. */
  repsPerRound?: number | null;
  /** Canonical value to prefill (seconds for time, total reps for reps, raw for free). */
  initialCanonical?: string | null;
  /** Reports the canonical value (string) and whether it is a valid entry. */
  onChange: (canonical: string, valid: boolean) => void;
  /** Placeholder for the free-text field. */
  freePlaceholder?: string;
}

/**
 * Unified score entry used by every athlete score-submission surface.
 * - For Time: single masked "mm:ss" field, stores the canonical TOTAL SECONDS.
 * - AMRAP/Max Reps: "rounds + reps" ⇄ "total reps" toggle with a live recap,
 *   both modes converge to the same stored TOTAL REPS number.
 * - Free: a plain text field (loads, custom scoring, …).
 */
export default function ScoreEntryFields({
  kind, movements, repsPerRound, initialCanonical, onChange, freePlaceholder,
}: Props) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const S = createStyles(theme);

  const perRound = (repsPerRound ?? 0) > 0
    ? (repsPerRound as number)
    : repsPerRoundFromMovements(movements);
  const canUseRounds = kind === 'reps' && perRound > 0;

  // ── reps state ──
  const [scoreMode, setScoreMode] = useState<'rounds' | 'reps'>(
    canUseRounds && !initialCanonical ? 'rounds' : 'reps',
  );
  const [roundsInput, setRoundsInput] = useState('');
  const [partialReps, setPartialReps] = useState('');
  const [totalRepsInput, setTotalRepsInput] = useState(
    kind === 'reps' ? (initialCanonical ?? '') : '',
  );

  // ── time state (display "mm:ss") ──
  const [timeInput, setTimeInput] = useState(
    kind === 'for-time' && initialCanonical
      ? secondsToTimeString(timeStringToSeconds(initialCanonical))
      : '',
  );

  // ── free state ──
  const [freeInput, setFreeInput] = useState(
    kind === 'free' ? (initialCanonical ?? '') : '',
  );

  const repsTotal = scoreMode === 'rounds'
    ? roundsRepsToTotal(parseInt(roundsInput || '0', 10) || 0, parseInt(partialReps || '0', 10) || 0, perRound)
    : (parseInt(totalRepsInput || '0', 10) || 0);
  const timeSeconds = timeStringToSeconds(timeInput);

  useEffect(() => {
    if (kind === 'reps') onChange(String(repsTotal), repsTotal > 0);
    else if (kind === 'for-time') onChange(String(timeSeconds), timeSeconds > 0);
    else onChange(freeInput.trim(), freeInput.trim().length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, repsTotal, timeSeconds, freeInput]);

  if (kind === 'for-time') {
    return (
      <>
        <Text style={S.fieldLabel}>{t('scoreEntry.timeField')}</Text>
        <TextInput
          style={S.input}
          value={timeInput}
          onChangeText={v => setTimeInput(maskTimeInput(v))}
          placeholder="00:00"
          placeholderTextColor={theme.textMuted}
          keyboardType="number-pad"
        />
        <Text style={S.recapTotal}>{t('scoreEntry.timeRecap', { time: secondsToTimeString(timeSeconds) })}</Text>
        <Text style={S.hint}>{t('scoreEntry.timeHelp')}</Text>
      </>
    );
  }

  if (kind === 'free') {
    return (
      <TextInput
        style={S.input}
        value={freeInput}
        onChangeText={setFreeInput}
        placeholder={freePlaceholder ?? ''}
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
      />
    );
  }

  // reps
  return (
    <>
      {canUseRounds && (
        <View style={S.modeRow}>
          <TouchableOpacity
            style={[S.modeBtn, scoreMode === 'rounds' && S.modeBtnActive]}
            onPress={() => setScoreMode('rounds')}
          >
            <Text style={[S.modeBtnText, scoreMode === 'rounds' && S.modeBtnTextActive]}>
              {t('scoreEntry.modeRounds')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.modeBtn, scoreMode === 'reps' && S.modeBtnActive]}
            onPress={() => setScoreMode('reps')}
          >
            <Text style={[S.modeBtnText, scoreMode === 'reps' && S.modeBtnTextActive]}>
              {t('scoreEntry.modeTotalReps')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {canUseRounds && scoreMode === 'rounds' ? (
        <View style={S.repsRow}>
          <View style={S.repsCol}>
            <Text style={S.fieldLabel}>{t('scoreEntry.roundsField')}</Text>
            <TextInput
              style={S.input}
              value={roundsInput}
              onChangeText={v => setRoundsInput(v.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
            />
          </View>
          <View style={S.repsCol}>
            <Text style={S.fieldLabel}>{t('scoreEntry.partialRepsField')}</Text>
            <TextInput
              style={S.input}
              value={partialReps}
              onChangeText={v => setPartialReps(v.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
            />
          </View>
        </View>
      ) : (
        <>
          <Text style={S.fieldLabel}>{t('scoreEntry.totalRepsField')}</Text>
          <TextInput
            style={S.input}
            value={totalRepsInput}
            onChangeText={v => setTotalRepsInput(v.replace(/[^0-9]/g, ''))}
            placeholder="0"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
          />
        </>
      )}

      {perRound > 0 && (
        <Text style={S.recapPerRound}>
          {t('scoreEntry.perRoundInfo', { reps: perRound })}
          {Array.isArray(movements) && movements.length > 0 ? `  ·  ${movements.join(' / ')}` : ''}
        </Text>
      )}
      <Text style={S.recapTotal}>
        {perRound > 0
          ? t('scoreEntry.scoreRecapRounds', { total: repsTotal, ...amrapTotalToRoundsReps(repsTotal, perRound) })
          : t('scoreEntry.scoreRecap', { total: repsTotal })}
      </Text>
      <Text style={S.hint}>{t('scoreEntry.repsHelp')}</Text>
    </>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    fieldLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 },
    hint: { fontSize: 12, color: theme.textMuted, lineHeight: 18, marginTop: 2 },
    input: { backgroundColor: theme.surface, borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '900', color: theme.text, borderWidth: 1, borderColor: theme.border },
    modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    modeBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: 'center' },
    modeBtnActive: { borderColor: theme.accent, backgroundColor: `${theme.accent}18` },
    modeBtnText: { fontSize: 13, fontWeight: '700', color: theme.textMuted },
    modeBtnTextActive: { color: theme.accent },
    repsRow: { flexDirection: 'row', gap: 10 },
    repsCol: { flex: 1 },
    recapPerRound: { fontSize: 12, color: theme.textMuted, marginTop: 10, lineHeight: 17 },
    recapTotal: { fontSize: 16, fontWeight: '900', color: theme.accent, marginTop: 6 },
  });
}
