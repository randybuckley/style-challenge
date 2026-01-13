// src/app/api/review/decision/route.js
import { NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SENDGRID_FROM = process.env.SENDGRID_FROM || 'no-reply@accesslonghair.com'

const safe = (v) => (v == null ? '' : String(v))

function getOrigin(reqUrl) {
  const url = new URL(reqUrl)
  return (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(/\/+$/, '')
}

function normalizeActionFromDecision(decisionOrAction) {
  const v = safe(decisionOrAction).toLowerCase().trim()
  if (!v) return ''
  if (v === 'approve' || v === 'approved') return 'approve'
  if (v === 'reject' || v === 'rejected') return 'reject'
  // allow passing through "approve"/"reject" explicitly
  return v
}

/**
 * GET is the authoritative, email-link style endpoint:
 * /api/review/decision?action=approve|reject&token=...&userEmail=...
 */
export async function GET(req) {
  try {
    const url = new URL(req.url)
    const origin = getOrigin(req.url)

    const action = safe(url.searchParams.get('action')).toLowerCase()
    const token = safe(url.searchParams.get('token'))
    const userEmail = safe(url.searchParams.get('userEmail') || url.searchParams.get('ue'))

    if (!token) {
      return NextResponse.redirect(`${origin}/challenge/certify?msg=error`, 302)
    }

    if (action === 'approve') {
      try {
        if (SENDGRID_API_KEY && userEmail) {
          sgMail.setApiKey(SENDGRID_API_KEY)

          const site = origin
          const logoUrl = `${site}/logo.jpeg`

          // NOTE: now includes userEmail in the URL
          const resultUrl = `${site}/result/approved?token=${encodeURIComponent(
            token
          )}&userEmail=${encodeURIComponent(userEmail)}`

          const html = `
            <div style="background:#f7f7f8;padding:24px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
                <tr>
                  <td align="center">
                    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #eee;border-radius:12px;overflow:hidden">
                      <tr>
                        <td align="center" style="padding:22px 22px 10px">
                          <img src="${logoUrl}" width="160" height="auto" alt="Patrick Cameron – Style Challenge" style="display:block;border:0;outline:none;text-decoration:none" />
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 22px 0">
                          <h2 style="margin:0 0 8px;font-size:20px;line-height:1.35">Your result is ready</h2>
                          <p style="margin:0 0 14px;font-size:15px;line-height:1.6">
                            Patrick has considered your Style Challenge submission. Click below to view the result.
                          </p>
                          <div style="text-align:center;margin:20px 0 8px">
                            <a href="${resultUrl}" 
                               style="background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;display:inline-block">
                              View your result
                            </a>
                          </div>
                          <p style="margin:16px 0 0;font-size:13px;color:#555;line-height:1.6">
                            If the button doesn’t work, paste this link into your browser:<br/>
                            <span style="word-break:break-all;color:#111">${resultUrl}</span>
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:18px 22px 22px;color:#888;font-size:12px">
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
            to: userEmail,
            from: SENDGRID_FROM,
            subject: 'Your Style Challenge result is ready',
            html,
          })
        }
      } catch {
        // don't block Patrick if mail fails
      }

      return NextResponse.redirect(`${origin}/review/approved`, 302)
    }

    if (action === 'reject') {
      return NextResponse.redirect(`${origin}/review/${encodeURIComponent(token)}`, 302)
    }

    return NextResponse.redirect(`${origin}/challenge/certify?msg=error`, 302)
  } catch {
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')
    return NextResponse.redirect(`${origin}/challenge/certify?msg=error`, 302)
  }
}

/**
 * POST shim for testing / tooling.
 * Accepts JSON and redirects to the canonical GET URL so the email-link flow stays the single source of truth.
 *
 * Example:
 * curl -i -L -X POST http://localhost:3000/api/review/decision \
 *   -H "Content-Type: application/json" \
 *   -d '{"token":"...","decision":"approved","userEmail":"x@y.com"}'
 */
export async function POST(req) {
  try {
    const origin = getOrigin(req.url)

    let body = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const token = safe(body.token)
    const userEmail = safe(body.userEmail || body.ue)
    const action = normalizeActionFromDecision(body.action || body.decision)

    if (!token || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json(
        {
          error:
            'Invalid payload. Require { token, decision:"approved"|"rejected" } or { token, action:"approve"|"reject" }.',
        },
        { status: 400 }
      )
    }

    const target =
      `${origin}/api/review/decision` +
      `?action=${encodeURIComponent(action)}` +
      `&token=${encodeURIComponent(token)}` +
      (userEmail ? `&userEmail=${encodeURIComponent(userEmail)}` : '')

    // 307 preserves method semantics, but curl -L will follow to GET anyway.
    return NextResponse.redirect(target, 307)
  } catch (err) {
    console.error('POST /api/review/decision shim failed', err)
    return NextResponse.json({ error: 'Failed to proxy decision.' }, { status: 500 })
  }
}