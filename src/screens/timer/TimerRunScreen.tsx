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
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Square, Play, X, RotateCcw, CheckCircle, RefreshCw, Download, Settings, Youtube, Copy, ExternalLink, RotateCw } from 'lucide-react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList, SeqBlock } from '../../navigation';
import { blockDurationSec } from '../../utils/wodToTimer';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ensureContrast, inkOn, TIMER_THEMES } from '../../theme/timerInk';
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

type WavSeg = { hz?: number; ms: number; silent?: boolean; fadeInMs?: number; fadeOutMs?: number; amp?: number };

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
        let amp = seg.amp ?? 0.85;
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
  allowRotation: boolean; themeId: string; beepVolume: number;
}
const DISPLAY_OPTS_KEY = 'bwod_timer_display_opts_v2';
const DEFAULT_DISPLAY: TimerDisplayOpts = {
  clockStyle: 'bar', fontSize: Math.round(SW * 0.22), digitColor: '#39FF14',
  bgCountdown: '#000000', bgRunning: '#000000', bgDone: '#111111',
  bipsEnabled: true, allowRotation: false, themeId: 'noir', beepVolume: 1,
};

// Phase-specific accent colors for visual feedback
const PHASE_COLORS = {
  prepare: '#38BDF8',  // cyan-blue
  work:    '#4ADE80',  // green
  rest:    '#F87171',  // coral-red
  done:    '#FACC15',  // gold
  ready:   '#FFFFFF',  // white
};

// Curated palette — near-duplicate shades removed (only one per color family kept):
// #FFD700≈#FFFF00 · #FF4500≈#FF6600 · #FF1493≈#FF0090 · #00E5FF≈#00FFFF · #10ff9f≈#00FF80
const DIGIT_COLORS = [
  '#FFFF00', '#39FF14', '#FF0000', '#00FFFF',
  '#CC00FF', '#FF6600', '#00BFFF', '#FF0090',
  '#FFFFFF', '#000000', '#7B2FFF', '#00FF80',
];

// ─── ARC clock (SVG) ─────────────────────────────────────────────────────────
function ArcTimer({ time, progress, color, fontSize, strokeColor, landscape, customSize, flat }: { time: string; progress: number; color: string; fontSize?: number; strokeColor?: string; landscape?: boolean; customSize?: number; flat?: boolean }) {
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
        textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: flat ? 0 : 22, fontVariant: ['tabular-nums'] }}>
        {time}
      </Text>
    </View>
  );
}

// ─── BAR clock ──────────────────────────────────────────────────────────────
function BarTimer({ time, progress, color, fontSize, strokeColor, landscape, flat }: { time: string; progress: number; color: string; fontSize: number; strokeColor?: string; landscape?: boolean; flat?: boolean }) {
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
        textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: flat ? 0 : 18, fontVariant: ['tabular-nums'] }}>
        {time}
      </Text>
    </View>
  );
}

// ─── DIGITS clock ───────────────────────────────────────────────────────────
function DigitsTimer({ time, color, fontSize, landscape, flat }: { time: string; color: string; fontSize: number; landscape?: boolean; flat?: boolean }) {
  const { height: dh } = useWindowDimensions();
  const fs = landscape ? Math.max(fontSize, Math.round(dh * 0.4)) : fontSize;
  return (
    <Text style={{ fontSize: fs, fontWeight: '200', color, letterSpacing: -2,
      textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: flat ? 0 : 22, fontVariant: ['tabular-nums'] }}>
      {time}
    </Text>
  );
}

// ─── Progress Ring (% indicator, independent of the timer digits) ────────────
function ProgressRing({ progress, color, size }: { progress: number; color: string; size: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - Math.max(0, Math.min(1, progress)));
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} />
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} strokeDashoffset={dash} />
      </Svg>
      <Text style={{ color, fontSize: size * 0.22, fontWeight: '900', letterSpacing: -0.5 }}>{pct}%</Text>
    </View>
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
  // Couleur d'accent pour l'UI du panneau (boutons, slider, FERMER) : garantit un
  // contraste lisible sur le fond sombre du modal même quand la couleur choisie est
  // noire (#000000) ou très sombre.
  const uiColor = ensureContrast(opts.digitColor, '#0a0a0a');
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' }} activeOpacity={1} onPress={onClose} />
      <View style={{ backgroundColor: '#0a0a0a', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8, maxHeight: '90%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 20 }} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 44 }} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 }}>🎨 Design du minuteur</Text>
            {(() => { const hc = ensureContrast(activeTheme.accent, '#0a0a0a'); return (
            <View style={{ backgroundColor: `${hc}20`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: `${hc}50` }}>
              <Text style={{ color: hc, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>{activeTheme.emoji} {activeTheme.label.toUpperCase()}</Text>
            </View>
            ); })()}
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
                    borderWidth: isActive ? 3 : (c === '#000000' ? 2 : 1.5),
                    borderColor: isActive ? '#fff' : (c === '#000000' ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.1)'),
                    shadowColor: c === '#000000' ? '#fff' : c, shadowOpacity: isActive ? 0.9 : (c === '#000000' ? 0.25 : 0.3),
                    shadowRadius: isActive ? 12 : 4, shadowOffset: { width: 0, height: 0 },
                    justifyContent: 'center', alignItems: 'center' }}>
                  {isActive && <Text style={{ color: c === '#000000' ? '#fff' : '#0a0a0a', fontSize: 14, fontWeight: '900' }}>✓</Text>}
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
                    backgroundColor: active ? `${uiColor}20` : 'rgba(255,255,255,0.04)',
                    borderWidth: 1.5, borderColor: active ? uiColor : 'rgba(255,255,255,0.08)' }}>
                  <Text style={{ color: active ? uiColor : 'rgba(255,255,255,0.35)', fontSize: 20 }}>{s.icon}</Text>
                  <Text style={{ color: active ? uiColor : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>{s.label.toUpperCase()}</Text>
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
                height: '100%', backgroundColor: uiColor, borderRadius: 3 }} />
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

          {/* ── VOLUME DES BIPS */}
          {opts.bipsEnabled && (
            <>
              <SLabel label={`Volume des bips · ${Math.round(opts.beepVolume * 100)}%`} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 }}>
                <TouchableOpacity onPress={() => onUpdate({ beepVolume: Math.max(0, Math.round((opts.beepVolume - 0.1) * 10) / 10) })} activeOpacity={0.8}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)',
                    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
                  <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>−</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round(opts.beepVolume * 100)}%` as `${number}%`,
                    height: '100%', backgroundColor: uiColor, borderRadius: 3 }} />
                </View>
                <TouchableOpacity onPress={() => onUpdate({ beepVolume: Math.min(1, Math.round((opts.beepVolume + 0.1) * 10) / 10) })} activeOpacity={0.8}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)',
                    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
                  <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>+</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── RÉINITIALISER + FERMER */}
          <View style={{ gap: 10 }}>
            <TouchableOpacity onPress={() => onUpdate({ ...DEFAULT_DISPLAY })} activeOpacity={0.8}
              style={{ paddingVertical: 13, borderRadius: 14, alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '700', letterSpacing: 1.5 }}>RÉINITIALISER</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} activeOpacity={0.85}
              style={{ paddingVertical: 16, borderRadius: 14, alignItems: 'center', backgroundColor: uiColor }}>
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
  const { timerType, countdown, totalSeconds, maxTime, interval, rounds, workTime, restTime, withCamera, sequence, videoTitle, withTimestamp, competitionLogoUrl, nextExercise } = route.params;

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
          content: { sound: 'default', data: { timerBeep: true } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(sec), repeats: false, channelId: 'default' },
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
              const dur = Math.max(0, blockDurationSec(blk));
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
        if (withCamera) {
          // Avec caméra : on enregistre le micro TOUT en laissant la musique de
          // l'utilisateur (Spotify, etc.) continuer. iOS mixe (la catégorie native
          // .playAndRecord ajoute .mixWithOthers) ; Android ducke brièvement sur nos bips.
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
            interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        } else {
          // Sans caméra : MIXER avec la musique de l'utilisateur (Spotify, etc.) au
          // lieu de la couper. allowsRecordingIOS:false sinon iOS force la catégorie
          // d'enregistrement qui interrompt la musique. Android ducke brièvement.
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
            interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        }
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
      // Une seule instance tick (les tics sont espacés d'≥1 s).
      const { sound: tickSnd } = await Audio.Sound.createAsync({ uri: cDir + 'bwod_tick.wav' });
      sndTickRef.current.push(tickSnd);
      const { sound: goSnd } = await Audio.Sound.createAsync({ uri: cDir + 'bwod_go.wav' });
      sndGoRef.current = goSnd;
      const { sound: doneSnd } = await Audio.Sound.createAsync({ uri: cDir + 'bwod_done.wav' });
      sndDoneRef.current = doneSnd;

      const v0 = displayOptsRef.current.beepVolume ?? 1;
      tickSnd.setVolumeAsync(v0).catch(() => {});
      goSnd.setVolumeAsync(v0).catch(() => {});
      doneSnd.setVolumeAsync(v0).catch(() => {});

      soundReadyRef.current = true;
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
      if (v) try {
        const stored = JSON.parse(v);
        const theme = TIMER_THEMES.find(t => t.id === stored.themeId);
        const isCustomDigit = theme ? stored.digitColor !== theme.digitColor : false;
        const migrated = theme
          ? { ...DEFAULT_DISPLAY, ...stored,
              digitColor: isCustomDigit ? stored.digitColor : theme.digitColor,
              bgCountdown: theme.bgCountdown, bgRunning: theme.bgRunning, bgDone: theme.bgDone }
          : { ...DEFAULT_DISPLAY, ...stored };
        setDisplayOptsRaw(migrated);
      } catch (e) { captureError(e, { screen: 'TimerRun', action: 'parseDisplayOpts' }); }
    });
  }, []);

  // Applique le volume des bips quand le réglage change.
  useEffect(() => {
    if (!soundReadyRef.current) return;
    const v = displayOpts.beepVolume ?? 1;
    sndTickRef.current.forEach(s => s.setVolumeAsync(v).catch(() => {}));
    sndGoRef.current?.setVolumeAsync(v).catch(() => {});
    sndDoneRef.current?.setVolumeAsync(v).catch(() => {});
  }, [displayOpts.beepVolume]);

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
        // On utilise une instance UNIQUE (la 0) : sur Android certaines instances
        // du pool restaient muettes nativement (replayAsync résout mais aucun son).
        // Les tics du décompte/round sont espacés d'≥1 s donc une seule suffit.
        sndTickRef.current[0]?.replayAsync().catch(e => captureError(e, { action: 'beepTick' }));
      } else if (type === 'go') {
        hapticMedium();
        sndGoRef.current?.replayAsync().catch(e => captureError(e, { action: 'beepGo' }));
      } else {
        hapticHeavy();
        sndDoneRef.current?.replayAsync().catch(e => captureError(e, { action: 'beepDone' }));
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
      Alert.alert(
        "Démarrage de l'enregistrement échoué",
        `La caméra n'a pas pu démarrer l'enregistrement.\n\nErreur : ${err?.message ?? String(err)}\n\nVérifie que l'app a accès à la Caméra et au Micro dans les Réglages iOS.`,
        [{ text: 'OK' }]
      );
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
      Alert.alert(
        'Enregistrement échoué',
        "La vidéo n'a pas pu être sauvegardée. Vérifie que l'app a accès à la caméra, au micro et à la galerie dans les Réglages iOS.",
        [{ text: 'OK' }]
      );
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
      // Android : bips dès 5 (5, 4, 3, 2, 1 + go à 0). iOS : 3, 2, 1 + go à 0.
      const tickFrom = Platform.OS === 'android' ? 5 : 3;
      if (count <= tickFrom) playBeep('tick');
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
          if (count <= tickFrom) playBeep('tick');
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
              else if (seqPauseLeftRef.current <= 3 && !recovering) playBeep('tick');
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
                const capSec = blockDurationSec(blk);
                if (capSec > 0 && timerValRef.current >= capSec) seqBlockDone();
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
      case 'amrap': { const durSec = blockDurationSec(blk); roundTimeLeftRef.current = durSec; setRoundTimeLeft(durSec); break; }
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
    playBeep('go');
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
  // ─── YWYR (autonome): bouton principal = bascule travail/repos ────────────
  function ywyrMainPress() {
    if (innerPhaseRef.current === 'work') {
      // Fin du travail → démarre le décompte du repos (durée = temps travaillé)
      ywyrEndWork();
    } else {
      // Coupe le repos en cours → repart sur un chrono montant
      innerPhaseRef.current = 'work'; setInnerPhase('work');
      ywyrWorkRef.current = 0; timerValRef.current = 0; setTimerVal(0);
      playBeep('go');
    }
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
      if (phase === 'ready') {
        if (curBlk.type === 'amrap') return formatTime(blockDurationSec(curBlk));
        if (curBlk.type === 'tabata') return formatTime(curBlk.workSec);
        if (curBlk.type === 'emom') {
          const iv = curBlk.emomInterval === 0 ? (curBlk.emomCustomSec ?? 90) : curBlk.emomInterval * 60;
          return formatTime(iv);
        }
      }
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
        const total = blockDurationSec(curBlk);
        return total > 0 ? Math.max(0, 1 - roundTimeLeft / total) : 0;
      }
      if (curBlk.type === 'for-time') {
        const cap = blockDurationSec(curBlk);
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
    : phase === 'done' ? displayOpts.bgDone : displayOpts.bgRunning;
  // accentColor = toujours la couleur choisie par l'utilisateur (digits)
  // phaseColor = uniquement pour labels, arc stroke, badges, total bar
  const accentColor = displayOpts.digitColor;
  const onBg1 = inkOn(currentBg);
  // Les surfaces translucides suivent la même encre que le texte : sans ça, un
  // fond vif de mi-échelle recevait un film blanc et un texte noir.
  const isLightBg = onBg1 === '#000000';
  const onBg2 = isLightBg ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.45)';
  const iconColor = isLightBg ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.8)';
  const pillBg = isLightBg ? 'rgba(0,0,0,0.45)' : accentColor;
  const pillFg = isLightBg ? '#FFFFFF' : '#000000';
  const rDoneBg = isLightBg ? 'rgba(0,0,0,0.75)' : accentColor;
  const rDoneFg = isLightBg ? '#FFFFFF' : '#000000';
  const rCurBg  = isLightBg ? '#000000' : '#FFFFFF';
  const rCurFg  = isLightBg ? '#FFFFFF' : '#000000';
  const rIdleBg = isLightBg ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
  const rIdleFg = isLightBg ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.35)';
  const rBorder = isLightBg ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.15)';
  const barTrack = isLightBg ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
  // Le fond du minuteur est une couleur choisie par l'athlète : elle peut être
  // blanche, jaune ou fluo. Les commandes (icônes, glyphe play/stop, boutons
  // contextuels) sont donc encrées d'après la luminance du fond, pas en blanc.
  const ctrlInk = withCamera ? '#FFFFFF' : onBg1;
  const ctrlBtnBg = isLightBg && !withCamera ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.15)';

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
        if (blk.type === 'amrap' || blk.type === 'for-time') return acc + blockDurationSec(blk);
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
    if (timerType === 'splits') {
      return (currentRound - 1) * workTime + Math.max(0, workTime - roundTimeLeft);
    }
    if (timerType === 'libre') {
      const blocks = seqBlocksRef.current;
      let elapsed = 0;
      for (let i = 0; i < seqIdx; i++) {
        const blk = blocks[i];
        if (!blk) continue;
        if (blk.type === 'amrap' || blk.type === 'for-time') elapsed += blockDurationSec(blk);
        else if (blk.type === 'emom') {
          const iv = blk.emomInterval === 0 ? (blk.emomCustomSec ?? 90) : blk.emomInterval * 60;
          elapsed += iv * blk.emomRounds;
        } else if (blk.type === 'tabata') elapsed += (blk.workSec + blk.restSec) * blk.tabRounds;
      }
      if (!curBlk) return elapsed + timerVal;
      if (curBlk.type === 'amrap') {
        elapsed += Math.max(0, blockDurationSec(curBlk) - roundTimeLeft);
      } else if (curBlk.type === 'for-time' || curBlk.type === 'ywyr') {
        elapsed += timerVal;
      } else if (curBlk.type === 'emom') {
        const iv = curBlk.emomInterval === 0 ? (curBlk.emomCustomSec ?? 90) : curBlk.emomInterval * 60;
        elapsed += Math.max(0, (currentRound - 1) * iv + (iv - roundTimeLeft));
      } else if (curBlk.type === 'tabata') {
        const roundDur = curBlk.workSec + curBlk.restSec;
        const inRound = innerPhase === 'work'
          ? Math.max(0, curBlk.workSec - roundTimeLeft)
          : curBlk.workSec + Math.max(0, curBlk.restSec - roundTimeLeft);
        elapsed += (currentRound - 1) * roundDur + inRound;
      }
      return elapsed;
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

  // YWYR autonome : sans caméra le bouton principal pilote la bascule travail/repos ;
  // avec caméra le bouton principal sert à l'enregistrement → on garde "FIN DU TRAVAIL"
  const isYwyrSolo = timerType === 'ywyr';
  const showEndWorkBtn = phase === 'running' && innerPhase === 'work' && !seqPausing &&
    ((timerType === 'libre' && curBlk?.type === 'ywyr') || (isYwyrSolo && withCamera));
  const showYwyrEndBtn = isYwyrSolo && !withCamera && phase === 'running';
  // Le gros bouton n'est "stop" (rouge) que s'il arrête vraiment ; en YWYR solo il bascule travail/repos
  const mainBtnStop = isActive && !(isYwyrSolo && phase === 'running');
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

  const renderRoundBubbles = (forLandscape = false) => {
    if (!hasRounds || curTotalRounds <= 0) return null;
    const winSize = Math.min(curTotalRounds, 10);
    const winStart = Math.max(1, Math.min(currentRound - 4, curTotalRounds - winSize + 1));
    const winEnd = winStart + winSize - 1;
    const count = winEnd - winStart + 1 + (winStart > 1 ? 1 : 0) + (winEnd < curTotalRounds ? 1 : 0);
    const gapVal = forLandscape ? 8 : 6;
    const maxW = (forLandscape ? winH : SW) - 32;
    const maxBSize = forLandscape ? 38 : 34;
    const bSize = Math.min(maxBSize, Math.floor((maxW - gapVal * (count - 1)) / count));
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: gapVal, paddingHorizontal: 16,
        paddingVertical: forLandscape ? 4 : 8 }}>
        {winStart > 1 && <Text style={{ color: onBg2, fontSize: 13 }}>…</Text>}
        {Array.from({ length: winEnd - winStart + 1 }, (_, i) => {
          const n = winStart + i;
          const isDone = n < currentRound;
          const isCur = n === currentRound;
          return (
            <View key={n} style={{
              width: bSize, height: bSize, borderRadius: bSize / 2,
              backgroundColor: isDone ? rDoneBg : isCur ? rCurBg : rIdleBg,
              justifyContent: 'center', alignItems: 'center',
              borderWidth: isCur ? 0 : 1,
              borderColor: isDone ? 'transparent' : rBorder,
            }}>
              <Text style={{ fontSize: bSize * 0.38, fontWeight: '900',
                color: isDone ? rDoneFg : isCur ? rCurFg : rIdleFg }}>
                {n}
              </Text>
            </View>
          );
        })}
        {winEnd < curTotalRounds && <Text style={{ color: onBg2, fontSize: 13 }}>…</Text>}
      </View>
    );
  };

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
    <View style={[styles.overlay, withCamera && isLandscape && { paddingVertical: 20 }, withCamera && !isLandscape && phase === 'done' && { paddingTop: 20, paddingBottom: 8 }, !withCamera && { paddingVertical: 0 }]}>
      {!(!withCamera && phase !== 'done') && renderTopBar(0)}

      {phase === 'done' ? (
        /* ── RÉSULTAT PLEIN ÉCRAN ──────────────────────────────── */
        <View style={{ flex: 1 }}>
          <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={{ flex: 1 }}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, paddingBottom: 16, paddingTop: 0 }}>

              {/* ── TOP : logo + badge ── */}
              <View style={{ alignItems: 'center', gap: 10, paddingTop: 2 }}>
                <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#FFFFFF',
                  justifyContent: 'center', alignItems: 'center',
                  shadowColor: '#ffffff', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } }}>
                  <Image
                    source={require('../../../assets/athex-logo.png')}
                    style={{ width: 62, height: 62, resizeMode: 'contain' }}
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
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: onBg2, letterSpacing: 4, textTransform: 'uppercase' }}>TEMPS FINAL</Text>
                <Text style={[styles.sessionTime, { color: withCamera ? '#FFFFFF' : onBg1 }]}>{mainTime}</Text>
                {videoTitle ? <Text style={[styles.sessionTitle, { color: onBg1 }]} numberOfLines={2}>{videoTitle}</Text> : null}
                {withCamera && <Text style={[styles.sessionDate, { color: onBg2 }]}>{clockStr}</Text>}
                {withCamera && (
                  <View style={[styles.sessionQRWrap, { marginTop: 6, padding: 10 }]}>
                    <QRCode value={qrData} size={70} color="#111111" backgroundColor="#FFFFFF" />
                    <Text style={styles.sessionQRHint}>Scanner pour les détails</Text>
                  </View>
                )}
                {/* Bouton recommencer centré sous le timer */}
                <TouchableOpacity onPress={handleReset} style={[styles.resetBtn, { marginTop: 8,
                  backgroundColor: isLightBg ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)',
                  borderColor: isLightBg ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)' }]} activeOpacity={0.8}>
                  <RotateCcw color={iconColor} size={26} />
                </TouchableOpacity>
              </View>

              {/* ── BAS : actions ── */}
              <View style={{ width: '100%', gap: 8, alignItems: 'center' }}>
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
                <TouchableOpacity onPress={handleClose} style={[styles.closeResultBtn, { width: '100%', alignItems: 'center',
                  borderRadius: 16, paddingVertical: 12,
                  backgroundColor: withCamera ? 'rgba(255,255,255,0.15)' : (isLightBg ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)'),
                  borderColor: withCamera ? 'rgba(255,255,255,0.25)' : (isLightBg ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)') }]} activeOpacity={0.8}>
                  <Text style={[styles.closeResultText, { color: withCamera ? '#FFFFFF' : onBg1 }]}>Fermer</Text>
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
                /* ── LANDSCAPE SANS CAMÉRA : nouveau design AthleX ── */
                <View style={{ flex: 1, backgroundColor: currentBg }}>

                  {/* TOP BAR */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
                    <TouchableOpacity onPress={handleClose} style={[styles.iconBtn, { backgroundColor: ctrlBtnBg }]}>
                      <X color={iconColor} size={24} />
                    </TouchableOpacity>
                    <View style={{ backgroundColor: pillBg, paddingHorizontal: 14,
                      paddingVertical: 5, borderRadius: 14,
                      shadowColor: pillBg, shadowOpacity: 0.45, shadowRadius: 8,
                      shadowOffset: { width: 0, height: 0 } }}>
                      <Text style={{ color: pillFg, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 }}>
                        {seqPausing ? 'PAUSE' : displayLabel}
                      </Text>
                    </View>
                    {hasRounds && !seqPausing && (
                      <Text style={{ color: onBg1, fontSize: 14, fontWeight: '800', letterSpacing: 1.5 }}>
                        ROUND {currentRound} / {curTotalRounds}
                      </Text>
                    )}
                    {hasWorkRest && phase === 'running' && !seqPausing && (
                      <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10,
                        backgroundColor: innerPhase === 'work' ? 'rgba(245,158,11,0.15)' : 'rgba(96,165,250,0.15)' }}>
                        <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 2,
                          color: ensureContrast(innerPhase === 'work' ? '#F59E0B' : '#60A5FA', currentBg) }}>
                          {innerPhase === 'work' ? '● TRAVAIL' : '● REPOS'}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    <Text style={{ color: onBg2, fontSize: 13, fontWeight: '600',
                      letterSpacing: 0.5, fontVariant: ['tabular-nums'] as any }}>
                      {formatTime(totalElapsed)}
                    </Text>
                    <TouchableOpacity onPress={() => setShowSettings(true)} style={[styles.iconBtn, { backgroundColor: ctrlBtnBg }]} activeOpacity={0.7}>
                      <Settings color={iconColor} size={20} />
                    </TouchableOpacity>
                  </View>

                  {/* ARC style: progress ring floating top-center */}
                  {displayOpts.clockStyle === 'arc' && totalWodSeconds > 0 && (
                    <View style={{ position: 'absolute', top: 50, left: 0, right: 0, alignItems: 'center' }}
                      pointerEvents="none">
                      <ProgressRing progress={totalProgress} color={accentColor} size={80} />
                    </View>
                  )}

                  {/* MAIN TIMER */}
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    {phase === 'countdown' ? (
                      <Text style={{ fontSize: Math.round(winH * 0.62), fontWeight: '900',
                        color: accentColor, letterSpacing: -6 }}>
                        {countdownVal}
                      </Text>
                    ) : (
                      <Text
                        style={{ fontSize: Math.round(winH * 0.58),
                          fontWeight: '900', color: accentColor, letterSpacing: -6 }}>
                        {mainTime}
                      </Text>
                    )}
                    {hasRounds && (timerType === 'tabata' || (timerType === 'libre' && curBlk?.type === 'tabata'))
                      && (curBlk?.restSec ?? restTime) > 0 && phase === 'running' && (
                      <Text style={{ color: onBg2, fontSize: 11, fontWeight: '700',
                        letterSpacing: 1, marginTop: 6 }}>
                        {innerPhase === 'work'
                          ? `REPOS DANS ${formatTime(roundTimeLeft)}`
                          : `EXERCICE DANS ${formatTime(roundTimeLeft)}`}
                      </Text>
                    )}
                  </View>

                  {/* ROUND BUBBLES */}
                  {hasRounds && !seqPausing && renderRoundBubbles(true)}

                  {/* BOTTOM BAR: progress + % */}
                  <View style={{ alignItems: 'center', paddingBottom: 10 }}>
                    {displayOpts.clockStyle === 'bar' && totalWodSeconds > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: '55%' }}>
                        <View style={{ flex: 1, height: 8, backgroundColor: barTrack,
                          borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ height: '100%',
                            width: `${Math.round(totalProgress * 100)}%` as `${number}%`,
                            backgroundColor: accentColor, borderRadius: 4 }} />
                        </View>
                        <Text style={{ color: accentColor, fontSize: 15, fontWeight: '900',
                          letterSpacing: -0.5, minWidth: 44, textAlign: 'right' }}>
                          {Math.round(totalProgress * 100)}%
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Hint + contextual buttons — float ABOVE the fixed play/stop button */}
                  {(phase === 'ready' || showEndWorkBtn || showYwyrEndBtn || showEndBlockBtn) && (
                    <View style={{ position: 'absolute', right: 18, bottom: 98,
                      width: 70, alignItems: 'center', gap: 8 }}>
                      {phase === 'ready' && (
                        <Text style={[styles.readyHint, { fontSize: 8, textAlign: 'center', maxWidth: 72, color: onBg2 }]}>
                          {'APPUIE\nPOUR\nDÉMARRER'}
                        </Text>
                      )}
                      {showEndWorkBtn && (
                        <TouchableOpacity onPress={ywyrEndWork}
                          style={[styles.ywyrBtn, { paddingHorizontal: 8, paddingVertical: 6 }]} activeOpacity={0.8}>
                          <Text style={[styles.ywyrBtnText, { fontSize: 9, textAlign: 'center', color: ensureContrast('#4ADE80', currentBg) }]}>FIN DU{"\n"}TRAVAIL</Text>
                        </TouchableOpacity>
                      )}
                      {showYwyrEndBtn && (
                        <TouchableOpacity onPress={handleStop}
                          style={[styles.ywyrBtn, { paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.5)' }]} activeOpacity={0.8}>
                          <Text style={[styles.ywyrBtnText, { fontSize: 9, textAlign: 'center', color: ensureContrast('#EF4444', currentBg) }]}>TERMINER</Text>
                        </TouchableOpacity>
                      )}
                      {showEndBlockBtn && (
                        <TouchableOpacity onPress={libreEndForTimeBlock}
                          style={[styles.ywyrBtn, { paddingHorizontal: 8, paddingVertical: 6 }]} activeOpacity={0.8}>
                          <Text style={[styles.ywyrBtnText, { fontSize: 9, textAlign: 'center', color: ensureContrast('#4ADE80', currentBg) }]}>FIN DU{"\n"}BLOC</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* FIXED PLAY/STOP — bottom-right corner (never moves between play↔stop) */}
                  <TouchableOpacity
                    style={[styles.newBigPlayBtn, mainBtnStop && styles.newBigPlayBtnStop,
                      { position: 'absolute', right: 18, bottom: 20,
                        width: 70, height: 70, borderRadius: 35,
                        shadowColor: mainBtnStop ? '#EF4444' : accentColor,
                        shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
                        borderColor: mainBtnStop ? 'rgba(239,68,68,0.6)' : `${accentColor}99` }]}
                    onPress={
                      phase === 'ready' ? handleStart
                      : isYwyrSolo && phase === 'running' ? ywyrMainPress
                      : isActive ? handleStop : handleStart
                    }
                    activeOpacity={0.8}
                  >
                    {isYwyrSolo && phase === 'running'
                      ? (innerPhase === 'work'
                          ? <RotateCcw color={ctrlInk} size={24} />
                          : <Play color={ctrlInk} size={26} fill={ctrlInk} />)
                      : isActive ? <Square color={ctrlInk} size={24} fill={ctrlInk} /> : <Play color={ctrlInk} size={26} fill={ctrlInk} />}
                  </TouchableOpacity>

                </View>
              ) : (
                /* ── AVEC CAMÉRA : layout centré classique ── */
                <>
                  {/* Countdown handled once by the top-level camCdOverlay (avoids a duplicate PRÉPARER/number) */}
                  {phase !== 'countdown' && (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      {!!phaseLabel && phase === 'running' && (
                        <Text style={[styles.phaseLabelGiant, { fontSize: 18, marginBottom: 2, color: ensureContrast(phaseColor, currentBg) }]}>{phaseLabel}</Text>
                      )}
                      {displayOpts.clockStyle === 'arc' && <ArcTimer time={mainTime} progress={arcProgress} color="#FFFFFF" fontSize={displayOpts.fontSize} strokeColor={phaseColor} landscape flat />}
                      {displayOpts.clockStyle === 'bar' && <BarTimer time={mainTime} progress={arcProgress} color="#FFFFFF" fontSize={displayOpts.fontSize} strokeColor={phaseColor} landscape flat />}
                      {displayOpts.clockStyle === 'digits' && <DigitsTimer time={mainTime} color="#FFFFFF" fontSize={displayOpts.fontSize} landscape flat />}
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
            {!withCamera ? (
              /* ── PORTRAIT SANS CAMÉRA : nouveau design AthleX ── */
              <View style={{ flex: 1, backgroundColor: currentBg }}>

                {/* HEADER: X | badge mode | Settings */}
                <View style={{ flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'space-between', paddingHorizontal: 16,
                  paddingTop: 52, paddingBottom: 8 }}>
                  <TouchableOpacity onPress={handleClose} style={styles.iconBtn}>
                    <X color={iconColor} size={24} />
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <View style={{ backgroundColor: pillBg, paddingHorizontal: 20,
                      paddingVertical: 6, borderRadius: 20,
                      shadowColor: pillBg, shadowOpacity: 0.45, shadowRadius: 10,
                      shadowOffset: { width: 0, height: 0 } }}>
                      <Text style={{ color: pillFg, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 }}>
                        {seqPausing ? 'PAUSE' : displayLabel}
                      </Text>
                    </View>
                    <Text style={{ color: onBg2, fontSize: 13, fontWeight: '600',
                      letterSpacing: 0.5, fontVariant: ['tabular-nums'] as any }}>
                      {formatTime(totalElapsed)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.iconBtn} activeOpacity={0.7}>
                    <Settings color={iconColor} size={20} />
                  </TouchableOpacity>
                </View>

                {/* ROUND LABEL */}
                {hasRounds && !seqPausing && (
                  <Text style={{ textAlign: 'center', color: onBg1, fontSize: 16,
                    fontWeight: '800', letterSpacing: 2, marginBottom: 2 }}>
                    ROUND {currentRound} / {curTotalRounds}
                  </Text>
                )}

                {/* LIBRE bloc label */}
                {timerType === 'libre' && !!seqBlockLabel && !seqPausing && (
                  <Text style={{ textAlign: 'center', color: onBg2,
                    fontSize: 11, fontWeight: '800', letterSpacing: 2.5, marginBottom: 2 }}>
                    {seqBlockLabel} · BLOC {seqIdx + 1}/{seqTotal}
                  </Text>
                )}

                {/* TABATA / YWYR PHASE BADGE */}
                {hasWorkRest && phase === 'running' && !seqPausing && (
                  <View style={{ alignItems: 'center', marginBottom: 2 }}>
                    <View style={{ paddingHorizontal: 18, paddingVertical: 4, borderRadius: 12,
                      backgroundColor: innerPhase === 'work' ? 'rgba(245,158,11,0.15)' : 'rgba(96,165,250,0.15)' }}>
                      <Text style={{ fontSize: 12, fontWeight: '900', letterSpacing: 2.5,
                        color: innerPhase === 'work' ? '#F59E0B' : '#60A5FA' }}>
                        {innerPhase === 'work' ? '● TRAVAIL' : '● REPOS'}
                      </Text>
                    </View>
                  </View>
                )}

                {/* MAIN TIMER */}
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 }}>
                  {seqPausing && phase === 'running' && (
                    <Text style={{ color: accentColor, fontSize: 24, fontWeight: '900',
                      letterSpacing: 5, marginBottom: 4, textShadowColor: accentColor,
                      textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14 }}>
                      PAUSE
                    </Text>
                  )}
                  {phase === 'countdown' ? (
                    <Text style={{ fontSize: Math.round(SW * 0.42), fontWeight: '900',
                      color: accentColor, letterSpacing: -4, fontVariant: ['tabular-nums'] }}>
                      {countdownVal}
                    </Text>
                  ) : (
                    <Text adjustsFontSizeToFit numberOfLines={1}
                      style={{ fontSize: displayOpts.fontSize, fontWeight: '900',
                        color: accentColor, letterSpacing: -4, fontVariant: ['tabular-nums'] }}>
                      {mainTime}
                    </Text>
                  )}
                  {hasRounds && (timerType === 'tabata' || (timerType === 'libre' && curBlk?.type === 'tabata'))
                    && (curBlk?.restSec ?? restTime) > 0 && phase === 'running' && (
                    <Text style={{ color: onBg2, fontSize: 13, fontWeight: '700',
                      letterSpacing: 1, marginTop: 8 }}>
                      {innerPhase === 'work'
                        ? `REPOS DANS ${formatTime(roundTimeLeft)}`
                        : `EXERCICE DANS ${formatTime(roundTimeLeft)}`}
                    </Text>
                  )}
                </View>

                {/* ROUND BUBBLES */}
                {hasRounds && !seqPausing && renderRoundBubbles(false)}

                {/* PROGRESS INDICATOR */}
                <View style={{ alignItems: 'center', paddingHorizontal: 20, paddingTop: 6, gap: 6 }}>
                  {displayOpts.clockStyle === 'bar' && totalWodSeconds > 0 && (
                    <View style={{ width: '100%', gap: 5 }}>
                      <View style={{ height: 10, backgroundColor: barTrack,
                        borderRadius: 5, overflow: 'hidden' }}>
                        <View style={{ height: '100%',
                          width: `${Math.round(totalProgress * 100)}%` as `${number}%`,
                          backgroundColor: accentColor, borderRadius: 5 }} />
                      </View>
                      <Text style={{ color: accentColor, fontSize: 14, fontWeight: '800',
                        textAlign: 'center', letterSpacing: 1 }}>
                        {Math.round(totalProgress * 100)}%
                      </Text>
                    </View>
                  )}
                  {displayOpts.clockStyle === 'arc' && totalWodSeconds > 0 && (
                    <ProgressRing progress={totalProgress} color={accentColor} size={100} />
                  )}
                </View>

                {/* SUIVANT CARD */}
                {!!nextExercise && (
                  <View style={{ marginHorizontal: 20, marginTop: 8, padding: 14, borderRadius: 14,
                    backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1,
                    borderColor: 'rgba(245,158,11,0.3)' }}>
                    <Text style={{ color: ensureContrast('#F59E0B', currentBg), fontSize: 10, fontWeight: '900',
                      letterSpacing: 2, marginBottom: 3 }}>SUIVANT</Text>
                    <Text style={{ color: onBg1, fontSize: 15, fontWeight: '700' }}>{nextExercise}</Text>
                  </View>
                )}

                {/* PLAY / STOP BUTTON */}
                <View style={{ alignItems: 'center', paddingBottom: 40, paddingTop: 14, gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.newBigPlayBtn, mainBtnStop && styles.newBigPlayBtnStop,
                      { width: 80, height: 80, borderRadius: 40,
                        shadowColor: mainBtnStop ? '#EF4444' : accentColor,
                        shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
                        borderColor: mainBtnStop ? 'rgba(239,68,68,0.6)' : `${accentColor}99` }]}
                    onPress={
                      phase === 'ready' ? handleStart
                      : isYwyrSolo && phase === 'running' ? ywyrMainPress
                      : isActive ? handleStop : handleStart
                    }
                    activeOpacity={0.8}
                  >
                    {isYwyrSolo && phase === 'running'
                      ? (innerPhase === 'work'
                          ? <RotateCcw color={ctrlInk} size={28} />
                          : <Play color={ctrlInk} size={30} fill={ctrlInk} />)
                      : isActive ? <Square color={ctrlInk} size={28} fill={ctrlInk} /> : <Play color={ctrlInk} size={30} fill={ctrlInk} />}
                  </TouchableOpacity>
                  {/* fixed-height hint slot so the button stays put between play↔stop */}
                  <View style={{ height: 18, justifyContent: 'center' }}>
                    {phase === 'ready' && <Text style={[styles.readyHint, { color: onBg2 }]}>APPUIE POUR DÉMARRER</Text>}
                    {showYwyrEndBtn && (
                      <Text style={[styles.readyHint, { color: onBg2 }]}>
                        {innerPhase === 'work' ? 'APPUIE = LANCER LE REPOS' : 'APPUIE = REPRENDRE LE TRAVAIL'}
                      </Text>
                    )}
                  </View>
                  {showEndWorkBtn && (
                    <TouchableOpacity onPress={ywyrEndWork} style={styles.ywyrBtn} activeOpacity={0.8}>
                      <Text style={styles.ywyrBtnText}>FIN DU TRAVAIL</Text>
                    </TouchableOpacity>
                  )}
                  {showYwyrEndBtn && (
                    <TouchableOpacity onPress={handleStop}
                      style={[styles.ywyrBtn, { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.5)' }]} activeOpacity={0.8}>
                      <Text style={[styles.ywyrBtnText, { color: '#EF4444' }]}>TERMINER</Text>
                    </TouchableOpacity>
                  )}
                  {showEndBlockBtn && (
                    <TouchableOpacity onPress={libreEndForTimeBlock} style={styles.ywyrBtn} activeOpacity={0.8}>
                      <Text style={styles.ywyrBtnText}>FIN DU BLOC</Text>
                    </TouchableOpacity>
                  )}
                </View>

              </View>
            ) : (
              /* ── PORTRAIT AVEC CAMÉRA : layout centré propre (sans boîte) ── */
              <>
                {/* Timer centré flottant sur la caméra — countdown géré par camCdOverlay top-level */}
                {phase !== 'countdown' && (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
                    {!!phaseLabel && phase === 'running' && (
                      <Text style={[styles.phaseLabelGiant, { fontSize: 22, marginBottom: 10, color: phaseColor }]}>{phaseLabel}</Text>
                    )}
                    {displayOpts.clockStyle === 'arc' && <ArcTimer time={mainTime} progress={arcProgress} color="#FFFFFF" fontSize={displayOpts.fontSize} strokeColor={phaseColor} flat />}
                    {displayOpts.clockStyle === 'bar' && <BarTimer time={mainTime} progress={arcProgress} color="#FFFFFF" fontSize={displayOpts.fontSize} strokeColor={phaseColor} flat />}
                    {displayOpts.clockStyle === 'digits' && <DigitsTimer time={mainTime} color="#FFFFFF" fontSize={displayOpts.fontSize} flat />}
                    {hasRounds && phase === 'running' && !seqPausing && (
                      <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 15, marginTop: 12, letterSpacing: 2, fontWeight: '700' }}>ROUND {currentRound} / {currentRound + roundsLeft}</Text>
                    )}
                  </View>
                )}

                {/* Boutons contextuels FIN DU TRAVAIL / FIN DU BLOC */}
                {(showEndWorkBtn || showEndBlockBtn) && (
                  <View style={{ position: 'absolute', bottom: 96, left: 0, right: 0, alignItems: 'center' }} pointerEvents="box-none">
                    {showEndWorkBtn && (
                      <TouchableOpacity onPress={ywyrEndWork} style={styles.ywyrBtn} activeOpacity={0.8}>
                        <Text style={styles.ywyrBtnText}>FIN DU TRAVAIL</Text>
                      </TouchableOpacity>
                    )}
                    {showEndBlockBtn && (
                      <TouchableOpacity onPress={libreEndForTimeBlock} style={styles.ywyrBtn} activeOpacity={0.8}>
                        <Text style={styles.ywyrBtnText}>FIN DU BLOC</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Bouton principal en bas (Démarrer / Lancer le chrono / Arrêter) */}
                <View style={{ position: 'absolute', bottom: 28, left: 0, right: 0, alignItems: 'center' }} pointerEvents="box-none">
                  <TouchableOpacity onPress={camPrimaryAction} disabled={camState === 0 && !isCameraReady}
                    style={[styles.camPrimaryBtn, { paddingHorizontal: 40, paddingVertical: 16, minWidth: 240 },
                      camState === 0 && !isCameraReady && { opacity: 0.4 },
                      camState === 1 && styles.camPrimaryBtnGo,
                      (camState === 2 || camState === 3) && styles.camPrimaryBtnStop,
                    ]} activeOpacity={0.85}>
                    <Text style={[styles.camPrimaryBtnText, { fontSize: 17 }]}>
                      {camState === 0 && !isCameraReady ? 'Initialisation…' : camPrimaryLabel}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* INFOBAR — titre/timestamp */}
                {(videoTitle || withTimestamp) && phase === 'running' && camState >= 2 && (
                  <View style={styles.infoBar}>
                    {videoTitle ? <Text style={styles.infoTitle} numberOfLines={1}>{videoTitle}</Text> : null}
                    {withTimestamp ? <Text style={styles.infoTimestamp}>{clockStr}</Text> : null}
                  </View>
                )}
              </>
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
        {phase === 'countdown' && countdownVal > 0 && (() => {
          const cdSize = isLandscape ? Math.min(winH * 0.5, SW * 0.42) : SW * 0.55;
          return (
          <View style={[StyleSheet.absoluteFill, styles.camCdOverlay, isLandscape && { paddingBottom: 90 }]} pointerEvents="none">
            <Text style={[styles.phaseLabelGiant, { color: '#FFFFFF', marginBottom: 16,
              textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }]}>PRÉPARER</Text>
            <View style={[styles.camCdCircle, { width: cdSize, height: cdSize, borderRadius: cdSize / 2, borderColor: 'rgba(255,255,255,0.5)' }]}>
              <Text style={[styles.camCdNum, { fontSize: cdSize * 0.5, color: '#FFFFFF' }]}>{countdownVal}</Text>
            </View>
          </View>
          );
        })()}
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
    paddingHorizontal: 16, paddingVertical: 8, marginTop: 2,
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
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeResultBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14,
    paddingHorizontal: 28, paddingVertical: 11,
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
    fontSize: SW * 0.25, fontWeight: '900', letterSpacing: -4,
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
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 12,
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
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 12,
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
    backgroundColor: '#FF0000', borderRadius: 16, padding: 12,
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
