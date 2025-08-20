import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
const FROM = process.env.MAIL_FROM || ''
const ADMIN = process.env.REVIEW_ADMIN_EMAIL || ''

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE
  if (!url || !key) {
    throw new Error('Missing Supabase admin env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

export async function PUT(req) {
  try {
    const { token } = await req.json()
    if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 })

    const reviewUrl = `${SITE_URL}/api/review-certification?token=${encodeURIComponent(token)}`
    const resend = getResend()

    if (resend && FROM && ADMIN) {
      const { error } = await resend.emails.send({
        from: FROM,
        to: ADMIN,
        subject: 'New Style Challenge submission to review',
        html: `
          <p>A new submission is ready for review.</p>
          <p><a href="${reviewUrl}">Open the review page</a></p>
          <p>If the link is not clickable, paste this into your browser:<br>${reviewUrl}</p>
        `
      })
      if (error) console.error('Resend error:', error)
    } else {
      console.warn('Email disabled: missing RESEND_API_KEY/MAIL_FROM/REVIEW_ADMIN_EMAIL')
    }

    return NextResponse.json({ ok: true, reviewUrl })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')
    if (!token) return new Response('Missing token', { status: 400 })

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('submissions')
      .select('first_name, second_name, salon_name, step1_url, step2_url, step3_url, finished_url, status')
      .eq('review_token', token)
      .single()

    if (error || !data) return new Response('Invalid or expired token.', { status: 404 })

    const name = [data.first_name || '', data.second_name || ''].join(' ').trim() || 'Candidate'

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Review submission</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#0b0b0b; color:#f2f2f2; padding:20px; }
    .wrap { max-width: 900px; margin: 0 auto; border:1px solid #333; border-radius:12px; padding:18px; background:#141414; }
    h1,h2 { margin: 8px 0; }
    .grid { display:flex; flex-wrap:wrap; gap:12px; }
    .card { background:#1b1b1b; border:1px solid #333; border-radius:10px; padding:10px; width:260px; }
    .card img { width:100%; height:auto; border-radius:6px; border:1px solid #444; }
    form { margin-top:16px; display:grid; gap:10px; }
    textarea, select, input[type=text] { width:100%; background:#1b1b1b; color:#f2f2f2; border:1px solid #333; border-radius:8px; padding:8px; }
    button { background:#28a745; color:#fff; border:none; border-radius:8px; padding:10px 16px; font-weight:700; cursor:pointer; }
    .danger { background:#c0392b; }
    label { font-size: 12px; color:#bbb; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Review: ${name}</h1>
    ${data.salon_name ? `<p>Salon: ${data.salon_name}</p>` : ''}
    <div class="grid">
      ${[1,2,3].map(s => {
        const url = data['step'+s+'_url']
        return `<div class="card"><h3>Step ${s}</h3>${url ? `<img src="${url}" />` : '<p>No upload</p>'}</div>`
      }).join('')}
    </div>
    <h2>Finished Look</h2>
    <div class="card" style="width:min(720px, 100%)">
      ${data.finished_url ? `<img src="${data.finished_url}" />` : '<p>No finished look</p>'}
    </div>

    <form method="post">
      <input type="hidden" name="token" value="${token}" />
      <div>
        <label>Decision</label>
        <select name="decision" required>
          <option value="">Select…</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
        </select>
      </div>
      <div>
        <label>Reason (if fail)</label>
        <input type="text" name="reason" placeholder="e.g., Lighting / balance / shape" />
      </div>
      <div>
        <label>Comments (optional)</label>
        <textarea name="comments" rows="5" placeholder="Feedback for the candidate"></textarea>
      </div>
      <div style="display:flex; gap:10px;">
        <button type="submit">Submit decision</button>
        <button type="submit" name="decision" value="fail" class="danger">Quick Fail</button>
      </div>
    </form>
  </div>
</body>
</html>`
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  } catch (e) {
    console.error(e)
    return new Response('Server error', { status: 500 })
  }
}

export async function POST(req) {
  try {
    const form = await req.formData()
    const token = form.get('token')
    const decision = (form.get('decision') || '').toString()
    const reason = (form.get('reason') || '').toString()
    const comments = (form.get('comments') || '').toString()

    if (!token || !decision) {
      return new Response('Missing token/decision', { status: 400 })
    }

    const supabase = getAdminClient()

    const { data: sub, error } = await supabase
      .from('submissions')
      .select('id, email, first_name, second_name')
      .eq('review_token', token)
      .single()

    if (error || !sub) return new Response('Invalid token', { status: 404 })

    const status = decision === 'pass' ? 'approved' : 'rejected'
    await supabase
      .from('submissions')
      .update({
        status,
        review_reason: reason || null,
        review_comments: comments || null,
        decided_at: new Date().toISOString()
      })
      .eq('review_token', token)

    const resend = getResend()
    const to = sub.email
    if (resend && FROM && to) {
      const name = [sub.first_name || '', sub.second_name || ''].join(' ').trim() || 'Stylist'
      if (status === 'approved') {
        await resend.emails.send({
          from: FROM,
          to,
          subject: 'Congratulations — You are Patrick Cameron Certified',
          html: `
            <p>Hi ${name},</p>
            <p>Congratulations! Your Style Challenge portfolio has been approved.</p>
            <p>You can download your enhanced, certified PDF from your portfolio page:</p>
            <p><a href="${SITE_URL}/challenge/portfolio">Open your portfolio</a></p>
            <p>— The Patrick Cameron Team</p>
          `
        })
      } else {
        await resend.emails.send({
          from: FROM,
          to,
          subject: 'Style Challenge Review — Please try again',
          html: `
            <p>Hi ${name},</p>
            <p>Thank you for your submission. We’d like you to revise and resubmit.</p>
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            ${comments ? `<p><strong>Comments:</strong><br>${comments.replace(/\n/g, '<br>')}</p>` : ''}
            <p>You can update your portfolio here:</p>
            <p><a href="${SITE_URL}/challenge/portfolio">Open your portfolio</a></p>
            <p>— The Patrick Cameron Team</p>
          `
        })
      }
    } else {
      console.warn('Candidate email skipped (missing RESEND_API_KEY/MAIL_FROM or candidate email)')
    }

    return new Response(
      `<!doctype html><meta charset="utf-8" />
       <body style="font-family:system-ui;background:#111;color:#fff;padding:24px">
         <h1>Decision saved</h1>
         <p>Status: ${status}</p>
         <p>You can now close this tab.</p>
       </body>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } }
    )
  } catch (e) {
    console.error(e)
    return new Response('Server error', { status: 500 })
  }
}
