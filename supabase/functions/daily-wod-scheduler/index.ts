// Edge Function: daily-wod-scheduler
// ------------------------------------------------------------------
// Déploie le « WOD du Jour » officiel via l'RPC idempotente
// `ensure_daily_official_wod()` (SECURITY DEFINER). Une seule source de
// vérité côté DB : skip du dimanche, 1 WOD/jour (Europe/Paris), fenêtre 24h.
//
// Modes d'invocation :
//  - pg_cron appelle l'RPC directement (voir migration) → chemin nominal.
//  - Cet Edge Function est un déclencheur HTTP alternatif (cron scheduler
//    Supabase ou webhook), qui appelle la même RPC avec la service-role key.
//
// Réponses JSON :
//  { skipped: "sunday" }         → dimanche, jour de repos
//  { created: false, id }        → WOD du jour déjà présent (idempotent)
//  { created: true, id }         → nouveau WOD du jour déployé
// ------------------------------------------------------------------
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Garde optionnelle : si CRON_SECRET est défini, exiger l'en-tête correspondant.
    // (L'RPC est déjà idempotente, mais on évite les déclenchements HTTP publics.)
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

    // Jour de repos : dimanche (Europe/Paris). La RPC skip déjà le dimanche,
    // on court-circuite ici pour un log explicite.
    const parisDow = new Date().toLocaleDateString('en-US', {
      timeZone: 'Europe/Paris',
      weekday: 'short',
    });
    if (parisDow === 'Sun') {
      return new Response(JSON.stringify({ skipped: 'sunday' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Le WOD officiel du jour existait-il déjà avant l'appel ?
    const parisDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
    const { data: before } = await admin
      .from('daily_tournaments')
      .select('id')
      .eq('is_official', true)
      .eq('official_date', parisDate)
      .maybeSingle();

    const { data: id, error } = await admin.rpc('ensure_daily_official_wod');
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ created: !before, id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('daily-wod-scheduler error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
