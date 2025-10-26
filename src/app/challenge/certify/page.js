'use client'

import { useRouter } from 'next/navigation'

export default function CertifyIntroPage() {
  const router = useRouter()

  return (
    <main style={shell}>
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          {/* Placeholder video (swap src to your Vimeo when ready) */}
          <div style={videoWrap}>
            <iframe
              src="https://player.vimeo.com/video/76979871"
              title="Certification — Message from Patrick"
              allow="autoplay; fullscreen; picture-in-picture"
              style={video}
            />
          </div>
        </div>

        <h1 style={h1}>Submit for Certification</h1>
        <p style={p}>
          You’ve finished the challenge. Patrick will personally review your work.
          Choose an option below to continue.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
          <button onClick={()=>router.push('/challenge/portfolio')} style={btnSecondary}>⬅ Back to your Portfolio</button>
          <button onClick={()=>router.push('/challenge/certification')} style={btnPrimary}>✅ Have Patrick Check My Work</button>
        </div>
      </div>
    </main>
  )
}

/* styles */
const shell = {
  minHeight: '100vh',
  background: '#000',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif'
}
const card = {
  width: 'min(900px, 96vw)',
  background: '#111',
  border: '1px solid #333',
  borderRadius: 14,
  padding: 16,
  boxShadow: '0 18px 48px rgba(0,0,0,.35)'
}
const videoWrap = {
  position: 'relative',
  width: '100%',
  maxWidth: 900,
  aspectRatio: '16 / 9',
  borderRadius: 12,
  overflow: 'hidden',
  border: '1px solid #333',
  boxShadow: '0 8px 22px rgba(0,0,0,.35)'
}
const video = {
  width: '100%',
  height: '100%',
  border: 0,
  display: 'block'
}
const h1 = { fontSize: 24, margin: '12px 0 6px', textAlign: 'center', fontWeight: 800 }
const p  = { margin: 0, textAlign: 'center', color: '#ccc' }

const btnBase = {
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 10px 22px rgba(0,0,0,.25)'
}
const btnPrimary   = { ...btnBase, background: '#28a745' }
const btnSecondary = { ...btnBase, background: '#444' }