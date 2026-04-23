'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import SignedInAs from '../../../../components/SignedInAs'

export default function SubscriberRedeemPage() {
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isPro, setIsPro] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('') // 'success' | 'error'

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
        if (sessionErr) console.warn('[subscriber] session error:', sessionErr.message)
        const sessionUser = sessionData?.session?.user || null
        if (!sessionUser) {
          router.replace(`/welcome-back?next=${encodeURIComponent('/challenges/redeem/subscriber')}`)
          return
        }
        if (cancelled) return
        setUser(sessionUser)
        await checkEntitlement(sessionUser.id)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [router])

  const checkEntitlement = async (userId) => {
    const { data: entRows, error: entErr } = await supabase
      .from('user_entitlements')
      .select('tier')
      .eq('user_id', userId)
      .eq('tier', 'pro')
      .eq('is_active', true)
      .limit(1)
    if (entErr) console.warn('[subscriber] entitlement check error:', entErr.message)
    const pro = !entErr && !!entRows?.length
    setIsPro(pro)
    return pro
  }

  const handleActivate = async () => {
    if (!user || refreshing) return
    setRefreshing(true)
    setMessage('')

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      if (accessToken) {
        await fetch('/api/vimeo-ott/backfill-pro', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({}),
        }).catch(() => {})
      }

      const pro = await checkEntitlement(user.id)

      if (pro) {
        setMessageType('success')
        setMessage('✅ Pro access confirmed! Taking you to your collections…')
        setTimeout(() => router.push('/challenges/menu'), 1500)
      } else {
        setMessageType('error')
        setMessage(
          "We couldn't find an active Access Long Hair subscription linked to your email address. Make sure you're signed in with the same email you subscribed with. If the problem persists, contact us at info@accesslonghair.com"
        )
      }
    } catch {
      setMessageType('error')
      setMessage('Something went wrong. Please try again in a moment. If the problem persists, contact us at info@accesslonghair.com')
    } finally {
      setRefreshing(false)
    }
  }

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
          <div style={contentBlock}>

            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={eyebrow}>Access Long Hair member</div>
              <h1 style={heading}>Activate your Pro access</h1>
              <p style={bodyText}>
                Pro access to Style Challenge is included with your Access Long Hair membership —
                there's nothing extra to pay.
              </p>
            </div>

            {/* Instructions card */}
            <div style={infoCard}>
              <div style={stepRow}>
                <div style={stepNumber}>1</div>
                <p style={stepText}>
                  Make sure you're signed in to Style Challenge with the <strong>same email address</strong> you used to subscribe to Access Long Hair.
                </p>
              </div>
              <div style={stepRow}>
                <div style={stepNumber}>2</div>
                <p style={stepText}>
                  Tap the button below. We'll check your subscription and unlock Pro access automatically.
                </p>
              </div>
              <div style={stepRow}>
                <div style={stepNumber}>3</div>
                <p style={stepText}>
                  Once confirmed, you'll be taken straight to your collections.
                </p>
              </div>
            </div>

            {/* Signed in as reminder */}
            <div style={signedInReminder}>
              <span style={signedInLabel}>Currently signed in as</span>
              <span style={signedInEmail}>{user.email}</span>
            </div>

            <button
              onClick={handleActivate}
              disabled={refreshing}
              style={refreshing ? primaryBtnDisabled : primaryBtnEl}
            >
              {refreshing ? 'Checking your subscription…' : 'Activate my Pro access'}
            </button>

            {message && (
              <div style={messageType === 'success' ? messageSuccess : messageError}>
                {message}
              </div>
            )}

            {/* Not yet subscribed */}
            <div style={divider} />

            <div style={{ textAlign: 'center' }}>
              <p style={mutedText}>Not yet a member of Access Long Hair?</p>
              
                <a href="https://www.patrickcameronaccesslonghairtv.com/" target="_blank" rel="noopener noreferrer" style={externalLink}>Subscribe to Access Long Hair</a>
            </div>

            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <Link href="/challenges/upgrade" style={backLink}>
                ← Other ways to unlock Pro
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

const eyebrow = {
  fontSize: '0.75rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#22c55e',
  fontWeight: 700,
  marginBottom: 8,
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

const contentBlock = {
  display: 'flex',
  flexDirection: 'column',
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

const infoCard = {
  background: '#0b1120',
  border: '1px solid #1e293b',
  borderRadius: 16,
  padding: '1.2rem 1.4rem',
  marginBottom: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const stepRow = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 14,
}

const stepNumber = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: 'rgba(34,197,94,0.15)',
  border: '1px solid rgba(34,197,94,0.35)',
  color: '#22c55e',
  fontSize: '0.85rem',
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const stepText = {
  fontSize: '0.9rem',
  color: '#cbd5e1',
  lineHeight: 1.55,
  margin: 0,
}

const signedInReminder = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  marginBottom: 16,
  padding: '0.75rem',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
}

const signedInLabel = {
  fontSize: '0.75rem',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const signedInEmail = {
  fontSize: '0.9rem',
  color: '#e5e7eb',
  fontWeight: 600,
}

const primaryBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  padding: '0.85rem 1rem',
  borderRadius: 999,
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  color: '#0b1120',
  fontWeight: 800,
  fontSize: '1rem',
  textDecoration: 'none',
  boxSizing: 'border-box',
}

const primaryBtnEl = {
  ...primaryBtn,
  border: 'none',
  cursor: 'pointer',
}

const primaryBtnDisabled = {
  ...primaryBtnEl,
  opacity: 0.6,
  cursor: 'not-allowed',
}

const messageSuccess = {
  marginTop: 14,
  padding: '0.9rem 1rem',
  borderRadius: 12,
  background: 'rgba(34,197,94,0.1)',
  border: '1px solid rgba(34,197,94,0.3)',
  color: '#22c55e',
  fontSize: '0.9rem',
  lineHeight: 1.5,
}

const messageError = {
  marginTop: 14,
  padding: '0.9rem 1rem',
  borderRadius: 12,
  background: 'rgba(248,113,113,0.08)',
  border: '1px solid rgba(248,113,113,0.3)',
  color: '#fca5a5',
  fontSize: '0.9rem',
  lineHeight: 1.5,
}

const divider = {
  height: 1,
  background: '#1e293b',
  margin: '24px 0',
}

const mutedText = {
  fontSize: '0.88rem',
  color: '#64748b',
  marginBottom: 8,
}

const externalLink = {
  fontSize: '0.95rem',
  color: '#22c55e',
  textDecoration: 'underline',
  fontWeight: 600,
}

const backLink = {
  fontSize: '0.85rem',
  color: '#475569',
  textDecoration: 'none',
}