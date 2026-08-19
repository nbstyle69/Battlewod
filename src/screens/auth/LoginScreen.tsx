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
import { useTranslation } from 'react-i18next';
import { AuthStackParamList } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';
import { spacing, borderRadius, typography, shadows } from '../../theme/designTokens';
import { buildIdentity } from '../../lib/buildIdentity';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { theme, mode } = useTheme();
  const S = createStyles(theme);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!email || !password) { Alert.alert(t('common.error'), t('auth.fillAllFields')); return; }
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) Alert.alert(t('auth.loginFailed'), error);
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
            <Text style={S.tagline}>{t('auth.tagline')}</Text>
          </View>

          <View style={S.form}>
            <Text style={S.title}>{t('auth.loginTitle')}</Text>

            <View style={S.inputContainer}>
              <Text style={S.label}>{t('auth.email')}</Text>
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
              <Text style={S.label}>{t('auth.password')}</Text>
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
              <Text style={S.forgotText}>{t('auth.forgotPassword')}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.8} accessibilityLabel="Se connecter" accessibilityRole="button"
              style={[S.button, { backgroundColor: theme.ctaBg, borderWidth: 2, borderColor: theme.ctaBorder }]}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={S.buttonText}>{t('auth.login').toUpperCase()}</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={S.registerLink} accessibilityLabel="Créer un compte" accessibilityRole="button">
              <Text style={S.registerText}>
                {t('auth.noAccount')} <Text style={S.registerHighlight}>{t('auth.registerTitle')}</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={S.buildIdentity} accessibilityLabel={`Version ${buildIdentity()}`}>
            {buildIdentity()}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const isDark = theme.mode === 'dark';
  return StyleSheet.create({
    gradient: { flex: 1, backgroundColor: 'transparent' },
    flex: { flex: 1 },
    container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
    logoContainer: { alignItems: 'center', marginBottom: spacing.xxxl },
    logo: {
      width: 100, height: 100, resizeMode: 'contain', marginBottom: spacing.md,
    },
    appName: { 
      ...typography.h1, 
      color: theme.text, 
      letterSpacing: 2,
      fontFamily: 'Barlow_900Black',
    },
    tagline: { 
      ...typography.bodySmall, 
      color: theme.textSecondary, 
      marginTop: spacing.xs, 
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    form: {
      backgroundColor: theme.card,
      borderRadius: borderRadius.xl,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: theme.border,
      ...shadows.md,
    },
    title: { 
      ...typography.h3, 
      color: theme.text, 
      marginBottom: spacing.lg,
    },
    inputContainer: { marginBottom: spacing.md },
    label: { 
      ...typography.label, 
      color: theme.textSecondary, 
      marginBottom: spacing.xs,
      textTransform: 'none',
    },
    input: {
      backgroundColor: isDark ? theme.surface : theme.background,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      color: theme.text,
      ...typography.body,
      borderWidth: 1,
      borderColor: theme.border,
    },
    button: { 
      borderRadius: borderRadius.lg, 
      padding: spacing.md, 
      alignItems: 'center', 
      marginTop: spacing.sm,
      justifyContent: 'center',
    },
    buttonText: { 
      color: '#fff', 
      ...typography.buttonLarge,
    },
    forgotLink: { 
      alignSelf: 'flex-end', 
      marginTop: spacing.sm, 
      marginBottom: spacing.md,
      paddingVertical: spacing.xs,
    },
    forgotText: { 
      color: theme.accent, 
      ...typography.button,
    },
    registerLink: { 
      alignItems: 'center', 
      marginTop: spacing.lg,
      paddingVertical: spacing.sm,
    },
    registerText: { 
      color: theme.textSecondary, 
      ...typography.body,
    },
    registerHighlight: { 
      color: theme.accent, 
      fontWeight: '700',
    },
    buildIdentity: {
      ...typography.caption,
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
  });
}
