import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, ScrollView,
} from 'react-native';
import { UserX, UserCheck, ChevronLeft, ChevronRight, X, Calendar, Clock, Check, Timer, ShieldCheck, CreditCard } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { readRows } from '../../lib/db';
import { captureError } from '../../lib/sentry';
import { useAuth } from '../../context/AuthContext';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { LevelColors } from '../../theme/designTokens';
import UserAvatar from '../../components/UserAvatar';
import GlassBackground from '../../components/glass/GlassBackground';

interface MemberRow {
  id: string;
  box_id: string;
  member_id: string;
  joined_at: string;
  // 'inactive' = abonnement terminé (révocation d'accès). Le statut existait en
  // base depuis 20260805 mais n'était pas typé ici : un membre révoqué
  // s'affichait comme un membre normal. 'owner' idem, d'où un bouton qui
  // proposait de le « promouvoir coach ».
  status: 'active' | 'banned' | 'inactive';
  role: 'member' | 'coach' | 'owner';
  profile: { username: string; email?: string; level: string; elo: number; avatar_url?: string };
}

// Une ligne de `get_box_billing` (gérant / co-gérant seulement : le coach reçoit
// 42501 et la fiche n'affiche pas de bloc formule — l'argent est hors de son
// périmètre).
interface MemberBilling {
  member_id: string;
  plan_id: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  subscription_cancel_at_period_end: boolean | null;
  subscription_paused: boolean | null;
  pause_resumes_at: string | null;
  commitment_end_date: string | null;
  has_stripe_sub: boolean | null;
}

interface PlanRow { id: string; name: string; price_cents: number | null }

interface MemberReservation {
  id: string;
  status: 'confirmed' | 'waiting';
  created_at: string;
  schedule: {
    title: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    coach: string | null;
  } | null;
}

export default function BOMembersScreen({ navigation }: any) {
  const { currentBox } = useAuth();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
  const S = createStyles(theme);
  const [members,    setMembers]    = useState<MemberRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Member detail modal
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [memberRes,      setMemberRes]      = useState<MemberReservation[]>([]);
  const [resLoading,     setResLoading]     = useState(false);
  const [billing,        setBilling]        = useState<Map<string, MemberBilling> | null>(null);
  const [plans,          setPlans]          = useState<Map<string, PlanRow>>(new Map());

  const load = useCallback(async () => {
    if (!currentBox) { setLoading(false); return; }
    try {
    // Colonnes EXPLICITES, jamais `*` : `authenticated` n'a qu'un grant SELECT
    // par colonne sur box_members (les colonnes de facturation stripe_*,
    // amount_cents, dunning_* sont fermées). Un `select('*')` demande donc des
    // colonnes interdites et PostgREST renvoie 42501 pour TOUTE la requête —
    // l'écran affichait 0 membre à un owner légitime.
    const { data, error } = await supabase
      .from('box_members')
      .select('id, box_id, member_id, joined_at, status, role, profile:profiles(id, username, level, elo, avatar_url)')
      .eq('box_id', currentBox.id)
      .order('joined_at', { ascending: false });
    // L'erreur était ignorée : un refus de permission se traduisait par une
    // liste vide, sans alerte ni trace. Un écran vide n'est pas une absence de
    // membres, c'est un symptôme — on le remonte désormais.
    if (error) {
      captureError(error, { screen: 'BOMembers', action: 'load' });
      Alert.alert('Erreur', error.message);
    }
    // `email` ne peut plus venir de l'embed : la Phase 3 le révoque à
    // `authenticated`, et une colonne interdite fait échouer TOUTE la requête.
    // La RPC le rend aux seuls admins de la box, fusionné par member_id.
    const rows = (data ?? []) as MemberRow[];
    const { data: emails, error: emailsError } = await supabase
      .rpc('get_box_member_emails', { p_box_id: currentBox.id });
    if (emailsError) captureError(emailsError, { screen: 'BOMembers', action: 'emails' });
    const byMember = new Map((emails ?? []).map(e => [e.member_id, e.email]));
    setMembers(rows.map(m => ({ ...m, profile: { ...m.profile, email: byMember.get(m.member_id) } })));

    // Formule / statut / échéance : colonnes fermées à `authenticated` (lot 6),
    // servies par get_box_billing au gérant et au co-gérant. Le refus du coach
    // (42501) est attendu : pas de bloc formule, pas d'alerte.
    const { data: billingRaw, error: billingError } = await supabase.rpc('get_box_billing', { p_box_id: currentBox.id });
    if (billingError) {
      if (billingError.code !== '42501') captureError(billingError, { screen: 'BOMembers', action: 'billing' });
      setBilling(null);
    } else {
      setBilling(new Map(((billingRaw ?? []) as MemberBilling[]).map(b => [b.member_id, b])));
      const planRows = await readRows(
        supabase.from('membership_plans').select('id, name, price_cents').eq('box_id', currentBox.id),
        { screen: 'BOMembers', action: 'plans' },
      );
      setPlans(new Map(((planRows ?? []) as PlanRow[]).map(p => [p.id, p])));
    }
    } catch (e) { captureError(e, { screen: 'BOMembers', action: 'load' }); }
    setLoading(false);
    setRefreshing(false);
  }, [currentBox]);

  useEffect(() => { load(); }, [load]);

  async function openMemberDetail(member: MemberRow) {
    setSelectedMember(member);
    setResLoading(true);
    const data = await readRows(
      supabase
        .from('class_reservations')
        .select('id, status, created_at, schedule:class_schedules(title, scheduled_date, start_time, end_time, coach)')
        .eq('member_id', member.member_id)
        .eq('box_id', currentBox!.id)
        .order('created_at', { ascending: false })
        .limit(50),
      { screen: 'BOMembers', action: 'openMemberDetail' },
    );

    setMemberRes((data ?? []).map((r: any) => ({
      ...r,
      schedule: Array.isArray(r.schedule) ? r.schedule[0] ?? null : r.schedule,
    })));
    setResLoading(false);
  }

  async function toggleCoach(member: MemberRow) {
    const newRole = member.role === 'coach' ? 'member' : 'coach';
    const label = newRole === 'coach' ? t('bo.members.promoteCoach') : t('bo.members.demoteCoach');
    Alert.alert(
      t('bo.members.confirmTitle', { label }),
      newRole === 'coach'
        ? t('bo.members.promoteMsg', { username: member.profile.username })
        : t('bo.members.demoteMsg', { username: member.profile.username }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: label,
          onPress: async () => {
            await supabase.from('box_members').update({ role: newRole }).eq('id', member.id);
            load();
            setSelectedMember(null);
          },
        },
      ]
    );
  }

  async function toggleBan(member: MemberRow) {
    const newStatus = member.status === 'active' ? 'banned' : 'active';
    const label = newStatus === 'banned' ? t('bo.members.ban') : t('bo.members.reactivate');
    Alert.alert(
      t('bo.members.confirmBanTitle', { label, username: member.profile.username }),
      newStatus === 'banned' ? t('bo.members.banMsg') : t('bo.members.reactivateMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: label,
          style: newStatus === 'banned' ? 'destructive' : 'default',
          onPress: async () => {
            if (newStatus === 'active') {
              // Réactivation : passe par la RPC serveur, qui remet à zéro
              // l'abonnement comme le fait la ré-adhésion par code d'invitation.
              // Un UPDATE direct ressusciterait l'ancien forfait.
              const { error } = await supabase.rpc('reactivate_box_member', {
                p_box_id: member.box_id, p_member_id: member.member_id,
              });
              if (error) { captureError(error, { screen: 'BOMembers', action: 'reactivate' }); Alert.alert('Erreur', error.message); return; }
            } else {
              const { error } = await supabase.from('box_members')
                .update({ status: newStatus }).eq('id', member.id);
              if (error) { captureError(error, { screen: 'BOMembers', action: 'ban' }); Alert.alert('Erreur', error.message); return; }
            }
            load();
          },
        },
      ]
    );
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  function formatDay(iso: string) {
    return new Date(iso).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Statut lisible d'un abonnement : Stripe quand il y en a un, sinon la
  // formule a été attribuée par le staff (0 €, sans échéance Stripe).
  function membershipStatus(b: MemberBilling): { label: string; color: string } {
    if (b.subscription_paused) return { label: t('bo.members.plan.paused'), color: theme.warning };
    switch (b.subscription_status) {
      case 'active':    return { label: t('bo.members.plan.active'), color: theme.success };
      case 'past_due':  return { label: t('bo.members.plan.pastDue'), color: theme.warning };
      case 'cancelled':
      case 'canceled':  return { label: t('bo.members.plan.cancelled'), color: theme.error };
      default:
        return b.plan_id
          ? { label: t('bo.members.plan.staffAssigned'), color: theme.textSecondary }
          : { label: t('bo.members.plan.none'), color: theme.textMuted };
    }
  }

  function membershipDue(b: MemberBilling): string | null {
    if (b.subscription_paused && b.pause_resumes_at) return t('bo.members.plan.resumesOn', { date: formatDay(b.pause_resumes_at) });
    if (b.subscription_current_period_end) {
      const d = formatDay(b.subscription_current_period_end);
      return b.subscription_cancel_at_period_end ? t('bo.members.plan.endsOn', { date: d }) : t('bo.members.plan.renewsOn', { date: d });
    }
    if (b.commitment_end_date) return t('bo.members.plan.commitmentUntil', { date: formatDay(b.commitment_end_date) });
    return null;
  }

  if (loading) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <GlassBackground />
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const active   = members.filter(m => m.status === 'active').length;
  const banned   = members.filter(m => m.status === 'banned').length;
  const inactive = members.filter(m => m.status === 'inactive').length;

  return (
    <View style={S.container}>
      <GlassBackground />
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <View>
          <Text style={S.headerTitle}>{t('bo.members.title')}</Text>
          <Text style={S.headerSub}>{t('bo.members.summary', { active, inactive, banned })}</Text>
        </View>
      </View>

      <FlatList
        data={members}
        keyExtractor={m => m.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 140 }}
        renderItem={({ item: m }) => (
          <TouchableOpacity
            style={[S.row, m.status !== 'active' && S.rowBanned]}
            onPress={() => openMemberDetail(m)}
            activeOpacity={0.7}
          >
            <UserAvatar uri={m.profile.avatar_url} name={m.profile.username} size={40} borderRadius={14} backgroundColor={theme.accentShadow} />
            <View style={S.mid}>
              <View style={S.nameRow}>
                <Text style={[S.name, m.status !== 'active' && S.nameBanned]}>{m.profile.username}</Text>
                {m.role === 'owner' && (
                  <View style={[S.levelPill, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                    <Text style={[S.levelText, { color: '#F59E0B' }]}>{t('bo.members.ownerBadge')}</Text>
                  </View>
                )}
                {m.status === 'inactive' && (
                  <View style={[S.levelPill, { backgroundColor: 'rgba(148,163,184,0.18)' }]}>
                    <Text style={[S.levelText, { color: '#94A3B8' }]}>{t('bo.members.inactiveBadge')}</Text>
                  </View>
                )}
                {m.role === 'coach' && (
                  <View style={[S.levelPill, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                    <Text style={[S.levelText, { color: '#3B82F6' }]}>{t('bo.members.coachBadge')}</Text>
                  </View>
                )}
                <View style={[S.levelPill, { backgroundColor: `${LevelColors[m.profile.level] ?? theme.surface}18` }]}>
                  <Text style={[S.levelText, { color: LevelColors[m.profile.level] ?? theme.textMuted }]}>
                    {m.profile.level?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={S.email}>{m.profile.email}</Text>
              <Text style={S.elo}>{t('bo.members.eloSince', { elo: m.profile.elo, date: new Date(m.joined_at).toLocaleDateString(dateLocale) })}</Text>
            </View>
            <ChevronRight color={theme.textMuted} size={16} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={S.empty}>
            <Text style={S.emptyText}>{t('bo.members.empty')}</Text>
          </View>
        }
      />

      {/* Member Detail Modal */}
      <Modal visible={!!selectedMember} transparent animationType="slide" onRequestClose={() => setSelectedMember(null)}>
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            {/* Modal header */}
            <View style={S.modalHeader}>
              <View style={S.modalHeaderLeft}>
                <UserAvatar
                  uri={selectedMember?.profile?.avatar_url}
                  name={selectedMember?.profile?.username ?? '?'}
                  size={44}
                  borderRadius={16}
                  borderWidth={2}
                  borderColor={LevelColors[selectedMember?.profile?.level ?? ''] ?? theme.accent}
                  backgroundColor={theme.surface}
                  textColor={theme.text}
                />
                <View style={{ flex: 1 }}>
                  <Text style={S.modalName}>{selectedMember?.profile?.username}</Text>
                  <Text style={S.modalSub}>
                    {selectedMember?.profile?.email} · {selectedMember?.profile?.elo} ELO
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedMember(null)} style={S.modalClose}>
                <X color={theme.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            {/* Formule / statut / échéance (gérant et co-gérant) */}
            {selectedMember && billing && (() => {
              const b = billing.get(selectedMember.member_id);
              const plan = b?.plan_id ? plans.get(b.plan_id) : undefined;
              const st = b ? membershipStatus(b) : { label: t('bo.members.plan.none'), color: theme.textMuted };
              const due = b ? membershipDue(b) : null;
              return (
                <View style={S.planCard}>
                  <View style={S.planIcon}><CreditCard color={theme.accentText} size={16} /></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={S.planName} numberOfLines={1}>
                      {plan ? plan.name : t('bo.members.plan.none')}
                      {plan?.price_cents != null && plan.price_cents > 0 ? ` · ${(plan.price_cents / 100).toFixed(2)} €` : ''}
                    </Text>
                    <View style={S.planMetaRow}>
                      <View style={[S.planDot, { backgroundColor: st.color }]} />
                      <Text style={[S.planStatus, { color: st.color }]}>{st.label}</Text>
                      {due && <Text style={S.planDue}> · {due}</Text>}
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* Coach promote/demote + Ban/Unban actions */}
            {selectedMember && selectedMember.status === 'active' && selectedMember.role !== 'owner' && (
              <TouchableOpacity
                style={[S.banBtn, { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.25)' }]}
                onPress={() => toggleCoach(selectedMember)}
                activeOpacity={0.8}
              >
                <ShieldCheck color={theme.accentText} size={15} />
                <Text style={[S.banBtnText, { color: theme.accentText }]}>
                  {selectedMember.role === 'coach' ? t('bo.members.demoteCoach') : t('bo.members.promoteCoach')}
                </Text>
              </TouchableOpacity>
            )}
            {selectedMember && (
              <TouchableOpacity
                style={[S.banBtn, selectedMember.status === 'banned' && S.unbanBtn]}
                onPress={() => { setSelectedMember(null); toggleBan(selectedMember); }}
                activeOpacity={0.8}
              >
                {selectedMember.status === 'active'
                  ? <UserX color={theme.error} size={15} />
                  : <UserCheck color={theme.success} size={15} />}
                <Text style={[S.banBtnText, selectedMember.status === 'banned' && { color: theme.success }]}>
                  {selectedMember.status === 'active' ? t('bo.members.banMember') : t('bo.members.reactivateMember')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Reservations section */}
            <View style={S.resSection}>
              <Text style={S.resSectionTitle}>{t('bo.members.reservations')}</Text>
            </View>

            {resLoading ? (
              <ActivityIndicator style={{ marginVertical: 30 }} size="large" color={theme.accent} />
            ) : memberRes.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <Calendar color={theme.textMuted} size={32} strokeWidth={1.5} />
                <Text style={[S.modalSub, { marginTop: 10 }]}>{t('bo.members.noReservation')}</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
                {memberRes.map(r => {
                  const s = r.schedule;
                  if (!s) return null;
                  const isPast = s.scheduled_date < todayISO;
                  const isConfirmed = r.status === 'confirmed';
                  return (
                    <View key={r.id} style={[S.resCard, isPast && S.resCardPast]}>
                      <View style={[S.resDot, { backgroundColor: isConfirmed ? theme.accentText : theme.warning }]} />
                      <View style={S.resBody}>
                        <View style={S.resTop}>
                          <Text style={S.resTitle}>{s.title}</Text>
                          <View style={[S.resBadge, isConfirmed ? S.resBadgeOk : S.resBadgeWait]}>
                            {isConfirmed ? <Check color={theme.accentText} size={10} /> : <Timer color={theme.warning} size={10} />}
                            <Text style={[S.resBadgeText, { color: isConfirmed ? theme.accentText : theme.warning }]}>
                              {isConfirmed ? t('bo.members.confirmed') : t('bo.members.waiting')}
                            </Text>
                          </View>
                        </View>
                        <View style={S.resDetails}>
                          <View style={S.resDetailRow}>
                            <Calendar color={theme.textMuted} size={11} />
                            <Text style={S.resDetailText}>{formatDate(s.scheduled_date)}</Text>
                          </View>
                          <View style={S.resDetailRow}>
                            <Clock color={theme.textMuted} size={11} />
                            <Text style={S.resDetailText}>{s.start_time} – {s.end_time}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border,
    flexDirection: 'row', alignItems: 'flex-end', gap: 12,
  },
  back:        { paddingBottom: 2 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: theme.text },
  headerSub:   { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: theme.border,
  },
  rowBanned:   { opacity: 0.55 },
  avatar:      { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { fontSize: 16, fontWeight: '900', color: theme.text },
  mid:         { flex: 1, gap: 2 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name:        { fontSize: 14, fontWeight: '800', color: theme.text },
  nameBanned:  { textDecorationLine: 'line-through', color: theme.textMuted },
  levelPill:   { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  levelText:   { fontSize: 10, fontWeight: '800' },
  email:       { fontSize: 11, color: theme.textMuted },
  elo:         { fontSize: 11, color: theme.textSecondary },
  actionBtn:   { padding: 6 },
  empty:       { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText:   { fontSize: 14, color: theme.textMuted, textAlign: 'center', lineHeight: 22 },

  // Modal
  // Fiche opaque (modalCard), pas la carte translucide : posée sur le voile
  // sombre, `theme.card` laissait l'encre atténuée à 2,77:1 en clair.
  modalOverlay:    { flex: 1, backgroundColor: theme.modalBackdrop, justifyContent: 'flex-end' },
  modalSheet:      { backgroundColor: theme.modalCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 34, maxHeight: '80%' },
  modalHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  modalAvatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  modalAvatarText: { fontSize: 18, fontWeight: '900', color: theme.text },
  modalName:       { fontSize: 16, fontWeight: '900', color: theme.text },
  modalSub:        { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  modalClose:      { padding: 6 },

  planCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginTop: 14, padding: 12, borderRadius: 12,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  planIcon:    { width: 32, height: 32, borderRadius: 10, backgroundColor: `${theme.accent}12`, justifyContent: 'center', alignItems: 'center' },
  planName:    { fontSize: 14, fontWeight: '800', color: theme.text },
  planMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  planDot:     { width: 6, height: 6, borderRadius: 3 },
  planStatus:  { fontSize: 12, fontWeight: '700' },
  planDue:     { fontSize: 12, color: theme.textSecondary, fontWeight: '600' },

  banBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 20, marginTop: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  unbanBtn: {
    backgroundColor: `${theme.success}15`, borderColor: `${theme.success}30`,
  },
  banBtnText: { fontSize: 13, fontWeight: '700', color: theme.error },

  resSection: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  resSectionTitle: { fontSize: 15, fontWeight: '800', color: theme.text },

  resCard: {
    flexDirection: 'row', alignItems: 'stretch', marginHorizontal: 20, marginBottom: 8,
    backgroundColor: theme.surface, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: theme.border,
  },
  resCardPast: { opacity: 0.5 },
  resDot:  { width: 4 },
  resBody: { flex: 1, padding: 12 },
  resTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  resTitle: { fontSize: 13, fontWeight: '800', color: theme.text, flex: 1 },
  resBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  resBadgeOk:   { backgroundColor: 'rgba(201,162,39,0.12)' },
  resBadgeWait: { backgroundColor: 'rgba(245,158,11,0.12)' },
  resBadgeText: { fontSize: 10, fontWeight: '700' },
  resDetails:    { flexDirection: 'row', gap: 12 },
  resDetailRow:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  resDetailText: { fontSize: 11, color: theme.textMuted, fontWeight: '600' },
}); }
