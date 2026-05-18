import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, EyeOff } from 'lucide-react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { AuthStackParamList } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const { theme, mode } = useTheme();
  const S = createStyles(theme);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!email || !password) { Alert.alert('Erreur', 'Remplis tous les champs'); return; }
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) Alert.alert('Connexion impossible', error);
  }

  return (
    <View style={S.gradient}>
      <GlassBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.flex}>
        <ScrollView contentContainerStyle={S.container} keyboardShouldPersistTaps="handled">
          <View style={S.logoContainer}>
            <Image
              source={require('../../../assets/logo.png')}
              style={S.logo}
            />
            <Text style={S.appName}>AthleX</Text>
            <Text style={S.tagline}>Compétition • Partout • Maintenant</Text>
          </View>

          <View style={S.form}>
            <Text style={S.title}>Connexion</Text>

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
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
              />
            </View>

            <View style={S.inputContainer}>
              <Text style={S.label}>Mot de passe</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[S.input, { paddingRight: 48 }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword
                    ? <EyeOff color={theme.textMuted} size={20} />
                    : <Eye color={theme.textMuted} size={20} />}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={S.forgotLink} accessibilityLabel="Mot de passe oublié">
              <Text style={S.forgotText}>Mot de passe oublié ?</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.8} accessibilityLabel="Se connecter" accessibilityRole="button">
              <LinearGradient colors={[theme.accent, theme.accentDark]} style={S.button}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={S.buttonText}>SE CONNECTER</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={S.registerLink} accessibilityLabel="Créer un compte" accessibilityRole="button">
              <Text style={S.registerText}>
                Pas encore de compte ? <Text style={S.registerHighlight}>Créer un compte</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const isDark = theme.mode === 'dark';
  const cardShadow = isDark ? {} : {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  };
  return StyleSheet.create({
  gradient: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 48 },
  logo: {
    width: 120, height: 120, resizeMode: 'contain', marginBottom: 16,
  },
  appName: { fontSize: 42, fontFamily: 'Barlow_900Black', color: theme.text, letterSpacing: 3 },
  tagline: { fontSize: 13, color: theme.textSecondary, marginTop: 4, letterSpacing: 1 },
  form: {
    backgroundColor: theme.card, borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: theme.border,
    ...cardShadow,
  },
  title: { fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: 24 },
  inputContainer: { marginBottom: 16 },
  label: { fontSize: 13, color: theme.textSecondary, marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: isDark ? theme.surface : theme.background, borderRadius: 14, padding: 14,
    color: theme.text, fontSize: 15, borderWidth: 1, borderColor: theme.border,
  },
  button: { borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  forgotLink: { alignItems: 'flex-end', marginTop: -8, marginBottom: 8 },
  forgotText: { color: theme.accent, fontSize: 13, fontWeight: '600' },
  registerLink: { alignItems: 'center', marginTop: 20 },
  registerText: { color: theme.textSecondary, fontSize: 14 },
  registerHighlight: { color: theme.accent, fontWeight: '700' },
}); }
