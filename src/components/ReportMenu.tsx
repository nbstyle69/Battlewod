import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MoreVertical, Flag, UserX, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, AppTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  reportContent, blockUser, REPORT_REASONS,
  type ReportContentType, type ReportReason,
} from '../services/moderation';

type Props = {
  /** Type of content being reported */
  contentType: ReportContentType;
  /** ID of the content (message id, video id, etc.). Optional for profile reports. */
  contentId?: string;
  /** User ID of the author of the content (required to enable block). */
  reportedUserId?: string;
  /** Optional callback fired after a successful report or block so parent can refresh. */
  onActionDone?: () => void;
  /** Optional custom trigger icon size (default 18). */
  size?: number;
  /** Optional custom trigger icon color. */
  color?: string;
  /** Hide the "Block user" option (e.g. for own content or when not applicable). */
  hideBlock?: boolean;
};

/**
 * Reusable 3-dots menu for reporting content + blocking user.
 * Required for App Store Guideline 1.2 (UGC apps must provide report + block).
 */
export default function ReportMenu({
  contentType, contentId, reportedUserId, onActionDone,
  size = 18, color, hideBlock,
}: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const S = createStyles(theme);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSelf = !!(user && reportedUserId && user.id === reportedUserId);
  const canBlock = !hideBlock && !!reportedUserId && !isSelf;

  function openReport() {
    setMenuOpen(false);
    setTimeout(() => setReportModal(true), 100);
  }

  async function handleBlock() {
    if (!reportedUserId) return;
    setMenuOpen(false);
    Alert.alert(
      'Bloquer cet utilisateur ?',
      'Tu ne verras plus ses messages, ses vidéos, son profil ni ses commentaires.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer', style: 'destructive', onPress: async () => {
            const ok = await blockUser(reportedUserId);
            if (ok) {
              Alert.alert('Bloqué', 'Cet utilisateur ne peut plus interagir avec toi.');
              onActionDone?.();
            } else {
              Alert.alert('Erreur', 'Impossible de bloquer cet utilisateur.');
            }
          },
        },
      ],
    );
  }

  async function submitReport() {
    if (!reason) return;
    setSubmitting(true);
    const id = await reportContent({
      contentType, contentId, reportedUserId,
      reason, details: details.trim() || undefined,
    });
    setSubmitting(false);
    if (id) {
      setReportModal(false);
      setReason(null);
      setDetails('');
      Alert.alert(
        'Merci',
        'Ton signalement a bien été enregistré. Notre équipe le traitera sous 24h.',
      );
      onActionDone?.();
    } else {
      Alert.alert('Erreur', 'Impossible d\'envoyer le signalement. Réessaie plus tard.');
    }
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setMenuOpen(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <MoreVertical size={size} color={color ?? theme.textMuted} />
      </TouchableOpacity>

      {/* Action sheet */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={S.backdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={S.sheet}>
            {!isSelf && (
              <TouchableOpacity style={S.sheetItem} onPress={openReport} activeOpacity={0.7}>
                <Flag size={18} color={theme.error} />
                <Text style={[S.sheetItemText, { color: theme.error }]}>Signaler</Text>
              </TouchableOpacity>
            )}
            {canBlock && (
              <TouchableOpacity style={S.sheetItem} onPress={handleBlock} activeOpacity={0.7}>
                <UserX size={18} color={theme.error} />
                <Text style={[S.sheetItemText, { color: theme.error }]}>Bloquer cet utilisateur</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[S.sheetItem, S.cancelItem]} onPress={() => setMenuOpen(false)} activeOpacity={0.7}>
              <Text style={[S.sheetItemText, { color: theme.text, fontWeight: '700' }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report reason modal */}
      <Modal visible={reportModal} transparent animationType="slide" onRequestClose={() => setReportModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={S.reportBackdrop}>
            <View style={S.reportCard}>
              <View style={S.reportHeader}>
                <Text style={S.reportTitle}>Signaler ce contenu</Text>
                <TouchableOpacity onPress={() => setReportModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <X size={20} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={S.reportSubtitle}>Pourquoi signales-tu ce contenu ?</Text>
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                {REPORT_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    style={[S.reasonRow, reason === r.value && S.reasonRowActive]}
                    onPress={() => setReason(r.value)}
                    activeOpacity={0.7}
                  >
                    <View style={[S.radio, reason === r.value && S.radioActive]}>
                      {reason === r.value && <View style={S.radioDot} />}
                    </View>
                    <Text style={S.reasonText}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                style={S.detailsInput}
                placeholder="Détails (optionnel)"
                placeholderTextColor={theme.textMuted}
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                onPress={submitReport}
                disabled={!reason || submitting}
                activeOpacity={0.85}
                style={(!reason || submitting) ? { opacity: 0.5 } : undefined}
              >
                <LinearGradient
                  colors={['#ef4444', '#b91c1c']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={S.submitBtn}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={S.submitBtnText}>ENVOYER LE SIGNALEMENT</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16, paddingTop: 8,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.border,
  },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 16, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
  },
  cancelItem: { justifyContent: 'center', borderBottomWidth: 0 },
  sheetItemText: { fontSize: 16, fontWeight: '600', color: t.text },
  reportBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', paddingHorizontal: 20,
  },
  reportCard: {
    backgroundColor: t.card, borderRadius: 24, padding: 24, gap: 14,
    borderWidth: 1, borderColor: t.border,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reportTitle: { fontSize: 18, fontWeight: '900', color: t.text },
  reportSubtitle: { fontSize: 13, color: t.textSecondary },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
  },
  reasonRowActive: {},
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: t.border,
    justifyContent: 'center', alignItems: 'center',
  },
  radioActive: { borderColor: t.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent },
  reasonText: { fontSize: 14, color: t.text, fontWeight: '600' },
  detailsInput: {
    backgroundColor: t.surface, borderRadius: 14, padding: 14,
    color: t.text, fontSize: 14, minHeight: 70, textAlignVertical: 'top',
    borderWidth: 1, borderColor: t.border,
  },
  submitBtn: {
    borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
}); }
