'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [user, setUser] = useState(null)
  const [isMounted, setIsMounted] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setIsMounted(true)

    supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user
      if (sessionUser) {
        setUser(sessionUser)
        router.push('/challenge')
      }
    })
  }, [router])

  const handleMagicLink = async (e) => {
    e.preventDefault()
    setMessage('Preparing your magic link...')

    await supabase.auth.signOut() // ✅ clear any old session

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + '/auth/callback',
      },
    })

    setMessage(
      error
        ? `❌ Login failed: ${error.message}`
        : '📧 Check your email for a fresh login link. (Remember: links can only be used once!)'
    )
  }

  if (!isMounted) return null

  return (
    <main
      style={{
        backgroundColor: '#000',
        color: '#fff',
        fontFamily: 'sans-serif',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',      // ✅ Center horizontally
        justifyContent: 'flex-start',
        textAlign: 'center',
        padding: '2rem 1rem',
      }}
    >
      {/* Logo */}
      <img
        src="/logo.jpeg"
        alt="Style Challenge Logo"
        style={{ width: '220px', height: 'auto', marginBottom: '1.5rem' }}
      />

      {/* Video */}
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          aspectRatio: '16 / 9',
          marginBottom: '1.5rem',
        }}
      >
        <iframe
          src="https://player.vimeo.com/video/1096804683?badge=0&autopause=0&player_id=0&app_id=58479&dnt=1"
          style={{
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

      {/* Welcome Text */}
      <h1 style={{ fontSize: '1.8rem', fontWeight: '600', marginBottom: '0.75rem' }}>
        Welcome to the Style Challenge
      </h1>
      <p style={{ maxWidth: '420px', marginBottom: '1.5rem', color: '#ccc', fontSize: '1rem' }}>
        Log in to start your styling journey.
        <br />
        Magic links are single‑use for your security.
      </p>

      {/* Login Form */}
      {!user ? (
        <form
          onSubmit={handleMagicLink}
          style={{
            width: '100%',
            maxWidth: '320px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',  // ✅ Center the form elements
          }}
        >
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #555',
              borderRadius: '4px',
              fontSize: '1rem',
              color: '#fff',
              backgroundColor: '#222',
              textAlign: 'center',
              marginBottom: '1rem',
            }}
          />
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: 'pointer',
              marginBottom: '1.5rem',
            }}
          >
            Send Magic Link
          </button>
        </form>
      ) : (
        <p style={{ color: '#0f0', marginTop: '1rem', marginBottom: '1.5rem' }}>
          ✅ You are already logged in
        </p>
      )}

      {/* Status Message */}
      {message && (
        <p style={{ fontSize: '0.9rem', color: '#ccc', marginTop: '0.5rem' }}>
          {message}
        </p>
      )}
    </main>
  )
}