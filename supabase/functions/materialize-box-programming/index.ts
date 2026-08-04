// Edge Function: materialize-box-programming
// ------------------------------------------------------------------
// Matérialise la semaine due de chaque abonnement `box_programming` actif en
// lignes `box_wods` chez la box cliente, via l'RPC idempotente
// `materialize_box_programming()` (SECURITY DEFINER).
//
// À déclencher chaque dimanche 18h Europe/Paris (Supabase cron scheduler ou
// pg_cron). L'RPC pose `publish_at = dimanche 18h` → révélation aux athlètes
// exactement comme le reste du Whiteboard. Idempotente : un même WOD source
// n'est jamais dupliqué (index unique box_id + date + source_programming_wod_id).
//
// Réponses JSON :
//   { inserted: <n> }   → n lignes box_wods créées (0 = déjà à jour / rien dû)
// ------------------------------------------------------------------
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Garde optionnelle : si CRON_SECRET est défini, exiger l'en-tête.
    // CRON_SECRET OBLIGATOIRE (fail-closed) : refus si secret non configure OU
    // en-tete absent/incorrect. Deploiement coordonne : cf. runbook 1C-b.
    const cronSecret = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret') ?? '';
    if (!cronSecret || provided !== cronSecret) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    // p_target_monday par défaut = prochain lundi (calculé côté SQL).
    const { data, error } = await admin.rpc('materialize_box_programming');
    if (error) throw error;

    return new Response(JSON.stringify({ inserted: data ?? 0 }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
