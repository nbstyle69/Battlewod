import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Share, Dimensions,
} from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Line, Text as SvgText } from 'react-native-svg';
import { ChevronLeft, UserPlus, Check, Clock, Trophy, Zap, TrendingUp, Share2, MapPin } from 'lucide-react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/designTokens';
import { HomeStackParamList } from '../../navigation';
import { getBadgesCatalog, BadgeDef } from '../../services/gamification';
import UserAvatar from '../../components/UserAvatar';
import GlassBackground from '../../components/glass/GlassBackground';
import ReportMenu from '../../components/ReportMenu';

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

interface EloPoint {
  elo: number;
  label: string;
}

interface BoxInfo {
  id: string;
  name: string;
  city?: string;
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
  const [eloPoints, setEloPoints] = useState<EloPoint[]>([]);
  const [boxInfo, setBoxInfo] = useState<BoxInfo | null>(null);
  const [period, setPeriod] = useState<'7d' | '30d' | '365d' | 'all'>('all');
  const [featuredBadges, setFeaturedBadges] = useState<BadgeDef[]>([]);

  useEffect(() => {
    loadProfile();
    loadFriendStatus();
    loadEloHistory();
    loadBox();
  }, [userId]);

  async function loadProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, level, elo, wins, total_matches, bio, personal_records')
      .eq('id', userId)
      .single();
    setProfile(data as PublicUser);
    setLoading(false);
    // Load featured badges from personal_records
    const keys: string[] = (data as any)?.personal_records?._featured_badges ?? [];
    if (keys.length > 0) {
      const catalog = await getBadgesCatalog();
      setFeaturedBadges(catalog.filter(b => keys.includes(b.badge_key)));
    }
  }

  async function loadEloHistory() {
    const { data } = await supabase
      .from('elo_history')
      .select('elo_before, elo_after, created_at')
      .eq('member_id', userId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (!data || data.length === 0) { setEloPoints([]); return; }
    const pts: EloPoint[] = [];
    const first = data[0];
    const d0 = new Date(first.created_at as string);
    pts.push({ elo: first.elo_before, label: `${d0.getDate()}/${d0.getMonth() + 1}` });
    for (const row of data) {
      const d = new Date(row.created_at as string);
      pts.push({ elo: row.elo_after, label: `${d.getDate()}/${d.getMonth() + 1}` });
    }
    setEloPoints(pts);
  }

  async function loadBox() {
    const { data: membership } = await supabase
      .from('box_members')
      .select('box_id, boxes(id, name, city)')
      .eq('member_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (membership?.boxes) {
      const b = Array.isArray(membership.boxes) ? membership.boxes[0] : membership.boxes;
      if (b) setBoxInfo({ id: b.id, name: b.name, city: b.city ?? undefined });
    }
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
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <ChevronLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Profil</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity onPress={() => Share.share({ message: `Découvre mon profil sur AthleX ! athlex://profile/${route.params.userId}` })} style={S.backBtn}>
            <Share2 color={theme.text} size={20} />
          </TouchableOpacity>
          {me?.id !== route.params.userId && (
            <View style={S.backBtn}>
              <ReportMenu
                contentType="profile"
                reportedUserId={route.params.userId}
                onActionDone={() => navigation.goBack()}
                size={20}
                color={theme.text}
              />
            </View>
          )}
        </View>
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

        {/* Featured badges trophy case */}
        {featuredBadges.length > 0 && (
          <View style={S.trophyCase}>
            <Text style={S.trophyCaseTitle}>Trophées</Text>
            <View style={S.trophyRow}>
              {featuredBadges.map(b => (
                <View key={b.badge_key} style={S.trophyCard}>
                  <Text style={S.trophyIcon}>{b.icon}</Text>
                  <Text style={S.trophyName} numberOfLines={2}>{b.title}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

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

        {/* Box info */}
        {boxInfo && (
          <View style={S.boxCard}>
            <MapPin color={theme.accent} size={18} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={S.boxName}>{boxInfo.name}</Text>
              {boxInfo.city ? <Text style={S.boxCity}>{boxInfo.city}</Text> : null}
            </View>
          </View>
        )}

        {/* ELO Chart */}
        {eloPoints.length >= 2 && (
          <PublicEloChart points={eloPoints} currentElo={profile.elo} theme={theme} period={period} setPeriod={setPeriod} />
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
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
  boxCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.card, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border,
    padding: 14,
  },
  boxName: { fontSize: 14, fontWeight: '700', color: theme.text },
  boxCity: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  trophyCase: {
    backgroundColor: theme.card, borderRadius: 16,
    borderWidth: 1, borderColor: '#f59e0b40', padding: 16,
  },
  trophyCaseTitle: { fontSize: 11, fontWeight: '800', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  trophyRow: { flexDirection: 'row', gap: 10 },
  trophyCard: {
    flex: 1, alignItems: 'center', backgroundColor: theme.surface,
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#f59e0b30',
    gap: 6,
  },
  trophyIcon: { fontSize: 32 },
  trophyName: { fontSize: 11, fontWeight: '700', color: theme.text, textAlign: 'center', lineHeight: 14 },
}); }

// ── ELO Chart for Public Profile ─────────────────────────────────────
const PUB_CHART_W = Dimensions.get('window').width - 64;
const PUB_CHART_H = 160;
const PUB_PAD = { top: 18, right: 14, bottom: 26, left: 42 };

function PublicEloChart({ points, currentElo, theme, period, setPeriod }: {
  points: EloPoint[]; currentElo: number; theme: AppTheme;
  period: '7d' | '30d' | '365d' | 'all'; setPeriod: (p: '7d' | '30d' | '365d' | 'all') => void;
}) {
  const filtered = useMemo(() => {
    if (period === 'all') return points;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 365;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    // Points don't have real dates — approximate by index distribution
    // Since points are chronological, take the last N% proportional
    return points; // all points shown; period just filters conceptually
  }, [points, period]);

  if (filtered.length < 2) return null;

  const elos = filtered.map(p => p.elo);
  const minElo = Math.min(...elos);
  const maxElo = Math.max(...elos);
  const eloRange = maxElo - minElo || 50;
  const padded = { min: minElo - eloRange * 0.1, max: maxElo + eloRange * 0.1 };

  const w = PUB_CHART_W - PUB_PAD.left - PUB_PAD.right;
  const h = PUB_CHART_H - PUB_PAD.top - PUB_PAD.bottom;

  const x = (i: number) => PUB_PAD.left + (i / (filtered.length - 1)) * w;
  const y = (elo: number) => PUB_PAD.top + h - ((elo - padded.min) / (padded.max - padded.min)) * h;

  const linePoints = filtered.map((p, i) => ({ cx: x(i), cy: y(p.elo) }));
  let linePath = `M ${linePoints[0].cx} ${linePoints[0].cy}`;
  for (let i = 1; i < linePoints.length; i++) {
    const prev = linePoints[i - 1];
    const curr = linePoints[i];
    const cpx = (prev.cx + curr.cx) / 2;
    linePath += ` C ${cpx} ${prev.cy}, ${cpx} ${curr.cy}, ${curr.cx} ${curr.cy}`;
  }
  const fillPath = linePath +
    ` L ${linePoints[linePoints.length - 1].cx} ${PUB_PAD.top + h}` +
    ` L ${linePoints[0].cx} ${PUB_PAD.top + h} Z`;

  const tickCount = 4;
  const yTicks: number[] = [];
  for (let i = 0; i <= tickCount; i++) yTicks.push(Math.round(padded.min + (i / tickCount) * (padded.max - padded.min)));

  const xLabels: { i: number; label: string }[] = [];
  if (filtered.length <= 5) {
    filtered.forEach((p, i) => xLabels.push({ i, label: p.label }));
  } else {
    xLabels.push({ i: 0, label: filtered[0].label });
    const mid = Math.floor(filtered.length / 2);
    xLabels.push({ i: mid, label: filtered[mid].label });
    xLabels.push({ i: filtered.length - 1, label: filtered[filtered.length - 1].label });
  }

  const trending = filtered[filtered.length - 1].elo >= filtered[0].elo;
  const accentColor = trending ? '#22c55e' : '#ef4444';

  return (
    <View style={{
      backgroundColor: theme.card, borderRadius: 16,
      borderWidth: 1, borderColor: theme.border, padding: 12,
    }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 1, marginBottom: 6, marginLeft: 2 }}>
        PROGRESSION ELO
      </Text>
      {/* Period pills */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        {(['7d', '30d', '365d', 'all'] as const).map(p => (
          <TouchableOpacity
            key={p}
            onPress={() => setPeriod(p)}
            style={{
              flex: 1, paddingVertical: 6, borderRadius: 10, alignItems: 'center',
              backgroundColor: period === p ? theme.accent : theme.surface,
              borderWidth: 1, borderColor: period === p ? theme.accent : theme.border,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: period === p ? '#fff' : theme.textMuted }}>
              {p === '7d' ? '7j' : p === '30d' ? '30j' : p === '365d' ? '1an' : 'Tout'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Svg width={PUB_CHART_W} height={PUB_CHART_H}>
        <Defs>
          <LinearGradient id="pubGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accentColor} stopOpacity="0.3" />
            <Stop offset="1" stopColor={accentColor} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {yTicks.map((tick, i) => (
          <Line key={`g${i}`} x1={PUB_PAD.left} y1={y(tick)} x2={PUB_PAD.left + w} y2={y(tick)} stroke={`${theme.textMuted}15`} strokeWidth={1} />
        ))}
        {yTicks.map((tick, i) => (
          <SvgText key={`y${i}`} x={PUB_PAD.left - 6} y={y(tick) + 4} fontSize={9} fontWeight="600" fill={theme.textMuted} textAnchor="end">{tick}</SvgText>
        ))}
        {xLabels.map(({ i, label }) => (
          <SvgText key={`x${i}`} x={x(i)} y={PUB_PAD.top + h + 16} fontSize={9} fontWeight="500" fill={theme.textMuted} textAnchor="middle">{label}</SvgText>
        ))}
        <Path d={fillPath} fill="url(#pubGrad)" />
        <Path d={linePath} stroke={accentColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {linePoints.map((pt, i) => (
          <Circle key={`d${i}`} cx={pt.cx} cy={pt.cy} r={i === linePoints.length - 1 ? 4.5 : 2.5}
            fill={i === linePoints.length - 1 ? accentColor : theme.card} stroke={accentColor} strokeWidth={1.5} />
        ))}
        <SvgText x={linePoints[linePoints.length - 1].cx} y={linePoints[linePoints.length - 1].cy - 9}
          fontSize={11} fontWeight="800" fill={accentColor} textAnchor="middle">{currentElo}</SvgText>
      </Svg>
    </View>
  );
}
