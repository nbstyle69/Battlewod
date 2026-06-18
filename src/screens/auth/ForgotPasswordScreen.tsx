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
import { AuthStackParamList } from '../../navigation';
import GlassBackground from '../../components/glass/GlassBackground';
import { spacing, borderRadius, typography, shadows } from '../../theme/designTokens';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'> };

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { resetPassword } = useAuth();
  const { theme, mode } = useTheme();
  const S = createStyles(theme);

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleReset() {
    const trimmed = email.trim();
    if (!trimmed) { Alert.alert('Erreur', 'Saisis ton adresse email'); return; }
    if (!EMAIL_REGEX.test(trimmed)) { Alert.alert('Erreur', 'Adresse email invalide (vérifie qu\'il n\'y a pas d\'espace)'); return; }
    setLoading(true);
    const { error } = await resetPassword(trimmed);
    setLoading(false);
    if (error) {
      Alert.alert('Erreur', error);
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
            <Text style={S.backText}>Retour</Text>
          </TouchableOpacity>

          {sent ? (
            <View style={S.form}>
              <View style={S.successIcon}>
                <CheckCircle color={theme.accent} size={52} strokeWidth={1.5} />
              </View>
              <Text style={S.title}>Email envoyé !</Text>
              <Text style={S.subtitle}>
                Un lien de réinitialisation a été envoyé à{'\n'}
                <Text style={S.emailHighlight}>{email.trim()}</Text>
              </Text>
              <Text style={S.hint}>
                Vérifie ta boîte mail (et tes spams). Clique sur le lien pour choisir un nouveau mot de passe.
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} activeOpacity={0.8}>
                <LinearGradient colors={[theme.accent, theme.accentDark]} style={S.button}>
                  <Text style={S.buttonText}>RETOUR À LA CONNEXION</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={S.form}>
              <View style={S.iconRow}>
                <Mail color={theme.accent} size={36} strokeWidth={1.5} />
              </View>
              <Text style={S.title}>Mot de passe oublié</Text>
              <Text style={S.subtitle}>
                Saisis ton email et on t'envoie un lien pour réinitialiser ton mot de passe.
              </Text>

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
                  autoCorrect={false}
                  autoComplete="email"
                  autoFocus
                />
              </View>

              <TouchableOpacity onPress={handleReset} disabled={loading} activeOpacity={0.8}>
                <LinearGradient colors={[theme.accent, theme.accentDark]} style={S.button}>
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={S.buttonText}>ENVOYER LE LIEN</Text>}
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
