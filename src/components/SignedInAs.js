'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'

/**
 * SignedInAs
 * - Shows signed-in email when available.
 * - Optional "Not you? Sign out" action.
 * - Safe in demo/admin contexts (renders nothing if no user).
 * - No side effects unless user clicks sign out.
 */
export default function SignedInAs({
  style,
  showSignOut = true,
  signOutLabel = 'Not you? Sign out',
  afterSignOutPath = '/challenges/login',
}) {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const e = data?.session?.user?.email || ''
        if (mounted) setEmail(e)
      } catch {
        // purely informational
      }
    }

    load()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setEmail(session?.user?.email || '')
    })

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
    } catch {
      // even if signOut fails, we still route to login to avoid trapping the user
    } finally {
      setSigningOut(false)
      router.replace(afterSignOutPath)
    }
  }

  if (!email) return null

  const pillStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 10,
    textAlign: 'center',
    fontSize: 12,
    color: '#9ca3af',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    padding: '0.35rem 0.65rem',
    borderRadius: 999,
    ...style,
  }

  const linkStyle = {
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    color: '#facc15',
    fontSize: 12,
    fontWeight: 700,
    cursor: signingOut ? 'not-allowed' : 'pointer',
    textDecoration: 'none',
  }

  return (
    <div style={pillStyle}>
      <span>Signed in as {email}</span>

      {showSignOut && (
        <>
          <span style={{ opacity: 0.35 }}>•</span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            style={linkStyle}
            aria-label="Sign out"
            title="Sign out"
          >
            {signingOut ? 'Signing out…' : signOutLabel}
          </button>
        </>
      )}
    </div>
  )
}