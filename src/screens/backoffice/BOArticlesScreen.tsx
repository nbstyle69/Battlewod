import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, TextInput, Alert, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Newspaper, Plus, Trash2, X, Image as ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

interface Article {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
}

export default function BOArticlesScreen() {
  const { currentBox, user } = useAuth();
  const { theme } = useTheme();
  const S = styles(theme);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }

    const { data } = await supabase
      .from('box_articles')
      .select('id, title, body, image_url, created_at')
      .eq('box_id', currentBox.id)
      .order('created_at', { ascending: false });

    const enriched: Article[] = [];
    for (const a of (data ?? [])) {
      const { count: lc } = await supabase
        .from('box_article_likes').select('*', { count: 'exact', head: true })
        .eq('article_id', a.id);
      const { count: cc } = await supabase
        .from('box_article_comments').select('*', { count: 'exact', head: true })
        .eq('article_id', a.id);
      enriched.push({ ...a, likes_count: lc ?? 0, comments_count: cc ?? 0 });
    }

    setArticles(enriched);
    setLoading(false);
    setRefreshing(false);
  }, [currentBox]);

  useEffect(() => { load(); }, [load]);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function uploadImage(uri: string): Promise<string | null> {
    try {
      const ext = uri.split('.').pop() ?? 'jpg';
      const fileName = `articles/${currentBox!.id}/${Date.now()}.${ext}`;
      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const { error } = await supabase.storage
        .from('box-assets')
        .upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: true });
      if (error) return null;
      const { data } = supabase.storage.from('box-assets').getPublicUrl(fileName);
      return data.publicUrl;
    } catch { return null; }
  }

  async function handlePublish() {
    if (!title.trim()) { Alert.alert('Erreur', 'Le titre est obligatoire.'); return; }
    if (!currentBox || !user) return;
    setSaving(true);

    let finalImageUrl: string | null = null;
    if (imageUri) {
      finalImageUrl = await uploadImage(imageUri);
    }

    const { error } = await supabase.from('box_articles').insert({
      box_id: currentBox.id,
      author_id: user.id,
      title: title.trim(),
      body: body.trim(),
      image_url: finalImageUrl,
    });

    setSaving(false);
    if (error) { Alert.alert('Erreur', error.message); return; }

    setTitle('');
    setBody('');
    setImageUri(null);
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    Alert.alert('Supprimer', 'Supprimer cet article ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await supabase.from('box_articles').delete().eq('id', id);
          load();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={S.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={S.header}>
        <Newspaper color={theme.accent} size={22} />
        <Text style={S.headerTitle}>Actualités</Text>
        <TouchableOpacity
          style={S.addBtn}
          onPress={() => setShowForm(!showForm)}
          activeOpacity={0.8}
        >
          {showForm ? <X color={theme.text} size={18} /> : <Plus color={theme.card} size={18} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* New article form */}
        {showForm && (
          <View style={S.formCard}>
            <TextInput
              style={S.input}
              placeholder="Titre de l'article"
              placeholderTextColor={theme.textMuted}
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[S.input, { height: 100, textAlignVertical: 'top' }]}
              placeholder="Contenu (optionnel)"
              placeholderTextColor={theme.textMuted}
              value={body}
              onChangeText={setBody}
              multiline
            />
            <TouchableOpacity style={S.imageBtn} onPress={pickImage} activeOpacity={0.8}>
              <ImageIcon color={theme.accent} size={16} />
              <Text style={S.imageBtnText}>{imageUri ? 'Image sélectionnée ✓' : 'Ajouter une image'}</Text>
            </TouchableOpacity>
            {imageUri && (
              <Image source={{ uri: imageUri }} style={S.previewImage} resizeMode="cover" />
            )}
            <TouchableOpacity
              style={[S.publishBtn, saving && { opacity: 0.5 }]}
              onPress={handlePublish}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={S.publishBtnText}>{saving ? 'Publication...' : 'Publier'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Articles list */}
        {articles.length === 0 ? (
          <Text style={S.emptyText}>Aucun article pour le moment</Text>
        ) : articles.map(a => (
          <View key={a.id} style={S.articleCard}>
            {a.image_url && (
              <Image source={{ uri: a.image_url }} style={S.articleImage} resizeMode="cover" />
            )}
            <View style={S.articleContent}>
              <Text style={S.articleTitle}>{a.title}</Text>
              {a.body ? <Text style={S.articleBody} numberOfLines={3}>{a.body}</Text> : null}
              <View style={S.articleMeta}>
                <Text style={S.metaText}>
                  {new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </Text>
                <Text style={S.metaText}>❤️ {a.likes_count}</Text>
                <Text style={S.metaText}>💬 {a.comments_count}</Text>
                <TouchableOpacity onPress={() => handleDelete(a.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Trash2 color={theme.warning} size={16} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function styles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: theme.text, flex: 1 },
  addBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: theme.accent,
    justifyContent: 'center', alignItems: 'center',
  },
  formCard: {
    margin: 16, backgroundColor: theme.card, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border, padding: 16, gap: 12,
  },
  input: {
    backgroundColor: theme.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: theme.text, borderWidth: 1, borderColor: theme.border,
  },
  imageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10,
    borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  imageBtnText: { fontSize: 13, color: theme.accent, fontWeight: '600' },
  previewImage: { width: '100%', height: 160, borderRadius: 10 },
  publishBtn: {
    backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  publishBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  emptyText: { textAlign: 'center', color: theme.textMuted, marginTop: 60, fontSize: 14 },
  articleCard: {
    marginHorizontal: 16, marginTop: 12, backgroundColor: theme.card,
    borderRadius: 14, borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
  },
  articleImage: { width: '100%', height: 180 },
  articleContent: { padding: 14, gap: 6 },
  articleTitle: { fontSize: 16, fontWeight: '800', color: theme.text },
  articleBody: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
  articleMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  metaText: { fontSize: 11, color: theme.textMuted, fontWeight: '600' },
}); }
