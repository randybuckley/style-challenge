'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'

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
        router.replace(
          `/welcome-back?next=${encodeURIComponent('/challenges/redeem')}`
        )
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

    if (!code.trim()) {
      setMessage('Please enter a promo code.')
      return
    }

    if (!user) {
      setMessage('You must be signed in to redeem a code.')
      return
    }

    setSubmitting(true)

    try {
      // 1. Look up promo code
      const { data: promo, error: promoErr } = await supabase
        .from('promo_codes')
        .select('id, code, is_active, max_uses, used_count')
        .eq('code', code.trim())
        .maybeSingle()

      if (promoErr) {
        setMessage('Error validating promo code.')
        setSubmitting(false)
        return
      }

      if (!promo) {
        setMessage('Invalid promo code.')
        setSubmitting(false)
        return
      }

      if (!promo.is_active) {
        setMessage('This promo code is not active.')
        setSubmitting(false)
        return
      }

      if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
        setMessage('This promo code has reached its usage limit.')
        setSubmitting(false)
        return
      }

      // 2. Insert user entitlement
      const { error: entErr } = await supabase
        .from('user_entitlements')
        .insert([
          {
            user_id: user.id,
            promo_code_id: promo.id
          }
        ])

      if (entErr) {
        setMessage('Error assigning entitlement to your account.')
        setSubmitting(false)
        return
      }

      // 3. Increment usage count
      await supabase
        .from('promo_codes')
        .update({ used_count: promo.used_count + 1 })
        .eq('id', promo.id)

      // 4. Flip is_pro flag
      await supabase
        .from('profiles')
        .update({ is_pro: true })
        .eq('id', user.id)

      // 5. Done → go to collections menu
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
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          margin: '0 auto'
        }}
      >
        {/* Logo */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '1.75rem'
          }}
        >
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={260}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        {/* Card */}
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
            Enter your promo code from Access Long Hair TV or one of our partner
            salons or colleges to unlock the Patrick Cameron Style Challenge
            collections.
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
                boxShadow: '0 12px 30px rgba(34,197,94,0.38)',
                transition: 'transform 0.08s ease-out, box-shadow 0.08s ease-out'
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