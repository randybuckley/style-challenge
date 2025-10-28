// src/app/review/[token]/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const siteBaseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export async function GET(req, { params }) {
  const token = params.token
  const url = new URL(req.url)
  const action = url.searchParams.get('action') || 'view'

  try {
    // find review row by token
    const { data: rows, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('token', token)
      .limit(1)
    if (error) throw error
    const review = rows?.[0]
    if (!review) return NextResponse.redirect(`${siteBaseUrl}/challenge/certify?msg=notfound`)

    if (action === 'approve') {
      await supabase.from('reviews').update({ status: 'approved' }).eq('token', token)

      // email the user a congratulations link
      const toEmail = review.user_email
      const congratsUrl = `${siteBaseUrl}/challenge/congratulations`

      const html = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6; padding:24px 0;">
          <tr><td align="center">
            <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:14px; border:1px solid #eee; padding:24px;">
              <tr><td align="center" style="padding:0 0 10px;">
                <img src="${siteBaseUrl}/logo.jpeg" alt="Patrick Cameron — Style Challenge" width="180" style="display:block; border-radius:12px; opacity:.85;">
              </td></tr>
              <tr><td style="font:400 16px system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111;">
                <p style="margin:0 0 10px;">Thank you for submitting your work.</p>
                <p style="margin:0 0 14px;">Patrick has carefully reviewed the images and the results are <a href="${congratsUrl}" style="font-weight:700; color:#0b5ed7; text-decoration:none;">here</a>.</p>
                <p style="margin:18px 0 4px;">All the best,</p>
                <p style="margin:0 0 12px; font-weight:700;">Patrick</p>
                <img src="${siteBaseUrl}/logo.jpeg" alt="Style Challenge" width="140" style="display:block; opacity:.85;">
              </td></tr>
            </table>
          </td></tr>
        </table>
      `

      if (toEmail) {
        await sgMail.send({
          to: toEmail,
          from: 'info@accesslonghair.com',
          subject: 'Your Style Challenge result',
          html
        })
      }

      return NextResponse.redirect(`${siteBaseUrl}/challenge/certify?msg=approved`)
    }

    if (action === 'reject') {
      await supabase.from('reviews').update({ status: 'rejected' }).eq('token', token)
      return NextResponse.redirect(`${siteBaseUrl}/challenge/certify?msg=rejected`)
    }

    return NextResponse.redirect(`${siteBaseUrl}/challenge/certify`)
  } catch (err) {
    console.error('review route error:', err)
    return NextResponse.redirect(`${siteBaseUrl}/challenge/certify?msg=error`)
  }
}