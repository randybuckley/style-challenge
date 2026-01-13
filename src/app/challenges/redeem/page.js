// src/app/challenges/redeem/page.js
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'
import SignedInAs from '../../../components/SignedInAs'

export default function RedeemPage() {
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const sessionUser = sessionData?.session?.user || null

      if (!sessionUser) {
        router.replace(`/welcome-back?next=${encodeURIComponent('/challenges/redeem')}`)
        return
      }

      if (!cancelled) {
        setUser(sessionUser)
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [router])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')

    const cleanCode = code.trim()

    if (!cleanCode) {
      setMessage('Please enter a promo code.')
      return
    }

    if (!user) {
      setMessage('You must be signed in to redeem a code.')
      return
    }

    setSubmitting(true)

    try {
      // 1) Look up promo code
      const { data: promo, error: promoErr } = await supabase
        .from('promo_codes')
        .select('id, code, tier, is_active, max_uses, used_count')
        .eq('code', cleanCode)
        .maybeSingle()

      if (promoErr) {
        console.error('promo lookup error:', promoErr)
        setMessage(`Error validating promo code: ${promoErr.message}`)
        return
      }

      if (!promo) {
        setMessage('Invalid promo code.')
        return
      }

      if (!promo.is_active) {
        setMessage('This promo code is not active.')
        return
      }

      if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
        setMessage('This promo code has reached its usage limit.')
        return
      }

      // IMPORTANT: user_entitlements enforces tier IN ('free','pro')
      const tier = (promo.tier || '').toLowerCase()
      if (tier !== 'free' && tier !== 'pro') {
        setMessage(
          `Promo code tier is invalid in DB: "${promo.tier}". Must be "free" or "pro".`
        )
        return
      }

      // 1.5) Ensure profiles row exists (prevents FK violation on user_entitlements.user_id)
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({ id: user.id }, { onConflict: 'id' })

      if (profileErr) {
        console.error('profiles upsert error:', profileErr)
        setMessage(`Error preparing your account: ${profileErr.message}`)
        return
      }

      // 2) Insert user entitlement (matches NOT NULL constraints)
      const { error: entErr } = await supabase.from('user_entitlements').insert([
        {
          user_id: user.id,
          tier,
          granted_by_code: promo.code,
          promo_code_id: promo.id
          // granted_at defaults to now() in DB
        }
      ])

      if (entErr) {
        console.error('entitlement insert error:', entErr)
        setMessage(`Error assigning entitlement: ${entErr.message}`)
        return
      }

      // 3) Increment usage count (best-effort)
      const { error: useErr } = await supabase
        .from('promo_codes')
        .update({ used_count: (promo.used_count || 0) + 1 })
        .eq('id', promo.id)

      if (useErr) {
        console.warn('used_count update error:', useErr)
        // Don't block user; entitlement already granted
      }

      // 4) Done → go to collections menu
      router.replace('/challenges/menu')
    } catch (err) {
      console.error(err)
      setMessage('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: '#000',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
        }}
      >
        <p>Loading…</p>
      </main>
    )
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#000',
        color: '#e5e7eb',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '2.5rem 1.25rem 3rem',
        fontFamily:
          'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={260}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        {/* Signed-in identity strip */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <SignedInAs
            style={{
              fontSize: '0.85rem',
              color: '#9ca3af',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              padding: '0.35rem 0.65rem',
              borderRadius: 999
            }}
          />
        </div>

        <section
          style={{
            borderRadius: 16,
            background:
              'radial-gradient(circle at top, #020617 0, #020617 55%, #020617 100%)',
            border: '1px solid #1f2937',
            padding: '1.6rem 1.5rem 1.7rem'
          }}
        >
          <h1
            style={{
              fontSize: '1.4rem',
              fontWeight: 600,
              color: '#f9fafb',
              marginBottom: '0.5rem',
              textAlign: 'center'
            }}
          >
            Redeem Promo Code
          </h1>

          <p
            style={{
              fontSize: '0.9rem',
              lineHeight: 1.6,
              color: '#d1d5db',
              marginBottom: '1.4rem',
              textAlign: 'center'
            }}
          >
            Enter your promo code from Access Long Hair TV or one of our partner salons or
            colleges to unlock the Patrick Cameron Style Challenge collections.
          </p>

          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              width: '100%'
            }}
          >
            <input
              type="text"
              placeholder="Enter your promo code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{
                padding: '0.75rem 0.9rem',
                borderRadius: 10,
                border: '1px solid #374151',
                background: '#f9fafb',
                color: '#111827',
                fontSize: '0.95rem',
                boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
                outline: 'none'
              }}
            />

            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '0.8rem 1rem',
                borderRadius: 999,
                background: submitting
                  ? '#15803d'
                  : 'linear-gradient(135deg, #22c55e, #16a34a, #22c55e)',
                color: '#0b1120',
                border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '0.95rem',
                boxShadow: '0 12px 30px rgba(34,197,94,0.38)'
              }}
            >
              {submitting ? 'Redeeming…' : 'Redeem code'}
            </button>
          </form>

          {message && (
            <p
              style={{
                marginTop: '1rem',
                fontSize: '0.85rem',
                color: '#e5e7eb',
                textAlign: 'center'
              }}
            >
              {message}
            </p>
          )}
        </section>
      </div>
    </main>
  )
}