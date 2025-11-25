// src/app/api/generate/route.js
import { NextResponse } from 'next/server'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

const safe = (v) => (v == null ? '' : String(v))

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))

    const stylistName   = safe(body.stylistName)   // required
    const styleName     = safe(body.styleName)     // required
    const date          = safe(body.date)          // required
    const certificateId = safe(body.certificateId) // required
    // salonName intentionally unused for now

    if (!stylistName || !styleName || !date || !certificateId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields.' },
        { status: 400 }
      )
    }

    const certAsset = (p) => path.join(process.cwd(), 'public', 'cert', p)
    const fontAsset = (p) => path.join(process.cwd(), 'public', 'fonts', p)

    // --- Background artwork ---
    const certPngBytes = await readFile(certAsset('certificate.png'))

    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)

    const certImage = await pdf.embedPng(certPngBytes)
    const page = pdf.addPage([certImage.width, certImage.height])
    const { width, height } = page.getSize()

    page.drawImage(certImage, {
      x: 0,
      y: 0,
      width,
      height,
    })

    // --- Fonts (Montserrat) ---
    const montserratBytes = await readFile(
      fontAsset('Montserrat-VariableFont_wght.ttf')
    )
    const montserratBoldBytes = await readFile(
      fontAsset('Montserrat-Bold.ttf')
    )

    const montserrat = await pdf.embedFont(montserratBytes)
    const montserratBold = await pdf.embedFont(montserratBoldBytes)

    const baseFont = montserrat
    const baseBold = montserratBold
    const colour = rgb(0, 0, 0)

    const textWidth = (text, size, font) =>
      font.widthOfTextAtSize(text, size)

    const centerX = (text, size, font) =>
      (width - textWidth(text, size, font)) / 2

    // Points per cm
    const CM = 28.3465

    // --- Sizes ---
    const titleSize  = height * 0.025    // “This certifies that”
    const nameSize   = height * 0.035    // STYLIST NAME
    const bodySize   = height * 0.020    // body lines
    const footerSize = height * 0.015    // footer block

    const lineGap = bodySize * 1.4

    // =====================================================
    // 1) MAIN CENTRE BLOCK — “This certifies that…”
    // =====================================================
    const line1 = 'This certifies that'
    const nameLine = stylistName.toUpperCase()
    const line3 = 'has successfully completed'
    const line4 = styleName

    const lines = [
      { text: line1,    size: titleSize, font: baseFont },
      { text: nameLine, size: nameSize,  font: baseBold },
      { text: line3,    size: bodySize,  font: baseFont },
      { text: line4,    size: bodySize,  font: baseBold },
    ]

    const totalBlockHeight =
      lines.reduce((sum, l) => sum + l.size, 0) +
      lineGap * (lines.length - 1)

    // Existing overall block position (do not change)
    const blockCentreY = height * 0.42 - 22 * CM
    let y = blockCentreY + totalBlockHeight / 2

    for (const line of lines) {
      // Lift the two middle lines ("has successfully completed" and styleName)
      // by 1 cm relative to the rest of the block.
      let yAdjusted = y
      if (line.text === line3 || line.text === line4) {
        yAdjusted += 1 * CM
      }

      page.drawText(line.text, {
        x: centerX(line.text, line.size, line.font),
        y: yAdjusted,
        size: line.size,
        font: line.font,
        color: colour,
      })

      y -= line.size + lineGap
    }

    // =====================================================
    // 2) BOTTOM-LEFT FOOTER BLOCK — Awarded / Certificate
    // =====================================================
    const footerX = width * 0.16
    const footerBaseY = height * 0.14 - 6 * CM // existing offset

    const footerLines = [
      `Awarded: ${date}`,
      `Certificate: ${certificateId}`,
    ]

    let fy = footerBaseY + footerLines.length * (footerSize + 2)

    for (const text of footerLines) {
      page.drawText(text, {
        x: footerX,
        y: fy,
        size: footerSize,
        font: baseFont,
        color: colour,
      })
      fy -= footerSize + 2
    }

    // --- Save & return ---
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
    console.error('CERTIFICATE ROUTE ERROR:', e)
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    )
  }
}