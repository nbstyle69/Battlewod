import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Dimensions, ActivityIndicator, ScrollView, Modal,
  TextInput, Linking, Clipboard, Alert, useWindowDimensions, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle } from 'react-native-svg';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { Square, Play, X, RotateCcw, CheckCircle, RefreshCw, Download, Settings, Youtube, Copy, ExternalLink } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList, SeqBlock } from '../../navigation';

type Route = RouteProp<HomeStackParamList, 'TimerRun'>;
type Nav = NativeStackNavigationProp<HomeStackParamList, 'TimerRun'>;

type Phase = 'ready' | 'countdown' | 'running' | 'stopped' | 'done';

const { width: SW } = Dimensions.get('window');

function formatTime(totalSec: number): string {
  const m = Math.floor(Math.abs(totalSec) / 60);
  const s = Math.abs(totalSec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type WavSeg = { hz?: number; ms: number; silent?: boolean; fadeInMs?: number; fadeOutMs?: number };

// ─── WAV PCM 8-bit mono generator ────────────────────────────────────────────
function buildMultiWAV(segs: WavSeg[]): string {
  const sr = 22050;
  const totalN = segs.reduce((a, seg) => a + Math.floor(sr * seg.ms / 1000), 0);
  const buf = new Uint8Array(44 + totalN);
  const dv = new DataView(buf.buffer);
  const ws = (o: number, v: string) => { for (let i = 0; i < v.length; i++) buf[o + i] = v.charCodeAt(i); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + totalN, true); ws(8, 'WAVE');
  ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr, true);
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  ws(36, 'data'); dv.setUint32(40, totalN, true);
  let off = 44;
  for (const seg of segs) {
    const n       = Math.floor(sr * seg.ms / 1000);
    const fadeIn  = Math.max(1, Math.floor(sr * (seg.fadeInMs  ?? 5)  / 1000));
    const fadeOut = Math.max(1, Math.floor(sr * (seg.fadeOutMs ?? 8)  / 1000));
    for (let i = 0; i < n; i++) {
      if (seg.silent || !seg.hz) { buf[off++] = 128; }
      else {
        let amp = 0.92;
        if (i < fadeIn)        amp *= i / fadeIn;
        else if (i > n - fadeOut) amp *= (n - i) / fadeOut;
        buf[off++] = Math.round(128 + 127 * amp * Math.sin(2 * Math.PI * seg.hz * i / sr));
      }
    }
  }
  let b = ''; for (let i = 0; i < buf.length; i++) b += String.fromCharCode(buf[i]);
  return btoa(b);
}

// ─── One-shot tone: génère + joue + décharge automatiquement ─────────────────
async function playTone(hz: number, ms: number, fadeOutMs = 20): Promise<void> {
  try {
    const wav  = buildMultiWAV([{ hz, ms, fadeInMs: 5, fadeOutMs }]);
    const path = (FileSystem.cacheDirectory ?? '') + `bwod_tone_${hz}_${ms}.wav`;
    await FileSystem.writeAsStringAsync(path, wav, { encoding: FileSystem.EncodingType.Base64 });
    const player = createAudioPlayer({ uri: path });
    player.play();
    setTimeout(() => player.remove(), ms + 300);
  } catch {}
}

// ─── Séquence d'armement : 3× bip court (860 Hz) + 1× bip long (1000 Hz) ────
function playArmingSequence(): void {
  playTone(860, 150, 20);
  setTimeout(() => playTone(860, 150, 20), 1000);
  setTimeout(() => playTone(860, 150, 20), 2000);
  setTimeout(() => playTone(1000, 550, 40), 3000);
}

async function createBeepMulti(segs: WavSeg[], name: string): Promise<AudioPlayer | null> {
  try {
    const path = (FileSystem.cacheDirectory ?? '') + name;
    await FileSystem.writeAsStringAsync(path, buildMultiWAV(segs), { encoding: FileSystem.EncodingType.Base64 });
    return createAudioPlayer({ uri: path });
  } catch { return null; }
}

// ─── Timer display options ─────────────────────────────────────────────────────
type ClockStyle = 'arc' | 'bar' | 'digits';
interface TimerDisplayOpts {
  clockStyle: ClockStyle; fontSize: number; digitColor: string;
  bgCountdown: string; bgRunning: string; bgDone: string; bipsEnabled: boolean;
}
const DISPLAY_OPTS_KEY = 'bwod_timer_display_opts';
const DEFAULT_DISPLAY: TimerDisplayOpts = {
  clockStyle: 'arc', fontSize: Math.round(SW * 0.22), digitColor: '#FFFFFF',
  bgCountdown: '#2a2a2a', bgRunning: '#111111', bgDone: '#0d2a18', bipsEnabled: true,
};
const COLOR_PRESETS = ['#FFFFFF', '#4ADE80', '#60A5FA', '#FACC15', '#F87171', '#C084FC', '#000000'];
const BG_PRESETS    = ['#FFFFFF', '#4ADE80', '#60A5FA', '#FACC15', '#F87171', '#C084FC', '#000000'];

// ─── ARC clock (SVG) ─────────────────────────────────────────────────────────
function ArcTimer({ time, progress, color }: { time: string; progress: number; color: string }) {
  const { width: aw, height: ah } = useWindowDimensions();
  const size = Math.min(Math.min(aw, ah) * 0.76, 280);
  const r    = size / 2 - 18;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={14} />
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={14}
          strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} strokeDashoffset={dash} />
      </Svg>
      <Text style={{ fontSize: Math.round(size * 0.2), fontWeight: '200', color, letterSpacing: -2,
        textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 }}>
        {time}
      </Text>
    </View>
  );
}

// ─── BAR clock ──────────────────────────────────────────────────────────────
function BarTimer({ time, progress, color, fontSize }: { time: string; progress: number; color: string; fontSize: number }) {
  const { width: bw, height: bh } = useWindowDimensions();
  const isLandscapeBar = bw > bh;
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <View style={{ alignItems: 'center', gap: 20 }}>
      <View style={{ width: isLandscapeBar ? bw * 0.38 : bw * 0.75, height: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 7, overflow: 'hidden', position: 'relative' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%` as `${number}%`, backgroundColor: color, borderRadius: 7 }} />
      </View>
      <Text style={{ fontSize, fontWeight: '200', color, letterSpacing: -2,
        textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 }}>
        {time}
      </Text>
    </View>
  );
}

// ─── DIGITS clock ───────────────────────────────────────────────────────────
function DigitsTimer({ time, color, fontSize }: { time: string; color: string; fontSize: number }) {
  return (
    <Text style={{ fontSize, fontWeight: '200', color, letterSpacing: -2,
      textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14 }}>
      {time}
    </Text>
  );
}

// ─── Settings modal ───────────────────────────────────────────────────────────
function TimerSettingsModal({ opts, onUpdate, onClose }: {
  opts: TimerDisplayOpts; onUpdate: (u: Partial<TimerDisplayOpts>) => void; onClose: () => void;
}) {
  const SLabel = ({ label }: { label: string }) => (
    <Text style={{ fontSize: 10, color: '#555', letterSpacing: 3, marginBottom: 10, textTransform: 'uppercase' }}>{label}</Text>
  );
  const Sw = ({ color, active, onPress, round = true }: { color: string; active: boolean; onPress: () => void; round?: boolean }) => (
    <TouchableOpacity onPress={onPress}
      style={{ width: 36, height: 36, borderRadius: round ? 18 : 8, backgroundColor: color,
        borderWidth: active ? 3 : 1, borderColor: active ? '#fff' : 'rgba(255,255,255,0.15)' }} />
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} activeOpacity={1} onPress={onClose} />
      <View style={{ backgroundColor: '#141414', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8, maxHeight: '80%' }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#2a2a2a', alignSelf: 'center', marginBottom: 20 }} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
          <Text style={{ color: '#00ff88', fontSize: 11, letterSpacing: 5, marginBottom: 24 }}>⚙ AFFICHAGE MINUTEUR</Text>

          <SLabel label="Style d'horloge" />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
            {(['arc', 'bar', 'digits'] as ClockStyle[]).map(s => (
              <TouchableOpacity key={s} onPress={() => onUpdate({ clockStyle: s })}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                  backgroundColor: opts.clockStyle === s ? '#1b4232' : '#1e1e1e',
                  borderWidth: 1, borderColor: opts.clockStyle === s ? '#00ff88' : '#2a2a2a' }}>
                <Text style={{ color: opts.clockStyle === s ? '#00ff88' : '#555', fontSize: 12, fontWeight: '700' }}>
                  {s.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <SLabel label={`Taille : ${opts.fontSize}px`} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <TouchableOpacity onPress={() => onUpdate({ fontSize: Math.max(20, opts.fontSize - 4) })}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e1e1e', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333' }}>
              <Text style={{ color: '#fff', fontSize: 24 }}>−</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, height: 4, backgroundColor: '#222', borderRadius: 2 }}>
              <View style={{ width: `${Math.round(((opts.fontSize - 20) / 100) * 100)}%` as `${number}%`, height: '100%', backgroundColor: '#00ff88', borderRadius: 2 }} />
            </View>
            <TouchableOpacity onPress={() => onUpdate({ fontSize: Math.min(120, opts.fontSize + 4) })}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e1e1e', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333' }}>
              <Text style={{ color: '#fff', fontSize: 24 }}>+</Text>
            </TouchableOpacity>
          </View>

          <SLabel label="Couleur chiffres" />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
            {COLOR_PRESETS.map(c => <Sw key={c} color={c} active={opts.digitColor === c} onPress={() => onUpdate({ digitColor: c })} />)}
          </View>

          <SLabel label="Fond décompte" />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
            {BG_PRESETS.map(c => <Sw key={c} color={c} active={opts.bgCountdown === c} round={false} onPress={() => onUpdate({ bgCountdown: c })} />)}
          </View>

          <SLabel label="Fond en cours" />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
            {BG_PRESETS.map(c => <Sw key={c} color={c} active={opts.bgRunning === c} round={false} onPress={() => onUpdate({ bgRunning: c })} />)}
          </View>

          <SLabel label="Fond terminée" />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
            {BG_PRESETS.map(c => <Sw key={c} color={c} active={opts.bgDone === c} round={false} onPress={() => onUpdate({ bgDone: c })} />)}
          </View>

          <SLabel label="Sons (bips)" />
          <TouchableOpacity onPress={() => onUpdate({ bipsEnabled: !opts.bipsEnabled })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, marginBottom: 24,
              backgroundColor: opts.bipsEnabled ? '#1b4232' : '#1e1e1e',
              borderWidth: 1, borderColor: opts.bipsEnabled ? '#00ff88' : '#2a2a2a' }}>
            <Text style={{ fontSize: 20 }}>{opts.bipsEnabled ? '🔊' : '🔇'}</Text>
            <Text style={{ color: opts.bipsEnabled ? '#00ff88' : '#555', fontWeight: '700', fontSize: 14 }}>
              {opts.bipsEnabled ? 'Bips activés' : 'Bips désactivés'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose}
            style={{ padding: 16, backgroundColor: '#1e1e1e', borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' }}>
            <Text style={{ color: '#555', fontSize: 12, letterSpacing: 2 }}>FERMER</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function TimerRunScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { timerType, countdown, totalSeconds, maxTime, interval, rounds, workTime, restTime, withCamera, sequence, videoTitle, withTimestamp } = route.params;

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const [phase, setPhase] = useState<Phase>('ready');
  const [countdownVal, setCountdownVal] = useState(countdown);

  const [timerVal, setTimerVal] = useState(0);
  const initRTL = timerType === 'amrap' ? totalSeconds
    : timerType === 'emom'  ? interval * 60
    : timerType === 'tabata' ? workTime : 0;
  const [roundTimeLeft, setRoundTimeLeft] = useState(initRTL);
  const [innerPhase, setInnerPhase] = useState<'work' | 'rest'>('work');
  const [currentRound, setCurrentRound] = useState(1);

  const [clockStr, setClockStr] = useState(() => {
    const n = new Date();
    return n.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      '  ' + n.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  const [seqIdx, setSeqIdx] = useState(0);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [seqPausing, setSeqPausing] = useState(false);
  const [seqPauseLeft, setSeqPauseLeft] = useState(0);

  const [saving, setSaving] = useState(false);
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const [showYT, setShowYT] = useState(false);
  const [ytLink, setYtLink] = useState('');
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [sessionMeta, setSessionMeta] = useState<{
    videoURL: string; title: string; recordedAt: string;
    timerStartOffset: number; timerStopOffset: number; countdownDuration: number;
  } | null>(null);
  const [savingCard, setSavingCard] = useState(false);
  const [cardSaved, setCardSaved] = useState(false);
  const cardRef = useRef<ViewShot>(null);
  const recordingCdRef = useRef(0);
  const videoStartTimeRef = useRef<number>(0);
  const timerStartOffsetRef = useRef<number | null>(null);
  const timerStopOffsetRef = useRef<number | null>(null);

  useEffect(() => {
    if (!withTimestamp) return;
    const tick = () => {
      const n = new Date();
      setClockStr(
        n.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        '  ' + n.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    clockRef.current = setInterval(tick, 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, [withTimestamp]);
  const [facing, setFacing] = useState<'front' | 'back'>('back');

  async function saveCard() {
    if (savingCard || cardSaved) return;
    try {
      setSavingCard(true);
      const uri = await (cardRef.current as any).capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      setCardSaved(true);
    } catch (e) {
      console.warn('saveCard error', e);
    } finally {
      setSavingCard(false);
    }
  }

  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraRef         = useRef<CameraView>(null);
  const recordingActiveRef = useRef(false);
  const soundReadyRef     = useRef(false);

  const [displayOpts, setDisplayOptsRaw] = useState<TimerDisplayOpts>(DEFAULT_DISPLAY);
  const [showSettings, setShowSettings]  = useState(false);
  const displayOptsRef = useRef<TimerDisplayOpts>(DEFAULT_DISPLAY);
  displayOptsRef.current = displayOpts;
  const roundTimeLeftRef  = useRef(initRTL);
  const currentRoundRef   = useRef(1);
  const innerPhaseRef     = useRef<'work' | 'rest'>('work');
  const ywyrWorkRef       = useRef(0);
  const timerValRef       = useRef(0);
  const seqBlocksRef      = useRef<SeqBlock[]>([]);
  const seqIdxRef         = useRef(0);
  const seqPausingRef     = useRef(false);
  const seqPauseLeftRef   = useRef(0);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => { navigation.getParent()?.setOptions({ tabBarStyle: undefined }); };
  }, []);

  useEffect(() => {
    if (timerType === 'libre') {
      try { seqBlocksRef.current = JSON.parse(sequence); } catch { seqBlocksRef.current = []; }
      if (seqBlocksRef.current.length > 0) initSeqBlockByIdx(0);
    }
    async function setup() {
      try { await setAudioModeAsync({ playsInSilentMode: true }); } catch {}
      if (withCamera) {
        if (!camPermission?.granted) requestCamPermission();
        if (!micPermission?.granted) requestMicPermission();
        if (!mediaPermission?.granted) requestMediaPermission();
      }
      const cDir = FileSystem.cacheDirectory ?? '';
      await FileSystem.writeAsStringAsync(cDir + 'bwod_tick.wav',
        buildMultiWAV([{ hz: 860, ms: 150, fadeInMs: 5, fadeOutMs: 20 }]),
        { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(cDir + 'bwod_go.wav',
        buildMultiWAV([{ hz: 1000, ms: 550, fadeInMs: 5, fadeOutMs: 40 }]),
        { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(cDir + 'bwod_done.wav',
        buildMultiWAV([
          { hz: 1000, ms: 550, fadeInMs: 5, fadeOutMs: 40 },
          { silent: true, ms: 80 },
          { hz: 1000, ms: 550, fadeInMs: 5, fadeOutMs: 40 },
        ]), { encoding: FileSystem.EncodingType.Base64 });
      soundReadyRef.current = true;
    }
    setup();
    return () => {};
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(DISPLAY_OPTS_KEY).then(v => {
      if (v) try { setDisplayOptsRaw({ ...DEFAULT_DISPLAY, ...JSON.parse(v) }); } catch {}
    });
  }, []);

  function setDisplayOpts(update: Partial<TimerDisplayOpts>) {
    setDisplayOptsRaw(prev => {
      const next = { ...prev, ...update };
      AsyncStorage.setItem(DISPLAY_OPTS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  function playBeep(type: 'tick' | 'go' | 'done') {
    try {
      if (!displayOptsRef.current.bipsEnabled || !soundReadyRef.current) return;
      const cDir = FileSystem.cacheDirectory ?? '';
      const path = cDir + (type === 'tick' ? 'bwod_tick.wav' : type === 'go' ? 'bwod_go.wav' : 'bwod_done.wav');
      const p = createAudioPlayer({ uri: path });
      p.play();
      const ttl = type === 'done' ? 1500 : type === 'go' ? 700 : 350;
      setTimeout(() => { try { p.remove(); } catch {} }, ttl);
    } catch {}
  }

  function stopAndSave() {
    clearTimer();
    if (withCamera && recordingActiveRef.current) {
      timerStopOffsetRef.current = Date.now() - videoStartTimeRef.current;
      setPhase('stopped');
    } else {
      setPhase('done');
    }
  }

  function handleStartRecording() {
    if (!isCameraReady || !cameraRef.current) return;
    videoStartTimeRef.current = Date.now();
    timerStartOffsetRef.current = null;
    timerStopOffsetRef.current = null;
    recordingActiveRef.current = true;
    setIsRecordingActive(true);
    startRecording();
  }

  async function startRecording() {
    if (!cameraRef.current || !recordingActiveRef.current) return;
    try {
      console.log('🎬 recordAsync start...');
      const video = await cameraRef.current.recordAsync({});
      console.log('🎬 recordAsync done, uri:', video?.uri);
      if (video?.uri) {
        setSaving(true);
        const permanentPath = (FileSystem.documentDirectory ?? '') + `bwod_video_${videoStartTimeRef.current}.mp4`;
        await FileSystem.copyAsync({ from: video.uri, to: permanentPath });
        console.log('📁 copied to:', permanentPath);
        await MediaLibrary.saveToLibraryAsync(permanentPath);
        console.log('✅ saved to library');
        setSavedUri(permanentPath);
        const meta = {
          videoURL: permanentPath,
          title: videoTitle ?? '',
          recordedAt: new Date(videoStartTimeRef.current).toISOString(),
          timerType,
          timerDuration: timerStopOffsetRef.current != null && timerStartOffsetRef.current != null
            ? Math.round((timerStopOffsetRef.current - timerStartOffsetRef.current) / 1000)
            : timerValRef.current,
          timerStartOffset: timerStartOffsetRef.current ?? 0,
          timerStopOffset: timerStopOffsetRef.current ?? 0,
          countdownDuration: countdown,
        };
        console.log('📦 meta:', JSON.stringify(meta));
        setSessionMeta(meta);
        const metaPath = (FileSystem.documentDirectory ?? '') + `bwod_${videoStartTimeRef.current}.json`;
        await FileSystem.writeAsStringAsync(metaPath, JSON.stringify(meta, null, 2));
        setPhase('done');
      } else {
        console.warn('⚠️ video.uri est null');
      }
    } catch (e) { console.warn('❌ startRecording error:', e); }
    finally { recordingActiveRef.current = false; setIsRecordingActive(false); setSaving(false); }
  }

  function stopVideoAndFinish() {
    cameraRef.current?.stopRecording();
  }

  function resetInnerState() {
    roundTimeLeftRef.current = initRTL;
    currentRoundRef.current  = 1;
    innerPhaseRef.current    = 'work';
    ywyrWorkRef.current      = 0;
    setRoundTimeLeft(initRTL); setCurrentRound(1); setInnerPhase('work'); setTimerVal(0);
    if (timerType === 'libre') {
      seqIdxRef.current = 0; setSeqIdx(0);
      seqPausingRef.current = false; setSeqPausing(false);
      if (seqBlocksRef.current.length > 0) initSeqBlockByIdx(0);
    }
  }

  useEffect(() => {
    clearTimer();

    if (phase === 'countdown') {
      let count = countdown;
      playBeep('tick');
      intervalRef.current = setInterval(() => {
        count--;
        if (count <= 0) {
          clearTimer();
          setCountdownVal(0);
          playBeep('go');
          if (withCamera) timerStartOffsetRef.current = Date.now() - videoStartTimeRef.current;
          setPhase('running');
        } else {
          setCountdownVal(count);
          playBeep('tick');
        }
      }, 1000);
    }

    if (phase === 'running') {
      if (countdown === 0) playBeep('go');

      intervalRef.current = setInterval(() => {
        switch (timerType) {

          case 'for-time':
            timerValRef.current += 1;
            setTimerVal(timerValRef.current);
            if (maxTime > 0 && timerValRef.current >= maxTime) {
              playBeep('done');
              stopAndSave();
            } else if (maxTime > 0) {
              const remaining = maxTime - timerValRef.current;
              if (remaining === 3 || remaining === 2 || remaining === 1) playBeep('tick');
            }
            break;

          case 'amrap':
            roundTimeLeftRef.current -= 1;
            setRoundTimeLeft(roundTimeLeftRef.current);
            if (roundTimeLeftRef.current <= 0) {
              playBeep('done');
              stopAndSave();
            } else if (roundTimeLeftRef.current <= 3) {
              playBeep('tick');
            }
            break;

          case 'emom':
            roundTimeLeftRef.current -= 1;
            setRoundTimeLeft(roundTimeLeftRef.current);
            if (roundTimeLeftRef.current <= 0) {
              const next = currentRoundRef.current + 1;
              if (next > rounds) {
                playBeep('done');
                stopAndSave();
              } else {
                currentRoundRef.current = next;
                setCurrentRound(next);
                roundTimeLeftRef.current = interval * 60;
                setRoundTimeLeft(interval * 60);
                playBeep('tick');
              }
            } else if (roundTimeLeftRef.current <= 3) {
              playBeep('tick');
            }
            break;

          case 'tabata':
            roundTimeLeftRef.current -= 1;
            setRoundTimeLeft(roundTimeLeftRef.current);
            if (roundTimeLeftRef.current <= 0) {
              if (innerPhaseRef.current === 'work') {
                innerPhaseRef.current = 'rest';
                setInnerPhase('rest');
                roundTimeLeftRef.current = restTime;
                setRoundTimeLeft(restTime);
                playBeep('go');
              } else {
                const next = currentRoundRef.current + 1;
                if (next > rounds) {
                  playBeep('done');
                  stopAndSave();
                } else {
                  currentRoundRef.current = next;
                  setCurrentRound(next);
                  innerPhaseRef.current = 'work';
                  setInnerPhase('work');
                  roundTimeLeftRef.current = workTime;
                  setRoundTimeLeft(workTime);
                  playBeep('tick');
                }
              }
            } else if (roundTimeLeftRef.current <= 3) {
              playBeep('tick');
            }
            break;

          case 'ywyr':
            if (innerPhaseRef.current === 'work') {
              ywyrWorkRef.current += 1;
              setTimerVal(ywyrWorkRef.current);
            } else {
              timerValRef.current -= 1;
              setTimerVal(timerValRef.current);
              if (timerValRef.current <= 0) {
                innerPhaseRef.current = 'work';
                setInnerPhase('work');
                ywyrWorkRef.current = 0;
                timerValRef.current = 0;
                playBeep('tick');
              } else if (timerValRef.current <= 3) {
                playBeep('tick');
              }
            }
            break;

          case 'libre': {
            const blk = seqBlocksRef.current[seqIdxRef.current];
            if (!blk) { stopAndSave(); break; }
            // Inter-block pause
            if (seqPausingRef.current) {
              seqPauseLeftRef.current -= 1;
              setSeqPauseLeft(seqPauseLeftRef.current);
              if (seqPauseLeftRef.current <= 0) advanceSeq();
              break;
            }
            // Run current block
            switch (blk.type) {
              case 'amrap':
                roundTimeLeftRef.current -= 1; setRoundTimeLeft(roundTimeLeftRef.current);
                if (roundTimeLeftRef.current <= 0) seqBlockDone();
                else if (roundTimeLeftRef.current <= 3) playBeep('tick');
                break;
              case 'for-time':
                timerValRef.current += 1; setTimerVal(timerValRef.current);
                if (blk.durationMin > 0 && timerValRef.current >= blk.durationMin * 60) seqBlockDone();
                break;
              case 'emom':
                roundTimeLeftRef.current -= 1; setRoundTimeLeft(roundTimeLeftRef.current);
                if (roundTimeLeftRef.current <= 0) {
                  const nxt = currentRoundRef.current + 1;
                  if (nxt > blk.emomRounds) seqBlockDone();
                  else { currentRoundRef.current = nxt; setCurrentRound(nxt); roundTimeLeftRef.current = blk.emomInterval * 60; setRoundTimeLeft(blk.emomInterval * 60); playBeep('tick'); }
                } else if (roundTimeLeftRef.current <= 3) { playBeep('tick'); }
                break;
              case 'tabata':
                roundTimeLeftRef.current -= 1; setRoundTimeLeft(roundTimeLeftRef.current);
                if (roundTimeLeftRef.current <= 0) {
                  if (innerPhaseRef.current === 'work') { innerPhaseRef.current = 'rest'; setInnerPhase('rest'); roundTimeLeftRef.current = blk.restSec; setRoundTimeLeft(blk.restSec); playBeep('go'); }
                  else { const nxt = currentRoundRef.current + 1; if (nxt > blk.tabRounds) seqBlockDone(); else { currentRoundRef.current = nxt; setCurrentRound(nxt); innerPhaseRef.current = 'work'; setInnerPhase('work'); roundTimeLeftRef.current = blk.workSec; setRoundTimeLeft(blk.workSec); playBeep('tick'); } }
                } else if (roundTimeLeftRef.current <= 3) { playBeep('tick'); }
                break;
              case 'ywyr':
                if (innerPhaseRef.current === 'work') { ywyrWorkRef.current += 1; setTimerVal(ywyrWorkRef.current); }
                else { timerValRef.current -= 1; setTimerVal(timerValRef.current); if (timerValRef.current <= 0) seqBlockDone(); else if (timerValRef.current <= 3) playBeep('tick'); }
                break;
            }
            break;
          }
        }
      }, 1000);
    }

    return clearTimer;
  }, [phase]);

  // ─── Sequence helpers ─────────────────────────────────────────────────────
  function initSeqBlockByIdx(idx: number) {
    const blk = seqBlocksRef.current[idx];
    if (!blk) return;
    innerPhaseRef.current = 'work'; setInnerPhase('work');
    ywyrWorkRef.current = 0; timerValRef.current = 0; setTimerVal(0);
    currentRoundRef.current = 1; setCurrentRound(1);
    seqPausingRef.current = false; setSeqPausing(false);
    switch (blk.type) {
      case 'amrap': roundTimeLeftRef.current = blk.durationMin * 60; setRoundTimeLeft(blk.durationMin * 60); break;
      case 'for-time': roundTimeLeftRef.current = 0; setRoundTimeLeft(0); break;
      case 'emom': roundTimeLeftRef.current = blk.emomInterval * 60; setRoundTimeLeft(blk.emomInterval * 60); break;
      case 'tabata': roundTimeLeftRef.current = blk.workSec; setRoundTimeLeft(blk.workSec); break;
      case 'ywyr': roundTimeLeftRef.current = 0; setRoundTimeLeft(0); break;
    }
  }
  function seqBlockDone() {
    const blk = seqBlocksRef.current[seqIdxRef.current];
    if (blk && blk.pauseSec > 0) {
      seqPausingRef.current = true; seqPauseLeftRef.current = blk.pauseSec;
      setSeqPausing(true); setSeqPauseLeft(blk.pauseSec);
      innerPhaseRef.current = 'rest'; setInnerPhase('rest');
      playBeep('go');
    } else { advanceSeq(); }
  }
  function advanceSeq() {
    const next = seqIdxRef.current + 1;
    if (next >= seqBlocksRef.current.length) { playBeep('done'); stopAndSave(); return; }
    seqIdxRef.current = next; setSeqIdx(next);
    initSeqBlockByIdx(next);
    playBeep('tick');
  }

  // ─── YWYR: user ends work phase ───────────────────────────────────────────
  function ywyrEndWork() {
    const wt = ywyrWorkRef.current;
    innerPhaseRef.current = 'rest'; setInnerPhase('rest');
    timerValRef.current = wt; setTimerVal(wt);
    playBeep('go');
  }
  // ─── LIBRE FOR-TIME: manually end unlimited block ─────────────────────────
  function libreEndForTimeBlock() { seqBlockDone(); }

  function handleStart() {
    if (countdown > 0) {
      recordingCdRef.current = countdown;
      setCountdownVal(countdown);
      setPhase('countdown');
    } else {
      if (withCamera) timerStartOffsetRef.current = Date.now() - videoStartTimeRef.current;
      recordingCdRef.current = 0;
      setPhase('running');
    }
  }

  function handleStop() { playBeep('done'); stopAndSave(); }

  function handleReset() {
    clearTimer();
    if (withCamera && recordingActiveRef.current) { cameraRef.current?.stopRecording(); }
    setIsCameraReady(false);
    setCountdownVal(countdown);
    setSavedUri(null); setSaving(false);
    recordingCdRef.current = 0;
    timerValRef.current = 0;
    resetInnerState();
    setPhase('ready');
  }

  function handleClose() {
    clearTimer();
    if (withCamera && recordingActiveRef.current) { cameraRef.current?.stopRecording(); }
    navigation.goBack();
  }

  const isActive = phase === 'countdown' || phase === 'running';
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;

  const curBlk = timerType === 'libre' ? seqBlocksRef.current[seqIdx] : undefined;
  const seqTotal = seqBlocksRef.current.length;

  const blkLabel = curBlk
    ? ({ 'for-time': 'FOR TIME', amrap: 'AMRAP', emom: curBlk.emomInterval === 1 ? 'EMOM' : `E${curBlk.emomInterval}MOM`, tabata: 'TABATA', ywyr: 'YWYR' } as Record<string, string>)[curBlk.type] ?? 'PERSONNALISÉ'
    : 'PERSONNALISÉ';
  const displayLabel = timerType === 'for-time' ? 'FOR TIME'
    : timerType === 'amrap'   ? 'AMRAP'
    : timerType === 'emom'    ? (interval === 1 ? 'EMOM' : `E${interval}MOM`)
    : timerType === 'tabata'  ? 'TABATA'
    : timerType === 'ywyr'    ? 'YWYR'
    : seqTotal === 1          ? blkLabel
    : `BLOC ${seqIdx + 1} / ${seqTotal}`;

  const seqBlockLabel = curBlk
    ? ({ 'for-time': 'FOR TIME', amrap: 'AMRAP', emom: curBlk.emomInterval === 1 ? 'EMOM' : `E${curBlk.emomInterval}MOM`, tabata: 'TABATA', ywyr: 'YWYR' } as Record<string, string>)[curBlk.type] ?? ''
    : '';

  const mainTime = (() => {
    if (timerType === 'amrap' || timerType === 'emom' || timerType === 'tabata') return formatTime(roundTimeLeft);
    if (timerType === 'libre') {
      if (seqPausing) return formatTime(seqPauseLeft);
      if (!curBlk) return '00:00';
      if (curBlk.type === 'amrap' || curBlk.type === 'emom' || curBlk.type === 'tabata' || (curBlk.type === 'ywyr' && innerPhase === 'rest')) return formatTime(roundTimeLeft);
      return formatTime(timerVal);
    }
    return formatTime(timerVal);
  })();

  const arcProgress = (() => {
    if (phase === 'ready') return 0;
    if (phase === 'countdown') return countdown > 0 ? Math.max(0, 1 - countdownVal / countdown) : 1;
    if (timerType === 'for-time' && maxTime > 0) return Math.min(1, timerVal / maxTime);
    if (timerType === 'amrap') return totalSeconds > 0 ? Math.max(0, 1 - roundTimeLeft / totalSeconds) : 0;
    if (timerType === 'emom') return interval > 0 ? Math.max(0, 1 - roundTimeLeft / (interval * 60)) : 0;
    if (timerType === 'tabata') {
      const phaseDur = innerPhase === 'work' ? workTime : restTime;
      return phaseDur > 0 ? Math.max(0, 1 - roundTimeLeft / phaseDur) : 0;
    }
    if (timerType === 'libre' && curBlk) {
      if (curBlk.type === 'amrap') {
        const total = curBlk.durationMin * 60;
        return total > 0 ? Math.max(0, 1 - roundTimeLeft / total) : 0;
      }
      if (curBlk.type === 'for-time') {
        const cap = curBlk.durationMin * 60;
        return cap > 0 ? Math.min(1, timerVal / cap) : 0;
      }
      if (curBlk.type === 'emom') {
        const iv = (curBlk.emomInterval || 1) * 60;
        return iv > 0 ? Math.max(0, 1 - roundTimeLeft / iv) : 0;
      }
      if (curBlk.type === 'tabata') {
        const phaseDur = innerPhase === 'work' ? curBlk.workSec : curBlk.restSec;
        return phaseDur > 0 ? Math.max(0, 1 - roundTimeLeft / phaseDur) : 0;
      }
      if (curBlk.type === 'ywyr') {
        return innerPhase === 'rest' && roundTimeLeft > 0
          ? Math.max(0, 1 - roundTimeLeft / timerVal) : 0;
      }
    }
    return 0;
  })();
  const accentColor = displayOpts.digitColor;

  const showEndWorkBtn = phase === 'running' && innerPhase === 'work' && !seqPausing &&
    (timerType === 'ywyr' || (timerType === 'libre' && curBlk?.type === 'ywyr'));
  const showEndBlockBtn = phase === 'running' && !seqPausing &&
    timerType === 'libre' && curBlk?.type === 'for-time' && innerPhase === 'work';
  const showNormalStop = isActive && !showEndWorkBtn && !showEndBlockBtn;

  const qrData = JSON.stringify({
    app: 'TheHub',
    type: displayLabel,
    time: mainTime,
    ...(videoTitle ? { title: videoTitle } : {}),
    date: clockStr,
  });

  const isRecording = withCamera && isRecordingActive;
  const hideUI = isRecording && phase === 'running';

  const camState: 0|1|2|3|4 =
    phase === 'done' ? 4 :
    phase === 'stopped' ? 3 :
    isActive ? 2 :
    isRecordingActive ? 1 : 0;

  const camPrimaryLabel =
    camState === 0 ? 'Démarrer' :
    camState === 1 ? 'Lancer le chrono' :
    camState === 2 ? 'Arrêter le chrono' :
    'Arrêter la vidéo';

  const camPrimaryAction =
    camState === 0 ? handleStartRecording :
    camState === 1 ? handleStart :
    camState === 2 ? handleStop :
    stopVideoAndFinish;

  const renderTopBar = () => (
    <View style={styles.topBar}>
      {hideUI
        ? <View style={{ width: 44 }} />
        : <TouchableOpacity onPress={handleClose} style={styles.iconBtn}>
            <X color="rgba(255,255,255,0.8)" size={24} />
          </TouchableOpacity>
      }
      <View style={styles.topCenter}>
        <Text style={styles.modeLabel}>{displayLabel}</Text>
        {withCamera && camState >= 1 && camState <= 3 && (
          <View style={styles.recIndicator}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>REC</Text>
          </View>
        )}
      </View>
      {hideUI
        ? <View style={{ width: 44 }} />
        : withCamera
          ? <TouchableOpacity
              onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
              style={styles.iconBtn} activeOpacity={0.7}
            >
              <RefreshCw color="rgba(255,255,255,0.8)" size={22} />
            </TouchableOpacity>
          : <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.iconBtn} activeOpacity={0.7}>
              <Settings color="rgba(255,255,255,0.8)" size={20} />
            </TouchableOpacity>
      }
    </View>
  );

  const renderContent = () => (
    <View style={[styles.overlay, isLandscape && { paddingVertical: 20 }]}>
      {renderTopBar()}

      {phase === 'done' ? (
        /* ── SESSION CARD ─────────────────────────────────── */
        <ScrollView
          contentContainerStyle={styles.sessionScroll}
          showsVerticalScrollIndicator={false}
        >
          <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={styles.sessionCard}>
            <View style={styles.sessionCardInner}>
              <Text style={styles.sessionApp}>⚡ THEHUB</Text>
              <View style={styles.sessionBadge}>
                <Text style={styles.sessionBadgeText}>{displayLabel}</Text>
              </View>
              <Text style={styles.sessionTime}>{mainTime}</Text>
              {videoTitle ? (
                <Text style={styles.sessionTitle} numberOfLines={2}>{videoTitle}</Text>
              ) : null}
              <Text style={styles.sessionDate}>{clockStr}</Text>
              <View style={styles.sessionQRWrap}>
                <QRCode value={qrData} size={96} color="#111111" backgroundColor="#FFFFFF" />
                <Text style={styles.sessionQRHint}>Scanner pour les détails</Text>
              </View>
            </View>
          </ViewShot>

          {withCamera && (
            <View style={styles.savedBanner}>
              {saving
                ? <><ActivityIndicator color="#fff" size="small" /><Text style={styles.savedText}>Sauvegarde vidéo…</Text></>
                : savedUri
                  ? <><CheckCircle color="#4ADE80" size={18} /><Text style={[styles.savedText, { color: '#4ADE80' }]}>Vidéo enregistrée ✓</Text></>
                  : null}
            </View>
          )}

          {sessionMeta && (
            <TouchableOpacity
              onPress={() => navigation.navigate('VideoPlayback', {
                videoURL: sessionMeta.videoURL,
                title: sessionMeta.title || undefined,
                recordedAt: sessionMeta.recordedAt,
                timerStartOffset: sessionMeta.timerStartOffset,
                timerStopOffset: sessionMeta.timerStopOffset,
                countdownDuration: sessionMeta.countdownDuration,
              })}
              style={styles.playbackBtn}
              activeOpacity={0.85}
            >
              <Play color="#fff" size={16} fill="#fff" />
              <Text style={styles.playbackBtnText}>Lire la vidéo</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={saveCard} style={styles.saveCardBtn} activeOpacity={0.85}>
            {savingCard
              ? <ActivityIndicator color="#fff" size="small" />
              : cardSaved
                ? <><CheckCircle color="#4ADE80" size={18} /><Text style={[styles.saveCardBtnText, { color: '#4ADE80' }]}>Carte sauvegardée ✓</Text></>
                : <><Download color="#fff" size={18} /><Text style={styles.saveCardBtnText}>Sauvegarder la carte</Text></>}
          </TouchableOpacity>

          {/* YouTube share */}
          <TouchableOpacity style={styles.ytBtn} activeOpacity={0.85} onPress={() => setShowYT(true)}>
            <Youtube color="#fff" size={18} />
            <Text style={styles.ytBtnTxt}>Partager sur YouTube</Text>
          </TouchableOpacity>

          <View style={styles.doneRow}>
            <TouchableOpacity onPress={handleReset} style={styles.resetBtn} activeOpacity={0.8}>
              <RotateCcw color="#fff" size={26} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClose} style={styles.closeResultBtn} activeOpacity={0.8}>
              <Text style={styles.closeResultText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        /* ── RUNNING / COUNTDOWN ─────────────────────────── */
        <>
          {/* DÉCOMPTE — non-caméra uniquement (caméra = top-level) */}
          {!withCamera && phase === 'countdown' && countdownVal > 0 && (
            <View style={styles.countdownOverlay} pointerEvents="none">
              <Text style={[styles.countdownBig, {
                color: accentColor,
                textShadowColor: accentColor,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 18,
              }]}>{countdownVal}</Text>
            </View>
          )}

          <View style={isLandscape
            ? { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }
            : { flex: 1, justifyContent: 'flex-end' }}>
          {/* TIMER — visible seulement hors countdown */}
          {phase !== 'countdown' && (!withCamera || camState >= 1) && (
            <View style={styles.timerCenter}>
              {timerType === 'libre' && seqBlockLabel ? (
                <Text style={styles.seqSubLabel}>{seqPausing ? '⏸ REPOS' : seqBlockLabel}</Text>
              ) : null}
              {!seqPausing && (timerType === 'tabata' || timerType === 'ywyr' ||
                (timerType === 'libre' && (curBlk?.type === 'tabata' || curBlk?.type === 'ywyr'))) &&
                phase === 'running' && (
                <Text style={[styles.innerPhaseLabel, innerPhase === 'work' ? styles.workColor : styles.restColor]}>
                  {innerPhase === 'work' ? '💪 TRAVAIL' : '😮‍💨 REPOS'}
                </Text>
              )}
              {(timerType === 'emom' || timerType === 'tabata') && phase === 'running' && (
                <Text style={styles.roundLabel}>ROUND {currentRound} / {rounds}</Text>
              )}
              {timerType === 'libre' && !seqPausing && phase === 'running' && curBlk &&
                (curBlk.type === 'emom' || curBlk.type === 'tabata') && (
                <Text style={styles.roundLabel}>ROUND {currentRound} / {curBlk.type === 'emom' ? curBlk.emomRounds : curBlk.tabRounds}</Text>
              )}
              {displayOpts.clockStyle === 'arc' && <ArcTimer time={mainTime} progress={arcProgress} color={accentColor} />}
              {displayOpts.clockStyle === 'bar' && <BarTimer time={mainTime} progress={arcProgress} color={accentColor} fontSize={displayOpts.fontSize} />}
              {displayOpts.clockStyle === 'digits' && <DigitsTimer time={mainTime} color={accentColor} fontSize={displayOpts.fontSize} />}
              {timerType === 'amrap' && phase === 'running' && (
                <Text style={styles.subLabel}>compte à rebours</Text>
              )}
            </View>
          )}

          {/* INFOBAR — titre/timestamp, jamais pendant countdown */}
          {(videoTitle || withTimestamp) && phase === 'running' && (!withCamera || camState >= 2) && (
            <View style={styles.infoBar}>
              {videoTitle ? <Text style={styles.infoTitle} numberOfLines={1}>{videoTitle}</Text> : null}
              {withTimestamp ? <Text style={styles.infoTimestamp}>{clockStr}</Text> : null}
            </View>
          )}


          <View style={[styles.controls, isLandscape && { paddingBottom: 0, justifyContent: 'center' }]}>
            {withCamera ? (
              /* ── SINGLE BUTTON (camera mode) ─────────────────────── */
              <>
                <TouchableOpacity
                  onPress={camPrimaryAction}
                  disabled={camState === 0 && !isCameraReady}
                  style={[
                    styles.camPrimaryBtn,
                    camState === 0 && !isCameraReady && { opacity: 0.4 },
                    camState === 1 && styles.camPrimaryBtnGo,
                    (camState === 2 || camState === 3) && styles.camPrimaryBtnStop,
                  ]}
                  activeOpacity={0.85}
                >
                  <Text style={styles.camPrimaryBtnText}>
                    {camState === 0 && !isCameraReady ? 'Initialisation…' : camPrimaryLabel}
                  </Text>
                </TouchableOpacity>
                {camState === 2 && showEndWorkBtn && (
                  <TouchableOpacity onPress={ywyrEndWork} style={[styles.ywyrBtn, { marginTop: 12 }]} activeOpacity={0.8}>
                    <Text style={styles.ywyrBtnText}>FIN DU TRAVAIL</Text>
                  </TouchableOpacity>
                )}
                {camState === 2 && showEndBlockBtn && (
                  <TouchableOpacity onPress={libreEndForTimeBlock} style={[styles.ywyrBtn, { marginTop: 12 }]} activeOpacity={0.8}>
                    <Text style={styles.ywyrBtnText}>FIN DU BLOC</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              /* ── MULTI BUTTON (no-camera mode) ───────────────────── */
              <>
                {phase === 'ready' && (
                  <View style={styles.ctrlGroup}>
                    <View>
                      <TouchableOpacity onPress={handleStart} style={styles.playBtn} activeOpacity={0.8}>
                        <Play color="#fff" size={36} fill="#fff" />
                      </TouchableOpacity>
                      {countdown > 0 && (
                        <View style={styles.countdownBadge}>
                          <Text style={styles.countdownBadgeText}>{countdown}s</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.actionLabel}>Démarrer</Text>
                  </View>
                )}
                {showEndWorkBtn && (
                  <View style={styles.ctrlGroup}>
                    <TouchableOpacity onPress={ywyrEndWork} style={styles.ywyrBtn} activeOpacity={0.8}>
                      <Text style={styles.ywyrBtnText}>FIN DU TRAVAIL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleStop} style={styles.stopBtnSmall} activeOpacity={0.8}>
                      <Square color="rgba(255,255,255,0.6)" size={22} fill="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                  </View>
                )}
                {showEndBlockBtn && (
                  <View style={styles.ctrlGroup}>
                    <TouchableOpacity onPress={libreEndForTimeBlock} style={styles.ywyrBtn} activeOpacity={0.8}>
                      <Text style={styles.ywyrBtnText}>FIN DU BLOC</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleStop} style={styles.stopBtnSmall} activeOpacity={0.8}>
                      <Square color="rgba(255,255,255,0.6)" size={22} fill="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                  </View>
                )}
                {showNormalStop && (
                  <View style={styles.ctrlGroup}>
                    <TouchableOpacity onPress={handleStop} style={styles.stopBtn} activeOpacity={0.8}>
                      <Square color="#fff" size={30} fill="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.actionLabel}>Arrêter</Text>
                  </View>
                )}
              </>
            )}
          </View>
          </View>
        </>
      )}
    </View>
  );

  if (withCamera) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        {camPermission?.granted
          ? <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} mode="video"
              onCameraReady={() => setIsCameraReady(true)} />
          : <View style={[StyleSheet.absoluteFill, styles.noCamera]}><Text style={styles.noCameraText}>Caméra non disponible</Text></View>
        }
        <View style={[StyleSheet.absoluteFill, styles.cameraDim]} />
        {renderContent()}
        {/* Overlay décompte — top-level pour éviter z-index/elevation Android */}
        {phase === 'countdown' && countdownVal > 0 && (
          <View style={[StyleSheet.absoluteFill, styles.camCdOverlay]} pointerEvents="none">
            <View style={[styles.camCdCircle, { borderColor: `${accentColor}50` }]}>
              <Text style={[styles.camCdNum, {
                color: accentColor,
                textShadowColor: accentColor,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 18,
              }]}>{countdownVal}</Text>
            </View>
          </View>
        )}
        {renderYTModal()}
      </View>
    );
  }

  const phaseBg = phase === 'countdown' ? displayOpts.bgCountdown
    : (phase === 'running' || phase === 'stopped') ? displayOpts.bgRunning
    : phase === 'done' ? displayOpts.bgDone
    : '#0A0A0A';

  function renderYTModal() {
    return (
      <Modal visible={showYT} transparent animationType="slide" onRequestClose={() => setShowYT(false)}>
        <View style={styles.ytModal}>
          <View style={styles.ytSheet}>
            <Text style={styles.ytSheetTitle}>🎬 Partager sur YouTube</Text>
            <Text style={styles.ytSheetSub}>Upload ta vidéo puis colle le lien pour générer l'analyse</Text>

            <TouchableOpacity
              style={[styles.ytActionBtn, { backgroundColor: '#1a1a1a', borderColor: '#333' }]}
              activeOpacity={0.8}
              onPress={() => Linking.openURL('https://studio.youtube.com/channel/UC/videos/upload')}
            >
              <ExternalLink color="#FF0000" size={18} />
              <Text style={[styles.ytActionTxt, { color: '#FF0000' }]}>Ouvrir YouTube Studio</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.ytInput}
              value={ytLink}
              onChangeText={setYtLink}
              placeholder="Colle ton lien YouTube ici…"
              placeholderTextColor="#444"
              autoCapitalize="none"
              keyboardType="url"
            />

            <TouchableOpacity
              style={styles.ytAnalyseBtn}
              activeOpacity={0.85}
              onPress={() => {
                if (!ytLink.trim()) {
                  Alert.alert('Lien manquant', 'Colle d\'abord le lien YouTube de ta vidéo.');
                  return;
                }
                const prompt = `Analyse cette vidéo CrossFit TheHub :\n\n🔗 Lien : ${ytLink.trim()}\n⏱ Temps : ${mainTime}\n🏋️ Type : ${displayLabel}\n\nAnalyse les points suivants :\n1. Technique des mouvements (qualité, erreurs)\n2. Gestion de l'effort et du rythme\n3. Points forts observés\n4. Axes d'amélioration prioritaires\n5. Conseils pour progresser`;
                Clipboard.setString(prompt);
                Alert.alert('✅ Prompt copié !', 'Colle-le dans ChatGPT ou Claude pour analyser ta performance.');
              }}
            >
              <Copy color="#0A0A0A" size={16} />
              <Text style={styles.ytAnalyseTxt}>Copier le prompt d'analyse</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.ytCloseBtn} onPress={() => setShowYT(false)}>
              <Text style={styles.ytCloseTxt}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View style={[styles.containerDark, { backgroundColor: phaseBg }]}>
      <StatusBar hidden />
      {renderContent()}
      {showSettings && (
        <TimerSettingsModal opts={displayOpts} onUpdate={setDisplayOpts} onClose={() => setShowSettings(false)} />
      )}
      {renderYTModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  containerDark: { flex: 1, backgroundColor: '#0A0A0A' },
  cameraDim: { backgroundColor: 'rgba(0,0,0,0.3)' },
  noCamera: { backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  noCameraText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  overlay: { flex: 1, justifyContent: 'space-between', paddingVertical: 60 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  iconBtnDisabled: { opacity: 0.4 },
  topCenter: { alignItems: 'center', gap: 5 },
  modeLabel: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1.5 },
  recIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(220,38,38,0.85)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  recDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  recText: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  totalLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)', minWidth: 44, textAlign: 'right' },
  timerCenter: { alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10 },
  countdownOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', zIndex: 99,
  },
  camCdOverlay: {
    justifyContent: 'center', alignItems: 'center',
  },
  camCdCircle: {
    width: SW * 0.55, height: SW * 0.55, borderRadius: SW * 0.275,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
  },
  camCdNum: {
    fontSize: SW * 0.28, fontWeight: '200', letterSpacing: -4,
  },
  timerDisplay: { fontSize: SW * 0.22, fontWeight: '200', color: '#FFFFFF', letterSpacing: -2 },
  countdownBig: { fontSize: SW * 0.42, fontWeight: '200', letterSpacing: -4 },
  goText: { fontSize: SW * 0.22, fontWeight: '900', color: '#FFFFFF', letterSpacing: 6 },
  doneLabel: { fontSize: 18, fontWeight: '900', color: 'rgba(255,255,255,0.45)', letterSpacing: 4 },
  savedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10, marginTop: 4,
  },
  savedText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  controls: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 8 },
  ctrlGroup: { alignItems: 'center', gap: 14 },
  playBtn: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  countdownBadge: {
    position: 'absolute', right: -10, top: -4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  countdownBadgeText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  stopBtn: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  actionLabel: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
  doneRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  resetBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeResultBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14,
    paddingHorizontal: 28, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  closeResultText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  innerPhaseLabel: { fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  workColor: { color: '#4ADE80' },
  restColor: { color: '#60A5FA' },
  roundLabel: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 2 },
  subLabel: { fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: '500', letterSpacing: 1 },
  finalTime: { fontSize: SW * 0.18, fontWeight: '100', color: 'rgba(255,255,255,0.8)', letterSpacing: -1, marginTop: -4 },
  ywyrBtn: {
    backgroundColor: 'rgba(74,222,128,0.25)', borderRadius: 20,
    paddingHorizontal: 32, paddingVertical: 18,
    borderWidth: 2, borderColor: 'rgba(74,222,128,0.6)',
    alignItems: 'center',
  },
  ywyrBtnText: { fontSize: 16, fontWeight: '900', color: '#4ADE80', letterSpacing: 1 },
  stopBtnSmall: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
    marginTop: 8,
  },
  seqSubLabel: {
    fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.55)',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  infoBar: {
    marginHorizontal: 20, marginBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  infoTitle: {
    fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2, flex: 1,
  },
  infoTimestamp: {
    fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.5)',
    fontVariant: ['tabular-nums'],
  },
  // ── Session Card
  sessionScroll: {
    flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 14,
  },
  sessionCard: {
    borderRadius: 20, overflow: 'hidden',
  },
  sessionCardInner: {
    backgroundColor: '#0D0D0D',
    borderRadius: 20, padding: 24, alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  sessionApp: {
    fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  sessionBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  sessionBadgeText: {
    fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5,
  },
  sessionTime: {
    fontSize: SW * 0.18, fontWeight: '100', color: '#FFFFFF', letterSpacing: -1,
    marginVertical: 4,
  },
  sessionTitle: {
    fontSize: 15, fontWeight: '800', color: '#FFFFFF', textAlign: 'center',
    letterSpacing: 0.2,
  },
  sessionDate: {
    fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.45)',
    fontVariant: ['tabular-nums'],
  },
  sessionQRWrap: {
    marginTop: 8, alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
  },
  sessionQRHint: {
    fontSize: 9, fontWeight: '600', color: '#555555', letterSpacing: 0.5,
  },
  saveCardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  stopVideoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(239,68,68,0.85)', borderRadius: 14,
    paddingHorizontal: 22, paddingVertical: 13,
  },
  stopVideoBtnText: {
    fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.3,
  },
  camPrimaryBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20, paddingHorizontal: 36, paddingVertical: 18,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
    minWidth: 220,
  },
  camPrimaryBtnGo: {
    backgroundColor: 'rgba(74,222,128,0.22)',
    borderColor: 'rgba(74,222,128,0.6)',
  },
  camPrimaryBtnStop: {
    backgroundColor: 'rgba(239,68,68,0.22)',
    borderColor: 'rgba(239,68,68,0.6)',
  },
  camPrimaryBtnText: {
    fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: 0.3,
  },
  playbackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  playbackBtnText: {
    fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3,
  },
  saveCardBtnText: {
    fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3,
  },
  ytBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#FF0000', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#CC0000',
  },
  ytBtnTxt: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  ytModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'flex-end' },
  ytSheet: {
    backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 14,
  },
  ytSheetTitle: { fontSize: 18, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 4 },
  ytSheetSub: { fontSize: 12, color: '#555', textAlign: 'center', marginBottom: 4 },
  ytActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderRadius: 14, padding: 15, borderWidth: 1,
  },
  ytActionTxt: { fontSize: 14, fontWeight: '800' },
  ytInput: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    fontSize: 13, color: '#fff', borderWidth: 1, borderColor: '#333',
  },
  ytAnalyseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#00ff88', borderRadius: 14, padding: 15,
  },
  ytAnalyseTxt: { fontSize: 14, fontWeight: '900', color: '#0A0A0A' },
  ytCloseBtn: { alignItems: 'center', paddingVertical: 8 },
  ytCloseTxt: { fontSize: 13, color: '#555', fontWeight: '700' },
  recLogoWrap: {
    position: 'absolute', bottom: 100, right: 16,
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 14, padding: 6,
  },
  recLogoImg: { width: 48, height: 48, opacity: 0.85 },
});
