import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Share, Switch,
} from 'react-native';
import { Trophy, Zap, TrendingUp, Award, LogOut, Star, Flame, ChevronRight, Hash, Building2, Edit3, Check, X, Camera, Copy, Share2, Bell } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { Colors, LevelColors } from '../../theme/colors';
import { getBadgesCatalog, getEarnedBadges, getStreak, BadgeDef, EarnedBadge, StreakInfo } from '../../services/gamification';
import { HomeStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Profile'>;

const TABS = ['Stats', 'PR', 'Badges', 'Compte'];

const PR_CATEGORIES = [
  {
    label: 'Haltérophilie',
    icon: '🏋️',
    items: [
      { movement: 'Back Squat', value: '', unit: 'kg', date: '' },
      { movement: 'Front Squat', value: '', unit: 'kg', date: '' },
      { movement: 'Deadlift', value: '', unit: 'kg', date: '' },
      { movement: 'Bench Press', value: '', unit: 'kg', date: '' },
      { movement: 'Strict Press', value: '', unit: 'kg', date: '' },
      { movement: 'Push Press', value: '', unit: 'kg', date: '' },
      { movement: 'Push Jerk', value: '', unit: 'kg', date: '' },
      { movement: 'Split Jerk', value: '', unit: 'kg', date: '' },
      { movement: 'Squat Clean', value: '', unit: 'kg', date: '' },
      { movement: 'Power Clean', value: '', unit: 'kg', date: '' },
      { movement: 'Hang Power Clean', value: '', unit: 'kg', date: '' },
      { movement: 'Hang Squat Clean', value: '', unit: 'kg', date: '' },
      { movement: 'Squat Snatch', value: '', unit: 'kg', date: '' },
      { movement: 'Power Snatch', value: '', unit: 'kg', date: '' },
      { movement: 'Hang Power Snatch', value: '', unit: 'kg', date: '' },
      { movement: 'Hang Squat Snatch', value: '', unit: 'kg', date: '' },
      { movement: 'Clean & Jerk', value: '', unit: 'kg', date: '' },
      { movement: 'Overhead Squat', value: '', unit: 'kg', date: '' },
      { movement: 'Thruster', value: '', unit: 'kg', date: '' },
    ],
  },
  {
    label: 'Gymnastics',
    icon: '🤸',
    items: [
      { movement: 'Toes To Bar', value: '', unit: 'reps', date: '' },
      { movement: 'Pull-ups', value: '', unit: 'reps', date: '' },
      { movement: 'Chest To Bar', value: '', unit: 'reps', date: '' },
      { movement: 'Hand Stand Push Up', value: '', unit: 'reps', date: '' },
      { movement: 'Strict Hand Stand Push Up', value: '', unit: 'reps', date: '' },
      { movement: 'Wall Facing Hand Stand Push Up', value: '', unit: 'reps', date: '' },
      { movement: 'Ring Muscle-up', value: '', unit: 'reps', date: '' },
      { movement: 'Bar Muscle-up', value: '', unit: 'reps', date: '' },
      { movement: 'Dips', value: '', unit: 'reps', date: '' },
      { movement: 'Strict Dips', value: '', unit: 'reps', date: '' },
      { movement: 'Pull Over', value: '', unit: 'reps', date: '' },
    ],
  },
  {
    label: 'Benchmarks CrossFit',
    icon: '🏆',
    items: [
      { movement: 'Fran', value: '', unit: 'min', date: '' },
      { movement: 'Grace', value: '', unit: 'min', date: '' },
      { movement: 'Helen', value: '', unit: 'min', date: '' },
      { movement: 'Cindy', value: '', unit: 'rounds', date: '' },
      { movement: 'Diane', value: '', unit: 'min', date: '' },
      { movement: 'DT', value: '', unit: 'min', date: '' },
      { movement: 'Murph', value: '', unit: 'min', date: '' },
    ],
  },
  {
    label: 'Cardio & Endurance',
    icon: '🏃',
    items: [
      { movement: '500m Row', value: '', unit: 'min', date: '' },
      { movement: '2km Row', value: '', unit: 'min', date: '' },
      { movement: '1km Course', value: '', unit: 'min', date: '' },
      { movement: '5km Course', value: '', unit: 'min', date: '' },
      { movement: 'Assault Bike 1min', value: '', unit: 'cal', date: '' },
      { movement: 'Echo Bike 1min', value: '', unit: 'cal', date: '' },
      { movement: '5km Bike Erg', value: '', unit: 'min', date: '' },
    ],
  },
];

const BADGE_CATEGORY_MAP: Record<string, string> = {
  activity: 'Régularité',
  tournament: 'Compétition',
  social: 'Communauté',
  wod: 'Entraînement',
  elo: 'Classement',
};
const CATEGORY_ORDER = ['activity', 'tournament', 'wod', 'elo', 'social'];

export default function ProfileScreen() {
  const { user, signOut, deleteAccount, currentBox, joinBox, leaveBox, updateUser } = useAuth();
  const { theme, mode, toggleTheme } = useTheme();
  const navigation = useNavigation<Nav>();
  const S = createStyles(theme);
  const [activeTab, setActiveTab]   = useState(3);
  const [expandedPR, setExpandedPR] = useState<string | null>('Haltérophilie');

  // ── Referral code
  const [referralCode, setReferralCode] = useState<string>('');
  // ── WOD count
  const [wodCount, setWodCount] = useState<number>(0);
  // ── Badges & streaks
  const [badgesCatalog, setBadgesCatalog] = useState<BadgeDef[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  const [streak, setStreak] = useState<StreakInfo>({ current_streak: 0, longest_streak: 0, week_session_count: 0, week_start: '' });
  // ── Friends
  const [friends, setFriends] = useState<Array<{ id: string; username: string; level: string; avatar_url?: string }>>([]);
  // ── PR editing
  const [editingPR, setEditingPR] = useState<string | null>(null);
  const [prValues, setPrValues] = useState<Record<string, string>>({});

  // ── Box join modal
  const [joinModal, setJoinModal]   = useState(false);
  const [joinCode, setJoinCode]     = useState('');
  const [joining, setJoining]       = useState(false);

  // ── Edit profile
  const [editing, setEditing]       = useState(false);
  const [editUsername, setEditUsername] = useState(user?.username ?? '');
  const [firstName, setFirstName]   = useState(() => user?.full_name?.split(' ')[0] ?? '');
  const [lastName, setLastName]     = useState(() => user?.full_name?.split(' ').slice(1).join(' ') ?? '');
  const [editEmail, setEditEmail]   = useState(user?.email ?? '');
  const [avatarUrl, setAvatarUrl]   = useState(user?.avatar_url ?? '');
  const [editBio, setEditBio]       = useState(user?.bio ?? '');
  const [saving, setSaving]         = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  useEffect(() => {
    loadReferralCode();
    if (user?.id) { loadWodCount(); loadFriends(); loadPRs(); loadBadges(); }
  }, [user?.id]);

  async function loadPRs() {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('personal_records')
      .eq('id', user.id)
      .single();
    if (data?.personal_records && typeof data.personal_records === 'object') {
      setPrValues(prev => ({ ...prev, ...data.personal_records }));
    }
  }

  async function savePRs(updated: Record<string, string>) {
    if (!user) return;
    await supabase.from('profiles').update({ personal_records: updated }).eq('id', user.id);
  }

  async function loadWodCount() {
    if (!user) return;
    const { count } = await supabase
      .from('wod_scores')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    setWodCount(count ?? 0);
  }

  async function loadFriends() {
    if (!user) return;
    const { data } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id, requester:profiles!requester_id(id, username, level, avatar_url), addressee:profiles!addressee_id(id, username, level, avatar_url)')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted');
    if (!data) return;
    const list = data.map((f: any) => {
      const other = f.requester_id === user.id ? f.addressee : f.requester;
      return other;
    }).filter(Boolean);
    setFriends(list);
  }

  async function loadReferralCode() {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('referral_code')
      .eq('id', user.id)
      .single();
    if (data?.referral_code) setReferralCode(data.referral_code);
  }

  async function handlePickPhoto() {
    setPickingPhoto(true);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setPickingPhoto(false);
      Alert.alert('Permission refusée', 'Autorise l\'accès à ta galerie dans les réglages.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    setPickingPhoto(false);
    if (!result.canceled && result.assets[0]) {
      setAvatarUrl(result.assets[0].uri);
    }
  }

  async function handleTakePhoto() {
    setPickingPhoto(true);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setPickingPhoto(false);
      Alert.alert('Permission refusée', 'Autorise l\'accès à la caméra dans les réglages.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    setPickingPhoto(false);
    if (!result.canceled && result.assets[0]) {
      setAvatarUrl(result.assets[0].uri);
    }
  }

  async function handleCopyReferral() {
    await Share.share({ message: referralCode, title: 'Code de parrainage AthleX' });
  }

  async function handleShareReferral() {
    await Share.share({
      message: `Rejoins-moi sur AthleX ! Utilise mon code de parrainage : ${referralCode} 🏋️`,
    });
  }

  async function handleJoinBox() {
    if (!joinCode.trim()) return;
    setJoining(true);
    const { error } = await joinBox(joinCode.trim());
    setJoining(false);
    if (error) { Alert.alert('Erreur', error); return; }
    setJoinModal(false);
    setJoinCode('');
  }

  async function handleLeaveBox() {
    Alert.alert('Quitter la box ?', `Tu vas quitter « ${currentBox?.name} ». Tu devras utiliser un code d'invitation pour la rejoindre à nouveau.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: async () => {
        const { error } = await leaveBox();
        if (error) Alert.alert('Erreur', error);
      }},
    ]);
  }

  async function handleSaveProfile() {
    if (!user) return;
    setSaving(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const updates: Record<string, string> = { full_name: fullName, username: editUsername.trim() };
    if (avatarUrl.trim()) updates.avatar_url = avatarUrl.trim();
    if (editBio.trim() !== undefined) updates.bio = editBio.trim();
    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
    setSaving(false);
    if (error) { Alert.alert('Erreur', error.message); return; }
    updateUser({ full_name: fullName, avatar_url: avatarUrl.trim() || user.avatar_url, username: editUsername.trim() });
    setEditing(false);
  }

  const winRate = user?.total_matches
    ? Math.round((user.wins / user.total_matches) * 100)
    : 0;
  const eloProgress = Math.max(0, Math.min(100, ((user?.elo ?? 1000) - 1000) / 10));

  async function handleSignOut() {
    Alert.alert('Déconnexion', 'Tu veux vraiment te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: signOut },
    ]);
  }

  const [deleting, setDeleting] = useState(false);

  function handleDeleteAccount() {
    Alert.alert(
      '⚠️ Supprimer ton compte ?',
      'Toutes tes données seront définitivement supprimées : scores, PR, messages, historique ELO, badges…\n\nCette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Dernière confirmation',
              'Es-tu vraiment sûr ? Il n\'y a aucun moyen de récupérer ton compte.',
              [
                { text: 'Non, annuler', style: 'cancel' },
                {
                  text: 'Oui, supprimer',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    const { error } = await deleteAccount();
                    setDeleting(false);
                    if (error) Alert.alert('Erreur', error);
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  const levelColor = LevelColors[user?.level ?? 'scaled'];

  const roleLabel = user?.role === 'box_owner'  ? 'Gérant de box'
                  : user?.role === 'admin'       ? 'Administrateur'
                  : user?.role === 'super_admin' ? 'Super Admin'
                  : 'Athlète';

  const roleColor = user?.role === 'box_owner'  ? '#C9A227'
                  : user?.role === 'admin'       ? '#8B5CF6'
                  : user?.role === 'super_admin' ? '#EF4444'
                  : theme.accent;

  async function handleShareBoxCode() {
    if (!currentBox?.invite_code) return;
    await Share.share({
      message: `Rejoins ma box « ${currentBox.name} » sur AthleX !\nCode d'invitation : ${currentBox.invite_code} 🏋️`,
    });
  }

  async function loadBadges() {
    if (!user) return;
    const [catalog, earned, streakData] = await Promise.all([
      getBadgesCatalog(),
      getEarnedBadges(user.id),
      getStreak(user.id),
    ]);
    setBadgesCatalog(catalog);
    setEarnedBadges(earned);
    setStreak(streakData);
  }

  const earnedKeys = new Set(earnedBadges.map(b => b.badge_key));
  const earnedCount = earnedBadges.length;
  const totalBadges = badgesCatalog.length;

  // Group badges by category
  const badgesByCategory = CATEGORY_ORDER.map(cat => ({
    key: cat,
    label: BADGE_CATEGORY_MAP[cat] ?? cat,
    badges: badgesCatalog.filter(b => b.category === cat),
  })).filter(c => c.badges.length > 0);

  return (
    <View style={S.container}>
      <View style={S.header}>
        <View style={S.headerTop}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={[S.avatar, { borderColor: levelColor }]} />
          ) : (
            <View style={[S.avatar, { borderColor: levelColor }]}>
              <Text style={S.avatarText}>{user?.username?.[0]?.toUpperCase() ?? 'A'}</Text>
            </View>
          )}
          <View style={S.userInfo}>
            <Text style={S.username}>{user?.username ?? 'Athlète'}</Text>
            <Text style={S.email}>{user?.email}</Text>
            <View style={[S.levelBadge, { backgroundColor: `${levelColor}18`, borderColor: `${levelColor}40` }]}>
              <View style={[S.levelDot, { backgroundColor: levelColor }]} />
              <Text style={[S.levelText, { color: levelColor }]}>
                {(user?.level ?? 'scaled').toUpperCase()}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={S.logoutBtn}>
            <LogOut color={theme.textMuted} size={20} />
          </TouchableOpacity>
        </View>

        <View style={S.statsRow}>
          <TouchableOpacity onPress={() => navigation.navigate('EloHistory' as never)}
            style={[S.statPill, S.statPillBorder]} activeOpacity={0.6}>
            <Text style={S.statPillValue}>{user?.elo ?? 1000}</Text>
            <Text style={S.statPillLabel}>ELO ›</Text>
          </TouchableOpacity>
          {[
            { label: 'Victoires', value: user?.wins ?? 0 },
            { label: 'Matchs', value: user?.total_matches ?? 0 },
            { label: 'Win Rate', value: `${winRate}%` },
          ].map((s, i) => (
            <View key={s.label} style={[S.statPill, i < 2 && S.statPillBorder]}>
              <Text style={S.statPillValue}>{s.value}</Text>
              <Text style={S.statPillLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={S.progressSection}>
          <View style={S.progressHeader}>
            <Text style={S.progressLabel}>Progression vers Légende</Text>
            <Text style={S.progressPct}>{Math.round(eloProgress)}%</Text>
          </View>
          <View style={S.progressTrack}>
            <View style={[S.progressFill, { width: `${eloProgress}%` as any }]} />
          </View>
          <Text style={S.progressNote}>{(user?.elo ?? 1000)} / 2000 ELO</Text>
        </View>
      </View>

      <View style={S.tabs}>
        {TABS.map((tab, i) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(i)}
            style={[S.tab, activeTab === i && S.tabActive]}>
            <Text style={[S.tabText, activeTab === i && S.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.content}>
        {activeTab === 0 && (
          <>
            <View style={S.gridRow}>
              {[
                { label: 'Total matchs', value: user?.total_matches ?? 0, icon: Zap },
                { label: 'Victoires', value: user?.wins ?? 0, icon: Trophy },
                { label: 'Défaites', value: (user?.total_matches ?? 0) - (user?.wins ?? 0), icon: TrendingUp },
                { label: 'Win Rate', value: `${winRate}%`, icon: Star },
                { label: 'Série actuelle', value: 5, icon: Flame },
                { label: 'Badges obtenus', value: `${earnedCount}/${totalBadges}`, icon: Award },
                ...(currentBox ? [{ label: 'WODs effectués', value: wodCount, icon: Zap }] : []),
              ].map((s) => (
                <View key={s.label} style={S.gridCard}>
                  <s.icon color={theme.text} size={18} />
                  <Text style={S.gridValue}>{s.value}</Text>
                  <Text style={S.gridLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {activeTab === 1 && (
          <>
            {PR_CATEGORIES.map((cat) => {
              const isOpen = expandedPR === cat.label;
              return (  
                <View key={cat.label} style={S.prCategory}>
                  <TouchableOpacity
                    style={S.prCategoryHeader}
                    onPress={() => setExpandedPR(isOpen ? null : cat.label)}
                    activeOpacity={0.7}
                  >
                    <Text style={S.prCategoryIcon}>{cat.icon}</Text>
                    <Text style={S.prCategoryLabel}>{cat.label}</Text>
                    <Text style={S.prCategoryCount}>{cat.items.length} records</Text>
                    <ChevronRight
                      color={theme.textMuted} size={16}
                      style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
                    />
                  </TouchableOpacity>
                  {isOpen && cat.items.map((pr, i) => {
                    const key = `${cat.label}_${pr.movement}`;
                    const isEditingThis = editingPR === key;
                    return (
                      <View key={i} style={[S.prRow, i === cat.items.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={S.prMovement}>{pr.movement}</Text>
                          <Text style={S.prDate}>
                            {prValues[`${key}_date`] ?? (prValues[key] ? '' : pr.date)}
                          </Text>
                        </View>
                        {isEditingThis ? (
                          <View style={S.prEditRow}>
                            <TextInput
                              style={S.prEditInput}
                              value={prValues[key] ?? ''}
                              onChangeText={v => setPrValues(prev => ({ ...prev, [key]: v }))}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                            />
                            <Text style={S.prUnit}>{pr.unit}</Text>
                            <TouchableOpacity
                              onPress={() => {
                                const today = new Date().toISOString().split('T')[0];
                                const updated = { ...prValues, [`${key}_date`]: today };
                                setPrValues(updated);
                                setEditingPR(null);
                                savePRs(updated);
                              }}
                              style={S.prEditConfirm}
                            >
                              <Check color={theme.text} size={16} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => setEditingPR(key)} style={S.prValueBtn}>
                            <Text style={[S.prValue, !prValues[key] && { color: theme.textMuted }]}>
                              {prValues[key] ?? '—'}{' '}
                              <Text style={S.prUnit}>{prValues[key] ? pr.unit : ''}</Text>
                            </Text>
                            <Edit3 color={theme.textMuted} size={12} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}

        {activeTab === 2 && (
          <>
            <View style={S.badgeSummary}>
              <Text style={S.badgeSummaryText}>
                <Text style={{ fontWeight: '900', color: theme.text }}>{earnedCount}</Text>
                {' '}badges obtenus sur{' '}
                <Text style={{ fontWeight: '900' }}>{totalBadges}</Text>
              </Text>
            </View>
            {/* Streak widget */}
            <View style={S.streakWidget}>
              <Text style={S.streakFire}>🔥</Text>
              <View style={{ flex: 1 }}>
                <Text style={S.streakTitle}>Semaine {streak.current_streak}</Text>
                <Text style={S.streakSub}>{streak.week_session_count}/3 sessions cette semaine</Text>
                <View style={S.streakBar}>
                  <View style={[S.streakBarFill, { width: `${Math.min(100, (streak.week_session_count / 3) * 100)}%` }]} />
                </View>
              </View>
            </View>

            {badgesByCategory.map((cat) => (
              <View key={cat.key} style={S.badgeCategoryBlock}>
                <Text style={S.badgeCategoryTitle}>{cat.label}</Text>
                <View style={S.badgesGrid}>
                  {cat.badges.map((badge) => {
                    const earned = earnedKeys.has(badge.badge_key);
                    return (
                      <View key={badge.badge_key} style={[S.badgeCard, !earned && S.badgeCardLocked]}>
                        <Text style={S.badgeIcon}>{earned ? badge.icon : '🔒'}</Text>
                        <Text style={[S.badgeName, !earned && { color: theme.textMuted }]}>
                          {badge.title}
                        </Text>
                        <Text style={S.badgeDesc}>{badge.description}</Text>
                        {earned && <View style={S.earnedBar} />}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        )}
        {activeTab === 3 && (
          <View style={S.compteSection}>

            {/* ── Box ─────────────────────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>Ma box</Text>
              {currentBox ? (
                <>
                  <View style={S.boxRow}>
                    <Building2 color={theme.text} size={20} />
                    <View style={{ flex: 1 }}>
                      <Text style={S.boxName}>{currentBox.name}</Text>
                      {currentBox.description ? <Text style={S.boxDesc}>{currentBox.description}</Text> : null}
                    </View>
                    <View style={S.activeTag}><Text style={S.activeTagText}>Actif</Text></View>
                  </View>
                  <TouchableOpacity style={S.leaveBtn} onPress={handleLeaveBox} activeOpacity={0.8}>
                    <Text style={S.leaveBtnText}>Quitter la box</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={S.noBoxText}>Tu n'es rattaché à aucune box.</Text>
                  <TouchableOpacity style={S.joinBtn} onPress={() => setJoinModal(true)} activeOpacity={0.8}>
                    <Hash color={theme.background} size={16} />
                    <Text style={S.joinBtnText}>Rejoindre une box</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* ── Edit profile ─────────────────────────── */}
            <View style={S.compteCard}>
              <View style={S.compteCardHeader}>
                <Text style={S.compteCardTitle}>Mes informations</Text>
                {!editing ? (
                  <TouchableOpacity onPress={() => setEditing(true)} style={S.editIconBtn}>
                    <Edit3 color={theme.text} size={16} />
                    <Text style={S.editIconText}>Modifier</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setEditing(false)} style={S.editIconBtn}>
                    <X color={theme.textMuted} size={16} />
                    <Text style={[S.editIconText, { color: theme.textMuted }]}>Annuler</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!editing ? (
                <View style={S.infoRows}>
                  <InfoRow label="Pseudo" value={user?.username ?? ''} S={S} />
                  <InfoRow label="Nom" value={user?.full_name || '—'} S={S} />
                  <InfoRow label="Email" value={user?.email ?? ''} S={S} />
                  <InfoRow label="Bio" value={user?.bio || 'Non renseignée'} S={S} />
                  <InfoRow label="Photo" value={user?.avatar_url ? 'Définie' : 'Non définie'} S={S} />
                  {/* Rôle */}
                  <View style={S.infoRow}>
                    <Text style={S.infoRowLabel}>Rôle</Text>
                    <View style={S.roleBadge}>
                      <Text style={S.roleBadgeText}>{roleLabel}</Text>
                    </View>
                  </View>
                  {/* Box invite code (owner only) */}
                  {user?.role === 'box_owner' && currentBox?.invite_code && (
                    <View style={S.infoRow}>
                      <Text style={S.infoRowLabel}>Code box</Text>
                      <TouchableOpacity style={S.inviteCodeRow} onPress={handleShareBoxCode} activeOpacity={0.7}>
                        <Text style={S.inviteCodeText}>{currentBox.invite_code}</Text>
                        <Share2 size={14} color={theme.text} style={{ marginLeft: 6 }} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                <View style={S.editForm}>
                  {/* Photo */}
                  <View style={S.photoPickerRow}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={S.photoPreview} />
                    ) : (
                      <View style={S.photoPlaceholder}>
                        <Text style={S.photoPlaceholderText}>{user?.username?.[0]?.toUpperCase() ?? 'A'}</Text>
                      </View>
                    )}
                    <View style={S.photoPickerBtns}>
                      <TouchableOpacity style={S.photoBtn} onPress={handlePickPhoto} disabled={pickingPhoto} activeOpacity={0.8}>
                        {pickingPhoto ? <ActivityIndicator color={theme.text} size="small" /> : <><Camera color={theme.textSecondary} size={14} /><Text style={S.photoBtnText}>Galerie</Text></>}
                      </TouchableOpacity>
                      <TouchableOpacity style={S.photoBtn} onPress={handleTakePhoto} disabled={pickingPhoto} activeOpacity={0.8}>
                        <Camera color={theme.textMuted} size={14} />
                        <Text style={[S.photoBtnText, { color: theme.textMuted }]}>Caméra</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={S.editLabel}>Pseudo</Text>
                  <TextInput style={S.editInput} value={editUsername} onChangeText={setEditUsername} autoCapitalize="none" placeholder="Pseudo" placeholderTextColor={theme.textMuted} />

                  <View style={S.editRow}>
                    <View style={S.editField}>
                      <Text style={S.editLabel}>Prénom</Text>
                      <TextInput style={S.editInput} value={firstName} onChangeText={setFirstName} placeholder="Prénom" placeholderTextColor={theme.textMuted} />
                    </View>
                    <View style={S.editField}>
                      <Text style={S.editLabel}>Nom</Text>
                      <TextInput style={S.editInput} value={lastName} onChangeText={setLastName} placeholder="Nom" placeholderTextColor={theme.textMuted} />
                    </View>
                  </View>

                  <Text style={S.editLabel}>Email</Text>
                  <TextInput style={S.editInput} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Email" placeholderTextColor={theme.textMuted} />

                  <Text style={S.editLabel}>Bio (avec #hashtags)</Text>
                  <TextInput
                    style={[S.editInput, S.bioInput]}
                    value={editBio}
                    onChangeText={setEditBio}
                    multiline
                    numberOfLines={3}
                    placeholder="Parle de toi... #crossfit #rx #motivation"
                    placeholderTextColor={theme.textMuted}
                  />

                  <TouchableOpacity style={S.saveBtn} onPress={handleSaveProfile} disabled={saving} activeOpacity={0.85}>
                    {saving ? <ActivityIndicator color={theme.background} size="small" /> : <><Check color={theme.background} size={16} /><Text style={S.saveBtnText}>Enregistrer</Text></>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {/* ── Mes amis ─────────────────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>Mes amis ({friends.length})</Text>
              {friends.length === 0 ? (
                <Text style={S.friendsEmpty}>Aucun ami pour l'instant. Consulte les profils publics pour en ajouter.</Text>
              ) : (
                <View style={S.friendsList}>
                  {friends.map(f => {
                    const fc = LevelColors[f.level as keyof typeof LevelColors] ?? theme.accent;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={S.friendRow}
                        onPress={() => navigation.navigate('PublicProfile', { userId: f.id })}
                        activeOpacity={0.8}
                      >
                        {f.avatar_url ? (
                          <Image source={{ uri: f.avatar_url }} style={[S.friendAvatar, { borderColor: fc }]} />
                        ) : (
                          <View style={[S.friendAvatar, { borderColor: fc, backgroundColor: `${fc}20`, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={[S.friendAvatarLetter, { color: fc }]}>{f.username?.[0]?.toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={S.friendName}>{f.username}</Text>
                          <Text style={[S.friendLevel, { color: fc }]}>{f.level?.toUpperCase()}</Text>
                        </View>
                        <ChevronRight color={theme.textMuted} size={16} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* ── CGU + Confidentialité ──────────────── */}
            <TouchableOpacity
              style={S.compteCard}
              onPress={() => navigation.navigate('Legal' as never)}
              activeOpacity={0.8}
            >
              <View style={S.themeRow}>
                <Text style={S.compteCardTitle}>CGU & Confidentialité</Text>
                <ChevronRight color={theme.textMuted} size={16} />
              </View>
            </TouchableOpacity>

            {/* ── Apparence ───────────────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>Apparence</Text>
              <View style={S.themeRow}>
                <Text style={S.themeLabel}>{mode === 'dark' ? '🌙 Mode sombre' : '☀️ Mode clair'}</Text>
                <Switch
                  value={mode === 'dark'}
                  onValueChange={toggleTheme}
                  trackColor={{ false: theme.border, true: theme.text }}
                  thumbColor={theme.background}
                  ios_backgroundColor={theme.border}
                />
              </View>
            </View>

            {/* ── Notifications ─────────────────────────── */}
            <TouchableOpacity
              style={S.compteCard}
              onPress={() => navigation.navigate('NotificationSettings')}
              activeOpacity={0.8}
            >
              <View style={S.themeRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Bell color={theme.text} size={18} />
                  <Text style={S.themeLabel}>Notifications</Text>
                </View>
                <ChevronRight color={theme.textMuted} size={16} />
              </View>
            </TouchableOpacity>

            {/* ── Referral code ────────────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>Mon code de parrainage</Text>
              <Text style={S.referralDesc}>
                Partage ce code pour inviter des amis et gagner des récompenses.
              </Text>
              {referralCode ? (
                <View style={S.referralBox}>
                  <Text style={S.referralCode}>{referralCode}</Text>
                </View>
              ) : (
                <ActivityIndicator color={theme.text} size="small" style={{ marginVertical: 8 }} />
              )}
              <View style={S.referralBtns}>
                <TouchableOpacity style={S.referralBtn} onPress={handleCopyReferral} disabled={!referralCode} activeOpacity={0.8}>
                  <Copy color={theme.textSecondary} size={15} />
                  <Text style={S.referralBtnText}>Copier</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.referralBtn, S.referralBtnShare]} onPress={handleShareReferral} disabled={!referralCode} activeOpacity={0.8}>
                  <Share2 color={theme.background} size={15} />
                  <Text style={[S.referralBtnText, { color: theme.background }]}>Partager</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Supprimer le compte ───────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>Zone dangereuse</Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, lineHeight: 18 }}>
                La suppression de ton compte est définitive. Toutes tes données (scores, PR, messages, ELO, badges) seront supprimées.
              </Text>
              <TouchableOpacity
                style={S.deleteAccountBtn}
                onPress={handleDeleteAccount}
                disabled={deleting}
                activeOpacity={0.8}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={S.deleteAccountText}>Supprimer mon compte</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Join box modal ────────────────────────────────────── */}
      <Modal visible={joinModal} transparent animationType="slide" onRequestClose={() => setJoinModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>Rejoindre une box</Text>
            <Text style={S.modalSub}>Entre le code d'invitation (6 caractères)</Text>
            <TextInput
              style={S.codeInput}
              value={joinCode}
              onChangeText={t => setJoinCode(t.toUpperCase())}
              placeholder="Ex : ABC123"
              placeholderTextColor={theme.textMuted}
              maxLength={6}
              autoCapitalize="characters"
              autoFocus
            />
            <TouchableOpacity
              style={[S.joinBtn, (!joinCode.trim() || joining) && { opacity: 0.5 }]}
              onPress={handleJoinBox}
              disabled={!joinCode.trim() || joining}
              activeOpacity={0.85}
            >
              {joining ? <ActivityIndicator color={theme.background} size="small" /> : <><Hash color={theme.background} size={16} /><Text style={S.joinBtnText}>Rejoindre</Text></>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setJoinModal(false)} style={S.modalCancel}>
              <Text style={S.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function InfoRow({ label, value, S }: { label: string; value: string; S: ReturnType<typeof createStyles> }) {
  return (
    <View style={S.infoRow}>
      <Text style={S.infoRowLabel}>{label}</Text>
      <Text style={S.infoRowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function createStyles(t: AppTheme) {
  const isDark = t.mode === 'dark';
  const cardShadow = isDark ? {} : {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  };
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: t.background },
  header: {
    paddingTop: 58, paddingHorizontal: 20, paddingBottom: 20,
    backgroundColor: t.card,
    borderBottomWidth: isDark ? 1 : 0, borderBottomColor: t.border,
    ...(isDark ? {} : { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }),
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatar: {
    width: 60, height: 60, borderRadius: 20,
    backgroundColor: t.accentShadow, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  avatarText: { fontSize: 22, fontWeight: '900', color: '#fff' },
  userInfo: { flex: 1 },
  username: { fontSize: 20, fontWeight: '900', color: t.text, letterSpacing: -0.5 },
  email: { fontSize: 11, color: t.textMuted, marginBottom: 6 },
  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', borderWidth: 1,
  },
  levelDot: { width: 5, height: 5, borderRadius: 3 },
  levelText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  logoutBtn: { padding: 8 },
  statsRow: { flexDirection: 'row', marginBottom: 16 },
  statPill: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statPillBorder: { borderRightWidth: 1, borderRightColor: t.border },
  statPillValue: { fontSize: 20, fontWeight: '900', color: t.text },
  statPillLabel: { fontSize: 9, color: t.textMuted, fontWeight: '600', marginTop: 2, letterSpacing: 0.3 },
  progressSection: {},
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 11, color: t.textMuted, fontWeight: '500' },
  progressPct: { fontSize: 11, fontWeight: '700', color: t.accent },
  progressTrack: { height: 3, backgroundColor: t.surface, borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: t.accent, borderRadius: 2 },
  progressNote: { fontSize: 10, color: t.textMuted },
  tabs: {
    flexDirection: 'row', backgroundColor: t.card,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: t.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: t.textMuted },
  tabTextActive: { color: t.text, fontWeight: '700' },
  content: { padding: 20 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: {
    width: '47%', backgroundColor: isDark ? t.surface : t.card, borderRadius: 14,
    padding: 16, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: t.border,
    ...cardShadow,
  },
  gridValue: { fontSize: 22, fontWeight: '900', color: t.text },
  gridLabel: { fontSize: 10, color: t.textMuted, fontWeight: '600', textAlign: 'center' },
  prCategory: {
    backgroundColor: isDark ? t.card : t.card, borderRadius: 14,
    borderWidth: 1, borderColor: t.border, marginBottom: 10, overflow: 'hidden',
    ...cardShadow,
  },
  prCategoryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14,
  },
  prCategoryIcon: { fontSize: 18 },
  prCategoryLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: t.text },
  prCategoryCount: { fontSize: 11, color: t.textMuted },
  prRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: t.border,
  },
  prMovement: { flex: 1, fontSize: 13, fontWeight: '500', color: t.textSecondary },
  prDate: { fontSize: 10, color: t.textMuted, marginRight: 12 },
  prValue: { fontSize: 15, fontWeight: '900', color: t.text },
  prUnit: { fontSize: 11, color: t.textMuted, fontWeight: '400' },
  streakWidget: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: isDark ? t.surface : t.card, borderRadius: 14,
    padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: t.border,
    ...cardShadow,
  },
  streakFire: { fontSize: 36 },
  streakTitle: { fontSize: 16, fontWeight: '900', color: t.text },
  streakSub: { fontSize: 12, color: t.textMuted, marginTop: 2, marginBottom: 6 },
  streakBar: { height: 6, backgroundColor: t.border, borderRadius: 3, overflow: 'hidden' as const },
  streakBarFill: { height: 6, backgroundColor: t.accent, borderRadius: 3 },
  badgeSummary: { marginBottom: 16 },
  badgeSummaryText: { fontSize: 13, color: t.textSecondary },
  badgeCategoryBlock: { marginBottom: 24 },
  badgeCategoryTitle: { fontSize: 11, fontWeight: '700', color: t.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeCard: {
    width: '47%', backgroundColor: isDark ? t.surface : t.card, borderRadius: 14,
    padding: 14, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: t.border,
    ...cardShadow,
  },
  badgeCardLocked: { opacity: 0.3 },
  badgeIcon: { fontSize: 26, marginBottom: 4 },
  badgeName: { fontSize: 12, fontWeight: '700', color: t.text, textAlign: 'center' },
  badgeDesc: { fontSize: 10, color: t.textMuted, textAlign: 'center', lineHeight: 14 },
  earnedBar: { height: 2, width: 24, backgroundColor: t.accent, borderRadius: 1, marginTop: 4 },

  compteSection: { gap: 16, paddingBottom: 8 },
  compteCard: {
    backgroundColor: isDark ? t.surface : t.card, borderRadius: 16,
    borderWidth: 1, borderColor: t.border, padding: 16, gap: 14,
    ...cardShadow,
  },
  compteCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compteCardTitle: { fontSize: 11, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  editIconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editIconText: { fontSize: 12, fontWeight: '700', color: t.accent },
  themeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  themeLabel: { fontSize: 14, fontWeight: '600', color: t.text },

  boxRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  boxName: { fontSize: 15, fontWeight: '700', color: t.text },
  boxDesc: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  activeTag: {
    backgroundColor: `${t.accent}12`, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${t.accent}25`,
  },
  activeTagText: { fontSize: 10, fontWeight: '700', color: t.accent },
  noBoxText: { fontSize: 13, color: t.textMuted },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: t.accent, borderRadius: 14, padding: 14,
  },
  joinBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  leaveBtn: {
    borderWidth: 1.5, borderColor: t.border, borderRadius: 14,
    padding: 12, alignItems: 'center',
  },
  leaveBtnText: { color: t.textSecondary, fontSize: 13, fontWeight: '600' },

  infoRows: { gap: 0 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: t.border,
  },
  infoRowLabel: { fontSize: 13, color: t.textMuted, fontWeight: '500' },
  infoRowValue: { fontSize: 13, fontWeight: '700', color: t.text, maxWidth: '60%' },

  editForm: { gap: 12 },
  editRow: { flexDirection: 'row', gap: 10 },
  editField: { flex: 1, gap: 4 },
  editLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  editInput: {
    backgroundColor: isDark ? t.card : t.background, borderRadius: 12, borderWidth: 1,
    borderColor: t.border, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: t.text,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: t.accent, borderRadius: 14, padding: 14, marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 14, paddingBottom: 40,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: t.border, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: t.text, textAlign: 'center' },
  modalSub: { fontSize: 13, color: t.textMuted, textAlign: 'center' },
  codeInput: {
    backgroundColor: t.surface, borderRadius: 14, borderWidth: 1.5,
    borderColor: t.border, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 22, fontWeight: '700', color: t.text, textAlign: 'center', letterSpacing: 6,
  },
  modalCancel: { alignItems: 'center', paddingVertical: 8 },
  modalCancelText: { fontSize: 13, color: t.textMuted, fontWeight: '600' },

  photoPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoPreview: { width: 64, height: 64, borderRadius: 20, borderWidth: 2, borderColor: t.border },
  photoPlaceholder: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: t.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: t.border,
  },
  photoPlaceholderText: { fontSize: 24, fontWeight: '900', color: t.textSecondary },
  photoPickerBtns: { flex: 1, gap: 8 },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: t.surface, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.border,
  },
  photoBtnText: { fontSize: 12, fontWeight: '700', color: t.textSecondary },

  bioInput: { minHeight: 70, textAlignVertical: 'top' },

  friendsEmpty: { fontSize: 12, color: t.textMuted, lineHeight: 17 },
  friendsList: { gap: 8 },
  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: isDark ? t.card : t.card, borderRadius: 14,
    padding: 10, borderWidth: 1, borderColor: t.border,
    ...cardShadow,
  },
  friendAvatar: { width: 40, height: 40, borderRadius: 14, borderWidth: 2 },
  friendAvatarLetter: { fontSize: 16, fontWeight: '900' },
  friendName: { fontSize: 14, fontWeight: '700', color: t.text },
  friendLevel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 1 },

  prValueBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prEditInput: {
    backgroundColor: isDark ? t.card : t.background, borderRadius: 8, borderWidth: 1,
    borderColor: t.accent, paddingHorizontal: 8, paddingVertical: 4,
    fontSize: 16, fontWeight: '700', color: t.text, width: 70, textAlign: 'right',
  },
  prEditConfirm: {
    width: 28, height: 28, borderRadius: 10,
    backgroundColor: t.surface, justifyContent: 'center', alignItems: 'center',
  },

  referralDesc: { fontSize: 12, color: t.textMuted, lineHeight: 17 },
  referralBox: {
    backgroundColor: isDark ? t.card : t.background, borderRadius: 14, borderWidth: 1.5,
    borderColor: t.border, paddingVertical: 14, alignItems: 'center',
    borderStyle: 'dashed',
  },
  referralCode: { fontSize: 26, fontWeight: '900', color: t.text, letterSpacing: 6 },
  referralBtns: { flexDirection: 'row', gap: 10 },
  referralBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 14, paddingVertical: 11,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  referralBtnShare: { backgroundColor: t.accent, borderColor: t.accent },
  referralBtnText: { fontSize: 13, fontWeight: '700', color: t.textSecondary },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, backgroundColor: t.surface, borderColor: t.border },
  roleBadgeText: { fontSize: 12, fontWeight: '700' as const, color: t.textSecondary },
  inviteCodeRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  inviteCodeText: { fontSize: 14, fontWeight: '700' as const, letterSpacing: 2, color: t.text },
  deleteAccountBtn: {
    backgroundColor: '#EF4444', borderRadius: 14, padding: 14,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  deleteAccountText: { color: '#fff', fontSize: 14, fontWeight: '700' as const },
}); }
