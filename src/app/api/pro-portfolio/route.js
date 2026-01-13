// src/app/api/pro-portfolio/route.js
import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

export const runtime = 'nodejs' // allow fs access in this route

const FETCH_TIMEOUT_MS = 15000
const MAX_IMAGE_DIMENSION = 2000 // px (downscale large uploads for reliability + smaller PDFs)

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return res
  } finally {
    clearTimeout(timeoutId)
  }
}

async function loadImageBytes(url, requestOrigin) {
  // Handles:
  // - absolute URLs pointing at this app (http://localhost:3000/...)
  // - relative/public paths (/demo/images/...)
  // - true remote URLs (Supabase, CDN) via fetch
  try {
    const parsed = new URL(url)

    // Local public asset served by this same origin
    if (parsed.origin === requestOrigin) {
      const relPath = parsed.pathname.startsWith('/')
        ? parsed.pathname.slice(1)
        : parsed.pathname
      const fullPath = path.join(process.cwd(), 'public', relPath)
      const fileBuffer = await fs.readFile(fullPath)
      return new Uint8Array(fileBuffer)
    }

    // Remote fetch
    const res = await fetchWithTimeout(url, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Failed to fetch image: ${url} (status ${res.status})`)
    }
    const arrBuf = await res.arrayBuffer()
    return new Uint8Array(arrBuf)
  } catch {
    // If URL() fails, treat as local public path
    const relPath = url.startsWith('/') ? url.slice(1) : url
    const fullPath = path.join(process.cwd(), 'public', relPath)
    const fileBuffer = await fs.readFile(fullPath)
    return new Uint8Array(fileBuffer)
  }
}

async function normalizeForPdf(bytes) {
  // Fix EXIF orientation and output a clean JPEG for embedding.
  // Also downscale large images to improve reliability and reduce PDF size.
  try {
    const input = Buffer.from(bytes)
    const img = sharp(input, { failOnError: false })

    const out = await img
      .rotate() // applies EXIF orientation (if present)
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 92 }) // strips metadata, consistent for pdf-lib
      .toBuffer()

    return new Uint8Array(out)
  } catch (e) {
    console.warn('normalizeForPdf failed; using original bytes', e)
    return bytes
  }
}

async function embedJpgOrPng(pdfDoc, bytes) {
  try {
    return await pdfDoc.embedJpg(bytes)
  } catch {
    return await pdfDoc.embedPng(bytes)
  }
}

export async function POST(request) {
  try {
    const body = await request.json()

    const {
      step1Url,
      step2Url,
      step3Url,
      finalUrl,
      challengeTitle = 'Style Challenge',
      stylistName = '',
    } = body || {}

    if (!step1Url || !step2Url || !step3Url || !finalUrl) {
      return NextResponse.json(
        { error: 'All four image URLs are required.' },
        { status: 400 }
      )
    }

    const origin = request.nextUrl.origin

    // Load and normalize the four main images
    const mainUrls = [step1Url, step2Url, step3Url, finalUrl]

    const rawImageBuffers = await Promise.all(
      mainUrls.map(async (u) => {
        try {
          return await loadImageBytes(u, origin)
        } catch (e) {
          console.warn('loadImageBytes failed:', u, e)
          return null
        }
      })
    )

    const imageBuffers = await Promise.all(
      rawImageBuffers.map(async (b) => {
        if (!b) return null
        try {
          return await normalizeForPdf(b)
        } catch (e) {
          console.warn('normalizeForPdf failed:', e)
          return b
        }
      })
    )

    // Load logo and parchment from public folder
    const [logoBytesRaw, parchmentBytesRaw] = await Promise.all([
      loadImageBytes('/logo.jpeg', origin),
      loadImageBytes('/parchment.jpg', origin),
    ])

    // Normalize logo/parchment defensively too (harmless)
    const [logoBytes, parchmentBytes] = await Promise.all([
      normalizeForPdf(logoBytesRaw),
      normalizeForPdf(parchmentBytesRaw),
    ])

    // Create PDF
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage()

    // A4-ish in points
    const width = 595
    const height = 842
    page.setSize(width, height)

    const margin = 40
    const innerWidth = width - margin * 2
    const innerHeight = height - margin * 2

    // Embed parchment + logo
    const [parchmentImage, logoImage] = await Promise.all([
      embedJpgOrPng(pdfDoc, parchmentBytes),
      embedJpgOrPng(pdfDoc, logoBytes),
    ])

    // Embed user images (fail-soft: keep nulls)
    const embeddedImages = await Promise.all(
      imageBuffers.map(async (buf, idx) => {
        if (!buf) return null
        try {
          return await embedJpgOrPng(pdfDoc, buf)
        } catch (e) {
          console.warn(`embed image failed (index ${idx})`, e)
          return null
        }
      })
    )

    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Draw parchment background inside the margins
    {
      const pW = parchmentImage.width
      const pH = parchmentImage.height
      const scale = Math.max(innerWidth / pW, innerHeight / pH)
      const drawW = pW * scale
      const drawH = pH * scale
      const x = margin + (innerWidth - drawW) / 2
      const y = margin + (innerHeight - drawH) / 2

      page.drawImage(parchmentImage, {
        x,
        y,
        width: drawW,
        height: drawH,
      })
    }

    // Vertical layout positions
    let currentY = height - margin - 10

    // Logo at top centre in a soft translucent card with subtle shadow
    {
      const targetWidth = 170
      const scale = targetWidth / logoImage.width
      const logoW = targetWidth
      const logoH = logoImage.height * scale
      const platePadding = 8
      const plateW = logoW + platePadding * 2
      const plateH = logoH + platePadding * 2
      const plateX = (width - plateW) / 2
      const plateY = currentY - plateH

      // Shadow
      page.drawRectangle({
        x: plateX + 3,
        y: plateY - 3,
        width: plateW,
        height: plateH,
        color: rgb(0, 0, 0),
        opacity: 0.18,
      })

      // Plate
      page.drawRectangle({
        x: plateX,
        y: plateY,
        width: plateW,
        height: plateH,
        color: rgb(1, 1, 1),
        opacity: 0.88,
        borderColor: rgb(0.85, 0.85, 0.87),
        borderWidth: 0.7,
      })

      const logoX = plateX + platePadding
      const logoY = plateY + platePadding

      page.drawImage(logoImage, {
        x: logoX,
        y: logoY,
        width: logoW,
        height: logoH,
      })

      currentY = plateY - 24
    }

    // Header text: "[Name]'s Portfolio" (use straight apostrophe for font safety)
    const displayName = stylistName || 'Your'
    const headerText = `${displayName}'s Portfolio`
    const headerFontSize = 14
    const headerWidth = font.widthOfTextAtSize(headerText, headerFontSize)
    const headerX = (width - headerWidth) / 2
    const headerY = currentY

    page.drawText(headerText, {
      x: headerX,
      y: headerY,
      size: headerFontSize,
      color: rgb(0.12, 0.12, 0.12),
    })

    currentY = headerY - 16

    // Challenge title beneath
    if (challengeTitle) {
      const subFontSize = 11
      const subText = challengeTitle
      const subWidth = font.widthOfTextAtSize(subText, subFontSize)
      const subX = (width - subWidth) / 2
      const subY = currentY

      page.drawText(subText, {
        x: subX,
        y: subY,
        size: subFontSize,
        color: rgb(0.18, 0.18, 0.18),
      })

      currentY = subY - 26
    }

    // Image layout:
    // Row 1: Step 1–3 cards (smaller).
    // Row 2: Finished Look — larger hero card.

    const imagesTopY = currentY
    const imagesBottomY = margin + 28
    const imagesHeight = imagesTopY - imagesBottomY

    const rowGapY = 20

    // Top row ~36%, bottom hero row ~64%
    const topRowHeight = (imagesHeight - rowGapY) * 0.36
    const bottomRowHeight = imagesHeight - rowGapY - topRowHeight

    const [step1Img, step2Img, step3Img, finalImg] = embeddedImages

    function drawMissingCard(label, x, y, cardWidth, cardHeight) {
      const shadowOffset = 3
      page.drawRectangle({
        x: x + shadowOffset,
        y: y - shadowOffset,
        width: cardWidth,
        height: cardHeight,
        color: rgb(0, 0, 0),
        opacity: 0.12,
      })
      page.drawRectangle({
        x,
        y,
        width: cardWidth,
        height: cardHeight,
        color: rgb(1, 1, 1),
        opacity: 0.82,
        borderColor: rgb(0.9, 0.9, 0.92),
        borderWidth: 0.7,
        borderRadius: 10,
      })

      const t1 = label
      const t2 = 'Missing image'
      const s1 = 10
      const s2 = 10
      const t1w = font.widthOfTextAtSize(t1, s1)
      const t2w = font.widthOfTextAtSize(t2, s2)

      page.drawText(t1, {
        x: x + (cardWidth - t1w) / 2,
        y: y + cardHeight / 2 + 6,
        size: s1,
        color: rgb(0.25, 0.25, 0.27),
      })
      page.drawText(t2, {
        x: x + (cardWidth - t2w) / 2,
        y: y + cardHeight / 2 - 10,
        size: s2,
        color: rgb(0.35, 0.35, 0.37),
      })
    }

    // Helper: draw a soft card with image + label
    function drawImageCard(img, label, x, y, cardWidth, cardHeight) {
      if (!img) {
        drawMissingCard(label, x, y, cardWidth, cardHeight)
        return
      }

      const shadowOffset = 3
      const radius = 10

      // Soft shadow
      page.drawRectangle({
        x: x + shadowOffset,
        y: y - shadowOffset,
        width: cardWidth,
        height: cardHeight,
        color: rgb(0, 0, 0),
        opacity: 0.16,
      })

      // Card background
      page.drawRectangle({
        x,
        y,
        width: cardWidth,
        height: cardHeight,
        color: rgb(1, 1, 1),
        opacity: 0.86,
        borderColor: rgb(0.9, 0.9, 0.92),
        borderWidth: 0.7,
        borderRadius: radius,
      })

      // Inner area for image (leave room at bottom for label)
      const padding = 10
      const labelAreaHeight = 18
      const imgAreaX = x + padding
      const imgAreaY = y + padding + labelAreaHeight
      const imgAreaWidth = cardWidth - padding * 2
      const imgAreaHeight = cardHeight - padding * 2 - labelAreaHeight

      const imgW = img.width
      const imgH = img.height
      const scale = Math.min(imgAreaWidth / imgW, imgAreaHeight / imgH)
      const drawW = imgW * scale
      const drawH = imgH * scale
      const imgX = imgAreaX + (imgAreaWidth - drawW) / 2
      const imgY = imgAreaY + (imgAreaHeight - drawH) / 2

      page.drawImage(img, {
        x: imgX,
        y: imgY,
        width: drawW,
        height: drawH,
      })

      // Label centred at the bottom
      const labelFontSize = 9
      const labelWidth = font.widthOfTextAtSize(label, labelFontSize)
      const labelX = x + (cardWidth - labelWidth) / 2
      const labelY = y + 6

      page.drawText(label, {
        x: labelX,
        y: labelY,
        size: labelFontSize,
        color: rgb(0.25, 0.25, 0.27),
      })
    }

    // --- Top row: Steps 1–3 ---
    const topGapX = 12
    const topCardWidth = (innerWidth - topGapX * 2) / 3
    const topCardHeight = topRowHeight

    const topRowBottomY = imagesBottomY + bottomRowHeight + rowGapY
    const topRowY = topRowBottomY

    const step1X = margin
    const step2X = margin + topCardWidth + topGapX
    const step3X = margin + topCardWidth * 2 + topGapX * 2

    drawImageCard(step1Img, 'Step 1', step1X, topRowY, topCardWidth, topCardHeight)
    drawImageCard(step2Img, 'Step 2', step2X, topRowY, topCardWidth, topCardHeight)
    drawImageCard(step3Img, 'Step 3', step3X, topRowY, topCardWidth, topCardHeight)

    // --- Bottom row: Finished Look (hero) ---
    const bottomCardWidth = innerWidth * 0.8
    const bottomCardHeight = bottomRowHeight
    const bottomX = margin + (innerWidth - bottomCardWidth) / 2
    const bottomY = imagesBottomY

    drawImageCard(finalImg, 'Finished Look', bottomX, bottomY, bottomCardWidth, bottomCardHeight)

    const pdfBytes = await pdfDoc.save()

    const filename =
      (challengeTitle || 'patrick-cameron-portfolio')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') + '.pdf'

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Error generating portfolio PDF:', err)
    return NextResponse.json(
      { error: 'Failed to generate portfolio PDF.' },
      { status: 500 }
    )
  }
}