// src/app/api/review/submit/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sgMail from '@sendgrid/mail'
import crypto from 'crypto'

// --- Supabase admin client (service role) ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    : null

// --- SendGrid setup ---
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || ''
const SENDGRID_FROM =
  process.env.SENDGRID_FROM ||
  process.env.EMAIL_FROM ||
  'no-reply@accesslonghair.com'
const REVIEW_RECIPIENT =
  process.env.REVIEW_RECIPIENT || 'info@accesslonghair.com'

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY)
}

function safe(v) {
  return v == null ? '' : String(v)
}

export async function POST(req) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { ok: false, error: 'Supabase admin client not configured' },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const {
      userId,
      userEmail: bodyEmail,
      firstName: bodyFirst,
      secondName: bodySecond,
      salonName: bodySalon,

      // IMPORTANT: challenge linkage (submissions.challenge_id is NOT NULL and unique with user_id)
      challenge_id: bodyChallengeIdSnake,
      challengeId: bodyChallengeIdCamel,

      // NEW: slug linkage (submissions.challenge_slug is used by Essentials status mapping)
      challenge_slug: bodyChallengeSlugSnake,
      challengeSlug: bodyChallengeSlugCamel,

      // optional images passed from client – we'll merge with DB-derived ones
      images: bodyImages = {},
    } = body || {}

    const challengeId = bodyChallengeIdSnake || bodyChallengeIdCamel || null
    const challengeSlug = bodyChallengeSlugSnake || bodyChallengeSlugCamel || null

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'Missing userId' },
        { status: 400 }
      )
    }

    if (!challengeId) {
      return NextResponse.json(
        { ok: false, error: 'Missing challengeId' },
        { status: 400 }
      )
    }

    // Base URL for links & logo
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
    const site = baseUrl.replace(/\/+$/, '')

    // --- Look up profile to fill in blanks ---
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, second_name, salon_name')
      .eq('id', userId)
      .maybeSingle()

    if (profileErr) {
      console.error('/api/review/submit: profile lookup error', profileErr)
    }

    const userEmail = bodyEmail || profile?.email
    const firstName = bodyFirst ?? profile?.first_name ?? ''
    const secondName = bodySecond ?? profile?.second_name ?? ''
    const salonName = bodySalon ?? profile?.salon_name ?? ''

    if (!userEmail) {
      return NextResponse.json(
        { ok: false, error: 'Missing user email' },
        { status: 400 }
      )
    }

    // ------------------------------------------------------------------
    // Always fetch challenge data — needed for email title and exemplar images
    // ------------------------------------------------------------------
    let resolvedChallengeSlug = challengeSlug
    let challengeTitle = ''
    let exemplarImages = {}

    const { data: chRow, error: chLookupErr } = await supabaseAdmin
      .from('challenges')
      .select('slug, title, steps, thumbnail_url')
      .eq('id', challengeId)
      .maybeSingle()

    if (chLookupErr) {
      console.error('/api/review/submit: challenges lookup error', chLookupErr)
    }

    if (!resolvedChallengeSlug) resolvedChallengeSlug = chRow?.slug || null
    challengeTitle = chRow?.title || resolvedChallengeSlug || 'Style Challenge'

    // Extract exemplar images from steps JSONB
    // Structure: [{ stepNumber, referenceImageUrl, videoUrl }, ...]
    const challengeSteps = Array.isArray(chRow?.steps) ? chRow.steps : []
    for (const step of challengeSteps) {
      const num = step.stepNumber ?? step.step_number ?? null
      const img = step.referenceImageUrl ?? step.reference_image_url ?? null
      if (num && img) exemplarImages[num] = img
    }

    // ------------------------------------------------------------------
    // Pull latest step 1–4 uploads from DB if client didn't send URLs
    // ------------------------------------------------------------------
    let mergedImages = { ...bodyImages } // preserve any explicit overrides

    const missingSteps = [1, 2, 3, 4].filter((step) => mergedImages[step] == null)

    if (missingSteps.length > 0) {
      const { data: rows, error: uploadsErr } = await supabaseAdmin
        .from('uploads')
        .select('step_number, image_url, created_at')
        .eq('user_id', userId)
        .in('step_number', [1, 2, 3, 4])
        .order('created_at', { ascending: false })

      if (uploadsErr) {
        console.error('/api/review/submit: uploads lookup error', uploadsErr)
      } else if (rows && rows.length) {
        const latestByStep = {}
        for (const row of rows) {
          if (!latestByStep[row.step_number]) {
            latestByStep[row.step_number] = row.image_url
          }
        }

        for (const step of missingSteps) {
          if (latestByStep[step]) {
            mergedImages[step] = latestByStep[step]
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // UPSERT submission row (unique: user_id + challenge_id)
    // ------------------------------------------------------------------
    const reviewToken = crypto.randomUUID()

    const submissionPayload = {
      user_id: userId,
      challenge_id: challengeId,
      challenge_slug: resolvedChallengeSlug,

      email: userEmail,
      first_name: firstName || null,
      second_name: secondName || null,
      salon_name: salonName || null,

      // overwrite token on resubmission so newest approval link is valid
      review_token: reviewToken,

      step1_url: mergedImages[1] || null,
      step2_url: mergedImages[2] || null,
      step3_url: mergedImages[3] || null,
      finished_url: mergedImages[4] || null,
    }

    const { error: subErr } = await supabaseAdmin
      .from('submissions')
      .upsert(submissionPayload, { onConflict: 'user_id,challenge_id' })

    if (subErr) {
      console.error('/api/review/submit: upsert submissions error', subErr)
      return NextResponse.json(
        { ok: false, error: `Could not save submission: ${subErr.message}` },
        { status: 500 }
      )
    }

    // --- Prepare Patrick's email ---
    let mailer = 'skipped'

    if (SENDGRID_API_KEY) {
      try {
        const stylist =
          [firstName, secondName].filter(Boolean).join(' ') || userEmail

        const approveUrl = `${site}/api/review/decision?action=approve&token=${encodeURIComponent(
          reviewToken
        )}&userEmail=${encodeURIComponent(userEmail)}`
        const rejectUrl = `${site}/api/review/reject-quick?token=${encodeURIComponent(reviewToken)}`
        const logoUrl = `${site}/logo.jpeg`

        // Helper: resolve a relative Supabase path to an absolute URL
        const resolveImgUrl = (raw) => {
          if (!raw) return null
          const s = String(raw)
          if (/^https?:\/\//i.test(s)) return s
          if (SUPABASE_URL) return `${SUPABASE_URL.replace(/\/+$/, '')}${s.startsWith('/') ? s : '/' + s}`
          return s
        }

        const stepLabels = { 1: 'Step 1', 2: 'Step 2', 3: 'Step 3', 4: 'Finished Look' }

        const stepRows = [1, 2, 3, 4].map((n) => {
          const exemplarSrc = resolveImgUrl(exemplarImages[n])

          const rawSubmitted = mergedImages?.[n]
          let submittedSrc = null
          if (rawSubmitted) {
            const s = String(rawSubmitted)
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
                <img src="${submittedSrc}" width="512" alt="${label}"
                  style="display:block;width:100%;max-width:512px;height:auto;border-radius:8px;border:1px solid #e5e7eb;" />
              </td>
            </tr>`
        }).join('')

        const html = `
          <div style="background:#f4f4f6;padding:24px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                   style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
              <tr>
                <td align="center">
                  <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                         style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">

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
                                 style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;
                                        padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;margin-right:8px;">
                                ✓ Approve
                              </a>
                              <a href="${rejectUrl}"
                                 style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;
                                        padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;">
                                ✕ Reject
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

                    <!-- Step images (comparison or single) -->
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

        await sgMail.send({
          to: REVIEW_RECIPIENT,
          from: SENDGRID_FROM,
          replyTo: userEmail,
          subject: `Style Challenge submission — ${safe(
            [firstName, secondName].filter(Boolean).join(' ') || userEmail
          )}`,
          html,
        })

        mailer = 'sent'
      } catch (mailErr) {
        console.error('/api/review/submit: mail send error', mailErr)
        mailer = 'failed'
      }
    }

    return NextResponse.json(
      {
        ok: true,
        token: reviewToken,
        mailer,
        challengeSlug: resolvedChallengeSlug || null,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('/api/review/submit: unexpected error', err)
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    )
  }
}

// Guard other HTTP methods
export function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}
export const PUT = GET
export const DELETE = GET