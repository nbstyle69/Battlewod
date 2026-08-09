import { supabase } from './supabase';
import { captureError } from './sentry';

/**
 * Code d'invitation de SA box, à la demande.
 * `boxes.invite_code` n'est plus lu par l'app (Phase 3 le révoque à
 * `authenticated`) : la RPC `get_my_box_invite_code` le rend au seul owner/coach.
 */
export async function getMyBoxInviteCode(boxId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('get_my_box_invite_code', { p_box_id: boxId });
    if (error) throw error;
    return data ?? null;
  } catch (e) {
    captureError(e, { action: 'getMyBoxInviteCode', boxId });
    return null;
  }
}
