import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { ChevronLeft, UserPlus, Check, Clock, Trophy, Zap, TrendingUp } from 'lucide-react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, LevelColors } from '../../theme/colors';
import { HomeStackParamList } from '../../navigation';

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
    <View style={styles.loadingContainer}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>
  );

  if (!profile) return (
    <View style={styles.loadingContainer}>
      <Text style={styles.notFound}>Profil introuvable</Text>
    </View>
  );

  const level = profile.level ?? 'scaled';
  const levelColor = LevelColors[level] ?? Colors.primary;
  const winRate = profile.total_matches ? Math.round((profile.wins / profile.total_matches) * 100) : 0;

  function FriendButton() {
    if (me?.id === userId) return null;
    if (friendStatus === 'friends') return (
      <View style={styles.friendsBadge}>
        <Check color={Colors.success} size={14} />
        <Text style={styles.friendsBadgeText}>Amis</Text>
      </View>
    );
    if (friendStatus === 'pending_sent') return (
      <View style={styles.pendingBadge}>
        <Clock color={Colors.textMuted} size={14} />
        <Text style={styles.pendingBadgeText}>Demande envoyée</Text>
      </View>
    );
    if (friendStatus === 'pending_received') return (
      <TouchableOpacity style={styles.acceptBtn} onPress={handleAcceptFriend} disabled={actionLoading}>
        {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
          <><Check color="#fff" size={16} /><Text style={styles.acceptBtnText}>Accepter</Text></>
        )}
      </TouchableOpacity>
    );
    return (
      <TouchableOpacity style={styles.addFriendBtn} onPress={handleAddFriend} disabled={actionLoading}>
        {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
          <><UserPlus color="#fff" size={16} /><Text style={styles.addFriendBtnText}>Demander en ami</Text></>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Avatar + name */}
        <View style={styles.heroCard}>
          <View style={[styles.avatarCircle, { borderColor: levelColor }]}>
            <Text style={styles.avatarLetter}>{profile.username?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <Text style={styles.username}>{profile.username}</Text>
          {profile.full_name ? <Text style={styles.fullName}>{profile.full_name}</Text> : null}
          <View style={[styles.levelPill, { backgroundColor: `${levelColor}20` }]}>
            <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
            <Text style={[styles.levelText, { color: levelColor }]}>{level.toUpperCase()}</Text>
          </View>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          <FriendButton />
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { icon: Zap, color: Colors.primary, value: profile.elo, label: 'ELO' },
            { icon: Trophy, color: Colors.gold, value: profile.wins, label: 'Victoires' },
            { icon: TrendingUp, color: Colors.success, value: `${winRate}%`, label: 'Win Rate' },
          ].map(({ icon: Icon, color, value, label }) => (
            <View key={label} style={styles.statCard}>
              <Icon color={color} size={16} />
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  notFound: { fontSize: 15, color: Colors.textMuted },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 56,
    paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '900', color: Colors.text },

  content: { padding: 16, gap: 14 },

  heroCard: {
    backgroundColor: Colors.card, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border,
    padding: 24, alignItems: 'center', gap: 8,
  },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface, borderWidth: 3,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarLetter: { fontSize: 32, fontWeight: '900', color: Colors.text },
  username: { fontSize: 22, fontWeight: '900', color: Colors.text },
  fullName: { fontSize: 14, color: Colors.textMuted },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  bio: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, maxWidth: 240 },

  addFriendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4,
  },
  addFriendBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.success, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4,
  },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  friendsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${Colors.success}15`, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: `${Colors.success}40`, marginTop: 4,
  },
  friendsBadgeText: { color: Colors.success, fontSize: 13, fontWeight: '700' },
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.border, marginTop: 4,
  },
  pendingBadgeText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 14, alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 18, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
});
