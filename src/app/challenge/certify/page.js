'use client'

import { useRouter } from 'next/navigation'

export default function CertifyPage() {
  const router = useRouter()

  return (
    <main style={pageShell}>
      <div style={container}>
        <div style={hatchWrap}>
          <div style={sheet}>
            <div style={parchment}>
              {/* translucent rounded logo */}
              <div style={{ textAlign: 'center', marginTop: 6, marginBottom: 6 }}>
                <img
                  src="/logo.jpeg"
                  alt="Patrick Cameron — Style Challenge"
                  style={{ width: 220, height: 'auto', opacity: 0.6, borderRadius: 16 }}
                />
              </div>

              <h2 style={title}>Final Step — Certification</h2>
              <p style={lead}>
                Watch this short message from Patrick, then choose how you’d like to proceed.
              </p>

              {/* video */}
              <div style={videoCard}>
                <video style={video} controls playsInline preload="metadata">
                  {/* Replace with your real video path */}
                  <source src="/certify.mp4" type="video/mp4" />
                </video>
              </div>

              {/* actions */}
              <div style={ctaRow}>
                <button
                  onClick={() => router.push('/challenge/portfolio')}
                  style={{ ...btn, background: '#6c757d' }}
                >
                  ← Back to your Portfolio
                </button>
                <button
                  onClick={() => router.push('/challenge/submission/portfolio')}
                  style={{ ...btn, background: '#28a745' }}
                >
                  ✅ Have Patrick Check My Work
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

/* -------- styles (mirror the certificate look) -------- */

const pageShell = {
  minHeight: '100vh',
  background: '#000',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: '20px 12px',
  boxSizing: 'border-box',
  fontFamily:
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
}

const container = { width: 'min(800px, 95vw)' }

const hatchWrap = {
  padding: 22,
  borderRadius: 14,
  boxShadow: '0 18px 48px rgba(0,0,0,.35)',
  backgroundImage:
    'repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 2px, rgba(0,0,0,0) 2px 7px),' +
    'repeating-linear-gradient(0deg, rgba(0,0,0,.045) 0 2px, rgba(0,0,0,0) 2px 7px)',
  backgroundColor: '#eae7df'
}

const sheet = {
  background: '#f2ebda',
  borderRadius: 12,
  boxShadow:
    'inset 0 0 0 2px #cbbfa3, inset 0 0 0 10px #f2ebda, inset 0 0 0 12px #cbbfa3'
}

const parchment = {
  background: 'url(/parchment.jpg) repeat, #f3ecdc',
  borderRadius: 10,
  padding: 16,
  color: '#111'
}

const title = {
  textAlign: 'center',
  fontSize: 28,
  fontWeight: 900,
  margin: '8px 0 6px'
}

const lead = {
  textAlign: 'center',
  margin: '0 0 12px',
  color: '#444'
}

const videoCard = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(255,255,255,0.82)',
  borderRadius: 16,
  boxShadow: '0 8px 22px rgba(0,0,0,.08)',
  padding: 12
}

const video = {
  width: '100%',
  height: 'auto',
  borderRadius: 12,
  display: 'block',
  background: '#000'
}

const ctaRow = {
  display: 'flex',
  gap: 10,
  justifyContent: 'center',
  marginTop: 14,
  flexWrap: 'wrap'
}

const btn = {
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 10px 22px rgba(0,0,0,.25)'
}