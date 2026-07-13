import React, { useEffect, useMemo, useState } from 'react';
import { useFocusQuery } from '../../hooks/useFocusQuery';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Share, Switch, Linking, RefreshControl,
} from 'react-native';
import { Trophy, Zap, TrendingUp, Award, LogOut, Star, Flame, ChevronRight, Hash, Building2, Edit3, Check, X, Camera, Copy, Share2, Bell, BookOpen, Search } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { WEB_URL } from '../../lib/urls';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import i18n, { setLanguage } from '../../i18n';
import { LevelColors } from '../../theme/designTokens';
import { spacing, borderRadius, typography, shadows } from '../../theme/designTokens';
import { getBadgesCatalog, getEarnedBadges, getStreak, BadgeDef, EarnedBadge, StreakInfo } from '../../services/gamification';
import { HomeStackParamList } from '../../navigation';
import { Program } from '../../types';
import UserAvatar from '../../components/UserAvatar';
import GlassBackground from '../../components/glass/GlassBackground';
import { prKey, normalizePrRecords, PrCategorySlug } from './prStorage';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Profile'>;

const TAB_KEYS = ['stats', 'pr', 'badges', 'account'] as const;

const PR_CATEGORIES = [
  {
    label: 'Haltérophilie',
    titleKey: 'weightlifting',
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
    titleKey: 'gymnastics',
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
    titleKey: 'benchmarks',
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
    titleKey: 'cardio',
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
  elo: 'Classement ELO',
  Classement: 'Classement',
};
const CATEGORY_ORDER = ['activity', 'tournament', 'wod', 'elo', 'Classement', 'social'];

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, signOut, deleteAccount, currentBox, joinBox, leaveBox, updateUser, myBoxes, switchBox } = useAuth();
  const { theme, mode, toggleTheme } = useTheme();
  const navigation = useNavigation<Nav>();
  const S = useMemo(() => createStyles(theme), [theme]);
  const [activeTab, setActiveTab]   = useState(0);
  const [expandedPR, setExpandedPR] = useState<string | null>('weightlifting');
  const [prSearch, setPrSearch]     = useState('');
  // Whether profiles.featured_badges (dedicated column) exists yet. Until the
  // migration is applied we transparently fall back to the legacy JSON slot.
  const [featuredColumn, setFeaturedColumn] = useState(false);

  // ── Referral code
  const [referralCode, setReferralCode] = useState<string>('');
  // ── WOD count
  const [wodCount, setWodCount] = useState<number>(0);
  // ── Badges & streaks
  const [badgesCatalog, setBadgesCatalog] = useState<BadgeDef[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  const [streak, setStreak] = useState<StreakInfo>({ current_streak: 0, longest_streak: 0, week_session_count: 0, week_start: '', max_sessions_per_week: null });
  // ── Friends
  const [friends, setFriends] = useState<Array<{ id: string; username: string; level: string; avatar_url?: string }>>([]);
  // ── PR editing
  const [editingPR, setEditingPR] = useState<string | null>(null);
  const [prValues, setPrValues] = useState<Record<string, string>>({});
  const [featuredBadges, setFeaturedBadges] = useState<string[]>([]);

  // ── Box join modal
  const [joinModal, setJoinModal]   = useState(false);
  const [joinCode, setJoinCode]     = useState('');
  const [joining, setJoining]       = useState(false);

  // ── Program join modal
  const [progModal, setProgModal]   = useState(false);
  const [progCode, setProgCode]     = useState('');
  const [joiningProg, setJoiningProg] = useState(false);
  const [myPrograms, setMyPrograms] = useState<(Program & { start_date: string; status: string })[]>([]);

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

  // Load my programs
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('program_members')
        .select('start_date, status, programs:program_id(id, title, type, duration_weeks, days_per_week, invite_code, price_cents, box_id, is_active, created_at, updated_at, owner_id)')
        .eq('user_id', user.id)
        .eq('status', 'active');
      const mapped = (data ?? []).map((r: any) => ({ ...r.programs, start_date: r.start_date, status: r.status })).filter(Boolean);
      setMyPrograms(mapped);
    })();
  }, [user]);

  async function handleJoinProgram() {
    if (!progCode.trim() || !user) return;
    setJoiningProg(true);
    try {
      const { data: prog } = await supabase
        .from('programs')
        .select('*')
        .eq('invite_code', progCode.trim().toUpperCase())
        .eq('is_active', true)
        .single();
      if (!prog) { Alert.alert(t('common.error'), t('profile.alerts.invalidProgramCode')); setJoiningProg(false); return; }
      // Programmes payants : l'achat se fait hors de l'app.
      // iOS reste neutre (règles App Store) ; Android peut ouvrir la page box.
      if (prog.price_cents > 0) {
        if (Platform.OS === 'ios') {
          Alert.alert(
            t('profile.alerts.programTitle'),
            t('profile.alerts.programIosMsg'),
            [{ text: t('common.ok'), style: 'cancel' }],
          );
        } else {
          Alert.alert(
            t('profile.alerts.programTitle'),
            t('profile.alerts.programAndroidMsg'),
            [
              { text: t('common.close'), style: 'cancel' },
              { text: t('profile.alerts.openBoxPage'), onPress: () => Linking.openURL(WEB_URL) },
            ],
          );
        }
        setJoiningProg(false);
        return;
      }
      // Check not already member
      const { data: existing } = await supabase
        .from('program_members')
        .select('id')
        .eq('program_id', prog.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) { Alert.alert(t('profile.alerts.alreadyMemberTitle'), t('profile.alerts.alreadyMemberMsg')); setJoiningProg(false); return; }
      // For now: free join (Stripe integration later)
      const today = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('program_members').insert({
        program_id: prog.id,
        user_id: user.id,
        start_date: today,
        amount_cents: prog.price_cents,
        platform_fee_cents: Math.round(prog.price_cents * 0.04),
      });
      if (error) throw error;
      Alert.alert(t('profile.alerts.welcomeTitle'), t('profile.alerts.joinedProgram', { title: prog.title }));
      setProgModal(false); setProgCode('');
      // Refresh programs
      const { data: refreshed } = await supabase
        .from('program_members')
        .select('start_date, status, programs:program_id(id, title, type, duration_weeks, days_per_week, invite_code, price_cents, box_id, is_active, created_at, updated_at, owner_id)')
        .eq('user_id', user.id)
        .eq('status', 'active');
      setMyPrograms((refreshed ?? []).map((r: any) => ({ ...r.programs, start_date: r.start_date, status: r.status })).filter(Boolean));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
    setJoiningProg(false);
  }

  const { data: profileData, refetch, isFetching } = useFocusQuery(
    ['profile', user?.id],
    async () => {
      if (!user) return null;
      const [wodCountRes, prRes, badgesRes, earnedRes, streakRes, friendsRes, featuredRes] = await Promise.all([
        supabase.from('wod_scores').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('profiles').select('personal_records').eq('id', user.id).single(),
        getBadgesCatalog(),
        getEarnedBadges(user.id),
        getStreak(user.id, currentBox?.id),
        supabase.from('friendships').select('requester_id, addressee_id, requester:profiles!requester_id(id, username, level, avatar_url), addressee:profiles!addressee_id(id, username, level, avatar_url)').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`).eq('status', 'accepted'),
        // Dedicated column; errors (data null) if the migration hasn't run yet.
        supabase.from('profiles').select('featured_badges').eq('id', user.id).maybeSingle(),
      ]);
      return {
        wodCount: wodCountRes.count ?? 0,
        prValues: prRes.data?.personal_records ?? {},
        badgesCatalog: badgesRes,
        earnedBadges: earnedRes,
        streak: streakRes,
        friends: friendsRes.data,
        featuredColumnAvailable: !featuredRes.error,
        featuredBadgesCol: (featuredRes.data?.featured_badges as string[] | null) ?? null,
      };
    },
    { enabled: !!user },
  );

  useEffect(() => {
    if (!profileData) return;
    setWodCount(profileData.wodCount);
    if (profileData.prValues && typeof profileData.prValues === 'object') {
      const prs = profileData.prValues as Record<string, unknown>;
      setPrValues(prev => ({ ...prev, ...normalizePrRecords(prs) }));
      const legacyFeatured = Array.isArray(prs._featured_badges) ? (prs._featured_badges as string[]) : null;
      setFeaturedColumn(profileData.featuredColumnAvailable);
      if (profileData.featuredColumnAvailable) {
        // Prefer the dedicated column; fall back to legacy JSON right after migration.
        if (profileData.featuredBadgesCol && profileData.featuredBadgesCol.length) setFeaturedBadges(profileData.featuredBadgesCol);
        else if (legacyFeatured) setFeaturedBadges(legacyFeatured);
      } else if (legacyFeatured) {
        setFeaturedBadges(legacyFeatured);
      }
    }
    setBadgesCatalog(profileData.badgesCatalog);
    setEarnedBadges(profileData.earnedBadges);
    setStreak(profileData.streak);
    // Map friends
    const mapped = (profileData.friends ?? []).map((f: any) => {
      const friend = f.requester_id === user?.id
        ? (Array.isArray(f.addressee) ? f.addressee[0] : f.addressee)
        : (Array.isArray(f.requester) ? f.requester[0] : f.requester);
      return friend;
    }).filter(Boolean);
    setFriends(mapped);
  }, [profileData]);

  useEffect(() => {
    loadReferralCode();
  }, [user?.id]);

  async function savePRs(updated: Record<string, string>) {
    if (!user) return;
    // Post-migration: PRs and featured badges live in separate storage. Pre-migration:
    // keep persisting the featured badges alongside the PRs so we don't drop them.
    const records = featuredColumn ? updated : { ...updated, _featured_badges: featuredBadges };
    await supabase.from('profiles').update({ personal_records: records }).eq('id', user.id);
  }

  async function toggleFeaturedBadge(badgeKey: string) {
    if (!user) return;
    let next: string[];
    if (featuredBadges.includes(badgeKey)) {
      next = featuredBadges.filter(k => k !== badgeKey);
    } else {
      if (featuredBadges.length >= 3) return;
      next = [...featuredBadges, badgeKey];
    }
    setFeaturedBadges(next);
    if (featuredColumn) {
      await supabase.from('profiles').update({ featured_badges: next }).eq('id', user.id);
    } else {
      await supabase.from('profiles').update({ personal_records: { ...prValues, _featured_badges: next } }).eq('id', user.id);
    }
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
      Alert.alert(t('profile.alerts.permissionDenied'), t('profile.alerts.galleryPermission'));
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
      Alert.alert(t('profile.alerts.permissionDenied'), t('profile.alerts.cameraPermission'));
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
    await Share.share({ message: referralCode, title: t('profile.referral.shareTitle') });
  }

  async function handleShareReferral() {
    await Share.share({
      message: t('profile.referral.shareMessage', { code: referralCode }),
    });
  }

  async function handleJoinBox() {
    if (!joinCode.trim()) return;
    setJoining(true);
    const { error } = await joinBox(joinCode.trim());
    setJoining(false);
    if (error) { Alert.alert(t('common.error'), error); return; }
    setJoinModal(false);
    setJoinCode('');
  }

  async function handleLeaveBox() {
    Alert.alert(t('profile.account.leaveBoxTitle'), t('profile.alerts.leaveCurrentBoxMsg', { name: currentBox?.name ?? '' }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.account.leave'), style: 'destructive', onPress: async () => {
        const { error } = await leaveBox();
        if (error) Alert.alert(t('common.error'), error);
      }},
    ]);
  }

  async function uploadAvatarIfLocal(localUri: string): Promise<string | null> {
    if (!user) return null;
    // If already a remote http(s) URL (already uploaded), nothing to do
    if (/^https?:\/\//i.test(localUri)) return localUri;
    try {
      const ext = (localUri.split('.').pop()?.toLowerCase().split('?')[0]) || 'jpg';
      const safeExt = ext === 'png' ? 'png' : 'jpg';
      const fileName = `${user.id}/avatar-${Date.now()}.${safeExt}`;
      const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(fileName, bytes, {
          contentType: `image/${safeExt === 'png' ? 'png' : 'jpeg'}`,
          upsert: true,
        });
      if (upErr) { captureError(upErr, { screen: 'Profile', action: 'uploadAvatar' }); return null; }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      return `${urlData.publicUrl}?t=${Date.now()}`;
    } catch (e) {
      captureError(e, { screen: 'Profile', action: 'uploadAvatar' });
      return null;
    }
  }

  async function handleSaveProfile() {
    if (!user) return;
    setSaving(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const updates: Record<string, string> = { full_name: fullName, username: editUsername.trim() };

      // Upload avatar to Supabase Storage if it's a local file URI
      let finalAvatarUrl = avatarUrl.trim();
      if (finalAvatarUrl && !/^https?:\/\//i.test(finalAvatarUrl)) {
        const uploaded = await uploadAvatarIfLocal(finalAvatarUrl);
        if (!uploaded) {
          setSaving(false);
          Alert.alert(t('common.error'), t('profile.alerts.avatarUploadFailed'));
          return;
        }
        finalAvatarUrl = uploaded;
      }
      if (finalAvatarUrl) updates.avatar_url = finalAvatarUrl;
      updates.bio = editBio.trim();

      // Handle email change via Supabase Auth
      const newEmail = editEmail.trim().toLowerCase();
      const emailChanged = newEmail && newEmail !== (user.email ?? '').toLowerCase();
      if (emailChanged) {
        const { error: authErr } = await supabase.auth.updateUser({ email: newEmail });
        if (authErr) {
          setSaving(false);
          Alert.alert(t('profile.alerts.emailError'), authErr.message);
          return;
        }
      }

      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      setSaving(false);
      if (error) { Alert.alert(t('common.error'), error.message); return; }
      updateUser({ full_name: fullName, avatar_url: avatarUrl.trim() || user.avatar_url, username: editUsername.trim() });
      setEditing(false);

      if (emailChanged) {
        Alert.alert(
          t('profile.alerts.confirmationRequired'),
          t('profile.alerts.emailConfirmationSent'),
        );
      }
    } catch (e: any) {
      setSaving(false);
      Alert.alert(t('common.error'), e.message ?? t('profile.alerts.genericError'));
    }
  }

  const winRate = user?.total_matches
    ? Math.round((user.wins / user.total_matches) * 100)
    : 0;
  const currentElo = user?.elo ?? 1000;
  const ELO_STEPS: { min: number; label: string }[] = [
    { min: 0,    label: 'Scaled' },
    { min: 800,  label: 'Inter' },
    { min: 1200, label: 'RX' },
    { min: 1400, label: 'RX+' },
    { min: 1600, label: 'Elite' },
    { min: 1800, label: 'Pro' },
  ];
  const currentStep = [...ELO_STEPS].reverse().find(s => currentElo >= s.min) ?? ELO_STEPS[0];
  const nextStep = ELO_STEPS[ELO_STEPS.indexOf(currentStep) + 1] ?? null;
  const eloProgress = nextStep
    ? Math.round(Math.max(0, Math.min(100, ((currentElo - currentStep.min) / (nextStep.min - currentStep.min)) * 100)))
    : 100;

  async function handleSignOut() {
    Alert.alert(t('profile.alerts.signOutTitle'), t('profile.alerts.signOutMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.alerts.signOutTitle'), style: 'destructive', onPress: signOut },
    ]);
  }

  const [deleting, setDeleting] = useState(false);

  function handleDeleteAccount() {
    Alert.alert(
      `⚠️ ${t('profile.alerts.deleteTitle')}`,
      t('profile.alerts.deleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.alerts.deleteConfirm'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('profile.alerts.deleteLastTitle'),
              t('profile.alerts.deleteLastMsg'),
              [
                { text: t('profile.alerts.deleteNo'), style: 'cancel' },
                {
                  text: t('profile.alerts.deleteYes'),
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    const { error } = await deleteAccount();
                    setDeleting(false);
                    if (error) Alert.alert(t('common.error'), error);
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

  const roleLabel = user?.role === 'box_owner'  ? t('profile.roles.boxOwner')
                  : user?.role === 'admin'       ? t('profile.roles.admin')
                  : user?.role === 'super_admin' ? t('profile.roles.superAdmin')
                  : t('profile.roles.athlete');

  async function handleShareBoxCode() {
    if (!currentBox?.invite_code) return;
    await Share.share({
      message: t('profile.referral.shareBox', { name: currentBox.name, code: currentBox.invite_code }),
    });
  }

  const earnedKeys = new Set(earnedBadges.map(b => b.badge_key));
  const earnedCount = earnedBadges.length;
  const totalBadges = badgesCatalog.length;

  // Group badges by category — show ALL categories from DB (CATEGORY_ORDER first, unknowns appended)
  const badgesByCategory = (() => {
    const allCats = [...new Set(badgesCatalog.map(b => b.category))];
    const ordered = CATEGORY_ORDER.filter(c => allCats.includes(c));
    const extras  = allCats.filter(c => !CATEGORY_ORDER.includes(c));
    return [...ordered, ...extras].map(cat => ({
      key: cat,
      label: t(`profile.badges.categories.${cat}`, { defaultValue: BADGE_CATEGORY_MAP[cat] ?? cat }),
      badges: badgesCatalog.filter(b => b.category === cat),
    }));
  })();

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <View style={S.headerTop}>
          <UserAvatar
            uri={user?.avatar_url}
            name={user?.username ?? 'A'}
            size={72}
            borderRadius={24}
            borderWidth={3}
            borderColor={levelColor}
            backgroundColor={theme.surface}
            textColor={theme.text}
            fontSize={28}
          />
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
            { label: t('profile.stats.wins'), value: user?.wins ?? 0 },
            { label: t('profile.stats.matches'), value: user?.total_matches ?? 0 },
            { label: t('profile.stats.winRate'), value: `${winRate}%` },
          ].map((s, i) => (
            <View key={s.label} style={[S.statPill, i < 2 && S.statPillBorder]}>
              <Text style={S.statPillValue}>{s.value}</Text>
              <Text style={S.statPillLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={S.progressSection}>
          <View style={S.progressHeader}>
            <Text style={S.progressLabel}>
              {nextStep ? t('profile.elo.toward', { level: nextStep.label }) : `🏆 ${t('profile.elo.maxLevel')}`}
            </Text>
            <Text style={S.progressPct}>{eloProgress}%</Text>
          </View>
          <View style={S.progressTrack}>
            <View style={[S.progressFill, { width: `${eloProgress}%` as any, backgroundColor: levelColor }]} />
          </View>
          <Text style={S.progressNote}>
            {nextStep
              ? `${currentElo} / ${nextStep.min} ELO · ${t('profile.elo.currentLevel', { level: currentStep.label })}`
              : `${currentElo} ELO · Pro Legend`}
          </Text>
        </View>
      </View>

      <View style={S.tabs}>
        {TAB_KEYS.map((tab, i) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(i)}
            style={[S.tab, activeTab === i && S.tabActive]}
            accessibilityRole="tab" accessibilityState={{ selected: activeTab === i }}>
            <Text style={[S.tabText, activeTab === i && S.tabTextActive]}>{t(`profile.tabs.${tab}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={S.content}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={() => refetch()}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        {activeTab === 0 && (
          <>
            {(user?.total_matches ?? 0) === 0 && (
              <View style={S.emptyBanner}>
                <Trophy color={theme.textMuted} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={S.emptyBannerTitle}>{t('profile.stats.emptyTitle')}</Text>
                  <Text style={S.emptyBannerSub}>{t('profile.stats.emptySub')}</Text>
                </View>
              </View>
            )}
            <View style={S.gridRow}>
              {[
                { label: t('profile.stats.totalMatches'), value: user?.total_matches ?? 0, icon: Zap },
                { label: t('profile.stats.wins'), value: user?.wins ?? 0, icon: Trophy },
                { label: t('profile.stats.losses'), value: (user?.total_matches ?? 0) - (user?.wins ?? 0), icon: TrendingUp },
                { label: t('profile.stats.winRate'), value: `${winRate}%`, icon: Star },
                { label: t('profile.stats.currentStreak'), value: streak.current_streak, icon: Flame },
                { label: t('profile.stats.badgesEarned'), value: `${earnedCount}/${totalBadges}`, icon: Award },
                ...(currentBox ? [{ label: t('profile.stats.wodsDone'), value: wodCount, icon: Zap }] : []),
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

        {activeTab === 1 && (() => {
          const q = prSearch.trim().toLowerCase();
          const searching = q.length > 0;
          const filtered = PR_CATEGORIES
            .map(cat => ({ cat, items: searching ? cat.items.filter(pr => pr.movement.toLowerCase().includes(q)) : cat.items }))
            .filter(({ items }) => !searching || items.length > 0);
          return (
          <>
            <View style={S.prSearchRow}>
              <Search color={theme.textMuted} size={16} />
              <TextInput
                style={S.prSearchInput}
                value={prSearch}
                onChangeText={setPrSearch}
                placeholder={t('profile.pr.searchPlaceholder')}
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {prSearch.length > 0 && (
                <TouchableOpacity onPress={() => setPrSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X color={theme.textMuted} size={16} />
                </TouchableOpacity>
              )}
            </View>
            {searching && filtered.length === 0 && (
              <Text style={S.prNoResults}>{t('profile.pr.noResults', { query: prSearch.trim() })}</Text>
            )}
            {filtered.map(({ cat, items }) => {
              const isOpen = searching || expandedPR === cat.titleKey;
              return (  
                <View key={cat.titleKey} style={S.prCategory}>
                  <TouchableOpacity
                    style={S.prCategoryHeader}
                    onPress={() => !searching && setExpandedPR(isOpen ? null : cat.titleKey)}
                    activeOpacity={searching ? 1 : 0.7}
                  >
                    <Text style={S.prCategoryIcon}>{cat.icon}</Text>
                    <Text style={S.prCategoryLabel}>{t(`profile.pr.categories.${cat.titleKey}`)}</Text>
                    <Text style={S.prCategoryCount}>{t('profile.pr.recordsCount', { count: items.length })}</Text>
                    <ChevronRight
                      color={theme.textMuted} size={16}
                      style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
                    />
                  </TouchableOpacity>
                  {isOpen && items.map((pr, i) => {
                    const key = prKey(cat.titleKey as PrCategorySlug, pr.movement);
                    const isEditingThis = editingPR === key;
                    return (
                      <View key={i} style={[S.prRow, i === items.length - 1 && { borderBottomWidth: 0 }]}>
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
          );
        })()}

        {activeTab === 2 && (
          <>
            <View style={S.badgeSummary}>
              <Text style={S.badgeSummaryText}>
                <Text style={{ fontWeight: '900', color: theme.text }}>{earnedCount}</Text>
                {' '}{t('profile.badges.earnedOf')}{' '}
                <Text style={{ fontWeight: '900' }}>{totalBadges}</Text>
              </Text>
              <Text style={{ fontSize: 11, color: theme.accent, fontWeight: '700' }}>
                ⭐ {t('profile.badges.pinnedCount', { count: featuredBadges.length })}
              </Text>
            </View>
            {/* Streak widget */}
            <View style={S.streakWidget}>
              <Text style={S.streakFire}>🔥</Text>
              <View style={{ flex: 1 }}>
                <Text style={S.streakTitle}>{t('profile.badges.week', { count: streak.current_streak })}</Text>
                <Text style={S.streakSub}>{t('profile.badges.sessionsThisWeek', { done: streak.week_session_count, total: streak.max_sessions_per_week ?? '∞' })}</Text>
                <View style={S.streakBar}>
                  <View style={[S.streakBarFill, { width: `${Math.min(100, (streak.week_session_count / (streak.max_sessions_per_week ?? 3)) * 100)}%` }]} />
                </View>
              </View>
            </View>

            <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8, marginTop: -4 }}>
              {t('profile.badges.pinHint')}
            </Text>

            {badgesByCategory.map((cat) => (
              <View key={cat.key} style={S.badgeCategoryBlock}>
                <Text style={S.badgeCategoryTitle}>{cat.label}</Text>
                <View style={S.badgesGrid}>
                  {cat.badges.map((badge) => {
                    const earned = earnedKeys.has(badge.badge_key);
                    const isFeatured = featuredBadges.includes(badge.badge_key);
                    const canFeature = earned && (isFeatured || featuredBadges.length < 3);
                    return (
                      <TouchableOpacity
                        key={badge.badge_key}
                        style={[S.badgeCard, !earned && S.badgeCardLocked, isFeatured && { borderColor: theme.accent, borderWidth: 2 }]}
                        onPress={() => canFeature && toggleFeaturedBadge(badge.badge_key)}
                        activeOpacity={earned ? 0.75 : 1}
                      >
                        {isFeatured && (
                          <Text style={{ position: 'absolute', top: 4, right: 4, fontSize: 12 }}>⭐</Text>
                        )}
                        <Text style={S.badgeIcon}>{earned ? badge.icon : '🔒'}</Text>
                        <Text style={[S.badgeName, !earned && { color: theme.textMuted }]}>
                          {badge.title}
                        </Text>
                        <Text style={S.badgeDesc}>{badge.description}</Text>
                        {earned && <View style={S.earnedBar} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        )}
        {activeTab === 3 && (
          <View style={S.compteSection}>

            {/* ── Mes Boxes ─────────────────────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>{t('profile.account.myBoxes')}</Text>
              {myBoxes.length > 0 ? (
                <>
                  {myBoxes.map(entry => {
                    const isActive = entry.box.id === currentBox?.id;
                    return (
                      <View key={entry.box.id} style={[S.boxRow, { marginBottom: 8 }]}>
                        <Building2 color={isActive ? theme.accent : theme.text} size={20} />
                        <TouchableOpacity style={{ flex: 1 }} onPress={() => switchBox(entry.box.id)} activeOpacity={0.7}>
                          <Text style={[S.boxName, isActive && { color: theme.accent }]}>{entry.box.name}</Text>
                          <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                            {entry.role === 'owner' ? t('profile.account.roleOwner') : entry.role === 'coach' ? t('profile.account.roleCoach') : t('profile.account.roleMember')}
                          </Text>
                        </TouchableOpacity>
                        {isActive && <View style={S.activeTag}><Text style={S.activeTagText}>{t('profile.account.active')}</Text></View>}
                        {entry.role !== 'owner' && (
                          <TouchableOpacity
                            onPress={() => {
                              if (isActive) handleLeaveBox();
                              else {
                                Alert.alert(t('profile.account.leaveBoxTitle'), t('profile.account.leaveBoxMsg', { name: entry.box.name }), [
                                  { text: t('common.cancel'), style: 'cancel' },
                                  { text: t('profile.account.leave'), style: 'destructive', onPress: async () => {
                                    await switchBox(entry.box.id);
                                    const { error } = await leaveBox();
                                    if (error) Alert.alert(t('common.error'), error);
                                  }},
                                ]);
                              }
                            }}
                            style={{ padding: 6 }}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.error }}>{t('profile.account.leave')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </>
              ) : (
                <Text style={S.noBoxText}>{t('profile.account.noBox')}</Text>
              )}
              <TouchableOpacity style={S.joinBtn} onPress={() => setJoinModal(true)} activeOpacity={0.8}>
                <Hash color={theme.background} size={16} />
                <Text style={S.joinBtnText}>{t('profile.account.joinBox')}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Mes Programmes ─────────────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>{t('profile.account.myPrograms')}</Text>
              {myPrograms.length > 0 ? (
                <>
                  {myPrograms.map(prog => {
                    const startDate = new Date(prog.start_date + 'T00:00:00');
                    const now = new Date();
                    const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                    const currentWeek = Math.floor(daysSinceStart / 7) + 1;
                    return (
                      <TouchableOpacity
                        key={prog.id}
                        style={[S.boxRow, { marginBottom: 8 }]}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('ProgramDetail', {
                          programId: prog.id,
                          programTitle: prog.title,
                          startDate: prog.start_date,
                          progType: prog.type,
                          durationWeeks: prog.duration_weeks,
                          daysPerWeek: prog.days_per_week,
                        })}
                      >
                        <BookOpen color={theme.accent} size={20} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{prog.title}</Text>
                          <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                            {prog.type === 'fixed'
                              ? t('profile.account.progFixed', { week: currentWeek, total: prog.duration_weeks, days: prog.days_per_week })
                              : t('profile.account.progOngoing', { days: prog.days_per_week })}
                          </Text>
                        </View>
                        <View style={{ backgroundColor: `${theme.success}18`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: theme.success }}>{t('profile.account.active')}</Text>
                        </View>
                        <ChevronRight color={theme.textMuted} size={16} style={{ marginLeft: 6 }} />
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : (
                <Text style={S.noBoxText}>{t('profile.account.noProgram')}</Text>
              )}
              <TouchableOpacity style={S.joinBtn} onPress={() => setProgModal(true)} activeOpacity={0.8}>
                <BookOpen color={theme.background} size={16} />
                <Text style={S.joinBtnText}>{t('profile.account.joinProgram')}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Edit profile ─────────────────────────── */}
            <View style={S.compteCard}>
              <View style={S.compteCardHeader}>
                <Text style={S.compteCardTitle}>{t('profile.account.myInfo')}</Text>
                {!editing ? (
                  <TouchableOpacity onPress={() => setEditing(true)} style={S.editIconBtn}>
                    <Edit3 color={theme.text} size={16} />
                    <Text style={S.editIconText}>{t('common.edit')}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setEditing(false)} style={S.editIconBtn}>
                    <X color={theme.textMuted} size={16} />
                    <Text style={[S.editIconText, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!editing ? (
                <View style={S.infoRows}>
                  <InfoRow label={t('profile.account.usernameLabel')} value={user?.username ?? ''} S={S} />
                  <InfoRow label={t('profile.account.nameLabel')} value={user?.full_name || '—'} S={S} />
                  <InfoRow label={t('profile.account.emailLabel')} value={user?.email ?? ''} S={S} />
                  <InfoRow label={t('profile.account.bioLabel')} value={user?.bio || t('profile.account.bioEmpty')} S={S} />
                  <InfoRow label={t('profile.account.photoLabel')} value={user?.avatar_url ? t('profile.account.photoSet') : t('profile.account.photoUnset')} S={S} />
                  {/* Rôle */}
                  <View style={S.infoRow}>
                    <Text style={S.infoRowLabel}>{t('profile.account.roleLabel')}</Text>
                    <View style={S.roleBadge}>
                      <Text style={S.roleBadgeText}>{roleLabel}</Text>
                    </View>
                  </View>
                  {/* Box invite code (owner only) */}
                  {user?.role === 'box_owner' && currentBox?.invite_code && (
                    <View style={S.infoRow}>
                      <Text style={S.infoRowLabel}>{t('profile.account.boxCode')}</Text>
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
                        {pickingPhoto ? <ActivityIndicator color={theme.text} size="small" /> : <><Camera color={theme.textSecondary} size={14} /><Text style={S.photoBtnText}>{t('profile.account.gallery')}</Text></>}
                      </TouchableOpacity>
                      <TouchableOpacity style={S.photoBtn} onPress={handleTakePhoto} disabled={pickingPhoto} activeOpacity={0.8}>
                        <Camera color={theme.textMuted} size={14} />
                        <Text style={[S.photoBtnText, { color: theme.textMuted }]}>{t('profile.account.camera')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={S.editLabel}>{t('profile.account.usernameLabel')}</Text>
                  <TextInput style={S.editInput} value={editUsername} onChangeText={setEditUsername} autoCapitalize="none" placeholder={t('profile.account.usernameLabel')} placeholderTextColor={theme.textMuted} />

                  <View style={S.editRow}>
                    <View style={S.editField}>
                      <Text style={S.editLabel}>{t('profile.account.firstName')}</Text>
                      <TextInput style={S.editInput} value={firstName} onChangeText={setFirstName} placeholder={t('profile.account.firstName')} placeholderTextColor={theme.textMuted} />
                    </View>
                    <View style={S.editField}>
                      <Text style={S.editLabel}>{t('profile.account.lastName')}</Text>
                      <TextInput style={S.editInput} value={lastName} onChangeText={setLastName} placeholder={t('profile.account.lastName')} placeholderTextColor={theme.textMuted} />
                    </View>
                  </View>

                  <Text style={S.editLabel}>{t('profile.account.emailLabel')}</Text>
                  <TextInput style={S.editInput} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" placeholder={t('profile.account.emailLabel')} placeholderTextColor={theme.textMuted} />

                  <Text style={S.editLabel}>{t('profile.account.bioHashtags')}</Text>
                  <TextInput
                    style={[S.editInput, S.bioInput]}
                    value={editBio}
                    onChangeText={setEditBio}
                    multiline
                    numberOfLines={3}
                    placeholder={t('profile.account.bioPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                  />

                  <TouchableOpacity style={S.saveBtn} onPress={handleSaveProfile} disabled={saving} activeOpacity={0.85}>
                    {saving ? <ActivityIndicator color={theme.background} size="small" /> : <><Check color={theme.background} size={16} /><Text style={S.saveBtnText}>{t('common.save')}</Text></>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {/* ── Mes amis ─────────────────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>{t('profile.account.myFriends', { count: friends.length })}</Text>
              {friends.length === 0 ? (
                <Text style={S.friendsEmpty}>{t('profile.account.noFriends')}</Text>
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
                        <UserAvatar
                          uri={f.avatar_url}
                          name={f.username ?? '?'}
                          size={36}
                          borderRadius={12}
                          borderWidth={2}
                          borderColor={fc}
                          backgroundColor={`${fc}20`}
                          textColor={fc}
                          fontSize={14}
                        />
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
                <Text style={S.compteCardTitle}>{t('profile.legal')}</Text>
                <ChevronRight color={theme.textMuted} size={16} />
              </View>
            </TouchableOpacity>

            {/* ── Apparence ───────────────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>{t('profile.appearance')}</Text>
              <View style={S.themeRow}>
                <Text style={S.themeLabel}>{mode === 'dark' ? `🌙 ${t('profile.darkMode')}` : `☀️ ${t('profile.lightMode')}`}</Text>
                <Switch
                  value={mode === 'dark'}
                  onValueChange={toggleTheme}
                  trackColor={{ false: theme.border, true: theme.text }}
                  thumbColor={theme.background}
                  ios_backgroundColor={theme.border}
                />
              </View>
            </View>

            {/* ── Langue ──────────────────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>{t('profile.language')}</Text>
              <View style={[S.themeRow, { gap: 10 }]}>
                {(['fr', 'en'] as const).map(lng => {
                  const active = i18n.language === lng;
                  return (
                    <TouchableOpacity
                      key={lng}
                      onPress={() => setLanguage(lng)}
                      activeOpacity={0.8}
                      style={[
                        S.langBtn,
                        { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.ctaBg : 'transparent' },
                      ]}
                    >
                      <Text style={[S.langBtnText, { color: active ? theme.accent : theme.textMuted }]}>
                        {lng === 'fr' ? '🇫🇷 Français' : '🇬🇧 English'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Utilisateurs bloqués ──────────────────── */}
            <TouchableOpacity
              style={S.compteCard}
              onPress={() => navigation.navigate('BlockedUsers' as never)}
              activeOpacity={0.8}
            >
              <View style={S.themeRow}>
                <Text style={S.compteCardTitle}>{t('profile.blockedUsers')}</Text>
                <ChevronRight color={theme.textMuted} size={16} />
              </View>
            </TouchableOpacity>

            {/* ── Notifications ─────────────────────────── */}
            <TouchableOpacity
              style={S.compteCard}
              onPress={() => navigation.navigate('NotificationSettings')}
              activeOpacity={0.8}
            >
              <View style={S.themeRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Bell color={theme.text} size={18} />
                  <Text style={S.themeLabel}>{t('profile.notifications')}</Text>
                </View>
                <ChevronRight color={theme.textMuted} size={16} />
              </View>
            </TouchableOpacity>

            {/* ── Referral code ────────────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>{t('profile.referralCode')}</Text>
              <Text style={S.referralDesc}>
                {t('profile.referralDesc')}
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
                  <Text style={S.referralBtnText}>{t('profile.referral.copy')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.referralBtn, S.referralBtnShare]} onPress={handleShareReferral} disabled={!referralCode} activeOpacity={0.8}>
                  <Share2 color={theme.background} size={15} />
                  <Text style={[S.referralBtnText, { color: theme.background }]}>{t('profile.referral.share')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Supprimer le compte ───────────────────── */}
            <View style={S.compteCard}>
              <Text style={S.compteCardTitle}>{t('profile.account.dangerZone')}</Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, lineHeight: 18 }}>
                {t('profile.account.deleteWarning')}
              </Text>
              <TouchableOpacity
                style={S.deleteAccountBtn}
                onPress={handleDeleteAccount}
                disabled={deleting}
                activeOpacity={0.8}
              >
                {deleting ? (
                  <ActivityIndicator color={theme.background} size="small" />
                ) : (
                  <Text style={S.deleteAccountText}>{t('profile.deleteAccount')}</Text>
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
            <Text style={S.modalTitle}>{t('profile.account.joinBox')}</Text>
            <Text style={S.modalSub}>{t('profile.account.joinBoxSub')}</Text>
            <TextInput
              style={S.codeInput}
              value={joinCode}
              onChangeText={v => setJoinCode(v.toUpperCase())}
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
              {joining ? <ActivityIndicator color={theme.background} size="small" /> : <><Hash color={theme.background} size={16} /><Text style={S.joinBtnText}>{t('profile.account.join')}</Text></>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setJoinModal(false)} style={S.modalCancel}>
              <Text style={S.modalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Join program modal ──────────────────────────────────── */}
      <Modal visible={progModal} transparent animationType="slide" onRequestClose={() => setProgModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>{t('profile.account.joinProgram')}</Text>
            <Text style={S.modalSub}>{t('profile.account.joinProgramSub')}</Text>
            <TextInput
              style={S.codeInput}
              value={progCode}
              onChangeText={v => setProgCode(v.toUpperCase())}
              placeholder="Ex : FORCE6"
              placeholderTextColor={theme.textMuted}
              maxLength={6}
              autoCapitalize="characters"
              autoFocus
            />
            <TouchableOpacity
              style={[S.joinBtn, { backgroundColor: theme.accent }, (!progCode.trim() || joiningProg) && { opacity: 0.5 }]}
              onPress={handleJoinProgram}
              disabled={!progCode.trim() || joiningProg}
              activeOpacity={0.85}
            >
              {joiningProg ? <ActivityIndicator color={theme.background} size="small" /> : <><BookOpen color={theme.background} size={16} /><Text style={S.joinBtnText}>{t('profile.account.join')}</Text></>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setProgModal(false)} style={S.modalCancel}>
              <Text style={S.modalCancelText}>{t('common.cancel')}</Text>
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
  container: { flex: 1, backgroundColor: 'transparent' },
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
  content: { padding: 20, paddingBottom: 120 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: {
    width: '47%', backgroundColor: isDark ? t.surface : t.card, borderRadius: 14,
    padding: 16, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: t.border,
    ...cardShadow,
  },
  gridValue: { fontSize: 22, fontWeight: '900', color: t.text },
  gridLabel: { fontSize: 10, color: t.textMuted, fontWeight: '600', textAlign: 'center' },
  emptyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: isDark ? t.surface : t.card, borderRadius: 14,
    padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: t.border,
    ...cardShadow,
  },
  emptyBannerTitle: { fontSize: 13, fontWeight: '800', color: t.text },
  emptyBannerSub: { fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 15 },
  prSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: isDark ? t.surface : t.card, borderRadius: 12,
    paddingHorizontal: 12, marginBottom: 12,
    borderWidth: 1, borderColor: t.border,
  },
  prSearchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: t.text },
  prNoResults: { fontSize: 13, color: t.textMuted, textAlign: 'center', paddingVertical: 24 },
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
  langBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  langBtnText: { fontSize: 14, fontWeight: '700' },

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
    gap: 8, backgroundColor: t.ctaBg, borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: t.ctaBorder,
  },
  joinBtnText: { color: t.background, fontSize: 14, fontWeight: '700' },
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
  saveBtnText: { color: t.background, fontSize: 14, fontWeight: '700' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.modalBackdrop },
  modalSheet: {
    backgroundColor: t.modalCard, borderTopLeftRadius: 24, borderTopRightRadius: 24,
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
    backgroundColor: t.error, borderRadius: 14, padding: 14,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  deleteAccountText: { color: '#fff', fontSize: 14, fontWeight: '700' as const },
}); }
