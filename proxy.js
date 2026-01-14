// middleware.js
import { NextResponse } from 'next/server'

/**
 * Minimal middleware.
 *
 * Purpose:
 * - Ensure middleware is valid JS (no shell/heredoc lines)
 * - Allow unauthenticated access to public review + API endpoints
 * - Otherwise do nothing (preserves existing working flows)
 */
const ALLOW_PREFIXES = [
  // Review pages + APIs
  '/review/',
  '/api/review/',

  // Portfolio PDF API (Pro)
  '/api/pro-portfolio',

  // Certification/review submission (if used)
  '/api/review-certification',
  '/api/review-certification/',

  // Certificate generation endpoints (if used)
  '/api/certificates',
  '/api/certificates/',

  // Other API endpoints you may have in prod
  '/api/generate',
  '/api/generate/',

  // Next.js internals + common public assets
  '/_next',
  '/static',
  '/favicon.ico',
  '/images',
]

export function proxy(req) {
  const { pathname } = req.nextUrl

  // Allowlisted prefixes pass straight through.
  if (ALLOW_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Default: do nothing.
  return NextResponse.next()
}

/**
 * Run on all routes except static files with extensions.
 * (So the allowlist applies to app routes + API routes.)
 */
export const config = {
  matcher: ['/((?!.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp|css|js|map)$).*)'],
}