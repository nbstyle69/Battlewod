import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Platform, Dimensions,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, FileText, Plus, Trash2, X, Eye } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { resolveStorageUrl, storagePathFromValue } from '../../lib/storageUrl';
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
  const [openingId, setOpeningId] = useState<string | null>(null);

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
      // Chemin INCHANGÉ : <uid>/<ts>.pdf. La reco a montré que le 1er dossier
      // vaut l'owner sur 100% des objets existants → la policy storage peut
      // exiger `foldername[1] = auth.uid()` à l'écriture sans reprise de
      // données, et la lecture est autorisée via la ligne box_documents
      // correspondante (portée box) plutôt que via le chemin.
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

      const title = file.name.replace(/\.pdf$/i, '');

      // On continue de stocker l'URL au format « public » — PAS par nostalgie,
      // mais pour la COEXISTENCE DE VERSIONS. Tant que les buckets sont publics,
      // les téléphones restés sur l'ancienne app doivent pouvoir ouvrir un
      // document importé depuis la nouvelle : eux lisent `file_url` comme une
      // URL, ils ne savent pas signer. Un chemin nu leur serait illisible.
      // Le résolveur accepte les deux formes, donc rien ne nous empêchera de
      // passer aux chemins nus plus tard, une fois le parc à jour.
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName);

      await supabase.from('box_documents').insert({
        box_id: currentBox?.id ?? null,
        uploaded_by: user!.id,
        title,
        file_url: urlData.publicUrl,
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
          // Delete from storage (accepte URL publique historique OU chemin nu).
          const path = storagePathFromValue(doc.file_url, 'documents');
          if (path) {
            await supabase.storage.from('documents').remove([path]);
          }
          await supabase.from('box_documents').delete().eq('id', doc.id);
          setDocs(prev => prev.filter(d => d.id !== doc.id));
        },
      },
    ]);
  }

  // Lecture d'un PDF sur bucket PRIVÉ (Lot 1C-c).
  // Avant : on passait l'URL publique à Google Docs Viewer — le document était
  // lisible par quiconque avait l'URL, et transitait par un tiers. Maintenant :
  // URL signée courte → téléchargement dans le cache de l'app → ouverture avec
  // le lecteur du téléphone. Aucun tiers, aucun jeton envoyé ailleurs.
  async function openPdf(doc: DocRow) {
    if (openingId) return;
    setOpeningId(doc.id);
    try {
      const url = await resolveStorageUrl(doc.file_url, 'documents', { expiresIn: 300 });
      if (!url) {
        Alert.alert('Erreur', 'Document introuvable.');
        return;
      }

      const dir = `${FileSystem.cacheDirectory}athlex-docs/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const target = `${dir}${doc.id}.pdf`;
      const res = await FileSystem.downloadAsync(url, target);
      if (res.status !== 200) throw new Error(`Téléchargement HTTP ${res.status}`);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: doc.title,
        });
      } else {
        // Repli (web / environnement sans feuille de partage) : URL signée directe.
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (e: any) {
      captureError(e, { screen: 'Documents', action: 'openPdf' });
      Alert.alert('Erreur', "Impossible d'ouvrir le document.");
    } finally {
      setOpeningId(null);
    }
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
          contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
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
                  <TouchableOpacity
                    onPress={() => openPdf(doc)}
                    disabled={openingId !== null}
                    style={S.docActionBtn}
                  >
                    {openingId === doc.id
                      ? <ActivityIndicator size="small" color={theme.accent} />
                      : <Eye color={theme.accent} size={18} />}
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
