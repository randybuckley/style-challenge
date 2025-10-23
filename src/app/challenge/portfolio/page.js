'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

export default function PortfolioPage() {
  const [user, setUser] = useState(null)
  const [images, setImages] = useState({})
  const [firstName, setFirstName] = useState('')
  const [secondName, setSecondName] = useState('')
  const [salonName, setSalonName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const router = useRouter()
  const portfolioRef = useRef()   // on-screen certificate container

  useEffect(() => {
    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const sessionUser = sessionData?.session?.user
      if (!sessionUser) {
        router.push('/')
        return
      }
      setUser(sessionUser)

      // profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, second_name, salon_name')
        .eq('id', sessionUser.id)
        .single()

      if (profile) {
        setFirstName(profile.first_name || '')
        setSecondName(profile.second_name || '')
        setSalonName(profile.salon_name || '')
      }

      // latest uploads (1,2,3,4)
      const STORAGE_PREFIX =
        'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'
      const { data: rows } = await supabase
        .from('uploads')
        .select('step_number, image_url, created_at')
        .eq('user_id', sessionUser.id)
        .in('step_number', [1, 2, 3, 4])
        .order('created_at', { ascending: false })

      const latest = {}
      for (const r of rows || []) {
        if (!latest[r.step_number]) {
          latest[r.step_number] = r.image_url?.startsWith('http')
            ? r.image_url
            : STORAGE_PREFIX + r.image_url
        }
      }
      setImages(latest)
      setLoading(false)
    }
    run()
  }, [router])

  const saveProfile = async () => {
    if (!user) return
    setSaving(true)
    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email ?? null,
        first_name: (firstName || '').trim() || null,
        second_name: (secondName || '').trim() || null,
        salon_name: (salonName || '').trim() || null
      })
    } finally {
      setSaving(false)
    }
  }

  // Convert remote image -> data URL for html2canvas (prevents blank PDF)
  const toDataURL = (url) =>
    new Promise((resolve, reject) => {
      if (!url) return resolve(null)
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve(c.toDataURL('image/jpeg', 0.95))
      }
      img.onerror = () => resolve(null) // be lenient; don’t fail whole PDF
      img.src = url
    })

  // Build a hidden, print-only DOM and export it to a single-page PDF
  const downloadPDF = async () => {
    const html2pdf = (await import('html2pdf.js')).default

    // Embed all images first (so no CORS/taint issues)
    const [s1, s2, s3, fin] = await Promise.all([
      toDataURL(images[1]),
      toDataURL(images[2]),
      toDataURL(images[3]),
      toDataURL(images[4]),
    ])

    // US Letter @ ~96dpi canvas
    const W = 816, H = 1056

    // Build an off-screen node
    const host = document.createElement('div')
    host.style.position = 'fixed'
    host.style.left = '-10000px'
    host.style.top = '0'
    host.style.zIndex = '-1'

    // Compose the print layout (small steps row at top, big finished below)
    const fullName = [firstName, secondName].filter(Boolean).join(' ') || (user?.email ?? '')

    host.innerHTML = `
      <div id="pdf-root" style="width:${W}px;height:${H}px;box-sizing:border-box;">
        <style>
          .hatch {
            width: 100%; height: 100%;
            padding: 18px;
            background:
              repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 2px, rgba(0,0,0,0) 2px 7px),
              repeating-linear-gradient(0deg,  rgba(0,0,0,.045) 0 2px, rgba(0,0,0,0) 2px 7px);
            background-color: #eae7df;
            border-radius: 0;
          }
          .sheet {
            width: 100%; height: 100%;
            box-sizing: border-box;
            background: #f2ebda;
            border-radius: 10px;
            box-shadow:
              inset 0 0 0 2px #cbbfa3,
              inset 0 0 0 10px #f2ebda,
              inset 0 0 0 12px #cbbfa3;
            padding: 12px;
          }
          .parch {
            width: 100%; height: 100%;
            box-sizing: border-box;
            background: url('/parchment.jpg') repeat, #f3ecdc;
            border-radius: 10px;
            padding: 14px 14px 24px;
            display: flex;
            flex-direction: column;
            align-items: stretch;
            justify-content: flex-start;
            color: #111;
          }
          .logoWrap { text-align: center; margin: 2px 0 4px; }
          .logo {
            width: 220px; height: auto; display: inline-block;
            opacity: .6; border-radius: 16px;
          }
          .name {
            margin: 2px 0 8px; text-align: center;
            font-size: 32px; font-weight: 900; color: #000;
          }
          .name small { font-weight: 500; }
          .row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
            margin-top: 6px;
          }
          .thumb {
            background: rgba(255,255,255,.60);
            border: 1px solid rgba(255,255,255,.82);
            border-radius: 14px;
            box-shadow: 0 6px 18px rgba(0,0,0,.12);
            padding: 8px;
            min-height: 190px;
            display: flex; flex-direction: column; align-items: center;
          }
          .thumbLabel { font-weight: 700; font-size: 13px; color: #5b5b5b; margin-bottom: 6px; }
          .thumbImg {
            width: 100%;
            aspect-ratio: 1 / 1;
            object-fit: contain;
            border-radius: 10px;
            border: 1px solid #eee;
            background: #fff;
            opacity: .92;
          }
          .finBlock { margin-top: 10px; }
          .finLabel { text-align:center; font-weight:700; margin-bottom: 8px; }
          .finCard {
            background: #fff; border: 1px solid #e6e6e6; border-radius: 16px;
            box-shadow: 0 8px 22px rgba(0,0,0,.08);
            padding: 10px;
          }
          .finImg {
            width: 100%; max-height: 640px; object-fit: contain; display:block;
            border-radius: 12px; background:#fff; opacity:.92;
          }
        </style>

        <div class="hatch">
          <div class="sheet">
            <div class="parch">
              <div class="logoWrap">
                <img class="logo" src="/logo.jpeg" alt="Style Challenge" />
              </div>
              <div class="name">
                ${fullName}${salonName ? ` <small>— ${escapeHtml(salonName)}</small>` : ''}
              </div>

              <div class="row">
                ${thumbCell(1, s1)}
                ${thumbCell(2, s2)}
                ${thumbCell(3, s3)}
              </div>

              <div class="finBlock">
                <div class="finLabel">Finished Look — Challenge Number One</div>
                <div class="finCard">
                  ${fin ? `<img class="finImg" src="${fin}"/>` : `<div style="color:#888;font-style:italic;text-align:center;padding:40px 0">No final image</div>`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `

    document.body.appendChild(host)

    // Use only the print node (first child)
    const node = host.querySelector('#pdf-root')

    await html2pdf()
      .from(node)
      .set({
        margin: 0,
        filename: 'style-challenge-portfolio.pdf',
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all'] } // force single page
      })
      .save()

    document.body.removeChild(host)
  }

  if (loading) {
    return (
      <main style={pageShell}>
        <p style={{ color: '#ccc' }}>Loading…</p>
      </main>
    )
  }

  const nameLine = [firstName, secondName].filter(Boolean).join(' ') || user?.email

  return (
    <main style={pageShell}>
      {/* Editable identity bar (outside certificate) */}
      <div style={editBar}>
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First Name"
          style={field}
        />
        <input
          value={secondName}
          onChange={(e) => setSecondName(e.target.value)}
          placeholder="Last Name"
          style={field}
        />
        <input
          value={salonName}
          onChange={(e) => setSalonName(e.target.value)}
          placeholder="Salon"
          style={{ ...field, minWidth: 220 }}
        />
        <button onClick={saveProfile} disabled={saving} style={btnSmall}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Certificate container (on-screen only) */}
      <div ref={portfolioRef} style={container}>
        <div style={hatchWrap}>
          <div style={sheet}>
            <div style={parchment}>
              <div style={{ textAlign: 'center', marginTop: 6, marginBottom: 6 }}>
                <img
                  src="/logo.jpeg"
                  alt="Patrick Cameron — Style Challenge"
                  style={{
                    width: 220,
                    height: 'auto',
                    display: 'inline-block',
                    opacity: 0.6,
                    borderRadius: 16
                  }}
                />
              </div>

              {/* Big, prominent name */}
              <h2 style={stylistName}>
                {nameLine}
                {salonName ? <span style={{ fontWeight: 500 }}>{' — '}{salonName}</span> : null}
              </h2>

              {/* Steps 1–3: desktop = 3 cols, mobile = 1 col */}
              <div className="stepsGrid" style={stepsGrid}>
                {[1, 2, 3].map((n) => (
                  <div key={n} style={thumbCard}>
                    <div style={thumbLabel}>Step {n}</div>
                    {images[n] ? (
                      <img
                        src={images[n]}
                        alt={`Step ${n}`}
                        style={thumbImg}
                      />
                    ) : (
                      <div style={missing}>No image</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Finished Look */}
              <div style={finishedWrap}>
                <div style={finishedLabel}>Finished Look — Challenge Number One</div>
                <div style={finishedCard}>
                  {images[4] ? (
                    <img
                      src={images[4]}
                      alt="Finished Look"
                      style={finishedImg}
                    />
                  ) : (
                    <div style={missing}>No final image</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginTop: 18, textAlign: 'center' }}>
        <button onClick={downloadPDF} style={{ ...btn, marginRight: 10 }}>
          📄 Download Portfolio
        </button>
        <button
          onClick={() => router.push('/challenge/submission/competition')}
          style={{ ...btn, background: '#28a745' }}
        >
          ✅ Become Certified
        </button>
      </div>

      {/* Mobile-only override for steps grid (keeps page layout correct) */}
      <style jsx>{`
        @media (max-width: 640px) {
          .stepsGrid {
            grid-template-columns: 1fr !important; /* override inline grid */
          }
        }
      `}</style>
    </main>
  )
}

/* ============ helpers for PDF string HTML ============ */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function thumbCell(n, dataUrl) {
  const label = `Step ${n}`
  if (!dataUrl) {
    return `
      <div class="thumb">
        <div class="thumbLabel">${label}</div>
        <div style="color:#888;font-style:italic;margin-top:8px">No image</div>
      </div>`
  }
  return `
    <div class="thumb">
      <div class="thumbLabel">${label}</div>
      <img class="thumbImg" src="${dataUrl}" />
    </div>`
}

/* ===================== styles ===================== */

const pageShell = {
  minHeight: '100vh',
  background: '#000',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '20px 12px',
  boxSizing: 'border-box',
  fontFamily:
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
}

const container = { width: 'min(800px, 95vw)' }

/* Cross-hatch “margin” layer */
const hatchWrap = {
  padding: 22,
  borderRadius: 14,
  boxShadow: '0 18px 48px rgba(0,0,0,.35)',
  backgroundImage:
    'repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 2px, rgba(0,0,0,0) 2px 7px),' +
    'repeating-linear-gradient(0deg, rgba(0,0,0,.045) 0 2px, rgba(0,0,0,0) 2px 7px)',
  backgroundColor: '#eae7df'
}

/* double-ruled sheet */
const sheet = {
  background: '#f2ebda',
  borderRadius: 12,
  boxShadow:
    'inset 0 0 0 2px #cbbfa3, inset 0 0 0 10px #f2ebda, inset 0 0 0 12px #cbbfa3'
}

/* center parchment */
const parchment = {
  background: 'url(/parchment.jpg) repeat, #f3ecdc',
  borderRadius: 10,
  padding: '16px 16px 24px',
  color: '#111'
}

/* big, prominent black name */
const stylistName = {
  textAlign: 'center',
  fontSize: 32,
  fontWeight: 900,
  color: '#000',
  margin: '2px 0 14px'
}

/* desktop: 3 cols; mobile override via styled-jsx above */
const stepsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 22,
  marginTop: 6
}

/* translucent plates like the logo */
const thumbCard = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(255,255,255,0.82)',
  borderRadius: 16,
  padding: 12,
  boxShadow: '0 6px 18px rgba(0,0,0,.12)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minHeight: 260
}

const thumbLabel = { fontWeight: 700, fontSize: 14, color: '#5b5b5b', marginBottom: 8 }

const thumbImg = {
  width: '100%',
  aspectRatio: '1 / 1',
  objectFit: 'contain',
  borderRadius: 12,
  background: '#fff',
  border: '1px solid #eee',
  display: 'block',
  opacity: 0.92
}

const finishedWrap = { marginTop: 16 }
const finishedLabel = { textAlign: 'center', fontWeight: 700, marginBottom: 10 }
const finishedCard = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 16,
  boxShadow: '0 8px 22px rgba(0,0,0,.08)',
  padding: 12
}
const finishedImg = {
  width: '100%',
  maxHeight: 680,
  objectFit: 'contain',
  borderRadius: 12,
  background: '#fff',
  display: 'block',
  opacity: 0.92
}

const missing = { color: '#888', fontStyle: 'italic', marginTop: 18 }

const btn = {
  background: '#0b5ed7',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 10px 22px rgba(0,0,0,.25)'
}
const btnSmall = {
  background: '#444',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 12px',
  fontWeight: 700,
  cursor: 'pointer'
}
const editBar = {
  width: 'min(800px, 95vw)',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  justifyContent: 'center',
  alignItems: 'center',
  marginBottom: 10
}
const field = {
  background: '#161616',
  color: '#fff',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '10px 12px',
  minWidth: 160
}