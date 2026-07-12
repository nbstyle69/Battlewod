import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import GlassBackground from '../../components/glass/GlassBackground';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { AuthStackParamList } from '../../navigation';
import { Gender } from '../../types';
import { spacing, borderRadius, typography, shadows } from '../../theme/designTokens';
import { OWNER_ONBOARDING_URL } from '../../lib/urls';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'> };

export default function RegisterScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const { theme, mode } = useTheme();
  const S = createStyles(theme);
  const [email,       setEmail]       = useState('');
  const [username,    setUsername]    = useState('');
  const [password,    setPassword]    = useState('');
  const [gender,      setGender]      = useState<Gender>('male');
  const [loading,     setLoading]     = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedCGU, setAcceptedCGU] = useState(false);

  async function handleRegister() {
    if (!email || !password || !username) { Alert.alert(t('common.error'), t('auth.fillAllFields')); return; }
    if (password.length < 6) { Alert.alert(t('common.error'), t('auth.passwordTooShort')); return; }
    if (!acceptedCGU) { Alert.alert(t('auth.cguRequiredTitle'), t('auth.cguRequiredBody')); return; }
    setLoading(true);
    const requestedUsername = username.trim();
    const { error, finalUsername } = await signUp(email.trim(), password, requestedUsername, 'inter', gender);
    setLoading(false);

    // Inform the user if their pseudo was auto-suffixed because the requested one was taken
    const pseudoChanged = !!finalUsername && finalUsername !== requestedUsername;
    const pseudoNotice = pseudoChanged
      ? `\n\nℹ️ Le pseudo « ${requestedUsername} » était déjà pris, le tien est devenu « ${finalUsername} ». Tu peux le changer plus tard dans ton profil.`
      : '';

    if (error === 'CONFIRM_EMAIL') {
      Alert.alert(
        '📧 Confirme ton email',
        `Un lien de confirmation a été envoyé à ${email.trim()}.\n\nClique sur le lien dans l'email pour activer ton compte, puis connecte-toi.${pseudoNotice}`,
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    } else if (error) {
      Alert.alert(t('auth.registerFailed'), error);
    } else if (pseudoChanged) {
      Alert.alert('Pseudo modifié', `Le pseudo « ${requestedUsername} » était déjà pris, le tien est devenu « ${finalUsername} ». Tu peux le changer plus tard dans ton profil.`);
    }
  }

  return (
    <View style={S.gradient}>
      <GlassBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.flex}>
        <ScrollView contentContainerStyle={S.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
            <ChevronLeft color={theme.textSecondary} size={24} />
            <Text style={S.backText}>{t('common.back')}</Text>
          </TouchableOpacity>

          <View style={S.logoContainer}>
            <Image
              source={require('../../../assets/logo.png')}
              style={S.logo}
            />
            <Text style={S.appName}>AthleX</Text>
          </View>

          <View style={S.form}>
            <Text style={S.title}>{t('auth.registerTitle')}</Text>

            <View style={S.inputContainer}>
              <Text style={S.label}>{t('auth.username')}</Text>
              <TextInput
                style={S.input}
                placeholder="TonPseudo"
                placeholderTextColor={theme.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
              />
            </View>

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
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
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

            <View style={S.inputContainer}>
              <Text style={S.label}>{t('auth.gender')}</Text>
              <View style={S.roleRow}>
                <TouchableOpacity
                  style={[S.roleCard, gender === 'male' && S.roleCardActive]}
                  onPress={() => setGender('male')}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 22 }}>♂</Text>
                  <Text style={[S.roleLabel, gender === 'male' && S.roleLabelActive]}>{t('auth.male')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.roleCard, gender === 'female' && S.roleCardActive]}
                  onPress={() => setGender('female')}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 22 }}>♀</Text>
                  <Text style={[S.roleLabel, gender === 'female' && S.roleLabelActive]}>{t('auth.female')}</Text>
                </TouchableOpacity>
              </View>
            </View>


            <View style={S.cguRow}>
              <TouchableOpacity onPress={() => setAcceptedCGU(!acceptedCGU)} style={S.cguCheckbox} accessibilityLabel={acceptedCGU ? 'Décocher les CGU' : 'Accepter les CGU'} accessibilityRole="checkbox">
                {acceptedCGU && <View style={S.cguChecked} />}
              </TouchableOpacity>
              <Text style={S.cguText}>
                {t('auth.acceptPrefix')}{' '}
                <Text style={S.cguLink} onPress={() => navigation.navigate('Legal' as never)}>{t('auth.cguLink')}</Text>
              </Text>
            </View>

            <TouchableOpacity onPress={handleRegister} disabled={loading || !acceptedCGU} activeOpacity={0.8} accessibilityLabel="Créer un compte" accessibilityRole="button"
              style={[S.button, { backgroundColor: theme.ctaBg, borderWidth: 2, borderColor: theme.ctaBorder }, !acceptedCGU && { opacity: 0.5 }]}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={S.buttonText}>{t('auth.joinBattle')}</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={S.ownerRow}
              onPress={() => Linking.openURL(OWNER_ONBOARDING_URL)}
              activeOpacity={0.7}
              accessibilityRole="link"
              accessibilityLabel="Créer un compte gérant de box sur athlex.app"
            >
              <Text style={S.ownerText}>
                {t('auth.ownerPrompt')}{' '}
                <Text style={S.ownerLink}>{t('auth.ownerLink')}</Text>
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
  return StyleSheet.create({
    gradient: { flex: 1, backgroundColor: 'transparent' },
    flex: { flex: 1 },
    container: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.xxxl },
    back: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    backText: { color: theme.textSecondary, ...typography.body },
    logoContainer: { alignItems: 'center', marginBottom: spacing.xl },
    logo: {
      width: 80, height: 80, resizeMode: 'contain', marginBottom: spacing.sm,
    },
    appName: { 
      ...typography.h2, 
      fontFamily: 'Barlow_900Black', 
      color: theme.text, 
      letterSpacing: 2,
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
    roleRow: { flexDirection: 'row', gap: spacing.sm },
    roleCard: {
      flex: 1,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: isDark ? theme.surface : theme.background,
      alignItems: 'center',
      gap: spacing.xs,
    },
    roleCardActive: { 
      borderColor: theme.accent, 
      backgroundColor: `${theme.accent}15`,
    },
    roleLabel: { 
      ...typography.buttonSmall, 
      color: theme.textMuted, 
      textAlign: 'center',
    },
    roleLabelActive: { color: theme.accent },
    ownerRow: {
      marginTop: spacing.md,
      alignItems: 'center',
    },
    ownerText: {
      ...typography.bodySmall,
      color: theme.textMuted,
      textAlign: 'center',
    },
    ownerLink: {
      color: theme.accent,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    button: { 
      borderRadius: borderRadius.lg, 
      padding: spacing.md, 
      alignItems: 'center', 
      marginTop: spacing.sm,
    },
    buttonText: { 
      color: '#fff', 
      ...typography.buttonLarge,
    },
    cguRow: { 
      flexDirection: 'row', 
      alignItems: 'flex-start', 
      gap: spacing.sm, 
      marginTop: spacing.md,
    },
    cguCheckbox: {
      width: 22, height: 22, 
      borderRadius: borderRadius.sm, 
      borderWidth: 2,
      borderColor: theme.accent, 
      justifyContent: 'center', 
      alignItems: 'center', 
      marginTop: spacing.xxs,
    },
    cguChecked: { 
      width: 12, height: 12, 
      borderRadius: 3, 
      backgroundColor: theme.accent,
    },
    cguText: { 
      flex: 1, 
      ...typography.bodySmall, 
      color: theme.textMuted, 
      lineHeight: 18,
    },
    cguLink: { 
      color: theme.accent, 
      fontWeight: '700', 
      textDecorationLine: 'underline',
    },
  });
}
