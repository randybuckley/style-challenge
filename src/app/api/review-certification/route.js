'use server'

import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

function getBaseUrl() {
  // Use an explicit site URL if set; fall back to Vercel URL; else localhost
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`.replace(/\/+$/, '')
  return 'http://localhost:3000'
}

async function sendWithSendGrid({ to, subject, html, text }) {
  const key = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM
  if (!key) throw new Error('Missing SENDGRID_API_KEY')
  if (!fromEmail) throw new Error('Missing SENDGRID_FROM')

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail, name: 'Patrick Cameron' },
    subject,
    content: [
      ...(text ? [{ type: 'text/plain', value: text }] : []),
      { type: 'text/html', value: html || '<p></p>' }
    ]
  }

  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`SendGrid error ${r.status}: ${body}`)
  }
}

/* ------------------------------------------------------------------ */
/* PUT  -> email reviewer (Patrick) with a one-time review link        */
/* Body: { token }                                                     */
/* ------------------------------------------------------------------ */
export async function PUT(request) {
  const { token } = await request.json().catch(() => ({}))
  if (!token) return new Response('Missing token', { status: 400 })

  // Make sure the submission exists
  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select('*')
    .eq('review_token', token)
    .single()

  if (error || !data) return new Response('Submission not found', { status: 404 })

  const base = getBaseUrl()
  const reviewUrl = `${base}/api/review-certification?token=${encodeURIComponent(token)}`
  const reviewer = process.env.REVIEW_TO || process.env.SENDGRID_FROM

  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial;">
      <h2>New Portfolio Submission</h2>
      <p><strong>${(data.first_name || '')} ${(data.second_name || '')}</strong> — ${data.email || 'no email on file'}</p>
      <p>Salon: ${data.salon_name || '—'}</p>
      <p><a href="${reviewUrl}">Open Review Page</a></p>
      <div style="margin-top:16px;">
        ${[data.step1_url, data.step2_url, data.step3_url]
          .filter(Boolean)
          .map(u => `<img src="${u}" style="width:180px;height:auto;margin-right:8px;border:1px solid #ccc;border-radius:6px" />`)
          .join('')}
      </div>
      <div style="margin-top:12px;">
        ${data.finished_url ? `<img src="${data.finished_url}" style="width:380px;height:auto;border:1px solid #ccc;border-radius:6px" />` : ''}
      </div>
    </div>
  `

  await sendWithSendGrid({
    to: reviewer,
    subject: 'Review needed: Style Challenge submission',
    html,
    text: `Review link: ${reviewUrl}`
  })

  return new Response('ok')
}

/* ------------------------------------------------------------------ */
/* GET  -> simple HTML reviewer UI                                    */
/* /api/review-certification?token=...                                */
/* ------------------------------------------------------------------ */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) return new Response('Missing token', { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select('*')
    .eq('review_token', token)
    .single()

  if (error || !data) return new Response('Not found', { status: 404 })

  const thumb = (u, label) =>
    u
      ? `<div style="margin-right:8px;text-align:center"><div style="font-size:12px;color:#333">${label}</div><img src="${u}" style="width:180px;height:auto;border:1px solid #ccc;border-radius:6px"/></div>`
      : ''

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Review Submission</title>
</head>
<body style="font-family:system-ui,Segoe UI,Arial;background:#f7f7f8;padding:24px;">
  <div style="max-width:900px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:10px;padding:20px;">
    <h2 style="margin-top:0;">Review Submission</h2>
    <p><strong>${(data.first_name || '')} ${(data.second_name || '')}</strong> — ${data.email || 'no email on file'}<br/>
    Salon: ${data.salon_name || '—'}</p>

    <div style="display:flex;flex-wrap:wrap;margin:12px 0;">
      ${thumb(data.step1_url, 'Step 1')}
      ${thumb(data.step2_url, 'Step 2')}
      ${thumb(data.step3_url, 'Step 3')}
    </div>
    <div style="margin:12px 0;">
      <div style="font-size:12px;color:#333;margin-bottom:6px">Finished Look</div>
      ${data.finished_url ? `<img src="${data.finished_url}" style="width:420px;height:auto;border:1px solid #ccc;border-radius:6px"/>` : '<em>No finished image</em>'}
    </div>

    <hr style="margin:18px 0;"/>

    <form method="post" style="display:block;">
      <input type="hidden" name="token" value="${data.review_token}"/>

      <label style="display:block;margin-bottom:8px;">
        Decision:
        <select name="decision" style="padding:6px;">
          <option value="passed">Pass</option>
          <option value="failed">Fail</option>
        </select>
      </label>

      <label style="display:block;margin-bottom:8px;">
        Reason (for fail):
        <select name="reason" style="padding:6px;">
          <option value="">—</option>
          <option value="finish">Finish not polished</option>
          <option value="balance">Shape/Balance needs work</option>
          <option value="gaps">Gaps/sectioning showing</option>
          <option value="lighting">Lighting/Photo quality</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label style="display:block;margin-bottom:10px;">
        Notes to student (optional):
        <br/>
        <textarea name="notes" rows="4" style="width:100%;padding:8px;"></textarea>
      </label>

      <button type="submit" style="padding:10px 14px;background:#111;color:#fff;border:0;border-radius:6px;cursor:pointer;">Submit Decision</button>
    </form>
  </div>
</body>
</html>
  `.trim()

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

/* ------------------------------------------------------------------ */
/* POST -> save decision, email student                               */
/* Accepts form POST from the reviewer HTML                           */
/* ------------------------------------------------------------------ */
export async function POST(request) {
  // Accept form or JSON
  let token, decision, reason, notes
  try {
    const ct = request.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const body = await request.json()
      token = body.token
      decision = body.decision
      reason = body.reason || ''
      notes = body.notes || ''
    } else {
      const form = await request.formData()
      token = form.get('token')
      decision = form.get('decision')
      reason = form.get('reason') || ''
      notes = form.get('notes') || ''
    }
  } catch (_) {}

  if (!token || !decision || !['passed', 'failed'].includes(decision)) {
    return new Response('Bad request', { status: 400 })
  }

  // Grab submission
  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select('*')
    .eq('review_token', token)
    .single()

  if (error || !data) return new Response('Not found', { status: 404 })

  // Update status
  const { error: updErr } = await supabaseAdmin
    .from('submissions')
    .update({ status: decision })
    .eq('review_token', token)

  if (updErr) return new Response(`Update failed: ${updErr.message}`, { status: 500 })

  // Email the student
  const toStudent = data.email
  if (toStudent) {
    const base = getBaseUrl()
    const portfolioUrl = `${base}/challenge/portfolio`
    const subject =
      decision === 'passed'
        ? 'Congratulations — Patrick Cameron Certified!'
        : 'Style Challenge Review — Next Steps'

    const why = decision === 'failed' && (reason || notes)
      ? `<p><strong>Feedback:</strong> ${[reason, notes].filter(Boolean).join(' — ')}</p>`
      : ''

    const badge = decision === 'passed'
      ? '<p><strong>You’ve earned the Patrick Cameron Certified badge.</strong></p>'
      : ''

    const html = `
      <div style="font-family:system-ui,Segoe UI,Arial;">
        <p>Hi ${(data.first_name || '')},</p>
        <p>Your submission has been reviewed.</p>
        ${badge}
        ${why}
        <p>You can view and download your updated portfolio here:</p>
        <p><a href="${portfolioUrl}">${portfolioUrl}</a></p>
        <p>— Patrick & Team</p>
      </div>
    `
    await sendWithSendGrid({ to: toStudent, subject, html, text: `${subject}\n${portfolioUrl}` })
  }

  // Simple reviewer confirmation page
  const html = `
    <!doctype html><html><body style="font-family:system-ui;padding:24px;">
      <h3>Saved</h3>
      <p>Status set to <strong>${decision}</strong> and the student has been emailed.</p>
    </body></html>
  `
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
