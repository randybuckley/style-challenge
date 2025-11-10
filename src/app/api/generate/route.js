import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'fs/promises'
import path from 'path'

const safe = (v) => (v == null ? '' : String(v))

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))

    const stylistName   = safe(body.stylistName)
    const salonName     = safe(body.salonName)
    const styleName     = safe(body.styleName)
    const date          = safe(body.date)
    const certificateId = safe(body.certificateId)

    if (!stylistName || !styleName || !date || !certificateId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)

    const page = pdf.addPage([842, 595]) // A4 landscape
    const { width, height } = page.getSize()
    const margin = 40
    const inset = 10

    const black = rgb(0, 0, 0)
    const dark  = rgb(0.15, 0.15, 0.15)

    const innerLeft   = margin + inset
    const innerRight  = width  - margin - inset
    const innerTop    = height - margin - inset
    const innerBottom = margin + inset

    const asset = (p) => path.join(process.cwd(), 'public', p)

    // ---------- FONTS ----------
    const cursiveFontFile = 'fonts/Parisienne/Parisienne-Regular.ttf'
    const cursiveBytes    = await readFile(asset(cursiveFontFile))

    const serif      = await pdf.embedFont(StandardFonts.TimesRoman)
    const serifBold  = await pdf.embedFont(StandardFonts.TimesRomanBold)
    const cursive    = await pdf.embedFont(cursiveBytes)

    const tw = (text, size, font) => font.widthOfTextAtSize(text, size)
    const cx = (text, size, font) => (width - tw(text, size, font)) / 2

    // ---------- OUTER BORDER ----------
    page.drawRectangle({
      x: margin,
      y: margin,
      width: width - margin * 2,
      height: height - margin * 2,
      borderColor: dark,
      borderWidth: 1.2
    })

    // ---------- INNER FRAME ----------
    page.drawRectangle({
      x: margin + 6,
      y: margin + 6,
      width: width - (margin + 6) * 2,
      height: height - (margin + 6) * 2,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.6
    })

    // ---------- LOGO (TOP LEFT) ----------
    try {
      const buf = await readFile(asset('logo.jpeg'))
      const img = await pdf.embedJpg(buf)
      const sealW = 110
      const sealH = (img.height / img.width) * sealW
      page.drawImage(img, {
        x: innerLeft + 5,
        y: innerTop - sealH - 5,
        width: sealW,
        height: sealH
      })
    } catch {
      // optional
    }

    // ---------- HEADINGS ----------
    const h1 = 'PATRICK CAMERON ACADEMY'
    const h2 = 'CERTIFICATE OF ACHIEVEMENT'

    const h1Y = innerTop - 40
    page.drawText(h1, {
      x: cx(h1, 20, serifBold),
      y: h1Y,
      size: 20,
      font: serifBold,
      color: black
    })

    const ruleY = h1Y - 24
    page.drawLine({
      start: { x: innerLeft, y: ruleY },
      end:   { x: innerRight, y: ruleY },
      thickness: 1,
      color: dark
    })

    const h2Y = ruleY - 40
    page.drawText(h2, {
      x: cx(h2, 32, serifBold),
      y: h2Y,
      size: 32,
      font: serifBold,
      color: black
    })

    // ---------- PATRICK PORTRAIT (BOTTOM LEFT, +25%) ----------
    // Draw this BEFORE the body text so text sits in front.
    try {
      const buf = await readFile(asset('cert/pencil.png'))
      const img = await pdf.embedPng(buf)
      const wP = 215            // slightly larger than original
      const hP = (img.height / img.width) * wP
      page.drawImage(img, {
        x: innerLeft + 5,
        y: innerBottom + 10,
        width: wP,
        height: hP
      })
    } catch {
      // optional
    }

    // ---------- BODY TEXT (TIDIED SPACING) ----------
    const l1  = 'This certifies that'
    const name = stylistName.toUpperCase()
    const l2  = salonName ? `of ${salonName}` : ''
    const l3a = 'has successfully completed the Style Challenge:'
    const l3b = styleName

    let y = h2Y - 105

    // cursive intro
    page.drawText(l1, {
      x: cx(l1, 22, cursive),
      y: y + 16,
      size: 22,
      font: cursive,
      color: black
    })

    y -= 28
    page.drawText(name, {
      x: cx(name, 26, serifBold),
      y,
      size: 26,
      font: serifBold,
      color: black
    })

    y -= 22
    if (l2) {
      page.drawText(l2, {
        x: cx(l2, 14, serif),
        y,
        size: 14,
        font: serif,
        color: black
      })
      y -= 22
    }

    page.drawText(l3a, {
      x: cx(l3a, 20, cursive),
      y,
      size: 20,
      font: cursive,
      color: black
    })

    y -= 22
    page.drawText(l3b, {
      x: cx(l3b, 14, serif),
      y,
      size: 14,
      font: serif,
      color: black
    })

    // ---------- FOOTER RULE ----------
    const footerRuleY = innerBottom + 70
    page.drawLine({
      start: { x: innerLeft, y: footerRuleY },
      end:   { x: innerRight, y: footerRuleY },
      thickness: 1,
      color: dark
    })

    // ---------- SIGNATURE + FOOTER TEXT ----------
    const footerBlockWidth = 260
    const rx = innerRight - footerBlockWidth
    const printedName = 'Patrick Cameron'

    // Signature slightly lower than before
    try {
      const buf = await readFile(asset('cert/signature.png'))
      const img = await pdf.embedPng(buf)
      const sigW = 300
      const sigH = (img.height / img.width) * sigW
      const nameWidth = tw(printedName, 16, serifBold)
      const nameCenterX = rx + nameWidth / 2
      const sigX = nameCenterX - sigW / 2
      const nameBaselineY = footerRuleY - 26
      const sigY = nameBaselineY + 6   // slightly closer to the printed name
      page.drawImage(img, {
        x: sigX,
        y: sigY,
        width: sigW,
        height: sigH
      })
    } catch {
      // optional
    }

    page.drawText(printedName, {
      x: rx,
      y: footerRuleY - 26,
      size: 16,
      font: serifBold,
      color: black
    })

    page.drawText(`Awarded on ${date}`, {
      x: rx,
      y: footerRuleY - 42,
      size: 12,
      font: serif,
      color: black
    })

    page.drawText(`Certificate No. ${certificateId}`, {
      x: rx,
      y: footerRuleY - 58,
      size: 12,
      font: serif,
      color: black
    })

    // ---------- SAVE ----------
    const bytes = await pdf.save()
    const file = `Certificate_${stylistName.replace(/\s+/g, '_')}_${styleName.replace(/\s+/g, '_')}.pdf`

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${file}"`
      }
    })
  } catch (e) {
    console.error('Certificate PDF error:', e)
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    )
  }
}