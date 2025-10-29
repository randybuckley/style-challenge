cat > middleware.js <<'EOF'
import { NextResponse } from 'next/server'

/**
 * Allow unauthenticated access to:
 * - /review/[token] (the feedback form page)
 * - /api/review/* (decision + reject API handlers)
 * - common public assets
 */
const ALLOW_PREFIXES = [
  '/review/',
  '/api/review/',
  '/_next',
  '/static',
  '/favicon.ico',
  '/images',
]

export function middleware(req) {
  const { pathname } = req.nextUrl

  // If path starts with any allowlisted prefix, let it through untouched.
  if (ALLOW_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Otherwise, do nothing here (preserves existing working flows).
  return NextResponse.next()
}

/**
 * Run on all routes (except static asset files with extensions),
 * so our allowlist above actually applies.
 */
export const config = {
  matcher: ['/((?!.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp|css|js|map)$).*)'],
}
EOF