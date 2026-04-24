'use client'

import { useEffect, useState, Suspense } from 'react'
import Image from 'next/image'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import SignedInAs from '../../../../components/SignedInAs'

function CertificateCheckoutPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()

  const rawSlug = params?.slug
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug || 'starter-style'
  const adminDemo = searchParams.get('admin_demo') === 'true'
  const demo = searchParams.get('demo') === '1'

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (demo) {
        setLoading(false)
        return
      }
      const { data, error: sErr } = await supabase.auth.getSession()
      if (sErr || !data?.session?.user) {
        router.replace('/')
        return
      }
      setUser(data.session.user)
      setLoading(false)
    }
    load()
  }, [router, demo])

  const handleFreeSubmit = async () => {
    setSubmitting(true)
    setError('')

    // Demo mode — skip straight to approved
    if (demo) {
      const qs = []
      if (adminDemo) qs.push('admin_demo=true')
      qs.push('demo=1')
      router.push(`/challenges/${encodeURIComponent(slug)}/result/approved?${qs.join('&')}`)
      return
    }

    try {
      const { data: sessionData, error: sErr } = await supabase.auth.getSession()
      if (sErr) { setError('Session error. Please try again.'); setSubmitting(false); return }

      const uid = sessionData?.session?.user?.id
      const email = sessionData?.session?.user?.email

      if (!uid || !email) { setError('You must be signed in to submit.'); setSubmitting(false); return }

      // Resolve challenge_id from slug
      const { data: challengeRow, error: cErr } = await supabase
        .from('challenges')
        .select('id')
        .eq('slug', slug)
        .single()

      if (cErr || !challengeRow?.id) {
        setError(`Could not identify this challenge. Please go back and try again.`)
        setSubmitting(false)
        return
      }

      const challengeId = challengeRow.id

      // Load latest uploads per step
      const { data: uploadRows, error: uErr } = await supabase
        .from('uploads')
        .select('step_number, image_url, created_at')
        .eq('user_id', uid)
        .in('step_number', [1, 2, 3, 4])
        .order('created_at', { ascending: false })

      if (uErr) {
        setError('Could not load your portfolio images. Please go back and try again.')
        setSubmitting(false)
        return
      }

      const latestImages = {}
      for (const row of uploadRows || []) {
        if (!latestImages[row.step_number]) {
          latestImages[row.step_number] = row.image_url
        }
      }

      const missing = [1, 2, 3, 4].filter((s) => !latestImages[s])
      if (missing.length) {
        setError(
          `Missing image(s): ${missing.map((s) => s === 4 ? 'Finished Look' : `Step ${s}`).join(', ')}. Please go back and upload before submitting.`
        )
        setSubmitting(false)
        return
      }

      const res = await fetch('/api/review/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          userId: uid,
          userEmail: email,
          images: latestImages,
          slug,
          challengeId,
          challenge_id: challengeId,
        }),
      })

      const raw = await res.text()
      let data = {}
      try { data = raw ? JSON.parse(raw) : {} } catch { data = { error: raw } }

      if (res.ok) {
        router.push(`/challenges/${encodeURIComponent(slug)}/result/approved`)
      } else {
        setError(data?.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
      }
    } catch (e) {
      setError(e?.message || 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const backQs = (() => {
    const qs = []
    if (adminDemo) qs.push('admin_demo=true')
    if (demo) qs.push('demo=1')
    return qs.length ? `?${qs.join('&')}` : ''
  })()

  if (loading) {
    return (
      <main style={loadingShell}>
        <p>Loading…</p>
      </main>
    )
  }

  return (
    <div style={pageShell}>
      <main style={pageMain}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={220}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        {!demo && (
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <SignedInAs />
          </div>
        )}

        {/* Heading */}
        <div style={headingBlock}>
          <div style={eyebrow}>Patrick Cameron Certification</div>
          <h1 style={heading}>Get your certificate</h1>
          <p style={subline}>
            Submit your portfolio for personal review by Patrick Cameron.
            Approved work earns a <strong>Patrick Cameron Long Hair Specialist</strong> certificate.
          </p>
        </div>

        {/* Free offer card — launch promotion */}
        <div style={freeCard}>
          <div style={freeCardTop}>
            <div style={launchBadge}>🎉 Launch offer</div>
            <div style={freeTitle}>Free during launch</div>
            <div style={freePriceRow}>
              <span style={freePrice}>Free</span>
              <span style={freePriceNote}>while we're in early access</span>
            </div>
            <p style={freeDesc}>
              We're in early access and certificates are free for everyone right now.
              Submit your work and Patrick will personally review it — at no cost.
            </p>
          </div>

          <button
            onClick={handleFreeSubmit}
            disabled={submitting}
            style={submitting ? freeButtonDisabled : freeButton}
          >
            {submitting ? 'Submitting your work…' : 'Have Patrick check my work — free'}
          </button>

          {error && <p style={errorText}>{error}</p>}
        </div>

        <div style={divider} />

        {/* Coming soon — paid certificate */}
        <div style={paidCard}>
          <div style={comingSoonBadge}>Coming soon</div>
          <div style={paidTitle}>Certificate fee</div>
          <div style={paidPriceRow}>
            <span style={paidPrice}>£19.99</span>
            <span style={paidPriceNote}>per certificate</span>
          </div>
          <p style={paidDesc}>
            Once we leave early access, certificates will be available for a one-time fee per challenge.
            Early adopters who submit now get theirs free — no catch.
          </p>

          {/* Greyed out button */}
          <div style={disabledButton}>
            Pay for certificate — coming soon
          </div>
        </div>

        {/* Back link */}
        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <button
            onClick={() => router.push(`/challenges/${encodeURIComponent(slug)}/certify${backQs}`)}
            style={backButton}
          >
            ← Back to portfolio review
          </button>
        </div>

      </main>
    </div>
  )
}

export default function CertificateCheckoutPageWrapper() {
  return (
    <Suspense fallback={<main style={loadingShell}><p>Loading…</p></main>}>
      <CertificateCheckoutPage />
    </Suspense>
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
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
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

const headingBlock = {
  textAlign: 'center',
  marginBottom: 28,
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
  margin: '0 0 10px',
  color: '#f9fafb',
}

const subline = {
  fontSize: '0.92rem',
  color: '#94a3b8',
  lineHeight: 1.55,
  margin: 0,
}

// Free card
const freeCard = {
  background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(22,163,74,0.04))',
  border: '1px solid rgba(34,197,94,0.3)',
  borderRadius: 16,
  padding: '1.4rem',
  marginBottom: 8,
}

const freeCardTop = {
  marginBottom: 16,
}

const launchBadge = {
  display: 'inline-block',
  fontSize: '0.72rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontWeight: 700,
  color: '#22c55e',
  marginBottom: 6,
}

const freeTitle = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#e5e7eb',
  marginBottom: 4,
}

const freePriceRow = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  margin: '8px 0',
}

const freePrice = {
  fontSize: '2rem',
  fontWeight: 900,
  color: '#22c55e',
}

const freePriceNote = {
  fontSize: '0.85rem',
  color: '#94a3b8',
}

const freeDesc = {
  fontSize: '0.85rem',
  color: '#94a3b8',
  lineHeight: 1.55,
  margin: 0,
}

const freeButton = {
  width: '100%',
  padding: '0.9rem 1rem',
  borderRadius: 999,
  border: 'none',
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  color: '#0b1120',
  fontWeight: 800,
  fontSize: '1rem',
  cursor: 'pointer',
  boxSizing: 'border-box',
}

const freeButtonDisabled = {
  ...freeButton,
  opacity: 0.6,
  cursor: 'not-allowed',
}

const errorText = {
  marginTop: 10,
  fontSize: '0.85rem',
  color: '#f87171',
  textAlign: 'center',
}

const divider = {
  height: 1,
  background: '#1e293b',
  margin: '20px 0',
}

// Paid card — greyed out, coming soon
const paidCard = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid #1e293b',
  borderRadius: 16,
  padding: '1.4rem',
  opacity: 0.5,
}

const comingSoonBadge = {
  display: 'inline-block',
  fontSize: '0.72rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontWeight: 700,
  color: '#64748b',
  marginBottom: 6,
}

const paidTitle = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#e5e7eb',
  marginBottom: 4,
}

const paidPriceRow = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  margin: '8px 0',
}

const paidPrice = {
  fontSize: '2rem',
  fontWeight: 900,
  color: '#94a3b8',
}

const paidPriceNote = {
  fontSize: '0.85rem',
  color: '#64748b',
}

const paidDesc = {
  fontSize: '0.85rem',
  color: '#64748b',
  lineHeight: 1.55,
  margin: '0 0 16px',
}

const disabledButton = {
  width: '100%',
  padding: '0.9rem 1rem',
  borderRadius: 999,
  background: 'rgba(148,163,184,0.12)',
  border: '1px solid rgba(148,163,184,0.2)',
  color: '#475569',
  fontWeight: 800,
  fontSize: '0.95rem',
  textAlign: 'center',
  boxSizing: 'border-box',
  cursor: 'not-allowed',
}

const backButton = {
  background: 'none',
  border: 'none',
  color: '#475569',
  fontSize: '0.85rem',
  cursor: 'pointer',
  textDecoration: 'none',
}