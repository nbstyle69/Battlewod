// Edge Function: analyze-tournament-score
// ------------------------------------------------------------------
// Runs the Claude "score credibility" analysis server-side so the
// Anthropic API key never ships in the mobile bundle.
//
// Auth: caller must be authenticated (JWT) AND have a staff role
// (admin / super_admin / box_owner) — same gate as the BO tournament
// review screen that used to call Anthropic directly.
//
// Body: { score_id: string }
// Returns: { analysis: string }
// ------------------------------------------------------------------
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// claude-sonnet-4-20250514 a ete retire du catalogue Anthropic : la fonction
// prenait un 404 « model: ... » sur CHAQUE analyse.
const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';

function buildPrompt(s: {
  tournamentName: string;
  wodTitle: string;
  wodType: string;
  scoreValue: string;
  tiebreak: number | null;
  username: string;
  level: string;
  elo: number | null;
  notes: string | null;
}): string {
  return `Tu es un coach CrossFit expert qui évalue la crédibilité des scores de compétition.

IMPORTANT : Tu n'as pas accès à la vidéo. Tu évalues uniquement la vraisemblance du score déclaré sur la base des données textuelles.

Données du score :
🏆 Tournoi : ${s.tournamentName}
🏋️ WOD : ${s.wodTitle} (${s.wodType})
🔢 Score déclaré : ${s.scoreValue}${s.tiebreak != null ? `\n🔗 Tie-break : ${s.tiebreak} reps` : ''}
👤 Athlète : ${s.username} (Niveau ${s.level}, ELO ${s.elo ?? ''})
📝 Notes : ${s.notes ?? 'Aucune'}

Évalue ce score en 4 points :
1. **Vraisemblance** : cohérence avec le niveau, ELO et type de WOD.
2. **Points d'attention** : éléments à vérifier sur la vidéo (range of motion, no-reps, standards).
3. **Verdict** : VRAISEMBLABLE / À VÉRIFIER / SUSPECT — avec justification courte.
4. **Priorité de révision** : HAUTE / NORMALE / BASSE.

Rappelle en fin de réponse que la validation finale requiert la révision manuelle de la vidéo.
Réponds en français, sois concis et factuel.`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => null);
    const scoreId = body?.score_id;
    if (!scoreId || typeof scoreId !== 'string') return json({ error: 'score_id required' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ error: 'Empty token' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'Invalid token' }, 401);

    const callerId = userData.user.id;

    // Fetch score details server-side (never trust client-supplied text).
    const { data: score, error: scoreErr } = await admin
      .from('tournament_scores')
      // FK explicite : tournament_scores pointe DEUX fois vers profiles
      // (athlete_id + validated_by), donc l'embed nu est ambigu (PGRST201) et
      // la fonction repondait 404 « Score not found » sur TOUS les scores.
      .select('id, tournament_id, score_value, tiebreak_value, notes, tournament_wod:tournament_wods(title, type), profile:profiles!tournament_scores_athlete_id_fkey(username, level, elo)')
      .eq('id', scoreId)
      .maybeSingle();
    if (scoreErr || !score) return json({ error: 'Score not found' }, 404);

    // AUTORISATION (Lot 6B-2) : admin plateforme OU gestionnaire de la box DU
    // TOURNOI de ce score. Avant, un box_owner (rôle GLOBAL) pouvait analyser
    // le score d'une box concurrente → lecture cross-box + coût IA sur des
    // données qui ne le regardent pas.
    const { data: prof } = await admin
      .from('profiles').select('role').eq('id', callerId).maybeSingle();
    const isPlatformAdmin = prof?.role === 'admin' || prof?.role === 'super_admin';
    if (!isPlatformAdmin) {
      const { data: tourn0 } = await admin
        .from('tournaments').select('box_id').eq('id', score.tournament_id).maybeSingle();
      const boxId = tourn0?.box_id;
      let manages = false;
      if (boxId) {
        const { data: ownedBox } = await admin
          .from('boxes').select('id').eq('id', boxId).eq('owner_id', callerId).maybeSingle();
        if (ownedBox) manages = true;
        else {
          const { data: staff } = await admin
            .from('box_members').select('id')
            .eq('box_id', boxId).eq('member_id', callerId)
            .in('role', ['owner', 'coach']).eq('status', 'active').maybeSingle();
          manages = !!staff;
        }
      }
      if (!manages) return json({ error: 'Not authorized' }, 403);
    }

    // RATE LIMIT (Lot 6B-2) : 20 analyses / utilisateur / jour, vérifié serveur.
    const { data: allowed, error: rlErr } = await admin
      .rpc('bump_ai_usage', { p_user: callerId, p_kind: 'analyze_score', p_limit: 20 });
    if (rlErr) return json({ error: 'Rate limit check failed' }, 500);
    if (allowed === false) return json({ error: 'Daily AI limit reached' }, 429);

    const { data: tourn } = await admin
      .from('tournaments').select('name').eq('id', score.tournament_id).maybeSingle();

    const tw = (score as any).tournament_wod;
    const profile = (score as any).profile;
    const prompt = buildPrompt({
      tournamentName: tourn?.name ?? '',
      wodTitle: tw?.title ?? '',
      wodType: tw?.type ?? '',
      scoreValue: String(score.score_value ?? ''),
      tiebreak: score.tiebreak_value ?? null,
      username: profile?.username ?? '',
      level: profile?.level ?? '',
      elo: profile?.elo ?? null,
      notes: score.notes ?? null,
    });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic error', res.status, errText); // log serveur seulement
      return json({ error: 'AI service unavailable' }, 502);  // pas de fuite au client

    }
    const data = await res.json();
    const analysis = (data.content ?? []).map((c: any) => c.text ?? '').join('\n').trim() || 'Analyse indisponible.';

    // Persist the analysis with the service role.
    await admin.from('tournament_scores').update({ ai_analysis: analysis }).eq('id', scoreId);

    return json({ analysis });
  } catch (e: any) {
    console.error('analyze-tournament-score error', e);
    return json({ error: e?.message ?? 'Internal error' }, 500);
  }
});
