// src/app/api/cron/review-reminders/route.js
//
// Daily cron (see vercel.json). For every submission still pending after
// REMINDER_AFTER_DAYS, re-sends Patrick the FULL review email (exemplar vs
// submitted images, Approve / Further work required buttons) with a REMINDER
// banner at the top. A submission is re-nudged at most every
// REMINDER_AFTER_DAYS days until it is approved or rejected.
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
// Preview without sending or updating anything: add ?dry=1
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sgMail from '@sendgrid/mail'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseAdmin =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    : null

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || ''
const SENDGRID_FROM =
  process.env.SENDGRID_FROM ||
  process.env.EMAIL_FROM ||
  'no-reply@accesslonghair.com'
const REVIEW_RECIPIENT =
  process.env.REVIEW_RECIPIENT || 'info@accesslonghair.com'
if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY)

const REMINDER_AFTER_DAYS = 3
const MAX_PER_RUN = 25
const DAY_MS = 24 * 60 * 60 * 1000

// Submissions before this date are early test data and never get reminders.
const NOT_BEFORE_ISO =
  process.env.REMINDER_NOT_BEFORE || '2026-02-02T00:00:00Z'

// Test accounts that should never trigger a reminder.
const EXCLUDE_EMAILS = (
  process.env.REMINDER_EXCLUDE_EMAILS ||
  'randy@accesslonghair.com,patrickcameron.london@gmail.com'
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

function safe(v) {
  return v == null ? '' : String(v)
}

export async function GET(req) {
  // --- Auth ---
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client not configured' },
      { status: 500 }
    )
  }

  try {
    const url = new URL(req.url)
    const dry = url.searchParams.get('dry') === '1'
    const site = (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(
      /\/+$/,
      ''
    )
    const now = Date.now()
    const cutoffIso = new Date(now - REMINDER_AFTER_DAYS * DAY_MS).toISOString()

    // --- Overdue pending submissions ---
    const { data: rows, error } = await supabaseAdmin
      .from('submissions')
      .select(
        'id, email, first_name, second_name, salon_name, challenge_slug, challenge_id, review_token, submitted_at, last_reminder_at, reminder_count, step1_url, step2_url, step3_url, finished_url'
      )
      .eq('status', 'pending')
      .gte('submitted_at', NOT_BEFORE_ISO)
      .lt('submitted_at', cutoffIso)
      .or(`last_reminder_at.is.null,last_reminder_at.lt.${cutoffIso}`)
      .order('submitted_at', { ascending: true })
      .limit(MAX_PER_RUN + EXCLUDE_EMAILS.length)

    if (error) {
      console.error('/api/cron/review-reminders: query error', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const due = (rows || [])
      .filter((r) => !EXCLUDE_EMAILS.includes(String(r.email || '').toLowerCase()))
      .slice(0, MAX_PER_RUN)

    if (due.length === 0) {
      return NextResponse.json({ ok: true, due: 0, sent: 0 })
    }

    // --- Challenge titles + exemplar images ---
    const ids = [...new Set(due.map((r) => r.challenge_id).filter(Boolean))]
    const challengeById = {}
    if (ids.length) {
      const { data: chs } = await supabaseAdmin
        .from('challenges')
        .select('id, slug, title, steps')
        .in('id', ids)
      for (const c of chs || []) challengeById[c.id] = c
    }

    // Resolve a reference-image path to an absolute URL (same as submit route).
    const resolveImgUrl = (raw) => {
      if (!raw) return null
      const s = String(raw)
      if (/^https?:\/\//i.test(s)) return s
      const path = s.startsWith('/') ? s : '/' + s
      if (path.startsWith('/storage/')) {
        return SUPABASE_URL
          ? `${SUPABASE_URL.replace(/\/+$/, '')}${path}`
          : path
      }
      return `${site}${path}`
    }

    const stepLabels = { 1: 'Step 1', 2: 'Step 2', 3: 'Step 3', 4: 'Finished Look' }

    const buildEmail = (r) => {
      const ch = challengeById[r.challenge_id] || {}
      const challengeTitle = ch.title || r.challenge_slug || ch.slug || 'Style Challenge'
      const firstName = r.first_name || ''
      const secondName = r.second_name || ''
      const salonName = r.salon_name || ''
      const userEmail = r.email
      const stylist = [firstName, secondName].filter(Boolean).join(' ') || userEmail
      const days = Math.floor((now - new Date(r.submitted_at).getTime()) / DAY_MS)
      const submittedDate = new Date(r.submitted_at).toISOString().slice(0, 10)
      const reminderNo = (r.reminder_count || 0) + 1

      const token = encodeURIComponent(r.review_token)
      const approveUrl = `${site}/api/review/decision?action=approve&token=${token}&userEmail=${encodeURIComponent(userEmail)}`
      const rejectUrl = `${site}/api/review/reject-quick?token=${token}`
      const logoUrl = `${site}/logo.png`

      // Exemplar images from steps JSONB
      const exemplarImages = {}
      for (const step of Array.isArray(ch.steps) ? ch.steps : []) {
        const num = step.stepNumber ?? step.step_number ?? null
        const img = step.referenceImageUrl ?? step.reference_image_url ?? null
        if (num && img) exemplarImages[num] = img
      }

      const submittedRaw = {
        1: r.step1_url,
        2: r.step2_url,
        3: r.step3_url,
        4: r.finished_url,
      }

      const stepRows = [1, 2, 3, 4]
        .map((n) => {
          const exemplarSrc = resolveImgUrl(exemplarImages[n])
          let submittedSrc = null
          if (submittedRaw[n]) {
            const s = String(submittedRaw[n])
            submittedSrc = /^https?:\/\//i.test(s)
              ? s
              : SUPABASE_URL
                ? `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/uploads/${s}`
                : s
          }
          if (!submittedSrc && !exemplarSrc) return ''
          const label = stepLabels[n]

          if (exemplarSrc && submittedSrc) {
            return `
              <tr>
                <td style="padding:24px 22px 0;">
                  <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111;">${label}</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td width="49%" valign="top" align="center">
                        <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#999;">Patrick's Example</p>
                        <img src="${exemplarSrc}" width="240" alt="Example — ${label}"
                          style="display:block;width:100%;max-width:240px;height:auto;border-radius:8px;border:1px solid #e5e7eb;" />
                      </td>
                      <td width="2%"></td>
                      <td width="49%" valign="top" align="center">
                        <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#999;">Submitted</p>
                        <img src="${submittedSrc}" width="240" alt="${label}"
                          style="display:block;width:100%;max-width:240px;height:auto;border-radius:8px;border:1px solid #e5e7eb;" />
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`
          }
          return `
            <tr>
              <td style="padding:24px 22px 0;">
                <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111;">${label}</p>
                <img src="${submittedSrc || exemplarSrc}" width="512" alt="${label}"
                  style="display:block;width:100%;max-width:512px;height:auto;border-radius:8px;border:1px solid #e5e7eb;" />
              </td>
            </tr>`
        })
        .join('')

      const html = `
        <div style="background:#f4f4f6;padding:24px 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                 style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
            <tr>
              <td align="center">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                       style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">

                  <!-- REMINDER banner -->
                  <tr>
                    <td style="background:#fffbeb;border-bottom:1px solid #fde68a;padding:14px 22px;">
                      <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#b45309;">REMINDER</p>
                      <p style="margin:4px 0 0;font-size:14px;line-height:1.5;color:#92400e;">
                        This is a reminder: this submission has been waiting <strong>${days} days</strong>
                        for your review (submitted ${submittedDate}${reminderNo > 1 ? `, reminder #${reminderNo}` : ''}).
                      </p>
                    </td>
                  </tr>

                  <!-- Admin toolbar: Approve / Reject + quick reference -->
                  <tr>
                    <td style="background:#f8f9fa;border-bottom:1px solid #e5e7eb;padding:14px 22px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="vertical-align:middle;">
                            <p style="margin:0;font-size:13px;color:#555;line-height:1.5;">
                              <strong>${safe(challengeTitle)}</strong> &middot; ${safe(stylist)}
                              ${salonName ? `&middot; ${safe(salonName)}` : ''}
                              &middot; <a href="mailto:${safe(userEmail)}" style="color:#555;">${safe(userEmail)}</a>
                            </p>
                          </td>
                          <td align="right" style="white-space:nowrap;padding-left:16px;vertical-align:middle;">
                            <a href="${approveUrl}"
                               style="display:inline-block;background:#f0fdf4;color:#16a34a;text-decoration:none;
                                      border:1px solid #bbf7d0;padding:6px 14px;border-radius:6px;
                                      font-weight:600;font-size:12px;margin-right:6px;">
                              Approve
                            </a>
                            <a href="${rejectUrl}"
                               style="display:inline-block;background:#fafafa;color:#555;text-decoration:none;
                                      border:1px solid #e5e7eb;padding:6px 14px;border-radius:6px;
                                      font-weight:600;font-size:12px;">
                              Further work required
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Logo -->
                  <tr>
                    <td align="center" style="padding:32px 22px 8px;">
                      <img src="${logoUrl}" width="160" height="auto"
                           alt="Patrick Cameron – Style Challenge"
                           style="display:block;border:0;outline:none;text-decoration:none;" />
                    </td>
                  </tr>

                  <!-- Challenge title -->
                  <tr>
                    <td align="center" style="padding:4px 22px 0;">
                      <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#111;">
                        ${safe(challengeTitle)}
                      </p>
                    </td>
                  </tr>

                  <!-- Greeting — forwardable body starts here -->
                  <tr>
                    <td style="padding:24px 22px 0;">
                      <p style="margin:0 0 10px;font-size:15px;line-height:1.7;">Dear ${safe(firstName || stylist)},</p>
                      <p style="margin:0;font-size:15px;line-height:1.7;color:#444;">
                        Thank you for submitting your <strong>${safe(challengeTitle)}</strong> challenge
                        work for Patrick Cameron's personal review. Here are the images you submitted:
                      </p>
                    </td>
                  </tr>

                  ${stepRows}

                  <!-- Sign-off -->
                  <tr>
                    <td style="padding:32px 22px 8px;">
                      <p style="margin:0;font-size:15px;line-height:1.7;">Kind regards,</p>
                      <p style="margin:4px 0 0;font-size:15px;font-weight:700;line-height:1.7;">Patrick Cameron</p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding:16px 22px 24px;border-top:1px solid #f0f0f0;">
                      <p style="margin:0;font-size:12px;color:#aaa;">
                        © ${new Date().getFullYear()} Patrick Cameron Team
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </div>
      `

      return {
        html,
        subject: `REMINDER: Style Challenge submission — ${stylist} (${challengeTitle})`,
        userEmail,
        days,
        challengeTitle,
      }
    }

    // --- Dry run: report only ---
    if (dry) {
      return NextResponse.json({
        ok: true,
        dry: true,
        due: due.length,
        items: due.map((r) => {
          const m = buildEmail(r)
          return {
            subject: m.subject,
            email: r.email,
            challenge: m.challengeTitle,
            days: m.days,
            reminder_count: r.reminder_count || 0,
          }
        }),
      })
    }

    if (!SENDGRID_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'SENDGRID_API_KEY not configured' },
        { status: 500 }
      )
    }

    // --- Send one reminder per submission; mark each only after it sends ---
    let sent = 0
    let failed = 0
    for (const r of due) {
      try {
        const m = buildEmail(r)
        await sgMail.send({
          to: REVIEW_RECIPIENT,
          from: SENDGRID_FROM,
          replyTo: m.userEmail,
          subject: m.subject,
          html: m.html,
        })
        await supabaseAdmin
          .from('submissions')
          .update({
            last_reminder_at: new Date().toISOString(),
            reminder_count: (r.reminder_count || 0) + 1,
          })
          .eq('id', r.id)
        sent++
      } catch (mailErr) {
        failed++
        console.error('/api/cron/review-reminders: send error', r.id, mailErr)
      }
    }

    return NextResponse.json({ ok: true, due: due.length, sent, failed })
  } catch (err) {
    console.error('/api/cron/review-reminders: unexpected error', err)
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    )
  }
}
