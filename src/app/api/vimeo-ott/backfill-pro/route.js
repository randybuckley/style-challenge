// src/app/api/vimeo-ott/backfill-pro/route.js
export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

function normalizeStatus(s) {
  return (s || '').toString().trim().toLowerCase()
}

function inferProActiveFromPayload(payload) {
  const customer = payload?._embedded?.customer
  const subscribedToSite =
    typeof customer?.subscribed_to_site === 'boolean'
      ? customer.subscribed_to_site
      : null

  const status = normalizeStatus(customer?.subscription_status)

  if (subscribedToSite === true) return true
  if (subscribedToSite === false) return false

  if (status === 'enabled' || status === 'active' || status === 'trialing') return true
  if (status === 'canceled' || status === 'cancelled' || status === 'disabled') return false

  if (status === 'paused') return null

  return null
}

function extractCustomerId(payload) {
  return payload?._embedded?.customer?.id || null
}

export async function OPTIONS() {
  return new Response('ok', { status: 200, headers: corsHeaders() })
}

export async function POST(req) {
  try {
    if (!supabaseAdmin) {
      return new Response('server_not_configured', {
        status: 500,
        headers: corsHeaders(),
      })
    }

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : ''

    if (!token) {
      return new Response('unauthorized', { status: 401, headers: corsHeaders() })
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)

    if (userErr || !userData?.user) {
      return new Response('unauthorized', { status: 401, headers: corsHeaders() })
    }

    const user = userData.user
    const userId = user.id
    const email = (user.email || '').toLowerCase().trim()

    if (!email) {
      return new Response('ok', { status: 200, headers: corsHeaders() })
    }

    // Pull recent events for this email (schema-grounded: received_at exists)
    const { data: events, error: eventsErr } = await supabaseAdmin
      .from('vimeo_ott_events')
      .select('id, received_at, payload, processed')
      .eq('email', email)
      .order('received_at', { ascending: false })
      .limit(50)

    if (eventsErr || !Array.isArray(events) || events.length === 0) {
      return new Response('ok', { status: 200, headers: corsHeaders() })
    }

    // Find the newest event that yields a clear proActive true/false
    let proActive = null
    let winningEventIds = []
    let vimeoCustomerId = null

    for (const ev of events) {
      const p = ev?.payload
      const inferred = inferProActiveFromPayload(p)
      if (inferred === null) continue

      proActive = inferred
      winningEventIds = events
        .filter((x) => x?.payload && inferProActiveFromPayload(x.payload) === proActive)
        .map((x) => x.id)

      vimeoCustomerId = extractCustomerId(p)
      break
    }

    if (proActive === null) {
      return new Response('ok', { status: 200, headers: corsHeaders() })
    }

    const nowIso = new Date().toISOString()

    // Upsert entitlement (schema-grounded: tier text, is_active boolean, etc.)
    const { error: entErr } = await supabaseAdmin
      .from('user_entitlements')
      .upsert(
        {
          user_id: userId,
          tier: 'pro',
          is_active: proActive,
          granted_at: nowIso,
          granted_by_code: 'vimeo_ott_backfill',
          promo_code_id: null,
        },
        { onConflict: 'user_id,tier' }
      )

    if (entErr) {
      // Record error against events for visibility
      if (winningEventIds.length) {
        await supabaseAdmin
          .from('vimeo_ott_events')
          .update({ processing_error: String(entErr?.message || entErr) })
          .in('id', winningEventIds)
      }
      return new Response('ok', { status: 200, headers: corsHeaders() })
    }

    // Update profiles flags (schema-grounded: is_pro, is_pro_since, vimeo_customer_id exist)
    const profileUpdate = {
      id: userId,
      email, // safe: your profiles.email is nullable; setting it helps matching
      is_pro: proActive,
      is_pro_since: proActive ? nowIso : null,
    }

    if (vimeoCustomerId) profileUpdate.vimeo_customer_id = vimeoCustomerId

    await supabaseAdmin.from('profiles').upsert(profileUpdate, { onConflict: 'id' })

    // Mark events processed to avoid rework (schema-grounded: processed boolean exists)
    if (winningEventIds.length) {
      await supabaseAdmin
        .from('vimeo_ott_events')
        .update({ processed: true, processing_error: null })
        .in('id', winningEventIds)
    }

    return new Response('ok', { status: 200, headers: corsHeaders() })
  } catch (e) {
    console.log('[VIMEO OTT BACKFILL] exception:', e)
    return new Response('ok', { status: 200, headers: corsHeaders() })
  }
}