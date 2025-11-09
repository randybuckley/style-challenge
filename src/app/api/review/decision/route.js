// src/app/api/review/decision/route.js
import { NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SENDGRID_FROM = process.env.SENDGRID_FROM || 'no-reply@accesslonghair.com'

const safe = (v) => (v == null ? '' : String(v))

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin

    const action = safe(url.searchParams.get('action')).toLowerCase()
    const token = safe(url.searchParams.get('token'))
    const userEmail = safe(url.searchParams.get('userEmail'))

    if (!token) {
      return NextResponse.redirect(`${origin}/challenge/certify?msg=error`, 302)
    }

    if (action === 'approve') {
      try {
        if (SENDGRID_API_KEY && userEmail) {
          sgMail.setApiKey(SENDGRID_API_KEY)

          const site = origin.replace(/\/+$/,'')
          const logoUrl = `${site}/logo.jpeg` // public/logo.jpeg
          const resultUrl = `${site}/result/approved?token=${encodeURIComponent(token)}`

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
            html
          })
        }
      } catch {
        // Do not block reviewer on mail failure
      }

      return NextResponse.redirect(`${origin}/review/approved`, 302)
    }

    if (action === 'reject') {
      return NextResponse.redirect(`${origin}/review/${encodeURIComponent(token)}`, 302)
    }

    return NextResponse.redirect(`${origin}/challenge/certify?msg=error`, 302)
  } catch {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    return NextResponse.redirect(`${origin}/challenge/certify?msg=error`, 302)
  }
}