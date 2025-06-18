'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [user, setUser] = useState(null)
  const [isMounted, setIsMounted] = useState(false)
  const router = useRouter()

  // Wait until component is mounted to prevent hydration mismatch
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
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) {
      setMessage(`❌ Login failed: ${error.message}`)
    } else {
      setMessage('📧 Check your email for a login link.')
    }
  }

  if (!isMounted) return null // Wait to mount

  if (user) return <p>Redirecting to challenge...</p>

  return (
    <main style={{ maxWidth: 500, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Style Challenge Login</h1>
      <form onSubmit={handleMagicLink}>
        <label>Email:<br />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ width: '100%', marginTop: '0.5rem' }}
          />
        </label>
        <br />
        <button type="submit" style={{ marginTop: '1rem' }}>Send Magic Link</button>
      </form>
      {message && <p>{message}</p>}
    </main>
  )
}