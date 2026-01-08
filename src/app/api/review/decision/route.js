// src/app/api/review/decision/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sgMail from '@sendgrid/mail'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    : null

// --- SendGrid (stylist notification) ---
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || ''
const SENDGRID_FROM =
  process.env.SENDGRID_FROM ||
  process.env.EMAIL_FROM ||
  'no-reply@accesslonghair.com'

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY)
}

function safeSlug(v) {
  const s = String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return s || 'starter-style'
}

function safe(v) {
  return v == null ? '' : String(v)
}

function pickSite(urlOrigin) {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || urlOrigin
  return String(raw || urlOrigin).replace(/\/+$/, '')
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

    // 1) Load the submission (need email + slug + id)
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
    const stylistEmail = safe(submission.email)

    // 2) Update decision fields
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

    // 3) Reviewer redirect targets
    // IMPORTANT: redirect Patrick to the GLOBAL /result pages (not /challenges/*),
    // so Patrick does NOT see the congratulations/certificate UI.
    //
    // Those global pages already route the STYLIST to the right experience.
    const site = pickSite(url.origin)

    const reviewerRedirectTo =
      action === 'approve'
        ? `${site}/review/approved?token=${encodeURIComponent(token)}`
        : `${site}/review/rejected?token=${encodeURIComponent(token)}`

    // 4) Email stylist “review completed” with CTA to view result (neutral wording).
    // This is the ONLY place the stylist should see approved/rejected UI.
    if (SENDGRID_API_KEY && stylistEmail) {
      try {
        const stylistResultUrl =
          action === 'approve'
            ? `${site}/result/approved?token=${encodeURIComponent(token)}&userEmail=${encodeURIComponent(
                stylistEmail
              )}`
            : `${site}/result/rejected?token=${encodeURIComponent(token)}&userEmail=${encodeURIComponent(
                stylistEmail
              )}`

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
                        <img src="${site}/logo.jpeg" width="160" height="auto"
                          alt="Patrick Cameron – Style Challenge"
                          style="display:block;border:0;outline:none;text-decoration:none" />
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:4px 22px 6px">
                        <h2 style="margin:0 0 8px;font-size:20px;line-height:1.35">
                          Your work has been reviewed
                        </h2>
                        <p style="margin:0 0 12px;font-size:15px;line-height:1.6">
                          Patrick has reviewed your Style Challenge submission. Click below to view your result.
                        </p>
                        <div style="margin:14px 0 4px;">
                          <a href="${stylistResultUrl}"
                            style="display:inline-block;background:#111;color:#fff;
                                   text-decoration:none;padding:12px 16px;border-radius:10px;
                                   font-weight:700;">
                            View your result
                          </a>
                        </div>
                        <p style="margin:14px 0 0;font-size:12px;color:#666;line-height:1.5">
                          If the button doesn’t work, copy and paste this link into your browser:<br/>
                          <span style="user-select:all;overflow-wrap:anywhere;">${stylistResultUrl}</span>
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:14px 22px 22px;color:#888;font-size:12px">
                        © ${new Date().getFullYear()} Patrick Cameron Team
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>
        `

        await sgMail.send({
          to: stylistEmail,
          from: SENDGRID_FROM,
          subject: 'Your Style Challenge review is ready',
          html,
        })
      } catch (mailErr) {
        // Never block the reviewer flow on email failure
        console.error('/api/review/decision: stylist email send error', mailErr)
      }
    }

    return NextResponse.redirect(reviewerRedirectTo, { status: 302 })
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