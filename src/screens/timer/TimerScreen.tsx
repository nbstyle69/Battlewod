import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { ChevronLeft, Timer, Video, Plus, Minus, Trash2, Type, Clock, Camera } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { HomeStackParamList, TimerType, SeqBlock, BlockType } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Timer'>;

const TABS: { key: TimerType; label: string; emoji: string; desc: string }[] = [
  { key: 'for-time',  label: 'FOR TIME',     emoji: '⏱',  desc: 'Chrono montant avec cap optionnel' },
  { key: 'amrap',     label: 'AMRAP',        emoji: '🔄',  desc: 'As Many Rounds As Possible' },
  { key: 'emom',      label: 'EMOM',         emoji: '📡',  desc: 'Every Minute On the Minute' },
  { key: 'tabata',    label: 'TABATA',       emoji: '⚡',  desc: 'Intervalles travail / repos' },
  { key: 'ywyr',      label: 'YWYR',         emoji: '💪',  desc: 'Your Work Your Rest' },
  { key: 'splits',    label: 'SPLITS',       emoji: '✂️',  desc: 'Rounds chronométrés séparément' },
  { key: 'libre',     label: 'PERSONNALISÉ', emoji: '🔧',  desc: 'Séquence de blocs sur mesure' },
];

const BLOCK_TYPES: { key: BlockType; label: string }[] = [
  { key: 'for-time', label: 'FOR TIME' },
  { key: 'amrap',    label: 'AMRAP' },
  { key: 'emom',     label: 'EMOM' },
  { key: 'tabata',   label: 'TABATA' },
  { key: 'ywyr',     label: 'YWYR' },
];

function makeBlock(): SeqBlock {
  return makeTypedBlock('amrap');
}

function makeTypedBlock(type: BlockType): SeqBlock {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    durationMin: type === 'amrap' ? 10 : 0,
    emomInterval: 1, emomRounds: 10, emomCustomSec: 90,
    workSec: 20, restSec: 10, tabRounds: 8,
    pauseSec: 0,
  };
}

const COUNTDOWN_OPTS = [0, 3, 5, 10, 15, 30];
const EMOM_INTERVALS = [1, 2, 3, 4, 5];

function Stepper({
  value, onDec, onInc, unit, minVal = 0,
}: { value: number; onDec: () => void; onInc: () => void; unit: string; minVal?: number }) {
  const { theme } = useTheme();
  const S = createStyles(theme);
  return (
    <View style={S.stepperRow}>
      <TouchableOpacity onPress={onDec} style={S.stepperBtn} disabled={value <= minVal} activeOpacity={0.7}>
        <Minus color={value <= minVal ? theme.textMuted : theme.text} size={22} />
      </TouchableOpacity>
      <View style={S.stepperValueBox}>
        <Text style={S.stepperValue}>{value}</Text>
        <Text style={S.stepperUnit}>{unit}</Text>
      </View>
      <TouchableOpacity onPress={onInc} style={S.stepperBtn} activeOpacity={0.7}>
        <Plus color={theme.text} size={22} />
      </TouchableOpacity>
    </View>
  );
}

function CountdownPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { theme } = useTheme();
  const S = createStyles(theme);
  return (
    <View style={S.card}>
      <Text style={S.cardLabel}>COMPTE À REBOURS</Text>
      <View style={S.cdRow}>
        {COUNTDOWN_OPTS.map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => onChange(v)}
            style={[S.cdChip, value === v && S.cdChipActive]}
            activeOpacity={0.7}
          >
            <Text style={[S.cdChipText, value === v && S.cdChipTextActive]}>
              {v === 0 ? '—' : `${v}s`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function TimerScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [activeTab, setActiveTab] = useState<TimerType>('for-time');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [seqBlocks, setSeqBlocks] = useState<SeqBlock[]>([makeTypedBlock('for-time')]);
  const [videoTitle, setVideoTitle] = useState('');
  const [withTimestamp, setWithTimestamp] = useState(true);
  const [withCamera, setWithCamera] = useState(false);

  // Splits mode state — manual tap-to-restart timer
  const [splitsMin, setSplitsMin] = useState(1);
  const [splitsSec, setSplitsSec] = useState(30);
  const [splitsRounds, setSplitsRounds] = useState(4);

  function switchTab(key: TimerType) {
    setActiveTab(key);
    if (key === 'libre') setSeqBlocks([makeBlock()]);
    else if (key !== 'splits') setSeqBlocks([makeTypedBlock(key as BlockType)]);
    // splits doesn't use SeqBlocks — keep previous blocks untouched
  }

  function addBlock() {
    setSeqBlocks(v => [...v, activeTab === 'libre' ? makeBlock() : makeTypedBlock(activeTab as BlockType)]);
  }
  function removeBlock(id: string) { setSeqBlocks(v => v.length > 1 ? v.filter(b => b.id !== id) : v); }
  function updateBlock(id: string, patch: Partial<SeqBlock>) {
    setSeqBlocks(v => v.map(b => b.id === id ? { ...b, ...patch } : b));
  }

  function launch() {
    if (activeTab === 'splits') {
      const roundSec = Math.max(1, splitsMin * 60 + splitsSec);
      navigation.navigate('TimerRun', {
        timerType: 'splits',
        countdown: 0, // Splits = lancement direct, pas de 3-2-1
        totalSeconds: 0, maxTime: 0, interval: 0,
        rounds: Math.max(1, splitsRounds),
        workTime: roundSec, restTime: 0,
        withCamera,
        sequence: '[]',
        videoTitle: videoTitle.trim(),
        withTimestamp,
      });
      return;
    }
    if (activeTab === 'ywyr') {
      // YWYR autonome : chrono montant → FIN DU TRAVAIL → décompte → boucle infinie, fin manuelle
      navigation.navigate('TimerRun', {
        timerType: 'ywyr',
        countdown,
        totalSeconds: 0, maxTime: 0, interval: 0, rounds: 0, workTime: 0, restTime: 0,
        withCamera,
        sequence: '[]',
        videoTitle: videoTitle.trim(),
        withTimestamp,
      });
      return;
    }
    navigation.navigate('TimerRun', {
      timerType: 'libre',
      countdown,
      totalSeconds: 0, maxTime: 0, interval: 0, rounds: 0, workTime: 0, restTime: 0,
      withCamera,
      sequence: JSON.stringify(seqBlocks),
      videoTitle: videoTitle.trim(),
      withTimestamp,
    });
  }

  // Splits config card — render directly without SeqBlock plumbing
  const renderSplitsConfig = () => (
    <View style={S.seqCard}>
      <View style={S.seqCardHeader}>
        <View style={S.seqBlockNum}>
          <Text style={S.seqBlockNumText}>1</Text>
        </View>
        <View style={S.seqTypeBadge}>
          <Text style={S.seqTypeBadgeText}>SPLITS</Text>
        </View>
      </View>

      <View style={S.seqConfigRow}>
        <Text style={S.seqConfigLabel}>DURÉE PAR ROUND</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Stepper value={splitsMin} unit="min" minVal={0}
              onDec={() => setSplitsMin(v => Math.max(0, v - 1))}
              onInc={() => setSplitsMin(v => Math.min(60, v + 1))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Stepper value={splitsSec} unit="sec" minVal={0}
              onDec={() => setSplitsSec(v => v % 5 === 0 ? Math.max(0, v - 5) : Math.floor(v / 5) * 5)}
              onInc={() => setSplitsSec(v => Math.min(55, v % 5 === 0 ? v + 5 : Math.ceil(v / 5) * 5))}
            />
          </View>
        </View>
        <Text style={S.seqConfigLabel}>ROUNDS</Text>
        <Stepper value={splitsRounds} unit="rounds" minVal={1}
          onDec={() => setSplitsRounds(v => Math.max(1, v - 1))}
          onInc={() => setSplitsRounds(v => v + 1)}
        />
        <Text style={S.cardHint}>Tap entre rounds · Récup libre</Text>
      </View>
    </View>
  );

  const renderBlockConfig = (blk: SeqBlock) => (
    <>
      {(blk.type === 'amrap' || blk.type === 'for-time') && (
        <View style={S.seqConfigRow}>
          <Text style={S.seqConfigLabel}>{blk.type === 'amrap' ? 'DURÉE' : 'CAP MAX (0 = ∞)'}</Text>
          <Stepper value={blk.durationMin} unit="min" minVal={0}
            onDec={() => updateBlock(blk.id, { durationMin: Math.max(0, blk.durationMin - 1) })}
            onInc={() => updateBlock(blk.id, { durationMin: blk.durationMin + 1 })}
          />
          {blk.type === 'amrap' && <Text style={S.cardHint}>Compte à rebours · Bip final</Text>}
          {blk.type === 'for-time' && <Text style={S.cardHint}>Chrono montant · Stoppe avec ■</Text>}
        </View>
      )}
      {blk.type === 'emom' && (() => {
        const isPerso = blk.emomInterval === 0;
        const customSec = blk.emomCustomSec ?? 90;
        const customMin = Math.floor(customSec / 60);
        const customSs = customSec % 60;
        const intervalSec = isPerso ? customSec : blk.emomInterval * 60;
        const totalSec = intervalSec * blk.emomRounds;
        const totalMm = Math.floor(totalSec / 60);
        const totalSs = totalSec % 60;
        return (
        <View style={S.seqConfigRow}>
          <Text style={S.seqConfigLabel}>TYPE</Text>
          <View style={[S.chipRow, { marginTop: 0 }]}>
            {[1,2,3,4,5].map(iv => (
              <TouchableOpacity key={iv} onPress={() => {
                // Conserve la durée totale lors du changement d'interval, ajuste les rounds
                const prevIvSec = isPerso ? customSec : blk.emomInterval * 60;
                const totalMinPrev = (prevIvSec * blk.emomRounds) / 60;
                const newRounds = Math.max(1, Math.round(totalMinPrev / iv));
                updateBlock(blk.id, { emomInterval: iv, emomRounds: newRounds });
              }}
                style={[S.chip, blk.emomInterval === iv && S.chipActive]} activeOpacity={0.7}>
                <Text style={[S.chipText, blk.emomInterval === iv && S.chipTextActive]}>
                  {iv === 1 ? 'EMOM' : `E${iv}MOM`}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => updateBlock(blk.id, { emomInterval: 0 })}
              style={[S.chip, isPerso && S.chipActive]} activeOpacity={0.7}>
              <Text style={[S.chipText, isPerso && S.chipTextActive]}>PERSO</Text>
            </TouchableOpacity>
          </View>

          {isPerso && (
            <>
              <Text style={S.seqConfigLabel}>INTERVALLE PERSO</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Stepper value={customMin} unit="min" minVal={0}
                    onDec={() => updateBlock(blk.id, { emomCustomSec: Math.max(1, customSec - 60) })}
                    onInc={() => updateBlock(blk.id, { emomCustomSec: customSec + 60 })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Stepper value={customSs} unit="sec" minVal={0}
                    onDec={() => updateBlock(blk.id, { emomCustomSec: Math.max(1, customSec % 5 === 0 ? customSec - 5 : Math.floor(customSec / 5) * 5) })}
                    onInc={() => updateBlock(blk.id, { emomCustomSec: customSec % 5 === 0 ? customSec + 5 : Math.ceil(customSec / 5) * 5 })}
                  />
                </View>
              </View>
            </>
          )}

          <Text style={S.seqConfigLabel}>ROUNDS</Text>
          <Stepper value={blk.emomRounds} unit="rounds" minVal={1}
            onDec={() => updateBlock(blk.id, { emomRounds: Math.max(1, blk.emomRounds - 1) })}
            onInc={() => updateBlock(blk.id, { emomRounds: blk.emomRounds + 1 })}
          />
          <Text style={S.cardHint}>
            Bip au début de chaque interval · Total : {totalMm} min{totalSs ? ` ${totalSs}s` : ''}
          </Text>
        </View>
        );
      })()}
      {blk.type === 'tabata' && (
        <View style={S.seqConfigRow}>
          <Text style={S.seqConfigLabel}>TRAVAIL</Text>
          <Stepper value={blk.workSec} unit="sec" minVal={5}
            onDec={() => updateBlock(blk.id, { workSec: Math.max(5, blk.workSec - 5) })}
            onInc={() => updateBlock(blk.id, { workSec: blk.workSec + 5 })}
          />
          <Text style={S.seqConfigLabel}>REPOS</Text>
          <Stepper value={blk.restSec} unit="sec" minVal={5}
            onDec={() => updateBlock(blk.id, { restSec: Math.max(5, blk.restSec - 5) })}
            onInc={() => updateBlock(blk.id, { restSec: blk.restSec + 5 })}
          />
          <Text style={S.seqConfigLabel}>ROUNDS</Text>
          <Stepper value={blk.tabRounds} unit="rounds" minVal={1}
            onDec={() => updateBlock(blk.id, { tabRounds: Math.max(1, blk.tabRounds - 1) })}
            onInc={() => updateBlock(blk.id, { tabRounds: blk.tabRounds + 1 })}
          />
          <Text style={S.cardHint}>Total : {Math.floor((blk.workSec + blk.restSec) * blk.tabRounds / 60)} min {((blk.workSec + blk.restSec) * blk.tabRounds) % 60} s</Text>
        </View>
      )}
      {blk.type === 'ywyr' && (
        <Text style={S.cardHint}>Chrono libre · appuie sur FIN pour passer au repos</Text>
      )}
    </>
  );

  const renderBlocks = () => (
    <>
      {seqBlocks.map((blk, idx) => (
        <View key={blk.id} style={S.seqCard}>
          <View style={S.seqCardHeader}>
            <View style={S.seqBlockNum}>
              <Text style={S.seqBlockNumText}>{idx + 1}</Text>
            </View>
            {activeTab === 'libre' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={S.seqTypeRow}>
                  {BLOCK_TYPES.map(bt => (
                    <TouchableOpacity key={bt.key} onPress={() => updateBlock(blk.id, { type: bt.key })}
                      style={[S.seqTypeChip, blk.type === bt.key && S.seqTypeChipActive]} activeOpacity={0.7}>
                      <Text style={[S.seqTypeText, blk.type === bt.key && S.seqTypeTextActive]}>{bt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={[S.seqTypeBadge]}>
                <Text style={S.seqTypeBadgeText}>{blk.type.toUpperCase().replace('-', ' ')}</Text>
              </View>
            )}
            {seqBlocks.length > 1 && (
              <TouchableOpacity onPress={() => removeBlock(blk.id)} style={S.seqRemoveBtn} activeOpacity={0.7}>
                <Trash2 color={theme.error} size={16} />
              </TouchableOpacity>
            )}
          </View>

          {renderBlockConfig(blk)}

          {seqBlocks.length > 1 && (
            <View style={S.seqPauseRow}>
              <Text style={S.seqPauseLabel}>⏸ Pause après</Text>
              <View style={S.seqPauseChips}>
                {[0, 30, 60, 90, 120].map(sec => (
                  <TouchableOpacity key={sec} onPress={() => updateBlock(blk.id, { pauseSec: sec })}
                    style={[S.cdChip, blk.pauseSec === sec && S.cdChipActive]} activeOpacity={0.7}>
                    <Text style={[S.cdChipText, blk.pauseSec === sec && S.cdChipTextActive]}>
                      {sec === 0 ? 'Aucune' : `${sec}s`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      ))}
      <TouchableOpacity style={S.addBlockBtn} onPress={addBlock} activeOpacity={0.8}>
        <Plus color={theme.accentText} size={18} />
        <Text style={S.addBlockBtnText}>Ajouter un bloc</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Minuteur</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Sélecteur de type de minuteur */}
      <View style={S.typeSelector}>
        <Text style={S.typeSelectorLabel}>TYPE DE MINUTEUR</Text>
        <TouchableOpacity 
          style={S.typeSelectorButton}
          onPress={() => setShowTypePicker(true)}
          activeOpacity={0.8}
        >
          <Text style={S.typeSelectorText}>
            {TABS.find(t => t.key === activeTab)?.emoji} {TABS.find(t => t.key === activeTab)?.label || 'FOR TIME'}
          </Text>
          <ChevronLeft color={theme.accentText} size={20} style={{ transform: [{ rotate: '-90deg' }] }} />
        </TouchableOpacity>
      </View>

      {/* Modal de sélection */}
      {showTypePicker && (
        <View style={S.pickerOverlay}>
          <TouchableOpacity 
            style={S.pickerBackdrop}
            onPress={() => setShowTypePicker(false)}
          />
          <View style={S.pickerSheet}>
            <View style={S.pickerHandle} />
            <Text style={S.pickerTitle}>Choisir un format</Text>
            {TABS.map(({ key, label, emoji, desc }) => (
              <TouchableOpacity
                key={key}
                style={[S.pickerItem, activeTab === key && S.pickerItemActive]}
                onPress={() => {
                  switchTab(key);
                  setShowTypePicker(false);
                }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <Text style={{ fontSize: 20 }}>{emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[S.pickerItemText, activeTab === key && S.pickerItemTextActive]}>
                      {label}
                    </Text>
                    <Text style={{ fontSize: 11, color: activeTab === key ? theme.accentText : theme.textMuted, marginTop: 1 }}>
                      {desc}
                    </Text>
                  </View>
                </View>
                {activeTab === key && (
                  <View style={S.pickerCheck}>
                    <Text style={{ color: theme.onAccent, fontSize: 12, fontWeight: '900' }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
            <View style={{ height: 40 }} />
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>
        {activeTab !== 'splits' && (
          <CountdownPicker value={countdown} onChange={setCountdown} />
        )}

        {/* Caméra toggle */}
        <View style={S.card}>
          <View style={S.recOptRow}>
            <View style={S.recOptIcon}>
              <Camera color={theme.textSecondary} size={16} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.recOptLabel}>Enregistrer avec caméra</Text>
              <Text style={S.recOptHint}>Active la vidéo pendant le chrono</Text>
            </View>
            <TouchableOpacity
              onPress={() => setWithCamera(v => !v)}
              style={[S.toggle, withCamera && S.toggleOn]}
              activeOpacity={0.8}
            >
              <View style={[S.toggleThumb, withCamera && S.toggleThumbOn]} />
            </TouchableOpacity>
          </View>
          {withCamera && (
            <>
              <View style={S.recOptRow}>
                <View style={S.recOptIcon}><Type color={theme.textSecondary} size={16} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={S.recOptLabel}>Titre</Text>
                  <TextInput
                    style={S.titleInput} value={videoTitle} onChangeText={setVideoTitle}
                    placeholder="Ex: Fran Sprint · Rx · 3 min 12s"
                    placeholderTextColor={theme.textMuted} maxLength={60} returnKeyType="done"
                  />
                </View>
              </View>
              <View style={S.recOptRow}>
                <View style={S.recOptIcon}><Clock color={theme.textSecondary} size={16} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={S.recOptLabel}>Timestamp</Text>
                  <Text style={S.recOptHint}>Date &amp; heure en overlay</Text>
                </View>
                <TouchableOpacity onPress={() => setWithTimestamp(v => !v)} style={[S.toggle, withTimestamp && S.toggleOn]} activeOpacity={0.8}>
                  <View style={[S.toggleThumb, withTimestamp && S.toggleThumbOn]} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {activeTab === 'splits' ? renderSplitsConfig() : renderBlocks()}

        <View style={{ height: 16 }} />
        <TouchableOpacity style={S.btnPrimary} onPress={launch} activeOpacity={0.85}>
          {withCamera ? <Video color={theme.text} size={20} /> : <Timer color={theme.text} size={20} />}
          <Text style={S.btnPrimaryText}>DÉMARRER</Text>
        </TouchableOpacity>
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  back: {},
  headerTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
  content: { padding: 16, paddingTop: 20, paddingBottom: 140, gap: 14 },
  card: {
    backgroundColor: theme.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.border, gap: 10,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardLabel: { fontSize: 12, fontWeight: '800', color: theme.textMuted, letterSpacing: 1 },
  setMaxBtn: {
    alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1, borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  setMaxBtnText: { fontSize: 12, fontWeight: '700', color: theme.accentText },
  cardHint: { fontSize: 12, color: theme.textMuted, textAlign: 'center' },
  infoCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: theme.border, alignItems: 'center', gap: 12,
  },
  infoTitle: { fontSize: 15, fontWeight: '900', color: theme.text, textAlign: 'center', letterSpacing: 0.5 },
  infoDesc: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: theme.border,
  },
  stepperValueBox: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  stepperValue: { fontSize: 32, fontWeight: '900', color: theme.text },
  stepperUnit: { fontSize: 16, fontWeight: '600', color: theme.textMuted },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { fontSize: 12, fontWeight: '800', color: theme.textMuted },
  chipTextActive: { color: theme.onAccent },
  cdRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cdChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  cdChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  cdChipText: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
  cdChipTextActive: { color: theme.onAccent },
  seqCard: {
    backgroundColor: theme.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.border, gap: 10,
  },
  seqCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  seqBlockNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center',
  },
  seqBlockNumText: { fontSize: 12, fontWeight: '900', color: theme.onAccent },
  seqTypeRow: { flexDirection: 'row', gap: 6, paddingRight: 4 },
  seqTypeChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  seqTypeChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  seqTypeText: { fontSize: 10, fontWeight: '800', color: theme.textMuted },
  seqTypeTextActive: { color: theme.onAccent },
  seqTypeBadge: {
    flex: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: theme.accent + '20', borderWidth: 1, borderColor: theme.accent + '60',
    alignSelf: 'flex-start',
  },
  seqTypeBadgeText: { fontSize: 11, fontWeight: '900', color: theme.accentText, letterSpacing: 1 },
  seqRemoveBtn: {
    width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    backgroundColor: `${theme.error}12`, borderWidth: 1, borderColor: `${theme.error}30`,
  },
  seqConfigRow: { gap: 8 },
  seqConfigLabel: { fontSize: 11, fontWeight: '800', color: theme.textMuted, letterSpacing: 0.8 },
  seqPauseRow: { gap: 6, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10, marginTop: 2 },
  seqPauseLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5 },
  seqPauseChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  addBlockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, padding: 16,
    borderWidth: 2, borderColor: theme.accent, borderStyle: 'dashed',
  },
  addBlockBtnText: { fontSize: 14, fontWeight: '800', color: theme.accentText },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: `${theme.accent}28`,
    borderRadius: 16, paddingVertical: 18, paddingHorizontal: 28, gap: 10,
    borderWidth: 2, borderColor: `${theme.accent}CC`,
  },
  btnPrimaryText: { color: theme.text, fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  btnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.card, borderRadius: 16, padding: 18, gap: 10,
    borderWidth: 2, borderColor: theme.ctaBorder, marginTop: 10,
  },
  btnSecondaryText: { color: theme.accentText, fontSize: 16, fontWeight: '900' },
  recOptRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recOptIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: theme.border,
  },
  recOptLabel: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 4 },
  recOptHint: { fontSize: 11, color: theme.textMuted },
  titleInput: {
    backgroundColor: theme.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, color: theme.text, borderWidth: 1, borderColor: theme.border,
  },
  toggle: {
    width: 46, height: 26, borderRadius: 13,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleOn: { backgroundColor: theme.accent, borderColor: theme.accent },
  toggleThumb: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: theme.textMuted, alignSelf: 'flex-start',
  },
  toggleThumbOn: { backgroundColor: theme.onAccent, alignSelf: 'flex-end' },

  // Type Selector Styles
  typeSelector: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  typeSelectorLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
  },
  typeSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  typeSelectorText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.accentText,
    letterSpacing: 0.5,
  },
  
  // Picker Modal Styles
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    justifyContent: 'flex-end',
  },
  pickerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pickerSheet: {
    backgroundColor: theme.modalCard || theme.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 50,
    maxHeight: '70%',
  },
  pickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.textMuted,
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  pickerItemActive: {
    backgroundColor: `${theme.accent}20`,
  },
  pickerItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  pickerItemTextActive: {
    fontWeight: '800',
    color: theme.accentText,
  },
  pickerCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
}); }
