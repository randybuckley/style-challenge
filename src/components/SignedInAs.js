'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function SignedInAs({ style }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const load = async () => {
      const { data } = await supabase.auth.getSession()
      const sessionEmail = data?.session?.user?.email || ''
      if (active) {
        setEmail(sessionEmail)
        setLoading(false)
      }
    }

    load()

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return
        setEmail(session?.user?.email || '')
      }
    )

    return () => {
      active = false
      subscription?.subscription?.unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/welcome-back')
  }

  if (loading || !email) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        ...style
      }}
    >
      <span>Signed in as {email}.</span>
      <button
        onClick={handleSignOut}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          color: 'inherit',
          textDecoration: 'underline',
          cursor: 'pointer',
          fontSize: 'inherit'
        }}
        aria-label="Sign out"
      >
        No you? Sign out here.
      </button>
    </div>
  )
}