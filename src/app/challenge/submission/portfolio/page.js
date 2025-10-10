'use client'

import { useRouter } from 'next/navigation'

export default function SubmissionConfirmation() {
  const router = useRouter()

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily:
          'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        textAlign: 'center'
      }}
    >
      <div
        style={{
          maxWidth: 780,
          width: '100%',
          border: '2px solid #444',
          borderRadius: 12,
          padding: '28px 22px',
          background: '#111',
          boxShadow: '0 12px 30px rgba(0,0,0,0.45)'
        }}
      >
        <h1 style={{ margin: '0 0 10px', fontSize: 'clamp(22px,4.5vw,34px)' }}>
          🎉 Congratulations!
        </h1>

        <p style={{ margin: '0 auto 12px', maxWidth: 680, lineHeight: 1.6, color: '#e6e6e6' }}>
          You’ve successfully submitted your work for <strong>Patrick’s certification</strong>.
          You’ll hear from Patrick within the next 7 days with either a success message
          or notes on what to improve.
        </p>

        <p style={{ margin: '0 auto 20px', maxWidth: 680, lineHeight: 1.6, color: '#e6e6e6' }}>
          We’re thrilled with your progress—well done for completing the challenge and
          taking this professional step. Keep creating, keep refining, and keep sharing
          your best work.
        </p>

        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => router.push('/challenge/portfolio')}
            style={{
              background: '#28a745',
              color: '#fff',
              padding: '0.9rem 1.6rem',
              borderRadius: 8,
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
              minWidth: 240,
              boxShadow: '0 6px 16px rgba(0,0,0,0.35)'
            }}
          >
            📄 Download & Save Your Portfolio
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => router.push('/challenge')}
            style={{
              background: '#0b5ed7',
              color: '#fff',
              padding: '0.75rem 1.25rem',
              borderRadius: 8,
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
              minWidth: 200,
              boxShadow: '0 6px 16px rgba(0,0,0,0.25)'
            }}
          >
            Back to Challenge
          </button>
        </div>
      </div>
    </main>
  )
}