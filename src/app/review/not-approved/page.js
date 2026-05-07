// src/app/review/not-approved/page.js
'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'

function NotApprovedContent() {
  const params = useSearchParams()
  const toEmail = params.get('to') || ''
  const firstName = params.get('name') || ''
  const slug = params.get('slug') || ''
  const [copied, setCopied] = useState(false)

  const displayName = firstName || toEmail || 'the stylist'
  const retryUrl = slug ? `/challenges/${slug}/step1` : null

  const copyEmail = () => {
    navigator.clipboard.writeText(toEmail).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

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

        <p style={bodyText}>
          Go back to your inbox, find the submission email from{' '}
          <strong>{displayName}</strong>, and forward it with your feedback.
        </p>

        {toEmail && (
          <div style={emailRow}>
            <span style={emailAddress}>{toEmail}</span>
            <button onClick={copyEmail} style={copyBtn}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        )}

        {retryUrl && (
          <p style={{ marginTop: 24, fontSize: 13, color: '#888', lineHeight: 1.6 }}>
            Their retry link (include in your email if helpful):{' '}
            <a href={retryUrl} style={{ color: '#555', wordBreak: 'break-all' }}>
              {typeof window !== 'undefined' ? `${window.location.origin}${retryUrl}` : retryUrl}
            </a>
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

const bodyText = {
  margin: '0 0 20px',
  fontSize: 15,
  lineHeight: 1.6,
  color: '#444',
}

const emailRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  background: '#f4f4f6',
  borderRadius: 8,
  padding: '10px 16px',
}

const emailAddress = {
  fontSize: 14,
  color: '#111',
  fontWeight: 600,
}

const copyBtn = {
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
}