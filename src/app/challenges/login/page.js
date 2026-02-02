// src/app/challenges/login/page.js
'use client'

import { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { isInAppBrowser, getOpenInBrowserInstructions } from '@/lib/inAppBrowser'

function ChallengesLoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  const [showInAppWarning, setShowInAppWarning] = useState(false)
  const [copied, setCopied] = useState(false)

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

    // If already signed in, go straight to Pro menu
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const sessionUser = data?.session?.user
      if (sessionUser) {
        router.replace('/challenges/menu')
      }
    })

    return () => {
      active = false
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
      setMessage('Please enter your email.')
      return
    }

    setSubmitting(true)
    setMessage('Preparing your sign-in link…')

    try {
      // Clear any stale session
      await supabase.auth.signOut().catch(() => {})

      const nextPath = '/challenges/menu'

      // Fallback in case email client strips query params
      try {
        localStorage.setItem('pc_next', nextPath)
      } catch {}

      const callback = new URL('/auth/callback', window.location.origin)
      callback.searchParams.set('flow', 'pro')
      callback.searchParams.set('next', nextPath)

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: callback.toString(),
        },
      })

      setMessage(
        error
          ? `Couldn’t send link: ${error.message}`
          : 'Check your email for your sign-in link. Open it on this device.'
      )
    } catch (err) {
      console.error(err)
      setMessage('Something went wrong. Please try again.')
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
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
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
            alt="Patrick Cameron Style Challenge"
            width={220}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>
      </div>

      {/* ✅ EXACT Vimeo embed (zero drift) */}
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
          title="Patrick Cameron – Style Challenge Introduction"
        />
      </div>

      <h1 style={{ fontSize: '1.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        Welcome to the Style Challenge
      </h1>

      <p
        style={{
          maxWidth: 520,
          marginBottom: '1.25rem',
          color: '#ccc',
          fontSize: '1rem',
          lineHeight: 1.45,
        }}
      >
        If you’re an Access Long Hair subscriber, sign in using the same email you used for your subscription.
        <br />
        If not, you can still sign in to explore the Style Challenge.
        <br />
        <br />
        We’ll send you a secure, single-use magic link.
      </p>

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
            boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
          }}
        >
          {submitting ? 'Sending…' : 'Send Magic Link'}
        </button>
      </form>

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
    </main>
  )
}

export default function ChallengesLoginPage() {
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
      <ChallengesLoginInner />
    </Suspense>
  )
}