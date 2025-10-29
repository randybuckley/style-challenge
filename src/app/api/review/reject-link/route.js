// src/app/api/review/reject-link/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export async function GET(req) {
  const url = new URL(req.url)
  const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin
  const token = (url.searchParams.get('token') || '').trim()
  const userEmail = (url.searchParams.get('userEmail') || '').trim()

  if (!token || !userEmail) {
    return NextResponse.redirect(`${origin}/challenge/certify?msg=error`, 302)
  }

  try {
    await supabase
      .from('review_tokens')
      .upsert(
        { token, user_email: userEmail, created_at: new Date().toISOString() },
        { onConflict: 'token' }
      )
  } catch { /* ignore; we still pass userEmail below */ }

  // include userEmail in query as a fallback for the form POST
  return NextResponse.redirect(`${origin}/review/${encodeURIComponent(token)}?userEmail=${encodeURIComponent(userEmail)}`, 302)
}