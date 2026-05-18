// Edge Function: parse-wod-pdf
// ------------------------------------------------------------------
// Receives a PDF (base64) from the BO Owner, sends it to Claude
// Sonnet 4 with a strict-JSON prompt, and returns the parsed WODs.
//
// Auth: caller must be authenticated (JWT) AND must be the owner
// or a coach of at least one box. The caller passes the target
// box_id which is verified against ownership/coach status.
//
// Body: { box_id: string, pdf_base64: string, default_start_date?: 'YYYY-MM-DD' }
// Returns: { wods: ParsedWOD[], usage: { input_tokens, output_tokens } }
// ------------------------------------------------------------------
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
const ANTHROPIC_MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `Tu es un assistant expert en programmation CrossFit. Tu reçois un PDF contenant la programmation hebdomadaire ou mensuelle d'une box CrossFit (en français), et tu dois extraire chaque WOD (séance) sous forme JSON STRICT.

RÈGLES ABSOLUES :
1. Tu retournes UNIQUEMENT un tableau JSON valide, rien d'autre. Pas d'introduction, pas de markdown, pas de \`\`\`json.
2. Chaque WOD = un objet du tableau.
3. Si un jour contient plusieurs blocs (ex: "HALTERO", "GYM", "METCON", "RENFO"), crée UN OBJET DISTINCT pour chaque bloc principal.
4. Champs obligatoires :
   - scheduled_date : "YYYY-MM-DD" (déduis depuis "Lundi", "Mardi"... + la date de référence fournie)
   - title : "BLOC — Nom court" (ex: "HALTERO — CLEAN", "METCON — AMRAP 12'", "GYM — Skill T2B")
   - wod_type : un parmi "for-time" | "amrap" | "emom" | "tabata" | "strength" | "custom"
     * EMOM/E2MOM/EMOM 2' → "emom"
     * AMRAP → "amrap"
     * For Time / Round Time → "for-time"
     * Tabata → "tabata"
     * Squat / Halterophilie / Pull / Press / Renfo basé sur séries × reps → "strength"
     * Sinon → "custom"
   - description : texte complet du bloc, formaté avec sauts de ligne (\\n) pour la lisibilité
   - time_cap_seconds : entier (secondes) si AMRAP/For Time avec durée fixe, sinon null
   - rounds : entier si E*MOM × N rounds, sinon null
   - notes : conseils du coach, scaling, intentions (chaîne ou null)
   - block_name : nom du bloc (ex: "HALTERO", "METCON", "GYM", "RENFO", "SQUAT") ou null

EXEMPLES :
- "EMOM 8'" → wod_type:"emom", time_cap_seconds:480, rounds:8
- "E2MOM × 5 Rounds" → wod_type:"emom", rounds:5, time_cap_seconds:600
- "AMRAP 12'" → wod_type:"amrap", time_cap_seconds:720
- "3X5 Back Squat @83%" → wod_type:"strength", rounds:3, block_name:"SQUAT"

Réponse : tableau JSON pur, parsable par JSON.parse().`;

interface ParsedWOD {
  scheduled_date: string;
  title: string;
  wod_type: 'for-time' | 'amrap' | 'emom' | 'tabata' | 'strength' | 'custom';
  description: string | null;
  time_cap_seconds: number | null;
  rounds: number | null;
  notes: string | null;
  block_name: string | null;
}

function buildUserPrompt(defaultStartDate: string | null): string {
  const ref = defaultStartDate ?? new Date().toISOString().slice(0, 10);
  return `Voici un PDF de programmation. Date de référence pour la première semaine : ${ref} (Lundi).

Si le PDF mentionne explicitement des dates, utilise-les. Sinon, déduis les dates en partant du Lundi de référence (${ref}) puis +1 jour pour chaque jour mentionné.

Retourne UNIQUEMENT le tableau JSON des WODs extraits.`;
}

async function getUserAndVerifyOwnership(req: Request, boxId: string): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { ok: false, status: 401, error: 'Missing Authorization header' };

  // Extract JWT from "Bearer <jwt>" — admin client validates it via getUser(jwt)
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return { ok: false, status: 401, error: 'Empty token' };

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: `Invalid token: ${userErr?.message ?? 'unknown'}` };
  }
  const userId = userData.user.id;
  // Owner check
  const { data: ownedBox } = await admin
    .from('boxes')
    .select('id')
    .eq('id', boxId)
    .eq('owner_id', userId)
    .maybeSingle();
  if (ownedBox) return { ok: true, userId };

  // Coach check
  const { data: coachRow } = await admin
    .from('box_members')
    .select('id')
    .eq('box_id', boxId)
    .eq('member_id', userId)
    .eq('role', 'coach')
    .eq('status', 'active')
    .maybeSingle();
  if (coachRow) return { ok: true, userId };

  return { ok: false, status: 403, error: 'Not owner or coach of this box' };
}

async function callClaudePDF(pdfBase64: string, defaultStartDate: string | null): Promise<{ wods: ParsedWOD[]; usage: { input_tokens: number; output_tokens: number } }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            { type: 'text', text: buildUserPrompt(defaultStartDate) },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText}`);
  }
  const json = await res.json();
  const text = (json.content ?? []).map((c: any) => c.text ?? '').join('').trim();

  // Strip eventual markdown fences
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 300)}`);
  }
  if (!Array.isArray(parsed)) throw new Error('Claude response is not a JSON array');

  // Sanitize
  const VALID_TYPES = ['for-time', 'amrap', 'emom', 'tabata', 'strength', 'custom'];
  const wods: ParsedWOD[] = parsed
    .filter((w: any) => w && typeof w.title === 'string' && typeof w.scheduled_date === 'string')
    .map((w: any) => ({
      scheduled_date: String(w.scheduled_date).slice(0, 10),
      title: String(w.title).slice(0, 200),
      wod_type: VALID_TYPES.includes(w.wod_type) ? w.wod_type : 'custom',
      description: w.description ? String(w.description).slice(0, 5000) : null,
      time_cap_seconds: typeof w.time_cap_seconds === 'number' ? Math.max(0, Math.floor(w.time_cap_seconds)) : null,
      rounds: typeof w.rounds === 'number' ? Math.max(0, Math.floor(w.rounds)) : null,
      notes: w.notes ? String(w.notes).slice(0, 2000) : null,
      block_name: w.block_name ? String(w.block_name).slice(0, 50) : null,
    }));

  return {
    wods,
    usage: {
      input_tokens: json.usage?.input_tokens ?? 0,
      output_tokens: json.usage?.output_tokens ?? 0,
    },
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { box_id, pdf_base64, default_start_date } = body as {
      box_id?: string; pdf_base64?: string; default_start_date?: string;
    };

    if (!box_id || typeof box_id !== 'string') {
      return new Response(JSON.stringify({ error: 'box_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!pdf_base64 || typeof pdf_base64 !== 'string') {
      return new Response(JSON.stringify({ error: 'pdf_base64 required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Approximate size check (base64 is ~4/3 of original)
    const approxBytes = Math.ceil((pdf_base64.length * 3) / 4);
    if (approxBytes > MAX_PDF_BYTES) {
      return new Response(JSON.stringify({ error: `PDF too large (${(approxBytes / 1024 / 1024).toFixed(1)} MB > 10 MB)` }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth + ownership
    const auth = await getUserAndVerifyOwnership(req, box_id);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call Claude
    const { wods, usage } = await callClaudePDF(pdf_base64, default_start_date ?? null);

    return new Response(JSON.stringify({ wods, usage }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('parse-wod-pdf error', e);
    return new Response(JSON.stringify({ error: e?.message ?? 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
