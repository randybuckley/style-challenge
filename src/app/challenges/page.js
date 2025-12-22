'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function ChallengesPage() {
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      // 1. Check session
      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession()

      if (sessionErr) {
        console.error('Session error:', sessionErr.message)
        if (!cancelled) setError('Error checking your session.')
        setLoading(false)
        return
      }

      const sessionUser = sessionData?.session?.user || null
      if (!sessionUser) {
        router.replace(`/welcome-back?next=${encodeURIComponent('/challenges')}`)
        return
      }

      if (cancelled) return
      setUser(sessionUser)

      // 2. Load profile (to determine is_pro)
      const { data: profData, error: profErr } = await supabase
        .from('profiles')
        .select('id, is_pro')
        .eq('id', sessionUser.id)
        .maybeSingle()

      if (profErr) {
        console.error('Profile error:', profErr.message)
        if (!cancelled) setError('Error loading your profile.')
        setLoading(false)
        return
      }

      if (cancelled) return
      setProfile({
        id: profData?.id || sessionUser.id,
        is_pro: !!profData?.is_pro,
      })

      // 3. Load challenges
      const { data: challengeData, error: challengeErr } = await supabase
        .from('challenges')
        .select(
          'id, slug, title, tier, is_pro_only, thumbnail_url, is_active'
        )
        .eq('is_active', true)
        .order('id', { ascending: true })

      if (challengeErr) {
        console.error('Challenge error:', challengeErr.message)
        if (!cancelled) setError('Error loading challenges.')
        setLoading(false)
        return
      }

      if (cancelled) return

      const cleaned = (challengeData || []).map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title || 'Untitled Challenge',
        tier: c.tier || null,
        is_pro_only: !!c.is_pro_only,
        thumbnail_url: c.thumbnail_url || null,
      }))

      setChallenges(cleaned)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [router])

  const isPro = !!profile?.is_pro

  // Starter challenge (free)
  const starterChallenge =
    challenges.find((ch) => ch.slug === 'starter-style') || null

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
          maxWidth: 900,
          padding: '2.5rem 1.25rem 3rem',
          color: '#e5e7eb',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {/* Logo */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '1.75rem',
          }}
        >
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={260}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        {/* Hero video */}
        <section
          style={{
            maxWidth: 720,
            margin: '0 auto 1.75rem auto',
          }}
        >
          <div
            style={{
              position: 'relative',
              paddingTop: '56.25%',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 18px 45px rgba(0,0,0,0.6)',
              border: '1px solid #1f2937',
            }}
          >
            <iframe
              src="https://player.vimeo.com/video/1138306428?h=ef9c1092a9&badge=0&autopause=0&player_id=0&app_id=58479"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              title="Opening video"
            />
          </div>
        </section>

        {/* Title + intro */}
        <section
          style={{
            textAlign: 'center',
            maxWidth: 720,
            margin: '0 auto 2.25rem auto',
          }}
        >
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 600,
              color: '#f9fafb',
              marginBottom: '0.5rem',
            }}
          >
            Patrick Cameron Style Challenge
          </h1>
          <p
            style={{
              fontSize: '0.98rem',
              lineHeight: 1.6,
              color: '#e5e7eb',
              marginBottom: 0,
            }}
          >
            Let me take the fear out of dressing long hair. Complete the
            challenge, upload your photos to build your professional portfolio
            to share. When you’re ready, submit your work for review — and if
            approved, I’ll award you with a Patrick Cameron certificate.
          </p>
        </section>

        {/* Loading / error */}
        {loading && (
          <p
            style={{
              textAlign: 'center',
              fontSize: '0.85rem',
              color: '#9ca3af',
              marginBottom: '1.5rem',
            }}
          >
            Loading your challenges…
          </p>
        )}

        {error && !loading && (
          <div
            style={{
              maxWidth: 720,
              margin: '0 auto 1.5rem auto',
              padding: '0.9rem 1rem',
              borderRadius: 12,
              backgroundColor: '#450a0a',
              border: '1px solid #fecaca',
              color: '#fee2e2',
              fontSize: '0.9rem',
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        )}

        {/* Try it free – Starter Style */}
        <section
          style={{
            maxWidth: 720,
            margin: '0 auto 2rem auto',
          }}
        >
          <div
            style={{
              borderRadius: 16,
              background:
                'radial-gradient(circle at top, #020617 0, #020617 45%, #020617 100%)',
              border: '1px solid #1e293b',
              padding: '1.1rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.75rem',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  flex: '1 1 220px',
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid #1f2937',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src="/Drafts/finished_reference.jpeg"
                    alt="Starter Style finished look"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#9ca3af',
                      marginBottom: '0.15rem',
                    }}
                  >
                    Try it free
                  </div>
                  <div
                    style={{
                      fontSize: '0.98rem',
                      fontWeight: 600,
                      color: '#f9fafb',
                      marginBottom: '0.15rem',
                    }}
                  >
                    Starter Style Challenge
                  </div>
                  <p
                    style={{
                      fontSize: '0.85rem',
                      color: '#cbd5f5',
                      margin: 0,
                    }}
                  >
                    Start the Signature Style Challenge before you unlock the
                    Style Challenge Collections.
                  </p>
                </div>
              </div>

              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <Link
                  href="/challenge/step1"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.65rem 1.4rem',
                    borderRadius: 999,
                    background:
                      'linear-gradient(135deg, #22c55e, #16a34a, #22c55e)',
                    color: '#0b1120',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    boxShadow: '0 12px 30px rgba(34,197,94,0.35)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Start free challenge
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Unlock – promo code */}
        <section
          style={{
            maxWidth: 720,
            margin: '0 auto 2.25rem auto',
          }}
        >
          <div
            style={{
              borderRadius: 16,
              background:
                'radial-gradient(circle at top left, #022c22 0, #022c22 30%, #020617 100%)',
              border: '1px solid #064e3b',
              padding: '1.2rem 1.3rem 1.3rem',
            }}
          >
            <div
              style={{
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#bbf7d0',
                marginBottom: '0.25rem',
              }}
            >
              Unlock the Challenges
            </div>
            <h2
              style={{
                fontSize: '1.02rem',
                fontWeight: 600,
                color: '#ecfdf5',
                marginBottom: '0.35rem',
              }}
            >
              Use your promo code to unlock Style Challenge.
            </h2>
            <p
              style={{
                fontSize: '0.9rem',
                color: '#d1fae5',
                marginBottom: '0.85rem',
              }}
            >
              Please use the promo code from Access Long Hair TV or one of our
              partner salons. Enter yours here to unlock Style Challenge.
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                alignItems: 'center',
              }}
            >
              <Link
                href="/challenges/redeem"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.7rem 1.5rem',
                  borderRadius: 999,
                  backgroundColor: '#22c55e',
                  color: '#022c22',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 10px 26px rgba(34,197,94,0.45)',
                  whiteSpace: 'nowrap',
                }}
              >
                Redeem promo code
              </Link>

              <span
                style={{
                  fontSize: '0.8rem',
                  color: '#a7f3d0',
                }}
              >
                Don’t have a code?{' '}
                <a
                  href="https://www.patrickcameronaccesslonghairtv.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#6ee7b7',
                    textDecoration: 'underline',
                  }}
                >
                  Subscribe to Access Long Hair TV
                </a>{' '}
                to receive one.
              </span>
            </div>
          </div>
        </section>

        {/* Collection One – Essentials */}
        <section
          style={{
            maxWidth: 720,
            margin: '0 auto 1.75rem auto',
          }}
        >
          <div
            style={{
              borderRadius: 16,
              background:
                'radial-gradient(circle at top, #020617 0, #020617 55%, #020617 100%)',
              border: '1px solid #1f2937',
              padding: '1.25rem 1.25rem 1.5rem',
            }}
          >
            <div
              style={{
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#9ca3af',
                textAlign: 'center',
                marginBottom: '0.35rem',
              }}
            >
              Collection One
            </div>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 600,
                color: '#f9fafb',
                textAlign: 'center',
                marginBottom: '0.4rem',
              }}
            >
              Patrick Cameron Essentials
            </h2>
            <p
              style={{
                fontSize: '0.9rem',
                lineHeight: 1.6,
                color: '#e5e7eb',
                textAlign: 'center',
                maxWidth: 620,
                margin: '0 auto 0.85rem auto',
              }}
            >
              Ten styles, easy to learn yet powerful in the salon. Equip
              yourself with key achievable styles your clients will love and you
              can make money with in the salon.
            </p>

            {/* Placeholder grid */}
            <div
              style={{
                marginTop: '1.1rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                gap: 6,
                maxWidth: 520,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              {Array.from({ length: 10 }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    position: 'relative',
                    paddingTop: '135%',
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: '1px solid #111827',
                    backgroundColor: '#020617',
                  }}
                >
                  <img
                    src="/style_one/finished_reference.jpeg"
                    alt={`Essentials style ${idx + 1}`}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Collection Two – Party Styles */}
        <section
          style={{
            maxWidth: 720,
            margin: '0 auto',
          }}
        >
          <div
            style={{
              borderRadius: 16,
              background:
                'radial-gradient(circle at top, #020617 0, #020617 55%, #020617 100%)',
              border: '1px solid #1f2937',
              padding: '1.1rem 1.25rem 1.35rem',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#9ca3af',
                marginBottom: '0.35rem',
              }}
            >
              Collection Two
            </div>
            <h2
              style={{
                fontSize: '1.05rem',
                fontWeight: 600,
                color: '#f9fafb',
                marginBottom: '0.3rem',
              }}
            >
              Party Styles – coming soon
            </h2>
            <p
              style={{
                fontSize: '0.88rem',
                lineHeight: 1.5,
                color: '#e5e7eb',
                maxWidth: 540,
                margin: '0 auto',
              }}
            >
              A full party-hair collection designed for time-pressed stylists
              who need beautiful, camera-ready looks that photograph well and
              keep clients coming back.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}