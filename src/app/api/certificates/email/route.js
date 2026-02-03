import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { readFile } from 'fs/promises'
import path from 'path'
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

    const stylistName   = safe(body.stylistName)
    const salonName     = safe(body.salonName)
    const styleName     = safe(body.styleName)
    const date          = safe(body.date)
    const certificateId = safe(body.certificateId)
    const email         = safe(body.email)
    const watermark     = safe(body.watermark || 'PC')

    if (!stylistName || !styleName || !date || !certificateId || !email) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields.' },
        { status: 400 }
      )
    }

    // --- Generate PDF (same logic as /generate) ---
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([842, 595])
    const { width, height } = page.getSize()
    const margin = 40
    const black = rgb(0, 0, 0)

    const serif = await pdf.embedFont(StandardFonts.TimesRoman)
    const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold)

    const tw = (text, size, font) => font.widthOfTextAtSize(text, size)
    const cx = (text, size, font) => (width - tw(text, size, font)) / 2

    page.drawText(watermark, {
      x: width / 2 - 140,
      y: height / 2 - 80,
      size: 140,
      font: serifBold,
      color: black,
      opacity: 0.06,
      rotate: degrees(-18)
    })

    const h1 = 'PATRICK CAMERON LONG HAIR ACADEMY'
    const h2 = 'CERTIFICATE OF ACHIEVEMENT'

    page.drawText(h1, { x: cx(h1, 20, serifBold), y: height - 60, size: 20, font: serifBold })
    page.drawText(h2, { x: cx(h2, 28, serifBold), y: height - 120, size: 28, font: serifBold })

    page.drawLine({
      start: { x: margin, y: height - 90 },
      end: { x: width - margin, y: height - 90 },
      thickness: 1,
      color: black
    })

    let y = height - 190
    page.drawText('This certifies that', { x: cx('This certifies that', 14, serif), y, size: 14, font: serif })
    y -= 26

    page.drawText(stylistName.toUpperCase(), {
      x: cx(stylistName.toUpperCase(), 26, serifBold),
      y,
      size: 26,
      font: serifBold
    })
    y -= 30

    if (salonName) {
      const l2 = `of ${salonName}`
      page.drawText(l2, { x: cx(l2, 14, serif), y, size: 14, font: serif })
      y -= 24
    }

    const l3 = `has successfully completed the Style Challenge: ${styleName}`
    page.drawText(l3, { x: cx(l3, 14, serif), y, size: 14, font: serif })

    page.drawLine({
      start: { x: margin, y: 120 },
      end: { x: width - margin, y: 120 },
      thickness: 1,
      color: black
    })

    const asset = (p) => path.join(process.cwd(), 'public', 'cert', p)

    try {
      const buf = await readFile(asset('signature.png'))
      const img = await pdf.embedPng(buf)
      const w = 180
      const h = (img.height / img.width) * w
      page.drawImage(img, { x: width - margin - w, y: 40, width: w, height: h })
    } catch {}

    const rx = width - margin - 260
    page.drawText('Patrick Cameron', { x: rx, y: 92, size: 16, font: serifBold })
    page.drawText(`Awarded on ${date}`, { x: rx, y: 72, size: 12, font: serif })
    page.drawText(`Certificate No. ${certificateId}`, { x: rx, y: 54, size: 12, font: serif })

    const pdfBytes = await pdf.save()
    const base64Pdf = Buffer.from(pdfBytes).toString('base64')

    // --- Send email ---
    await sgMail.send({
      to: email,
      from: {
        email: process.env.EMAIL_FROM || 'info@accesslonghair.com',
        name: 'Patrick Cameron Style Challenge'
      },
      subject: 'Your Style Challenge Certificate',
      text: `Attached is your certificate for ${styleName}.`,
      attachments: [
        {
          content: base64Pdf,
          filename: `Certificate_${certificateId}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    )
  }
}
