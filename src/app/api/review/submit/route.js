// src/app/api/review/submit/route.js
import { NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'
import crypto from 'crypto'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const PUBLIC_UPLOADS_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/uploads/`

function toPublicUrl(urlOrPath = '') {
  if (!urlOrPath) return ''
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath
  // handle things like "7515.../step1-...jpg"
  return PUBLIC_UPLOADS_PREFIX.replace(/\/+$/, '/') + urlOrPath.replace(/^\/+/, '')
}

// Convert Supabase object URL to render endpoint (JPEG, sane size) for emails
function toRenderedJpeg(url) {
  try {
    const u = new URL(url)
    if (u.pathname.includes('/storage/v1/object/public/')) {
      const pathAfterPublic = u.pathname.split('/storage/v1/object/public/')[1]
      const render = new URL(u.origin + '/storage/v1/render/image/public/' + pathAfterPublic)
      render.searchParams.set('width', '1200')
      render.searchParams.set('quality', '85')
      render.searchParams.set('resize', 'contain')
      render.searchParams.set('format', 'jpeg')
      return render.toString()
    }
  } catch {}
  return url
}

async function fetchAsBase64(url) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  const mime = (res.headers.get('content-type') || '').split(';')[0].trim() || 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  return { base64: buf.toString('base64'), mime }
}

function escapeHtml(s = '') {
  return s.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&gt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
  )
}

export async function POST(req) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
    const {
      userId,
      userEmail,
      firstName = '',
      secondName = '',
      images = {} // {1:urlOrPath,2:urlOrPath,3:urlOrPath,4:urlOrPath}
    } = (await req.json()) || {}

    if (!userId || !userEmail) {
      return NextResponse.json(
        { ok: false, error: 'Missing userId or userEmail' },
        { status: 400 }
      )
    }

    // Normalize -> absolute URLs -> rendered JPEG
    const normalized = {}
    for (const n of [1, 2, 3, 4]) {
      const src = images[n]
      if (!src) continue
      const full = toRenderedJpeg(toPublicUrl(src))
      normalized[n] = full
    }

    // Prepare inline attachments
    const cids = {}
    const attachments = []
    for (const n of [1, 2, 3, 4]) {
      const url = normalized[n]
      if (!url) continue
      const { base64, mime } = await fetchAsBase64(url)
      const cid = n === 4 ? 'finished' : `step${n}`
      cids[n] = cid
      attachments.push({
        content: base64,
        filename: `${cid}.jpg`,
        type: mime || 'image/jpeg',
        disposition: 'inline',
        content_id: cid
      })
    }

    // Inline logo
    let logoCid = null
    try {
      const { base64, mime } = await fetchAsBase64(`${baseUrl}/logo.jpeg`)
      logoCid = 'logo'
      attachments.push({
        content: base64,
        filename: 'logo.jpg',
        type: mime || 'image/jpeg',
        disposition: 'inline',
        content_id: logoCid
      })
    } catch {}

    // Token for reviewer actions
    const token = crypto.randomUUID().replace(/-/g, '')
    const approveUrl = `${baseUrl}/api/review/decision?token=${token}&action=approve&ue=${encodeURIComponent(
      userEmail
    )}`
    const rejectUrl = `${baseUrl}/review/${token}`

    // 🔹 Store the token in Supabase so later routes can find it
    const { error: tokenError } = await supabaseAdmin.from('review_tokens').insert({
      token,
      user_id: userId,
      user_email: userEmail,
      first_name: firstName || null,
      second_name: secondName || null
      // add salon_name here if you later include it in the request body
      // salon_name: salonName || null,
    })

    if (tokenError) {
      console.error('review_tokens insert error', tokenError)
      return NextResponse.json(
        { ok: false, error: 'Failed to create review token' },
        { status: 500 }
      )
    }

    const stylist = [firstName, secondName].filter(Boolean).join(' ') || userEmail

    const imgBlock = [1, 2, 3, 4]
      .map(n => {
        const label = n === 4 ? 'Finished Look' : `Step ${n}`
        const cid = cids[n]
        return cid
          ? `
          <div style="margin:12px 0;">
            <div style="font-size:13px;color:#666;margin-bottom:6px;">${escapeHtml(
              label
            )}</div>
            <img src="cid:${cid}" alt="${escapeHtml(
              label
            )}"
                 style="display:block;border-radius:10px;border:1px solid #eee;max-width:480px;width:100%;height:auto;">
          </div>`
          : ''
      })
      .join('')

    const logoImg = logoCid
      ? `<img src="cid:${logoCid}" alt="Style Challenge"
              style="width:140px;height:auto;border-radius:12px;display:block;margin:0 auto 10px;">`
      : ''

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.45;">
        <div style="text-align:center;margin:6px 0 12px;">${logoImg}</div>
        <h2 style="text-align:center;margin:0 0 10px;">New Style Challenge submission</h2>
        <p style="text-align:center;margin:0 0 14px;">
          Stylist: <strong>${escapeHtml(stylist)}</strong><br>
          Email: <a href="mailto:${escapeHtml(userEmail)}">${escapeHtml(userEmail)}</a>
        </p>
        ${imgBlock}
        <div style="margin-top:16px;">
          <a href="${approveUrl}"
             style="display:inline-block;background:#28a745;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;margin-right:10px;">
             Approve
          </a>
          <a href="${rejectUrl}"
             style="display:inline-block;background:#dc3545;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">
             Reject
          </a>
        </div>
        <p style="margin-top:18px">All the best,<br>Patrick</p>
        ${logoImg}
      </div>
    `

    await sgMail.send({
      to: process.env.REVIEW_RECIPIENT || 'info@accesslonghair.com',
      from: process.env.EMAIL_FROM || process.env.SENDGRID_FROM,
      replyTo: userEmail,
      subject: `Style Challenge submission — ${stylist}`,
      html,
      attachments // <- forces multipart/related with inline CIDs
    })

    return NextResponse.json({ ok: true, token })
  } catch (err) {
    console.error('/api/review/submit', err)
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    )
  }
}