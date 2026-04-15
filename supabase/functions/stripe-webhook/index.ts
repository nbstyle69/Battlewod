import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log(`Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const boxId = session.metadata?.box_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!boxId) {
          console.error('No box_id in checkout session metadata');
          break;
        }

        // Fetch the subscription to get period details
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        await supabase
          .from('box_subscriptions')
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan_tier: 'complete',
            status: subscription.status === 'trialing' ? 'trialing' : 'active',
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            trial_ends_at: subscription.trial_end
              ? new Date(subscription.trial_end * 1000).toISOString()
              : null,
          })
          .eq('box_id', boxId);

        console.log(`Checkout completed for box ${boxId}, subscription ${subscriptionId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find box by stripe_customer_id
        const { data: sub } = await supabase
          .from('box_subscriptions')
          .select('box_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!sub) {
          console.error(`No box_subscription found for customer ${customerId}`);
          break;
        }

        // Map Stripe status to our status
        let status: string;
        switch (subscription.status) {
          case 'trialing':
            status = 'trialing';
            break;
          case 'active':
            status = 'active';
            break;
          case 'past_due':
            status = 'past_due';
            break;
          case 'canceled':
          case 'unpaid':
            status = 'canceled';
            break;
          default:
            status = 'expired';
        }

        await supabase
          .from('box_subscriptions')
          .update({
            status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            trial_ends_at: subscription.trial_end
              ? new Date(subscription.trial_end * 1000).toISOString()
              : null,
          })
          .eq('stripe_customer_id', customerId);

        console.log(`Subscription updated for box ${sub.box_id}: status=${status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await supabase
          .from('box_subscriptions')
          .update({
            status: 'canceled',
            stripe_subscription_id: null,
          })
          .eq('stripe_customer_id', customerId);

        console.log(`Subscription deleted for customer ${customerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await supabase
          .from('box_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_customer_id', customerId);

        console.log(`Payment failed for customer ${customerId}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error('Error processing webhook event:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
