'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import SignedInAs from '../../../components/SignedInAs'

export default function RedeemPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isPro, setIsPro] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
        if (sessionErr) console.warn('[redeem] session error:', sessionErr.message)
        const sessionUser = sessionData?.session?.user || null
        if (!sessionUser) {
          router.replace(`/welcome-back?next=${encodeURIComponent('/challenges/redeem')}`)
          return
        }
        if (cancelled) return
        setUser(sessionUser)

        const { data: entRows } = await supabase
          .from('user_entitlements')
          .select('tier')
          .eq('user_id', sessionUser.id)
          .eq('tier', 'pro')
          .eq('is_active', true)
          .limit(1)

        if (!cancelled) setIsPro(!!entRows?.length)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [router])

  if (loading) {
    return (
      <main style={loadingShell}>
        <p>Loading…</p>
      </main>
    )
  }

  if (!user) return null

  return (
    <div style={pageShell}>
      <main style={pageMain}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Image src="/logo.jpeg" alt="Patrick Cameron Style Challenge" width={220} height={0} style={{ height: 'auto', maxWidth: '100%' }} priority />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <SignedInAs />
        </div>

        {isPro ? (
          <div style={successBlock}>
            <div style={successIcon}>✅</div>
            <h1 style={heading}>You already have Pro access</h1>
            <p style={bodyText}>Your account is fully unlocked. Enjoy the collections.</p>
            <Link href="/challenges/menu" style={primaryBtn}>
              Go to Collections
            </Link>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h1 style={heading}>I already have access</h1>
              <p style={bodyText}>
                Choose how you were given access to Style Challenge Pro.
              </p>
            </div>

            {/* Subscriber pathway */}
            <Link href="/challenges/redeem/subscriber" style={pathwayCard}>
              <div style={pathwayCardLeft}>
                <div style={pathwayEyebrow}>Membership</div>
                <div style={pathwayTitle}>Access Long Hair member</div>
                <p style={pathwayDesc}>
                  Pro access is included with your Access Long Hair subscription.
                </p>
              </div>
              <div style={chevron}>›</div>
            </Link>

            {/* Promo code pathway */}
            <Link href="/challenges/redeem/promo" style={pathwayCard}>
              <div style={pathwayCardLeft}>
                <div style={pathwayEyebrow}>Code</div>
                <div style={pathwayTitle}>I have a promo code</div>
                <p style={pathwayDesc}>
                  From your salon, academy, or product company.
                </p>
              </div>
              <div style={chevron}>›</div>
            </Link>

            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <Link href="/challenges/upgrade" style={backLink}>
                ← Back to upgrade options
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

/* -------- styles -------- */

const loadingShell = {
  minHeight: '100vh',
  background: '#000',
  color: '#e5e7eb',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const pageShell = {
  minHeight: '100vh',
  background: '#000',
  display: 'flex',
  justifyContent: 'center',
}

const pageMain = {
  width: '100%',
  maxWidth: 520,
  padding: '2.5rem 1.25rem 4rem',
  color: '#e5e7eb',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  boxSizing: 'border-box',
}

const heading = {
  fontSize: '1.6rem',
  fontWeight: 800,
  margin: '0 0 12px',
  color: '#f9fafb',
}

const bodyText = {
  fontSize: '0.95rem',
  color: '#94a3b8',
  lineHeight: 1.6,
  margin: 0,
}

const successBlock = {
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
}

const successIcon = {
  fontSize: '2.5rem',
}

const primaryBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.75rem 1.8rem',
  borderRadius: 999,
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  color: '#0b1120',
  fontWeight: 800,
  fontSize: '1rem',
  textDecoration: 'none',
}

const pathwayCard = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  background: '#0b1120',
  border: '1px solid #1e293b',
  borderRadius: 16,
  padding: '1.2rem 1.3rem',
  marginBottom: 12,
  textDecoration: 'none',
  color: 'inherit',
  cursor: 'pointer',
}

const pathwayCardLeft = {
  flex: 1,
}

const pathwayEyebrow = {
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#64748b',
  fontWeight: 700,
  marginBottom: 4,
}

const pathwayTitle = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#f9fafb',
  marginBottom: 4,
}

const pathwayDesc = {
  fontSize: '0.85rem',
  color: '#64748b',
  lineHeight: 1.5,
  margin: 0,
}

const chevron = {
  fontSize: '1.4rem',
  color: '#475569',
  flexShrink: 0,
}

const backLink = {
  fontSize: '0.85rem',
  color: '#475569',
  textDecoration: 'none',
}