import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Share,
} from 'react-native';
import { ChevronLeft, UserPlus, Check, Clock, Trophy, Zap, TrendingUp, Share2 } from 'lucide-react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/colors';
import { HomeStackParamList } from '../../navigation';
import UserAvatar from '../../components/UserAvatar';

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'PublicProfile'>;
  route: RouteProp<HomeStackParamList, 'PublicProfile'>;
};

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

interface PublicUser {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  level: string;
  elo: number;
  wins: number;
  total_matches: number;
  bio?: string;
}

export default function PublicProfileScreen({ navigation, route }: Props) {
  const { userId } = route.params;
  const { user: me } = useAuth();
  const { theme } = useTheme();
  const S = createStyles(theme);
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadProfile();
    loadFriendStatus();
  }, [userId]);

  async function loadProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, level, elo, wins, total_matches, bio')
      .eq('id', userId)
      .single();
    setProfile(data as PublicUser);
    setLoading(false);
  }

  async function loadFriendStatus() {
    if (!me) return;
    const { data } = await supabase
      .from('friendships')
      .select('status, requester_id')
      .or(`and(requester_id.eq.${me.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${me.id})`)
      .maybeSingle();
    if (!data) { setFriendStatus('none'); return; }
    if (data.status === 'accepted') { setFriendStatus('friends'); return; }
    if (data.requester_id === me.id) setFriendStatus('pending_sent');
    else setFriendStatus('pending_received');
  }

  async function handleAddFriend() {
    if (!me) return;
    setActionLoading(true);
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: me.id, addressee_id: userId, status: 'pending' });
    setActionLoading(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setFriendStatus('pending_sent');
  }

  async function handleAcceptFriend() {
    if (!me) return;
    setActionLoading(true);
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('requester_id', userId)
      .eq('addressee_id', me.id);
    setActionLoading(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setFriendStatus('friends');
  }

  if (loading) return (
    <View style={S.loadingContainer}>
      <ActivityIndicator color={theme.accent} size="large" />
    </View>
  );

  if (!profile) return (
    <View style={S.loadingContainer}>
      <Text style={S.notFound}>Profil introuvable</Text>
    </View>
  );

  const level = profile.level ?? 'scaled';
  const levelColor = LevelColors[level] ?? theme.accent;
  const winRate = profile.total_matches ? Math.round((profile.wins / profile.total_matches) * 100) : 0;

  function FriendButton() {
    if (me?.id === userId) return null;
    if (friendStatus === 'friends') return (
      <View style={S.friendsBadge}>
        <Check color={theme.success} size={14} />
        <Text style={S.friendsBadgeText}>Amis</Text>
      </View>
    );
    if (friendStatus === 'pending_sent') return (
      <View style={S.pendingBadge}>
        <Clock color={theme.textMuted} size={14} />
        <Text style={S.pendingBadgeText}>Demande envoyée</Text>
      </View>
    );
    if (friendStatus === 'pending_received') return (
      <TouchableOpacity style={S.acceptBtn} onPress={handleAcceptFriend} disabled={actionLoading}>
        {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
          <><Check color="#fff" size={16} /><Text style={S.acceptBtnText}>Accepter</Text></>
        )}
      </TouchableOpacity>
    );
    return (
      <TouchableOpacity style={S.addFriendBtn} onPress={handleAddFriend} disabled={actionLoading}>
        {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
          <><UserPlus color="#fff" size={16} /><Text style={S.addFriendBtnText}>Demander en ami</Text></>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ChevronLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Profil</Text>
        <TouchableOpacity onPress={() => Share.share({ message: `Découvre mon profil sur AthleX ! athlex://profile/${route.params.userId}` })} style={S.backBtn}>
          <Share2 color={theme.text} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}>
        {/* Avatar + name */}
        <View style={S.heroCard}>
          <UserAvatar
            uri={profile.avatar_url}
            name={profile.username ?? '?'}
            size={80}
            borderRadius={40}
            borderWidth={3}
            borderColor={levelColor}
            backgroundColor={theme.surface}
            textColor={theme.text}
            fontSize={32}
          />
          <Text style={S.username}>{profile.username}</Text>
          {profile.full_name ? <Text style={S.fullName}>{profile.full_name}</Text> : null}
          <View style={[S.levelPill, { backgroundColor: `${levelColor}20` }]}>
            <View style={[S.levelDot, { backgroundColor: levelColor }]} />
            <Text style={[S.levelText, { color: levelColor }]}>{level.toUpperCase()}</Text>
          </View>
          {profile.bio ? <Text style={S.bio}>{profile.bio}</Text> : null}
          <FriendButton />
        </View>

        {/* Stats */}
        <View style={S.statsRow}>
          {[
            { icon: Zap, color: theme.accent, value: profile.elo, label: 'ELO' },
            { icon: Trophy, color: theme.gold, value: profile.wins, label: 'Victoires' },
            { icon: TrendingUp, color: theme.success, value: `${winRate}%`, label: 'Win Rate' },
          ].map(({ icon: Icon, color, value, label }) => (
            <View key={label} style={S.statCard}>
              <Icon color={color} size={16} />
              <Text style={S.statValue}>{value}</Text>
              <Text style={S.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background },
  notFound: { fontSize: 15, color: theme.textMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 56,
    paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '900', color: theme.text },
  content: { padding: 16, gap: 14 },
  heroCard: {
    backgroundColor: theme.card, borderRadius: 18,
    borderWidth: 1, borderColor: theme.border,
    padding: 24, alignItems: 'center', gap: 8,
  },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: theme.surface, borderWidth: 3,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarLetter: { fontSize: 32, fontWeight: '900', color: theme.text },
  username: { fontSize: 22, fontWeight: '900', color: theme.text },
  fullName: { fontSize: 14, color: theme.textMuted },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  bio: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 18, maxWidth: 240 },
  addFriendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4,
  },
  addFriendBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.success, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4,
  },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  friendsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${theme.success}15`, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: `${theme.success}40`, marginTop: 4,
  },
  friendsBadgeText: { color: theme.success, fontSize: 13, fontWeight: '700' },
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: theme.border, marginTop: 4,
  },
  pendingBadgeText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: theme.card, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border,
    paddingVertical: 14, alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 18, fontWeight: '900', color: theme.text },
  statLabel: { fontSize: 10, color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' },
}); }
