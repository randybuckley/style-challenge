// src/app/api/review/reject/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sgMail from '@sendgrid/mail'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SENDGRID_FROM = process.env.SENDGRID_FROM || 'no-reply@accesslonghair.com'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const safe = (s) => String(s ?? '').trim()

export async function POST(req) {
  try {
    let body = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000'

    const host = (() => {
      try {
        return new URL(origin).host
      } catch {
        return origin
      }
    })()

    const token = safe(body.token)
    const reason = safe(body.reason)
    const notes = safe(body.notes)
    const providedEmail = safe(body.userEmail) // optional fallback from body/query

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Missing token' },
        { status: 400 }
      )
    }

    // 🔵 NEW: look up submission by review_token on the submissions table
    let toEmail = ''

    const { data: submission, error: lookupError } = await supabase
      .from('submissions')
      .select('email')
      .eq('review_token', token)
      .maybeSingle()

    if (lookupError) {
      console.error('review/reject lookup error:', lookupError.message)
      return NextResponse.json(
        { ok: false, error: 'Database error looking up token' },
        { status: 500 }
      )
    }

    if (submission?.email) {
      toEmail = safe(submission.email)
    }

    // fallback if for some reason email wasn’t stored but we got one from the client
    if (!toEmail && providedEmail) {
      toEmail = providedEmail
    }

    if (!toEmail) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired token' },
        { status: 400 }
      )
    }

    if (!SENDGRID_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'Mailer not configured' },
        { status: 500 }
      )
    }

    sgMail.setApiKey(SENDGRID_API_KEY)

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.45;">
        <h2 style="margin:0 0 10px;">Thanks for your submission</h2>
        <p>Your portfolio was reviewed but needs a little more work before approval.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        ${notes ? `<p><strong>Feedback:</strong><br>${notes.replace(/\n/g, '<br>')}</p>` : ''}
        <p>You can update your images here:
          <a href="${origin}/challenge/portfolio">${host}/challenge/portfolio</a>
        </p>
        <p>All the best,<br>Patrick</p>
      </div>
    `

    await sgMail.send({
      to: toEmail,
      from: SENDGRID_FROM,
      subject: 'Style Challenge – Feedback on your submission',
      html,
    })

    return NextResponse.json({ ok: true, sentTo: toEmail })
  } catch (e) {
    console.error('review/reject unexpected error:', e)
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    )
  }
}