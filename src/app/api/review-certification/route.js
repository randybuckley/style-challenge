// Route handler for certification review email + decision
// NOTE: Do NOT add 'use server' in this file.

import { supabaseAdmin } from '../../../lib/supabaseAdmin'

// Optional config for Next route handlers
export const dynamic = 'force-dynamic'      // always dynamic
export const runtime = 'nodejs'             // Node runtime on Vercel

function getBaseUrl() {
  // Prefer an explicit SITE_URL, then NEXT_PUBLIC_SITE_URL, then Vercel URL
  const envUrl =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  return envUrl || 'http://localhost:3000'
}

// pick up envs with fallbacks (be lenient with names you’ve set)
const SENDGRID_KEY = process.env.SENDGRID_API_KEY
const FROM_EMAIL =
  process.env.MAIL_FROM_EMAIL || process.env.EMAIL_FROM || 'info@accesslonghair.com'
const FROM_NAME = process.env.MAIL_FROM_NAME || 'Patrick Cameron'
const REVIEW_TO =
  process.env.REVIEW_TO ||
  process.env.REVIEW_RECIPIENT ||
  process.env.REVIEW_ADMIN_EMAIL

async function sendEmail({ to, subject, text, html }) {
  if (!SENDGRID_KEY) throw new Error('Missing SENDGRID_API_KEY')
  if (!FROM_EMAIL) throw new Error('Missing MAIL_FROM_EMAIL/EMAIL_FROM')

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

/**
 * PUT /api/review-certification
 * Body: { token: string }
 * Looks up the submission by token and emails the reviewer with links.
 */
export async function PUT(req) {
  try {
    const { token } = await req.json()
    if (!token) {
      return Response.json({ error: 'Missing token' }, { status: 400 })
    }
    if (!REVIEW_TO) {
      return Response.json({ error: 'Missing REVIEW_TO/REVIEW_RECIPIENT' }, { status: 500 })
    }

    const { data: sub, error } = await supabaseAdmin
      .from('submissions')
      .select(
        'id, user_id, email, first_name, second_name, salon_name, step1_url, step2_url, step3_url, finished_url, status'
      )
      .eq('review_token', token)
      .single()

    if (error || !sub) {
      return Response.json({ error: 'Submission not found' }, { status: 404 })
    }

    const site = getBaseUrl()
    // (If you later add an internal review UI, point this at that page.)
    const portfolioLink = `${site}/challenge/portfolio?user=${encodeURIComponent(
      sub.user_id
    )}`
    const approveLink = `${site}/api/review-certification?action=approve&token=${encodeURIComponent(
      token
    )}`
    const rejectLink = `${site}/api/review-certification?action=reject&token=${encodeURIComponent(
      token
    )}`

    const subject = `New certification submission: ${sub.first_name || ''} ${sub.second_name || ''}`.trim()
    const plain = [
      `A new submission is ready for review.`,
      ``,
      `Name: ${[sub.first_name, sub.second_name].filter(Boolean).join(' ') || '(unknown)'}`,
      `Email: ${sub.email || '(unknown)'}`,
      `Salon: ${sub.salon_name || '(n/a)'}`,
      ``,
      `Finished Look: ${sub.finished_url || '(none)'}`,
      `Step1: ${sub.step1_url || '(none)'}`,
      `Step2: ${sub.step2_url || '(none)'}`,
      `Step3: ${sub.step3_url || '(none)'}`,
      ``,
      `View portfolio: ${portfolioLink}`,
      `Approve: ${approveLink}`,
      `Reject: ${rejectLink}`
    ].join('\n')

    const html = `
      <h3>New certification submission</h3>
      <p><strong>${[sub.first_name, sub.second_name].filter(Boolean).join(' ') || '(unknown)'}</strong>${
      sub.salon_name ? ` — ${sub.salon_name}` : ''
    }<br/>${sub.email || ''}</p>
      <ul>
        <li>Finished: ${sub.finished_url ? `<a href="${sub.finished_url}">image</a>` : '(none)'}</li>
        <li>Step 1: ${sub.step1_url ? `<a href="${sub.step1_url}">image</a>` : '(none)'}</li>
        <li>Step 2: ${sub.step2_url ? `<a href="${sub.step2_url}">image</a>` : '(none)'}</li>
        <li>Step 3: ${sub.step3_url ? `<a href="${sub.step3_url}">image</a>` : '(none)'}</li>
      </ul>
      <p>
        <a href="${portfolioLink}">View portfolio</a> ·
        <a href="${approveLink}">Approve</a> ·
        <a href="${rejectLink}">Reject</a>
      </p>
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
             ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
             ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
             <p>Visit your <a href="${portfolio}">portfolio</a>.</p>`

      await sendEmail({ to: sub.email, subject, text, html })
    }

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

/**
 * Optional minimal GET to make it clearer if someone opens the URL in a browser.
 * (Your UI should call PUT/POST; GET is just a friendly message.)
 */
export async function GET() {
  return Response.json(
    { ok: true, message: 'Use PUT to notify reviewer or POST to record a decision.' },
    { status: 200 }
  )
}