// src/app/api/review/reject/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sgMail from '@sendgrid/mail'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SENDGRID_FROM = process.env.SENDGRID_FROM || 'no-reply@accesslonghair.com'

const safe = (s) => String(s ?? '').trim()

function escapeHtml(str) {
  return safe(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

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

    const site = String(origin).replace(/\/+$/, '')

    const host = (() => {
      try {
        return new URL(site).host
      } catch {
        return site
      }
    })()

    const token = safe(body.token)
    const reason = safe(body.reason)
    const notes = safe(body.notes)
    const providedEmail = safe(body.userEmail) // optional fallback from body

    // ✅ Pro routing: send them back to the correct challenge/slug, not MVP v6.
    // We accept either challenge_slug or slug from the caller as optional fallback.
    const providedSlug = safe(body.challenge_slug || body.slug)

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Missing token' },
        { status: 400 }
      )
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: 'Supabase not configured' },
        { status: 500 }
      )
    }

    // Create service-role client after env validation (avoids confusing runtime failures)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Look up submission by review_token on the submissions table.
    // IMPORTANT: do NOT select non-existent columns (e.g. "slug") or PostgREST will error.
    const { data: submission, error: lookupError } = await supabase
      .from('submissions')
      .select('email, user_id, challenge_slug, first_name')
      .eq('review_token', token)
      .maybeSingle()

    if (lookupError) {
      console.error('review/reject lookup error:', lookupError.message)
      return NextResponse.json(
        { ok: false, error: 'Database error looking up token' },
        { status: 500 }
      )
    }

    // Determine recipient email
    let toEmail = safe(submission?.email)
    if (!toEmail && providedEmail) toEmail = providedEmail

    if (!toEmail) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired token' },
        { status: 400 }
      )
    }

    // Determine challenge slug (so we can route correctly)
    const slugFromDb = safe(submission?.challenge_slug)
    const challengeSlug = slugFromDb || providedSlug || ''

    // Build a safe retry URL:
    // - If we have a slug: /challenges/<slug>/step1 (Pro)
    // - Else fallback: /challenges/menu (still Pro side, avoids MVP v6)
    const retryPath = challengeSlug
      ? `/challenges/${encodeURIComponent(challengeSlug)}/step1`
      : '/challenges/menu'
    const retryUrl = `${site}${retryPath}`

    // Resolve first name (submissions preferred; profiles fallback)
    let firstName = safe(submission?.first_name)
    if (!firstName && submission?.user_id) {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('first_name')
        .eq('id', submission.user_id)
        .maybeSingle()

      if (profileErr) {
        // non-fatal
        console.warn('review/reject profile lookup warning:', profileErr.message)
      } else {
        firstName = safe(profile?.first_name)
      }
    }

    if (!SENDGRID_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'Mailer not configured' },
        { status: 500 }
      )
    }

    sgMail.setApiKey(SENDGRID_API_KEY)

    // Email assets
    const logoUrl = `${site}/logo.jpeg`

    // Escape user-provided content
    const reasonHtml = reason ? escapeHtml(reason) : ''
    const notesHtml = notes ? escapeHtml(notes).replace(/\n/g, '<br>') : ''

    const greeting = firstName
      ? `Hi ${escapeHtml(firstName)},`
      : 'Thanks for your submission'

    const html = `
      <div style="background:#f7f7f8;padding:24px 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                     style="background:#ffffff;border:1px solid #eee;border-radius:12px;overflow:hidden">
                <tr>
                  <td align="center" style="padding:22px 22px 10px">
                    <img src="${logoUrl}" width="160" height="auto"
                         alt="Patrick Cameron – Style Challenge"
                         style="display:block;border:0;outline:none;text-decoration:none" />
                  </td>
                </tr>

                <tr>
                  <td style="padding:4px 22px 0">
                    <h2 style="margin:0 0 10px;font-size:20px;line-height:1.35">${greeting}</h2>

                    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">
                      Your portfolio was reviewed but needs a little more work before approval.
                    </p>

                    ${
                      reasonHtml
                        ? `<p style="margin:0 0 10px;font-size:15px;line-height:1.6"><strong>Reason:</strong> ${reasonHtml}</p>`
                        : ''
                    }

                    ${
                      notesHtml
                        ? `<p style="margin:0 0 10px;font-size:15px;line-height:1.6"><strong>Feedback:</strong><br>${notesHtml}</p>`
                        : ''
                    }

                    <div style="text-align:center;margin:20px 0 8px">
                      <a href="${retryUrl}"
                         style="background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;display:inline-block">
                        Update your images
                      </a>
                    </div>

                    <p style="margin:16px 0 0;font-size:13px;color:#555;line-height:1.6">
                      If the button doesn’t work, paste this link into your browser:<br/>
                      <span style="word-break:break-all;color:#111">${retryUrl}</span>
                    </p>

                    <p style="margin:16px 0 0;font-size:15px;line-height:1.6">
                      All the best,<br/>Patrick
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:18px 22px 22px;color:#888;font-size:12px">
                    © ${new Date().getFullYear()} Patrick Cameron Team · Sent from ${host}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `

    await sgMail.send({
      to: toEmail,
      from: SENDGRID_FROM,
      subject: 'Style Challenge – Feedback on your submission',
      html,
    })

    return NextResponse.json({
      ok: true,
      sentTo: toEmail,
      challengeSlug: challengeSlug || null,
      retryUrl,
    })
  } catch (e) {
    console.error('review/reject unexpected error:', e)
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    )
  }
}