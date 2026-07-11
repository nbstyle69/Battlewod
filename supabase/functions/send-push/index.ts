// Edge Function: send-push
// ------------------------------------------------------------------
// Generic fan-out for cross-user push notifications. Runs with the
// service role because push_tokens AND notification_preferences are
// RLS-locked to each user (auth.uid() = user_id), so a client can
// neither read another member's tokens nor check their prefs. Every
// cross-user notification in src/services/notifications.ts routes here.
//
// Auth: any valid authenticated JWT (app-triggered notifications).
// Body: {
//   recipients: Array<{ user_id: string; title: string; body: string; data?: object }>,
//   pref_key?: string  // skip recipients whose notification_preferences[pref_key] === false
// }
// Returns: { sent: number, recipients: number }
// ------------------------------------------------------------------
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Only these boolean columns may be used as a per-recipient gate.
const ALLOWED_PREF_KEYS = new Set([
  'friend_requests',
  'tournament_updates',
  'score_updates',
  'score_comments',
  'score_reactions',
]);

interface Recipient {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    const jwt = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ error: 'Missing token' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json().catch(() => null);
    const recipients: Recipient[] = Array.isArray(body?.recipients) ? body.recipients : [];
    const prefKey: string | undefined =
      typeof body?.pref_key === 'string' && ALLOWED_PREF_KEYS.has(body.pref_key) ? body.pref_key : undefined;

    // De-dupe recipient user ids, keep the first message per user id.
    const byUser = new Map<string, Recipient>();
    for (const r of recipients) {
      if (r && typeof r.user_id === 'string' && r.user_id && !byUser.has(r.user_id)) byUser.set(r.user_id, r);
    }
    let userIds = [...byUser.keys()];
    if (userIds.length === 0) return json({ sent: 0, recipients: 0 });

    // Filter by per-recipient preference if requested (default true when missing).
    if (prefKey) {
      const { data: prefs } = await admin
        .from('notification_preferences')
        .select(`user_id, ${prefKey}`)
        .in('user_id', userIds);
      const disabled = new Set(
        (prefs ?? []).filter((p: any) => p[prefKey] === false).map((p: any) => p.user_id),
      );
      userIds = userIds.filter((id) => !disabled.has(id));
      if (userIds.length === 0) return json({ sent: 0, recipients: 0 });
    }

    // Fetch tokens for the (filtered) recipients.
    const { data: tokens } = await admin
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', userIds);
    if (!tokens || tokens.length === 0) return json({ sent: 0, recipients: userIds.length });

    const messages = tokens
      .filter((t: any) => t.token && byUser.has(t.user_id))
      .map((t: any) => {
        const r = byUser.get(t.user_id)!;
        return {
          to: t.token,
          sound: 'default',
          title: r.title,
          body: r.body ?? '',
          data: r.data ?? {},
        };
      });
    if (messages.length === 0) return json({ sent: 0, recipients: userIds.length });

    let sent = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (res.ok) sent += chunk.length;
    }

    return json({ sent, recipients: userIds.length });
  } catch (e: any) {
    console.error('send-push error', e);
    return json({ error: e?.message ?? 'Internal error' }, 500);
  }
});
