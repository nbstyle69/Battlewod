import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap, ChevronLeft, Building2, Dumbbell } from 'lucide-react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { Colors, LevelColors } from '../../theme/colors';
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

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <ChevronLeft color={Colors.textSecondary} size={24} />
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>

          <View style={styles.logoContainer}>
            <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.logoBox}>
              <Zap color="#fff" size={32} />
            </LinearGradient>
            <Text style={styles.appName}>BattleWOD</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>Créer un compte</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Pseudo</Text>
              <TextInput
                style={styles.input}
                placeholder="TonPseudo"
                placeholderTextColor={Colors.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="ton@email.com"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Mot de passe</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Tu es…</Text>
              <View style={styles.roleRow}>
                <TouchableOpacity
                  style={[styles.roleCard, !asBoxOwner && styles.roleCardActive]}
                  onPress={() => setAsBoxOwner(false)}
                  activeOpacity={0.8}
                >
                  <Dumbbell color={!asBoxOwner ? Colors.primary : Colors.textMuted} size={20} />
                  <Text style={[styles.roleLabel, !asBoxOwner && styles.roleLabelActive]}>Athlète</Text>
                  <Text style={styles.roleDesc}>Je veux m'entraîner et compétir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleCard, asBoxOwner && styles.roleCardActive]}
                  onPress={() => setAsBoxOwner(true)}
                  activeOpacity={0.8}
                >
                  <Building2 color={asBoxOwner ? Colors.primary : Colors.textMuted} size={20} />
                  <Text style={[styles.roleLabel, asBoxOwner && styles.roleLabelActive]}>Gérant de box</Text>
                  <Text style={styles.roleDesc}>Je gère une box / salle</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Ton niveau</Text>
              <View style={styles.levelsGrid}>
                {LEVELS.map((l) => (
                  <TouchableOpacity
                    key={l.value}
                    onPress={() => setLevel(l.value)}
                    style={[
                      styles.levelCard,
                      level === l.value && { borderColor: LevelColors[l.value], backgroundColor: `${LevelColors[l.value]}20` },
                    ]}
                  >
                    <Text style={[styles.levelLabel, level === l.value && { color: LevelColors[l.value] }]}>
                      {l.label}
                    </Text>
                    <Text style={styles.levelDesc}>{l.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity onPress={handleRegister} disabled={loading} activeOpacity={0.8}>
              <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.button}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buttonText}>REJOINDRE LA BATAILLE</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: 24, paddingTop: 60 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backText: { color: Colors.textSecondary, fontSize: 15, marginLeft: 4 },
  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logoBox: {
    width: 64, height: 64, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  appName: { fontSize: 28, fontWeight: '900', color: Colors.text, letterSpacing: 2 },
  form: {
    backgroundColor: Colors.card, borderRadius: 20,
    padding: 24, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 24 },
  inputContainer: { marginBottom: 16 },
  label: { fontSize: 13, color: Colors.textSecondary, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    color: Colors.text, fontSize: 15, borderWidth: 1, borderColor: Colors.border,
  },
  roleRow:       { flexDirection: 'row', gap: 10 },
  roleCard: {
    flex: 1, padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface, alignItems: 'center', gap: 4,
  },
  roleCardActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}08` },
  roleLabel:      { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textAlign: 'center' },
  roleLabelActive: { color: Colors.primary },
  roleDesc:       { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  levelsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelCard: {
    width: '48%', padding: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  levelLabel: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  levelDesc: { fontSize: 11, color: Colors.textMuted },
  button: { borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
});
