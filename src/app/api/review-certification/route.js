// Route handler for certification review email + decision
// NOTE: Do NOT add 'use server' in this file.

import { supabaseAdmin } from '../../../lib/supabaseAdmin'

// Next config for route handlers
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getBaseUrl() {
  const envUrl =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  return envUrl || 'http://localhost:3000'
}

function esc(s) {
  return (s || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]))
}

// ── ENV VARS ──────────────────────────────────────────────────────────────────
const SENDGRID_KEY = process.env.SENDGRID_API_KEY
const FROM_EMAIL =
  process.env.SENDER_EMAIL || process.env.MAIL_FROM_EMAIL || process.env.EMAIL_FROM || 'info@accesslonghair.com'
const FROM_NAME = process.env.MAIL_FROM_NAME || 'Patrick Cameron'
const REVIEW_TO =
  process.env.REVIEWER_EMAIL || process.env.REVIEW_TO || process.env.REVIEW_RECIPIENT || process.env.REVIEW_ADMIN_EMAIL

async function sendEmail({ to, subject, text, html }) {
  if (!SENDGRID_KEY) throw new Error('Missing SENDGRID_API_KEY')
  if (!FROM_EMAIL) throw new Error('Missing sender email (SENDER_EMAIL/MAIL_FROM_EMAIL/EMAIL_FROM)')

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [
        { type: 'text/plain', value: text || '' },
        { type: 'text/html', value: html || '' },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`SendGrid error ${res.status}: ${body}`)
  }
}

/**
 * GET /api/review-certification?token=...&details=1
 * If details=1, returns the submission JSON (used by /review).
 */
export async function GET(req) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const wantDetails = url.searchParams.get('details') === '1'

  if (wantDetails && token) {
    const { data: sub, error } = await supabaseAdmin
      .from('submissions')
      .select('id, user_id, email, first_name, second_name, salon_name, step1_url, step2_url, step3_url, finished_url, status')
      .eq('review_token', token)
      .single()
    if (error || !sub) {
      return Response.json({ ok: false, error: 'Submission not found' }, { status: 404 })
    }
    return Response.json({ ok: true, submission: sub }, { status: 200 })
  }

  return Response.json(
    { ok: true, message: 'Use PUT to notify reviewer or POST to record a decision.' },
    { status: 200 }
  )
}

/**
 * PUT /api/review-certification
 * Body: { token: string }
 * Looks up the submission by token and emails the reviewer with inline images and Approve/Reject buttons.
 */
export async function PUT(req) {
  try {
    const { token } = await req.json()
    if (!token) {
      return Response.json({ error: 'Missing token' }, { status: 400 })
    }
    if (!REVIEW_TO) {
      return Response.json({ error: 'Missing reviewer email (REVIEWER_EMAIL/REVIEW_TO)' }, { status: 500 })
    }

    const { data: sub, error } = await supabaseAdmin
      .from('submissions')
      .select('id, user_id, email, first_name, second_name, salon_name, step1_url, step2_url, step3_url, finished_url, status')
      .eq('review_token', token)
      .single()

    if (error || !sub) {
      return Response.json({ error: 'Submission not found' }, { status: 404 })
    }

    const site = getBaseUrl()
    const reviewUrl  = `${site}/review?token=${encodeURIComponent(token)}`
    const approveUrl = `${site}/review?token=${encodeURIComponent(token)}&action=approve`
    const rejectUrl  = `${site}/review?token=${encodeURIComponent(token)}&action=reject`

    const name = [sub.first_name, sub.second_name].filter(Boolean).join(' ') || '(unknown)'
    const salon = sub.salon_name ? ` — ${esc(sub.salon_name)}` : ''
    const subject = `New certification submission: ${name}`

    const plain = [
      'A new submission is ready for review.',
      '',
      `Name: ${name}`,
      `Email: ${sub.email || '(unknown)'}`,
      `Salon: ${sub.salon_name || '(n/a)'}`,
      '',
      `Finished: ${sub.finished_url || '(none)'}`,
      `Step 1: ${sub.step1_url || '(none)'}`,
      `Step 2: ${sub.step2_url || '(none)'}`,
      `Step 3: ${sub.step3_url || '(none)'}`,
      '',
      `Open Review: ${reviewUrl}`,
      `Approve: ${approveUrl}`,
      `Reject: ${rejectUrl}`,
    ].join('\n')

    // Simple, email-client-friendly HTML (tables & inline widths)
    const step = (n, url) => {
      const title = `Step ${n}`
      if (!url) return `<td align="center" style="padding:6px;color:#666">${title}<br/><span style="font-size:12px;color:#999">No upload</span></td>`
      return `
        <td align="center" style="padding:6px">
          <div style="font-weight:600;margin:0 0 4px">${title}</div>
          <img src="${url}" alt="${title}" width="180" style="display:block;border:1px solid #ddd;border-radius:8px" />
        </td>`
    }

    const finished = sub.finished_url
      ? `<img src="${sub.finished_url}" alt="Finished Look" width="600" style="display:block;border:1px solid #ddd;border-radius:10px" />`
      : `<div style="color:#777;font-size:13px">No finished look uploaded</div>`

    const btn = (href, label, bg) => `
      <a href="${href}"
         style="display:inline-block;background:${bg};color:#fff;text-decoration:none;
                padding:10px 14px;border-radius:8px;font-weight:700;margin-right:8px">
        ${label}
      </a>`

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
        <h3 style="margin:0 0 8px">New certification submission</h3>
        <p style="margin:0 0 10px">
          <strong>${esc(name)}</strong>${salon}<br/>
          ${esc(sub.email || '')}
        </p>

        <!-- Steps 1–3 -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:0 0 12px">
          <tr>
            ${step(1, sub.step1_url)}
            ${step(2, sub.step2_url)}
            ${step(3, sub.step3_url)}
          </tr>
        </table>

        <!-- Finished Look -->
        <div style="margin:12px 0">
          <div style="font-weight:600;margin:0 0 6px">Finished Look</div>
          ${finished}
        </div>

        <!-- Actions -->
        <div style="margin-top:14px">
          ${btn(reviewUrl,  'Open Review', '#0b5ed7')}
          ${btn(approveUrl, 'Approve',      '#28a745')}
          ${btn(rejectUrl,  'Reject',       '#6c757d')}
        </div>

        <p style="color:#777;font-size:12px;margin-top:10px">
          Tip: some email clients block images by default — click “Display images” if you don’t see them.
        </p>
      </div>
    `

    await sendEmail({ to: REVIEW_TO, subject, text: plain, html })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

/**
 * POST /api/review-certification
 * Body: { token: string, decision: 'approve'|'reject', reason?: string, comments?: string }
 * Updates the submission and emails the candidate.
 */
export async function POST(req) {
  try {
    const { token, decision, reason, comments } = await req.json()
    if (!token || !decision) {
      return Response.json({ error: 'Missing token or decision' }, { status: 400 })
    }
    if (!['approve', 'reject'].includes(decision)) {
      return Response.json({ error: 'Invalid decision' }, { status: 400 })
    }

    const { data: sub, error } = await supabaseAdmin
      .from('submissions')
      .select('id, email, first_name, second_name')
      .eq('review_token', token)
      .single()

    if (error || !sub) {
      return Response.json({ error: 'Submission not found' }, { status: 404 })
    }

    const newStatus = decision === 'approve' ? 'approved' : 'rejected'
    await supabaseAdmin
      .from('submissions')
      .update({ status: newStatus, reviewed_at: new Date().toISOString(), reason, comments })
      .eq('id', sub.id)

    // notify candidate
    if (sub.email) {
      const subject =
        decision === 'approve'
          ? 'Congratulations — You are Patrick Cameron Certified!'
          : 'Certification Review — Please Try Again'

      const site = getBaseUrl()
      const portfolio = `${site}/challenge/portfolio`

      const text =
        decision === 'approve'
          ? `Congratulations! Your submission has been approved.\n\nYou can download your enhanced PDF from your portfolio:\n${portfolio}`
          : `Thanks for submitting. After review, we’d like you to try again.\n${
              reason ? `Reason: ${reason}\n` : ''
            }${comments ? `Comments: ${comments}\n` : ''}\nVisit your portfolio: ${portfolio}`

      const html =
        decision === 'approve'
          ? `<p>Congratulations! Your submission has been <strong>approved</strong>.</p><p>You can download your enhanced PDF from your <a href="${portfolio}">portfolio</a>.</p>`
          : `<p>Thanks for submitting. After review, we’d like you to <strong>try again</strong>.</p>
             ${reason ? `<p><strong>Reason:</strong> ${esc(reason)}</p>` : ''}
             ${comments ? `<p><strong>Comments:</strong> ${esc(comments)}</p>` : ''}
             <p>Visit your <a href="${portfolio}">portfolio</a>.</p>`

      await sendEmail({ to: sub.email, subject, text, html })
    }

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
