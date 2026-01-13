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
      const target = '/challenges/menu'

      const { data, error } = await supabase.auth.getSession()
      if (cancelled) return

      const sessionUser = data?.session?.user || null

      // Unknown user (or session lookup error) → Pro login landing
      if (error || !sessionUser) {
        router.replace('/challenges/login')
        return
      }

      // Known user → welcome-back confirmation (then continue to target)
      router.replace(`/welcome-back?next=${encodeURIComponent(target)}`)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [router])

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
      <p>Loading…</p>
    </main>
  )
}