// src/components/AuthForm.js
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AuthForm() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })

    return () => {
      try {
        sub?.subscription?.unsubscribe()
      } catch {}
    }
  }, [])

  const handleMagicLinkSignup = async () => {
    setMessage('')

    const cleanEmail = (email || '').trim()
    if (!cleanEmail) {
      setMessage('❌ Please enter your email.')
      return
    }

    // Minimal, transition-safe routing:
    // - If user initiates auth from a /challenges/* URL, treat as Pro.
    // - Otherwise treat as MVP.
    // This prevents Pro users being dumped into /challenge/step1 when the email link is clicked.
    const path = typeof window !== 'undefined' ? window.location.pathname : ''
    const isProContext = path.startsWith('/challenges')

    const nextPath = isProContext ? '/challenges/menu' : '/challenge/step1'
    const flow = isProContext ? 'pro' : 'mvp'

    // Belt-and-braces fallback if an email client strips query params.
    try {
      localStorage.setItem('pc_next', nextPath)
    } catch {}

    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('flow', flow)
    callbackUrl.searchParams.set('next', nextPath)

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: callbackUrl.toString() },
    })

    setMessage(
      error
        ? `❌ Login failed: ${error.message}`
        : '✅ Magic link sent. Check your inbox!'
    )
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setMessage('')
  }

  return (
    <div>
      {!user ? (
        <>
          <label>
            Email:<br />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
          <br />
          <button onClick={handleMagicLinkSignup} style={{ marginTop: '1rem' }}>
            Send Magic Link
          </button>
          {message && <p>{message}</p>}
        </>
      ) : (
        <>
          <p>✅ Logged in as {user.email}</p>
          <button onClick={handleSignOut}>Sign Out</button>
        </>
      )}
    </div>
  )
}