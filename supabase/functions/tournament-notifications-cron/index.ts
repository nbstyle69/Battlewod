// Edge Function: tournament-notifications-cron
// ------------------------------------------------------------------
// Les quatre notifications de tournoi demandées par le produit :
//
//   tournament_started   « 🏆 [Tournoi] démarre — le WOD 1 est disponible »
//   wod_scheduled        « 📅 Prochain WOD le … »           (opens_at futur)
//   wod_open             « 🔥 Le WOD est ouvert, tu as X h pour soumettre »
//   submission_reminder  « ⏳ Il te reste X h pour soumettre ton score »
//
// POURQUOI UNE FONCTION EDGE ET PAS DU SQL. Le balayage d'activation
// (20261015) est du PL/pgSQL : il ne peut pas parler à Expo. On réutilise donc
// le CRON existant comme déclencheur temporel, pas un nouveau mécanisme de
// planification, et on n'ajoute aucun second chemin d'envoi : tout part par
// send-push, qui applique la clé de préférence (`tournament_updates`) côté
// serveur. C'est le seul écart au « pas de nouveau mécanisme », assumé.
//
// UNICITÉ. « Un seul rappel par WOD et par personne » ne peut pas reposer sur
// l'heure de passage du cron (chevauchement, rejeu après incident, exécution
// manuelle). On INSÈRE d'abord dans tournament_notifications_sent — dont l'index
// unique rend le doublon impossible en base — et on n'envoie qu'aux lignes
// réellement insérées. Conséquence assumée : si l'envoi échoue après
// l'insertion, la notification est perdue plutôt que dupliquée.
//
// QUI EST NOTIFIÉ. Uniquement les inscrits (tournament_participants), et pour
// le rappel de soumission uniquement ceux SANS ligne dans tournament_scores
// pour ce WOD — quel que soit son statut, « en attente de validation » compris :
// un athlète qui a soumis ne doit pas recevoir « il te reste X h ».
// ------------------------------------------------------------------
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const HOUR = 3600 * 1000;

// Le rappel part quand il reste peu de temps : quelques heures avant
// l'échéance, ou la moitié de la fenêtre si celle-ci est courte (une fenêtre de
// 2 h ne doit pas déclencher son rappel avant même son ouverture).
const REMINDER_LEAD_HOURS = 6;

type Kind = 'tournament_started' | 'wod_scheduled' | 'wod_open' | 'submission_reminder';

interface Wod {
  id: string;
  tournament_id: string;
  title: string;
  order_index: number;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  deadline_hours: number;
  division_id: string | null;
}

interface Target {
  kind: Kind;
  tournament_id: string;
  wod_id: string | null;
  athlete_id: string;
  title: string;
  body: string;
  type: string; // data.type → clé de préférence côté send-push
}

/** Fin effective de la fenêtre de soumission, ou null si indéterminable. */
function closesAt(w: Wod): number | null {
  if (w.closes_at) return new Date(w.closes_at).getTime();
  // Pas de closes_at : la fenêtre vaut deadline_hours à partir de l'ouverture.
  // Sans opens_at NI closes_at, aucune échéance n'est connue — on ne l'invente
  // pas (un « il te reste 24 h » faux est pire que pas de rappel).
  if (w.opens_at) return new Date(w.opens_at).getTime() + w.deadline_hours * HOUR;
  return null;
}

function frDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    // CRON_SECRET obligatoire (fail-closed, cf. Lot 1C-b) : secret non
    // configuré ou en-tête absent/incorrect → refus.
    const cronSecret = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') ?? '';
    if (!cronSecret || provided !== cronSecret) return json({ error: 'unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const now = Date.now();

    // ── Tournois vivants et leurs inscrits ────────────────────────────────
    const { data: tourns, error: tErr } = await admin
      .from('tournaments').select('id, name, status').in('status', ['open', 'active']);
    if (tErr) return json({ error: `tournaments: ${tErr.message}` }, 500);
    const tournaments = (tourns ?? []) as { id: string; name: string; status: string }[];
    if (!tournaments.length) return json({ candidates: 0, sent: 0 });

    const tIds = tournaments.map((t) => t.id);
    const nameById = new Map(tournaments.map((t) => [t.id, t.name]));
    const statusById = new Map(tournaments.map((t) => [t.id, t.status]));

    const { data: parts, error: pErr } = await admin
      .from('tournament_participants').select('tournament_id, athlete_id').in('tournament_id', tIds);
    if (pErr) return json({ error: `participants: ${pErr.message}` }, 500);
    const athletesByTournament = new Map<string, string[]>();
    for (const p of (parts ?? []) as { tournament_id: string; athlete_id: string }[]) {
      const arr = athletesByTournament.get(p.tournament_id) ?? [];
      arr.push(p.athlete_id);
      athletesByTournament.set(p.tournament_id, arr);
    }

    const { data: wodRows, error: wErr } = await admin
      .from('tournament_wods')
      .select('id, tournament_id, title, order_index, status, opens_at, closes_at, deadline_hours, division_id')
      .in('tournament_id', tIds).eq('status', 'active');
    if (wErr) return json({ error: `wods: ${wErr.message}` }, 500);
    const wods = (wodRows ?? []) as Wod[];

    // Divisions : un WOD de division ne concerne que ses membres.
    const divisionWodIds = wods.filter((w) => w.division_id).map((w) => w.division_id!) as string[];
    const divisionMembers = new Map<string, Set<string>>();
    if (divisionWodIds.length) {
      const { data: dm, error: dmErr } = await admin
        .from('tournament_division_members').select('division_id, athlete_id').in('division_id', divisionWodIds);
      if (dmErr) return json({ error: `divisions: ${dmErr.message}` }, 500);
      for (const r of (dm ?? []) as { division_id: string; athlete_id: string }[]) {
        const set = divisionMembers.get(r.division_id) ?? new Set<string>();
        set.add(r.athlete_id);
        divisionMembers.set(r.division_id, set);
      }
    }

    /** Inscrits concernés par ce WOD (division comprise). */
    function audience(w: Wod): string[] {
      const all = athletesByTournament.get(w.tournament_id) ?? [];
      if (!w.division_id) return all;
      const members = divisionMembers.get(w.division_id) ?? new Set<string>();
      return all.filter((a) => members.has(a));
    }

    const targets: Target[] = [];

    // ── 1. Démarrage du tournoi ───────────────────────────────────────────
    // Le passage open → active est déjà fait par 20261015 (trigger + balayage).
    // On se raccroche à son RÉSULTAT (status='active') plutôt que d'observer la
    // transition : un tournoi activé pendant une panne du cron reste annoncé.
    for (const t of tournaments) {
      if (statusById.get(t.id) !== 'active') continue;
      const firstWod = wods
        .filter((w) => w.tournament_id === t.id && (!w.opens_at || new Date(w.opens_at).getTime() <= now))
        .sort((a, b) => a.order_index - b.order_index)[0];
      if (!firstWod) continue;
      for (const athlete_id of athletesByTournament.get(t.id) ?? []) {
        targets.push({
          kind: 'tournament_started', tournament_id: t.id, wod_id: null, athlete_id,
          title: `🏆 ${t.name} démarre`,
          body: `Le WOD ${firstWod.order_index + 1} est disponible — à toi de jouer !`,
          type: 'tournament_started',
        });
      }
    }

    // ── 2 & 3. WOD programmé / WOD ouvert ─────────────────────────────────
    for (const w of wods) {
      const opensAt = w.opens_at ? new Date(w.opens_at).getTime() : null;
      const tName = nameById.get(w.tournament_id) ?? 'Tournoi';
      const scheduled = opensAt !== null && opensAt > now;

      if (scheduled) {
        for (const athlete_id of audience(w)) {
          targets.push({
            kind: 'wod_scheduled', tournament_id: w.tournament_id, wod_id: w.id, athlete_id,
            title: `📅 ${tName} — prochain WOD`,
            body: `« ${w.title} » ouvre ${frDateTime(w.opens_at!)}.`,
            type: 'tournament_wod_scheduled',
          });
        }
        continue;
      }

      const end = closesAt(w);
      if (end !== null && end <= now) continue; // fenêtre déjà terminée

      const remainingH = end === null ? null : Math.max(1, Math.round((end - now) / HOUR));
      for (const athlete_id of audience(w)) {
        targets.push({
          kind: 'wod_open', tournament_id: w.tournament_id, wod_id: w.id, athlete_id,
          title: `🔥 ${w.title} est ouvert`,
          body: remainingH === null
            ? 'À toi de jouer — soumets ton score quand tu es prêt.'
            : `Tu as ${remainingH} h pour soumettre ton score.`,
          type: 'tournament_wod_open',
        });
      }
    }

    // ── 4. Rappel de soumission ───────────────────────────────────────────
    const closingWods = wods.filter((w) => {
      const opensAt = w.opens_at ? new Date(w.opens_at).getTime() : null;
      if (opensAt !== null && opensAt > now) return false;
      const end = closesAt(w);
      if (end === null || end <= now) return false;
      const windowMs = opensAt !== null ? end - opensAt : w.deadline_hours * HOUR;
      const lead = Math.min(REMINDER_LEAD_HOURS * HOUR, windowMs / 2);
      return end - now <= lead;
    });

    if (closingWods.length) {
      // Qui a déjà soumis ? TOUT statut compte, « pending » inclus : un score en
      // attente de validation est un score soumis.
      const { data: scores, error: sErr } = await admin
        .from('tournament_scores').select('tournament_wod_id, athlete_id')
        .in('tournament_wod_id', closingWods.map((w) => w.id));
      if (sErr) return json({ error: `scores: ${sErr.message}` }, 500);
      const submitted = new Set(
        ((scores ?? []) as { tournament_wod_id: string; athlete_id: string }[])
          .map((s) => `${s.tournament_wod_id}:${s.athlete_id}`),
      );

      for (const w of closingWods) {
        const end = closesAt(w)!;
        const remainingH = Math.max(1, Math.round((end - now) / HOUR));
        for (const athlete_id of audience(w)) {
          if (submitted.has(`${w.id}:${athlete_id}`)) continue;
          targets.push({
            kind: 'submission_reminder', tournament_id: w.tournament_id, wod_id: w.id, athlete_id,
            title: '⏳ Dernière ligne droite',
            body: `Il te reste ${remainingH} h pour soumettre ton score sur « ${w.title} ».`,
            type: 'tournament_submission_reminder',
          });
        }
      }
    }

    if (!targets.length) return json({ candidates: 0, sent: 0 });

    // ── Réservation en base : seules les lignes RÉELLEMENT insérées sont
    //    envoyées. Deux exécutions concurrentes ne peuvent pas doubler l'envoi.
    const { data: claimed, error: cErr } = await admin
      .from('tournament_notifications_sent')
      .upsert(
        targets.map((t) => ({
          kind: t.kind, tournament_id: t.tournament_id, wod_id: t.wod_id, athlete_id: t.athlete_id,
        })),
        { onConflict: 'kind,tournament_id,wod_id,athlete_id', ignoreDuplicates: true },
      )
      .select('kind, tournament_id, wod_id, athlete_id');
    if (cErr) return json({ error: `claim: ${cErr.message}` }, 500);

    const claimedKeys = new Set(
      ((claimed ?? []) as { kind: string; tournament_id: string; wod_id: string | null; athlete_id: string }[])
        .map((r) => `${r.kind}|${r.tournament_id}|${r.wod_id ?? ''}|${r.athlete_id}`),
    );
    const fresh = targets.filter((t) =>
      claimedKeys.has(`${t.kind}|${t.tournament_id}|${t.wod_id ?? ''}|${t.athlete_id}`),
    );
    if (!fresh.length) return json({ candidates: targets.length, claimed: 0, sent: 0 });

    // ── Envoi par send-push : la clé `tournament_updates` y est appliquée par
    //    destinataire. Un lot par famille (send-push refuse les lots mixtes).
    const byType = new Map<string, Target[]>();
    for (const t of fresh) {
      const arr = byType.get(t.type) ?? [];
      arr.push(t);
      byType.set(t.type, arr);
    }

    let sent = 0;
    let prefDisabled = 0;
    const failures: string[] = [];
    for (const [type, group] of byType) {
      for (let i = 0; i < group.length; i += 500) {
        const chunk = group.slice(i, i + 500);
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': cronSecret,
            // L'edge gateway exige une clé d'API même pour un appel interne.
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            category: type,
            recipients: chunk.map((t) => ({
              user_id: t.athlete_id, title: t.title, body: t.body,
              data: { type: t.type, tournament_id: t.tournament_id, wod_id: t.wod_id },
            })),
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          failures.push(`${type}: ${res.status} ${JSON.stringify(payload)}`);
          continue;
        }
        sent += Number(payload?.sent ?? 0);
        prefDisabled += Number(payload?.pref_disabled ?? 0);
      }
    }

    return json({
      candidates: targets.length,
      claimed: fresh.length,
      sent,
      pref_disabled: prefDisabled,
      by_kind: Object.fromEntries(
        [...new Set(fresh.map((t) => t.kind))].map((k) => [k, fresh.filter((t) => t.kind === k).length]),
      ),
      ...(failures.length ? { failures } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('tournament-notifications-cron error', message);
    return json({ error: message }, 500);
  }
});
