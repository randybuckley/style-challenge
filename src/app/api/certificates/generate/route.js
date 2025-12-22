// src/app/api/certificates/generate/route.js
import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { readFile } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic' // avoid any caching issues

const safe = (v) => (v == null ? '' : String(v))

function titleFromSlug(slug) {
  if (!slug) return 'Style Challenge'
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))

    const stylistName   = safe(body.stylistName)
    const salonName     = safe(body.salonName)
    const styleName     = safe(body.styleName)
    const challengeSlug = safe(body.challengeSlug)
    const date          = safe(body.date)
    const certificateId = safe(body.certificateId)

    if (!stylistName || !date || !certificateId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Missing required fields (stylistName, date, certificateId).',
        },
        { status: 400 }
      )
    }

    const challengeTitle =
      styleName || titleFromSlug(challengeSlug) || 'Style Challenge'

    // Helper to resolve assets under /public/cert
    const asset = (p) => path.join(process.cwd(), 'public', 'cert', p)

    // ---- 1. Create PDF sized to the certificate artwork ----
    const certPngBytes = await readFile(asset('certificate.png'))
    const pdf = await PDFDocument.create()
    const certImage = await pdf.embedPng(certPngBytes)

    const page = pdf.addPage([certImage.width, certImage.height])
    const { width, height } = page.getSize()

    // Background
    page.drawImage(certImage, {
      x: 0,
      y: 0,
      width,
      height,
    })

    const black = rgb(0, 0, 0)
    const serif = await pdf.embedFont(StandardFonts.TimesRoman)
    const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold)

    const textWidth = (text, size, font) =>
      font.widthOfTextAtSize(text, size)
    const centerX = (text, size, font) =>
      (width - textWidth(text, size, font)) / 2

    // ---- 2. Body text ----
    const line1 = 'This certifies that'
    const nameLine = stylistName.toUpperCase()
    const line2 = salonName ? `of ${salonName}` : ''
    const line3 = 'has successfully completed the'
    const line4 = challengeTitle

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
      x: centerX(line4, 22, serifBold),
      y,
      size: 22,
      font: serifBold,
      color: black,
    })

    // ---- 3. Footer ----
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

    // ---- 4. Return PDF ----
    const pdfBytes = await pdf.save()

    const stylistSlug = stylistName.replace(/\s+/g, '_')
    const challengeSlugSafe = challengeTitle.replace(/\s+/g, '_')
    const fileName = `Certificate_${stylistSlug}_${challengeSlugSafe}.pdf`

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