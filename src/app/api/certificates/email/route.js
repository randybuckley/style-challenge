// src/app/api/certificates/email/route.js
import { NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'

export const dynamic = 'force-dynamic'

// ENV sanity
if (!process.env.SENDGRID_API_KEY) {
  console.warn('SENDGRID_API_KEY not set')
}
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const safe = (v) => (v == null ? '' : String(v))

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))

    const stylistName = safe(body.stylistName)
    const salonName = safe(body.salonName)
    const styleName = safe(body.styleName)
    const date = safe(body.date)
    const certificateId = safe(body.certificateId)
    const email = safe(body.email)
    const watermark = safe(body.watermark || 'PC')

    if (!stylistName || !styleName || !date || !certificateId || !email) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields.' },
        { status: 400 }
      )
    }

    // Robust origin derivation (works locally + on Vercel)
    const origin = new URL(req.url).origin

    // Public logo URL (served from /public/logo.jpeg)
    const logoUrl = `${origin}/logo.jpeg`

    // Call the SAME PDF generator used by the Approved download flow
    const pdfRes = await fetch(`${origin}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/pdf',
      },
      body: JSON.stringify({
        stylistName,
        salonName,
        styleName,
        date,
        certificateId,
        email,
        watermark,
      }),
      cache: 'no-store',
    })

    if (!pdfRes.ok) {
      const text = await pdfRes.text().catch(() => '')
      console.error('Email route: PDF generation failed:', pdfRes.status, text)
      return NextResponse.json(
        { ok: false, error: text || `PDF generation failed (status ${pdfRes.status})` },
        { status: 500 }
      )
    }

    const pdfArrayBuffer = await pdfRes.arrayBuffer()
    const base64Pdf = Buffer.from(pdfArrayBuffer).toString('base64')

    const subject = 'Congratulations — here is your Style Challenge certificate'

    const greetingName = stylistName || 'Stylist'
    const salonLine = salonName ? ` (${salonName})` : ''

    const textCopy =
      `Congratulations, ${greetingName}${salonLine}!\n\n` +
      `You have successfully completed the Style Challenge: ${styleName}.\n\n` +
      `Attached is your certificate (Certificate No. ${certificateId}).\n\n` +
      `Keep building your long-hair artistry — this is just the start.\n\n` +
      `Patrick Cameron Style Challenge`

    const htmlCopy = `
      <div style="font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#111; line-height:1.5;">
        <div style="margin: 0 0 18px 0;">
          <img src="${logoUrl}" alt="Patrick Cameron" style="width:180px; height:auto; display:block;" />
        </div>

        <h2 style="margin: 0 0 10px 0; font-size: 20px;">Congratulations, ${escapeHtml(
          greetingName
        )}${salonName ? escapeHtml(salonLine) : ''}!</h2>

        <p style="margin: 0 0 12px 0;">
          You have successfully completed the <strong>Style Challenge: ${escapeHtml(
            styleName
          )}</strong>.
        </p>

        <p style="margin: 0 0 12px 0;">
          Your certificate is attached to this email.
          <br />
          <span style="color:#444;">Certificate No. ${escapeHtml(
            certificateId
          )} · Awarded on ${escapeHtml(date)}</span>
        </p>

        <p style="margin: 18px 0 0 0;">
          Keep building your long-hair artistry — this is just the start.
        </p>

        <p style="margin: 18px 0 0 0; color:#444;">
          — Patrick Cameron Style Challenge
        </p>
      </div>
    `

    await sgMail.send({
      to: email,
      from: {
        email: process.env.EMAIL_FROM || 'info@accesslonghair.com',
        name: 'Patrick Cameron Style Challenge',
      },
      subject,
      text: textCopy,
      html: htmlCopy,
      attachments: [
        {
          content: base64Pdf,
          filename: `Certificate_${certificateId}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    )
  }
}

// Minimal HTML escaping for dynamic fields in the HTML email
function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}