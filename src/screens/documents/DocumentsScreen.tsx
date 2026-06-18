import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Platform, Dimensions,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, FileText, Plus, Trash2, X, Eye } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import GlassBackground from '../../components/glass/GlassBackground';

const SCREEN_W = Dimensions.get('window').width;

interface DocRow {
  id: string;
  box_id: string | null;
  uploaded_by: string;
  title: string;
  file_url: string;
  file_size: number;
  created_at: string;
  uploader?: { username: string } | null;
}

export default function DocumentsScreen() {
  const { user, currentBox } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation();
  const S = createStyles(theme);

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('box_documents')
      .select('id, box_id, uploaded_by, title, file_url, file_size, created_at, uploader:profiles!box_documents_uploaded_by_fkey(username)')
      .order('created_at', { ascending: false });

    if (currentBox) {
      query = query.or(`box_id.eq.${currentBox.id},and(box_id.is.null,uploaded_by.eq.${user.id})`);
    } else {
      query = query.is('box_id', null).eq('uploaded_by', user.id);
    }

    const { data } = await query;
    setDocs((data ?? []).map((d: any) => ({ ...d, uploader: Array.isArray(d.uploader) ? d.uploader[0] : d.uploader })) as DocRow[]);
    setLoading(false);
    setRefreshing(false);
  }, [user, currentBox]);

  useEffect(() => { load(); }, [load]);

  async function pickAndUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      if (!file.uri || !file.name) return;

      setUploading(true);

      const ext = file.name.split('.').pop() ?? 'pdf';
      const fileName = `${user!.id}/${Date.now()}.${ext}`;

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, bytes, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        Alert.alert('Erreur', uploadError.message);
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      const title = file.name.replace(/\.pdf$/i, '');

      await supabase.from('box_documents').insert({
        box_id: currentBox?.id ?? null,
        uploaded_by: user!.id,
        title,
        file_url: publicUrl,
        file_size: file.size ?? 0,
      });

      setUploading(false);
      load();
    } catch (e: any) {
      captureError(e, { screen: 'Documents', action: 'uploadDocument' });
      Alert.alert('Erreur', e.message ?? 'Erreur inconnue');
      setUploading(false);
    }
  }

  async function deleteDoc(doc: DocRow) {
    Alert.alert('Supprimer', `Supprimer "${doc.title}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          // Delete from storage
          const path = doc.file_url.split('/documents/')[1];
          if (path) {
            await supabase.storage.from('documents').remove([decodeURIComponent(path)]);
          }
          await supabase.from('box_documents').delete().eq('id', doc.id);
          setDocs(prev => prev.filter(d => d.id !== doc.id));
        },
      },
    ]);
  }

  async function openPdf(doc: DocRow) {
    const googleViewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(doc.file_url)}`;
    await WebBrowser.openBrowserAsync(googleViewerUrl);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <View style={S.container}>
      <GlassBackground />
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ArrowLeft color={theme.text} size={20} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>Documents</Text>
          <Text style={S.headerSub}>{docs.length} fichier(s)</Text>
        </View>
        <TouchableOpacity onPress={pickAndUpload} disabled={uploading} style={S.addBtn} activeOpacity={0.8}>
          {uploading
            ? <ActivityIndicator color="#fff" size="small" />
            : <><Plus color="#fff" size={16} /><Text style={S.addBtnText}>Importer</Text></>
          }
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={S.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={d => d.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item: doc }) => {
            const isMe = doc.uploaded_by === user?.id;
            const uploaderName = (doc.uploader as any)?.username ?? 'Inconnu';
            return (
              <View style={S.docCard}>
                <View style={S.docIcon}>
                  <FileText color={theme.accent} size={22} />
                </View>
                <View style={S.docInfo}>
                  <Text style={S.docTitle} numberOfLines={1}>{doc.title}</Text>
                  <Text style={S.docMeta}>
                    {uploaderName} · {formatSize(doc.file_size)} · {formatDate(doc.created_at)}
                  </Text>
                </View>
                <View style={S.docActions}>
                  <TouchableOpacity onPress={() => openPdf(doc)} style={S.docActionBtn}>
                    <Eye color={theme.accent} size={18} />
                  </TouchableOpacity>
                  {isMe && (
                    <TouchableOpacity onPress={() => deleteDoc(doc)} style={S.docActionBtn}>
                      <Trash2 color="#EF4444" size={16} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={S.empty}>
              <FileText color={theme.textMuted} size={48} />
              <Text style={S.emptyTitle}>Aucun document</Text>
              <Text style={S.emptyText}>Importez vos PDFs pour les consulter à tout moment.</Text>
              <TouchableOpacity onPress={pickAndUpload} disabled={uploading} style={S.emptyBtn} activeOpacity={0.8}>
                <Plus color="#fff" size={16} />
                <Text style={S.emptyBtnText}>Importer un PDF</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const isDark = theme.mode === 'dark';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: {
      paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14,
      backgroundColor: theme.card,
      borderBottomWidth: isDark ? 1 : 0, borderBottomColor: theme.border,
      flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
    headerSub: { fontSize: 12, color: theme.textMuted, marginTop: 1 },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: theme.accent, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 10,
    },
    addBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    docCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: theme.card,
      borderWidth: 1, borderColor: theme.border,
      borderRadius: 16, padding: 14, marginBottom: 10,
    },
    docIcon: {
      width: 44, height: 44, borderRadius: 12,
      backgroundColor: `${theme.accent}15`,
      justifyContent: 'center', alignItems: 'center',
    },
    docInfo: { flex: 1 },
    docTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    docMeta: { fontSize: 11, color: theme.textMuted, marginTop: 3 },
    docActions: { flexDirection: 'row', gap: 8 },
    docActionBtn: { padding: 6 },
    empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: theme.text },
    emptyText: { fontSize: 13, color: theme.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 40 },
    emptyBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: theme.accent, borderRadius: 14,
      paddingHorizontal: 18, paddingVertical: 12, marginTop: 8,
    },
    emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  });
}
