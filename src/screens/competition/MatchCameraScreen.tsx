import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, Square, Download, ChevronRight } from 'lucide-react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { CompetitionStackParamList } from '../../navigation';

type Props = {
  navigation: NativeStackNavigationProp<CompetitionStackParamList, 'MatchCamera'>;
  route: RouteProp<CompetitionStackParamList, 'MatchCamera'>;
};

export default function MatchCameraScreen({ navigation, route }: Props) {
  const { matchId, wodTitle, wodType, wodDuration, wodMovements, wodScoring } = route.params;
  const { theme } = useTheme();
  const S = createStyles(theme);
  const movements: string[] = JSON.parse(wodMovements);

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [phase, setPhase] = useState<'ready' | 'recording' | 'done'>('ready');
  const [saved, setSaved] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    requestPermissions();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function requestPermissions() {
    if (!camPermission?.granted) await requestCamPermission();
    if (!micPermission?.granted) await requestMicPermission();
    if (!mediaPermission?.granted) await requestMediaPermission();
  }

  async function startRecording() {
    if (!cameraRef.current) return;
    setPhase('recording');
    setIsRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: wodDuration * 60 + 30 });
      if (video?.uri) setVideoUri(video.uri);
    } catch (e) {}
  }

  function stopRecording() {
    if (!cameraRef.current) return;
    cameraRef.current.stopRecording();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setPhase('done');
  }

  async function saveToGallery() {
    if (!videoUri) return;
    try {
      await MediaLibrary.saveToLibraryAsync(videoUri);
      setSaved(true);
      Alert.alert('✅ Vidéo sauvegardée', 'Ta vidéo a été enregistrée dans ta galerie.');
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder la vidéo.');
    }
  }

  function goToScore() {
    navigation.replace('MatchScore', {
      matchId,
      recordedSeconds: elapsed,
      wodTitle,
      wodType,
      wodScoring,
    });
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  if (!camPermission?.granted || !micPermission?.granted) {
    return (
      <View style={S.permissionContainer}>
        <Text style={S.permissionTitle}>Accès caméra requis</Text>
        <Text style={S.permissionSub}>BattleWOD a besoin de la caméra et du micro pour enregistrer ton WOD.</Text>
        <TouchableOpacity onPress={requestPermissions} activeOpacity={0.8}>
          <LinearGradient colors={[theme.accent, theme.secondary ?? theme.accent]} style={S.permissionBtn}>
            <Text style={S.permissionBtnText}>Autoriser</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <CameraView
        ref={cameraRef}
        style={S.camera}
        facing="back"
        mode="video"
      >
        <View style={S.overlay}>
          <View style={S.topOverlay}>
            <View style={S.wodInfo}>
              <Text style={S.wodTitleOverlay}>{wodTitle}</Text>
              <Text style={S.wodTypeOverlay}>{wodType} • {wodDuration} min</Text>
            </View>
            {isRecording && (
              <View style={S.recBadge}>
                <View style={S.recDot} />
                <Text style={S.recText}>REC</Text>
              </View>
            )}
          </View>

          <View style={S.timerContainer}>
            <Text style={[S.timer, isRecording && { color: '#FF4500' }]}>
              {formatTime(elapsed)}
            </Text>
            {phase === 'recording' && (
              <Text style={S.timerLabel}>
                max {formatTime(wodDuration * 60)}
              </Text>
            )}
          </View>

          {phase !== 'done' && (
            <View style={S.movementsOverlay}>
              {movements.slice(0, 3).map((m, i) => (
                <Text key={i} style={S.movementOverlay}>• {m}</Text>
              ))}
            </View>
          )}

          <View style={S.bottomControls}>
            {phase === 'ready' && (
              <TouchableOpacity onPress={startRecording} activeOpacity={0.85} style={S.recordBtnWrapper}>
                <LinearGradient colors={['#FF4500', '#FF6B35']} style={S.recordBtn}>
                  <Video color="#fff" size={28} />
                  <Text style={S.recordBtnText}>DÉMARRER</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {phase === 'recording' && (
              <TouchableOpacity onPress={stopRecording} activeOpacity={0.85} style={S.recordBtnWrapper}>
                <View style={S.stopBtn}>
                  <Square color="#fff" size={28} fill="#fff" />
                  <Text style={S.stopBtnText}>TERMINER</Text>
                </View>
              </TouchableOpacity>
            )}

            {phase === 'done' && (
              <View style={S.doneControls}>
                <Text style={S.doneTitle}>WOD terminé ! 🔥</Text>
                <Text style={S.doneTime}>Temps : {formatTime(elapsed)}</Text>
                <TouchableOpacity
                  onPress={saveToGallery}
                  style={[S.actionBtn, saved && { opacity: 0.5 }]}
                  disabled={saved}
                  activeOpacity={0.8}
                >
                  <Download color="#fff" size={18} />
                  <Text style={S.actionBtnText}>{saved ? 'Vidéo sauvegardée ✓' : 'Sauvegarder la vidéo'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={goToScore} activeOpacity={0.85}>
                  <LinearGradient colors={[theme.accent, theme.secondary ?? theme.accent]} style={S.nextBtn}>
                    <Text style={S.nextBtnText}>CONFIRMER MON SCORE</Text>
                    <ChevronRight color="#fff" size={20} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </CameraView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between', padding: 0 },
  topOverlay: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingTop: 56, paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingBottom: 12,
  },
  wodInfo: { flex: 1 },
  wodTitleOverlay: { fontSize: 18, fontWeight: '900', color: '#fff' },
  wodTypeOverlay: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  recBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,0,0,0.8)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  recText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  timerContainer: { alignItems: 'center' },
  timer: { fontSize: 80, fontWeight: '900', color: '#fff', letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  timerLabel: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  movementsOverlay: {
    backgroundColor: 'rgba(0,0,0,0.6)', marginHorizontal: 16,
    borderRadius: 12, padding: 12, gap: 4,
  },
  movementOverlay: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },
  bottomControls: {
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 16,
    paddingBottom: 40, paddingTop: 16,
  },
  recordBtnWrapper: { alignItems: 'center' },
  recordBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, paddingVertical: 18, paddingHorizontal: 48, gap: 12,
  },
  recordBtnText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, paddingVertical: 18, paddingHorizontal: 48, gap: 12,
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2, borderColor: '#fff',
  },
  stopBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  doneControls: { alignItems: 'center', gap: 12 },
  doneTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  doneTime: { fontSize: 16, color: 'rgba(255,255,255,0.7)' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%',
    justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32, gap: 8, width: '100%',
  },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  permissionContainer: {
    flex: 1, backgroundColor: theme.background,
    justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16,
  },
  permissionTitle: { fontSize: 22, fontWeight: '900', color: theme.text, textAlign: 'center' },
  permissionSub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  permissionBtn: { borderRadius: 16, paddingHorizontal: 40, paddingVertical: 16, marginTop: 8 },
  permissionBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
}); }
