import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { user_id, tier } = session.metadata;

    if (!user_id || tier !== 'pro') {
      console.error('Webhook missing required metadata:', session.metadata);
      return NextResponse.json({ error: 'Missing or invalid metadata' }, { status: 400 });
    }

    // Write to user_entitlements (source of truth)
    const { error: entitlementError } = await supabase
      .from('user_entitlements')
      .upsert({
        user_id,
        tier: 'pro',
        is_active: true,
        granted_at: new Date().toISOString(),
        granted_by_code: null,
        promo_code_id: null,
      }, {
        onConflict: 'user_id, tier'
      });

    if (entitlementError) {
      console.error('Entitlement upsert error:', entitlementError);
      return NextResponse.json({ error: 'Failed to set entitlement' }, { status: 500 });
    }

    // Update profiles.is_pro fast-path cache
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        is_pro: true,
        is_pro_since: new Date().toISOString(),
      })
      .eq('id', user_id);

    if (profileError) {
      console.error('Profile update error:', profileError);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    console.log(`Pro access granted via Stripe for user ${user_id}`);
  }

  return NextResponse.json({ received: true });
}