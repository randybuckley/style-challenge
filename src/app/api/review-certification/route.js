// src/app/api/review-certification/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function buildCertificatePayload(row, token) {
  const first = (row.first_name || '').trim()
  const second = (row.second_name || '').trim()
  const salon = (row.salon_name || '').trim()

  const stylistName =
    [first, second].filter(Boolean).join(' ') ||
    (row.user_email || row.email || 'Stylist')

  const styleName = 'Challenge Number One'

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

    // 1) Try review_tokens first
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
      const payload = buildCertificatePayload(tokenRow, token)
      return NextResponse.json(payload, { status: 200 })
    }

    // 2) Fall back to submissions.review_token
    // IMPORTANT: this table uses `email`, not `user_email`
    const { data: submissionRow, error: subErr } = await supabaseAdmin
      .from('submissions')
      .select(`
        review_token,
        user_id,
        email,
        first_name,
        second_name,
        salon_name
      `)
      .eq('review_token', token)
      .maybeSingle()

    if (subErr) {
      console.error('review-certification: submissions query error', subErr)
    }

    if (submissionRow) {
      const payload = buildCertificatePayload(
        {
          ...submissionRow,
          token: submissionRow.review_token,
        },
        token
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