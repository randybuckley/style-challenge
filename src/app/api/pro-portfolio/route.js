// src/app/api/pro-portfolio/route.js
import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

export const runtime = 'nodejs' // allow fs access

const FETCH_TIMEOUT_MS = 15000
const MAX_IMAGE_DIMENSION = 2000 // px

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function loadImageBytes(url, requestOrigin) {
  try {
    const parsed = new URL(url)

    // Local public asset
    if (parsed.origin === requestOrigin) {
      const relPath = parsed.pathname.startsWith('/')
        ? parsed.pathname.slice(1)
        : parsed.pathname
      const fullPath = path.join(process.cwd(), 'public', relPath)
      const buf = await fs.readFile(fullPath)
      return new Uint8Array(buf)
    }

    // Remote (Supabase, CDN)
    const res = await fetchWithTimeout(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    // Fallback: treat as public asset
    const relPath = url.startsWith('/') ? url.slice(1) : url
    const fullPath = path.join(process.cwd(), 'public', relPath)
    const buf = await fs.readFile(fullPath)
    return new Uint8Array(buf)
  }
}

async function normalizeForPdf(bytes) {
  try {
    const input = Buffer.from(bytes)
    const out = await sharp(input, { failOnError: false })
      .rotate() // apply EXIF orientation
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 92 })
      .toBuffer()

    return new Uint8Array(out)
  } catch (err) {
    console.warn('normalizeForPdf failed, using original bytes', err)
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
    const {
      step1Url,
      step2Url,
      step3Url,
      finalUrl,
      challengeTitle = 'Style Challenge',
      stylistName = '',
    } = await request.json()

    if (!step1Url || !step2Url || !step3Url || !finalUrl) {
      return NextResponse.json(
        { error: 'All four image URLs are required.' },
        { status: 400 }
      )
    }

    const origin = request.nextUrl.origin
    const urls = [step1Url, step2Url, step3Url, finalUrl]

    const rawImages = await Promise.all(urls.map(u => loadImageBytes(u, origin)))
    const images = await Promise.all(rawImages.map(b => normalizeForPdf(b)))

    const [logoRaw, parchmentRaw] = await Promise.all([
      loadImageBytes('/logo.jpeg', origin),
      loadImageBytes('/parchment.jpg', origin),
    ])

    const [logoBytes, parchmentBytes] = await Promise.all([
      normalizeForPdf(logoRaw),
      normalizeForPdf(parchmentRaw),
    ])

    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595, 842]) // A4

    const margin = 40
    const innerWidth = 595 - margin * 2
    const innerHeight = 842 - margin * 2

    const [parchment, logo, ...imgs] = await Promise.all([
      embedJpgOrPng(pdfDoc, parchmentBytes),
      embedJpgOrPng(pdfDoc, logoBytes),
      ...images.map(b => embedJpgOrPng(pdfDoc, b)),
    ])

    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Background
    {
      const scale = Math.max(
        innerWidth / parchment.width,
        innerHeight / parchment.height
      )
      page.drawImage(parchment, {
        x: margin,
        y: margin,
        width: parchment.width * scale,
        height: parchment.height * scale,
      })
    }

    let y = 842 - margin - 20

    // Logo
    {
      const w = 170
      const h = (logo.height / logo.width) * w
      page.drawImage(logo, {
        x: (595 - w) / 2,
        y: y - h,
        width: w,
        height: h,
      })
      y -= h + 20
    }

    // Header
    const header = `${stylistName || 'Your'}’s Portfolio`
    const size = 14
    page.drawText(header, {
      x: (595 - font.widthOfTextAtSize(header, size)) / 2,
      y,
      size,
      font,
      color: rgb(0.15, 0.15, 0.15),
    })
    y -= 20

    if (challengeTitle) {
      page.drawText(challengeTitle, {
        x:
          (595 - font.widthOfTextAtSize(challengeTitle, 11)) /
          2,
        y,
        size: 11,
        font,
        color: rgb(0.25, 0.25, 0.25),
      })
    }

    const pdfBytes = await pdfDoc.save()

    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="portfolio.pdf"',
      },
    })
  } catch (err) {
    console.error('PDF generation failed', err)
    return NextResponse.json(
      { error: 'Failed to generate PDF.' },
      { status: 500 }
    )
  }
}