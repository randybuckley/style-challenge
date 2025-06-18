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

    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })
  }, [])

  const handleMagicLinkSignup = async () => {
    const { error } = await supabase.auth.signInWithOtp({ email })
    setMessage(error ? `❌ Login failed: ${error.message}` : '✅ Magic link sent. Check your inbox!')
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
              onChange={e => setEmail(e.target.value)}
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