// src/app/api/review/decision/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
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
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { ok: false, error: 'Supabase admin client not configured' },
        { status: 500 }
      )
    }

    const url = new URL(req.url)
    const action = (url.searchParams.get('action') || '').toLowerCase()
    const token = url.searchParams.get('token') || ''
    const userEmail = url.searchParams.get('userEmail') || ''

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Missing token' },
        { status: 400 }
      )
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { ok: false, error: 'Invalid action' },
        { status: 400 }
      )
    }

    // 1) Load the submission (we only need challenge_slug + user_id for routing)
    const { data: submission, error: subErr } = await supabaseAdmin
      .from('submissions')
      .select('id, user_id, email, challenge_slug, review_token')
      .eq('review_token', token)
      .maybeSingle()

    if (subErr) {
      console.error('/api/review/decision: submission lookup error', subErr)
      return NextResponse.json(
        { ok: false, error: `Could not load submission: ${subErr.message}` },
        { status: 500 }
      )
    }

    if (!submission) {
      return NextResponse.json(
        { ok: false, error: 'Submission not found for token' },
        { status: 404 }
      )
    }

    const slug = safeSlug(submission.challenge_slug || 'starter-style')

    // 2) Update decision fields (keep this conservative: no schema assumptions beyond a status column)
    // If your submissions table uses different column names, adjust ONLY here.
    const nextStatus = action === 'approve' ? 'approved' : 'rejected'

    const { error: updErr } = await supabaseAdmin
      .from('submissions')
      .update({
        status: nextStatus,
        decided_at: new Date().toISOString(),
      })
      .eq('id', submission.id)

    if (updErr) {
      // Do not block redirect if update fails — reviewers should not get stuck.
      console.error('/api/review/decision: update error', updErr)
    }

    // 3) Slug-aware redirect targets (Pro path)
    // You can create these pages under: /src/app/challenges/[slug]/result/approved and /rejected
    const base = `${url.origin}/challenges/${encodeURIComponent(slug)}/result`

    const redirectTo =
      action === 'approve'
        ? `${base}/approved?token=${encodeURIComponent(token)}${
            userEmail ? `&userEmail=${encodeURIComponent(userEmail)}` : ''
          }`
        : `${base}/rejected?token=${encodeURIComponent(token)}${
            userEmail ? `&userEmail=${encodeURIComponent(userEmail)}` : ''
          }`

    return NextResponse.redirect(redirectTo, { status: 302 })
  } catch (err) {
    console.error('/api/review/decision: unexpected error', err)
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    )
  }
}

// Guard other HTTP methods
export function POST() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}
export const PUT = POST
export const DELETE = POST