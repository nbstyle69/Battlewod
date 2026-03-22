import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, TextInput, Image, KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { Newspaper, Heart, MessageCircle, Send, Trash2, ArrowLeft } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

interface Article {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  created_at: string;
  author_username: string;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
}

interface Comment {
  id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
}

export default function ArticlesScreen() {
  const { currentBox, user } = useAuth();
  const { theme } = useTheme();
  const S = styles(theme);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);

  // Detail view
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  const load = useCallback(async () => {
    if (!currentBox || !user) { setLoading(false); return; }

    const { data } = await supabase
      .from('box_articles')
      .select('id, title, body, image_url, created_at, author:profiles!author_id(username)')
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
      const { data: myLike } = await supabase
        .from('box_article_likes').select('article_id')
        .eq('article_id', a.id).eq('user_id', user.id).maybeSingle();

      enriched.push({
        ...a,
        author_username: (a as any).author?.username ?? '?',
        likes_count: lc ?? 0,
        comments_count: cc ?? 0,
        liked_by_me: !!myLike,
      });
    }

    setArticles(enriched);
    setLoading(false);
    setRefreshing(false);
  }, [currentBox, user]);

  useEffect(() => { load(); }, [load]);

  async function toggleLike(article: Article) {
    if (!user) return;
    if (article.liked_by_me) {
      await supabase.from('box_article_likes')
        .delete().eq('article_id', article.id).eq('user_id', user.id);
    } else {
      await supabase.from('box_article_likes')
        .insert({ article_id: article.id, user_id: user.id });
    }
    // Update local state immediately
    setArticles(prev => prev.map(a =>
      a.id === article.id
        ? { ...a, liked_by_me: !a.liked_by_me, likes_count: a.likes_count + (a.liked_by_me ? -1 : 1) }
        : a
    ));
    if (selectedArticle?.id === article.id) {
      setSelectedArticle(prev => prev ? {
        ...prev, liked_by_me: !prev.liked_by_me,
        likes_count: prev.likes_count + (prev.liked_by_me ? -1 : 1),
      } : null);
    }
  }

  async function openArticle(article: Article) {
    setSelectedArticle(article);
    setLoadingComments(true);
    const { data } = await supabase
      .from('box_article_comments')
      .select('id, user_id, content, created_at, profile:profiles!user_id(username)')
      .eq('article_id', article.id)
      .order('created_at', { ascending: true });

    setComments((data ?? []).map((c: any) => ({
      id: c.id,
      user_id: c.user_id,
      username: c.profile?.username ?? '?',
      content: c.content,
      created_at: c.created_at,
    })));
    setLoadingComments(false);
  }

  async function sendComment() {
    if (!commentText.trim() || !selectedArticle || !user) return;
    const { data, error } = await supabase
      .from('box_article_comments')
      .insert({
        article_id: selectedArticle.id,
        user_id: user.id,
        content: commentText.trim(),
      })
      .select('id, created_at')
      .single();

    if (!error && data) {
      setComments(prev => [...prev, {
        id: data.id,
        user_id: user.id,
        username: user.username ?? '?',
        content: commentText.trim(),
        created_at: data.created_at,
      }]);
      setCommentText('');
      // Update count
      setArticles(prev => prev.map(a =>
        a.id === selectedArticle.id ? { ...a, comments_count: a.comments_count + 1 } : a
      ));
      setSelectedArticle(prev => prev ? { ...prev, comments_count: prev.comments_count + 1 } : null);
    }
  }

  async function deleteComment(commentId: string) {
    await supabase.from('box_article_comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    if (selectedArticle) {
      setArticles(prev => prev.map(a =>
        a.id === selectedArticle.id ? { ...a, comments_count: a.comments_count - 1 } : a
      ));
      setSelectedArticle(prev => prev ? { ...prev, comments_count: prev.comments_count - 1 } : null);
    }
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  // ── Detail view ──
  if (selectedArticle) {
    return (
      <KeyboardAvoidingView style={S.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={S.header}>
          <TouchableOpacity onPress={() => { setSelectedArticle(null); setComments([]); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft color={theme.text} size={22} />
          </TouchableOpacity>
          <Text style={S.headerTitle} numberOfLines={1}>{selectedArticle.title}</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
          {selectedArticle.image_url && (
            <Image source={{ uri: selectedArticle.image_url }} style={S.detailImage} resizeMode="cover" />
          )}
          <View style={{ padding: 16, gap: 10 }}>
            <Text style={S.detailTitle}>{selectedArticle.title}</Text>
            <Text style={S.detailMeta}>
              Par {selectedArticle.author_username} · {new Date(selectedArticle.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
            {selectedArticle.body ? <Text style={S.detailBody}>{selectedArticle.body}</Text> : null}

            {/* Like button */}
            <TouchableOpacity
              style={[S.likeBtn, selectedArticle.liked_by_me && S.likeBtnActive]}
              onPress={() => toggleLike(selectedArticle)}
              activeOpacity={0.8}
            >
              <Heart
                color={selectedArticle.liked_by_me ? '#fff' : theme.accent}
                fill={selectedArticle.liked_by_me ? '#fff' : 'transparent'}
                size={16}
              />
              <Text style={[S.likeBtnText, selectedArticle.liked_by_me && { color: '#fff' }]}>
                {selectedArticle.likes_count} J'aime
              </Text>
            </TouchableOpacity>

            {/* Comments */}
            <Text style={S.commentsTitle}>Commentaires ({selectedArticle.comments_count})</Text>
            {loadingComments ? (
              <ActivityIndicator color={theme.accent} />
            ) : comments.length === 0 ? (
              <Text style={S.emptyText}>Aucun commentaire</Text>
            ) : comments.map(c => (
              <View key={c.id} style={S.commentCard}>
                <View style={{ flex: 1 }}>
                  <Text style={S.commentUser}>{c.username}</Text>
                  <Text style={S.commentContent}>{c.content}</Text>
                  <Text style={S.commentDate}>
                    {new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                {c.user_id === user?.id && (
                  <TouchableOpacity onPress={() => deleteComment(c.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Trash2 color={theme.warning} size={14} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Comment input */}
        <View style={S.commentInput}>
          <TextInput
            style={S.commentTextInput}
            placeholder="Écrire un commentaire..."
            placeholderTextColor={theme.textMuted}
            value={commentText}
            onChangeText={setCommentText}
          />
          <TouchableOpacity onPress={sendComment} disabled={!commentText.trim()} activeOpacity={0.8}>
            <Send color={commentText.trim() ? theme.accent : theme.textMuted} size={20} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── List view ──
  return (
    <View style={S.container}>
      <View style={S.header}>
        <Newspaper color={theme.accent} size={22} />
        <Text style={S.headerTitle}>Actualités</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {articles.length === 0 ? (
          <Text style={S.emptyText}>Aucune actualité pour le moment</Text>
        ) : articles.map(a => (
          <TouchableOpacity key={a.id} style={S.articleCard} onPress={() => openArticle(a)} activeOpacity={0.85}>
            {a.image_url && (
              <Image source={{ uri: a.image_url }} style={S.articleImage} resizeMode="cover" />
            )}
            <View style={S.articleContent}>
              <Text style={S.articleTitle}>{a.title}</Text>
              <Text style={S.articleAuthor}>Par {a.author_username}</Text>
              {a.body ? <Text style={S.articleBody} numberOfLines={2}>{a.body}</Text> : null}
              <View style={S.articleMeta}>
                <Text style={S.metaText}>
                  {new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </Text>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  onPress={(e) => { e.stopPropagation?.(); toggleLike(a); }}
                  activeOpacity={0.7}
                >
                  <Heart
                    color={a.liked_by_me ? theme.accent : theme.textMuted}
                    fill={a.liked_by_me ? theme.accent : 'transparent'}
                    size={14}
                  />
                  <Text style={[S.metaText, a.liked_by_me && { color: theme.accent }]}>{a.likes_count}</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MessageCircle color={theme.textMuted} size={14} />
                  <Text style={S.metaText}>{a.comments_count}</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
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
  emptyText: { textAlign: 'center', color: theme.textMuted, marginTop: 60, fontSize: 14 },
  articleCard: {
    marginHorizontal: 16, marginTop: 12, backgroundColor: theme.card,
    borderRadius: 14, borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
  },
  articleImage: { width: '100%', height: 180 },
  articleContent: { padding: 14, gap: 4 },
  articleTitle: { fontSize: 16, fontWeight: '800', color: theme.text },
  articleAuthor: { fontSize: 11, color: theme.textMuted, fontWeight: '600' },
  articleBody: { fontSize: 13, color: theme.textSecondary, lineHeight: 18, marginTop: 2 },
  articleMeta: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  metaText: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
  // Detail
  detailImage: { width: '100%', height: 220 },
  detailTitle: { fontSize: 22, fontWeight: '900', color: theme.text },
  detailMeta: { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
  detailBody: { fontSize: 14, color: theme.text, lineHeight: 22 },
  likeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: theme.accent,
  },
  likeBtnActive: { backgroundColor: theme.accent },
  likeBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },
  commentsTitle: { fontSize: 15, fontWeight: '800', color: theme.text, marginTop: 10 },
  commentCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: theme.surface, borderRadius: 10, padding: 10, marginTop: 6,
  },
  commentUser: { fontSize: 12, fontWeight: '800', color: theme.accent },
  commentContent: { fontSize: 13, color: theme.text, marginTop: 2 },
  commentDate: { fontSize: 10, color: theme.textMuted, marginTop: 3 },
  commentInput: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.card, borderTopWidth: 1, borderTopColor: theme.border,
    paddingHorizontal: 16, paddingVertical: 10, paddingBottom: 30,
  },
  commentTextInput: {
    flex: 1, backgroundColor: theme.surface, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: theme.text,
    borderWidth: 1, borderColor: theme.border,
  },
}); }
