// Route handler for certification review email + decision
// NOTE: no 'use server' here.

import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getBaseUrl () {
  const envUrl =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  return envUrl || 'http://localhost:3000'
}

// ── ENV VARS ───────────────────────────────────────────────────────────────────
const SENDGRID_KEY = process.env.SENDGRID_API_KEY

const FROM_EMAIL =
  process.env.SENDER_EMAIL ||
  process.env.MAIL_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  'info@accesslonghair.com'

const FROM_NAME = process.env.MAIL_FROM_NAME || 'Patrick Cameron'

const REVIEW_TO =
  process.env.REVIEWER_EMAIL ||
  process.env.REVIEW_TO ||
  process.env.REVIEW_RECIPIENT ||
  process.env.REVIEW_ADMIN_EMAIL

async function sendEmail ({ to, subject, text, html }) {
  if (!SENDGRID_KEY) throw new Error('Missing SENDGRID_API_KEY')
  if (!FROM_EMAIL) throw new Error('Missing sender email')

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [
        { type: 'text/plain', value: text || '' },
        { type: 'text/html', value: html || '' }
      ]
    })
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`SendGrid error ${res.status}: ${body}`)
  }
}

// ── Helpers to build rejection email text + routing ────────────────────────────
function parseReason (reasonRaw = '') {
  // supports both old and new keys
  const r = (reasonRaw || '').toLowerCase()

  // map older keys
  if (r === 'quality') return { kind: 'photo_quality', step: 'any' }
  if (r === 'step1') return { kind: 'needs_work', step: '1' }
  if (r === 'step2') return { kind: 'needs_work', step: '2' }
  if (r === 'step3') return { kind: 'needs_work', step: '3' }
  if (r === 'finished') return { kind: 'needs_work', step: 'finished' }

  // new keys you requested
  if (r.startsWith('photo_quality_step')) {
    const step = r.replace('photo_quality_step', '')
    return { kind: 'photo_quality', step }
  }
  if (r === 'photo_quality_finished_look' || r === 'photo_quality_finished') {
    return { kind: 'photo_quality', step: 'finished' }
  }
  if (r.startsWith('needs_work_step')) {
    const step = r.replace('needs_work_step', '')
    return { kind: 'needs_work', step }
  }
  if (r === 'needs_work_finished_look' || r === 'needs_work_finished') {
    return { kind: 'needs_work', step: 'finished' }
  }

  // fallback
  return { kind: 'generic', step: 'any' }
}

function stepPath (step) {
  if (step === '1') return '/challenge/step1'
  if (step === '2') return '/challenge/step2'
  if (step === '3') return '/challenge/step3'
  if (step === 'finished') return '/challenge/finished'
  // generic quality issue -> send to step1 as the safe restart point
  return '/challenge/step1'
}

function titleForStep (step) {
  if (step === '1') return 'Step 1'
  if (step === '2') return 'Step 2'
  if (step === '3') return 'Step 3'
  if (step === 'finished') return 'Finished Look'
  return 'your photos'
}

function buildRejectionCopy ({ firstName, reason, comments }) {
  const { kind, step } = parseReason(reason)
  const stepTitle = titleForStep(step)
  const link = stepPath(step)

  const hi = firstName ? `Hi ${firstName},` : `Hi there,`

  // friendly, encouraging copy
  let bodyPlain = ''
  let bodyHtml = ''

  if (kind === 'photo_quality') {
    bodyPlain =
`${hi}

Your work is very good—and part of learning is knowing when to refine it. Patrick had difficulty clearly seeing your work for ${stepTitle}. Could you take a clearer photo and resubmit?

Tips:
• Use good, even lighting
• Fill the frame with the hair—avoid cluttered backgrounds
• Hold the camera steady and focus on the key details

${comments ? `Notes from Patrick:\n${comments}\n\n` : ''}When you’re ready, continue here: ${link}`
    bodyHtml =
`<p>${hi}</p>
<p>Your work is very good—and part of learning is knowing when to refine it. Patrick had difficulty clearly seeing your work for <strong>${stepTitle}</strong>. Could you take a clearer photo and resubmit?</p>
<ul>
  <li>Use good, even lighting</li>
  <li>Fill the frame with the hair — avoid cluttered backgrounds</li>
  <li>Hold the camera steady and focus on the key details</li>
</ul>
${comments ? `<p><strong>Notes from Patrick:</strong><br/>${escapeHtml(comments)}</p>` : ''}
<p>When you’re ready, continue here: <a href="${link}">${link}</a></p>`
  } else if (kind === 'needs_work') {
    bodyPlain =
`${hi}

Thank you for submitting your portfolio. Patrick thinks you're close, but ${stepTitle} needs a little more work. Please review Patrick’s video for ${stepTitle}, try again, and resubmit.

${comments ? `Notes from Patrick:\n${comments}\n\n` : ''}Continue here: ${link}`
    bodyHtml =
`<p>${hi}</p>
<p>Thank you for submitting your portfolio. Patrick thinks you're close, but <strong>${stepTitle}</strong> needs a little more work. Please review Patrick’s video for ${stepTitle}, try again, and resubmit.</p>
${comments ? `<p><strong>Notes from Patrick:</strong><br/>${escapeHtml(comments)}</p>` : ''}
<p>Continue here: <a href="${link}">${link}</a></p>`
  } else {
    bodyPlain =
`${hi}

Thank you for submitting your portfolio. Patrick would like a few improvements before awarding certification. Please review the videos, refine your images, and resubmit.

${comments ? `Notes from Patrick:\n${comments}\n\n` : ''}Start here: ${stepPath('any')}`
    bodyHtml =
`<p>${hi}</p>
<p>Thank you for submitting your portfolio. Patrick would like a few improvements before awarding certification. Please review the videos, refine your images, and resubmit.</p>
${comments ? `<p><strong>Notes from Patrick:</strong><br/>${escapeHtml(comments)}</p>` : ''}
<p>Start here: <a href="${stepPath('any')}">${stepPath('any')}</a></p>`
  }

  const subject = 'Certification Review — Please Try Again'
  return { subject, text: bodyPlain, html: bodyHtml }
}

function buildApprovalCopy ({ firstName }) {
  const hi = firstName ? `Hi ${firstName},` : `Hi there,`
  const portfolio = '/challenge/portfolio'
  const subject = 'Congratulations — You are Patrick Cameron Certified!'
  const text =
`${hi}

Patrick is very proud of your work — you’re clearly demonstrating expertise in dressing long hair. Thank you for continuing your educational journey and striving to improve your craft.

Download your Certified Portfolio here:
${portfolio}`
  const html =
`<p>${hi}</p>
<p>Patrick is very proud of your work — you’re clearly demonstrating expertise in dressing long hair. Thank you for continuing your educational journey and striving to improve your craft.</p>
<p><a href="${portfolio}">Download your Certified Portfolio here</a>.</p>`
  return { subject, text, html }
}

function escapeHtml (s = '') {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

// ── EMAIL TO REVIEWER (triggered by certification page) ───────────────────────
export async function PUT (req) {
  try {
    const { token } = await req.json()
    if (!token) return Response.json({ error: 'Missing token' }, { status: 400 })
    if (!REVIEW_TO) return Response.json({ error: 'Missing reviewer email' }, { status: 500 })

    const { data: sub, error } = await supabaseAdmin
      .from('submissions')
      .select('id, user_id, email, first_name, second_name, salon_name, step1_url, step2_url, step3_url, finished_url, status')
      .eq('review_token', token)
      .single()

    if (error || !sub) return Response.json({ error: 'Submission not found' }, { status: 404 })

    const site = getBaseUrl()
    // Approve should be one-click via API GET, Reject should open the review UI.
    const approveLink = `${site}/api/review-certification?action=approve&token=${encodeURIComponent(token)}`
    const rejectLink  = `${site}/review?token=${encodeURIComponent(token)}&action=reject`
    const portfolioLink = `${site}/challenge/portfolio?user=${encodeURIComponent(sub.user_id)}`

    const subject = `New certification submission: ${[sub.first_name, sub.second_name].filter(Boolean).join(' ')}`.trim()
    const plain = [
      `A new submission is ready for review.`,
      ``,
      `Name: ${[sub.first_name, sub.second_name].filter(Boolean).join(' ') || '(unknown)'}`,
      `Email: ${sub.email || '(unknown)'}`,
      `Salon: ${sub.salon_name || '(n/a)'}`,
      ``,
      `View portfolio: ${portfolioLink}`,
      `Approve: ${approveLink}`,
      `Reject: ${rejectLink}`
    ].join('\n')

    const html = `
      <h3>New certification submission</h3>
      <p><strong>${[sub.first_name, sub.second_name].filter(Boolean).join(' ') || '(unknown)'}</strong>${sub.salon_name ? ` — ${escapeHtml(sub.salon_name)}` : ''}<br/>${escapeHtml(sub.email || '')}</p>
      <p>
        <a href="${portfolioLink}" style="background:#0b5ed7;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">View Portfolio</a>
        &nbsp;&nbsp;
        <a href="${approveLink}" style="background:#28a745;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">Approve</a>
        &nbsp;&nbsp;
        <a href="${rejectLink}" style="background:#6c757d;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">Reject</a>
      </p>
    `

    await sendEmail({ to: REVIEW_TO, subject, text: plain, html })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

// ── REVIEWER ONE-CLICK GET (approve) and data fetch for /review ───────────────
export async function GET (req) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || ''
  const token  = searchParams.get('token') || ''
  const details = searchParams.get('details') || ''

  // details=1 -> JSON for the /review UI preload
  if (details === '1') {
    if (!token) return Response.json({ error: 'Missing token' }, { status: 400 })
    const { data: sub, error } = await supabaseAdmin
      .from('submissions')
      .select('id, user_id, email, first_name, second_name, salon_name, step1_url, step2_url, step3_url, finished_url, status')
      .eq('review_token', token)
      .single()
    if (error || !sub) return Response.json({ error: 'Submission not found' }, { status: 404 })
    return Response.json({ ok: true, submission: sub }, { status: 200 })
  }

  // one-click approval from the email
  if (action === 'approve') {
    if (!token) {
      return new Response('<p>Missing token.</p>', { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } })
    }

    const { data: sub, error } = await supabaseAdmin
      .from('submissions')
      .select('id, email, first_name, status')
      .eq('review_token', token)
      .single()

    if (error || !sub) {
      return new Response('<p>Submission not found.</p>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } })
    }

    // update status if not already approved
    if (sub.status !== 'approved') {
      await supabaseAdmin
        .from('submissions')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', sub.id)

      // send the approval email to the candidate
      if (sub.email) {
        const copy = buildApprovalCopy({ firstName: sub.first_name })
        await sendEmail({ to: sub.email, subject: copy.subject, text: copy.text, html: copy.html })
      }
    }

    // friendly HTML page for the reviewer
    const html = `
      <!doctype html>
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Approved</title>
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px">
        <h2 style="margin:0 0 8px">Approved ✔</h2>
        <p style="margin:0 0 12px">The candidate has been notified by email.</p>
      </div>`
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }

  // any other GET -> helpful hint
  return Response.json({ ok: true, message: 'Use PUT to notify reviewer or POST to record a decision.' })
}

// ── REVIEWER POST (reject/approve from the /review UI) ────────────────────────
export async function POST (req) {
  try {
    const { token, decision, reason, comments } = await req.json()
    if (!token || !decision) return Response.json({ error: 'Missing token or decision' }, { status: 400 })
    if (!['approve', 'reject'].includes(decision)) return Response.json({ error: 'Invalid decision' }, { status: 400 })

    const { data: sub, error } = await supabaseAdmin
      .from('submissions')
      .select('id, email, first_name')
      .eq('review_token', token)
      .single()

    if (error || !sub) return Response.json({ error: 'Submission not found' }, { status: 404 })

    if (decision === 'approve') {
      await supabaseAdmin
        .from('submissions')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', sub.id)

      if (sub.email) {
        const copy = buildApprovalCopy({ firstName: sub.first_name })
        await sendEmail({ to: sub.email, subject: copy.subject, text: copy.text, html: copy.html })
      }
      return Response.json({ ok: true })
    }

    // reject
    await supabaseAdmin
      .from('submissions')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reason, comments })
      .eq('id', sub.id)

    if (sub.email) {
      const copy = buildRejectionCopy({ firstName: sub.first_name, reason, comments })
      await sendEmail({ to: sub.email, subject: copy.subject, text: copy.text, html: copy.html })
    }
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}