// src/app/api/review-certification/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sgMail from '@sendgrid/mail'
import crypto from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

const DEFAULT_NOTIFY = 'info@accesslonghair.com'
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const errText = (e, fb = 'Unexpected server error') => {
  try {
    if (!e) return fb
    if (typeof e === 'string') return e
    if (e.message) return e.message
    if (e.error && typeof e.error === 'string') return e.error
    if (e.error && e.error.message) return e.error.message
    return JSON.stringify(e)
  } catch { return fb }
}

/**
 * Normalize any stored path/URL to a fetchable, public Supabase URL:
 *  - https://.../render/image/public/uploads/... -> https://.../storage/v1/object/public/uploads/...
 *  - Strip query strings
 *  - Accepts:
 *      * full storage URL
 *      * full render URL
 *      * "public/uploads/<uid>/file.jpg"
 *      * "uploads/<uid>/file.jpg"
 *      * "/uploads/<uid>/file.jpg"
 *      * "<uid>/file.jpg"  (auto-prefix "uploads/")
 */
function toAbsolutePublic(input) {
  try {
    if (!input) return ''
    let s = String(input).trim()

    // Full URL cases
    if (/^https?:\/\//i.test(s)) {
      s = s.replace('/render/image/public/', '/storage/v1/object/public/')
      s = s.replace(/\?.*$/, '')
      return s
    }

    // Relative/path cases
    s = s.replace(/^\/+/, '')           // remove leading slash
    if (s.startsWith('public/')) s = s.slice('public/'.length) // drop "public/" if present
    if (!s.startsWith('uploads/')) s = `uploads/${s}`          // ensure bucket prefix

    return `${SUPABASE_URL}/storage/v1/object/public/${s}`
  } catch {
    return String(input || '')
  }
}

const imgTag = (src, label) =>
  src
    ? `<div style="margin:10px 0;">
         <div style="font:600 13px system-ui;margin-bottom:6px">${label}</div>
         <img src="${src}" alt="${label}" style="max-width:600px;width:100%;border-radius:10px;border:1px solid #e5e5e5" />
       </div>`
    : `<div style="margin:10px 0;color:#888;font:italic 13px system-ui">${label}: (missing)</div>`

export async function POST(req) {
  try {
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    let body = {}
    try { body = await req.json() } catch {}

    const userId = body?.userId
    const notifyEmail = body?.notifyEmail || DEFAULT_NOTIFY
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    // Get latest images for steps 1..4
    const { data: rows, error: upErr } = await supabase
      .from('uploads')
      .select('step_number, image_url, created_at')
      .eq('user_id', userId)
      .in('step_number', [1, 2, 3, 4])
      .order('created_at', { ascending: false })

    if (upErr) return NextResponse.json({ error: errText(upErr) }, { status: 500 })

    // First (newest) per step; normalize to absolute public URLs
    const latest = {}
    for (const r of rows || []) {
      if (!latest[r.step_number]) latest[r.step_number] = toAbsolutePublic(r.image_url)
    }

    // Reviewer needs stylist email for approve path
    const { data: ures, error: uerr } = await supabase.auth.admin.getUserById(userId)
    if (uerr) return NextResponse.json({ error: errText(uerr) }, { status: 500 })
    const userEmail = ures?.user?.email || ''

    // Token used by approve/reject flows
    const token = crypto.randomUUID().replace(/-/g, '')

    // Approve flows through /api/review/decision (already working in your app)
    const decisionUrl = (action) =>
      `${origin}/api/review/decision?token=${encodeURIComponent(token)}&userEmail=${encodeURIComponent(userEmail)}&action=${encodeURIComponent(action)}`

    // Reject uses your existing shim that persists token → /review/[token]
    const rejectLinkUrl =
      `${origin}/api/review/reject-link?token=${encodeURIComponent(token)}&userEmail=${encodeURIComponent(userEmail)}`

    if (SENDGRID_API_KEY) {
      sgMail.setApiKey(SENDGRID_API_KEY)

      const html = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
          <h2 style="margin:0 0 12px">New Style Challenge submission</h2>
          <p style="margin:0 0 16px">Please review the images below and choose an action.</p>

          ${imgTag(latest[1], 'Step 1')}
          ${imgTag(latest[2], 'Step 2')}
          ${imgTag(latest[3], 'Step 3')}
          ${imgTag(latest[4], 'Finished Look')}

          <div style="margin:18px 0;display:flex;gap:10px">
            <a href="${decisionUrl('approve')}"
               style="background:#28a745;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;display:inline-block">
               Approve
            </a>
            <a href="${rejectLinkUrl}"
               style="background:#c82333;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;display:inline-block">
               Reject
            </a>
          </div>
        </div>
      `

      try {
        await sgMail.send({
          to: notifyEmail,
          from: 'no-reply@accesslonghair.com',
          subject: 'Style Challenge — submission to review',
          html
        })
      } catch (mErr) {
        return NextResponse.json({ mailer: 'failed', token })
      }
    }

    return NextResponse.json({ mailer: 'sent', token })
  } catch (e) {
    return NextResponse.json({ error: errText(e) }, { status: 500 })
  }
}