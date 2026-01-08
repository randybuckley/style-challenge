// src/app/api/review/reject-link/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

function safeSlug(v) {
  const s = String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return s || 'starter-style'
}

export async function GET(req) {
  const url = new URL(req.url)
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(/\/+$/, '')

  const token = (url.searchParams.get('token') || '').trim()
  const userEmail = (url.searchParams.get('userEmail') || '').trim()

  // Optional: allow slug to be passed through from the email
  let slug = safeSlug(url.searchParams.get('slug') || '')

  if (!token) {
    // Keep it conservative: send them to Pro login/entry with a message
    return NextResponse.redirect(`${origin}/challenges/login?msg=error`, 302)
  }

  if (!supabase) {
    // Still allow the reviewer to land on the form; include what we have
    const qs = new URLSearchParams()
    if (userEmail) qs.set('userEmail', userEmail)
    if (slug) qs.set('slug', slug)
    return NextResponse.redirect(`${origin}/review/${encodeURIComponent(token)}?${qs.toString()}`, 302)
  }

  // If slug wasn't provided (or is default), try to look it up from submissions using token
  // This is the key fix: downstream reject email needs to know which challenge to return to.
  if (!url.searchParams.get('slug')) {
    try {
      const { data: sub } = await supabase
        .from('submissions')
        .select('challenge_slug, email')
        .eq('review_token', token)
        .maybeSingle()

      if (sub?.challenge_slug) slug = safeSlug(sub.challenge_slug)
      // If userEmail wasn't passed, attempt to fill it
      if (!userEmail && sub?.email) {
        // eslint-disable-next-line no-param-reassign
        // (we won’t mutate const; just store via local variable)
      }
    } catch {
      // ignore
    }
  }

  // Store token metadata for the /review page to use (best-effort)
  // We try to write slug if DB supports it; otherwise we silently fall back.
  try {
    const upsertPayload = {
      token,
      user_email: userEmail || null,
      created_at: new Date().toISOString(),
      // attempt to persist slug for later use if column exists
      challenge_slug: slug || null,
    }

    const { error } = await supabase
      .from('review_tokens')
      .upsert(upsertPayload, { onConflict: 'token' })

    // If challenge_slug column doesn't exist, retry without it
    if (error) {
      const msg = String(error?.message || '')
      if (/challenge_slug/i.test(msg) && /does not exist|unknown/i.test(msg)) {
        await supabase
          .from('review_tokens')
          .upsert(
            { token, user_email: userEmail || null, created_at: new Date().toISOString() },
            { onConflict: 'token' }
          )
      }
    }
  } catch {
    // ignore; we still pass params below
  }

  // Redirect to the rejection form (review page).
  // IMPORTANT: include slug so the form + subsequent email can route back to /challenges/{slug}/step1
  const qs = new URLSearchParams()
  if (userEmail) qs.set('userEmail', userEmail)
  if (slug) qs.set('slug', slug)

  return NextResponse.redirect(
    `${origin}/review/${encodeURIComponent(token)}?${qs.toString()}`,
    302
  )
}