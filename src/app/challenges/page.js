// src/app/challenges/page.js
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function ChallengesPage() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      // Always treat /challenges as an alias of /challenges/menu (Pro canonical)
      const target = '/challenges/menu'

      // If user is not signed in, send them to welcome-back with explicit next
      const { data, error } = await supabase.auth.getSession()

      if (cancelled) return

      if (error) {
        console.error('Session error:', error.message)
        router.replace(`/welcome-back?next=${encodeURIComponent(target)}`)
        return
      }

      const sessionUser = data?.session?.user || null
      if (!sessionUser) {
        router.replace(`/welcome-back?next=${encodeURIComponent(target)}`)
        return
      }

      // Signed in → go straight to Pro menu
      router.replace(target)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [router])

  // Minimal shell while redirecting
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily:
          'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <p>Loading your collections…</p>
    </main>
  )
}