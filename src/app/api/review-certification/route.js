// src/app/api/review-certification/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

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

    // Look up the review token row
    const { data: row, error } = await supabaseAdmin
      .from('review_tokens')
      .select(
        `
          token,
          user_id,
          user_email,
          first_name,
          second_name,
          salon_name
        `
      )
      .eq('token', token)
      .single()

    if (error || !row) {
      console.error('review-certification: token lookup failed', error || 'no row')
      return NextResponse.json(
        { ok: false, error: 'Review token not found' },
        { status: 404 }
      )
    }

    // We USED to require user_id here – that is what caused:
    // { "error": "Missing userId" }
    // For the certificate PDF we only need stylist/salon/style info,
    // so we no longer treat a missing user_id as an error.

    const first = (row.first_name || '').trim()
    const second = (row.second_name || '').trim()
    const salon = (row.salon_name || '').trim()

    const stylistName = [first, second].filter(Boolean).join(' ') || (row.user_email || 'Stylist')
    const styleName = 'Challenge Number One' // current challenge name

    // Use today's date in YYYY-MM-DD for the certificate
    const today = new Date()
    const date = today.toISOString().slice(0, 10)

    // Simple deterministic-ish certificate ID:
    // PC- + last 6 chars of token uppercased
    const tokenTail = String(row.token || '').slice(-6).toUpperCase() || '000000'
    const certificateId = `PC-${tokenTail}`

    return NextResponse.json(
      {
        ok: true,
        stylistName,
        salonName: salon,
        styleName,
        date,
        certificateId,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('review-certification: unexpected error', err)
    return NextResponse.json(
      { ok: false, error: 'Internal error while preparing certificate details' },
      { status: 500 }
    )
  }
}

// Optional: guard other HTTP methods
export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}
export function PUT() { return GET() }
export function DELETE() { return GET() }