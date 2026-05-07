// src/app/api/review/reject-quick/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const site = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/+$/, '')
  const token = (searchParams.get('token') || '').trim()

  if (!token) {
    return NextResponse.redirect(`${site}/challenges/menu`)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Look up the submission
  const { data: submission } = await supabase
    .from('submissions')
    .select('email, first_name, second_name, challenge_slug')
    .eq('review_token', token)
    .maybeSingle()

  // Mark as rejected
  await supabase
    .from('submissions')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('review_token', token)

  // Build redirect to confirmation page with stylist details
  const params = new URLSearchParams()
  if (submission?.email) params.set('to', submission.email)
  if (submission?.first_name) params.set('name', submission.first_name)
  if (submission?.challenge_slug) params.set('slug', submission.challenge_slug)

  return NextResponse.redirect(`${site}/review/not-approved?${params.toString()}`)
}

export function POST() {
  return new NextResponse('Method Not Allowed', { status: 405 })
}