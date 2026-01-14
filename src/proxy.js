// src/middleware.js
import { NextResponse } from 'next/server'

export function proxy(req) {
  const url = new URL(req.url)

  // Intercept only the decision endpoint
  if (url.pathname === '/api/review/decision') {
    const action = (url.searchParams.get('action') || '').toLowerCase()
    const token  = url.searchParams.get('token') || ''

    // If it's a REJECT link (including older emails), force-redirect to the reviewer UI
    if (action === 'reject' && token) {
      return NextResponse.redirect(
        `${url.origin}/review/${encodeURIComponent(token)}`,
        { status: 302 }
      )
    }
  }

  // Everything else proceeds normally (including APPROVE)
  return NextResponse.next()
}

// Only run this middleware for the decision endpoint
export const config = {
  matcher: ['/api/review/decision'],
}
