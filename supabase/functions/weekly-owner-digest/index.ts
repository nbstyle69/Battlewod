// Edge Function: weekly-owner-digest
// ------------------------------------------------------------------
// Récapitulatif hebdomadaire du gérant (lot 3 « Croissance »).
// À déclencher une fois par semaine (pg_cron), en tête de semaine :
//   « Ta semaine : X nouveaux, Y présences, Z membres à risque, N impayés »
//
// Toute la matière vient d'UN appel à `get_weekly_digest_batch(p_days)`,
// réservé au service_role : la fonction ne parcourt pas les box elle-même et
// n'a donc aucune occasion de mélanger deux box. Une ligne = une box = un
// e-mail, envoyé au gérant de cette box uniquement.
//
// L'opt-out est appliqué côté SQL (`box_owner_email_prefs.weekly_digest`) :
// une box désabonnée ne sort pas du lot, donc rien ici ne peut l'oublier.
// ------------------------------------------------------------------
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface DigestRow {
  box_id: string;
  box_name: string;
  owner_id: string;
  owner_email: string;
  new_members: number;
  attendances: number;
  members_at_risk: number;
  past_due_count: number;
  trials: number;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    // CRON_SECRET obligatoire (fail-closed), comme les autres edge planifiées.
    const cronSecret = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') ?? '';
    if (!cronSecret || provided !== cronSecret) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await admin.rpc('get_weekly_digest_batch', { p_days: 7 });
    if (error) return json({ error: `digest: ${error.message}` }, 500);
    const rows = (data ?? []) as DigestRow[];

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) return json({ boxes: rows.length, emailed: 0, reason: 'RESEND_API_KEY absent' });

    // Ce courrier vient de la plateforme, pas de la box : il porte le nom du produit
    // gérant, à l'inverse des invitations qui partent au nom de la box.
    const FROM = Deno.env.get('RESEND_FROM_MANAGER') ?? 'AthleX Manager <noreply@athlexapp.eu>';
    const WEB_URL = Deno.env.get('APP_WEB_URL') ?? 'https://athlexapp.eu';
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let emailed = 0;
    const failures: string[] = [];

    for (const r of rows) {
      // Une ligne du récapitulatif = un chiffre + l'écran où agir. Un chiffre
      // sans action est précisément ce que la refonte des stats a retiré.
      const lines: [string, string, string][] = [
        [`${r.new_members}`, r.new_members > 1 ? 'nouveaux membres' : 'nouveau membre', '/members'],
        [`${r.attendances}`, r.attendances > 1 ? 'présences pointées' : 'présence pointée', '/schedules'],
        [`${r.members_at_risk}`, r.members_at_risk > 1 ? 'membres à relancer' : 'membre à relancer', '/stats'],
        [`${r.past_due_count}`, r.past_due_count > 1 ? 'impayés' : 'impayé', '/subscribers'],
        // L'acquisition a sa ligne : un essai n'est pas une présence d'adhérent,
        // et le gérant a un écran où le relancer.
        [`${r.trials ?? 0}`, (r.trials ?? 0) > 1 ? 'essais réservés' : 'essai réservé', '/prospects'],
      ];

      const html = `<!DOCTYPE html><html><body style="margin:0;background:#000;font-family:Arial,Helvetica,sans-serif;color:#fff">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:32px 24px">
    <tr><td>
      <h1 style="font-size:22px;font-weight:800;margin:0 0 4px">Ta semaine chez ${esc(r.box_name)}</h1>
      <p style="font-size:13px;color:#777;margin:0 0 24px">7 derniers jours</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${lines.map(([n, label, href]) => `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #222">
            <span style="font-size:24px;font-weight:800">${esc(n)}</span>
            <span style="font-size:15px;color:#cfcfcf;margin-left:8px">${esc(label)}</span>
            <a href="${WEB_URL}${href}" style="float:right;font-size:13px;color:#fff;text-decoration:underline">voir</a>
          </td></tr>`).join('')}
      </table>
      <a href="${WEB_URL}/stats" style="display:inline-block;margin-top:24px;background:#fff;color:#000;font-weight:700;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px">Ouvrir mes statistiques</a>
      <p style="font-size:12px;color:#777;margin:28px 0 0">
        Tu reçois ce récapitulatif en tant que gérant de ${esc(r.box_name)}.
        Pour ne plus le recevoir : Réglages → Notifications, dans ton back-office.
      </p>
    </td></tr>
  </table>
</body></html>`;

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM,
            to: r.owner_email,
            subject: `Ta semaine chez ${r.box_name}`,
            html,
          }),
        });
        if (res.ok) emailed += 1;
        else {
          const detail = await res.text();
          console.error('resend error', res.status, detail);
          failures.push(`${r.box_id}: ${res.status}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('resend fetch failed', message);
        failures.push(`${r.box_id}: ${message}`);
      }
    }

    return json({ boxes: rows.length, emailed, failures });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('weekly-owner-digest error', message);
    return json({ error: message }, 500);
  }
});
