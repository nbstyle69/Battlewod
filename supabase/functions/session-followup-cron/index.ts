// Edge Function: session-followup-cron
// ------------------------------------------------------------------
// Funnel d'acquisition « essai / Drop-in ». À déclencher périodiquement
// (pg_cron / Supabase schedule, ex. toutes les heures) :
//   1. detect_trial_followups() → crée les funnels « pending » des 1res
//      séances de non-abonnés.
//   2. Relances push :
//        H+1–2  → demande de feedback           (reminder_h_sent)
//        J+1    → « on se voit pour la suite ? » (reminder_d1_sent)
//        J+3    → dernière relance               (reminder_d3_sent)
//
// Service role : push_tokens est RLS-locké par user, on lit donc les
// tokens des prospects côté serveur. Garde optionnelle via CRON_SECRET.
// ------------------------------------------------------------------
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface FollowupRow {
  id: string;
  box_id: string;
  member_id: string;
  status: string;
  first_seen_at: string;
  reminder_h_sent: boolean;
  reminder_d1_sent: boolean;
  reminder_d3_sent: boolean;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (cronSecret) {
      const provided = req.headers.get('x-cron-secret') ?? '';
      if (provided !== cronSecret) return json({ error: 'unauthorized' }, 401);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Détection des nouveaux prospects.
    const { data: detected, error: detErr } = await admin.rpc('detect_trial_followups');
    if (detErr) return json({ error: `detect: ${detErr.message}` }, 500);

    // 2. Charger les funnels encore ouverts.
    const { data: rows, error: rowErr } = await admin
      .from('session_followups')
      .select('id, box_id, member_id, status, first_seen_at, reminder_h_sent, reminder_d1_sent, reminder_d3_sent')
      .not('status', 'in', '(converted,lost)');
    if (rowErr) return json({ error: `load: ${rowErr.message}` }, 500);

    const now = Date.now();
    const HOUR = 3600 * 1000;
    const followups = (rows ?? []) as FollowupRow[];

    // Box name lookup for nicer push copy.
    const boxIds = [...new Set(followups.map((f) => f.box_id))];
    const nameByBox = new Map<string, string>();
    if (boxIds.length) {
      const { data: boxes } = await admin.from('boxes').select('id, name').in('id', boxIds);
      for (const b of (boxes ?? []) as { id: string; name: string }[]) nameByBox.set(b.id, b.name);
    }

    type Push = { user_id: string; title: string; body: string; data: Record<string, unknown> };
    const pushes: Push[] = [];
    const setH: string[] = [];
    const setD1: string[] = [];
    const setD3: string[] = [];

    for (const f of followups) {
      const age = now - new Date(f.first_seen_at).getTime();
      const box = nameByBox.get(f.box_id) ?? 'la box';
      const payload = { type: 'session_followup', followup_id: f.id, box_id: f.box_id };

      if (!f.reminder_h_sent && f.status === 'pending' && age >= 1 * HOUR) {
        pushes.push({ user_id: f.member_id, title: `Comment était ta séance chez ${box} ?`,
          body: 'Donne-nous ton avis en 10 secondes 💬', data: payload });
        setH.push(f.id);
      } else if (!f.reminder_d1_sent && (f.status === 'pending' || f.status === 'responded') && age >= 24 * HOUR) {
        pushes.push({ user_id: f.member_id, title: `On se voit pour la suite ?`,
          body: `Réserve un créneau avec ${box} pour parler de ton abonnement.`, data: payload });
        setD1.push(f.id);
      } else if (!f.reminder_d3_sent && ['pending', 'responded', 'meeting_booked'].includes(f.status) && age >= 72 * HOUR) {
        pushes.push({ user_id: f.member_id, title: `Prêt à te lancer chez ${box} ?`,
          body: 'Découvre nos offres et rejoins-nous 🏋️', data: payload });
        setD3.push(f.id);
      }
    }

    // 3. Résoudre les tokens et envoyer les push Expo.
    let sent = 0;
    if (pushes.length) {
      const memberIds = [...new Set(pushes.map((p) => p.user_id))];
      const { data: tokens } = await admin.from('push_tokens').select('user_id, token').in('user_id', memberIds);
      const tokensByUser = new Map<string, string[]>();
      for (const t of (tokens ?? []) as { user_id: string; token: string }[]) {
        if (!t.token) continue;
        const arr = tokensByUser.get(t.user_id) ?? [];
        arr.push(t.token);
        tokensByUser.set(t.user_id, arr);
      }

      const messages = pushes.flatMap((p) =>
        (tokensByUser.get(p.user_id) ?? []).map((to) => ({
          to, sound: 'default', title: p.title, body: p.body, data: p.data,
        })),
      );
      for (let i = 0; i < messages.length; i += 100) {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(messages.slice(i, i + 100)),
        });
        if (res.ok) sent += messages.slice(i, i + 100).length;
      }
    }

    // 4. Marquer les relances envoyées (idempotence des prochaines exécutions).
    if (setH.length) await admin.from('session_followups').update({ reminder_h_sent: true, updated_at: new Date().toISOString() }).in('id', setH);
    if (setD1.length) await admin.from('session_followups').update({ reminder_d1_sent: true, updated_at: new Date().toISOString() }).in('id', setD1);
    if (setD3.length) await admin.from('session_followups').update({ reminder_d3_sent: true, updated_at: new Date().toISOString() }).in('id', setD3);

    return json({ detected: detected ?? 0, reminders: setH.length + setD1.length + setD3.length, push_sent: sent });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('session-followup-cron error', message);
    return json({ error: message }, 500);
  }
});
