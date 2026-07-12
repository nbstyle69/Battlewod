import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Alert, ActivityIndicator,
} from 'react-native';
import { ArrowLeft, Save, Building2, Camera, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

export default function BOBoxInfoScreen({ navigation }: any) {
  const { currentBox, refreshBox } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const S = createStyles(theme);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!currentBox) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('boxes')
          .select('name, address, website_url, contact_email, logo_url')
          .eq('id', currentBox.id)
          .single();
        if (data) {
          setName((data as any).name ?? '');
          setAddress((data as any).address ?? '');
          setWebsiteUrl((data as any).website_url ?? '');
          setContactEmail((data as any).contact_email ?? '');
          setLogoUrl((data as any).logo_url ?? null);
        }
      } catch (e) {
        captureError(e, { screen: 'BOBoxInfo', action: 'load' });
      }
      setLoading(false);
    })();
  }, [currentBox]);

  async function handlePickLogo() {
    if (!currentBox) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingLogo(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileName = `${currentBox.id}/logo.${ext}`;
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

      const { error: upErr } = await supabase.storage
        .from('box-logos')
        .upload(fileName, bytes, {
          contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
          upsert: true,
        });

      if (upErr) {
        Alert.alert(t('bo.boxInfo.uploadError'), upErr.message);
        setUploadingLogo(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('box-logos').getPublicUrl(fileName);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.from('boxes').update({ logo_url: publicUrl }).eq('id', currentBox.id);
      setLogoUrl(publicUrl);
      refreshBox?.();
    } catch (e: any) {
      captureError(e, { screen: 'BOBoxInfo', action: 'uploadLogo' });
      Alert.alert(t('common.error'), e?.message ?? t('bo.boxInfo.logoUploadError'));
    }
    setUploadingLogo(false);
  }

  async function handleDeleteLogo() {
    if (!currentBox) return;
    Alert.alert(t('bo.boxInfo.deleteLogoTitle'), t('bo.boxInfo.deleteLogoConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive', onPress: async () => {
          try {
            await supabase.from('boxes').update({ logo_url: null }).eq('id', currentBox.id);
            setLogoUrl(null);
            refreshBox?.();
          } catch (e) {
            captureError(e, { screen: 'BOBoxInfo', action: 'deleteLogo' });
          }
        },
      },
    ]);
  }

  async function handleSave() {
    if (!currentBox) return;
    if (!name.trim()) { Alert.alert(t('common.error'), t('bo.boxInfo.nameRequired')); return; }

    if (websiteUrl.trim() && !/^https?:\/\/.+/i.test(websiteUrl.trim())) {
      Alert.alert(t('bo.boxInfo.invalidUrlTitle'), t('bo.boxInfo.invalidUrlMsg'));
      return;
    }
    if (contactEmail.trim() && !contactEmail.trim().includes('@')) {
      Alert.alert(t('bo.boxInfo.invalidEmailTitle'), t('bo.boxInfo.invalidEmailMsg'));
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('boxes').update({
      name: name.trim(),
      address: address.trim() || null,
      website_url: websiteUrl.trim() || null,
      contact_email: contactEmail.trim() || null,
    } as any).eq('id', currentBox.id);
    setSaving(false);

    if (error) { Alert.alert(t('common.error'), error.message); return; }
    refreshBox?.();
    Alert.alert(t('bo.boxInfo.savedTitle'), t('bo.boxInfo.savedMsg'));
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>{t('bo.boxInfo.title')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={S.card}>
          <Text style={S.cardTitle}>{t('bo.boxInfo.logoTitle')}</Text>
          <Text style={S.cardDesc}>{t('bo.boxInfo.logoDesc')}</Text>
          <View style={S.logoRow}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={S.logoPreview} />
            ) : (
              <View style={[S.logoPreview, S.logoPlaceholder]}>
                <Building2 color={theme.textMuted} size={28} />
              </View>
            )}
            <View style={S.logoActions}>
              <TouchableOpacity style={S.logoBtn} onPress={handlePickLogo} disabled={uploadingLogo} activeOpacity={0.8}>
                {uploadingLogo ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : (
                  <>
                    <Camera color={theme.accent} size={14} />
                    <Text style={S.logoBtnTxt}>{t('bo.boxInfo.change')}</Text>
                  </>
                )}
              </TouchableOpacity>
              {logoUrl ? (
                <TouchableOpacity style={[S.logoBtn, S.logoBtnDanger]} onPress={handleDeleteLogo} activeOpacity={0.8}>
                  <Trash2 color={theme.error} size={14} />
                  <Text style={[S.logoBtnTxt, { color: theme.error }]}>{t('common.delete')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        {/* Fields */}
        <View style={S.card}>
          <Text style={S.cardTitle}>{t('bo.boxInfo.generalInfo')}</Text>

          <View style={S.field}>
            <Text style={S.label}>{t('bo.boxInfo.nameLabel')}</Text>
            <TextInput
              style={S.input}
              value={name}
              onChangeText={setName}
              placeholder={t('bo.boxInfo.namePlaceholder')}
              placeholderTextColor={theme.textMuted}
            />
          </View>

          <View style={S.field}>
            <Text style={S.label}>{t('bo.boxInfo.addressLabel')}</Text>
            <TextInput
              style={S.input}
              value={address}
              onChangeText={setAddress}
              placeholder={t('bo.boxInfo.addressPlaceholder')}
              placeholderTextColor={theme.textMuted}
            />
          </View>

          <View style={S.field}>
            <Text style={S.label}>{t('bo.boxInfo.websiteLabel')}</Text>
            <TextInput
              style={S.input}
              value={websiteUrl}
              onChangeText={setWebsiteUrl}
              placeholder="https://www.mabox.fr"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          <View style={S.field}>
            <Text style={S.label}>{t('bo.boxInfo.emailLabel')}</Text>
            <TextInput
              style={S.input}
              value={contactEmail}
              onChangeText={setContactEmail}
              placeholder="contact@mabox.fr"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[S.saveBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Save color="#fff" size={16} />
          <Text style={S.saveBtnText}>{saving ? t('bo.boxInfo.saving') : t('common.save')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: t.text },
  content: { padding: 20, gap: 20, paddingBottom: 140 },
  card: {
    backgroundColor: t.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: t.border, gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: t.text },
  cardDesc: { fontSize: 12, color: t.textMuted, lineHeight: 18 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  logoPreview: { width: 64, height: 64, borderRadius: 16, backgroundColor: t.surface },
  logoPlaceholder: { justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: t.border, borderStyle: 'dashed' },
  logoActions: { gap: 8 },
  logoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${t.accent}12`, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  logoBtnDanger: { backgroundColor: `${t.error}12` },
  logoBtnTxt: { fontSize: 12, fontWeight: '700', color: t.accent },
  field: { gap: 6 },
  label: { fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 1 },
  input: {
    backgroundColor: t.surface, borderRadius: 10, borderWidth: 1, borderColor: t.border,
    padding: 12, fontSize: 14, fontWeight: '600', color: t.text,
  },
  saveBtn: {
    backgroundColor: t.accent, borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
}); }
