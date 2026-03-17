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
    gradient:       { flex: 1 },
    flex:           { flex: 1 },
    container:      { flexGrow: 1, justifyContent: 'center', padding: 24 },
    back:           { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
    backText:       { fontSize: 15, color: theme.textSecondary, marginLeft: 4 },

    form: {
      backgroundColor: theme.card, borderRadius: 20, padding: 24,
      borderWidth: 1, borderColor: theme.border, ...cardShadow,
    },
    iconRow:        { alignItems: 'center', marginBottom: 16 },
    successIcon:    { alignItems: 'center', marginBottom: 20 },
    title:          { fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: 10, textAlign: 'center' },
    subtitle:       { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
    emailHighlight: { color: theme.accent, fontWeight: '700' },
    hint:           { fontSize: 13, color: theme.textMuted, textAlign: 'center', lineHeight: 19, marginBottom: 24, fontStyle: 'italic' },

    inputContainer: { marginBottom: 20 },
    label:          { fontSize: 13, color: theme.textSecondary, marginBottom: 6, fontWeight: '500' },
    input: {
      backgroundColor: isDark ? theme.surface : theme.background,
      borderRadius: 14, padding: 14, color: theme.text,
      fontSize: 15, borderWidth: 1, borderColor: theme.border,
    },
    button:         { borderRadius: 14, padding: 16, alignItems: 'center' },
    buttonText:     { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  });
}
