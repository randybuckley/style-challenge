// src/app/page.js
'use client'

import { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'

function HomeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const demo = searchParams.get('demo') === '1'

  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [user, setUser] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    setMounted(true)

    // ✅ demo: in demo mode, do not touch Supabase session or redirect
    if (demo) {
      return () => {
        active = false
      }
    }

    // Check existing session and send logged-in users to /challenge
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const sessionUser = data.session?.user
      if (sessionUser) {
        setUser(sessionUser)
        router.push('/challenge')
      }
    })

    return () => {
      active = false
    }
  }, [router, demo])

  const handleMagicLink = async (e) => {
    e.preventDefault()
    if (submitting) return

    // ✅ demo: block magic-link in demo mode
    if (demo) {
      setMessage('Demo mode is enabled. Magic link login is disabled.')
      return
    }

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      setMessage('❌ Please enter your email.')
      return
    }

    setSubmitting(true)
    setMessage('Preparing your magic link...')

    try {
      // Clear any stale session before sending a fresh link
      await supabase.auth.signOut().catch(() => {})

      // Minimal transition-safe routing for root (historically MVP):
      // Explicitly send flow=mvp with a next destination that matches existing behaviour.
      const nextPath = '/challenge'

      // belt-and-braces fallback (in case email client strips query params)
      try {
        localStorage.setItem('pc_next', nextPath)
      } catch {}

      const callbackUrl = new URL('/auth/callback', window.location.origin)
      callbackUrl.searchParams.set('flow', 'mvp')
      callbackUrl.searchParams.set('next', nextPath)

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: callbackUrl.toString(),
        },
      })

      setMessage(
        error
          ? `❌ Login failed: ${error.message}`
          : '📧 Check your email for a fresh login link. (Magic links are single-use.)'
      )
    } catch (err) {
      console.error(err)
      setMessage('❌ Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted) return null

  // --- Demo placeholder card styles ---
  const demoCard = {
    background: '#fff',
    color: '#000',
    borderRadius: 12,
    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
    padding: '1.5rem',
    maxWidth: 720,
    width: '100%',
    marginBottom: '1.5rem',
  }

  const demoCardInner = {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '1.25rem',
    alignItems: 'start',
  }

  // --- Strong “container” styling around the placeholder image ---
  const placeholderFrame = {
    background: '#fff',
    borderRadius: 12,
    padding: 12,
    border: '1px solid #e6e6e6',
    boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
  }

  const placeholderInner = {
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid #dcdcdc',
    background: '#f7f7f7',
  }

  const placeholderCaption = {
    marginTop: 10,
    fontSize: '0.9rem',
    color: '#555',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  }

  const captionPill = {
    display: 'inline-block',
    padding: '0.25rem 0.6rem',
    borderRadius: 999,
    background: '#f1f1f1',
    border: '1px solid #e1e1e1',
    fontSize: '0.8rem',
    color: '#444',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  }

  return (
    <main
      style={{
        backgroundColor: '#000',
        color: '#fff',
        fontFamily: 'sans-serif',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        textAlign: 'center',
        padding: '2rem 1rem',
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div
          style={{
            display: 'inline-block',
            padding: 10,
            border: '2px solid #1d1d1d',
            background: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          <Image
            src="/logo.jpeg"
            alt="Style Challenge Logo"
            width={220}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>
      </div>

      {/* Intro video / Demo placeholder */}
      {demo ? (
        <div style={demoCard}>
          {/* Keep ONLY the placeholder card; remove the duplicate “Demo Mode” copy below */}
          <div style={demoCardInner}>
            <div style={placeholderFrame}>
              <div style={placeholderInner}>
                <Image
                  src="/demo/images/video_placeholder_intro.jpeg"
                  alt="Demo introduction"
                  width={1200}
                  height={675}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                  priority
                />
              </div>

              <div style={placeholderCaption}>
                <span style={captionPill}>Video placeholder</span>
                <span style={{ fontSize: '0.85rem', color: '#666' }}>
                  Live video loads when Wi-Fi is available
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            maxWidth: 640,
            aspectRatio: '16 / 9',
            marginBottom: '1.5rem',
            position: 'relative',
          }}
        >
          <iframe
            src="https://player.vimeo.com/video/1138306428?h=ef9c1092a9&badge=0&autopause=0&player_id=0&app_id=58479"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: '2px solid #555',
              borderRadius: '6px',
            }}
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            title="Opening video"
          />
        </div>
      )}

      {/* Headline & copy */}
      <h1 style={{ fontSize: '1.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        Welcome to the Style Challenge
      </h1>

      <p
        style={{
          maxWidth: 520,
          marginBottom: '1.25rem',
          color: '#ccc',
          fontSize: '1rem',
          lineHeight: 1.4,
        }}
      >
        {demo ? (
          <>
            Demo mode is enabled.
            <br />
            Enter the demo without logging in.
          </>
        ) : (
          <>
            Log in to start your styling journey.
            <br />
            Magic links are single-use for your security.
          </>
        )}
      </p>

      {/* Login form / Demo entry */}
      {demo ? (
        <div style={{ width: '100%', maxWidth: 320 }}>
          <button
            type="button"
            onClick={() => router.push('/challenges/starter-style/step1?demo=1')}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: '1rem',
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
            }}
          >
            Enter Demo
          </button>
        </div>
      ) : !user ? (
        <form
          onSubmit={handleMagicLink}
          style={{
            width: '100%',
            maxWidth: 320,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #555',
              borderRadius: 6,
              fontSize: '1rem',
              color: '#fff',
              backgroundColor: '#222',
              textAlign: 'center',
            }}
            aria-label="Email address"
          />

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: submitting ? '#6c757d' : '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: '1rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              transition: 'opacity 0.2s',
              opacity: submitting ? 0.9 : 1,
              boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
            }}
          >
            {submitting ? 'Sending…' : 'Send Magic Link'}
          </button>
        </form>
      ) : (
        <p style={{ color: '#0f0', marginTop: '1rem', marginBottom: '1.5rem' }}>
          ✅ You are already logged in
        </p>
      )}

      {/* Status message */}
      {message && (
        <p
          style={{
            fontSize: '0.95rem',
            color: '#ccc',
            marginTop: '1rem',
            maxWidth: 520,
          }}
        >
          {message}
        </p>
      )}

      {/* ✅ demo: debug strip only in demo mode */}
      {demo && (
        <p style={{ fontSize: '0.8rem', color: '#777', marginTop: '1rem' }}>
          demo: true
        </p>
      )}
    </main>
  )
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: '100vh',
            background: '#000',
            color: '#ccc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'sans-serif',
            padding: '2rem 1rem',
            textAlign: 'center',
          }}
        >
          Loading…
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  )
}