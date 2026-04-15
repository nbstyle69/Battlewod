import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { box_id, return_url } = await req.json();
    if (!box_id) {
      return new Response(JSON.stringify({ error: 'box_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller is the box owner
    const { data: box, error: boxErr } = await supabase
      .from('boxes')
      .select('id, owner_id, name')
      .eq('id', box_id)
      .single();

    if (boxErr || !box) {
      return new Response(JSON.stringify({ error: 'Box not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (box.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not the box owner' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2023-10-16',
    });

    const priceId = Deno.env.get('STRIPE_PRICE_ID')!;

    // Check if subscription already exists with a stripe_customer_id
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: sub } = await supabaseAdmin
      .from('box_subscriptions')
      .select('stripe_customer_id, is_early_adopter')
      .eq('box_id', box_id)
      .single();

    let customerId = sub?.stripe_customer_id;

    // Create or retrieve Stripe Customer
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
          box_id: box_id,
          box_name: box.name,
        },
      });
      customerId = customer.id;

      // Save customer ID
      await supabaseAdmin
        .from('box_subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('box_id', box_id);
    }

    // Determine trial days based on early adopter status
    const trialDays = sub?.is_early_adopter ? 60 : 30;

    // Check if trial is still active — if so, carry remaining days
    let trialPeriodDays: number | undefined;
    if (sub?.is_early_adopter !== undefined) {
      // Only apply trial if they haven't already had a paid subscription
      const { data: existingSub } = await supabaseAdmin
        .from('box_subscriptions')
        .select('status, trial_ends_at')
        .eq('box_id', box_id)
        .single();

      if (existingSub?.status === 'trialing' && existingSub?.trial_ends_at) {
        const remaining = Math.ceil(
          (new Date(existingSub.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        trialPeriodDays = Math.max(remaining, 0);
      }
    }

    const successUrl = return_url || 'athlex://subscription-success';
    const cancelUrl = return_url || 'athlex://subscription-cancel';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      ...(trialPeriodDays && trialPeriodDays > 0
        ? { subscription_data: { trial_period_days: trialPeriodDays } }
        : {}),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        box_id: box_id,
        supabase_user_id: user.id,
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('create-checkout error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
