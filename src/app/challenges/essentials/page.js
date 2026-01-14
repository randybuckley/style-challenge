// src/app/challenges/essentials/page.js
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import SignedInAs from '../../../components/SignedInAs'

export default function EssentialsCollectionPage() {
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ✅ entitlement source-of-truth
  const [isPro, setIsPro] = useState(false)

  // status keyed by slug:
  // portfolio: 'not-started' | 'in-progress' | 'complete'
  // certificate: 'not-submitted' | 'in-progress' | 'complete'
  const [portfolioStatus, setPortfolioStatus] = useState({})
  const [certificateStatus, setCertificateStatus] = useState({})

  // Styles in the Essentials collection (placeholder list for now)
  // NOTE: Style 1 currently points to starter-style, but launches from THIS page are Pro-gated.
  const styles = Array.from({ length: 10 }).map((_, i) => {
    const n = i + 1
    const slug = n === 1 ? 'starter-style' : `essentials-${n}`
    return {
      number: n,
      slug,
      title: `Essentials Style ${n}`,
      // only style 1 live until you wire real content
      isLive: n === 1,
      // placeholder thumb until you have real images
      thumbSrc: '/style_one/finished_reference.jpeg',
      // where to launch (only for live)
      launchHref: n === 1 ? '/challenges/starter-style/step1' : null,
    }
  })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        // 1) Session
        const { data: sessionData, error: sessionErr } =
          await supabase.auth.getSession()

        if (sessionErr) {
          console.error('Session error:', sessionErr.message)
          if (!cancelled) setError('Error checking your session.')
          return
        }

        const sessionUser = sessionData?.session?.user || null
        if (!sessionUser) {
          router.replace(
            `/welcome-back?next=${encodeURIComponent('/challenges/essentials')}`
          )
          return
        }

        if (cancelled) return
        setUser(sessionUser)

        // 2) Entitlement gate (single source of truth: user_entitlements)
        try {
          const { data: entRows, error: entErr } = await supabase
            .from('user_entitlements')
            .select('tier')
            .eq('user_id', sessionUser.id)
            .eq('tier', 'pro')
            .limit(1)

          if (entErr) {
            console.warn('Entitlement check error:', entErr.message)
            if (!cancelled) setIsPro(false)
          } else {
            if (!cancelled) setIsPro(!!(entRows && entRows.length > 0))
          }
        } catch (e) {
          console.warn('Entitlement check failed:', e)
          if (!cancelled) setIsPro(false)
        }

        // 3) Portfolio status from uploads table (challenge_id -> slug mapping via challenges table)
        const { data: challengeRows, error: chErr } = await supabase
          .from('challenges')
          .select('id, slug, is_active')
          .eq('is_active', true)

        if (chErr) {
          console.warn('Challenges lookup failed:', chErr.message)
        }

        const idToSlug = new Map()
        for (const c of challengeRows || []) {
          if (c?.id && c?.slug) idToSlug.set(c.id, c.slug)
        }

        const { data: uploadRows, error: uploadErr } = await supabase
          .from('uploads')
          .select('challenge_id, step_number')
          .eq('user_id', sessionUser.id)

        const portfolioBySlug = {}
        // default: not-started (until we see uploads)
        for (const s of styles) {
          portfolioBySlug[s.slug] = 'not-started'
        }

        if (!uploadErr && uploadRows && uploadRows.length > 0) {
          const bySlug = new Map()

          for (const row of uploadRows) {
            const sSlug = idToSlug.get(row.challenge_id)
            if (!sSlug) continue
            if (!bySlug.has(sSlug)) bySlug.set(sSlug, new Set())
            bySlug.get(sSlug).add(row.step_number)
          }

          for (const s of styles) {
            const set = bySlug.get(s.slug)
            if (!set || set.size === 0) {
              portfolioBySlug[s.slug] = 'not-started'
            } else if (set.has(1) && set.has(2) && set.has(3) && set.has(4)) {
              portfolioBySlug[s.slug] = 'complete'
            } else {
              portfolioBySlug[s.slug] = 'in-progress'
            }
          }
        }

        if (!cancelled) setPortfolioStatus(portfolioBySlug)

        // 4) Certificate status from submissions table (authoritative)
        const certificateBySlug = {}
        // default: not-submitted (until we see a row)
        for (const s of styles) {
          certificateBySlug[s.slug] = 'not-submitted'
        }

        try {
          const { data: submissionRows, error: subErr } = await supabase
            .from('submissions')
            .select('challenge_slug, status')
            .eq('user_id', sessionUser.id)

          if (!subErr && submissionRows && submissionRows.length > 0) {
            const latestBySlug = new Map()

            // If multiple rows exist, we just need to know:
            // - any approved => complete
            // - otherwise => in-progress
            // - none => not-submitted
            for (const row of submissionRows) {
              const sSlug = row?.challenge_slug
              if (!sSlug) continue
              const st = (row.status || '').toLowerCase()
              if (!latestBySlug.has(sSlug)) latestBySlug.set(sSlug, [])
              latestBySlug.get(sSlug).push(st)
            }

            for (const s of styles) {
              const statuses = latestBySlug.get(s.slug)
              if (!statuses || statuses.length === 0) {
                certificateBySlug[s.slug] = 'not-submitted'
              } else if (statuses.some((st) => st === 'approved')) {
                certificateBySlug[s.slug] = 'complete'
              } else {
                certificateBySlug[s.slug] = 'in-progress'
              }
            }
          }
        } catch (err) {
          console.warn('Certificate status check failed:', err)
          // keep defaults
        }

        if (!cancelled) setCertificateStatus(certificateBySlug)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const getPortfolioLabel = (slug) => {
    const status = portfolioStatus[slug] || 'not-started'
    if (status === 'complete') {
      return { text: 'Portfolio — complete', color: '#22c55e' }
    }
    if (status === 'in-progress') {
      return { text: 'Portfolio — in progress', color: '#facc15' }
    }
    return { text: 'Portfolio — not started', color: '#9ca3af' }
  }

  const getCertificateLabel = (slug) => {
    const status = certificateStatus[slug] || 'not-submitted'
    if (status === 'complete') {
      return { text: 'Certificate — complete', color: '#22c55e' }
    }
    if (status === 'in-progress') {
      return { text: 'Certificate — in progress', color: '#facc15' }
    }
    return { text: 'Certificate — not submitted', color: '#9ca3af' }
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          backgroundColor: '#000',
          color: '#e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <p>Loading Essentials…</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main
        style={{
          minHeight: '100vh',
          backgroundColor: '#000',
          color: '#e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <p>Redirecting to sign-in…</p>
      </main>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#000',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <main
        style={{
          width: '100%',
          maxWidth: 960,
          padding: '2.2rem 1.25rem 3rem',
          color: '#e5e7eb',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.1rem' }}>
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={260}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        {/* Signed-in identity strip + tier indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <SignedInAs
              style={{
                fontSize: '0.85rem',
                color: '#9ca3af',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                padding: '0.35rem 0.65rem',
                borderRadius: 999,
              }}
            />
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                padding: '0.35rem 0.6rem',
                borderRadius: 999,
                border: `1px solid ${
                  isPro ? 'rgba(34,197,94,0.45)' : 'rgba(250,204,21,0.45)'
                }`,
                background: 'rgba(255,255,255,0.04)',
                color: isPro ? '#22c55e' : '#facc15',
                textTransform: 'uppercase',
              }}
            >
              {isPro ? 'Pro unlocked' : 'Not unlocked'}
            </span>
          </div>
        </div>

        {/* Title */}
        <section style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 1rem' }}>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: '#f9fafb' }}>
            Patrick Cameron Essentials
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: '#e5e7eb', lineHeight: 1.6 }}>
            A focused set of essential salon styles. Track your progress and launch each style
            from here.
          </p>
        </section>

        {/* Non-pro reminder */}
        {!isPro && (
          <section style={{ maxWidth: 820, margin: '0 auto 1.1rem auto' }}>
            <div
              style={{
                borderRadius: 16,
                background:
                  'radial-gradient(circle at top, #020617 0, #020617 55%, #020617 100%)',
                border: '1px solid rgba(250,204,21,0.35)',
                padding: '0.95rem 1.05rem',
                textAlign: 'center',
              }}
            >
              <div style={{ color: '#e5e7eb', fontSize: '0.92rem' }}>
                You can browse the Essentials collection, but you’ll need to unlock Pro to launch
                Essentials styles and submit for certification.
              </div>
              <div style={{ marginTop: 12 }}>
                <Link
                  href="/challenges/redeem"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.6rem 1.3rem',
                    borderRadius: 999,
                    background: 'linear-gradient(135deg, #facc15, #f59e0b, #facc15)',
                    color: '#0b1120',
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    textDecoration: 'none',
                    boxShadow: '0 12px 30px rgba(250,204,21,0.25)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Redeem a promo code
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Grid */}
        <section style={{ maxWidth: 900, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '0.9rem',
            }}
          >
            {styles.map((s) => {
              const portfolio = getPortfolioLabel(s.slug)
              const certificate = getCertificateLabel(s.slug)

              // ✅ Essentials page is visible to all, but launching from this page is Pro-only.
              const launchBlocked = !isPro

              return (
                <div
                  key={s.slug}
                  style={{
                    borderRadius: 14,
                    border: '1px solid #111827',
                    backgroundColor: '#020617',
                    padding: '0.85rem 0.95rem',
                    display: 'flex',
                    gap: '0.85rem',
                    alignItems: 'center',
                    opacity: launchBlocked ? 0.85 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 12,
                      overflow: 'hidden',
                      border: '1px solid #111827',
                      flexShrink: 0,
                      backgroundColor: '#020617',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <img
                      src={s.thumbSrc}
                      alt={s.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f9fafb' }}>
                      {s.title}
                    </div>

                    {/* ✅ Menu-style progress container */}
                    <div
                      style={{
                        marginTop: 8,
                        display: 'inline-flex',
                        flexDirection: 'column',
                        gap: 6,
                        padding: '0.55rem 0.7rem',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.10)',
                        background: 'rgba(255,255,255,0.04)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          color: portfolio.color,
                          lineHeight: 1.2,
                        }}
                      >
                        {portfolio.text}
                      </div>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          color: certificate.color,
                          lineHeight: 1.2,
                        }}
                      >
                        {certificate.text}
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      {s.isLive ? (
                        launchBlocked ? (
                          <Link href="/challenges/redeem" style={lockedCta}>
                            Locked — redeem code
                          </Link>
                        ) : (
                          <Link href={s.launchHref} style={launchCta}>
                            Launch the challenge
                          </Link>
                        )
                      ) : (
                        <button type="button" disabled style={comingSoonBtn}>
                          Coming soon
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer actions */}
          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <Link
              href="/challenges/menu"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.62rem 1.25rem',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.06)',
                color: '#e5e7eb',
                fontSize: '0.86rem',
                fontWeight: 800,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              ← Back to Collections
            </Link>
          </div>

          {error ? (
            <p style={{ marginTop: 18, color: '#fca5a5', textAlign: 'center' }}>
              {error}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  )
}

const launchCta = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.55rem 1.15rem',
  borderRadius: 999,
  background: 'linear-gradient(135deg, #22c55e, #16a34a, #22c55e)',
  color: '#0b1120',
  fontSize: '0.82rem',
  fontWeight: 700,
  textDecoration: 'none',
  boxShadow: '0 10px 24px rgba(34,197,94,0.35)',
  whiteSpace: 'nowrap',
}

const lockedCta = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.55rem 1.15rem',
  borderRadius: 999,
  border: '1px solid rgba(250,204,21,0.45)',
  backgroundColor: '#020617',
  color: '#facc15',
  fontSize: '0.82rem',
  fontWeight: 800,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

const comingSoonBtn = {
  padding: '0.55rem 1.05rem',
  borderRadius: 999,
  border: '1px dashed #4b5563',
  backgroundColor: '#020617',
  color: '#9ca3af',
  fontSize: '0.82rem',
  fontWeight: 700,
  cursor: 'not-allowed',
  whiteSpace: 'nowrap',
}