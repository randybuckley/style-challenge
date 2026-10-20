// src/app/api/cron/weekly-report/route.js
//
// Weekly cron (see vercel.json). Emails Patrick and Marco a summary of the
// last 7 days: image uploads and certification submissions.
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
// Preview without sending: add ?dry=1 (returns the numbers + HTML).
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
if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY)

const REPORT_RECIPIENTS = (
  process.env.REPORT_RECIPIENTS ||
  'patrick@accesslonghair.com,marco@accesslonghair.com'
)
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)

const DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]))
}

function countBy(rows, keyFn) {
  const out = {}
  for (const r of rows) {
    const k = keyFn(r)
    out[k] = (out[k] || 0) + 1
  }
  return out
}

function tableRows(obj) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1])
  if (!entries.length) {
    return `<tr><td style="padding:4px 0;color:#888">None</td><td></td></tr>`
  }
  return entries
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0">${esc(k)}</td><td style="padding:4px 0;text-align:right"><b>${v}</b></td></tr>`
    )
    .join('')
}

function delta(cur, prev) {
  const d = cur - (prev ?? 0)
  return d === 0 ? 'same as last week' : `${d > 0 ? '+' : ''}${d} vs last week`
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
    const dry = new URL(req.url).searchParams.get('dry') === '1'

    const now = new Date()
    const since = new Date(now.getTime() - DAYS * DAY_MS)
    const prior = new Date(since.getTime() - DAYS * DAY_MS)
    const sinceISO = since.toISOString()
    const priorISO = prior.toISOString()

    const [
      uploadsRes,
      prevUploadsRes,
      subsRes,
      prevSubsRes,
      pendingRes,
      challengesRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('uploads')
        .select('user_id, step_number, challenge_id, created_at')
        .gte('created_at', sinceISO)
        .limit(10000),
      supabaseAdmin
        .from('uploads')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', priorISO)
        .lt('created_at', sinceISO),
      supabaseAdmin
        .from('submissions')
        .select('challenge_id, challenge_slug, status, submitted_at')
        .gte('submitted_at', sinceISO)
        .limit(10000),
      supabaseAdmin
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .gte('submitted_at', priorISO)
        .lt('submitted_at', sinceISO),
      supabaseAdmin
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .or('status.is.null,status.eq.pending'),
      supabaseAdmin.from('challenges').select('id, title, slug'),
    ])

    for (const r of [
      uploadsRes,
      prevUploadsRes,
      subsRes,
      prevSubsRes,
      pendingRes,
      challengesRes,
    ]) {
      if (r.error) throw new Error(r.error.message)
    }

    const titleById = Object.fromEntries(
      (challengesRes.data || []).map((c) => [c.id, c.title])
    )
    const titleBySlug = Object.fromEntries(
      (challengesRes.data || []).map((c) => [c.slug, c.title])
    )

    const uploads = uploadsRes.data || []
    const subs = subsRes.data || []

    const uniqueUploaders = new Set(uploads.map((u) => u.user_id)).size
    const finishedLooks = uploads.filter((u) => u.step_number === 4).length
    const uploadsByChallenge = countBy(
      uploads,
      (u) => titleById[u.challenge_id] || 'Unassigned'
    )
    const uploadsByStep = countBy(uploads, (u) =>
      u.step_number === 4 ? 'Finished look' : `Step ${u.step_number}`
    )

    const subsByStatus = countBy(subs, (s) => s.status || 'pending')
    const subsByChallenge = countBy(
      subs,
      (s) =>
        titleBySlug[s.challenge_slug] ||
        titleById[s.challenge_id] ||
        s.challenge_slug ||
        'Unknown'
    )

    const fmt = (d) =>
      d.toLocaleDateString('en-NZ', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Pacific/Auckland',
      })
    const range = `${fmt(since)} – ${fmt(now)}`

    const html = `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h2 style="margin-bottom:2px">Style Challenge: weekly report</h2>
    <div style="color:#888;margin-bottom:20px">${esc(range)}</div>

    <h3>📸 Image uploads</h3>
    <p style="font-size:28px;margin:4px 0"><b>${uploads.length}</b> <span style="font-size:13px;color:#888">${delta(uploads.length, prevUploadsRes.count)}</span></p>
    <ul style="margin-top:0">
      <li>${uniqueUploaders} stylists uploaded</li>
      <li>${finishedLooks} finished looks</li>
    </ul>
    <table style="width:100%;border-collapse:collapse"><tr><td colspan="2"><b>By challenge</b></td></tr>${tableRows(uploadsByChallenge)}</table>
    <table style="width:100%;border-collapse:collapse;margin-top:10px"><tr><td colspan="2"><b>By step</b></td></tr>${tableRows(uploadsByStep)}</table>

    <h3 style="margin-top:28px">📬 Submissions to Patrick</h3>
    <p style="font-size:28px;margin:4px 0"><b>${subs.length}</b> <span style="font-size:13px;color:#888">${delta(subs.length, prevSubsRes.count)}</span></p>
    <ul style="margin-top:0">
      <li>${pendingRes.count ?? 'n/a'} still awaiting a decision (all time)</li>
    </ul>
    <table style="width:100%;border-collapse:collapse"><tr><td colspan="2"><b>By status</b></td></tr>${tableRows(subsByStatus)}</table>
    <table style="width:100%;border-collapse:collapse;margin-top:10px"><tr><td colspan="2"><b>By challenge</b></td></tr>${tableRows(subsByChallenge)}</table>

    <p style="color:#aaa;font-size:12px;margin-top:30px">Sent automatically every Monday morning (NZ time).</p>
  </div>`

    const summary = {
      range,
      uploads: uploads.length,
      uniqueUploaders,
      finishedLooks,
      submissions: subs.length,
      pendingTotal: pendingRes.count,
      recipients: REPORT_RECIPIENTS,
    }

    if (dry) return NextResponse.json({ ok: true, dry: true, summary, html })

    if (!SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY not set')
    await sgMail.send({
      to: REPORT_RECIPIENTS,
      from: SENDGRID_FROM,
      subject: `Style Challenge weekly report (${range})`,
      html,
    })

    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    console.error('weekly-report failed:', err)
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    )
  }
}
