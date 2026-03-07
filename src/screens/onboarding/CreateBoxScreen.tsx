import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { ChevronLeft, Building2, Sparkles } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../theme/colors';

export default function CreateBoxScreen({ navigation }: any) {
  const { createBox } = useAuth();
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <ChevronLeft color={Colors.textSecondary} size={22} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWrap}>
          <Building2 color={Colors.primary} size={32} />
        </View>
        <Text style={styles.title}>Créer ma box</Text>
        <Text style={styles.subtitle}>
          Un code d'invitation de 6 caractères sera généré automatiquement pour tes adhérents.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Nom de la box *</Text>
          <TextInput
            style={styles.input}
            placeholder="CrossFit Atlas, Box Forge…"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description (optionnel)</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Présente ta box en quelques mots…"
            placeholderTextColor={Colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, !name.trim() && styles.btnDisabled]}
          onPress={handleCreate}
          disabled={loading || !name.trim()}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Sparkles color="#fff" size={18} />
                <Text style={styles.btnText}>Créer la box</Text>
              </>
            )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  back: { paddingTop: 56, paddingLeft: 20, paddingBottom: 8 },
  inner: { paddingHorizontal: 28, paddingBottom: 48, gap: 20, paddingTop: 12 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: `${Colors.primary}10`,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 4,
  },
  title:    { fontSize: 26, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8 },
  input: {
    backgroundColor: Colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: Colors.text,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primary, borderRadius: 16, padding: 18, marginTop: 8,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
