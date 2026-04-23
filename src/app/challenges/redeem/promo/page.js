'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import SignedInAs from '../../../../components/SignedInAs'

export default function PromoRedeemPage() {
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isPro, setIsPro] = useState(false)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('') // 'success' | 'error'

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
        if (sessionErr) console.warn('[promo] session error:', sessionErr.message)
        const sessionUser = sessionData?.session?.user || null
        if (!sessionUser) {
          router.replace(`/welcome-back?next=${encodeURIComponent('/challenges/redeem/promo')}`)
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

  const handleRedeem = async (e) => {
    e.preventDefault()
    setMessage('')
    const trimmed = (code || '').trim().toUpperCase()

    if (!trimmed) {
      setMessageType('error')
      setMessage('Please enter your promo code.')
      return
    }

    if (!user) {
      setMessageType('error')
      setMessage('You must be signed in to redeem a promo code.')
      return
    }

    setSubmitting(true)

    try {
      const { data: promoRows, error: promoErr } = await supabase
        .from('promo_codes')
        .select('id, is_active, used_count, max_uses')
        .eq('code', trimmed)
        .limit(1)

      if (promoErr) {
        setMessageType('error')
        setMessage(`Error validating promo code: ${promoErr.message}`)
        return
      }

      const promo = promoRows?.[0]

      if (!promo) {
        setMessageType('error')
        setMessage('That promo code isn\'t recognised. Check for typos and try again.')
        return
      }

      if (!promo.is_active) {
        setMessageType('error')
        setMessage('That promo code is no longer active.')
        return
      }

      const used = Number(promo.used_count || 0)
      const limit = promo.max_uses == null ? null : Number(promo.max_uses)

      if (limit != null && used >= limit) {
        setMessageType('error')
        setMessage('That promo code has reached its usage limit. Contact your salon or academy for a new one.')
        return
      }

      const { error: entErr } = await supabase
        .from('user_entitlements')
        .upsert(
          {
            user_id: user.id,
            tier: 'pro',
            is_active: true,
            granted_at: new Date().toISOString(),
            granted_by_code: trimmed,
            promo_code_id: promo.id,
          },
          { onConflict: 'user_id,tier' }
        )

      if (entErr) {
        setMessageType('error')
        setMessage(`Could not unlock access: ${entErr.message}`)
        return
      }

      // Update used_count
      await supabase
        .from('promo_codes')
        .update({ used_count: used + 1 })
        .eq('id', promo.id)

      // Update profiles fast-path cache
      await supabase
        .from('profiles')
        .update({ is_pro: true, is_pro_since: new Date().toISOString() })
        .eq('id', user.id)

      setIsPro(true)
      setMessageType('success')
      setMessage('✅ Pro access unlocked! Taking you to your collections…')
      setTimeout(() => router.push('/challenges/menu'), 1500)

    } finally {
      setSubmitting(false)
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
              <div style={eyebrow}>Promo code</div>
              <h1 style={heading}>Unlock Pro with a code</h1>
              <p style={bodyText}>
                Promo codes are provided by salons, academies, and product companies
                as part of their partnership with Style Challenge.
              </p>
            </div>

            {/* Code entry card */}
            <div style={formCard}>
              <label style={inputLabel}>Enter your promo code</label>
              <form onSubmit={handleRedeem}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. SALON2024"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  style={codeInput}
                />
                <button
                  type="submit"
                  disabled={submitting}
                  style={submitting ? primaryBtnDisabled : primaryBtnEl}
                >
                  {submitting ? 'Checking your code…' : 'Unlock Pro access'}
                </button>
              </form>

              {message && (
                <div style={messageType === 'success' ? messageSuccess : messageError}>
                  {message}
                </div>
              )}
            </div>

            {/* Help text */}
            <div style={helpCard}>
              <div style={helpTitle}>Where do promo codes come from?</div>
              <p style={helpText}>
                Codes are issued to salons, hairdressing academies, and product companies
                who partner with Style Challenge. If you were told you'd receive a code,
                check with whoever gave you access.
              </p>
              <p style={helpText}>
                If you're having trouble, contact us at{' '}
                <a href="mailto:info@accesslonghair.com" style={emailLink}>
                  info@accesslonghair.com
                </a>
              </p>
            </div>

            <div style={{ textAlign: 'center', marginTop: 8 }}>
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
  color: '#facc15',
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

const formCard = {
  background: '#0b1120',
  border: '1px solid #1e293b',
  borderRadius: 16,
  padding: '1.4rem',
  marginBottom: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const inputLabel = {
  fontSize: '0.88rem',
  color: '#94a3b8',
  fontWeight: 600,
}

const codeInput = {
  width: '100%',
  padding: '0.85rem 1rem',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#f9fafb',
  fontSize: '1.1rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  boxSizing: 'border-box',
  marginBottom: 4,
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
  marginTop: 4,
  padding: '0.9rem 1rem',
  borderRadius: 12,
  background: 'rgba(34,197,94,0.1)',
  border: '1px solid rgba(34,197,94,0.3)',
  color: '#22c55e',
  fontSize: '0.9rem',
  lineHeight: 1.5,
}

const messageError = {
  marginTop: 4,
  padding: '0.9rem 1rem',
  borderRadius: 12,
  background: 'rgba(248,113,113,0.08)',
  border: '1px solid rgba(248,113,113,0.3)',
  color: '#fca5a5',
  fontSize: '0.9rem',
  lineHeight: 1.5,
}

const helpCard = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid #1e293b',
  borderRadius: 14,
  padding: '1.1rem 1.2rem',
  marginBottom: 16,
}

const helpTitle = {
  fontSize: '0.88rem',
  fontWeight: 700,
  color: '#cbd5e1',
  marginBottom: 8,
}

const helpText = {
  fontSize: '0.85rem',
  color: '#64748b',
  lineHeight: 1.55,
  margin: '0 0 8px',
}

const emailLink = {
  color: '#22c55e',
  textDecoration: 'underline',
}

const backLink = {
  fontSize: '0.85rem',
  color: '#475569',
  textDecoration: 'none',
}