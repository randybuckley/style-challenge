// src/app/api/certificates/generate/route.js
import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { readFile } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic' // avoid any caching issues

const safe = (v) => (v == null ? '' : String(v))

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))

    const stylistName   = safe(body.stylistName)            // required
    const salonName     = safe(body.salonName)              // optional line
    const styleName     = safe(body.styleName)              // required
    const date          = safe(body.date)                   // required: e.g. 2025-11-09
    const certificateId = safe(body.certificateId)          // required: e.g. PC-001234
    const watermark     = safe(body.watermark || 'PC')      // faint initials

    if (!stylistName || !styleName || !date || !certificateId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields (stylistName, styleName, date, certificateId).' },
        { status: 400 }
      )
    }

    // A4 landscape = 842 x 595 points
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([842, 595])
    const { width, height } = page.getSize()
    const margin = 40
    const black = rgb(0, 0, 0)

    // Standard fonts (serverless-safe). Later you can swap to custom Baskerville/Garamond if you want.
    const serif = await pdf.embedFont(StandardFonts.TimesRoman)
    const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold)

    const tw = (text, size, font) => font.widthOfTextAtSize(text, size)
    const cx = (text, size, font) => (width - tw(text, size, font)) / 2

    // Optional watermark in the centre
    if (watermark) {
      page.drawText(watermark, {
        x: width / 2 - 140,
        y: height / 2 - 80,
        size: 140,
        font: serifBold,
        color: black,
        opacity: 0.06,
        rotate: degrees(-18)
      })
    }

    // Headers
    const h1 = 'PATRICK CAMERON LONG HAIR ACADEMY'
    const h2 = 'CERTIFICATE OF ACHIEVEMENT'

    page.drawText(h1, {
      x: cx(h1, 20, serifBold),
      y: height - 60,
      size: 20,
      font: serifBold,
      color: black
    })

    page.drawText(h2, {
      x: cx(h2, 28, serifBold),
      y: height - 120,
      size: 28,
      font: serifBold,
      color: black
    })

    // Top rule
    page.drawLine({
      start: { x: margin, y: height - 90 },
      end: { x: width - margin, y: height - 90 },
      thickness: 1,
      color: black
    })

    // Body text
    const l1 = 'This certifies that'
    const nameLine = stylistName.toUpperCase()
    const l2 = salonName ? `of ${salonName}` : ''
    const l3 = `has successfully completed the Style Challenge: ${styleName}`

    let y = height - 190
    page.drawText(l1, {
      x: cx(l1, 14, serif),
      y,
      size: 14,
      font: serif,
      color: black
    })
    y -= 26

    page.drawText(nameLine, {
      x: cx(nameLine, 26, serifBold),
      y,
      size: 26,
      font: serifBold,
      color: black
    })
    y -= 30

    if (l2) {
      page.drawText(l2, {
        x: cx(l2, 14, serif),
        y,
        size: 14,
        font: serif,
        color: black
      })
      y -= 24
    }

    page.drawText(l3, {
      x: cx(l3, 14, serif),
      y,
      size: 14,
      font: serif,
      color: black
    })
    y -= 30

    // Footer rule
    page.drawLine({
      start: { x: margin, y: 120 },
      end: { x: width - margin, y: 120 },
      thickness: 1,
      color: black
    })

    // Assets helper – looks in /public/cert
    const asset = (p) => path.join(process.cwd(), 'public', 'cert', p)

    // Pencil illustration bottom-left (optional)
    try {
      const buf = await readFile(asset('pencil.png'))
      const img = await pdf.embedPng(buf)
      const w = 140
      const h = (img.height / img.width) * w
      page.drawImage(img, {
        x: margin,
        y: 30,
        width: w,
        height: h
      })
    } catch {
      // silently ignore if pencil image not present
    }

    // Signature bottom-right (optional)
    try {
      const buf = await readFile(asset('signature.png'))
      const img = await pdf.embedPng(buf)
      const w = 180
      const h = (img.height / img.width) * w
      page.drawImage(img, {
        x: width - margin - w,
        y: 40,
        width: w,
        height: h
      })
    } catch {
      // silently ignore if signature image not present
    }

    // Right footer text
    const rx = width - margin - 260
    page.drawText('Patrick Cameron', {
      x: rx,
      y: 92,
      size: 16,
      font: serifBold,
      color: black
    })
    page.drawText(`Awarded on ${date}`, {
      x: rx,
      y: 72,
      size: 12,
      font: serif,
      color: black
    })
    page.drawText(`Certificate No. ${certificateId}`, {
      x: rx,
      y: 54,
      size: 12,
      font: serif,
      color: black
    })

    // Save PDF
    const bytes = await pdf.save()
    const fileName = `Certificate_${stylistName.replace(/\s+/g, '_')}_${styleName.replace(/\s+/g, '_')}.pdf`

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`
      }
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    )
  }
}