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
import { HomeStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Profile'>;

const TABS = ['Stats', 'PR', 'Badges', 'Compte'];

const PR_CATEGORIES = [
  {
    label: 'Haltérophilie',
    icon: '🏋️',
    items: [
      { movement: 'Back Squat', value: '120', unit: 'kg', date: '12 Jan 2025' },
      { movement: 'Front Squat', value: '100', unit: 'kg', date: '20 Jan 2025' },
      { movement: 'Deadlift', value: '160', unit: 'kg', date: '01 Jan 2025' },
      { movement: 'Bench Press', value: '100', unit: 'kg', date: '15 Fév 2025' },
      { movement: 'OHP Strict', value: '70', unit: 'kg', date: '10 Fév 2025' },
      { movement: 'Clean', value: '105', unit: 'kg', date: '28 Jan 2025' },
      { movement: 'Snatch', value: '80', unit: 'kg', date: '05 Mars 2025' },
      { movement: 'Clean & Jerk', value: '95', unit: 'kg', date: '28 Fév 2025' },
      { movement: 'Thruster 1RM', value: '80', unit: 'kg', date: '14 Mars 2025' },
    ],
  },
  {
    label: 'Gymnastics',
    icon: '🤸',
    items: [
      { movement: 'Pull-ups max', value: '34', unit: 'reps', date: '08 Mars 2025' },
      { movement: 'HSPU max', value: '20', unit: 'reps', date: '12 Mars 2025' },
      { movement: 'Ring Muscle-up', value: '8', unit: 'reps', date: '01 Mars 2025' },
      { movement: 'Bar Muscle-up', value: '12', unit: 'reps', date: '05 Fév 2025' },
      { movement: 'L-Sit', value: '45', unit: 'sec', date: '20 Fév 2025' },
      { movement: 'Rope Climb', value: '4', unit: 'montées', date: '10 Fév 2025' },
      { movement: 'Dips', value: '30', unit: 'reps', date: '15 Jan 2025' },
    ],
  },
  {
    label: 'Benchmarks CrossFit',
    icon: '🏆',
    items: [
      { movement: 'Fran', value: '3:42', unit: 'min', date: '20 Fév 2025' },
      { movement: 'Grace', value: '4:15', unit: 'min', date: '15 Fév 2025' },
      { movement: 'Helen', value: '9:20', unit: 'min', date: '08 Fév 2025' },
      { movement: 'Cindy', value: '22', unit: 'rounds', date: '10 Mars 2025' },
      { movement: 'Diane', value: '5:30', unit: 'min', date: '01 Fév 2025' },
      { movement: 'DT', value: '8:45', unit: 'min', date: '18 Fév 2025' },
      { movement: 'Murph', value: '42:10', unit: 'min', date: '25 Jan 2025' },
    ],
  },
  {
    label: 'Cardio & Endurance',
    icon: '🏃',
    items: [
      { movement: '500m Aviron', value: '1:32', unit: 'min', date: '05 Mars 2025' },
      { movement: '2km Aviron', value: '7:10', unit: 'min', date: '12 Fév 2025' },
      { movement: '1km Course', value: '3:45', unit: 'min', date: '20 Jan 2025' },
      { movement: '5km Course', value: '21:30', unit: 'min', date: '01 Mars 2025' },
      { movement: 'Assault Bike 1min', value: '28', unit: 'cal', date: '15 Mars 2025' },
    ],
  },
];

const BADGE_CATEGORIES = [
  {
    label: 'Compétition',
    badges: [
      { id: 'b1', name: 'Premier Sang', desc: '1er match remporté', icon: '⚔️', earned: true },
      { id: 'b2', name: '10 Victoires', desc: '10 matchs gagnés', icon: '🏅', earned: true },
      { id: 'b3', name: 'Série de Feu', desc: '5 victoires consécutives', icon: '🔥', earned: true },
      { id: 'b4', name: 'Centurion', desc: '100 matchs disputés', icon: '🛡️', earned: false },
      { id: 'b5', name: 'Invaincu', desc: '10 matchs sans défaite', icon: '💎', earned: false },
      { id: 'b6', name: 'Champion', desc: 'Remporter un tournoi', icon: '🏆', earned: false },
    ],
  },
  {
    label: 'Performance',
    badges: [
      { id: 'b7', name: 'Elite RX', desc: 'Atteindre le niveau RX', icon: '⭐', earned: true },
      { id: 'b8', name: 'Sub-4 Fran', desc: 'Fran en moins de 4 min', icon: '⚡', earned: true },
      { id: 'b9', name: 'Barbell King', desc: '100kg+ au Snatch', icon: '🏋️', earned: false },
      { id: 'b10', name: 'Iron Man', desc: '200kg+ au Deadlift', icon: '�', earned: false },
      { id: 'b11', name: 'Murph Club', desc: 'Murph en moins de 40min', icon: '🦅', earned: false },
      { id: 'b12', name: 'Muscle-up King', desc: '10 Ring MU en série', icon: '🤸', earned: false },
    ],
  },
  {
    label: 'Régularité',
    badges: [
      { id: 'b13', name: 'WOD Machine', desc: '50 WOD générés', icon: '🤖', earned: true },
      { id: 'b14', name: 'Semaine Parfaite', desc: '7 jours de suite actif', icon: '📅', earned: true },
      { id: 'b15', name: 'Mois de Feu', desc: '30 WOD dans le mois', icon: '🗓️', earned: false },
      { id: 'b16', name: 'Vétéran', desc: '1 an d\'activité', icon: '🎖️', earned: false },
      { id: 'b17', name: 'Maître Zen', desc: '100 WOD générés', icon: '🧘', earned: false },
    ],
  },
  {
    label: 'Communauté',
    badges: [
      { id: 'b18', name: 'Capitaine', desc: 'Créer une équipe', icon: '👑', earned: false },
      { id: 'b19', name: 'Recruteur', desc: 'Inviter 5 membres', icon: '🤝', earned: false },
      { id: 'b20', name: 'Légende', desc: 'Atteindre 2000 ELO', icon: '🌟', earned: false },
      { id: 'b21', name: 'Ambassadeur', desc: 'Parrainer une salle', icon: '🏠', earned: false },
    ],
  },
];

export default function ProfileScreen() {
  const { user, signOut, currentBox, joinBox, leaveBox, updateUser } = useAuth();
  const { theme, mode, toggleTheme } = useTheme();
  const navigation = useNavigation<Nav>();
  const S = createStyles(theme);
  const [activeTab, setActiveTab]   = useState(3);
  const [expandedPR, setExpandedPR] = useState<string | null>('Haltérophilie');

  // ── Referral code
  const [referralCode, setReferralCode] = useState<string>('');
  // ── WOD count
  const [wodCount, setWodCount] = useState<number>(0);
  // ── Friends
  const [friends, setFriends] = useState<Array<{ id: string; username: string; level: string; avatar_url?: string }>>([]);
  // ── PR editing
  const [editingPR, setEditingPR] = useState<string | null>(null);
  const [prValues, setPrValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    PR_CATEGORIES.forEach(cat => cat.items.forEach(item => {
      init[`${cat.label}_${item.movement}`] = item.value;
    }));
    return init;
  });

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
    if (user?.id) { loadWodCount(); loadFriends(); loadPRs(); }
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
    await Share.share({ message: referralCode, title: 'Code de parrainage TheHub' });
  }

  async function handleShareReferral() {
    await Share.share({
      message: `Rejoins-moi sur TheHub ! Utilise mon code de parrainage : ${referralCode} 🏋️`,
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
      message: `Rejoins ma box « ${currentBox.name} » sur TheHub !\nCode d'invitation : ${currentBox.invite_code} 🏋️`,
    });
  }

  // ── Auto PR badge logic
  const hasPR = Object.values(prValues).some(v => parseFloat(v) > 0);
  const prImproved3 = Object.values(prValues).filter(v => parseFloat(v) >= 100).length >= 3;
  const COMPUTED_BADGES = BADGE_CATEGORIES.map(cat => ({
    ...cat,
    badges: cat.badges.map(b => ({
      ...b,
      earned: b.id === 'b1' ? hasPR
        : b.id === 'b2' ? prImproved3
        : b.earned,
    })),
  }));
  const earnedCount = COMPUTED_BADGES.flatMap(c => c.badges).filter(b => b.earned).length;
  const totalBadges = COMPUTED_BADGES.flatMap(c => c.badges).length;

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
            <LogOut color="#9CA3AF" size={20} />
          </TouchableOpacity>
        </View>

        <View style={S.statsRow}>
          {[
            { label: 'ELO', value: user?.elo ?? 1000 },
            { label: 'Victoires', value: user?.wins ?? 0 },
            { label: 'Matchs', value: user?.total_matches ?? 0 },
            { label: 'Win Rate', value: `${winRate}%` },
          ].map((s, i) => (
            <View key={s.label} style={[S.statPill, i < 3 && S.statPillBorder]}>
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
                  <s.icon color="#111" size={18} />
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
                      color="#D1D5DB" size={16}
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
                          <Text style={S.prDate}>{pr.date}</Text>
                        </View>
                        {isEditingThis ? (
                          <View style={S.prEditRow}>
                            <TextInput
                              style={S.prEditInput}
                              value={prValues[key]}
                              onChangeText={v => setPrValues(prev => ({ ...prev, [key]: v }))}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                            />
                            <Text style={S.prUnit}>{pr.unit}</Text>
                            <TouchableOpacity onPress={() => { setEditingPR(null); savePRs(prValues); }} style={S.prEditConfirm}>
                              <Check color="#111" size={16} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => setEditingPR(key)} style={S.prValueBtn}>
                            <Text style={S.prValue}>{prValues[key]} <Text style={S.prUnit}>{pr.unit}</Text></Text>
                            <Edit3 color="#D1D5DB" size={12} />
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
                <Text style={{ fontWeight: '900', color: '#111' }}>{earnedCount}</Text>
                {' '}badges obtenus sur{' '}
                <Text style={{ fontWeight: '900' }}>{totalBadges}</Text>
              </Text>
            </View>
            {COMPUTED_BADGES.map((cat) => (
              <View key={cat.label} style={S.badgeCategoryBlock}>
                <Text style={S.badgeCategoryTitle}>{cat.label}</Text>
                <View style={S.badgesGrid}>
                  {cat.badges.map((badge) => (
                    <View key={badge.id} style={[S.badgeCard, !badge.earned && S.badgeCardLocked]}>
                      <Text style={S.badgeIcon}>{badge.earned ? badge.icon : '🔒'}</Text>
                      <Text style={[S.badgeName, !badge.earned && { color: '#9CA3AF' }]}>
                        {badge.name}
                      </Text>
                      <Text style={S.badgeDesc}>{badge.desc}</Text>
                      {badge.earned && <View style={S.earnedBar} />}
                    </View>
                  ))}
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
                    <Building2 color="#111" size={20} />
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
                    <Hash color="#fff" size={16} />
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
                    <Edit3 color="#111" size={16} />
                    <Text style={S.editIconText}>Modifier</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setEditing(false)} style={S.editIconBtn}>
                    <X color="#9CA3AF" size={16} />
                    <Text style={[S.editIconText, { color: '#9CA3AF' }]}>Annuler</Text>
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
                    <View style={[S.roleBadge, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }]}>
                      <Text style={[S.roleBadgeText, { color: '#374151' }]}>{roleLabel}</Text>
                    </View>
                  </View>
                  {/* Box invite code (owner only) */}
                  {user?.role === 'box_owner' && currentBox?.invite_code && (
                    <View style={S.infoRow}>
                      <Text style={S.infoRowLabel}>Code box</Text>
                      <TouchableOpacity style={S.inviteCodeRow} onPress={handleShareBoxCode} activeOpacity={0.7}>
                        <Text style={S.inviteCodeText}>{currentBox.invite_code}</Text>
                        <Share2 size={14} color="#111" style={{ marginLeft: 6 }} />
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
                        {pickingPhoto ? <ActivityIndicator color="#111" size="small" /> : <><Camera color="#374151" size={14} /><Text style={S.photoBtnText}>Galerie</Text></>}
                      </TouchableOpacity>
                      <TouchableOpacity style={S.photoBtn} onPress={handleTakePhoto} disabled={pickingPhoto} activeOpacity={0.8}>
                        <Camera color="#9CA3AF" size={14} />
                        <Text style={[S.photoBtnText, { color: '#9CA3AF' }]}>Caméra</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={S.editLabel}>Pseudo</Text>
                  <TextInput style={S.editInput} value={editUsername} onChangeText={setEditUsername} autoCapitalize="none" placeholder="Pseudo" placeholderTextColor={'#D1D5DB'} />

                  <View style={S.editRow}>
                    <View style={S.editField}>
                      <Text style={S.editLabel}>Prénom</Text>
                      <TextInput style={S.editInput} value={firstName} onChangeText={setFirstName} placeholder="Prénom" placeholderTextColor={'#D1D5DB'} />
                    </View>
                    <View style={S.editField}>
                      <Text style={S.editLabel}>Nom</Text>
                      <TextInput style={S.editInput} value={lastName} onChangeText={setLastName} placeholder="Nom" placeholderTextColor={'#D1D5DB'} />
                    </View>
                  </View>

                  <Text style={S.editLabel}>Email</Text>
                  <TextInput style={S.editInput} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Email" placeholderTextColor={'#D1D5DB'} />

                  <Text style={S.editLabel}>Bio (avec #hashtags)</Text>
                  <TextInput
                    style={[S.editInput, S.bioInput]}
                    value={editBio}
                    onChangeText={setEditBio}
                    multiline
                    numberOfLines={3}
                    placeholder="Parle de toi... #crossfit #rx #motivation"
                    placeholderTextColor={'#D1D5DB'}
                  />

                  <TouchableOpacity style={S.saveBtn} onPress={handleSaveProfile} disabled={saving} activeOpacity={0.85}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <><Check color="#fff" size={16} /><Text style={S.saveBtnText}>Enregistrer</Text></>}
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
                        <ChevronRight color="#D1D5DB" size={16} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* ── Apparence ───────────────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>Apparence</Text>
              <View style={S.themeRow}>
                <Text style={S.themeLabel}>{mode === 'dark' ? '🌙 Mode sombre' : '☀️ Mode clair'}</Text>
                <Switch
                  value={mode === 'dark'}
                  onValueChange={toggleTheme}
                  trackColor={{ false: '#E5E7EB', true: '#111' }}
                  thumbColor={mode === 'dark' ? '#fff' : '#fff'}
                  ios_backgroundColor={'#E5E7EB'}
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
                  <Bell color="#111" size={18} />
                  <Text style={S.themeLabel}>Notifications</Text>
                </View>
                <ChevronRight color="#D1D5DB" size={16} />
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
                <ActivityIndicator color="#111" size="small" style={{ marginVertical: 8 }} />
              )}
              <View style={S.referralBtns}>
                <TouchableOpacity style={S.referralBtn} onPress={handleCopyReferral} disabled={!referralCode} activeOpacity={0.8}>
                  <Copy color="#374151" size={15} />
                  <Text style={S.referralBtnText}>Copier</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.referralBtn, S.referralBtnShare]} onPress={handleShareReferral} disabled={!referralCode} activeOpacity={0.8}>
                  <Share2 color="#fff" size={15} />
                  <Text style={[S.referralBtnText, { color: '#fff' }]}>Partager</Text>
                </TouchableOpacity>
              </View>
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
              placeholderTextColor={'#D1D5DB'}
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
              {joining ? <ActivityIndicator color="#fff" size="small" /> : <><Hash color="#fff" size={16} /><Text style={S.joinBtnText}>Rejoindre</Text></>}
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

function createStyles(_theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingTop: 58, paddingHorizontal: 20, paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  avatarText: { fontSize: 22, fontWeight: '900', color: '#111' },
  userInfo: { flex: 1 },
  username: { fontSize: 20, fontWeight: '900', color: '#111', letterSpacing: -0.5 },
  email: { fontSize: 11, color: '#9CA3AF', marginBottom: 6 },
  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', borderWidth: 1,
  },
  levelDot: { width: 5, height: 5, borderRadius: 3 },
  levelText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  logoutBtn: { padding: 8 },
  statsRow: { flexDirection: 'row', marginBottom: 16 },
  statPill: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statPillBorder: { borderRightWidth: 1, borderRightColor: '#E5E7EB' },
  statPillValue: { fontSize: 20, fontWeight: '900', color: '#111' },
  statPillLabel: { fontSize: 9, color: '#9CA3AF', fontWeight: '600', marginTop: 2, letterSpacing: 0.3 },
  progressSection: {},
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  progressPct: { fontSize: 11, fontWeight: '700', color: '#111' },
  progressTrack: { height: 3, backgroundColor: '#F3F4F6', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: '#111', borderRadius: 2 },
  progressNote: { fontSize: 10, color: '#D1D5DB' },
  tabs: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#111' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#D1D5DB' },
  tabTextActive: { color: '#111', fontWeight: '800' },
  content: { padding: 20 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: {
    width: '47%', backgroundColor: '#FAFAFA', borderRadius: 14,
    padding: 16, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  gridValue: { fontSize: 22, fontWeight: '900', color: '#111' },
  gridLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textAlign: 'center' },
  prCategory: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#F3F4F6', marginBottom: 10, overflow: 'hidden',
  },
  prCategoryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14,
  },
  prCategoryIcon: { fontSize: 18 },
  prCategoryLabel: { flex: 1, fontSize: 14, fontWeight: '800', color: '#111' },
  prCategoryCount: { fontSize: 11, color: '#D1D5DB' },
  prRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  prMovement: { flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' },
  prDate: { fontSize: 10, color: '#D1D5DB', marginRight: 12 },
  prValue: { fontSize: 15, fontWeight: '900', color: '#111' },
  prUnit: { fontSize: 11, color: '#9CA3AF', fontWeight: '400' },
  badgeSummary: { marginBottom: 16 },
  badgeSummaryText: { fontSize: 13, color: '#374151' },
  badgeCategoryBlock: { marginBottom: 24 },
  badgeCategoryTitle: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeCard: {
    width: '47%', backgroundColor: '#FAFAFA', borderRadius: 14,
    padding: 14, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  badgeCardLocked: { opacity: 0.3 },
  badgeIcon: { fontSize: 26, marginBottom: 4 },
  badgeName: { fontSize: 12, fontWeight: '800', color: '#111', textAlign: 'center' },
  badgeDesc: { fontSize: 10, color: '#9CA3AF', textAlign: 'center', lineHeight: 14 },
  earnedBar: { height: 2, width: 24, backgroundColor: '#111', borderRadius: 1, marginTop: 4 },

  compteSection: { gap: 16, paddingBottom: 8 },
  compteCard: {
    backgroundColor: '#FAFAFA', borderRadius: 16,
    borderWidth: 1, borderColor: '#F3F4F6', padding: 16, gap: 14,
  },
  compteCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compteCardTitle: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 },
  editIconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editIconText: { fontSize: 12, fontWeight: '700', color: '#111' },
  themeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  themeLabel: { fontSize: 14, fontWeight: '600', color: '#111' },

  boxRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  boxName: { fontSize: 15, fontWeight: '800', color: '#111' },
  boxDesc: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  activeTag: {
    backgroundColor: '#F3F4F6', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#E5E7EB',
  },
  activeTagText: { fontSize: 10, fontWeight: '800', color: '#111' },
  noBoxText: { fontSize: 13, color: '#9CA3AF' },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#111', borderRadius: 12, padding: 14,
  },
  joinBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  leaveBtn: {
    borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 12,
    padding: 12, alignItems: 'center',
  },
  leaveBtnText: { color: '#374151', fontSize: 13, fontWeight: '700' },

  infoRows: { gap: 0 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  infoRowLabel: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  infoRowValue: { fontSize: 13, fontWeight: '700', color: '#111', maxWidth: '60%' },

  editForm: { gap: 12 },
  editRow: { flexDirection: 'row', gap: 10 },
  editField: { flex: 1, gap: 4 },
  editLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.4 },
  editInput: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1,
    borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111',
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#111', borderRadius: 12, padding: 14, marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 14, paddingBottom: 40,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#111', textAlign: 'center' },
  modalSub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  codeInput: {
    backgroundColor: '#FAFAFA', borderRadius: 14, borderWidth: 1.5,
    borderColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 22, fontWeight: '900', color: '#111', textAlign: 'center', letterSpacing: 6,
  },
  modalCancel: { alignItems: 'center', paddingVertical: 8 },
  modalCancelText: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },

  photoPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoPreview: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#E5E7EB' },
  photoPlaceholder: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#E5E7EB',
  },
  photoPlaceholderText: { fontSize: 24, fontWeight: '900', color: '#374151' },
  photoPickerBtns: { flex: 1, gap: 8 },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F3F4F6', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  photoBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },

  bioInput: { minHeight: 70, textAlignVertical: 'top' },

  friendsEmpty: { fontSize: 12, color: '#9CA3AF', lineHeight: 17 },
  friendsList: { gap: 8 },
  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12,
    padding: 10, borderWidth: 1, borderColor: '#F3F4F6',
  },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2 },
  friendAvatarLetter: { fontSize: 16, fontWeight: '900' },
  friendName: { fontSize: 14, fontWeight: '700', color: '#111' },
  friendLevel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginTop: 1 },

  prValueBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prEditInput: {
    backgroundColor: '#fff', borderRadius: 8, borderWidth: 1,
    borderColor: '#111', paddingHorizontal: 8, paddingVertical: 4,
    fontSize: 16, fontWeight: '800', color: '#111', width: 70, textAlign: 'right',
  },
  prEditConfirm: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center',
  },

  referralDesc: { fontSize: 12, color: '#9CA3AF', lineHeight: 17 },
  referralBox: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5,
    borderColor: '#E5E7EB', paddingVertical: 14, alignItems: 'center',
    borderStyle: 'dashed',
  },
  referralCode: { fontSize: 26, fontWeight: '900', color: '#111', letterSpacing: 6 },
  referralBtns: { flexDirection: 'row', gap: 10 },
  referralBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 12, paddingVertical: 11,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  referralBtnShare: { backgroundColor: '#111', borderColor: '#111' },
  referralBtnText: { fontSize: 13, fontWeight: '800', color: '#374151' },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  roleBadgeText: { fontSize: 12, fontWeight: '800' as const },
  inviteCodeRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  inviteCodeText: { fontSize: 14, fontWeight: '800' as const, letterSpacing: 2, color: '#111' },
}); }
