import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Share,
} from 'react-native';
import { Trophy, Zap, TrendingUp, Award, LogOut, Star, Flame, ChevronRight, Hash, Building2, Edit3, Check, X, Camera, Copy, Share2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
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
  const navigation = useNavigation<Nav>();
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
    await Share.share({ message: referralCode, title: 'Code de parrainage BattleWOD' });
  }

  async function handleShareReferral() {
    await Share.share({
      message: `Rejoins-moi sur BattleWOD ! Utilise mon code de parrainage : ${referralCode} 🏋️`,
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
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={[styles.avatar, { borderColor: levelColor }]} />
          ) : (
            <View style={[styles.avatar, { borderColor: levelColor }]}>
              <Text style={styles.avatarText}>{user?.username?.[0]?.toUpperCase() ?? 'A'}</Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.username}>{user?.username ?? 'Athlète'}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={[styles.levelBadge, { backgroundColor: `${levelColor}18`, borderColor: `${levelColor}40` }]}>
              <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
              <Text style={[styles.levelText, { color: levelColor }]}>
                {(user?.level ?? 'scaled').toUpperCase()}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.logoutBtn}>
            <LogOut color={Colors.textMuted} size={20} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: 'ELO', value: user?.elo ?? 1000 },
            { label: 'Victoires', value: user?.wins ?? 0 },
            { label: 'Matchs', value: user?.total_matches ?? 0 },
            { label: 'Win Rate', value: `${winRate}%` },
          ].map((s, i) => (
            <View key={s.label} style={[styles.statPill, i < 3 && styles.statPillBorder]}>
              <Text style={styles.statPillValue}>{s.value}</Text>
              <Text style={styles.statPillLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Progression vers Légende</Text>
            <Text style={styles.progressPct}>{Math.round(eloProgress)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${eloProgress}%` as any }]} />
          </View>
          <Text style={styles.progressNote}>{(user?.elo ?? 1000)} / 2000 ELO</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab, i) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(i)}
            style={[styles.tab, activeTab === i && styles.tabActive]}>
            <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {activeTab === 0 && (
          <>
            <View style={styles.gridRow}>
              {[
                { label: 'Total matchs', value: user?.total_matches ?? 0, icon: Zap },
                { label: 'Victoires', value: user?.wins ?? 0, icon: Trophy },
                { label: 'Défaites', value: (user?.total_matches ?? 0) - (user?.wins ?? 0), icon: TrendingUp },
                { label: 'Win Rate', value: `${winRate}%`, icon: Star },
                { label: 'Série actuelle', value: 5, icon: Flame },
                { label: 'Badges obtenus', value: `${earnedCount}/${totalBadges}`, icon: Award },
                ...(currentBox ? [{ label: 'WODs effectués', value: wodCount, icon: Zap }] : []),
              ].map((s) => (
                <View key={s.label} style={styles.gridCard}>
                  <s.icon color={Colors.primary} size={18} />
                  <Text style={styles.gridValue}>{s.value}</Text>
                  <Text style={styles.gridLabel}>{s.label}</Text>
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
                <View key={cat.label} style={styles.prCategory}>
                  <TouchableOpacity
                    style={styles.prCategoryHeader}
                    onPress={() => setExpandedPR(isOpen ? null : cat.label)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.prCategoryIcon}>{cat.icon}</Text>
                    <Text style={styles.prCategoryLabel}>{cat.label}</Text>
                    <Text style={styles.prCategoryCount}>{cat.items.length} records</Text>
                    <ChevronRight
                      color={Colors.textMuted} size={16}
                      style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
                    />
                  </TouchableOpacity>
                  {isOpen && cat.items.map((pr, i) => {
                    const key = `${cat.label}_${pr.movement}`;
                    const isEditingThis = editingPR === key;
                    return (
                      <View key={i} style={[styles.prRow, i === cat.items.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.prMovement}>{pr.movement}</Text>
                          <Text style={styles.prDate}>{pr.date}</Text>
                        </View>
                        {isEditingThis ? (
                          <View style={styles.prEditRow}>
                            <TextInput
                              style={styles.prEditInput}
                              value={prValues[key]}
                              onChangeText={v => setPrValues(prev => ({ ...prev, [key]: v }))}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                            />
                            <Text style={styles.prUnit}>{pr.unit}</Text>
                            <TouchableOpacity onPress={() => { setEditingPR(null); savePRs(prValues); }} style={styles.prEditConfirm}>
                              <Check color={Colors.success} size={16} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => setEditingPR(key)} style={styles.prValueBtn}>
                            <Text style={styles.prValue}>{prValues[key]} <Text style={styles.prUnit}>{pr.unit}</Text></Text>
                            <Edit3 color={Colors.textMuted} size={12} />
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
            <View style={styles.badgeSummary}>
              <Text style={styles.badgeSummaryText}>
                <Text style={{ fontWeight: '900', color: Colors.primary }}>{earnedCount}</Text>
                {' '}badges obtenus sur{' '}
                <Text style={{ fontWeight: '900' }}>{totalBadges}</Text>
              </Text>
            </View>
            {COMPUTED_BADGES.map((cat) => (
              <View key={cat.label} style={styles.badgeCategoryBlock}>
                <Text style={styles.badgeCategoryTitle}>{cat.label}</Text>
                <View style={styles.badgesGrid}>
                  {cat.badges.map((badge) => (
                    <View key={badge.id} style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}>
                      <Text style={styles.badgeIcon}>{badge.earned ? badge.icon : '🔒'}</Text>
                      <Text style={[styles.badgeName, !badge.earned && { color: Colors.textMuted }]}>
                        {badge.name}
                      </Text>
                      <Text style={styles.badgeDesc}>{badge.desc}</Text>
                      {badge.earned && <View style={styles.earnedBar} />}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
        {activeTab === 3 && (
          <View style={styles.compteSection}>

            {/* ── Box ─────────────────────────────────── */}
            <View style={styles.compteCard}>
              <Text style={styles.compteCardTitle}>Ma box</Text>
              {currentBox ? (
                <>
                  <View style={styles.boxRow}>
                    <Building2 color={Colors.primary} size={20} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.boxName}>{currentBox.name}</Text>
                      {currentBox.description ? <Text style={styles.boxDesc}>{currentBox.description}</Text> : null}
                    </View>
                    <View style={styles.activeTag}><Text style={styles.activeTagText}>Actif</Text></View>
                  </View>
                  <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveBox} activeOpacity={0.8}>
                    <Text style={styles.leaveBtnText}>Quitter la box</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.noBoxText}>Tu n'es rattaché à aucune box.</Text>
                  <TouchableOpacity style={styles.joinBtn} onPress={() => setJoinModal(true)} activeOpacity={0.8}>
                    <Hash color="#fff" size={16} />
                    <Text style={styles.joinBtnText}>Rejoindre une box</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* ── Edit profile ─────────────────────────── */}
            <View style={styles.compteCard}>
              <View style={styles.compteCardHeader}>
                <Text style={styles.compteCardTitle}>Mes informations</Text>
                {!editing ? (
                  <TouchableOpacity onPress={() => setEditing(true)} style={styles.editIconBtn}>
                    <Edit3 color={Colors.primary} size={16} />
                    <Text style={styles.editIconText}>Modifier</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setEditing(false)} style={styles.editIconBtn}>
                    <X color={Colors.textMuted} size={16} />
                    <Text style={[styles.editIconText, { color: Colors.textMuted }]}>Annuler</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!editing ? (
                <View style={styles.infoRows}>
                  <InfoRow label="Pseudo" value={user?.username ?? ''} />
                  <InfoRow label="Nom" value={user?.full_name || '—'} />
                  <InfoRow label="Email" value={user?.email ?? ''} />
                  <InfoRow label="Bio" value={user?.bio || 'Non renseignée'} />
                  <InfoRow label="Photo" value={user?.avatar_url ? 'Définie' : 'Non définie'} />
                </View>
              ) : (
                <View style={styles.editForm}>
                  {/* Photo */}
                  <View style={styles.photoPickerRow}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.photoPreview} />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Text style={styles.photoPlaceholderText}>{user?.username?.[0]?.toUpperCase() ?? 'A'}</Text>
                      </View>
                    )}
                    <View style={styles.photoPickerBtns}>
                      <TouchableOpacity style={styles.photoBtn} onPress={handlePickPhoto} disabled={pickingPhoto} activeOpacity={0.8}>
                        {pickingPhoto ? <ActivityIndicator color={Colors.primary} size="small" /> : <><Camera color={Colors.primary} size={14} /><Text style={styles.photoBtnText}>Galerie</Text></>}
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto} disabled={pickingPhoto} activeOpacity={0.8}>
                        <Camera color={Colors.textMuted} size={14} />
                        <Text style={[styles.photoBtnText, { color: Colors.textMuted }]}>Caméra</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.editLabel}>Pseudo</Text>
                  <TextInput style={styles.editInput} value={editUsername} onChangeText={setEditUsername} autoCapitalize="none" placeholder="Pseudo" placeholderTextColor={Colors.textMuted} />

                  <View style={styles.editRow}>
                    <View style={styles.editField}>
                      <Text style={styles.editLabel}>Prénom</Text>
                      <TextInput style={styles.editInput} value={firstName} onChangeText={setFirstName} placeholder="Prénom" placeholderTextColor={Colors.textMuted} />
                    </View>
                    <View style={styles.editField}>
                      <Text style={styles.editLabel}>Nom</Text>
                      <TextInput style={styles.editInput} value={lastName} onChangeText={setLastName} placeholder="Nom" placeholderTextColor={Colors.textMuted} />
                    </View>
                  </View>

                  <Text style={styles.editLabel}>Email</Text>
                  <TextInput style={styles.editInput} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Email" placeholderTextColor={Colors.textMuted} />

                  <Text style={styles.editLabel}>Bio (avec #hashtags)</Text>
                  <TextInput
                    style={[styles.editInput, styles.bioInput]}
                    value={editBio}
                    onChangeText={setEditBio}
                    multiline
                    numberOfLines={3}
                    placeholder="Parle de toi... #crossfit #rx #motivation"
                    placeholderTextColor={Colors.textMuted}
                  />

                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} disabled={saving} activeOpacity={0.85}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <><Check color="#fff" size={16} /><Text style={styles.saveBtnText}>Enregistrer</Text></>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {/* ── Mes amis ─────────────────────────────── */}
            <View style={styles.compteCard}>
              <Text style={styles.compteCardTitle}>Mes amis ({friends.length})</Text>
              {friends.length === 0 ? (
                <Text style={styles.friendsEmpty}>Aucun ami pour l'instant. Consulte les profils publics pour en ajouter.</Text>
              ) : (
                <View style={styles.friendsList}>
                  {friends.map(f => {
                    const fc = LevelColors[f.level as keyof typeof LevelColors] ?? Colors.primary;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={styles.friendRow}
                        onPress={() => navigation.navigate('PublicProfile', { userId: f.id })}
                        activeOpacity={0.8}
                      >
                        {f.avatar_url ? (
                          <Image source={{ uri: f.avatar_url }} style={[styles.friendAvatar, { borderColor: fc }]} />
                        ) : (
                          <View style={[styles.friendAvatar, { borderColor: fc, backgroundColor: `${fc}20`, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={[styles.friendAvatarLetter, { color: fc }]}>{f.username?.[0]?.toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.friendName}>{f.username}</Text>
                          <Text style={[styles.friendLevel, { color: fc }]}>{f.level?.toUpperCase()}</Text>
                        </View>
                        <ChevronRight color={Colors.textMuted} size={16} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* ── Referral code ────────────────────────── */}
            <View style={styles.compteCard}>
              <Text style={styles.compteCardTitle}>Mon code de parrainage</Text>
              <Text style={styles.referralDesc}>
                Partage ce code pour inviter des amis et gagner des récompenses.
              </Text>
              {referralCode ? (
                <View style={styles.referralBox}>
                  <Text style={styles.referralCode}>{referralCode}</Text>
                </View>
              ) : (
                <ActivityIndicator color={Colors.primary} size="small" style={{ marginVertical: 8 }} />
              )}
              <View style={styles.referralBtns}>
                <TouchableOpacity style={styles.referralBtn} onPress={handleCopyReferral} disabled={!referralCode} activeOpacity={0.8}>
                  <Copy color={Colors.primary} size={15} />
                  <Text style={styles.referralBtnText}>Copier</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.referralBtn, styles.referralBtnShare]} onPress={handleShareReferral} disabled={!referralCode} activeOpacity={0.8}>
                  <Share2 color="#fff" size={15} />
                  <Text style={[styles.referralBtnText, { color: '#fff' }]}>Partager</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Join box modal ────────────────────────────────────── */}
      <Modal visible={joinModal} transparent animationType="slide" onRequestClose={() => setJoinModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Rejoindre une box</Text>
            <Text style={styles.modalSub}>Entre le code d'invitation (6 caractères)</Text>
            <TextInput
              style={styles.codeInput}
              value={joinCode}
              onChangeText={t => setJoinCode(t.toUpperCase())}
              placeholder="Ex : ABC123"
              placeholderTextColor={Colors.textMuted}
              maxLength={6}
              autoCapitalize="characters"
              autoFocus
            />
            <TouchableOpacity
              style={[styles.joinBtn, (!joinCode.trim() || joining) && { opacity: 0.5 }]}
              onPress={handleJoinBox}
              disabled={!joinCode.trim() || joining}
              activeOpacity={0.85}
            >
              {joining ? <ActivityIndicator color="#fff" size="small" /> : <><Hash color="#fff" size={16} /><Text style={styles.joinBtnText}>Rejoindre</Text></>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setJoinModal(false)} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <Text style={styles.infoRowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  avatarText: { fontSize: 24, fontWeight: '900', color: Colors.text },
  userInfo: { flex: 1 },
  username: { fontSize: 18, fontWeight: '900', color: Colors.text },
  email: { fontSize: 11, color: Colors.textMuted, marginBottom: 6 },
  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', borderWidth: 1,
  },
  levelDot: { width: 5, height: 5, borderRadius: 3 },
  levelText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  logoutBtn: { padding: 8 },
  statsRow: { flexDirection: 'row', marginBottom: 14 },
  statPill: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statPillBorder: { borderRightWidth: 1, borderRightColor: Colors.border },
  statPillValue: { fontSize: 18, fontWeight: '900', color: Colors.text },
  statPillLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '600', marginTop: 1 },
  progressSection: {},
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  progressPct: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  progressTrack: { height: 4, backgroundColor: Colors.surface, borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  progressNote: { fontSize: 10, color: Colors.textMuted },
  tabs: {
    flexDirection: 'row', backgroundColor: Colors.background,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary, fontWeight: '800' },
  content: { padding: 16 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: {
    width: '47%', backgroundColor: Colors.card, borderRadius: 12,
    padding: 16, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  gridValue: { fontSize: 22, fontWeight: '900', color: Colors.text },
  gridLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textAlign: 'center' },
  prCategory: {
    backgroundColor: Colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 10, overflow: 'hidden',
  },
  prCategoryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14,
  },
  prCategoryIcon: { fontSize: 20 },
  prCategoryLabel: { flex: 1, fontSize: 14, fontWeight: '800', color: Colors.text },
  prCategoryCount: { fontSize: 11, color: Colors.textMuted },
  prRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  prMovement: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text },
  prDate: { fontSize: 10, color: Colors.textMuted, marginRight: 12 },
  prValue: { fontSize: 15, fontWeight: '900', color: Colors.text },
  prUnit: { fontSize: 11, color: Colors.textMuted, fontWeight: '400' },
  badgeSummary: { marginBottom: 16 },
  badgeSummaryText: { fontSize: 13, color: Colors.textSecondary },
  badgeCategoryBlock: { marginBottom: 20 },
  badgeCategoryTitle: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badgeCard: {
    width: '47%', backgroundColor: Colors.card, borderRadius: 12,
    padding: 14, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  badgeCardLocked: { opacity: 0.35 },
  badgeIcon: { fontSize: 28, marginBottom: 4 },
  badgeName: { fontSize: 12, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  badgeDesc: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', lineHeight: 14 },
  earnedBar: { height: 2, width: 24, backgroundColor: Colors.success, borderRadius: 1, marginTop: 4 },

  // ── Compte tab
  compteSection: { gap: 14, paddingBottom: 8 },
  compteCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12,
  },
  compteCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compteCardTitle: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  editIconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editIconText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  // box display
  boxRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  boxName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  boxDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  activeTag: {
    backgroundColor: `${Colors.success}18`, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${Colors.success}40`,
  },
  activeTagText: { fontSize: 10, fontWeight: '800', color: Colors.success },
  noBoxText: { fontSize: 13, color: Colors.textMuted },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primary, borderRadius: 12, padding: 14,
  },
  joinBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  leaveBtn: {
    borderWidth: 1.5, borderColor: Colors.error, borderRadius: 12,
    padding: 12, alignItems: 'center',
  },
  leaveBtnText: { color: Colors.error, fontSize: 13, fontWeight: '800' },

  // info rows (read mode)
  infoRows: { gap: 0 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  infoRowLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  infoRowValue: { fontSize: 13, fontWeight: '700', color: Colors.text, maxWidth: '60%' },

  // edit form
  editForm: { gap: 10 },
  editRow: { flexDirection: 'row', gap: 10 },
  editField: { flex: 1, gap: 4 },
  editLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  editInput: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: Colors.text,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primary, borderRadius: 12, padding: 14, marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // join modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 14, paddingBottom: 40,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  modalSub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  codeInput: {
    backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 22, fontWeight: '900', color: Colors.text, textAlign: 'center', letterSpacing: 6,
  },
  modalCancel: { alignItems: 'center', paddingVertical: 8 },
  modalCancelText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },

  // ── Photo picker
  photoPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoPreview: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: Colors.primary },
  photoPlaceholder: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: `${Colors.primary}20`, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.border,
  },
  photoPlaceholderText: { fontSize: 24, fontWeight: '900', color: Colors.primary },
  photoPickerBtns: { flex: 1, gap: 8 },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${Colors.primary}12`, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  photoBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  // ── Bio
  bioInput: { minHeight: 70, textAlignVertical: 'top' },

  // ── Friends list
  friendsEmpty: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  friendsList: { gap: 8 },
  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12,
    padding: 10, borderWidth: 1, borderColor: Colors.border,
  },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2 },
  friendAvatarLetter: { fontSize: 16, fontWeight: '900' },
  friendName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  friendLevel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginTop: 1 },

  // ── PR inline edit
  prValueBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prEditInput: {
    backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1,
    borderColor: Colors.primary, paddingHorizontal: 8, paddingVertical: 4,
    fontSize: 16, fontWeight: '800', color: Colors.text, width: 70, textAlign: 'right',
  },
  prEditConfirm: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: `${Colors.success}18`, justifyContent: 'center', alignItems: 'center',
  },

  // ── Referral
  referralDesc: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  referralBox: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1.5,
    borderColor: Colors.border, paddingVertical: 14, alignItems: 'center',
    borderStyle: 'dashed',
  },
  referralCode: { fontSize: 26, fontWeight: '900', color: Colors.text, letterSpacing: 6 },
  referralBtns: { flexDirection: 'row', gap: 10 },
  referralBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 12, paddingVertical: 11,
    backgroundColor: `${Colors.primary}12`, borderWidth: 1, borderColor: Colors.border,
  },
  referralBtnShare: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  referralBtnText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
});
