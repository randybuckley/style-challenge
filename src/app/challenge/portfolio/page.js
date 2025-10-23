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
  const portfolioRef = useRef()   // whole certificate area (captured to PDF)
  const hatchRef = useRef()       // outer cross-hatch layer (edge-to-edge in PDF)

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

  // embed an image for crisp PDF
  const toDataURL = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/jpeg', 0.95))
      }
      img.onerror = () => reject(new Error('Could not load image'))
      img.src = url
    })

  // Robust single-page PDF: render from a live, invisible clone at US Letter size.
  const downloadPDF = async () => {
    const mod = await import('html2pdf.js')
    const html2pdf = mod.default || mod

    const src = portfolioRef.current
    if (!src) return

    // US Letter at CSS px (~96dpi)
    const PDF_W = 816   // 8.5in * 96
    const PDF_H = 1056  // 11in * 96

    // build a live, invisible clone so it has real layout
    const clone = src.cloneNode(true)
    Object.assign(clone.style, {
      width: `${PDF_W}px`,
      height: `${PDF_H}px`,
      position: 'fixed',
      left: '0',
      top: '0',
      zIndex: '-1',
      opacity: '0',        // invisible but laid out
      pointerEvents: 'none',
      margin: '0'
    })

    // tighten cross-hatch bottom to avoid a heavy grey band
    const hatchClone = clone.querySelector('[data-hatch="1"]')
    if (hatchClone) {
      hatchClone.style.borderRadius = '0'
      hatchClone.style.minHeight = `${PDF_H}px`
      hatchClone.style.boxShadow = 'none'
      hatchClone.style.padding = '18px 18px 0 18px'
    }

    // show a bit more parchment inside for the bottom edge
    const parchmentClone = clone.querySelector('[data-parchment="1"]')
    const prevParchPad = parchmentClone?.style.paddingBottom || ''
    if (parchmentClone) {
      parchmentClone.style.paddingBottom = '56px'
    }

    // embed images marked for export
    const imgs = clone.querySelectorAll('img[data-embed="true"]')
    await Promise.all(
      Array.from(imgs).map(async (img) => {
        try {
          const dataUrl = await toDataURL(img.src)
          img.removeAttribute('crossorigin')
          img.src = dataUrl
        } catch {
          // keep going if one image fails
        }
      })
    )

    // attach clone so html2canvas can measure it
    document.body.appendChild(clone)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

    try {
      await html2pdf()
        .from(clone)
        .set({
          margin: 0,
          filename: 'style-challenge-portfolio.pdf',
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            windowWidth: PDF_W,
            windowHeight: PDF_H
          },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        })
        .save()
    } finally {
      if (parchmentClone) parchmentClone.style.paddingBottom = prevParchPad
      clone.remove()
    }
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

      {/* Certificate container captured to PDF */}
      <div ref={portfolioRef} style={container}>
        {/* CROSS-HATCH edge-to-edge margin */}
        <div ref={hatchRef} style={hatchWrap} data-hatch="1">
          {/* Double-ruled “sheet” */}
          <div style={sheet}>
            {/* PARCHMENT center */}
            <div style={parchment} data-parchment="1">
              {/* translucent rounded logo */}
              <div style={{ textAlign: 'center', marginTop: 6, marginBottom: 6 }}>
                <img
                  src="/logo.jpeg"
                  alt="Patrick Cameron — Style Challenge"
                  data-embed="true"
                  style={{
                    width: 220,
                    height: 'auto',
                    display: 'inline-block',
                    opacity: 0.6,
                    borderRadius: 16
                  }}
                />
              </div>

              {/* Prominent black name (no "Your Portfolio") */}
              <h2 style={stylistName}>
                {nameLine}
                {salonName ? <span style={{ fontWeight: 500 }}>{' — '}{salonName}</span> : null}
              </h2>

              {/* Steps 1–3 */}
              <div style={stepsGrid}>
                {[1, 2, 3].map((n) => (
                  <div key={n} style={thumbCard}>
                    <div style={thumbLabel}>Step {n}</div>
                    {images[n] ? (
                      <img
                        src={images[n]}
                        alt={`Step ${n}`}
                        data-embed="true"
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
                      data-embed="true"
                      style={finishedImg}
                    />
                  ) : (
                    <div style={missing}>No final image</div>
                  )}
                </div>
              </div>
            </div>
            {/* /parchment */}
          </div>
          {/* /sheet */}
        </div>
        {/* /hatch */}
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
    </main>
  )
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

const container = {
  width: 'min(800px, 95vw)'
}

/* Cross-hatch “margin” layer */
const hatchWrap = {
  padding: 22, // export temporarily sets bottom to 0px
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
  padding: '16px 16px 36px', // baseline extra bottom padding
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

const stepsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 22,
  marginTop: 6
}

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