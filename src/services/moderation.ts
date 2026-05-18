import { supabase } from '../lib/supabase';
import { captureError } from '../lib/sentry';

export type ReportContentType = 'video' | 'message' | 'profile' | 'comment' | 'score' | 'box';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'hate' | 'cheating' | 'nudity' | 'violence' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam / publicité' },
  { value: 'harassment', label: 'Harcèlement' },
  { value: 'inappropriate', label: 'Contenu inapproprié' },
  { value: 'hate', label: 'Discours haineux' },
  { value: 'nudity', label: 'Nudité / sexuel' },
  { value: 'violence', label: 'Violence' },
  { value: 'cheating', label: 'Tricherie (score)' },
  { value: 'other', label: 'Autre' },
];

/**
 * Report a piece of UGC content (video, message, profile, comment, score, box).
 * @returns the report id, or null on failure.
 */
export async function reportContent(params: {
  contentType: ReportContentType;
  contentId?: string;
  reportedUserId?: string;
  reason: ReportReason;
  details?: string;
}): Promise<string | null> {
  try {
    const { data, error } = await (supabase.rpc as any)('report_content', {
      p_content_type: params.contentType,
      p_content_id: params.contentId ?? null,
      p_reported_user_id: params.reportedUserId ?? null,
      p_reason: params.reason,
      p_details: params.details ?? null,
    });
    if (error) throw error;
    return data as string;
  } catch (e) {
    captureError(e, { action: 'reportContent', ...params });
    return null;
  }
}

/**
 * Block a user. Prevents seeing their messages, profile, comments.
 */
export async function blockUser(blockedId: string): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;
    if (auth.user.id === blockedId) return false;
    const { error } = await (supabase.from as any)('user_blocks').upsert({
      blocker_id: auth.user.id,
      blocked_id: blockedId,
    }, { onConflict: 'blocker_id,blocked_id' });
    if (error) throw error;
    return true;
  } catch (e) {
    captureError(e, { action: 'blockUser', blockedId });
    return false;
  }
}

export async function unblockUser(blockedId: string): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;
    const { error } = await (supabase.from as any)('user_blocks')
      .delete()
      .eq('blocker_id', auth.user.id)
      .eq('blocked_id', blockedId);
    if (error) throw error;
    return true;
  } catch (e) {
    captureError(e, { action: 'unblockUser', blockedId });
    return false;
  }
}

/**
 * Returns the list of user IDs that the current user has blocked OR has been blocked by.
 * Used to filter out content from blocked users in client queries.
 */
export async function getBlockedUserIds(): Promise<string[]> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [];
    const uid = auth.user.id;
    const { data } = await (supabase.from as any)('user_blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`);
    const ids = new Set<string>();
    for (const row of (data ?? []) as any[]) {
      if (row.blocker_id !== uid) ids.add(row.blocker_id);
      if (row.blocked_id !== uid) ids.add(row.blocked_id);
    }
    return Array.from(ids);
  } catch (e) {
    captureError(e, { action: 'getBlockedUserIds' });
    return [];
  }
}

/**
 * Returns the list of user IDs that the current user has explicitly blocked
 * (one-way, for the "Blocked users" management screen).
 */
export async function getMyBlockedUsers(): Promise<{ id: string; username: string; avatar_url: string | null }[]> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [];
    const { data } = await (supabase.from as any)('user_blocks')
      .select('blocked_id, profiles:blocked_id(id, username, avatar_url)')
      .eq('blocker_id', auth.user.id);
    return ((data ?? []) as any[])
      .map((r) => r.profiles)
      .filter(Boolean);
  } catch (e) {
    captureError(e, { action: 'getMyBlockedUsers' });
    return [];
  }
}

export async function isUserBlocked(otherUserId: string): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;
    const { data } = await (supabase.from as any)('user_blocks')
      .select('blocker_id')
      .or(`and(blocker_id.eq.${auth.user.id},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${auth.user.id})`)
      .limit(1);
    return ((data ?? []) as any[]).length > 0;
  } catch (e) {
    return false;
  }
}
