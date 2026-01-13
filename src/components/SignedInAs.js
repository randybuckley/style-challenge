'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Minimal, non-invasive helper for Pro pages.
 * - Shows the signed-in email when available.
 * - Safe in demo/admin contexts (shows nothing if no user).
 * - No routing side effects.
 */
export default function SignedInAs() {
  const [email, setEmail] = useState('')

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const e = data?.session?.user?.email || ''
        if (mounted) setEmail(e)
      } catch {
        // swallow; component is purely informational
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

  if (!email) return null

  return (
    <div
      style={{
        marginTop: 10,
        textAlign: 'center',
        fontSize: 12,
        color: '#9ca3af',
      }}
    >
      Signed in as {email}
    </div>
  )
}