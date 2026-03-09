import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { ChevronLeft, Hash, LogIn } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

export default function JoinBoxScreen({ navigation }: any) {
  const { joinBox, user } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [code, setCode]       = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    if (code.trim().length !== 6) {
      Alert.alert('Code invalide', 'Le code fait exactement 6 caractères.');
      return;
    }
    setLoading(true);
    const { error } = await joinBox(code.trim().toUpperCase());
    setLoading(false);
    if (error) Alert.alert('Erreur', error);
    // Navigation handled by AppNavigator reacting to currentBox change
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={S.container}
    >
      <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
        <ChevronLeft color={theme.textSecondary} size={22} />
      </TouchableOpacity>

      <View style={S.inner}>
        <View style={S.iconWrap}>
          <Hash color={theme.accent} size={32} />
        </View>
        <Text style={S.title}>Rejoindre une box</Text>
        <Text style={S.subtitle}>
          Demande le code à 6 caractères à ton coach ou gérant de box.
        </Text>

        <View style={S.inputWrap}>
          <TextInput
            style={S.codeInput}
            placeholder="ABC123"
            placeholderTextColor={theme.textMuted}
            value={code}
            onChangeText={t => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            maxLength={6}
            autoFocus
          />
        </View>

        <TouchableOpacity
          style={[S.btn, code.length !== 6 && S.btnDisabled]}
          onPress={handleJoin}
          disabled={loading || code.length !== 6}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <LogIn color="#fff" size={18} />
                <Text style={S.btnText}>Rejoindre</Text>
              </>
            )}
        </TouchableOpacity>

        <Text style={S.hint}>
          Bonjour {user?.username} · si tu n'as pas encore de code, contacte ton box
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  back: { paddingTop: 56, paddingLeft: 20, paddingBottom: 8 },
  inner: { flex: 1, paddingHorizontal: 28, justifyContent: 'center', gap: 18, marginTop: -60 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: `${theme.accent}10`,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '900', color: theme.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  inputWrap: { alignItems: 'center', marginVertical: 8 },
  codeInput: {
    fontSize: 32, fontWeight: '900', color: theme.text,
    letterSpacing: 12, textAlign: 'center',
    backgroundColor: theme.card, borderRadius: 16,
    borderWidth: 1.5, borderColor: theme.border,
    paddingHorizontal: 28, paddingVertical: 18,
    width: '100%',
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: theme.accent,
    borderRadius: 16, padding: 18,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  hint: { fontSize: 12, color: theme.textMuted, textAlign: 'center', marginTop: 4 },
}); }
