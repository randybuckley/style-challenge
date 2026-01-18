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

      // optional images passed from client – we’ll merge with DB-derived ones
      images: bodyImages = {},
    } = body || {}

    const challengeId = bodyChallengeIdSnake || bodyChallengeIdCamel || null

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

    // --- Prepare Patrick's email with Approve / Reject links + thumbs ---
    let mailer = 'skipped'

    if (SENDGRID_API_KEY) {
      try {
        const stylist = [firstName, secondName].filter(Boolean).join(' ') || userEmail

        const approveUrl = `${site}/api/review/decision?action=approve&token=${encodeURIComponent(
          reviewToken
        )}&userEmail=${encodeURIComponent(userEmail)}`
        const rejectUrl = `${site}/review/${encodeURIComponent(reviewToken)}`
        const logoUrl = `${site}/logo.jpeg`

        // Build thumbnail cells from mergedImages
        const thumbCells = [1, 2, 3, 4]
          .map((step) => {
            const raw = mergedImages?.[step]
            const label = step === 4 ? 'Finished Look' : `Step ${step}`

            if (!raw) {
              return `
                <td align="center" style="padding:4px 6px;font-size:12px;color:#777;">
                  <div style="margin-bottom:4px;font-weight:600;">${label}</div>
                  <div style="
                    width:96px;
                    height:96px;
                    border-radius:10px;
                    border:1px dashed #d1d5db;
                    background:#f9fafb;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    color:#9ca3af;
                    font-size:11px;
                  ">
                    No image
                  </div>
                </td>
              `
            }

            let src = String(raw)
            if (!/^https?:\/\//i.test(src) && SUPABASE_URL) {
              const baseSupabase = SUPABASE_URL.replace(/\/+$/, '')
              src = `${baseSupabase}/storage/v1/object/public/uploads/${src}`
            }

            return `
              <td align="center" style="padding:4px 6px;font-size:12px;color:#555;">
                <div style="margin-bottom:4px;font-weight:600;">${label}</div>
                <img
                  src="${src}"
                  alt="${label}"
                  width="96"
                  style="
                    display:block;
                    width:96px;
                    height:96px;
                    object-fit:cover;
                    border-radius:10px;
                    border:1px solid #e5e7eb;
                  "
                />
              </td>
            `
          })
          .join('')

        const html = `
          <div style="background:#f7f7f8;padding:24px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                   style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
              <tr>
                <td align="center">
                  <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                         style="background:#ffffff;border:1px solid #eee;border-radius:12px;overflow:hidden">
                    <tr>
                      <td align="center" style="padding:22px 22px 10px">
                        <img src="${logoUrl}" width="160" height="auto"
                             alt="Patrick Cameron – Style Challenge"
                             style="display:block;border:0;outline:none;text-decoration:none" />
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:4px 22px 10px">
                        <h2 style="margin:0 0 8px;font-size:20px;line-height:1.35">
                          New Style Challenge submission
                        </h2>
                        <p style="margin:0 0 4px;font-size:15px;line-height:1.6">
                          Stylist: <strong>${safe(stylist)}</strong>
                        </p>
                        ${
                          salonName
                            ? `<p style="margin:0 0 4px;font-size:14px;line-height:1.6">
                                 Salon: ${safe(salonName)}
                               </p>`
                            : ''
                        }
                        <p style="margin:0 0 10px;font-size:14px;line-height:1.6">
                          Email: <a href="mailto:${safe(userEmail)}">${safe(userEmail)}</a>
                        </p>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:4px 22px 4px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                          <tr>
                            ${thumbCells}
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:10px 22px 18px">
                        <div style="margin:10px 0 0;">
                          <a href="${approveUrl}"
                             style="display:inline-block;background:#28a745;color:#fff;
                                    text-decoration:none;padding:10px 14px;border-radius:8px;
                                    font-weight:700;margin-right:10px;">
                            Approve
                          </a>
                          <a href="${rejectUrl}"
                             style="display:inline-block;background:#dc3545;color:#fff;
                                    text-decoration:none;padding:10px 14px;border-radius:8px;
                                    font-weight:700;">
                            Reject
                          </a>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 22px 22px;color:#888;font-size:12px">
                        © ${new Date().getFullYear()} Patrick Cameron Team
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

    return NextResponse.json({ ok: true, token: reviewToken, mailer }, { status: 200 })
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