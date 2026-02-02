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
    if (typeof first === 'string') {
      return JSON.parse(first);
    }
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
  // Vimeo OTT payloads vary by topic; grab what we can without assuming structure.
  const embeddedCustomerProducts =
    payload?._embedded?.customer?._embedded?.products;
  if (Array.isArray(embeddedCustomerProducts) && embeddedCustomerProducts[0]?.id) {
    return embeddedCustomerProducts[0].id;
  }
  return payload?._embedded?.product?.id || null;
}

export async function OPTIONS() {
  return new Response('ok', { status: 200, headers: corsHeaders() });
}

export async function POST(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  // Keep your existing auth gate exactly: fail fast if token mismatch.
  if (!TOKEN || token !== TOKEN) {
    return new Response('unauthorized', {
      status: 401,
      headers: corsHeaders(),
    });
  }

  const raw = await req.text();
  const payload = parsePossiblyDoubleEncodedJson(raw);

  // Insert the raw event FIRST (append-only), then continue with your existing flow.
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

      const { error } = await supabaseAdmin.from('vimeo_ott_events').insert({
        source: 'vimeo_ott',
        topic: safeText(topic),
        email: safeText(email),
        customer_id: safeText(customerId),
        product_id: safeText(productId),
        payload: payloadToStore,
      });

      if (error) {
        console.log('[VIMEO OTT WEBHOOK] insert error:', error);
      }
    }
  } catch (e) {
    console.log('[VIMEO OTT WEBHOOK] insert exception:', e);
  }

  // Your existing logging/behaviour remains (untouched in intent)
  console.log('[VIMEO OTT WEBHOOK] raw:', raw);

  if (payload) {
    console.log('[VIMEO OTT WEBHOOK] topic:', payload.topic);
    console.log('[VIMEO OTT WEBHOOK] email:', extractEmail(payload));
  } else {
    console.log('[VIMEO OTT WEBHOOK] could not parse JSON');
  }

  return new Response('ok', { status: 200, headers: corsHeaders() });
}