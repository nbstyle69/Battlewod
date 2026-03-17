import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap, ChevronLeft, Building2, Dumbbell } from 'lucide-react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { AuthStackParamList } from '../../navigation';
import { AthleteLevel } from '../../types';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'> };

const LEVELS: { value: AthleteLevel; label: string; description: string }[] = [
  { value: 'scaled', label: 'Scaled', description: 'Débutant, mouvements adaptés' },
  { value: 'inter', label: 'Intermédiaire', description: '1 an+ de pratique' },
  { value: 'rx', label: 'RX', description: 'WOD standards complets' },
  { value: 'rx+', label: 'RX+', description: 'Niveau compétiteur' },
  { value: 'gx', label: 'GX', description: 'Elite games' },
  { value: 'pro', label: 'PRO', description: 'Athlète professionnel' },
];

export default function RegisterScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const { theme, mode } = useTheme();
  const S = createStyles(theme);
  const [email,       setEmail]       = useState('');
  const [username,    setUsername]    = useState('');
  const [password,    setPassword]    = useState('');
  const [level,       setLevel]       = useState<AthleteLevel>('scaled');
  const [asBoxOwner,  setAsBoxOwner]  = useState(false);
  const [loading,     setLoading]     = useState(false);

  async function handleRegister() {
    if (!email || !password || !username) { Alert.alert('Erreur', 'Remplis tous les champs'); return; }
    if (password.length < 6) { Alert.alert('Erreur', 'Mot de passe trop court (6 caractères min)'); return; }
    setLoading(true);
    const { error } = await signUp(email.trim(), password, username.trim(), level, asBoxOwner);
    setLoading(false);
    if (error === 'CONFIRM_EMAIL') {
      Alert.alert(
        '📧 Confirme ton email',
        `Un lien de confirmation a été envoyé à ${email.trim()}.\n\nClique sur le lien dans l'email pour activer ton compte, puis connecte-toi.`,
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    } else if (error) {
      Alert.alert('Inscription impossible', error);
    }
  }

  const gradColors = mode === 'dark'
    ? ['#0A0A0F', '#12121A', '#0A0A0F'] as const
    : ['#f0fdf9', '#ffffff', '#f0fdf9'] as const;

  return (
    <LinearGradient colors={gradColors} style={S.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.flex}>
        <ScrollView contentContainerStyle={S.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
            <ChevronLeft color={theme.textSecondary} size={24} />
            <Text style={S.backText}>Retour</Text>
          </TouchableOpacity>

          <View style={S.logoContainer}>
            <LinearGradient colors={[theme.accent, theme.accentDark]} style={S.logoBox}>
              <Zap color="#fff" size={32} />
            </LinearGradient>
            <Text style={S.appName}>AthleX</Text>
          </View>

          <View style={S.form}>
            <Text style={S.title}>Créer un compte</Text>

            <View style={S.inputContainer}>
              <Text style={S.label}>Pseudo</Text>
              <TextInput
                style={S.input}
                placeholder="TonPseudo"
                placeholderTextColor={theme.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>

            <View style={S.inputContainer}>
              <Text style={S.label}>Email</Text>
              <TextInput
                style={S.input}
                placeholder="ton@email.com"
                placeholderTextColor={theme.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={S.inputContainer}>
              <Text style={S.label}>Mot de passe</Text>
              <TextInput
                style={S.input}
                placeholder="••••••••"
                placeholderTextColor={theme.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <View style={S.inputContainer}>
              <Text style={S.label}>Tu es…</Text>
              <View style={S.roleRow}>
                <TouchableOpacity
                  style={[S.roleCard, !asBoxOwner && S.roleCardActive]}
                  onPress={() => setAsBoxOwner(false)}
                  activeOpacity={0.8}
                >
                  <Dumbbell color={!asBoxOwner ? theme.accent : theme.textMuted} size={20} />
                  <Text style={[S.roleLabel, !asBoxOwner && S.roleLabelActive]}>Athlète</Text>
                  <Text style={S.roleDesc}>Je veux m'entraîner et compétir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.roleCard, asBoxOwner && S.roleCardActive]}
                  onPress={() => setAsBoxOwner(true)}
                  activeOpacity={0.8}
                >
                  <Building2 color={asBoxOwner ? theme.accent : theme.textMuted} size={20} />
                  <Text style={[S.roleLabel, asBoxOwner && S.roleLabelActive]}>Gérant de box</Text>
                  <Text style={S.roleDesc}>Je gère une box / salle</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={S.inputContainer}>
              <Text style={S.label}>Ton niveau</Text>
              <View style={S.levelsGrid}>
                {LEVELS.map((l) => (
                  <TouchableOpacity
                    key={l.value}
                    onPress={() => setLevel(l.value)}
                    style={[
                      S.levelCard,
                      level === l.value && { borderColor: LevelColors[l.value], backgroundColor: `${LevelColors[l.value]}20` },
                    ]}
                  >
                    <Text style={[S.levelLabel, level === l.value && { color: LevelColors[l.value] }]}>
                      {l.label}
                    </Text>
                    <Text style={S.levelDesc}>{l.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity onPress={handleRegister} disabled={loading} activeOpacity={0.8}>
              <LinearGradient colors={[theme.accent, theme.accentDark]} style={S.button}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={S.buttonText}>REJOINDRE LA BATAILLE</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function createStyles(theme: AppTheme) {
  const isDark = theme.mode === 'dark';
  const cardShadow = isDark ? {} : {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  };
  return StyleSheet.create({
  gradient: { flex: 1 },
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: 24, paddingTop: 60 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backText: { color: theme.textSecondary, fontSize: 15, marginLeft: 4 },
  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logoBox: {
    width: 64, height: 64, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  appName: { fontSize: 34, fontFamily: 'Barlow_900Black', color: theme.text, letterSpacing: 3 },
  form: {
    backgroundColor: theme.card, borderRadius: 20,
    padding: 24, borderWidth: 1, borderColor: theme.border,
    ...cardShadow,
  },
  title: { fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: 24 },
  inputContainer: { marginBottom: 16 },
  label: { fontSize: 13, color: theme.textSecondary, marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: isDark ? theme.surface : theme.background, borderRadius: 14, padding: 14,
    color: theme.text, fontSize: 15, borderWidth: 1, borderColor: theme.border,
  },
  roleRow:       { flexDirection: 'row', gap: 10 },
  roleCard: {
    flex: 1, padding: 14, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border,
    backgroundColor: isDark ? theme.surface : theme.background, alignItems: 'center', gap: 4,
  },
  roleCardActive: { borderColor: theme.accent, backgroundColor: `${theme.accent}10` },
  roleLabel:      { fontSize: 13, fontWeight: '700', color: theme.textMuted, textAlign: 'center' },
  roleLabelActive: { color: theme.accent },
  roleDesc:       { fontSize: 10, color: theme.textMuted, textAlign: 'center' },
  levelsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelCard: {
    width: '48%', padding: 12, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border,
    backgroundColor: isDark ? theme.surface : theme.background,
  },
  levelLabel: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 2 },
  levelDesc: { fontSize: 11, color: theme.textMuted },
  button: { borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
}); }
