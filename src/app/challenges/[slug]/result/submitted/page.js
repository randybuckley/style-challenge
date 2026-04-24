'use client'

import { Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'

function SubmittedPage() {
  const params = useParams()
  const rawSlug = params?.slug
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug || ''

  return (
    <div style={pageShell}>
      <main style={pageMain}>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={220}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        <div style={card}>
          <div style={iconRow}>📬</div>
          <h1 style={heading}>Work submitted!</h1>
          <p style={bodyText}>
            Your portfolio has been sent to Patrick Cameron for personal review.
            You'll hear back by email once he's had a chance to look at your work.
          </p>

          <div style={divider} />

          <div style={whatNextBlock}>
            <div style={whatNextTitle}>What happens next</div>
            <div style={step}>
              <div style={stepNumber}>1</div>
              <p style={stepText}>Patrick personally reviews your step-by-step photos against his reference images.</p>
            </div>
            <div style={step}>
              <div style={stepNumber}>2</div>
              <p style={stepText}>You'll receive an email with his decision — approved or with feedback to improve.</p>
            </div>
            <div style={step}>
              <div style={stepNumber}>3</div>
              <p style={stepText}>If approved, you'll be able to download your Patrick Cameron Long Hair Specialist certificate.</p>
            </div>
          </div>

          <div style={divider} />

          <div style={{ textAlign: 'center' }}>
            <Link href="/challenges/menu" style={primaryBtn}>
              Back to Collections
            </Link>
          </div>
        </div>

      </main>
    </div>
  )
}

export default function SubmittedPageWrapper() {
  return (
    <Suspense fallback={<main style={loadingShell}><p>Loading…</p></main>}>
      <SubmittedPage />
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

const card = {
  background: '#0b1120',
  border: '1px solid #1e293b',
  borderRadius: 20,
  padding: '2rem 1.5rem',
}

const iconRow = {
  fontSize: '2.5rem',
  textAlign: 'center',
  marginBottom: 12,
}

const heading = {
  fontSize: '1.6rem',
  fontWeight: 800,
  textAlign: 'center',
  margin: '0 0 12px',
  color: '#f9fafb',
}

const bodyText = {
  fontSize: '0.95rem',
  color: '#94a3b8',
  lineHeight: 1.6,
  textAlign: 'center',
  margin: 0,
}

const divider = {
  height: 1,
  background: '#1e293b',
  margin: '24px 0',
}

const whatNextBlock = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const whatNextTitle = {
  fontSize: '0.8rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#475569',
  marginBottom: 4,
}

const step = {
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