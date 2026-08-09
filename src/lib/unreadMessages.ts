import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { captureError } from './sentry';

/** Clé écrite par MessagesScreen à chaque ouverture de l'écran. */
export function lastSeenMessagesKey(userId: string, boxId: string): string {
  return `lastSeenMessages_${userId}_${boxId}`;
}

/**
 * Messages non lus d'un membre : discussions de groupe (`group_messages`) dont
 * il fait partie + annonces de la box (`box_messages`) qui lui sont destinées,
 * postées après sa dernière ouverture de l'écran Messages.
 *
 * La table `messages` n'est plus alimentée : compter dessus rendait le badge
 * définitivement à 0.
 */
export async function countUnreadMessages(userId: string, boxId: string): Promise<number> {
  try {
    const since = await AsyncStorage.getItem(lastSeenMessagesKey(userId, boxId));

    const { data: groupRows, error: groupsError } = await supabase
      .from('message_groups')
      .select('id')
      .eq('box_id', boxId)
      .contains('members', [userId]);
    if (groupsError) throw groupsError;
    const groupIds = (groupRows ?? []).map(g => g.id);

    let groupCount = 0;
    if (groupIds.length > 0) {
      let q = supabase
        .from('group_messages')
        .select('id', { count: 'exact', head: true })
        .in('group_id', groupIds)
        .neq('sender_id', userId);
      if (since) q = q.gt('created_at', since);
      const { count, error } = await q;
      if (error) throw error;
      groupCount = count ?? 0;
    }

    // Annonces : celles adressées à tous (target_group_id NULL) + celles de ses groupes.
    let announceQuery = supabase
      .from('box_messages')
      .select('id', { count: 'exact', head: true })
      .eq('box_id', boxId);
    announceQuery = groupIds.length > 0
      ? announceQuery.or(`target_group_id.is.null,target_group_id.in.(${groupIds.join(',')})`)
      : announceQuery.is('target_group_id', null);
    if (since) announceQuery = announceQuery.gt('sent_at', since);
    const { count: announceCount, error: announceError } = await announceQuery;
    if (announceError) throw announceError;

    return groupCount + (announceCount ?? 0);
  } catch (e) {
    captureError(e, { action: 'countUnreadMessages', boxId });
    return 0;
  }
}

type SeenListener = () => void;
const seenListeners = new Set<SeenListener>();

/** Signalé par MessagesScreen : le badge doit retomber à 0 immédiatement. */
export function markMessagesSeen(): void {
  seenListeners.forEach(l => l());
}

export function subscribeMessagesSeen(listener: SeenListener): () => void {
  seenListeners.add(listener);
  return () => { seenListeners.delete(listener); };
}
