// src/app/challenges/login/page.js
'use client'

import { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

function ChallengesLoginInner() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    let active = true
    setMounted(true)

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
          : 'Check your email for your sign-in link. Open it on this device. (Magic links are single-use.)'
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

      {/* Copy */}
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
        If you’re an Access Long Hair subscriber, sign in using the same email you used for your subscription.
        <br />
        If not, you can still sign in to explore the Style Challenge.
        <br />
        <br />
        We’ll send you a secure, single-use magic link.
      </p>

      {/* Login form */}
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