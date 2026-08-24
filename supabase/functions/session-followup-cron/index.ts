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
    // CRON_SECRET OBLIGATOIRE (fail-closed) : refus si secret non configure OU
    // en-tete absent/incorrect. Deploiement coordonne : cf. runbook 1C-b.
    const cronSecret = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') ?? '';
    if (!cronSecret || provided !== cronSecret) return json({ error: 'unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Journal des défauts locaux. Un lot de relances ne s'arrête pas parce
    // qu'une ligne est fautive : la fautive se journalise, les autres partent.
    // (Une réservation sans membre faisait échouer `detect_trial_followups()`,
    // et l'ancien `return 500` coupait les relances de TOUTES les box avant le
    // premier envoi — cf. migration 20261125.)
    const incidents: Array<{ etape: string; cible?: string; erreur: string }> = [];
    const incident = (etape: string, erreur: unknown, cible?: string) => {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      incidents.push({ etape, cible, erreur: message });
      console.error('session-followup-cron incident', etape, cible ?? '-', message);
    };

    // 1. Détection des nouveaux prospects. Son échec ne prive pas les funnels
    // déjà ouverts de leurs relances : il n'ajoute pas de prospect, c'est tout.
    const { data: detected, error: detErr } = await admin.rpc('detect_trial_followups');
    if (detErr) incident('detect', detErr.message);

    // 2. Charger les funnels encore ouverts.
    const { data: rows, error: rowErr } = await admin
      .from('session_followups')
      .select('id, box_id, member_id, status, first_seen_at, reminder_h_sent, reminder_d1_sent, reminder_d3_sent')
      .not('status', 'in', '(converted,lost)');
    // Sans les lignes, il n'y a rien à parcourir : cette erreur-là est bien
    // celle du lot entier, et elle se dit avec son code.
    if (rowErr) {
      incident('load', rowErr.message);
      return json({ error: `load: ${rowErr.message}`, incidents }, 500);
    }

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
    // Email = complément du push (mêmes contenus, même déclenchement).
    type Email = { user_id: string; subject: string; heading: string; body: string; cta: string };
    const pushes: Push[] = [];
    const emails: Email[] = [];
    const setH: string[] = [];
    const setD1: string[] = [];
    const setD3: string[] = [];

    for (const f of followups) {
      try {
        const age = now - new Date(f.first_seen_at).getTime();
        const box = nameByBox.get(f.box_id) ?? 'la box';
        const payload = { type: 'session_followup', followup_id: f.id, box_id: f.box_id };

        if (!f.reminder_h_sent && f.status === 'pending' && age >= 1 * HOUR) {
          const title = `Comment était ta séance chez ${box} ?`;
          pushes.push({ user_id: f.member_id, title, body: 'Donne-nous ton avis en 10 secondes 💬', data: payload });
          emails.push({ user_id: f.member_id, subject: title, heading: title,
            body: `Merci d'être venu·e chez ${box} ! Dis-nous en 10 secondes ce que tu en as pensé.`, cta: 'Laisser mon avis' });
          setH.push(f.id);
        } else if (!f.reminder_d1_sent && (f.status === 'pending' || f.status === 'responded') && age >= 24 * HOUR) {
          const title = 'On se voit pour la suite ?';
          pushes.push({ user_id: f.member_id, title, body: `Réserve un créneau avec ${box} pour parler de ton abonnement.`, data: payload });
          emails.push({ user_id: f.member_id, subject: title, heading: title,
            body: `Réserve un créneau avec ${box} pour parler de la formule qui te convient.`, cta: 'Réserver un créneau' });
          setD1.push(f.id);
        } else if (!f.reminder_d3_sent && ['pending', 'responded', 'meeting_booked'].includes(f.status) && age >= 72 * HOUR) {
          const title = `Prêt à te lancer chez ${box} ?`;
          pushes.push({ user_id: f.member_id, title, body: 'Découvre nos offres et rejoins-nous 🏋️', data: payload });
          emails.push({ user_id: f.member_id, subject: title, heading: title,
            body: `Découvre les offres de ${box} et rejoins la communauté quand tu veux.`, cta: 'Voir les offres' });
          setD3.push(f.id);
        }
      } catch (err) {
        // Une date illisible, un statut inattendu : la ligne saute, pas le lot.
        incident('planification', err, f.id);
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
        const lot = messages.slice(i, i + 100);
        try {
          const res = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(lot),
          });
          if (res.ok) sent += lot.length;
          else incident('push', `${res.status} ${await res.text()}`, `lot ${i / 100 + 1}`);
        } catch (err) {
          // Sans ce filet, un Expo injoignable emportait aussi les e-mails et
          // le marquage : le lot repartait à zéro à l'exécution suivante.
          incident('push', err, `lot ${i / 100 + 1}`);
        }
      }
    }

    // 3bis. Emails de relance (Resend). Complément du push : silencieux si la
    // clé n'est pas configurée (le push, lui, part déjà).
    let emailed = 0;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (RESEND_API_KEY && emails.length) {
      const FROM = Deno.env.get('RESEND_FROM') ?? 'AthleX <noreply@athlexapp.eu>';
      const WEB_URL = Deno.env.get('APP_WEB_URL') ?? 'https://athlexapp.eu';
      const suiviUrl = `${WEB_URL}/suivi`;

      const memberIds = [...new Set(emails.map((e) => e.user_id))];
      const { data: profiles } = await admin.from('profiles').select('id, email').in('id', memberIds);
      const emailByUser = new Map<string, string>();
      for (const p of (profiles ?? []) as { id: string; email: string | null }[]) {
        if (p.email) emailByUser.set(p.id, p.email);
      }

      const esc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      for (const e of emails) {
        const to = emailByUser.get(e.user_id);
        if (!to) continue;
        const html = `<!DOCTYPE html><html><body style="margin:0;background:#000;font-family:Arial,Helvetica,sans-serif;color:#fff">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:32px 24px">
    <tr><td>
      <h1 style="font-size:22px;font-weight:800;margin:0 0 16px">${esc(e.heading)}</h1>
      <p style="font-size:15px;line-height:1.5;color:#cfcfcf;margin:0 0 24px">${esc(e.body)}</p>
      <a href="${suiviUrl}" style="display:inline-block;background:#fff;color:#000;font-weight:700;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px">${esc(e.cta)}</a>
      <p style="font-size:12px;color:#777;margin:28px 0 0">Tu reçois cet email suite à ta séance d'essai. AthleX.</p>
    </td></tr>
  </table>
</body></html>`;
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM, to, subject: e.subject, html }),
          });
          if (res.ok) emailed += 1;
          else incident('email', `${res.status} ${await res.text()}`, e.user_id);
        } catch (err) {
          incident('email', err, e.user_id);
        }
      }
    }

    // 4. Marquer les relances envoyées (idempotence des prochaines exécutions).
    //
    // Le marquage groupé était muet : son erreur n'était pas lue, et une seule
    // ligne refusée laissait tout le lot non marqué — donc renvoyé à la
    // prochaine exécution. En repli, chaque ligne est marquée pour elle-même.
    const marquer = async (colonne: 'reminder_h_sent' | 'reminder_d1_sent' | 'reminder_d3_sent', ids: string[]) => {
      if (!ids.length) return;
      const patch = { [colonne]: true, updated_at: new Date().toISOString() };
      const { error } = await admin.from('session_followups').update(patch).in('id', ids);
      if (!error) return;
      incident('marquage', error.message, `${colonne} × ${ids.length}`);
      for (const id of ids) {
        const { error: unitaire } = await admin.from('session_followups').update(patch).eq('id', id);
        if (unitaire) incident('marquage', unitaire.message, `${colonne} ${id}`);
      }
    };
    await marquer('reminder_h_sent', setH);
    await marquer('reminder_d1_sent', setD1);
    await marquer('reminder_d3_sent', setD3);

    return json({
      detected: detected ?? 0,
      reminders: setH.length + setD1.length + setD3.length,
      push_sent: sent,
      emailed,
      incidents,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('session-followup-cron error', message);
    return json({ error: message }, 500);
  }
});
