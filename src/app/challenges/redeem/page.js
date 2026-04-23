// src/app/challenges/redeem/page.js
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import SignedInAs from '../../../components/SignedInAs'

export default function RedeemPage() {
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isPro, setIsPro] = useState(false)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')

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
    if (entErr) console.warn('[redeem] entitlement check error:', entErr.message)
    const pro = !entErr && !!entRows?.length
    setIsPro(pro)
    return pro
  }

  const refreshAccess = async () => {
    if (!user || refreshing) return
    setRefreshing(true)
    setRefreshMessage('Checking your subscription...')
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
        setRefreshMessage('✅ Pro access confirmed! Redirecting...')
        setTimeout(() => router.push('/challenges/menu'), 1000)
      } else {
        setRefreshMessage(
          "We couldn't find an active subscription linked to your email. If you've just subscribed, wait a minute or two and try again. If the problem persists, contact us at info@accesslonghair.com"
        )
      }
    } catch {
      setRefreshMessage(
        'Something went wrong. Please try again in a moment. If the problem persists, contact us at info@accesslonghair.com'
      )
    } finally {
      setRefreshing(false)
    }
  }

  const onRedeem = async (e) => {
    e.preventDefault()
    setMessage('')
    const trimmed = (code || '').trim().toUpperCase()
    if (!trimmed) { setMessage('Please enter your promo code.'); return }
    if (!user) { setMessage('You must be signed in to redeem a promo code.'); return }
    setSubmitting(true)
    try {
      const { data: promoRows, error: promoErr } = await supabase
        .from('promo_codes')
        .select('id, is_active, usage_count, usage_limit')
        .eq('code', trimmed)
        .limit(1)
      if (promoErr) { setMessage(`Error validating promo code: ${promoErr.message}`); return }
      const promo = promoRows?.[0]
      if (!promo) { setMessage('That promo code is not recognised.'); return }
      if (!promo.is_active) { setMessage('That promo code is not currently active.'); return }
      const used = Number(promo.usage_count || 0)
      const limit = promo.usage_limit == null ? null : Number(promo.usage_limit)
      if (limit != null && used >= limit) { setMessage('That promo code has reached its usage limit.'); return }
      const { error: entErr } = await supabase
        .from('user_entitlements')
        .upsert(
          { user_id: user.id, tier: 'pro', is_active: true },
          { onConflict: 'user_id,tier' }
        )
      if (entErr) { setMessage(`Could not unlock access: ${entErr.message}`); return }
      try {
        await supabase.from('promo_codes').update({ usage_count: used + 1 }).eq('id', promo.id)
      } catch (err) {
        console.warn('[redeem] usage_count update failed:', err)
      }
      setIsPro(true)
      router.replace('/challenges/menu')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: '#000', color: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading...</p>
      </main>
    )
  }

  if (!user) return null

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', justifyContent: 'center' }}>
      <main style={{ width: '100%', maxWidth: 960, padding: '2.5rem 1.25rem 3rem', color: '#e5e7eb', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' }}>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Image src="/logo.jpeg" alt="Patrick Cameron Style Challenge" width={260} height={0} style={{ height: 'auto', maxWidth: '100%' }} priority />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <SignedInAs />
        </div>

        {isPro ? (
          <section style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto' }}>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 700 }}>You already have Pro access</h1>
            <p style={{ marginTop: 8, lineHeight: 1.6 }}>Your account is fully unlocked.</p>
            <div style={{ marginTop: 18 }}>
              <Link href="/challenges/menu" style={{ display: 'inline-block', padding: '0.7rem 1.6rem', borderRadius: 999, background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#0b1120', fontWeight: 800, textDecoration: 'none' }}>
                Go to Collections
              </Link>
            </div>
          </section>
        ) : (
          <section style={{ maxWidth: 560, margin: '0 auto' }}>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 700, textAlign: 'center', marginBottom: 20 }}>
              Unlock Pro Access
            </h1>

            <div style={{ borderRadius: 16, background: '#0b1120', border: '1px solid rgba(255,255,255,0.1)', padding: '1.4rem', marginBottom: 16 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 6, color: '#f9fafb' }}>
                Access Long Hair subscriber
              </h2>
              <p style={{ fontSize: '0.95rem', color: '#9ca3af', lineHeight: 1.6, marginBottom: 14 }}>
                Pro access is included with your Access Long Hair subscription. Use the same email address you subscribed with.
              </p>
              <button
                type="button"
                onClick={refreshAccess}
                disabled={refreshing}
                style={{ width: '100%', padding: '0.75rem', borderRadius: 999, border: 'none', background: refreshing ? 'rgba(148,163,184,0.2)' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: refreshing ? '#9ca3af' : '#0b1120', fontWeight: 800, cursor: refreshing ? 'not-allowed' : 'pointer', fontSize: '1rem' }}
              >
                {refreshing ? 'Checking...' : 'Activate my Pro access'}
              </button>
              {refreshMessage && (
                <p style={{ marginTop: 12, fontSize: '0.9rem', lineHeight: 1.5, color: '#9ca3af' }}>
                  {refreshMessage}
                </p>
              )}
              <p style={{ marginTop: 14, fontSize: '0.85rem', color: '#6b7280', textAlign: 'center' }}>
                Not yet subscribed?{' '}
                <a href="https://www.patrickcameronaccesslonghairtv.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#22c55e', textDecoration: 'underline' }}>
                  Subscribe to Access Long Hair
                </a>
              </p>
            </div>

            <div style={{ borderRadius: 16, background: '#0b1120', border: '1px solid rgba(255,255,255,0.1)', padding: '1.4rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 6, color: '#f9fafb' }}>
                Have a promo code?
              </h2>
              <p style={{ fontSize: '0.95rem', color: '#9ca3af', lineHeight: 1.6, marginBottom: 14 }}>
                Enter the code you received from a partner salon or college.
              </p>
              <form onSubmit={onRedeem}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter promo code"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: '#f9fafb', fontSize: '1rem', boxSizing: 'border-box' }}
                />
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ marginTop: 12, width: '100%', padding: '0.75rem', borderRadius: 999, border: 'none', background: submitting ? 'rgba(148,163,184,0.2)' : 'linear-gradient(135deg, #facc15, #f59e0b)', color: submitting ? '#9ca3af' : '#0b1120', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '1rem' }}
                >
                  {submitting ? 'Checking...' : 'Unlock access'}
                </button>
                {message && (
                  <p style={{ marginTop: 10, fontSize: '0.9rem', color: '#9ca3af' }}>
                    {message}
                  </p>
                )}
              </form>
            </div>

          </section>
        )}
      </main>
    </div>
  )
}