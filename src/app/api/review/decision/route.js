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
          await sgMail.send({
            to: userEmail,
            from: SENDGRID_FROM,
            subject: 'Style Challenge – Your submission has been approved ✅',
            html: `
              <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.5">
                <h2 style="margin:0 0 10px;">Congratulations!</h2>
                <p>Your Style Challenge submission has been approved by Patrick Cameron.</p>
                <p>We’ll be in touch about your certificate next steps.</p>
                <p>All the best,<br/>Patrick Cameron Team</p>
              </div>
            `
          })
        }
      } catch { /* don’t block reviewer flow */ }
      return NextResponse.redirect(`${origin}/review/approved`, 302)
    }

    if (action === 'reject') {
      // IMPORTANT: persist the token first, then send the reviewer to the form
      const qs = new URLSearchParams({ token, userEmail }).toString()
      return NextResponse.redirect(`${origin}/api/review/reject-link?${qs}`, 302)
    }

    return NextResponse.redirect(`${origin}/challenge/certify?msg=error`, 302)
  } catch {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    return NextResponse.redirect(`${origin}/challenge/certify?msg=error`, 302)
  }
}