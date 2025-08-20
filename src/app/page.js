'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient' // If your @ alias isn't set, use: '../lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [user, setUser] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    setMounted(true)

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
  }, [router])

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
      // Clear any stale session before sending a fresh link
      await supabase.auth.signOut().catch(() => {})

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          // In prod, consider NEXT_PUBLIC_SITE_URL for absolute domain
          emailRedirectTo: `${window.location.origin}/auth/callback`,
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
      {/* Logo (no stretch) */}
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
          src="https://player.vimeo.com/video/1096804683?badge=0&autopause=0&player_id=0&app_id=58479&dnt=1"
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
          allowFullScreen
          title="Welcome to the Style Challenge"
        />
      </div>

      {/* Headline & copy */}
      <h1 style={{ fontSize: '1.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        Welcome to the Style Challenge
      </h1>
      <p style={{ maxWidth: 420, marginBottom: '1.5rem', color: '#ccc', fontSize: '1rem' }}>
        Log in to start your styling journey.
        <br />
        Magic links are single-use for your security.
      </p>

      {/* Login form */}
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

      {/* Status message */}
      {message && (
        <p style={{ fontSize: '0.95rem', color: '#ccc', marginTop: '1rem', maxWidth: 420 }}>
          {message}
        </p>
      )}
    </main>
  )
}