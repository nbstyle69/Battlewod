import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { ChevronLeft, Building2, Sparkles } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import GlassBackground from '../../components/glass/GlassBackground';

export default function CreateBoxScreen({ navigation }: any) {
  const { createBox } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [name, setName]           = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading]     = useState(false);

  async function handleCreate() {
    if (!name.trim()) { Alert.alert('Nom requis'); return; }
    setLoading(true);
    const { error, box } = await createBox(name.trim(), description.trim() || undefined);
    setLoading(false);
    if (error) Alert.alert('Erreur', error);
    // currentBox is set in AuthContext → AppNavigator redirects to back-office
  }

  return (
    <View style={S.container}>
    <GlassBackground />
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
        <ChevronLeft color={theme.textSecondary} size={22} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={S.inner} keyboardShouldPersistTaps="handled">
        <View style={S.iconWrap}>
          <Building2 color={theme.accent} size={32} />
        </View>
        <Text style={S.title}>Créer ma box</Text>
        <Text style={S.subtitle}>
          Un code d'invitation de 6 caractères sera généré automatiquement pour tes adhérents.
        </Text>

        <View style={S.field}>
          <Text style={S.label}>Nom de la box *</Text>
          <TextInput
            style={S.input}
            placeholder="CrossFit Atlas, Box Forge…"
            placeholderTextColor={theme.textMuted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={S.field}>
          <Text style={S.label}>Description (optionnel)</Text>
          <TextInput
            style={[S.input, S.textarea]}
            placeholder="Présente ta box en quelques mots…"
            placeholderTextColor={theme.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity
          style={[S.btn, !name.trim() && S.btnDisabled]}
          onPress={handleCreate}
          disabled={loading || !name.trim()}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Sparkles color="#fff" size={18} />
                <Text style={S.btnText}>Créer la box</Text>
              </>
            )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  back: { paddingTop: 56, paddingLeft: 20, paddingBottom: 8 },
  inner: { paddingHorizontal: 28, paddingBottom: 48, gap: 20, paddingTop: 12 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: `${theme.accent}10`,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 4,
  },
  title:    { fontSize: 26, fontWeight: '900', color: theme.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: '800', color: theme.textMuted, letterSpacing: 0.8 },
  input: {
    backgroundColor: theme.card, borderRadius: 12,
    borderWidth: 1, borderColor: theme.border,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: theme.text,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: theme.accent, borderRadius: 16, padding: 18, marginTop: 8,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
}); }
