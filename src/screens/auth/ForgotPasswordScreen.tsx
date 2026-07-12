import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Mail, CheckCircle } from 'lucide-react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { AuthStackParamList } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';
import { spacing, borderRadius, typography, shadows } from '../../theme/designTokens';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'> };

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { resetPassword } = useAuth();
  const { theme, mode } = useTheme();
  const S = createStyles(theme);

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleReset() {
    const trimmed = email.trim();
    if (!trimmed) { Alert.alert(t('common.error'), t('forgot.enterEmail')); return; }
    if (!EMAIL_REGEX.test(trimmed)) { Alert.alert(t('common.error'), t('forgot.invalidEmail')); return; }
    setLoading(true);
    const { error } = await resetPassword(trimmed);
    setLoading(false);
    if (error) {
      Alert.alert(t('common.error'), error);
    } else {
      setSent(true);
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

          {sent ? (
            <View style={S.form}>
              <View style={S.successIcon}>
                <CheckCircle color={theme.accent} size={52} strokeWidth={1.5} />
              </View>
              <Text style={S.title}>{t('forgot.sentTitle')}</Text>
              <Text style={S.subtitle}>
                {t('forgot.sentSubtitle')}{'\n'}
                <Text style={S.emailHighlight}>{email.trim()}</Text>
              </Text>
              <Text style={S.hint}>
                {t('forgot.sentHint')}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} activeOpacity={0.8}>
                <LinearGradient colors={[theme.accent, theme.accentDark]} style={S.button}>
                  <Text style={S.buttonText}>{t('forgot.backToLogin')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={S.form}>
              <View style={S.iconRow}>
                <Mail color={theme.accent} size={36} strokeWidth={1.5} />
              </View>
              <Text style={S.title}>{t('forgot.title')}</Text>
              <Text style={S.subtitle}>
                {t('forgot.subtitle')}
              </Text>

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
                  autoCorrect={false}
                  autoComplete="email"
                  autoFocus
                />
              </View>

              <TouchableOpacity onPress={handleReset} disabled={loading} activeOpacity={0.8}>
                <LinearGradient colors={[theme.accent, theme.accentDark]} style={S.button}>
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={S.buttonText}>{t('forgot.sendLink')}</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

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
    back: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
    backText: { ...typography.body, color: theme.textSecondary },

    form: {
      backgroundColor: theme.card,
      borderRadius: borderRadius.xl,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: theme.border,
      ...shadows.md,
    },
    iconRow: { alignItems: 'center', marginBottom: spacing.md },
    successIcon: { alignItems: 'center', marginBottom: spacing.lg },
    title: { 
      ...typography.h3, 
      color: theme.text, 
      marginBottom: spacing.sm, 
      textAlign: 'center',
    },
    subtitle: { 
      ...typography.body, 
      color: theme.textSecondary, 
      textAlign: 'center', 
      lineHeight: 22, 
      marginBottom: spacing.lg,
    },
    emailHighlight: { color: theme.accent, fontWeight: '700' },
    hint: { 
      ...typography.bodySmall, 
      color: theme.textMuted, 
      textAlign: 'center', 
      lineHeight: 18, 
      marginBottom: spacing.lg, 
      fontStyle: 'italic',
    },

    inputContainer: { marginBottom: spacing.lg },
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
    },
    buttonText: { 
      color: '#fff', 
      ...typography.buttonLarge,
    },
  });
}
