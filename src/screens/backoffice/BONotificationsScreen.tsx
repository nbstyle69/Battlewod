import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Bell, Send, Users, User, Clock, CheckCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';

interface Member { user_id: string; username: string }
interface SentNotif { id: string; title: string; body: string; target: string; created_at: string }

export default function BONotificationsScreen() {
  const { currentBox } = useAuth();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
  const S = styles(theme);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [history, setHistory] = useState<SentNotif[]>([]);

  // Form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | string>('all'); // 'all' or user_id

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    try {
    const [{ data: mbrs }, { data: notifs }] = await Promise.all([
      supabase.from('box_members')
        .select('member_id, profiles(username)')
        .eq('box_id', currentBox.id).eq('status', 'active'),
      supabase.from('box_notifications')
        .select('*')
        .eq('box_id', currentBox.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    setMembers((mbrs ?? []).map((m: any) => ({
      user_id: m.member_id,
      username: m.profiles?.username ?? '?',
    })));
    setHistory(notifs ?? []);
    } catch (e) { captureError(e, { screen: 'BONotifications', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox]);

  useEffect(() => { load(); }, [load]);

  async function handleSend() {
    if (!title.trim()) { Alert.alert(t('common.error'), t('bo.notifications.titleRequired')); return; }
    if (!currentBox) return;

    setSending(true);
    const { data: inserted, error } = await supabase.from('box_notifications').insert({
      box_id: currentBox.id,
      title: title.trim(),
      body: body.trim(),
      target: target === 'all' ? 'all' : target,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select('id').single();

    if (error || !inserted) {
      captureError(error, { screen: 'BONotifications', action: 'send' });
      Alert.alert(t('common.error'), error?.message ?? t('bo.notifications.saveFailed'));
      setSending(false);
      return;
    }

    // Deliver as a real push (service-role Edge Function reads member tokens).
    const { data: pushRes, error: pushErr } = await supabase.functions.invoke('send-box-notification', {
      body: { notification_id: inserted.id },
    });
    if (pushErr) {
      captureError(pushErr, { screen: 'BONotifications', action: 'push' });
      Alert.alert(t('bo.notifications.savedTitle'), t('bo.notifications.pushFailed'));
    } else {
      const recipients = pushRes?.sent ?? 0;
      Alert.alert(t('bo.notifications.sentTitle'), t('bo.notifications.sentMsg', { count: recipients }));
    }
    setTitle('');
    setBody('');
    setTarget('all');
    load();
    setSending(false);
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
        <Bell color={theme.accent} size={22} />
        <Text style={S.headerTitle}>{t('bo.notifications.title')}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* Compose */}
          <View style={S.composeCard}>
            <Text style={S.composeTitle}>{t('bo.notifications.compose')}</Text>

            {/* Target selector */}
            <Text style={S.label}>{t('bo.notifications.recipient')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[S.targetPill, target === 'all' && S.targetPillActive]}
                  onPress={() => setTarget('all')}
                  activeOpacity={0.8}
                >
                  <Users color={target === 'all' ? theme.onAccent : theme.textMuted} size={14} />
                  <Text style={[S.targetPillText, target === 'all' && S.targetPillTextActive]}>
                    {t('bo.notifications.allCount', { count: members.length })}
                  </Text>
                </TouchableOpacity>
                {members.map(m => (
                  <TouchableOpacity
                    key={m.user_id}
                    style={[S.targetPill, target === m.user_id && S.targetPillActive]}
                    onPress={() => setTarget(m.user_id)}
                    activeOpacity={0.8}
                  >
                    <User color={target === m.user_id ? theme.onAccent : theme.textMuted} size={14} />
                    <Text style={[S.targetPillText, target === m.user_id && S.targetPillTextActive]}>
                      {m.username}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Title */}
            <Text style={S.label}>{t('bo.notifications.labelTitle')}</Text>
            <TextInput
              style={S.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t('bo.notifications.titlePlaceholder')}
              placeholderTextColor={theme.textMuted}
              maxLength={80}
            />

            {/* Body */}
            <Text style={S.label}>{t('bo.notifications.labelBody')}</Text>
            <TextInput
              style={[S.input, { height: 80, textAlignVertical: 'top' }]}
              value={body}
              onChangeText={setBody}
              placeholder={t('bo.notifications.bodyPlaceholder')}
              placeholderTextColor={theme.textMuted}
              multiline
              maxLength={300}
            />

            <TouchableOpacity
              style={[S.sendBtn, (!title.trim() || sending) && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={!title.trim() || sending}
              activeOpacity={0.8}
            >
              <Send color={theme.onAccent} size={16} />
              <Text style={S.sendBtnText}>{sending ? t('bo.notifications.sending') : t('bo.notifications.send')}</Text>
            </TouchableOpacity>
          </View>

          {/* History */}
          <View style={S.section}>
            <Text style={S.sectionTitle}>{t('bo.notifications.history')}</Text>
            {history.length === 0 ? (
              <View style={S.emptyCard}>
                <Bell color={theme.textMuted} size={28} />
                <Text style={S.emptyText}>{t('bo.notifications.empty')}</Text>
              </View>
            ) : (
              <View style={S.listCard}>
                {history.map((n, i) => (
                  <View key={n.id} style={[S.historyRow, i < history.length - 1 && S.historyRowBorder]}>
                    <View style={S.historyIcon}>
                      <CheckCircle color={theme.success} size={14} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.historyTitle}>{n.title}</Text>
                      {!!n.body && <Text style={S.historyBody} numberOfLines={2}>{n.body}</Text>}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Clock color={theme.textMuted} size={10} />
                        <Text style={S.historyDate}>
                          {new Date(n.created_at).toLocaleDateString(dateLocale, {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </Text>
                        <Text style={S.historyTarget}>
                          → {n.target === 'all' ? t('bo.notifications.targetAll') : t('bo.notifications.targetIndividual')}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 20, fontWeight: '900', color: theme.text },
  composeCard: {
    margin: 16, backgroundColor: theme.card, borderRadius: 16,
    padding: 18, borderWidth: 1, borderColor: theme.border,
  },
  composeTitle: { fontSize: 15, fontWeight: '900', color: theme.text, marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '700', color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  targetPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  targetPillActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  targetPillText: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
  targetPillTextActive: { color: theme.onAccent },
  input: {
    backgroundColor: theme.surface, borderRadius: 12, padding: 14,
    fontSize: 14, color: theme.text, marginBottom: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.accent, borderRadius: 12, padding: 14,
  },
  sendBtnText: { fontSize: 14, fontWeight: '800', color: theme.onAccent },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: theme.text, marginBottom: 10 },
  listCard: {
    backgroundColor: theme.card, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
  },
  emptyCard: {
    backgroundColor: theme.card, borderRadius: 14, padding: 30,
    borderWidth: 1, borderColor: theme.border, alignItems: 'center', gap: 10,
  },
  emptyText: { fontSize: 13, color: theme.textMuted },
  historyRow: { flexDirection: 'row', padding: 12, gap: 10 },
  historyRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.border },
  historyIcon: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: `${theme.success}15`,
    justifyContent: 'center', alignItems: 'center',
  },
  historyTitle: { fontSize: 13, fontWeight: '800', color: theme.text },
  historyBody: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  historyDate: { fontSize: 10, color: theme.textMuted },
  historyTarget: { fontSize: 10, fontWeight: '700', color: theme.accentText },
}); }
