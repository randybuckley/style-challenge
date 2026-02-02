export const runtime = 'nodejs';

import { createClient } from '@supabase/supabase-js';

const TOKEN = process.env.VIMEO_OTT_WEBHOOK_TOKEN;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function parsePossiblyDoubleEncodedJson(raw) {
  try {
    const first = JSON.parse(raw);
    if (typeof first === 'string') return JSON.parse(first);
    return first;
  } catch {
    return null;
  }
}

function safeText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  try {
    return String(v);
  } catch {
    return null;
  }
}

function extractEmail(payload) {
  return payload?._embedded?.customer?.email || null;
}

function extractCustomerId(payload) {
  return payload?._embedded?.customer?.id || null;
}

function extractProductId(payload) {
  const embeddedCustomerProducts =
    payload?._embedded?.customer?._embedded?.products;
  if (Array.isArray(embeddedCustomerProducts) && embeddedCustomerProducts[0]?.id) {
    return embeddedCustomerProducts[0].id;
  }
  return payload?._embedded?.product?.id || null;
}

function normalizeStatus(s) {
  return (s || '').toString().trim().toLowerCase();
}

/**
 * Determine whether this event implies:
 * - PRO active (true)
 * - PRO inactive (false)
 * - or "unknown / do nothing" (null)
 *
 * Vimeo OTT payloads vary by topic. We use the most stable fields:
 * - customer.subscribed_to_site (boolean)
 * - customer.subscription_status (string)
 */
function inferProActive(payload) {
  const customer = payload?._embedded?.customer;
  const subscribedToSite =
    typeof customer?.subscribed_to_site === 'boolean'
      ? customer.subscribed_to_site
      : null;

  const status = normalizeStatus(customer?.subscription_status);

  // If boolean is present, trust it.
  if (subscribedToSite === true) return true;
  if (subscribedToSite === false) return false;

  // Otherwise infer from status when present.
  if (status === 'enabled' || status === 'active' || status === 'trialing') return true;
  if (status === 'canceled' || status === 'cancelled' || status === 'disabled') return false;

  // Pause is ambiguous business-wise; default to "do nothing"
  // (You can later decide whether paused should remove PRO access.)
  if (status === 'paused') return null;

  return null;
}

export async function OPTIONS() {
  return new Response('ok', { status: 200, headers: corsHeaders() });
}

export async function POST(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!TOKEN || token !== TOKEN) {
    return new Response('unauthorized', {
      status: 401,
      headers: corsHeaders(),
    });
  }

  const raw = await req.text();
  const payload = parsePossiblyDoubleEncodedJson(raw);

  // -----------------------------
  // 1) Always write event ledger
  // -----------------------------
  let ledgerEventId = null;

  try {
    if (!supabaseAdmin) {
      console.log(
        '[VIMEO OTT WEBHOOK] supabaseAdmin not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)'
      );
    } else {
      const payloadToStore = payload ?? { raw };
      const topic = payload?.topic ?? null;
      const email = extractEmail(payload);
      const customerId = extractCustomerId(payload);
      const productId = extractProductId(payload);

      const { data, error } = await supabaseAdmin
        .from('vimeo_ott_events')
        .insert({
          source: 'vimeo_ott',
          topic: safeText(topic),
          email: safeText(email),
          customer_id: safeText(customerId),
          product_id: safeText(productId),
          payload: payloadToStore,
        })
        .select('id')
        .maybeSingle();

      if (error) {
        console.log('[VIMEO OTT WEBHOOK] ledger insert error:', error);
      } else {
        ledgerEventId = data?.id || null;
      }
    }
  } catch (e) {
    console.log('[VIMEO OTT WEBHOOK] ledger insert exception:', e);
  }

  // Keep your existing logs (unchanged intent)
  console.log('[VIMEO OTT WEBHOOK] raw:', raw);

  if (payload) {
    console.log('[VIMEO OTT WEBHOOK] topic:', payload.topic);
    console.log('[VIMEO OTT WEBHOOK] email:', extractEmail(payload));
  } else {
    console.log('[VIMEO OTT WEBHOOK] could not parse JSON');
  }

  // ---------------------------------------------------------
  // 2) Entitlement + profile sync (idempotent, current-state)
  // ---------------------------------------------------------
  try {
    if (!supabaseAdmin || !payload) {
      return new Response('ok', { status: 200, headers: corsHeaders() });
    }

    const email = extractEmail(payload);
    const vimeoCustomerId = extractCustomerId(payload);

    // Must have an email to map to an auth user.
    if (!email) {
      return new Response('ok', { status: 200, headers: corsHeaders() });
    }

    // Decide whether this event implies PRO on/off.
    const proActive = inferProActive(payload);

    // If unknown/ambiguous, we do nothing beyond the ledger.
    if (proActive === null) {
      return new Response('ok', { status: 200, headers: corsHeaders() });
    }

    // Map email -> auth user id via RPC (no guessing, no admin API dependency).
    const { data: userId, error: rpcErr } = await supabaseAdmin.rpc(
      'get_auth_user_id_by_email',
      { p_email: email }
    );

    if (rpcErr) {
      console.log('[VIMEO OTT WEBHOOK] rpc get_auth_user_id_by_email error:', rpcErr);
      return new Response('ok', { status: 200, headers: corsHeaders() });
    }

    if (!userId) {
      // User hasn't created an account in the app yet.
      // That’s fine: event is stored; onboarding email can tell them to sign in.
      console.log('[VIMEO OTT WEBHOOK] no auth user found for email:', email);
      return new Response('ok', { status: 200, headers: corsHeaders() });
    }

    // ---- Persist profiles email + vimeo_customer_id (hybrid) ----
    const { data: existingProfile, error: profReadErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, vimeo_customer_id')
      .eq('id', userId)
      .maybeSingle();

    if (profReadErr) {
      console.log('[VIMEO OTT WEBHOOK] profiles read error:', profReadErr);
    }

    const updates = { id: userId };

    // Only set email if missing (avoid clobbering).
    if (!existingProfile?.email) updates.email = email;

    // Only set vimeo_customer_id if provided and missing/different.
    if (vimeoCustomerId && existingProfile?.vimeo_customer_id !== vimeoCustomerId) {
      updates.vimeo_customer_id = vimeoCustomerId;
    }

    // Upsert profile row (id is PK) — safe even if no changes.
    const { error: profUpsertErr } = await supabaseAdmin
      .from('profiles')
      .upsert(updates, { onConflict: 'id' });

    if (profUpsertErr) {
      console.log('[VIMEO OTT WEBHOOK] profiles upsert error:', profUpsertErr);
      // Continue; entitlement can still be set.
    }

    // ---- Current-state entitlement UPSERT (one row per user per tier) ----
    const nowIso = new Date().toISOString();

    const { error: entErr } = await supabaseAdmin
      .from('user_entitlements')
      .upsert(
        {
          user_id: userId,
          tier: 'pro',
          is_active: proActive,
          granted_at: nowIso,
          granted_by_code: 'vimeo_ott',
          promo_code_id: null,
        },
        { onConflict: 'user_id,tier' }
      );

    if (entErr) {
      console.log('[VIMEO OTT WEBHOOK] user_entitlements upsert error:', entErr);
      return new Response('ok', { status: 200, headers: corsHeaders() });
    }

    console.log(
      '[VIMEO OTT WEBHOOK] entitlement set:',
      JSON.stringify({ userId, email, proActive, ledgerEventId })
    );
  } catch (e) {
    console.log('[VIMEO OTT WEBHOOK] entitlement sync exception:', e);
  }

  return new Response('ok', { status: 200, headers: corsHeaders() });
}