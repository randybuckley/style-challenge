// src/app/review/not-approved/page.js
'use client'

import { Suspense } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'

function NotApprovedContent() {
  const params = useSearchParams()
  const toEmail = params.get('to') || ''
  const firstName = params.get('name') || ''
  const slug = params.get('slug') || ''

  const displayName = firstName || toEmail || 'the stylist'
  const subject = encodeURIComponent('Your Style Challenge submission')
  const mailtoHref = toEmail ? `mailto:${toEmail}?subject=${subject}` : null

  const retryUrl = slug ? `/challenges/${slug}/step1` : null

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={180}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        <div style={iconRow}>✓</div>
        <h1 style={heading}>Marked as not approved</h1>
        <p style={body}>
          The submission has been recorded. Forward your review email to{' '}
          <strong>{displayName}</strong> with your feedback.
        </p>

        {mailtoHref && (
          <a href={mailtoHref} style={primaryBtn}>
            Open email to {firstName || toEmail} →
          </a>
        )}

        {retryUrl && (
          <p style={{ marginTop: 16, fontSize: 13, color: '#888' }}>
            Their retry link:{' '}
            <a href={retryUrl} style={{ color: '#555' }}>{retryUrl}</a>
          </p>
        )}
      </div>
    </div>
  )
}

export default function NotApprovedPage() {
  return (
    <Suspense>
      <NotApprovedContent />
    </Suspense>
  )
}

// ---- Styles ----
const shell = {
  minHeight: '100vh',
  background: '#f4f4f6',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 16px',
}

const card = {
  background: '#fff',
  borderRadius: 16,
  padding: '40px 32px',
  maxWidth: 480,
  width: '100%',
  boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  textAlign: 'center',
}

const iconRow = {
  width: 52,
  height: 52,
  borderRadius: '50%',
  background: '#f0fdf4',
  color: '#16a34a',
  fontSize: 24,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 16px',
}

const heading = {
  margin: '0 0 12px',
  fontSize: 22,
  fontWeight: 700,
  color: '#111',
}

const body = {
  margin: '0 0 24px',
  fontSize: 15,
  lineHeight: 1.6,
  color: '#444',
}

const primaryBtn = {
  display: 'inline-block',
  background: '#111',
  color: '#fff',
  textDecoration: 'none',
  padding: '12px 24px',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 15,
}