// Edge Function: dunning-cron
// ------------------------------------------------------------------
// Relances d'impayé sur les abonnements de salle. À déclencher
// périodiquement (pg_cron / Supabase schedule, ex. 1×/jour) :
//   J+0  → « ton prélèvement a échoué »        (1re relance)
//   J+3  → « ton accès sera suspendu le X »    (2e relance)
//   J+7  → « accès suspendu »                  (3e et dernière relance)
//
// L'échéancier est dérivé de box_members.past_due_since (écrit par le
// webhook Stripe Connect de TheHub sur invoice.payment_failed) et le
// compteur `dunning_reminders_sent` garantit l'idempotence : une même
// étape n'est jamais envoyée deux fois, même si le cron tourne plus
// souvent. Un `invoice.paid` remet past_due_since à NULL → plus aucune
// relance et accès rétabli immédiatement.
//
// Service role : push_tokens et profiles sont RLS-lockés par user.
// Garde optionnelle via CRON_SECRET.
// ------------------------------------------------------------------
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DAY = 86_400_000;
// Âge de l'impayé déclenchant la n-ième relance (index = relances déjà envoyées).
const REMINDER_SCHEDULE_DAYS = [0, 3, 7];

interface PastDueRow {
  id: string;
  box_id: string;
  member_id: string;
  past_due_since: string;
  dunning_reminders_sent: number;
  last_payment_error: string | null;
  boxes: { name: string; dunning_grace_days: number | null } | null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    // CRON_SECRET OBLIGATOIRE (fail-closed) : refus si secret non configure OU
    // en-tete absent/incorrect. Deploiement coordonne : cf. runbook 1C-b.
    const cronSecret = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') ?? '';
    if (!cronSecret || provided !== cronSecret) return json({ error: 'unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: rows, error: rowErr } = await admin
      .from('box_members')
      .select('id, box_id, member_id, past_due_since, dunning_reminders_sent, last_payment_error, boxes(name, dunning_grace_days)')
      .eq('subscription_status', 'past_due')
      .not('past_due_since', 'is', null);
    if (rowErr) return json({ error: `load: ${rowErr.message}` }, 500);

    const now = Date.now();
    const members = (rows ?? []) as unknown as PastDueRow[];

    type Reminder = {
      row_id: string;
      member_id: string;
      step: number;
      title: string;
      body: string;
      data: Record<string, unknown>;
    };
    const reminders: Reminder[] = [];

    for (const m of members) {
      const sent = m.dunning_reminders_sent ?? 0;
      if (sent >= REMINDER_SCHEDULE_DAYS.length) continue;

      const ageDays = (now - new Date(m.past_due_since).getTime()) / DAY;
      if (ageDays < REMINDER_SCHEDULE_DAYS[sent]) continue;

      const box = m.boxes?.name ?? 'ta box';
      const graceDays = m.boxes?.dunning_grace_days ?? 7;
      const suspendsIn = Math.max(0, Math.ceil(graceDays - ageDays));
      const payload = { type: 'membership_past_due', box_id: m.box_id };

      const copy = sent === 0
        ? {
            title: 'Ton prélèvement a échoué',
            body: `Mets ton moyen de paiement à jour pour garder ton accès à ${box}.`,
          }
        : sent === 1
        ? {
            title: 'Impayé — action requise',
            body: suspendsIn > 0
              ? `Sans régularisation, tes réservations chez ${box} seront suspendues dans ${suspendsIn} jour(s).`
              : `Tes réservations chez ${box} vont être suspendues.`,
          }
        : {
            title: 'Réservations suspendues',
            body: `Ton abonnement ${box} est impayé : les réservations sont bloquées jusqu'à régularisation.`,
          };

      reminders.push({ row_id: m.id, member_id: m.member_id, step: sent + 1, data: payload, ...copy });
    }

    if (!reminders.length) {
      return json({ past_due: members.length, reminders: 0, push_sent: 0, emailed: 0 });
    }

    // ── Push Expo ────────────────────────────────────────────────────
    let pushSent = 0;
    const memberIds = [...new Set(reminders.map((r) => r.member_id))];
    const { data: tokens } = await admin
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', memberIds);

    const tokensByUser = new Map<string, string[]>();
    for (const t of (tokens ?? []) as { user_id: string; token: string }[]) {
      if (!t.token) continue;
      const arr = tokensByUser.get(t.user_id) ?? [];
      arr.push(t.token);
      tokensByUser.set(t.user_id, arr);
    }

    const messages = reminders.flatMap((r) =>
      (tokensByUser.get(r.member_id) ?? []).map((to) => ({
        to, sound: 'default', title: r.title, body: r.body, data: r.data,
      })),
    );
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (res.ok) pushSent += batch.length;
    }

    // ── Email Resend (complément du push, silencieux sans clé) ───────
    let emailed = 0;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (RESEND_API_KEY) {
      const FROM = Deno.env.get('RESEND_FROM') ?? 'AthleX <no-reply@athlex.app>';
      const WEB_URL = Deno.env.get('APP_WEB_URL') ?? 'https://the-hub-rho.vercel.app';
      const billingUrl = `${WEB_URL}/compte`;

      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email')
        .in('id', memberIds);
      const emailByUser = new Map<string, string>();
      for (const p of (profiles ?? []) as { id: string; email: string | null }[]) {
        if (p.email) emailByUser.set(p.id, p.email);
      }

      const esc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      for (const r of reminders) {
        const to = emailByUser.get(r.member_id);
        if (!to) continue;
        const html = `<!DOCTYPE html><html><body style="margin:0;background:#000;font-family:Arial,Helvetica,sans-serif;color:#fff">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:32px 24px">
    <tr><td>
      <h1 style="font-size:22px;font-weight:800;margin:0 0 16px">${esc(r.title)}</h1>
      <p style="font-size:15px;line-height:1.5;color:#cfcfcf;margin:0 0 24px">${esc(r.body)}</p>
      <a href="${billingUrl}" style="display:inline-block;background:#fff;color:#000;font-weight:700;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px">Mettre à jour mon paiement</a>
      <p style="font-size:12px;color:#777;margin:28px 0 0">Tu reçois cet email car un prélèvement de ton abonnement a échoué. AthleX.</p>
    </td></tr>
  </table>
</body></html>`;
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM, to, subject: r.title, html }),
          });
          if (res.ok) emailed += 1;
          else console.error('resend error', res.status, await res.text());
        } catch (err) {
          console.error('resend fetch failed', err instanceof Error ? err.message : String(err));
        }
      }
    }

    // ── Marquer les relances envoyées (idempotence) ──────────────────
    const nowIso = new Date().toISOString();
    for (const r of reminders) {
      await admin
        .from('box_members')
        .update({ dunning_reminders_sent: r.step, dunning_last_reminder_at: nowIso })
        .eq('id', r.row_id);
    }

    return json({ past_due: members.length, reminders: reminders.length, push_sent: pushSent, emailed });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('dunning-cron error', message);
    return json({ error: message }, 500);
  }
});
