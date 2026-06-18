import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Dimensions, ActivityIndicator, ScrollView, Modal,
  TextInput, Linking, Clipboard, Alert, useWindowDimensions, Image, KeyboardAvoidingView, Platform, Vibration, AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle } from 'react-native-svg';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { RealtimeRecorderView, updateOverlayState, startRecording as nativeStartRec, stopRecording as nativeStopRec } from 'realtime-recorder';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio, InterruptionModeAndroid } from 'expo-av';
import { Square, Play, X, RotateCcw, CheckCircle, RefreshCw, Download, Settings, Youtube, Copy, ExternalLink, RotateCw } from 'lucide-react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList, SeqBlock } from '../../navigation';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { incrementCounter } from '../../services/gamification';
import * as Notifications from 'expo-notifications';
import { spacing, borderRadius, typography } from '../../theme/designTokens';
import { captureError } from '../../lib/sentry';
import { hapticLight, hapticMedium, hapticHeavy } from '../../lib/haptics';

type Route = RouteProp<HomeStackParamList, 'TimerRun'>;
type Nav = NativeStackNavigationProp<HomeStackParamList, 'TimerRun'>;

type Phase = 'ready' | 'countdown' | 'running' | 'stopped' | 'done' | 'splits-waiting';

const { width: SW } = Dimensions.get('window');

function formatTime(totalSec: number): string {
  const m = Math.floor(Math.abs(totalSec) / 60);
  const s = Math.abs(totalSec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type WavSeg = { hz?: number; ms: number; silent?: boolean; fadeInMs?: number; fadeOutMs?: number };

// ─── WAV PCM 16-bit mono 44100 Hz generator ─────────────────────────────────
function buildMultiWAV(segs: WavSeg[]): string {
  const sr = 44100;
  const blockAlign = 2; // 16-bit mono
  let totalSamples = 0;
  for (const seg of segs) totalSamples += Math.floor(sr * seg.ms / 1000);
  const dataBytes = totalSamples * blockAlign;
  const ab = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(ab);
  const u8 = new Uint8Array(ab);
  const ws = (o: number, v: string) => { for (let i = 0; i < v.length; i++) u8[o + i] = v.charCodeAt(i); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + dataBytes, true); ws(8, 'WAVE');
  ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * blockAlign, true);
  dv.setUint16(32, blockAlign, true); dv.setUint16(34, 16, true);
  ws(36, 'data'); dv.setUint32(40, dataBytes, true);
  let off = 44;
  for (const seg of segs) {
    const n       = Math.floor(sr * seg.ms / 1000);
    const fadeIn  = Math.max(1, Math.floor(sr * (seg.fadeInMs  ?? 5)  / 1000));
    const fadeOut = Math.max(1, Math.floor(sr * (seg.fadeOutMs ?? 8)  / 1000));
    for (let i = 0; i < n; i++) {
      let sample = 0;
      if (!seg.silent && seg.hz) {
        let amp = 0.85;
        if (i < fadeIn)          amp *= i / fadeIn;
        else if (i > n - fadeOut) amp *= (n - i) / fadeOut;
        sample = Math.round(32767 * amp * Math.sin(2 * Math.PI * seg.hz * i / sr));
      }
      dv.setInt16(off, sample, true); off += 2;
    }
  }
  let b = ''; for (let i = 0; i < u8.length; i++) b += String.fromCharCode(u8[i]);
  return btoa(b);
}

// ─── One-shot tone: génère + joue + décharge automatiquement ─────────────────
async function playTone(hz: number, ms: number, fadeOutMs = 20): Promise<void> {
  try {
    const wav  = buildMultiWAV([{ hz, ms, fadeInMs: 5, fadeOutMs }]);
    const path = (FileSystem.cacheDirectory ?? '') + `bwod_tone_${hz}_${ms}.wav`;
    await FileSystem.writeAsStringAsync(path, wav, { encoding: FileSystem.EncodingType.Base64 });
    const { sound } = await Audio.Sound.createAsync({ uri: path }, { shouldPlay: true });
    setTimeout(() => { sound.unloadAsync().catch(e => captureError(e, { action: 'unloadTone' })); }, ms + 500);
  } catch (e) { captureError(e, { screen: 'TimerRun', action: 'playTone', hz, ms }); }
}

// ─── Séquence d'armement : 3× bip court (860 Hz) + 1× bip long (1000 Hz) ────
function playArmingSequence(): void {
  playTone(860, 150, 20);
  setTimeout(() => playTone(860, 150, 20), 1000);
  setTimeout(() => playTone(860, 150, 20), 2000);
  setTimeout(() => playTone(1000, 550, 40), 3000);
}


// ─── Timer display options ─────────────────────────────────────────────────────
type ClockStyle = 'arc' | 'bar' | 'digits';
interface TimerDisplayOpts {
  clockStyle: ClockStyle; fontSize: number; digitColor: string;
  bgCountdown: string; bgRunning: string; bgDone: string; bipsEnabled: boolean;
  allowRotation: boolean; themeId: string;
}
const DISPLAY_OPTS_KEY = 'bwod_timer_display_opts_v2';
// App theme — emerald / dark, aligned with GlassBackground.tsx
const THEME_EMERALD       = '#10B981';
const THEME_EMERALD_DEEP  = '#059669';
const THEME_BG_COUNTDOWN  = '#0d1f17';   // deep emerald-dark (preparation)
const THEME_BG_RUNNING    = '#022c22';   // emerald-dark (in progress)
const THEME_BG_DONE       = '#14532d';   // emerald-success (completed)
const THEME_DIGIT_COLOR   = '#FFFFFF';
const DEFAULT_DISPLAY: TimerDisplayOpts = {
  clockStyle: 'arc', fontSize: Math.round(SW * 0.22), digitColor: THEME_DIGIT_COLOR,
  bgCountdown: THEME_BG_COUNTDOWN, bgRunning: THEME_BG_RUNNING, bgDone: THEME_BG_DONE,
  bipsEnabled: true, allowRotation: false, themeId: 'emerald',
};

// Ensure digit color contrasts with background — returns safe color
function ensureContrast(digitColor: string, bgColor: string): string {
  const lum = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  };
  const diff = Math.abs(lum(digitColor) - lum(bgColor));
  if (diff < 60) return lum(bgColor) > 128 ? '#000000' : '#FFFFFF';
  return digitColor;
}

// Phase-specific accent colors for visual feedback
const PHASE_COLORS = {
  prepare: '#38BDF8',  // cyan-blue
  work:    '#4ADE80',  // green
  rest:    '#F87171',  // coral-red
  done:    '#FACC15',  // gold
  ready:   '#FFFFFF',  // white
};

// ─── Timer themes ──────────────────────────────────────────────────────────────
const TIMER_THEMES = [
  { id: 'emerald',  label: 'Lime',     emoji: '🌿', digitColor: '#39FF14', bgCountdown: '#001a0d', bgRunning: '#002616', bgDone: '#004d2a', accent: '#39FF14' },
  { id: 'fire',     label: 'Orange',   emoji: '🔥', digitColor: '#FF6600', bgCountdown: '#1a0500', bgRunning: '#2e0800', bgDone: '#5c1500', accent: '#FF6600' },
  { id: 'electric', label: 'Cyan Blue',emoji: '⚡', digitColor: '#00BFFF', bgCountdown: '#00091a', bgRunning: '#001433', bgDone: '#002255', accent: '#00BFFF' },
  { id: 'midnight', label: 'Violet',   emoji: '🌙', digitColor: '#CC00FF', bgCountdown: '#0d001a', bgRunning: '#1a0033', bgDone: '#330066', accent: '#CC00FF' },
  { id: 'ocean',    label: 'Cyan',     emoji: '🌊', digitColor: '#00FFFF', bgCountdown: '#001a1a', bgRunning: '#002626', bgDone: '#004040', accent: '#00FFFF' },
  { id: 'solar',    label: 'Yellow',   emoji: '☀️', digitColor: '#FFFF00', bgCountdown: '#1a1400', bgRunning: '#292000', bgDone: '#4d3d00', accent: '#FFFF00' },
  { id: 'neon',     label: 'Pink',     emoji: '🩷', digitColor: '#FF0090', bgCountdown: '#1a0011', bgRunning: '#2d001e', bgDone: '#500035', accent: '#FF0090' },
  { id: 'rage',     label: 'Red',      emoji: '🔴', digitColor: '#FF1414', bgCountdown: '#1a0000', bgRunning: '#260000', bgDone: '#4d0000', accent: '#FF1414' },
];

const DIGIT_COLORS = [
  '#FFFF00', '#39FF14', '#FF0000', '#00FFFF',
  '#CC00FF', '#FF6600', '#00BFFF', '#FF0090',
  '#FFFFFF', '#FFD700', '#FF4500', '#7B2FFF',
  '#00FF80', '#00E5FF', '#FF1493', '#10ff9f',
];

// ─── ARC clock (SVG) ─────────────────────────────────────────────────────────
function ArcTimer({ time, progress, color, fontSize, strokeColor, landscape, customSize }: { time: string; progress: number; color: string; fontSize?: number; strokeColor?: string; landscape?: boolean; customSize?: number }) {
  const { width: aw, height: ah } = useWindowDimensions();
  const size = customSize ?? (landscape ? Math.min(ah * 0.85, aw * 0.5) : Math.min(aw, ah) * 0.86);
  const r    = size / 2 - 18;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - Math.max(0, Math.min(1, progress)));
  const sc = strokeColor || color;
  // Use user-chosen fontSize, but cap so the digits stay readable inside the circle
  const innerDiam = size - 50;
  const maxFs = Math.round(Math.min(size * 0.42, innerDiam / 2.7));
  const fs = Math.min(fontSize ?? Math.round(size * 0.2), maxFs);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={14} />
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={sc} strokeWidth={14}
          strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} strokeDashoffset={dash} />
      </Svg>
      <Text style={{ fontSize: fs, fontWeight: '200', color, letterSpacing: -2,
        textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 22 }}>
        {time}
      </Text>
    </View>
  );
}

// ─── BAR clock ──────────────────────────────────────────────────────────────
function BarTimer({ time, progress, color, fontSize, strokeColor, landscape }: { time: string; progress: number; color: string; fontSize: number; strokeColor?: string; landscape?: boolean }) {
  const { width: bw, height: bh } = useWindowDimensions();
  const isLandscapeBar = bw > bh;
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const sc = strokeColor || color;
  const fs = landscape ? Math.max(fontSize, Math.round(bh * 0.35)) : fontSize;
  return (
    <View style={{ alignItems: 'center', gap: 20 }}>
      <View style={{ width: isLandscapeBar ? bw * 0.45 : bw * 0.75, height: landscape ? 18 : 14, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 9, overflow: 'hidden', position: 'relative' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%` as `${number}%`, backgroundColor: sc, borderRadius: 9 }} />
      </View>
      <Text style={{ fontSize: fs, fontWeight: '200', color, letterSpacing: -2,
        textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18 }}>
        {time}
      </Text>
    </View>
  );
}

// ─── DIGITS clock ───────────────────────────────────────────────────────────
function DigitsTimer({ time, color, fontSize, landscape }: { time: string; color: string; fontSize: number; landscape?: boolean }) {
  const { height: dh } = useWindowDimensions();
  const fs = landscape ? Math.max(fontSize, Math.round(dh * 0.4)) : fontSize;
  return (
    <Text style={{ fontSize: fs, fontWeight: '200', color, letterSpacing: -2,
      textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 22 }}>
      {time}
    </Text>
  );
}

// ─── Settings modal ───────────────────────────────────────────────────────────
function TimerSettingsModal({ opts, onUpdate, onClose }: {
  opts: TimerDisplayOpts; onUpdate: (u: Partial<TimerDisplayOpts>) => void; onClose: () => void;
}) {
  const cardW = Math.floor((SW - 48 - 30) / 4);
  const SLabel = ({ label }: { label: string }) => (
    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 3, marginBottom: 12, textTransform: 'uppercase', fontWeight: '800' }}>{label}</Text>
  );
  function applyTheme(t: typeof TIMER_THEMES[number]) {
    onUpdate({ themeId: t.id, digitColor: t.digitColor, bgCountdown: t.bgCountdown, bgRunning: t.bgRunning, bgDone: t.bgDone });
  }
  const activeTheme = TIMER_THEMES.find(t => t.id === opts.themeId) ?? TIMER_THEMES[0];
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' }} activeOpacity={1} onPress={onClose} />
      <View style={{ backgroundColor: '#0a0a0a', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8, maxHeight: '90%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 20 }} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 44 }} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 }}>🎨 Design du minuteur</Text>
            <View style={{ backgroundColor: `${activeTheme.accent}20`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: `${activeTheme.accent}50` }}>
              <Text style={{ color: activeTheme.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>{activeTheme.emoji} {activeTheme.label.toUpperCase()}</Text>
            </View>
          </View>

          {/* ── THÈME */}
          <SLabel label="Thème" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
            {TIMER_THEMES.map(t => {
              const isActive = opts.themeId === t.id;
              return (
                <TouchableOpacity key={t.id} onPress={() => applyTheme(t)} activeOpacity={0.75}
                  style={{ width: cardW, borderRadius: 16, overflow: 'hidden', borderWidth: 2.5,
                    borderColor: isActive ? t.accent : 'rgba(255,255,255,0.06)',
                    shadowColor: t.accent, shadowOpacity: isActive ? 0.6 : 0, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }}>
                  <View style={{ backgroundColor: t.bgRunning, paddingVertical: 12, alignItems: 'center', gap: 6 }}>
                    <View style={{ width: cardW - 22, height: cardW - 22, borderRadius: (cardW - 22) / 2, borderWidth: 3,
                      borderColor: t.accent, justifyContent: 'center', alignItems: 'center',
                      backgroundColor: `${t.accent}15` }}>
                      <Text style={{ color: t.digitColor, fontSize: 10, fontWeight: '200', letterSpacing: -0.5 }}>01:30</Text>
                    </View>
                    <Text style={{ color: t.accent, fontSize: 8, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.label}</Text>
                    {isActive && (
                      <View style={{ position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: 8,
                        backgroundColor: t.accent, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ color: '#000', fontSize: 9, fontWeight: '900' }}>✓</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── COULEUR DES CHIFFRES */}
          <SLabel label="Couleur des chiffres" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
            {DIGIT_COLORS.map(c => {
              const isActive = opts.digitColor === c;
              return (
                <TouchableOpacity key={c} onPress={() => onUpdate({ digitColor: c })} activeOpacity={0.75}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c,
                    borderWidth: isActive ? 3 : 1.5,
                    borderColor: isActive ? '#fff' : 'rgba(255,255,255,0.1)',
                    shadowColor: c, shadowOpacity: isActive ? 0.9 : 0.3,
                    shadowRadius: isActive ? 12 : 4, shadowOffset: { width: 0, height: 0 },
                    justifyContent: 'center', alignItems: 'center' }}>
                  {isActive && <Text style={{ color: '#0a0a0a', fontSize: 14, fontWeight: '900' }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── STYLE D'HORLOGE */}
          <SLabel label="Style d'affichage" />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 28 }}>
            {([
              { id: 'arc',    label: 'Cercle', icon: '◯' },
              { id: 'bar',    label: 'Barre',  icon: '▬' },
              { id: 'digits', label: 'Digits', icon: '99' },
            ] as { id: ClockStyle; label: string; icon: string }[]).map(s => {
              const active = opts.clockStyle === s.id;
              return (
                <TouchableOpacity key={s.id} onPress={() => onUpdate({ clockStyle: s.id })} activeOpacity={0.8}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', gap: 4,
                    backgroundColor: active ? `${opts.digitColor}20` : 'rgba(255,255,255,0.04)',
                    borderWidth: 1.5, borderColor: active ? opts.digitColor : 'rgba(255,255,255,0.08)' }}>
                  <Text style={{ color: active ? opts.digitColor : 'rgba(255,255,255,0.35)', fontSize: 20 }}>{s.icon}</Text>
                  <Text style={{ color: active ? opts.digitColor : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>{s.label.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── TAILLE */}
          <SLabel label={`Taille des chiffres · ${opts.fontSize}px`} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 }}>
            <TouchableOpacity onPress={() => onUpdate({ fontSize: Math.max(20, opts.fontSize - 8) })} activeOpacity={0.8}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)',
                justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>−</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(((opts.fontSize - 20) / 120) * 100)}%` as `${number}%`,
                height: '100%', backgroundColor: opts.digitColor, borderRadius: 3 }} />
            </View>
            <TouchableOpacity onPress={() => onUpdate({ fontSize: Math.min(140, opts.fontSize + 8) })} activeOpacity={0.8}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)',
                justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>+</Text>
            </TouchableOpacity>
          </View>

          {/* ── SONS + ROTATION */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
            <TouchableOpacity onPress={() => onUpdate({ bipsEnabled: !opts.bipsEnabled })} activeOpacity={0.8}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14,
                backgroundColor: opts.bipsEnabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                borderWidth: 1, borderColor: opts.bipsEnabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)' }}>
              <Text style={{ fontSize: 18 }}>{opts.bipsEnabled ? '🔊' : '🔇'}</Text>
              <Text style={{ color: opts.bipsEnabled ? '#fff' : 'rgba(255,255,255,0.35)', fontWeight: '700', fontSize: 12 }}>
                Sons {opts.bipsEnabled ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onUpdate({ allowRotation: !opts.allowRotation })} activeOpacity={0.8}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14,
                backgroundColor: opts.allowRotation ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                borderWidth: 1, borderColor: opts.allowRotation ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)' }}>
              <RotateCw size={18} color={opts.allowRotation ? '#fff' : 'rgba(255,255,255,0.35)'} />
              <Text style={{ color: opts.allowRotation ? '#fff' : 'rgba(255,255,255,0.35)', fontWeight: '700', fontSize: 12 }}>
                {opts.allowRotation ? 'Rotation' : 'Portrait'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── RÉINITIALISER + FERMER */}
          <View style={{ gap: 10 }}>
            <TouchableOpacity onPress={() => onUpdate({ ...DEFAULT_DISPLAY })} activeOpacity={0.8}
              style={{ paddingVertical: 13, borderRadius: 14, alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '700', letterSpacing: 1.5 }}>RÉINITIALISER</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} activeOpacity={0.85}
              style={{ paddingVertical: 16, borderRadius: 14, alignItems: 'center', backgroundColor: opts.digitColor }}>
              <Text style={{ color: '#0a0a0a', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 }}>FERMER</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function TimerRunScreen() {
  // Empêche l'écran de se verrouiller pendant toute la session timer (avec ou sans caméra)
  useKeepAwake('timer-run');

  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { currentBox, user } = useAuth();
  const { timerType, countdown, totalSeconds, maxTime, interval, rounds, workTime, restTime, withCamera, sequence, videoTitle, withTimestamp, competitionLogoUrl } = route.params;

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const [phase, setPhase] = useState<Phase>('ready');
  const [countdownVal, setCountdownVal] = useState(countdown);

  const [timerVal, setTimerVal] = useState(0);
  const initRTL = timerType === 'amrap' ? totalSeconds
    : timerType === 'emom'  ? interval * 60
    : timerType === 'tabata' ? workTime
    : timerType === 'splits' ? workTime : 0;
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
  const [isCameraReady, setIsCameraReady] = useState(withCamera);
  const [sessionMeta, setSessionMeta] = useState<{
    videoURL: string; title: string; recordedAt: string;
    timerStartOffset: number; timerStopOffset: number; countdownDuration: number;
    overlaysBurned: boolean;
  } | null>(null);
  const [savingCard, setSavingCard] = useState(false);
  const [cardSaved, setCardSaved] = useState(false);
  const cardRef = useRef<ViewShot>(null);
  const recordingCdRef = useRef(0);
  const videoStartTimeRef = useRef<number>(0);
  const mainTimeRef = useRef('00:00');
  const lastTickTimeRef = useRef<number>(Date.now());
  const timerStartOffsetRef = useRef<number | null>(null);
  const timerStopOffsetRef = useRef<number | null>(null);
  const bgNotifIdsRef = useRef<string[]>([]);

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


  // Sync overlay state to native module on every render tick
  useEffect(() => {
    if (!withCamera || !isRecordingActive) return;
    const id = setInterval(() => {
      try {
        // Compute precise timer with hundredths
        const baseDisplay = mainTimeRef.current; // e.g. "02:35"
        const msSinceTick = Date.now() - lastTickTimeRef.current;
        const hundredths = Math.min(99, Math.floor(msSinceTick / 10));
        const preciseDisplay = `${baseDisplay}.${String(hundredths).padStart(2, '0')}`;

        updateOverlayState({
          timerType: timerType,
          timerDisplay: baseDisplay,
          title: videoTitle || '',
          timestamp: clockStr,
          isRecording: true,
          countdownValue: phase === 'countdown' ? countdownVal : 0,
          showTimer: phase === 'running' || phase === 'stopped',
          boxLogoUrl: currentBox?.logo_url || '',
          competitionLogoUrl: competitionLogoUrl || '',
        });
      } catch (e) { /* overlay update — silent to avoid flooding Sentry */ }
    }, 100); // 10Hz — timer & timestamp only change at 1Hz, no visual loss
    return () => clearInterval(id);
  }, [withCamera, isRecordingActive, timerType, videoTitle, clockStr, phase, countdownVal, currentBox, competitionLogoUrl]);

  async function saveCard() {
    if (savingCard || cardSaved) return;
    try {
      setSavingCard(true);
      const uri = await (cardRef.current as any).capture();
      await MediaLibrary.saveToLibraryAsync(uri);
      setCardSaved(true);
    } catch (e) {
      captureError(e, { screen: 'TimerRun', action: 'saveCard' });
    } finally {
      setSavingCard(false);
    }
  }

  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraRef         = useRef<any>(null);
  const recordingActiveRef = useRef(false);
  const soundReadyRef     = useRef(false);
  const sndTickRef        = useRef<Audio.Sound[]>([]);
  const sndTickIdxRef     = useRef(0);
  const sndGoRef          = useRef<Audio.Sound | null>(null);
  const sndDoneRef        = useRef<Audio.Sound | null>(null);

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

  function cancelBgBeeps() {
    bgNotifIdsRef.current.forEach(id => {
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    });
    bgNotifIdsRef.current = [];
  }

  async function scheduleBgBeeps() {
    if (withCamera) return;
    cancelBgBeeps();
    const ids: string[] = [];

    const add = async (sec: number) => {
      if (sec < 1 || ids.length > 58) return;
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: { sound: 'default' },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(sec), repeats: false },
        });
        ids.push(id);
      } catch {}
    };
    const ticks = async (atSec: number) => {
      await add(atSec - 3);
      await add(atSec - 2);
      await add(atSec - 1);
    };

    switch (timerType) {
      case 'for-time':
        if (maxTime > 0) { await ticks(maxTime); await add(maxTime); }
        break;

      case 'amrap':
        await ticks(totalSeconds); await add(totalSeconds);
        break;

      case 'emom': {
        for (let r = 1; r <= rounds && ids.length < 55; r++) {
          const t = r * interval * 60;
          await ticks(t); await add(t);
        }
        break;
      }

      case 'tabata': {
        let t = 0;
        for (let r = 1; r <= rounds && ids.length < 55; r++) {
          t += workTime; await ticks(t); await add(t);
          if (r < rounds) { t += restTime; await ticks(t); await add(t); }
        }
        break;
      }

      case 'splits': {
        for (let r = 1; r <= rounds && ids.length < 55; r++) {
          const t = r * workTime;
          await ticks(t); await add(t);
        }
        break;
      }

      case 'ywyr':
        // Durée dynamique (repos = travail accumulé) — impossible à pré-planifier.
        // Le delta wall-clock garantit la précision à l'affichage.
        break;

      case 'libre': {
        let blocks: SeqBlock[] = [];
        try { blocks = JSON.parse(sequence); } catch {}
        let cursor = 0;
        for (const blk of blocks) {
          if (ids.length > 55) break;
          switch (blk.type) {
            case 'amrap':
            case 'for-time': {
              const dur = blk.durationMin > 0 ? blk.durationMin * 60 : 0;
              if (dur > 0) { cursor += dur; await ticks(cursor); await add(cursor); }
              break;
            }
            case 'emom': {
              const ivSec = blk.emomInterval === 0 ? (blk.emomCustomSec ?? 90) : blk.emomInterval * 60;
              for (let r = 1; r <= blk.emomRounds && ids.length < 55; r++) {
                cursor += ivSec; await ticks(cursor); await add(cursor);
              }
              break;
            }
            case 'tabata': {
              for (let r = 1; r <= blk.tabRounds && ids.length < 55; r++) {
                cursor += blk.workSec; await ticks(cursor); await add(cursor);
                if (r < blk.tabRounds) { cursor += blk.restSec; await ticks(cursor); await add(cursor); }
              }
              break;
            }
            case 'ywyr': break; // dynamique
          }
          if (blk.pauseSec > 0) cursor += blk.pauseSec;
        }
        break;
      }
    }

    bgNotifIdsRef.current = ids;
  }

  const { theme } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;

  // Hide the parent tab bar whenever this screen is mounted. Re-apply on
  // orientation changes because React Navigation resets the tab bar style
  // when the navigator re-renders on rotation.
  useEffect(() => {
    const parent = navigation.getParent();
    const hide = () => parent?.setOptions({ tabBarStyle: { display: 'none' } });
    hide();
    const unsubFocus = navigation.addListener('focus', hide);
    return () => {
      unsubFocus();
      parent?.setOptions({
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 60,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
      });
    };
  }, [isLandscape, navigation, theme.tabBar, theme.tabBarBorder]);

  useEffect(() => {
    if (timerType === 'libre') {
      try { seqBlocksRef.current = JSON.parse(sequence); } catch { seqBlocksRef.current = []; }
      if (seqBlocksRef.current.length > 0) initSeqBlockByIdx(0);
    }
    async function setup() {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: !withCamera,
          // Android: force playback through the main speaker and don't let
          // the concurrent mic recording duck our beeps.
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch (e) { captureError(e, { screen: 'TimerRun', action: 'setAudioMode' }); }
      if (withCamera) {
        if (!camPermission?.granted) requestCamPermission();
        if (!micPermission?.granted) requestMicPermission();
        if (!mediaPermission?.granted) requestMediaPermission();
      }
      const cDir = FileSystem.cacheDirectory ?? '';
      // fadeInMs >= 15ms to avoid audible click/pop at beep start
      await FileSystem.writeAsStringAsync(cDir + 'bwod_tick.wav',
        buildMultiWAV([{ hz: 860, ms: 180, fadeInMs: 15, fadeOutMs: 30 }]),
        { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(cDir + 'bwod_go.wav',
        buildMultiWAV([{ hz: 1000, ms: 550, fadeInMs: 15, fadeOutMs: 50 }]),
        { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(cDir + 'bwod_done.wav',
        buildMultiWAV([
          { hz: 1000, ms: 550, fadeInMs: 15, fadeOutMs: 50 },
          { silent: true, ms: 80 },
          { hz: 1000, ms: 550, fadeInMs: 15, fadeOutMs: 50 },
        ]), { encoding: FileSystem.EncodingType.Base64 });
      // Pool de 3 Audio.Sound tick pré-chargés (expo-av)
      for (let i = 0; i < 3; i++) {
        const { sound } = await Audio.Sound.createAsync({ uri: cDir + 'bwod_tick.wav' });
        sndTickRef.current.push(sound);
      }
      const { sound: goSnd } = await Audio.Sound.createAsync({ uri: cDir + 'bwod_go.wav' });
      sndGoRef.current = goSnd;
      const { sound: doneSnd } = await Audio.Sound.createAsync({ uri: cDir + 'bwod_done.wav' });
      sndDoneRef.current = doneSnd;

      // Mark sounds as ready BEFORE the warmup, so that if the user starts
      // a countdown very quickly after mounting this screen, the first ticks
      // aren't silently dropped while we wait for the warmup. The fadeIn on
      // each WAV already prevents the click/pop issue the warmup was solving.
      soundReadyRef.current = true;

      // Warmup: play a truly silent 200ms WAV to prime the Android audio
      // pipeline in the background. Non-blocking — beeps work even if this
      // hasn't finished yet.
      (async () => {
        try {
          const silencePath = cDir + 'bwod_silence.wav';
          await FileSystem.writeAsStringAsync(silencePath,
            buildMultiWAV([{ silent: true, ms: 200 }]),
            { encoding: FileSystem.EncodingType.Base64 });
          const { sound: silenceSnd } = await Audio.Sound.createAsync({ uri: silencePath });
          await silenceSnd.playAsync();
          await new Promise(r => setTimeout(r, 220));
          await silenceSnd.unloadAsync();
        } catch (e) { captureError(e, { screen: 'TimerRun', action: 'warmupSilence' }); }
      })();
    }
    setup();
    return () => {
      sndTickRef.current.forEach(s => { s.unloadAsync().catch(e => captureError(e, { action: 'unloadTick' })); });
      sndTickRef.current = [];
      sndGoRef.current?.unloadAsync().catch(e => captureError(e, { action: 'unloadGo' }));
      sndDoneRef.current?.unloadAsync().catch(e => captureError(e, { action: 'unloadDone' }));
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(DISPLAY_OPTS_KEY).then(v => {
      if (v) try { setDisplayOptsRaw({ ...DEFAULT_DISPLAY, ...JSON.parse(v) }); } catch (e) { captureError(e, { screen: 'TimerRun', action: 'parseDisplayOpts' }); }
    });
  }, []);

  // Screen orientation lock/unlock
  // Main effect: apply the desired orientation behavior on dependency changes.
  // IMPORTANT: no cleanup here — we don't want to flip to PORTRAIT_UP between
  // state transitions (e.g. when isRecordingActive flips true while the user is
  // holding the phone in landscape), which would cause a device rotation
  // + native camera re-setup and drop frames/ticks for ~3s.
  useEffect(() => {
    if (withCamera) {
      if (isRecordingActive) {
        // Lock to whatever orientation the user chose before pressing record
        ScreenOrientation.getOrientationAsync().then(orientation => {
          const lock =
            orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT
              ? ScreenOrientation.OrientationLock.LANDSCAPE_LEFT
              : orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
                ? ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
                : ScreenOrientation.OrientationLock.PORTRAIT_UP;
          ScreenOrientation.lockAsync(lock).catch(e => captureError(e, { action: 'lockOrientation' }));
        }).catch(e => captureError(e, { action: 'getOrientation' }));
      } else {
        // Before recording: allow rotation so user can choose portrait or landscape
        ScreenOrientation.unlockAsync().catch(e => captureError(e, { action: 'unlockOrientation' }));
      }
    } else {
      if (displayOpts.allowRotation) {
        ScreenOrientation.unlockAsync().catch(e => captureError(e, { action: 'unlockOrientation' }));
      } else {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(e => captureError(e, { action: 'lockOrientation' }));
      }
    }
  }, [withCamera, isRecordingActive, displayOpts.allowRotation]);

  // Unmount-only: restore portrait lock when the screen is finally removed.
  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .catch(e => captureError(e, { action: 'lockOrientation' }));
    };
  }, []);

  function setDisplayOpts(update: Partial<TimerDisplayOpts>) {
    setDisplayOptsRaw(prev => {
      const next = { ...prev, ...update };
      AsyncStorage.setItem(DISPLAY_OPTS_KEY, JSON.stringify(next)).catch(e => captureError(e, { action: 'saveDisplayOpts' }));
      return next;
    });
  }

  function playBeep(type: 'tick' | 'go' | 'done') {
    if (!displayOptsRef.current.bipsEnabled || !soundReadyRef.current) return;
    try {
      if (type === 'tick') {
        hapticLight();
        const s = sndTickRef.current[sndTickIdxRef.current % 3];
        sndTickIdxRef.current++;
        s?.replayAsync();
      } else if (type === 'go') {
        hapticMedium();
        sndGoRef.current?.replayAsync();
      } else {
        hapticHeavy();
        sndDoneRef.current?.replayAsync();
      }
    } catch (e) { captureError(e, { screen: 'TimerRun', action: 'playBeep' }); }
  }

  function stopAndSave() {
    clearTimer();
    cancelBgBeeps();
    if (withCamera && recordingActiveRef.current) {
      timerStopOffsetRef.current = Date.now() - videoStartTimeRef.current;
      setPhase('stopped');
    } else {
      if (user) incrementCounter(user.id, 'total_timer_sessions', 1, currentBox?.id).catch(e => captureError(e, { action: 'incrementTimerSessions' }));
      setPhase('done');
    }
  }

  async function handleStartRecording() {
    if (!isCameraReady) return;

    // Ensure microphone permission is granted before recording (fixes silent videos)
    if (!micPermission?.granted) {
      const result = await requestMicPermission();
      if (!result.granted) {
        Alert.alert('Permission requise', 'Le micro est nécessaire pour enregistrer le son de la vidéo.');
        return;
      }
    }

    // Re-activate audio session right before recording to prevent conflicts with expo-av
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
    } catch (e) { captureError(e, { screen: 'TimerRun', action: 'setAudioModePreRecord' }); }

    videoStartTimeRef.current = Date.now();
    timerStartOffsetRef.current = null;
    timerStopOffsetRef.current = null;
    recordingActiveRef.current = true;
    setIsRecordingActive(true);

    // Start native realtime recording (overlays burned on each frame)
    const outputPath = (FileSystem.documentDirectory ?? '') + `bwod_video_${videoStartTimeRef.current}.mp4`;
    nativeStartRec({ outputPath, facing, isLandscape }).catch((err: any) => {
      captureError(err, { screen: 'TimerRun', action: 'nativeStartRec' });
      recordingActiveRef.current = false;
      setIsRecordingActive(false);
    });
  }

  async function stopVideoAndFinish() {
    if (!recordingActiveRef.current) return;
    recordingActiveRef.current = false;
    setIsRecordingActive(false);
    setSaving(true);

    try {
      const videoPath = await nativeStopRec();

      // Resolve the file path (strip file:// if needed for MediaLibrary)
      const localPath = videoPath.startsWith('file://') ? videoPath.replace('file://', '') : videoPath;
      const finalVideoPath = videoPath.startsWith('file://') ? videoPath : `file://${videoPath}`;

      // Save to phone gallery
      try {
        await MediaLibrary.saveToLibraryAsync(localPath);
      } catch (libErr: any) {
        captureError(libErr, { screen: 'TimerRun', action: 'saveToLibrary' });
      }

      setSavedUri(finalVideoPath);

      const recordedAtISO = new Date(videoStartTimeRef.current).toISOString();
      const meta = {
        videoURL: finalVideoPath,
        title: videoTitle ?? '',
        recordedAt: recordedAtISO,
        timerType,
        timerDuration: timerStopOffsetRef.current != null && timerStartOffsetRef.current != null
          ? Math.round((timerStopOffsetRef.current - timerStartOffsetRef.current) / 1000)
          : timerValRef.current,
        timerStartOffset: timerStartOffsetRef.current ?? 0,
        timerStopOffset: timerStopOffsetRef.current ?? 0,
        countdownDuration: countdown,
        overlaysBurned: true,
      };
      setSessionMeta(meta);
      const metaPath = (FileSystem.documentDirectory ?? '') + `bwod_${videoStartTimeRef.current}.json`;
      await FileSystem.writeAsStringAsync(metaPath, JSON.stringify(meta, null, 2));
      setPhase('done');
    } catch (e) {
      captureError(e, { screen: 'TimerRun', action: 'stopRecording' });
      setPhase('done');
    } finally {
      setSaving(false);
    }
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

      lastTickTimeRef.current = Date.now();
      scheduleBgBeeps();
      intervalRef.current = setInterval(() => {
        const _now = Date.now();
        const deltaSecs = Math.max(1, Math.round((_now - lastTickTimeRef.current) / 1000));
        lastTickTimeRef.current = _now;
        const recovering = deltaSecs > 1;
        switch (timerType) {

          case 'for-time':
            timerValRef.current += deltaSecs;
            setTimerVal(timerValRef.current);
            if (maxTime > 0 && timerValRef.current >= maxTime) {
              playBeep('done');
              stopAndSave();
            } else if (maxTime > 0 && !recovering) {
              const remaining = maxTime - timerValRef.current;
              if (remaining === 3 || remaining === 2 || remaining === 1) playBeep('tick');
            }
            break;

          case 'amrap':
            roundTimeLeftRef.current -= deltaSecs;
            setRoundTimeLeft(roundTimeLeftRef.current);
            if (roundTimeLeftRef.current <= 0) {
              playBeep('done');
              stopAndSave();
            } else if (roundTimeLeftRef.current <= 3 && !recovering) {
              playBeep('tick');
            }
            break;

          case 'emom':
            roundTimeLeftRef.current -= deltaSecs;
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
                if (!recovering) playBeep('go');
              }
            } else if (roundTimeLeftRef.current <= 3 && !recovering) {
              playBeep('tick');
            }
            break;

          case 'tabata':
            roundTimeLeftRef.current -= deltaSecs;
            setRoundTimeLeft(roundTimeLeftRef.current);
            if (roundTimeLeftRef.current <= 0) {
              if (innerPhaseRef.current === 'work') {
                innerPhaseRef.current = 'rest';
                setInnerPhase('rest');
                roundTimeLeftRef.current = restTime;
                setRoundTimeLeft(restTime);
                if (!recovering) playBeep('go');
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
                  if (!recovering) playBeep('go');
                }
              }
            } else if (roundTimeLeftRef.current <= 3 && !recovering) {
              playBeep('tick');
            }
            break;

          case 'splits':
            roundTimeLeftRef.current -= deltaSecs;
            setRoundTimeLeft(roundTimeLeftRef.current);
            if (roundTimeLeftRef.current <= 0) {
              splitsRoundDone();
            } else if (roundTimeLeftRef.current <= 3 && !recovering) {
              playBeep('tick');
            }
            break;

          case 'ywyr':
            if (innerPhaseRef.current === 'work') {
              ywyrWorkRef.current += deltaSecs;
              setTimerVal(ywyrWorkRef.current);
            } else {
              timerValRef.current -= deltaSecs;
              setTimerVal(timerValRef.current);
              if (timerValRef.current <= 0) {
                innerPhaseRef.current = 'work';
                setInnerPhase('work');
                ywyrWorkRef.current = 0;
                timerValRef.current = 0;
                if (!recovering) playBeep('go');
              } else if (timerValRef.current <= 3 && !recovering) {
                playBeep('tick');
              }
            }
            break;

          case 'libre': {
            const blk = seqBlocksRef.current[seqIdxRef.current];
            if (!blk) { stopAndSave(); break; }
            // Inter-block pause
            if (seqPausingRef.current) {
              seqPauseLeftRef.current -= deltaSecs;
              setSeqPauseLeft(seqPauseLeftRef.current);
              if (seqPauseLeftRef.current <= 0) advanceSeq();
              break;
            }
            // Run current block
            switch (blk.type) {
              case 'amrap':
                roundTimeLeftRef.current -= deltaSecs; setRoundTimeLeft(roundTimeLeftRef.current);
                if (roundTimeLeftRef.current <= 0) seqBlockDone();
                else if (roundTimeLeftRef.current <= 3 && !recovering) playBeep('tick');
                break;
              case 'for-time':
                timerValRef.current += deltaSecs; setTimerVal(timerValRef.current);
                if (blk.durationMin > 0 && timerValRef.current >= blk.durationMin * 60) seqBlockDone();
                break;
              case 'emom':
                roundTimeLeftRef.current -= deltaSecs; setRoundTimeLeft(roundTimeLeftRef.current);
                if (roundTimeLeftRef.current <= 0) {
                  const nxt = currentRoundRef.current + 1;
                  if (nxt > blk.emomRounds) seqBlockDone();
                  else {
                    const ivSec = blk.emomInterval === 0 ? (blk.emomCustomSec ?? 90) : blk.emomInterval * 60;
                    currentRoundRef.current = nxt; setCurrentRound(nxt);
                    roundTimeLeftRef.current = ivSec; setRoundTimeLeft(ivSec); if (!recovering) playBeep('go');
                  }
                } else if (roundTimeLeftRef.current <= 3 && !recovering) { playBeep('tick'); }
                break;
              case 'tabata':
                roundTimeLeftRef.current -= deltaSecs; setRoundTimeLeft(roundTimeLeftRef.current);
                if (roundTimeLeftRef.current <= 0) {
                  if (innerPhaseRef.current === 'work') { innerPhaseRef.current = 'rest'; setInnerPhase('rest'); roundTimeLeftRef.current = blk.restSec; setRoundTimeLeft(blk.restSec); if (!recovering) playBeep('go'); }
                  else { const nxt = currentRoundRef.current + 1; if (nxt > blk.tabRounds) seqBlockDone(); else { currentRoundRef.current = nxt; setCurrentRound(nxt); innerPhaseRef.current = 'work'; setInnerPhase('work'); roundTimeLeftRef.current = blk.workSec; setRoundTimeLeft(blk.workSec); if (!recovering) playBeep('go'); } }
                } else if (roundTimeLeftRef.current <= 3 && !recovering) { playBeep('tick'); }
                break;
              case 'ywyr':
                if (innerPhaseRef.current === 'work') { ywyrWorkRef.current += deltaSecs; setTimerVal(ywyrWorkRef.current); }
                else { timerValRef.current -= deltaSecs; setTimerVal(timerValRef.current); if (timerValRef.current <= 0) seqBlockDone(); else if (timerValRef.current <= 3 && !recovering) playBeep('tick'); }
                break;
            }
            break;
          }
        }
      }, 1000);
    }

    return () => { clearTimer(); cancelBgBeeps(); };
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
      case 'emom': {
        const ivSec = blk.emomInterval === 0 ? (blk.emomCustomSec ?? 90) : blk.emomInterval * 60;
        roundTimeLeftRef.current = ivSec; setRoundTimeLeft(ivSec); break;
      }
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

  // ─── SPLITS: round ended (auto) → wait for tap or finish ───────────────────
  function splitsRoundDone() {
    playBeep('done');
    Vibration.vibrate([0, 350, 120, 350]);
    if (currentRoundRef.current >= rounds) {
      // Last round done → finalize session
      stopAndSave();
    } else {
      // Pause timer, wait for user tap to start next round
      clearTimer();
      setPhase('splits-waiting');
    }
  }
  // Tap-anywhere handler to launch the next splits round
  function splitsNextRound() {
    if (timerType !== 'splits' || phase !== 'splits-waiting') return;
    const next = currentRoundRef.current + 1;
    if (next > rounds) { stopAndSave(); return; }
    currentRoundRef.current = next;
    setCurrentRound(next);
    roundTimeLeftRef.current = workTime;
    setRoundTimeLeft(workTime);
    if (countdown > 0) {
      setCountdownVal(countdown);
      setPhase('countdown');
    } else {
      setPhase('running');
    }
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
    if (withCamera && recordingActiveRef.current) { nativeStopRec().catch(e => captureError(e, { action: 'stopRecReset' })); recordingActiveRef.current = false; setIsRecordingActive(false); }
    setIsCameraReady(withCamera);
    setCountdownVal(countdown);
    setSavedUri(null); setSaving(false);
    recordingCdRef.current = 0;
    timerValRef.current = 0;
    resetInnerState();
    setPhase('ready');
  }

  function handleClose() {
    clearTimer();
    if (withCamera && recordingActiveRef.current) { nativeStopRec().catch(e => captureError(e, { action: 'stopRecClose' })); recordingActiveRef.current = false; setIsRecordingActive(false); }
    navigation.goBack();
  }

  const isActive = phase === 'countdown' || phase === 'running' || phase === 'splits-waiting';

  const curBlk = timerType === 'libre' ? seqBlocksRef.current[seqIdx] : undefined;
  const seqTotal = seqBlocksRef.current.length;

  const emomLabelFor = (b: SeqBlock) => {
    if (b.emomInterval === 0) {
      const s = b.emomCustomSec ?? 90;
      const m = Math.floor(s / 60); const ss = s % 60;
      return `EMOM ${m > 0 ? m + 'min' : ''}${ss > 0 ? (m > 0 ? ' ' : '') + ss + 's' : ''}`.trim() || 'EMOM PERSO';
    }
    return b.emomInterval === 1 ? 'EMOM' : `E${b.emomInterval}MOM`;
  };
  const blkLabel = curBlk
    ? ({ 'for-time': 'FOR TIME', amrap: 'AMRAP', emom: emomLabelFor(curBlk), tabata: 'TABATA', ywyr: 'YWYR' } as Record<string, string>)[curBlk.type] ?? 'PERSONNALISÉ'
    : 'PERSONNALISÉ';
  const displayLabel = timerType === 'for-time' ? 'FOR TIME'
    : timerType === 'amrap'   ? 'AMRAP'
    : timerType === 'emom'    ? (interval === 1 ? 'EMOM' : `E${interval}MOM`)
    : timerType === 'tabata'  ? 'TABATA'
    : timerType === 'ywyr'    ? 'YWYR'
    : timerType === 'splits'  ? 'SPLITS'
    : seqTotal === 1          ? blkLabel
    : `BLOC ${seqIdx + 1} / ${seqTotal}`;

  const seqBlockLabel = curBlk
    ? ({ 'for-time': 'FOR TIME', amrap: 'AMRAP', emom: emomLabelFor(curBlk), tabata: 'TABATA', ywyr: 'YWYR' } as Record<string, string>)[curBlk.type] ?? ''
    : '';

  const mainTime = (() => {
    if (timerType === 'amrap' || timerType === 'emom' || timerType === 'tabata' || timerType === 'splits') return formatTime(roundTimeLeft);
    if (timerType === 'libre') {
      if (seqPausing) return formatTime(seqPauseLeft);
      if (!curBlk) return '00:00';
      if (curBlk.type === 'amrap' || curBlk.type === 'emom' || curBlk.type === 'tabata' || (curBlk.type === 'ywyr' && innerPhase === 'rest')) return formatTime(roundTimeLeft);
      return formatTime(timerVal);
    }
    return formatTime(timerVal);
  })();
  mainTimeRef.current = mainTime;

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
    if (timerType === 'splits') {
      return workTime > 0 ? Math.max(0, 1 - roundTimeLeft / workTime) : 0;
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
        const iv = curBlk.emomInterval === 0 ? (curBlk.emomCustomSec ?? 90) : curBlk.emomInterval * 60;
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
  // Phase-aware accent color
  const phaseColor = phase === 'countdown' ? PHASE_COLORS.prepare
    : phase === 'running' && seqPausing ? PHASE_COLORS.rest
    : phase === 'running' && innerPhase === 'rest' ? PHASE_COLORS.rest
    : phase === 'running' ? PHASE_COLORS.work
    : phase === 'done' ? PHASE_COLORS.done
    : PHASE_COLORS.ready;
  const currentBg = phase === 'countdown' ? displayOpts.bgCountdown
    : (phase === 'running' || phase === 'stopped') ? displayOpts.bgRunning
    : phase === 'done' ? displayOpts.bgDone : '#0A0A0A';
  // accentColor = toujours la couleur choisie par l'utilisateur (digits)
  // phaseColor = uniquement pour labels, arc stroke, badges, total bar
  const accentColor = ensureContrast(displayOpts.digitColor, currentBg);

  // Phase label text — only show TRAVAIL/REPOS for types with work/rest phases
  const hasWorkRest = timerType === 'tabata' || timerType === 'ywyr'
    || (timerType === 'libre' && curBlk && (curBlk.type === 'tabata' || curBlk.type === 'ywyr'));
  const phaseLabel = phase === 'countdown' ? 'PRÉPARER'
    : phase === 'running' && seqPausing ? 'PAUSE'
    : phase === 'running' && hasWorkRest && innerPhase === 'rest' ? 'REPOS'
    : phase === 'running' && hasWorkRest ? 'TRAVAIL'
    : '';

  // Total WOD time for progress bar
  const totalWodSeconds = (() => {
    if (timerType === 'for-time') return maxTime;
    if (timerType === 'amrap') return totalSeconds;
    if (timerType === 'emom') return interval * 60 * rounds;
    if (timerType === 'tabata') return (workTime + restTime) * rounds;
    if (timerType === 'splits') return workTime * rounds;
    if (timerType === 'libre') {
      return seqBlocksRef.current.reduce((acc, blk) => {
        if (blk.type === 'amrap' || blk.type === 'for-time') return acc + blk.durationMin * 60;
        if (blk.type === 'emom') {
          const ivSec = blk.emomInterval === 0 ? (blk.emomCustomSec ?? 90) : blk.emomInterval * 60;
          return acc + ivSec * blk.emomRounds;
        }
        if (blk.type === 'tabata') return acc + (blk.workSec + blk.restSec) * blk.tabRounds;
        return acc;
      }, 0);
    }
    return 0;
  })();

  const totalElapsed = (() => {
    if (phase === 'ready' || phase === 'countdown') return 0;
    if (timerType === 'for-time') return timerVal;
    if (timerType === 'amrap') return totalSeconds - roundTimeLeft;
    if (timerType === 'emom') return (currentRound - 1) * interval * 60 + (interval * 60 - roundTimeLeft);
    if (timerType === 'tabata') {
      const roundDur = workTime + restTime;
      const inRound = innerPhase === 'work' ? workTime - roundTimeLeft : workTime + (restTime - roundTimeLeft);
      return (currentRound - 1) * roundDur + inRound;
    }
    return timerVal;
  })();

  const totalProgress = totalWodSeconds > 0 ? Math.min(1, Math.max(0, totalElapsed / totalWodSeconds)) : 0;
  const totalRemaining = Math.max(0, totalWodSeconds - totalElapsed);

  // Round info
  const hasRounds = timerType === 'emom' || timerType === 'tabata' || timerType === 'splits'
    || (timerType === 'libre' && curBlk && (curBlk.type === 'emom' || curBlk.type === 'tabata'));
  const curTotalRounds = timerType === 'emom' ? rounds
    : timerType === 'tabata' ? rounds
    : timerType === 'splits' ? rounds
    : curBlk?.type === 'emom' ? curBlk.emomRounds
    : curBlk?.type === 'tabata' ? curBlk.tabRounds
    : 0;
  const roundsLeft = Math.max(0, curTotalRounds - currentRound);

  const showEndWorkBtn = phase === 'running' && innerPhase === 'work' && !seqPausing &&
    (timerType === 'ywyr' || (timerType === 'libre' && curBlk?.type === 'ywyr'));
  const showEndBlockBtn = phase === 'running' && !seqPausing &&
    timerType === 'libre' && curBlk?.type === 'for-time' && innerPhase === 'work' && seqBlocksRef.current.length > 1;
  const showNormalStop = isActive && !showEndWorkBtn && !showEndBlockBtn;

  const qrData = JSON.stringify({
    app: 'AthleX',
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

  const renderTopBar = (extraPadTop = 0) => (
    <View style={[styles.topBar, extraPadTop > 0 && { paddingTop: extraPadTop }]}>
      {hideUI
        ? <View style={{ width: 44 }} />
        : <TouchableOpacity onPress={handleClose} style={styles.iconBtn}>
            <X color="rgba(255,255,255,0.8)" size={24} />
          </TouchableOpacity>
      }
      <View style={[styles.topCenter, isLandscape && { flexDirection: 'row', gap: 10 }]}>
        {/* In camera mode the native overlay already burns `videoTitle` at the top
            of the preview. Skipping the React label avoids a duplicate row. */}
        {/* modeLabel supprimé — géré par le header de chaque layout */}
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
          ? // Camera flip is allowed ONLY before "Démarrer" is pressed (camState === 0).
            // Once recording starts, both camera facing and orientation are locked
            // (orientation lock is handled in the ScreenOrientation effect above).
            camState === 0
              ? <TouchableOpacity
                  onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
                  style={styles.iconBtn} activeOpacity={0.7}
                >
                  <RefreshCw color="rgba(255,255,255,0.8)" size={22} />
                </TouchableOpacity>
              : <View style={{ width: 44 }} />
          : <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.iconBtn} activeOpacity={0.7}>
              <Settings color="rgba(255,255,255,0.8)" size={20} />
            </TouchableOpacity>
      }
    </View>
  );

  const renderContent = () => (
    <View style={[styles.overlay, withCamera && isLandscape && { paddingVertical: 20 }, !withCamera && { paddingVertical: 0 }]}>
      {!(isLandscape && !withCamera && phase !== 'done') && renderTopBar(phase === 'done' ? 72 : 0)}

      {phase === 'done' ? (
        /* ── RÉSULTAT PLEIN ÉCRAN ──────────────────────────────── */
        <View style={{ flex: 1 }}>
          <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={{ flex: 1 }}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, paddingBottom: 28, paddingTop: 4 }}>

              {/* ── TOP : logo + badge ── */}
              <View style={{ alignItems: 'center', gap: 14, paddingTop: 8 }}>
                <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: '#FFFFFF',
                  justifyContent: 'center', alignItems: 'center',
                  shadowColor: '#ffffff', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } }}>
                  <Image
                    source={require('../../../assets/athex-logo.png')}
                    style={{ width: 80, height: 80, resizeMode: 'contain' }}
                  />
                </View>
                <View style={[styles.sessionBadge, {
                  backgroundColor: `${accentColor}22`,
                  borderColor: `${accentColor}55`,
                  paddingHorizontal: 20, paddingVertical: 7,
                }]}>
                  <Text style={[styles.sessionBadgeText, { color: accentColor, fontSize: 13, letterSpacing: 2 }]}>{displayLabel}</Text>
                </View>
              </View>

              {/* ── CENTRE : temps final ── */}
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.35)', letterSpacing: 4, textTransform: 'uppercase' }}>TEMPS FINAL</Text>
                <Text style={[styles.sessionTime, {
                  fontSize: SW * 0.25,
                  color: accentColor,
                  textShadowColor: accentColor,
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 30,
                }]}>{mainTime}</Text>
                {videoTitle ? <Text style={styles.sessionTitle} numberOfLines={2}>{videoTitle}</Text> : null}
                {withCamera && <Text style={styles.sessionDate}>{clockStr}</Text>}
                {withCamera && (
                  <View style={[styles.sessionQRWrap, { marginTop: 12 }]}>
                    <QRCode value={qrData} size={80} color="#111111" backgroundColor="#FFFFFF" />
                    <Text style={styles.sessionQRHint}>Scanner pour les détails</Text>
                  </View>
                )}
                {/* Bouton recommencer centré sous le timer */}
                <TouchableOpacity onPress={handleReset} style={[styles.resetBtn, { marginTop: 16 }]} activeOpacity={0.8}>
                  <RotateCcw color="#fff" size={26} />
                </TouchableOpacity>
              </View>

              {/* ── BAS : actions ── */}
              <View style={{ width: '100%', gap: 12, alignItems: 'center' }}>
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
                      overlaysBurned: sessionMeta.overlaysBurned ?? false,
                    })}
                    style={[styles.playbackBtn, { width: '100%', justifyContent: 'center' }]}
                    activeOpacity={0.85}
                  >
                    <Play color="#fff" size={16} fill="#fff" />
                    <Text style={styles.playbackBtnText}>Lire la vidéo</Text>
                  </TouchableOpacity>
                )}
                {withCamera && (
                  <TouchableOpacity onPress={saveCard} style={[styles.saveCardBtn, { width: '100%' }]} activeOpacity={0.85}>
                    {savingCard
                      ? <ActivityIndicator color="#fff" size="small" />
                      : cardSaved
                        ? <><CheckCircle color="#4ADE80" size={18} /><Text style={[styles.saveCardBtnText, { color: '#4ADE80' }]}>Carte sauvegardée ✓</Text></>
                        : <><Download color="#fff" size={18} /><Text style={styles.saveCardBtnText}>Sauvegarder la carte</Text></>}
                  </TouchableOpacity>
                )}
                {withCamera && (
                  <TouchableOpacity style={[styles.ytBtn, { width: '100%', justifyContent: 'center' }]} activeOpacity={0.85} onPress={() => setShowYT(true)}>
                    <Youtube color="#fff" size={18} />
                    <Text style={styles.ytBtnTxt}>Partager sur YouTube</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={handleClose} style={[styles.closeResultBtn, { width: '100%', alignItems: 'center' }]} activeOpacity={0.8}>
                  <Text style={styles.closeResultText}>Fermer</Text>
                </TouchableOpacity>
              </View>

            </View>
          </ViewShot>
        </View>
      ) : (
        /* ── RUNNING / COUNTDOWN ─────────────────────────── */
        <>
          {/* ── LANDSCAPE LAYOUT ─────────────────────────────────── */}
          {isLandscape ? (
            <View style={{ flex: 1 }}>
              {!withCamera ? (
                /* ── SANS CAMÉRA : plein écran, X/Settings intégrés, bouton décalé ── */
                <View style={[styles.phaseZone, {
                  margin: 0, borderRadius: 0, borderWidth: 0, flex: 1,
                  flexDirection: 'column',
                  justifyContent: 'flex-start', alignItems: 'stretch',
                  paddingVertical: 0, paddingHorizontal: 0,
                  backgroundColor: 'transparent',
                }]}>

                  {/* TOP BAR intégrée dans la carte */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 }}>
                    <TouchableOpacity onPress={handleClose} style={styles.iconBtn}>
                      <X color="rgba(255,255,255,0.8)" size={24} />
                    </TouchableOpacity>
                    <View style={{ alignItems: 'center', gap: 1 }}>
                      <Text style={styles.newHeaderType}>{displayLabel}</Text>
                      {videoTitle ? <Text style={styles.newHeaderTitle} numberOfLines={1}>{videoTitle}</Text> : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={styles.newHeaderTotal}>{formatTime(totalRemaining)}</Text>
                      <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.iconBtn} activeOpacity={0.7}>
                        <Settings color="rgba(255,255,255,0.8)" size={20} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 3 colonnes : [play] [timer] [rounds] */}
                  <View style={{ flex: 1, flexDirection: 'row' }}>

                    {/* LEFT : bouton play/stop décalé vers le centre */}
                    <View style={{ width: 160, justifyContent: 'center', alignItems: 'center', gap: 10, paddingLeft: 84 }}>
                      <View>
                        <TouchableOpacity
                          style={[styles.newBigPlayBtn, { width: 70, height: 70, borderRadius: 35 },
                            isActive && styles.newBigPlayBtnStop]}
                          onPress={phase === 'ready' ? handleStart : isActive ? handleStop : handleStart}
                          activeOpacity={0.8}
                        >
                          {isActive ? (
                            <Square color="#fff" size={26} fill="#fff" />
                          ) : (
                            <Play color="#fff" size={30} fill="#fff" />
                          )}
                        </TouchableOpacity>
                        {phase === 'ready' && countdown > 0 && (
                          <View style={styles.countdownBadge}>
                            <Text style={styles.countdownBadgeText}>{countdown}s</Text>
                          </View>
                        )}
                      </View>
                      {phase === 'ready' && (
                        <Text style={[styles.readyHint, { fontSize: 9, letterSpacing: 1.5, textAlign: 'center' }]}>APPUIE{"\n"}POUR{"\n"}DÉMARRER</Text>
                      )}
                      {showEndWorkBtn && (
                        <TouchableOpacity onPress={ywyrEndWork} style={[styles.ywyrBtn, { paddingHorizontal: 8, paddingVertical: 6 }]} activeOpacity={0.8}>
                          <Text style={[styles.ywyrBtnText, { fontSize: 9, textAlign: 'center' }]}>FIN DU{"\n"}TRAVAIL</Text>
                        </TouchableOpacity>
                      )}
                      {showEndBlockBtn && (
                        <TouchableOpacity onPress={libreEndForTimeBlock} style={[styles.ywyrBtn, { paddingHorizontal: 8, paddingVertical: 6 }]} activeOpacity={0.8}>
                          <Text style={[styles.ywyrBtnText, { fontSize: 9, textAlign: 'center' }]}>FIN DU{"\n"}BLOC</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* CENTER : timer */}
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: phaseColor,
                          shadowColor: phaseColor, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }} />
                        <Text style={[styles.phaseZoneLabel, { fontSize: 11, marginBottom: 0, color: phaseColor }]}>
                          {phase === 'ready' ? 'PRÊT' :
                           phase === 'countdown' ? 'PRÉPARER' :
                           innerPhase === 'work' ? 'EXERCICE' :
                           innerPhase === 'rest' ? 'REPOS' : phaseLabel || 'PRÊT'}
                        </Text>
                      </View>
                      {timerType === 'libre' && seqBlockLabel
                        ? <Text style={[styles.seqSubLabel, { fontSize: 9, marginBottom: 2 }]}>{seqPausing ? 'REPOS' : seqBlockLabel}</Text>
                        : null}
                      {displayOpts.clockStyle === 'arc' && (
                        <ArcTimer
                          time={phase === 'countdown' ? String(countdownVal) : mainTime}
                          progress={arcProgress}
                          color={phase === 'countdown' ? '#10b981' : accentColor}
                          fontSize={phase === 'countdown' ? Math.round(winH * 0.25) : displayOpts.fontSize}
                          strokeColor={phaseColor}
                          customSize={winH - 110}
                          landscape
                        />
                      )}
                      {displayOpts.clockStyle === 'bar' && (
                        <BarTimer time={phase === 'countdown' ? String(countdownVal) : mainTime}
                          progress={arcProgress} color={phase === 'countdown' ? '#10b981' : accentColor}
                          fontSize={displayOpts.fontSize} strokeColor={phaseColor} landscape />
                      )}
                      {displayOpts.clockStyle === 'digits' && (
                        <DigitsTimer time={phase === 'countdown' ? String(countdownVal) : mainTime}
                          color={phase === 'countdown' ? '#10b981' : accentColor}
                          fontSize={displayOpts.fontSize} landscape />
                      )}
                      {hasRounds && (timerType === 'tabata' || (timerType === 'libre' && curBlk?.type === 'tabata'))
                        && (curBlk?.restSec ?? restTime) > 0 && phase === 'running' && (
                        <View style={[styles.phaseZoneRoundInfo, { marginTop: 6 }]}>
                          <Text style={[styles.phaseZoneRoundText, { fontSize: 11 }]}>
                            {innerPhase === 'work'
                              ? `REPOS DANS : ${formatTime(roundTimeLeft)}`
                              : `EXERCICE DANS : ${formatTime(roundTimeLeft)}`}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* RIGHT : infos rounds */}
                    <View style={{ width: 100, justifyContent: 'center', alignItems: 'center', gap: 8, paddingRight: 12 }}>
                      {hasRounds && (
                        <>
                          <View style={{ width: '100%', alignItems: 'center', backgroundColor: 'rgba(56,189,248,0.15)', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(56,189,248,0.25)' }}>
                            <Text style={[styles.newRoundNum, { color: '#38BDF8', fontSize: 30 }]}>{currentRound}</Text>
                            <Text style={[styles.newRoundLabel, { textAlign: 'center' }]}>ROUND{"\n"}EN COURS</Text>
                          </View>
                          <View style={{ width: '100%', alignItems: 'center', backgroundColor: 'rgba(250,204,21,0.15)', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(250,204,21,0.25)' }}>
                            <Text style={[styles.newRoundNum, { color: '#FACC15', fontSize: 30 }]}>{roundsLeft}</Text>
                            <Text style={[styles.newRoundLabel, { textAlign: 'center' }]}>CYCLES{"\n"}RESTANTS</Text>
                          </View>
                        </>
                      )}
                    </View>
                  </View>

                  {/* Barre de progression en bas de la carte */}
                  {totalWodSeconds > 0 && (
                    <View style={styles.newTotalBar}>
                      <View style={[styles.newTotalFill, { width: `${Math.round(totalProgress * 100)}%` as `${number}%`, backgroundColor: phaseColor }]} />
                    </View>
                  )}
                </View>
              ) : (
                /* ── AVEC CAMÉRA : layout centré classique ── */
                <>
                  {phase === 'countdown' && countdownVal > 0 && (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
                      <Text style={[styles.phaseLabelGiant, { fontSize: 22, marginBottom: 4, color: '#FFFFFF' }]}>PRÉPARER</Text>
                      <Text style={[styles.countdownBig, { color: accentColor, textShadowColor: accentColor, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18 }]}>{countdownVal}</Text>
                    </View>
                  )}
                  {phase !== 'countdown' && camState >= 1 && (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      {!!phaseLabel && phase === 'running' && (
                        <Text style={[styles.phaseLabelGiant, { fontSize: 18, marginBottom: 2, color: ensureContrast(phaseColor, currentBg), textShadowColor: phaseColor, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16 }]}>{phaseLabel}</Text>
                      )}
                      {displayOpts.clockStyle === 'arc' && <ArcTimer time={mainTime} progress={arcProgress} color={accentColor} fontSize={displayOpts.fontSize} strokeColor={phaseColor} landscape />}
                      {displayOpts.clockStyle === 'bar' && <BarTimer time={mainTime} progress={arcProgress} color={accentColor} fontSize={displayOpts.fontSize} strokeColor={phaseColor} landscape />}
                      {displayOpts.clockStyle === 'digits' && <DigitsTimer time={mainTime} color={accentColor} fontSize={displayOpts.fontSize} landscape />}
                      {hasRounds && phase === 'running' && !seqPausing && (
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4, letterSpacing: 2 }}>ROUND {currentRound} / {currentRound + roundsLeft}</Text>
                      )}
                    </View>
                  )}
                  <View style={{ position: 'absolute', bottom: 12, left: 0, right: 0, alignItems: 'center' }} pointerEvents="box-none">
                    <TouchableOpacity onPress={camPrimaryAction} disabled={camState === 0 && !isCameraReady}
                      style={[styles.camPrimaryBtn, { paddingHorizontal: 28, paddingVertical: 12, minWidth: 200 },
                        camState === 0 && !isCameraReady && { opacity: 0.4 },
                        camState === 1 && styles.camPrimaryBtnGo,
                        (camState === 2 || camState === 3) && styles.camPrimaryBtnStop,
                      ]} activeOpacity={0.85}>
                      <Text style={[styles.camPrimaryBtnText, { fontSize: 15 }]}>
                        {camState === 0 && !isCameraReady ? 'Initialisation…' : camPrimaryLabel}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          ) : (
          /* ── PORTRAIT LAYOUT ──────────────────────────────────── */
          <View style={{ flex: 1 }}>
            {/* Header avec type et total */}
            <View style={styles.newHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.newHeaderType}>{displayLabel}</Text>
                {videoTitle ? <Text style={styles.newHeaderTitle} numberOfLines={1}>{videoTitle}</Text> : null}
              </View>
              <Text style={styles.newHeaderTotal}>{formatTime(totalRemaining)}</Text>
            </View>

            {/* Zone principale colorée selon la phase */}
            <View style={[styles.phaseZone, {
              backgroundColor: currentBg,
              borderColor: `${accentColor}30`,
            }]}>
              {/* Label de phase */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: phaseColor,
                  shadowColor: phaseColor, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }} />
                <Text style={[styles.phaseZoneLabel, { color: phaseColor, marginBottom: 0 }]}>
                  {phase === 'ready' ? 'PRÊT' :
                   phase === 'countdown' ? 'PRÉPARER' :
                   innerPhase === 'work' ? 'EXERCICE' :
                   innerPhase === 'rest' ? 'REPOS' : phaseLabel || 'PRÊT'}
                </Text>
              </View>

              {/* Chrono principal — cercle de progression */}
              <ArcTimer
                time={phase === 'countdown' ? String(countdownVal) : mainTime}
                progress={arcProgress}
                color={phase === 'countdown' ? '#10b981' : accentColor}
                fontSize={phase === 'countdown' ? Math.round(SW * 0.28) : displayOpts.fontSize}
                strokeColor={phaseColor}
                customSize={Math.min(SW - 56, 300)}
              />

              {/* Info repos/exercice — uniquement pour Tabata qui a des phases travail/repos */}
              {hasRounds && (timerType === 'tabata' || (timerType === 'libre' && curBlk?.type === 'tabata'))
                && (curBlk?.restSec ?? restTime) > 0 && phase === 'running' && (
                <View style={styles.phaseZoneRoundInfo}>
                  <Text style={styles.phaseZoneRoundText}>
                    {innerPhase === 'work'
                      ? `REPOS DANS : ${formatTime(roundTimeLeft)}`
                      : `EXERCICE DANS : ${formatTime(roundTimeLeft)}`}
                  </Text>
                </View>
              )}
            </View>

            {/* Zone noire avec les stats */}
            <View style={styles.statsZone}>
              {/* Round badges */}
              {hasRounds && (
                <View style={styles.newRoundRow}>
                  <View style={[styles.newRoundBox, { backgroundColor: 'rgba(56,189,248,0.1)', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)' }]}>
                    <Text style={[styles.newRoundNum, { color: '#38BDF8' }]}>{currentRound}</Text>
                    <Text style={styles.newRoundLabel}>ROUND{"\n"}EN COURS</Text>
                  </View>

                  <TouchableOpacity 
                    style={[styles.newPlayBtn, isActive && styles.newPlayBtnStop]}
                    onPress={isActive ? handleStop : handleStart}
                    activeOpacity={0.8}
                  >
                    {isActive ? (
                      <Square color="#fff" size={28} fill="#fff" />
                    ) : (
                      <Play color="#fff" size={32} fill="#fff" />
                    )}
                  </TouchableOpacity>

                  <View style={[styles.newRoundBox, { backgroundColor: 'rgba(250,204,21,0.1)', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(250,204,21,0.2)' }]}>
                    <Text style={[styles.newRoundNum, { color: '#FACC15' }]}>{roundsLeft}</Text>
                    <Text style={styles.newRoundLabel}>CYCLES{"\n"}RESTANTS</Text>
                  </View>
                </View>
              )}

              {!hasRounds && (
                <View style={styles.simpleControls}>
                  <TouchableOpacity 
                    style={[styles.newBigPlayBtn, isActive && styles.newBigPlayBtnStop]}
                    onPress={isActive ? handleStop : handleStart}
                    activeOpacity={0.8}
                  >
                    {isActive ? (
                      <Square color="#fff" size={32} fill="#fff" />
                    ) : (
                      <Play color="#fff" size={36} fill="#fff" />
                    )}
                  </TouchableOpacity>
                  {phase === 'ready' && (
                    <Text style={styles.readyHint}>APPUIE POUR DÉMARRER</Text>
                  )}
                  {showEndWorkBtn && (
                    <TouchableOpacity onPress={ywyrEndWork} style={[styles.ywyrBtn, { marginTop: 4 }]} activeOpacity={0.8}>
                      <Text style={styles.ywyrBtnText}>FIN DU TRAVAIL</Text>
                    </TouchableOpacity>
                  )}
                  {showEndBlockBtn && (
                    <TouchableOpacity onPress={libreEndForTimeBlock} style={[styles.ywyrBtn, { marginTop: 4 }]} activeOpacity={0.8}>
                      <Text style={styles.ywyrBtnText}>FIN DU BLOC</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {/* Total bar */}
            {totalWodSeconds > 0 && (
              <View style={styles.newTotalBar}>
                <View style={[styles.newTotalFill, { width: `${Math.round(totalProgress * 100)}%`, backgroundColor: phaseColor }]} />
              </View>
            )}

          {/* INFOBAR — titre/timestamp, uniquement en mode caméra */}
          {withCamera && (videoTitle || withTimestamp) && phase === 'running' && camState >= 2 && (
            <View style={styles.infoBar}>
              {videoTitle ? <Text style={styles.infoTitle} numberOfLines={1}>{videoTitle}</Text> : null}
              {withTimestamp ? <Text style={styles.infoTimestamp}>{clockStr}</Text> : null}
            </View>
          )}
          </View>
          )}
        </>
      )}

      {/* SPLITS — tap-anywhere overlay between rounds */}
      {timerType === 'splits' && phase === 'splits-waiting' && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={splitsNextRound}
          style={styles.splitsTapOverlay}
        >
          <View style={styles.splitsTapBadge}>
            <Text style={styles.splitsTapRound}>
              ROUND {Math.min(currentRound + 1, rounds)} / {rounds}
            </Text>
            <Text style={styles.splitsTapLabel}>TAP POUR LANCER</Text>
            <Text style={styles.splitsTapHint}>Récup libre · Touche n'importe où</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );

  if (withCamera) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        {camPermission?.granted
          ? <RealtimeRecorderView
              ref={cameraRef}
              style={StyleSheet.absoluteFill as any}
              facing={facing}
              isLandscape={isLandscape}
              onReady={() => setIsCameraReady(true)}
            />
          : <View style={[StyleSheet.absoluteFill, styles.noCamera]}><Text style={styles.noCameraText}>Caméra non disponible</Text></View>
        }
        <View style={[StyleSheet.absoluteFill, styles.cameraDim]} />
        {renderContent()}
        {/* Overlay décompte — top-level pour éviter z-index/elevation Android */}
        {phase === 'countdown' && countdownVal > 0 && (
          <View style={[StyleSheet.absoluteFill, styles.camCdOverlay]} pointerEvents="none">
            <Text style={[styles.phaseLabelGiant, { color: '#FFFFFF', marginBottom: 16 }]}>PRÉPARER</Text>
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
        <KeyboardAvoidingView
          style={styles.ytModal}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
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
                const prompt = `Analyse cette vidéo CrossFit AthleX :\n\n🔗 Lien : ${ytLink.trim()}\n⏱ Temps : ${mainTime}\n🏋️ Type : ${displayLabel}\n\nAnalyse les points suivants :\n1. Technique des mouvements (qualité, erreurs)\n2. Gestion de l'effort et du rythme\n3. Points forts observés\n4. Axes d'amélioration prioritaires\n5. Conseils pour progresser`;
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
        </KeyboardAvoidingView>
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
  noCameraText: { color: 'rgba(255,255,255,0.4)', ...typography.body },
  overlay: { flex: 1, justifyContent: 'space-between', paddingVertical: spacing.xxxl },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  iconBtnDisabled: { opacity: 0.4 },
  topCenter: { alignItems: 'center', gap: spacing.xxs },
  modeLabel: { ...typography.label, color: '#FFFFFF', letterSpacing: 1.5 },
  recIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xxs,
    backgroundColor: 'rgba(220,38,38,0.85)', borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs,
  },
  recDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  recText: { ...typography.overline, color: '#fff', fontSize: 10 },
  totalLabel: { ...typography.bodySmall, color: 'rgba(255,255,255,0.5)', minWidth: 44, textAlign: 'right' },
  timerCenter: { alignItems: 'center', justifyContent: 'center', flex: 1, gap: spacing.sm },
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
  doneLabel: { ...typography.h4, color: 'rgba(255,255,255,0.45)', letterSpacing: 4 },
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
  // ── Phase label giant
  phaseLabelGiant: {
    fontSize: 28, fontWeight: '900', letterSpacing: 6, textTransform: 'uppercase',
  },
  // ── Total progress bar
  totalBarWrap: {
    width: '80%', alignItems: 'center', gap: 6, marginTop: 8,
  },
  totalBarTrack: {
    width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3, overflow: 'hidden',
  },
  totalBarFill: {
    height: '100%', borderRadius: 3,
  },
  totalBarLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 2,
  },
  // ── Round badges
  roundBadgesRow: {
    flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 12,
  },
  roundBadge: {
    alignItems: 'center', gap: 2,
  },
  roundBadgeNum: {
    fontSize: 36, fontWeight: '200', letterSpacing: -1,
  },
  roundBadgeSub: {
    fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 2,
  },
  roundBadgeDivider: {
    width: 1, height: 40, borderRadius: 1,
  },
  splitsTapOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 50,
  },
  splitsTapBadge: {
    paddingHorizontal: 36, paddingVertical: 28,
    backgroundColor: 'rgba(20,20,20,0.92)',
    borderRadius: 24,
    borderWidth: 2, borderColor: 'rgba(74,222,128,0.55)',
    alignItems: 'center', gap: 10,
    shadowColor: '#4ADE80', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
  },
  splitsTapRound: {
    fontSize: 14, fontWeight: '900', color: 'rgba(255,255,255,0.6)', letterSpacing: 4,
  },
  splitsTapLabel: {
    fontSize: 28, fontWeight: '900', color: '#4ADE80', letterSpacing: 2,
    textShadowColor: '#4ADE80', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12,
  },
  splitsTapHint: {
    fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.45)', letterSpacing: 1,
  },

  // NEW DESIGN - Phase-based color layout (AthleX style)
  newHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  newHeaderType: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: 1.5,
  },
  newHeaderTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  phaseZone: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    margin: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  phaseZoneLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  phaseZoneTimer: {
    fontSize: SW * 0.28,
    fontWeight: '200',
    color: '#FFFFFF',
    letterSpacing: -2,
    textShadowColor: 'rgba(255,255,255,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  phaseZoneRoundInfo: {
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  phaseZoneRoundText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10b981',
    letterSpacing: 1,
  },
  statsZone: {
    backgroundColor: 'transparent',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  newRoundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  newRoundBox: {
    alignItems: 'center',
    flex: 1,
  },
  newRoundNum: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 6,
    color: '#FFFFFF',
  },
  newRoundLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 14,
  },
  newPlayBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(74,222,128,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    borderWidth: 2,
    borderColor: 'rgba(74,222,128,0.6)',
    shadowColor: '#4ADE80',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  newPlayBtnStop: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.6)',
    shadowColor: '#EF4444',
  },
  simpleControls: {
    alignItems: 'center',
    gap: 14,
  },
  newBigPlayBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(74,222,128,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(74,222,128,0.6)',
    shadowColor: '#4ADE80',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  newBigPlayBtnStop: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.6)',
    shadowColor: '#EF4444',
  },
  newPlayBtnText: {
    display: 'none',
  },
  readyHint: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  newHeaderTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
  },
  newTotalBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 2,
    overflow: 'hidden',
  },
  newTotalFill: {
    height: '100%',
    borderRadius: 2,
  },
});
