'use client'

import Link from 'next/link'

export default function CongratulationsPage() {
  return (
    <main style={pageShell}>
      <div style={container}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <img
            src="/logo.jpeg"
            alt="Patrick Cameron — Style Challenge"
            style={{ width: 160, height: 'auto', borderRadius: 12 }}
          />
        </div>

        <h1 style={title}>Congratulations!</h1>
        <p style={lead}>
          Thank you for submitting your work. Patrick has carefully reviewed the images and approved your portfolio.
        </p>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link href="/challenge/portfolio" style={btn}>Back to your Portfolio</Link>
        </div>
      </div>
    </main>
  )
}

const pageShell = {
  minHeight: '100vh',
  background: '#000',
  color: '#fff',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: '24px 12px',
  boxSizing: 'border-box',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
}

const container = { width: 'min(800px, 95vw)' }
const title = { textAlign: 'center', margin: '6px 0 10px', fontSize: 28, fontWeight: 900 }
const lead = { textAlign: 'center', opacity: 0.9, maxWidth: 680, margin: '0 auto' }
const btn = {
  background: '#0b5ed7',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 700,
  textDecoration: 'none',
  display: 'inline-block'
}