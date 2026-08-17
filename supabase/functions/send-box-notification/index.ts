// Edge Function: send-box-notification
// ------------------------------------------------------------------
// Delivers a box_notifications row as a real Expo push. Runs with the
// service role because push_tokens is RLS-locked to each owner, so a
// box owner cannot read their members' tokens from the client.
//
// Auth: caller must own the box the notification belongs to.
// Body: { notification_id: string }
// Returns: { sent: number, recipients: number, pref_disabled: number }
// ------------------------------------------------------------------
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => null);
    const notificationId = body?.notification_id;
    if (!notificationId || typeof notificationId !== 'string') return json({ error: 'notification_id required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ error: 'Empty token' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401);
    const callerId = userData.user.id;

    // Fetch the notification + verify the caller owns its box.
    const { data: notif, error: notifErr } = await admin
      .from('box_notifications')
      .select('id, box_id, title, body, target')
      .eq('id', notificationId)
      .maybeSingle();
    if (notifErr || !notif) return json({ error: 'Notification not found' }, 404);

    const { data: box } = await admin
      .from('boxes').select('id').eq('id', notif.box_id).eq('owner_id', callerId).maybeSingle();
    if (!box) return json({ error: 'Not owner of this box' }, 403);

    // Resolve recipients.
    let recipientIds: string[];
    if (notif.target === 'all') {
      const { data: members } = await admin
        .from('box_members')
        .select('member_id')
        .eq('box_id', notif.box_id)
        .eq('status', 'active');
      recipientIds = (members ?? []).map((m: any) => m.member_id);
    } else {
      // SÉCURITÉ (Lot 6B) : une cible nominative doit être un MEMBRE ACTIF de la
      // box. `box_notifications.target` est un text libre sans FK : sans ce
      // contrôle, un owner poussait un message signé AthleX à n'importe quel
      // utilisateur de la plateforme (trou jumeau de celui fermé sur send-push).
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (typeof notif.target !== 'string' || !UUID_RE.test(notif.target)) {
        return json({ error: 'Invalid target' }, 400);
      }
      const { data: member } = await admin
        .from('box_members')
        .select('member_id')
        .eq('box_id', notif.box_id)
        .eq('member_id', notif.target)
        .eq('status', 'active')
        .maybeSingle();
      if (!member) return json({ error: 'Target is not an active member of this box' }, 403);
      recipientIds = [notif.target];
    }
    if (recipientIds.length === 0) return json({ sent: 0, recipients: 0, pref_disabled: 0 });

    // ── PRÉFÉRENCES (2026-08-16) ─────────────────────────────────────────────
    // Cette fonction ne consultait AUCUNE préférence : une annonce du back-office
    // partait à tous les membres actifs, réglages coupés compris. Elle ne passe
    // pas par send-push (elle parle à Expo directement, parce qu'un owner n'a de
    // lien send-push qu'avec ses co-membres), donc corriger send-push ne la
    // corrigeait pas — le filtre est appliqué ici, sur la même clé.
    // Ligne de préférence absente = annonce autorisée (défaut true).
    const { data: prefs, error: prefsErr } = await admin
      .from('notification_preferences')
      .select('user_id, notifications_enabled, box_announcements')
      .in('user_id', recipientIds);
    if (prefsErr) return json({ error: 'Preferences unavailable', sent: 0 }, 503);
    const disabled = new Set(
      (prefs ?? [])
        .filter((p: any) => p.notifications_enabled === false || p.box_announcements === false)
        .map((p: any) => p.user_id),
    );
    recipientIds = recipientIds.filter((id: string) => !disabled.has(id));
    if (recipientIds.length === 0) {
      return json({ sent: 0, recipients: 0, pref_disabled: disabled.size });
    }

    const { data: tokens } = await admin
      .from('push_tokens')
      .select('token')
      .in('user_id', recipientIds);

    const list = (tokens ?? []).map((t: any) => t.token).filter(Boolean);
    if (list.length === 0) return json({ sent: 0, recipients: recipientIds.length, pref_disabled: disabled.size });

    const messages = list.map((token: string) => ({
      to: token,
      sound: 'default',
      title: notif.title,
      body: notif.body ?? '',
      data: { type: 'box_notification', box_id: notif.box_id },
    }));

    let sent = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
      if (res.ok) sent += messages.slice(i, i + 100).length;
    }

    return json({ sent, recipients: recipientIds.length, pref_disabled: disabled.size });
  } catch (e: any) {
    console.error('send-box-notification error', e);
    return json({ error: e?.message ?? 'Internal error' }, 500);
  }
});
