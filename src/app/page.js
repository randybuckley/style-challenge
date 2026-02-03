// src/app/page.js
'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { isInAppBrowser, getOpenInBrowserInstructions } from '@/lib/inAppBrowser'

export default function HomePage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [user, setUser] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [showInAppWarning, setShowInAppWarning] = useState(false)
  const [copied, setCopied] = useState(false)

  // Prevent double work / loops
  const backfillAttemptedRef = useRef(false)
  const redirectAttemptedRef = useRef(false)

  const attemptVimeoOttBackfill = async (session) => {
    if (backfillAttemptedRef.current) return
    backfillAttemptedRef.current = true

    const accessToken = session?.access_token
    if (!accessToken) return

    try {
      await fetch('/api/vimeo-ott/backfill-pro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      }).catch(() => {})
    } catch {
      // Intentionally ignore backfill errors to avoid blocking login UX
    }
  }

  const redirectToMenuOnce = () => {
    if (redirectAttemptedRef.current) return
    redirectAttemptedRef.current = true
    router.push('/challenges/menu')
  }

  useEffect(() => {
    let active = true
    setMounted(true)

    // In-app browser warning (camera/uploads can break)
    try {
      const ua = navigator.userAgent || ''
      setShowInAppWarning(isInAppBrowser(ua))
    } catch {
      setShowInAppWarning(false)
    }

    // If already logged in, backfill PRO (if needed), then send to Pro menu
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      const session = data.session
      const sessionUser = session?.user
      if (sessionUser) {
        setUser(sessionUser)
        await attemptVimeoOttBackfill(session)
        redirectToMenuOnce()
      }
    })

    // Also handle first-time SIGNED_IN (magic link)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        await attemptVimeoOttBackfill(session)
        redirectToMenuOnce()
      }
    })

    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [router])

  const handleCopyLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (!url) return

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: prompt copy
      try {
        window.prompt('Copy this link:', url)
      } catch {}
    }
  }

  const handleMagicLink = async (e) => {
    e.preventDefault()
    if (submitting) return

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      setMessage('❌ Please enter your email.')
      return
    }

    setSubmitting(true)
    setMessage('Preparing your magic link...')

    try {
      // Store Pro intent as a fallback for callback routing
      try {
        localStorage.setItem('pc_next', '/challenges/menu')
      } catch {}

      // Clear any stale session before sending a fresh link
      await supabase.auth.signOut().catch(() => {})

      const baseOrigin =
        (process.env.NEXT_PUBLIC_SITE_URL || '').trim() ||
        (typeof window !== 'undefined' ? window.location.origin : '')

      // Make Pro routing explicit in the callback URL
      const callbackUrl = new URL('/auth/callback', baseOrigin)
      callbackUrl.searchParams.set('next', '/challenges/menu')
      callbackUrl.searchParams.set('flow', 'pro')

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: callbackUrl.toString(),
        },
      })

      setMessage(
        error
          ? `❌ Login failed: ${error.message}`
          : '📧 Check your email for a secure sign-in link. (Magic links are single-use.)'
      )
    } catch (err) {
      console.error(err)
      setMessage('❌ Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted) return null

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
      {showInAppWarning && (
        <div
          style={{
            width: '100%',
            maxWidth: 680,
            border: '1px solid #444',
            background: '#111',
            padding: '0.9rem 1rem',
            borderRadius: 8,
            marginBottom: '1.25rem',
            boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Open in Safari / Chrome for best results</div>
          <div style={{ color: '#ccc', fontSize: '0.95rem', lineHeight: 1.4 }}>
            Some in-app browsers (Facebook, Yahoo, etc.) can block camera and uploads.
            <br />
            {getOpenInBrowserInstructions()}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                padding: '0.55rem 0.9rem',
                background: '#2b2b2b',
                border: '1px solid #555',
                borderRadius: 6,
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {copied ? '✅ Link copied' : 'Copy this link'}
            </button>
            <button
              type="button"
              onClick={() => setShowInAppWarning(false)}
              style={{
                padding: '0.55rem 0.9rem',
                background: 'transparent',
                border: '1px solid #555',
                borderRadius: 6,
                color: '#ccc',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Logo */}
      <div style={{ marginBottom: '1.5rem' }}>
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

      {/* Intro video */}
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

      <h1 style={{ fontSize: '1.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        Welcome to the Style Challenge
      </h1>

      <p style={{ maxWidth: 520, marginBottom: '1.5rem', color: '#ccc', fontSize: '1rem', lineHeight: 1.45 }}>
        If you’re an Access Long Hair subscriber, sign in using the same email you used for your subscription.
        <br />
        If not, you can still sign in to explore the Style Challenge.
        <br />
        <br />
        We’ll send you a secure, single-use magic link.
      </p>

      {!user ? (
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
              borderRadius: 4,
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
              borderRadius: 4,
              fontSize: '1rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              transition: 'opacity 0.2s',
              opacity: submitting ? 0.9 : 1,
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

      {message && (
        <p style={{ fontSize: '0.95rem', color: '#ccc', marginTop: '1rem', maxWidth: 520 }}>
          {message}
        </p>
      )}
    </main>
  )
}