// src/app/api/certificates/generate/route.js
import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { readFile } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic' // avoid any caching issues

const safe = (v) => (v == null ? '' : String(v))

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))

    const stylistName   = safe(body.stylistName)   // required
    const salonName     = safe(body.salonName)     // optional
    const styleName     = safe(body.styleName)     // required
    const date          = safe(body.date)          // required (e.g. 2025-11-09)
    const certificateId = safe(body.certificateId) // required (e.g. PC-001234)

    if (!stylistName || !styleName || !date || !certificateId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Missing required fields (stylistName, styleName, date, certificateId).',
        },
        { status: 400 }
      )
    }

    // Helper to resolve assets under /public/cert
    const asset = (p) => path.join(process.cwd(), 'public', 'cert', p)

    // ---- 1. Create PDF sized to the certificate artwork ----
    // We use the PNG as a full-page background and then overlay text.
    const certPngBytes = await readFile(asset('certificate.png'))
    const pdf = await PDFDocument.create()
    const certImage = await pdf.embedPng(certPngBytes)

    const page = pdf.addPage([certImage.width, certImage.height])
    const { width, height } = page.getSize()

    // Background image fills the entire page
    page.drawImage(certImage, {
      x: 0,
      y: 0,
      width,
      height,
    })

    const black = rgb(0, 0, 0)
    const serif = await pdf.embedFont(StandardFonts.TimesRoman)
    const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold)

    const textWidth = (text, size, font) => font.widthOfTextAtSize(text, size)
    const centerX = (text, size, font) =>
      (width - textWidth(text, size, font)) / 2

    // ---- 2. Body text block (centre-bottom area) ----
    const line1 = 'This certifies that'
    const nameLine = stylistName.toUpperCase()
    const line2 = salonName ? `of ${salonName}` : ''
    const line3 = `has successfully completed the Style Challenge`
    const line4 = styleName

    // Start roughly in the lower third of the page – tweak if needed
    let y = height * 0.36

    page.drawText(line1, {
      x: centerX(line1, 20, serif),
      y,
      size: 20,
      font: serif,
      color: black,
    })
    y -= 34

    page.drawText(nameLine, {
      x: centerX(nameLine, 30, serifBold),
      y,
      size: 30,
      font: serifBold,
      color: black,
    })
    y -= 40

    if (line2) {
      page.drawText(line2, {
        x: centerX(line2, 18, serif),
        y,
        size: 18,
        font: serif,
        color: black,
      })
      y -= 32
    }

    page.drawText(line3, {
      x: centerX(line3, 18, serif),
      y,
      size: 18,
      font: serif,
      color: black,
    })
    y -= 30

    page.drawText(line4, {
      x: centerX(line4, 20, serifBold),
      y,
      size: 20,
      font: serifBold,
      color: black,
    })

    // ---- 3. Footer details (date + certificate number) ----
    const dateLine = `Awarded on ${date}`
    const certLine = `Certificate No. ${certificateId}`

    page.drawText(dateLine, {
      x: centerX(dateLine, 14, serif),
      y: 90,
      size: 14,
      font: serif,
      color: black,
    })

    page.drawText(certLine, {
      x: centerX(certLine, 12, serif),
      y: 66,
      size: 12,
      font: serif,
      color: black,
    })

    // ---- 4. Save and return PDF ----
    const pdfBytes = await pdf.save()

    const stylistSlug = stylistName.replace(/\s+/g, '_')
    const styleSlug = styleName.replace(/\s+/g, '_')
    const fileName = `Certificate_${stylistSlug}_${styleSlug}.pdf`

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    )
  }
}