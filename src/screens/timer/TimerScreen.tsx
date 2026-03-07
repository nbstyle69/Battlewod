import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { ChevronLeft, Timer, Video, Plus, Minus, Trash2, Type, Clock, Camera } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../theme/colors';
import { HomeStackParamList, TimerType, SeqBlock, BlockType } from '../../navigation';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Timer'>;

const TABS: { key: TimerType; label: string }[] = [
  { key: 'for-time',  label: 'FOR TIME' },
  { key: 'amrap',     label: 'AMRAP' },
  { key: 'emom',      label: 'EMOM' },
  { key: 'tabata',    label: 'TABATA' },
  { key: 'ywyr',      label: 'YWYR' },
  { key: 'libre',     label: 'PERSONNALISÉ' },
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
    emomInterval: 1, emomRounds: 10,
    workSec: 20, restSec: 10, tabRounds: 8,
    pauseSec: 0,
  };
}

const COUNTDOWN_OPTS = [0, 3, 5, 10, 15, 30];
const EMOM_INTERVALS = [1, 2, 3, 4, 5];

function Stepper({
  value, onDec, onInc, unit, minVal = 0,
}: { value: number; onDec: () => void; onInc: () => void; unit: string; minVal?: number }) {
  return (
    <View style={s.stepperRow}>
      <TouchableOpacity onPress={onDec} style={s.stepperBtn} disabled={value <= minVal} activeOpacity={0.7}>
        <Minus color={value <= minVal ? Colors.textMuted : Colors.text} size={22} />
      </TouchableOpacity>
      <View style={s.stepperValueBox}>
        <Text style={s.stepperValue}>{value}</Text>
        <Text style={s.stepperUnit}>{unit}</Text>
      </View>
      <TouchableOpacity onPress={onInc} style={s.stepperBtn} activeOpacity={0.7}>
        <Plus color={Colors.text} size={22} />
      </TouchableOpacity>
    </View>
  );
}

function CountdownPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={s.card}>
      <Text style={s.cardLabel}>COMPTE À REBOURS</Text>
      <View style={s.cdRow}>
        {COUNTDOWN_OPTS.map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => onChange(v)}
            style={[s.cdChip, value === v && s.cdChipActive]}
            activeOpacity={0.7}
          >
            <Text style={[s.cdChipText, value === v && s.cdChipTextActive]}>
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
  const [activeTab, setActiveTab] = useState<TimerType>('for-time');
  const [countdown, setCountdown] = useState(3);
  const [seqBlocks, setSeqBlocks] = useState<SeqBlock[]>([makeTypedBlock('for-time')]);
  const [videoTitle, setVideoTitle] = useState('');
  const [withTimestamp, setWithTimestamp] = useState(true);
  const [withCamera, setWithCamera] = useState(false);

  function switchTab(key: TimerType) {
    setActiveTab(key);
    setSeqBlocks(key === 'libre' ? [makeBlock()] : [makeTypedBlock(key as BlockType)]);
  }

  function addBlock() {
    setSeqBlocks(v => [...v, activeTab === 'libre' ? makeBlock() : makeTypedBlock(activeTab as BlockType)]);
  }
  function removeBlock(id: string) { setSeqBlocks(v => v.length > 1 ? v.filter(b => b.id !== id) : v); }
  function updateBlock(id: string, patch: Partial<SeqBlock>) {
    setSeqBlocks(v => v.map(b => b.id === id ? { ...b, ...patch } : b));
  }

  function launch() {
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

  const renderBlockConfig = (blk: SeqBlock) => (
    <>
      {(blk.type === 'amrap' || blk.type === 'for-time') && (
        <View style={s.seqConfigRow}>
          <Text style={s.seqConfigLabel}>{blk.type === 'amrap' ? 'DURÉE' : 'CAP MAX (0 = ∞)'}</Text>
          <Stepper value={blk.durationMin} unit="min" minVal={0}
            onDec={() => updateBlock(blk.id, { durationMin: Math.max(0, blk.durationMin - 1) })}
            onInc={() => updateBlock(blk.id, { durationMin: blk.durationMin + 1 })}
          />
          {blk.type === 'amrap' && <Text style={s.cardHint}>Compte à rebours · Bip final</Text>}
          {blk.type === 'for-time' && <Text style={s.cardHint}>Chrono montant · Stoppe avec ■</Text>}
        </View>
      )}
      {blk.type === 'emom' && (
        <View style={s.seqConfigRow}>
          <Text style={s.seqConfigLabel}>TYPE</Text>
          <View style={[s.chipRow, { marginTop: 0 }]}>
            {[1,2,3,4,5].map(iv => (
              <TouchableOpacity key={iv} onPress={() => updateBlock(blk.id, { emomInterval: iv })}
                style={[s.chip, blk.emomInterval === iv && s.chipActive]} activeOpacity={0.7}>
                <Text style={[s.chipText, blk.emomInterval === iv && s.chipTextActive]}>
                  {iv === 1 ? 'EMOM' : `E${iv}MOM`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.seqConfigLabel}>ROUNDS</Text>
          <Stepper value={blk.emomRounds} unit="rounds" minVal={1}
            onDec={() => updateBlock(blk.id, { emomRounds: Math.max(1, blk.emomRounds - 1) })}
            onInc={() => updateBlock(blk.id, { emomRounds: blk.emomRounds + 1 })}
          />
          <Text style={s.cardHint}>Bip au début de chaque interval</Text>
        </View>
      )}
      {blk.type === 'tabata' && (
        <View style={s.seqConfigRow}>
          <Text style={s.seqConfigLabel}>TRAVAIL</Text>
          <Stepper value={blk.workSec} unit="sec" minVal={5}
            onDec={() => updateBlock(blk.id, { workSec: Math.max(5, blk.workSec - 5) })}
            onInc={() => updateBlock(blk.id, { workSec: blk.workSec + 5 })}
          />
          <Text style={s.seqConfigLabel}>REPOS</Text>
          <Stepper value={blk.restSec} unit="sec" minVal={5}
            onDec={() => updateBlock(blk.id, { restSec: Math.max(5, blk.restSec - 5) })}
            onInc={() => updateBlock(blk.id, { restSec: blk.restSec + 5 })}
          />
          <Text style={s.seqConfigLabel}>ROUNDS</Text>
          <Stepper value={blk.tabRounds} unit="rounds" minVal={1}
            onDec={() => updateBlock(blk.id, { tabRounds: Math.max(1, blk.tabRounds - 1) })}
            onInc={() => updateBlock(blk.id, { tabRounds: blk.tabRounds + 1 })}
          />
          <Text style={s.cardHint}>Total : {Math.floor((blk.workSec + blk.restSec) * blk.tabRounds / 60)} min {((blk.workSec + blk.restSec) * blk.tabRounds) % 60} s</Text>
        </View>
      )}
      {blk.type === 'ywyr' && (
        <Text style={[s.cardHint, { marginTop: 4 }]}>Chrono libre · appuie sur FIN DU TRAVAIL pour passer au repos</Text>
      )}
    </>
  );

  const renderBlocks = () => (
    <>
      {seqBlocks.map((blk, idx) => (
        <View key={blk.id} style={s.seqCard}>
          <View style={s.seqCardHeader}>
            <View style={s.seqBlockNum}>
              <Text style={s.seqBlockNumText}>{idx + 1}</Text>
            </View>
            {activeTab === 'libre' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={s.seqTypeRow}>
                  {BLOCK_TYPES.map(bt => (
                    <TouchableOpacity key={bt.key} onPress={() => updateBlock(blk.id, { type: bt.key })}
                      style={[s.seqTypeChip, blk.type === bt.key && s.seqTypeChipActive]} activeOpacity={0.7}>
                      <Text style={[s.seqTypeText, blk.type === bt.key && s.seqTypeTextActive]}>{bt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={[s.seqTypeBadge]}>
                <Text style={s.seqTypeBadgeText}>{blk.type.toUpperCase().replace('-', ' ')}</Text>
              </View>
            )}
            {seqBlocks.length > 1 && (
              <TouchableOpacity onPress={() => removeBlock(blk.id)} style={s.seqRemoveBtn} activeOpacity={0.7}>
                <Trash2 color={Colors.error} size={16} />
              </TouchableOpacity>
            )}
          </View>

          {renderBlockConfig(blk)}

          {seqBlocks.length > 1 && (
            <View style={s.seqPauseRow}>
              <Text style={s.seqPauseLabel}>⏸ Pause après</Text>
              <View style={s.seqPauseChips}>
                {[0, 30, 60, 90, 120].map(sec => (
                  <TouchableOpacity key={sec} onPress={() => updateBlock(blk.id, { pauseSec: sec })}
                    style={[s.cdChip, blk.pauseSec === sec && s.cdChipActive]} activeOpacity={0.7}>
                    <Text style={[s.cdChipText, blk.pauseSec === sec && s.cdChipTextActive]}>
                      {sec === 0 ? 'Aucune' : `${sec}s`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      ))}
      <TouchableOpacity style={s.addBlockBtn} onPress={addBlock} activeOpacity={0.8}>
        <Plus color={Colors.primary} size={18} />
        <Text style={s.addBlockBtnText}>Ajouter un bloc</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft color={Colors.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Minuteur</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {TABS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => switchTab(key)}
            style={[s.tab, activeTab === key && s.tabActive]}
            activeOpacity={0.7}
          >
            <Text style={[s.tabText, activeTab === key && s.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {renderBlocks()}
        <CountdownPicker value={countdown} onChange={setCountdown} />

        {/* Caméra toggle */}
        <View style={s.card}>
          <View style={s.recOptRow}>
            <View style={s.recOptIcon}>
              <Camera color={Colors.textSecondary} size={16} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.recOptLabel}>Enregistrer avec caméra</Text>
              <Text style={s.recOptHint}>Active la vidéo pendant le chrono</Text>
            </View>
            <TouchableOpacity
              onPress={() => setWithCamera(v => !v)}
              style={[s.toggle, withCamera && s.toggleOn]}
              activeOpacity={0.8}
            >
              <View style={[s.toggleThumb, withCamera && s.toggleThumbOn]} />
            </TouchableOpacity>
          </View>
          {withCamera && (
            <>
              <View style={s.recOptRow}>
                <View style={s.recOptIcon}><Type color={Colors.textSecondary} size={16} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.recOptLabel}>Titre</Text>
                  <TextInput
                    style={s.titleInput} value={videoTitle} onChangeText={setVideoTitle}
                    placeholder="Ex: Fran Sprint · Rx · 3 min 12s"
                    placeholderTextColor={Colors.textMuted} maxLength={60} returnKeyType="done"
                  />
                </View>
              </View>
              <View style={s.recOptRow}>
                <View style={s.recOptIcon}><Clock color={Colors.textSecondary} size={16} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.recOptLabel}>Timestamp</Text>
                  <Text style={s.recOptHint}>Date &amp; heure en overlay</Text>
                </View>
                <TouchableOpacity onPress={() => setWithTimestamp(v => !v)} style={[s.toggle, withTimestamp && s.toggleOn]} activeOpacity={0.8}>
                  <View style={[s.toggleThumb, withTimestamp && s.toggleThumbOn]} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <View style={{ height: 16 }} />
        <TouchableOpacity style={s.btnPrimary} onPress={launch} activeOpacity={0.85}>
          {withCamera ? <Video color="#fff" size={20} /> : <Timer color="#fff" size={20} />}
          <Text style={s.btnPrimaryText}>Démarrer</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  back: {},
  headerTitle: { fontSize: 20, fontWeight: '900', color: Colors.text },
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    flexShrink: 0,
  },
  tabBarContent: { flexDirection: 'row', paddingHorizontal: 6 },
  tab: {
    paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2.5, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.3 },
  tabTextActive: { color: Colors.primary, fontWeight: '900' },
  content: { padding: 16, paddingTop: 20, gap: 14 },
  card: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardLabel: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1 },
  setMaxBtn: {
    alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  setMaxBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  cardHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  infoCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 12,
  },
  infoTitle: { fontSize: 15, fontWeight: '900', color: Colors.text, textAlign: 'center', letterSpacing: 0.5 },
  infoDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  stepperValueBox: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  stepperValue: { fontSize: 32, fontWeight: '900', color: Colors.text },
  stepperUnit: { fontSize: 16, fontWeight: '600', color: Colors.textMuted },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '800', color: Colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  cdRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cdChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  cdChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  cdChipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  cdChipTextActive: { color: '#FFFFFF' },
  // Sequence builder
  seqCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  seqCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  seqBlockNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  seqBlockNumText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  seqTypeRow: { flexDirection: 'row', gap: 6, paddingRight: 4 },
  seqTypeChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  seqTypeChipActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  seqTypeText: { fontSize: 10, fontWeight: '800', color: Colors.textMuted },
  seqTypeTextActive: { color: '#fff' },
  seqTypeBadge: {
    flex: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: Colors.primary + '20', borderWidth: 1, borderColor: Colors.primary + '60',
    alignSelf: 'flex-start',
  },
  seqTypeBadgeText: { fontSize: 11, fontWeight: '900', color: Colors.primary, letterSpacing: 1 },
  seqRemoveBtn: {
    width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    backgroundColor: `${Colors.error}12`, borderWidth: 1, borderColor: `${Colors.error}30`,
  },
  seqConfigRow: { gap: 8 },
  seqConfigLabel: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8 },
  seqPauseRow: { gap: 6, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginTop: 2 },
  seqPauseLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5 },
  seqPauseChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  addBlockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, padding: 16,
    borderWidth: 2, borderColor: Colors.primary, borderStyle: 'dashed',
  },
  addBlockBtnText: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: 16, padding: 18, gap: 10,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  btnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderRadius: 16, padding: 18, gap: 10,
    borderWidth: 2, borderColor: Colors.primary, marginTop: 10,
  },
  btnSecondaryText: { color: Colors.primary, fontSize: 16, fontWeight: '900' },
  // Recording options
  recOptRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recOptIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  recOptLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  recOptHint: { fontSize: 11, color: Colors.textMuted },
  titleInput: {
    backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, color: Colors.text, borderWidth: 1, borderColor: Colors.border,
  },
  toggle: {
    width: 46, height: 26, borderRadius: 13,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleThumb: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.textMuted, alignSelf: 'flex-start',
  },
  toggleThumbOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
});
