// src/app/api/review-certification/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function titleCaseFromSlugPart(s) {
  return String(s || '')
    .trim()
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function styleNameFromChallengeSlug(slug) {
  const raw = String(slug || '').trim()
  if (!raw) return ''

  // Essentials format: essentials-messy-bun => "Essentials — Messy Bun"
  if (raw.startsWith('essentials-')) {
    const suffix = raw.replace(/^essentials-/, '')
    const nice = titleCaseFromSlugPart(suffix)
    return nice ? `Essentials — ${nice}` : 'Essentials'
  }

  // Starter / legacy fallback (keep existing behaviour)
  if (raw === 'starter-style') return 'Challenge Number One'

  // Generic fallback: Title Case the slug
  return titleCaseFromSlugPart(raw)
}

function buildCertificatePayload(row, token, styleNameOverride) {
  const first = (row.first_name || '').trim()
  const second = (row.second_name || '').trim()
  const salon = (row.salon_name || '').trim()

  const stylistName =
    [first, second].filter(Boolean).join(' ') ||
    (row.user_email || row.email || 'Stylist')

  const styleName =
    (styleNameOverride || '').trim() ||
    'Challenge Number One' // final fallback (preserves current behaviour)

  const today = new Date()
  const date = today.toISOString().slice(0, 10)

  const tail = String(token || row.token || '').slice(-6).toUpperCase() || '000000'
  const certificateId = `PC-${tail}`

  return {
    ok: true,
    stylistName,
    salonName: salon,
    styleName,
    date,
    certificateId,
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = body?.token

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Missing token' },
        { status: 400 }
      )
    }

    // 1) Try review_tokens first (legacy)
    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from('review_tokens')
      .select(`
        token,
        user_id,
        user_email,
        first_name,
        second_name,
        salon_name
      `)
      .eq('token', token)
      .maybeSingle()

    if (tokenRow) {
      // NOTE: review_tokens does not currently provide a challenge reference here.
      // We preserve existing behaviour for this pathway.
      const payload = buildCertificatePayload(tokenRow, token, null)
      return NextResponse.json(payload, { status: 200 })
    }

    // 2) Fall back to submissions.review_token
    const { data: submissionRow, error: subErr } = await supabaseAdmin
      .from('submissions')
      .select(`
        review_token,
        user_id,
        email,
        first_name,
        second_name,
        salon_name,
        challenge_id
      `)
      .eq('review_token', token)
      .maybeSingle()

    if (subErr) {
      console.error('review-certification: submissions query error', subErr)
    }

    if (submissionRow) {
      // Resolve styleName via submissions.challenge_id -> challenges.slug (no assumptions about title/name columns)
      let styleName = null

      const challengeId = submissionRow.challenge_id
      if (challengeId) {
        const { data: challengeRow, error: cErr } = await supabaseAdmin
          .from('challenges')
          .select('slug')
          .eq('id', challengeId)
          .maybeSingle()

        if (cErr) {
          console.error('review-certification: challenges lookup error', cErr)
        } else if (challengeRow?.slug) {
          styleName = styleNameFromChallengeSlug(challengeRow.slug)
        }
      }

      const payload = buildCertificatePayload(
        {
          ...submissionRow,
          token: submissionRow.review_token,
        },
        token,
        styleName
      )
      return NextResponse.json(payload, { status: 200 })
    }

    // 3) Nothing in either table
    console.error('review-certification: token not found in either table', {
      token,
      tokenErr,
      subErr,
    })

    return NextResponse.json(
      { ok: false, error: 'Review token not found' },
      { status: 404 }
    )
  } catch (err) {
    console.error('review-certification: unexpected error', err)
    return NextResponse.json(
      { ok: false, error: 'Internal error while preparing certificate details' },
      { status: 500 }
    )
  }
}

// Guard other methods
export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}
export const PUT = GET
export const DELETE = GET