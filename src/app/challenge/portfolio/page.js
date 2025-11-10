// src/app/challenge/portfolio/page.js
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
  const [isMobile, setIsMobile] = useState(false)
  const [isPhoneLandscape, setIsPhoneLandscape] = useState(false)
  const [error, setError] = useState('')

  const router = useRouter()

  // Refs used for PDF export
  const rootRef = useRef(null)
  const hatchRef = useRef(null)
  const stepsRef = useRef(null)
  const nameRef = useRef(null)
  const finishedImgRef = useRef(null)
  const logoRef = useRef(null)
  const parchmentRef = useRef(null)

  // ---------- layout responsiveness ----------
  useEffect(() => {
    const measure = () => {
      const w = typeof window !== 'undefined' ? window.innerWidth : 0
      const h = typeof window !== 'undefined' ? window.innerHeight : 0
      setIsMobile(w < 560)
      setIsPhoneLandscape(h > 0 && h <= 480 && w >= 560)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // ---------- load profile + uploads ----------
  useEffect(() => {
    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const u = sessionData?.session?.user
      if (!u) return router.push('/')
      setUser(u)

      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, second_name, salon_name')
        .eq('id', u.id)
        .single()
      if (profile) {
        setFirstName(profile.first_name || '')
        setSecondName(profile.second_name || '')
        setSalonName(profile.salon_name || '')
      }

      const STORAGE_PREFIX =
        'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'
      const { data: rows } = await supabase
        .from('uploads')
        .select('step_number, image_url, created_at')
        .eq('user_id', u.id)
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
    const fn = (firstName || '').trim()
    const sn = (secondName || '').trim()
    const sa = (salonName || '').trim()

    if (!fn || !sn || !sa) {
      setError(
        'Please enter your first name, last name, and salon name before saving.'
      )
      return
    }

    setSaving(true)
    setError('')
    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email ?? null,
        first_name: fn,
        second_name: sn,
        salon_name: sa
      })
    } finally {
      setSaving(false)
    }
  }

  // ---------- helpers ----------
  const toDataURL = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        c.getContext('2d').drawImage(img, 0, 0)
        resolve(c.toDataURL('image/jpeg', 0.95))
      }
      img.onerror = () => reject(new Error('Could not load image'))
      img.src = url
    })

  const ensureIdentityComplete = () => {
    const fn = (firstName || '').trim()
    const sn = (secondName || '').trim()
    const sa = (salonName || '').trim()

    if (!fn || !sn || !sa) {
      const msg =
        'Please add your first name, last name, and salon name — this is how they will appear on your portfolio and certificate.'
      setError(msg)
      alert(msg)
      return false
    }
    setError('')
    return true
  }

  // ---------- PDF export ----------
  const downloadPDF = async () => {
    if (!ensureIdentityComplete()) return

    const html2pdf = (await import('html2pdf.js')).default
    const root = rootRef.current
    const hatch = hatchRef.current
    const parchmentEl = parchmentRef.current

    if (!root || !hatch || !parchmentEl) return

    // Save previous styles so we can restore them
    const prevRootStyle = root.getAttribute('style') || ''
    const prevHatchStyle = hatch.getAttribute('style') || ''
    const prevStepsCols = stepsRef.current?.style.gridTemplateColumns || ''
    const prevNameSize = nameRef.current?.style.fontSize || ''
    const prevFinishedMaxH = finishedImgRef.current?.style.maxHeight || ''
    const prevParchmentPadding = parchmentEl.style.padding || ''
    const prevParchmentOverflow = parchmentEl.style.overflow || ''
    const prevParchmentWidth = parchmentEl.style.width || ''
    const prevParchmentMargin = parchmentEl.style.margin || ''

    // ---- FORCE A DESKTOP-LIKE LAYOUT JUST FOR THE PDF ----
    // Fixed width so the 3 steps stay in a single row even on mobile
    parchmentEl.style.width = '816px'
    parchmentEl.style.margin = '0 auto'
    parchmentEl.style.overflow = 'hidden'
    parchmentEl.style.padding = '16px 16px 24px'

    if (stepsRef.current) {
      stepsRef.current.style.gridTemplateColumns = 'repeat(3, 1fr)'
    }
    if (nameRef.current) nameRef.current.style.fontSize = '28px'

    hatch.style.boxShadow = 'none'

    // Inline all images inside the parchment so html2canvas is happy
    const imgs = parchmentEl.querySelectorAll('img[data-embed="true"]')
    await Promise.all(
      Array.from(imgs).map(async (img) => {
        try {
          const dataUrl = await toDataURL(img.src)
          img.src = dataUrl
        } catch {
          // keep original src if conversion fails
        }
        img.removeAttribute('width')
        img.removeAttribute('height')
        img.style.height = 'auto'
      })
    )

    // 🔵 Slightly taller Finished Look in the PDF only
    if (finishedImgRef.current) {
      finishedImgRef.current.style.maxHeight = '640px'
    }

    // Measure the *forced* desktop layout for the PDF page size
    const target = parchmentEl
    const pdfWidth = target.scrollWidth || target.offsetWidth || 816
    const pdfHeight = (target.scrollHeight || target.offsetHeight || 1056) + 8

    await html2pdf()
      .from(parchmentEl) // capture just the parchment, not the outer page
      .set({
        margin: 0,
        filename: 'style-challenge-portfolio.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        },
        jsPDF: {
          unit: 'px',
          format: [pdfWidth, pdfHeight],
          orientation: 'portrait'
        },
        pageBreak: { mode: ['avoid-all'] }
      })
      .save()

    // ---- RESTORE ORIGINAL RESPONSIVE LAYOUT ----
    parchmentEl.style.width = prevParchmentWidth
    parchmentEl.style.margin = prevParchmentMargin
    parchmentEl.style.padding = prevParchmentPadding
    parchmentEl.style.overflow = prevParchmentOverflow

    root.setAttribute('style', prevRootStyle)
    hatch.setAttribute('style', prevHatchStyle)

    if (stepsRef.current)
      stepsRef.current.style.gridTemplateColumns = prevStepsCols
    if (nameRef.current) nameRef.current.style.fontSize = prevNameSize
    if (finishedImgRef.current)
      finishedImgRef.current.style.maxHeight = prevFinishedMaxH
  }

  const handleBecomeCertified = async () => {
    if (!ensureIdentityComplete()) return
    await saveProfile()
    router.push('/challenge/certify')
  }

  if (loading) {
    return (
      <main style={pageShell}>
        <p style={{ color: '#ccc' }}>Loading…</p>
      </main>
    )
  }

  const nameLine =
    [firstName, secondName].filter(Boolean).join(' ') || user?.email
  const thumbCardDynamic = {
    ...thumbCard,
    minHeight: isPhoneLandscape ? 200 : 260
  }

  return (
    <main style={pageShell}>
      {/* Intro + identity instructions */}
      <div style={introWrap}>
        <h1 style={introTitle}>Your Style Challenge Portfolio</h1>
        <p style={introText}>
          Before you download your portfolio or become Patrick Cameron certified,
          please add your <strong>first name</strong>, <strong>last name</strong>,
          and <strong>salon name</strong> exactly as you want them to appear on
          your certificate.
        </p>

        {/* editable identity bar */}
        <div style={editBar}>
          <div style={editRow}>
            <div style={fieldGroup}>
              <label style={fieldLabel}>First name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Randy"
                style={field}
              />
            </div>
            <div style={fieldGroup}>
              <label style={fieldLabel}>Last name</label>
              <input
                value={secondName}
                onChange={(e) => setSecondName(e.target.value)}
                placeholder="e.g. Buckley"
                style={field}
              />
            </div>
            <div style={{ ...fieldGroup, flexBasis: '100%', maxWidth: 320 }}>
              <label style={fieldLabel}>Salon name</label>
              <input
                value={salonName}
                onChange={(e) => setSalonName(e.target.value)}
                placeholder="e.g. BigDeal Hair"
                style={{ ...field, minWidth: 220 }}
              />
            </div>
          </div>
          <div style={saveRow}>
            <button onClick={saveProfile} disabled={saving} style={btnSmall}>
              {saving ? 'Saving…' : 'Save details'}
            </button>
          </div>
          {error && <div style={errorText}>{error}</div>}
        </div>
      </div>

      {/* export root */}
      <div ref={rootRef} style={container}>
        <div ref={hatchRef} style={hatchWrap}>
          <div style={sheet}>
            <div ref={parchmentRef} style={parchment} data-parchment="1">
              {/* translucent rounded logo */}
              <div
                style={{ textAlign: 'center', marginTop: 6, marginBottom: 6 }}
              >
                <img
                  ref={logoRef}
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

              {/* prominent name line */}
              <h2 ref={nameRef} style={stylistName}>
                {nameLine}
                {salonName ? (
                  <span style={{ fontWeight: 500 }}>
                    {' — '}
                    {salonName}
                  </span>
                ) : null}
              </h2>

              {/* Steps */}
              <div
                ref={stepsRef}
                style={{
                  ...stepsGrid,
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)'
                }}
              >
                {[1, 2, 3].map((n) => (
                  <div key={n} data-thumb="1" style={thumbCardDynamic}>
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

              {/* Finished look */}
              <div style={finishedWrap}>
                <div style={finishedCard}>
                  <div style={finishedLabel}>
                    Finished Look — Challenge Number One
                  </div>
                  {images[4] ? (
                    <img
                      ref={finishedImgRef}
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
          </div>
        </div>
      </div>

      {/* actions */}
      <div style={{ marginTop: 18, textAlign: 'center' }}>
        <button onClick={downloadPDF} style={{ ...btn, marginRight: 10 }}>
          📄 Download Portfolio
        </button>
        <button
          onClick={handleBecomeCertified}
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

const container = { width: 'min(800px, 95vw)' }

/* Intro & identity card */
const introWrap = {
  width: 'min(800px, 95vw)',
  marginBottom: 16
}

const introTitle = {
  color: '#ffffff',
  fontSize: 22,
  fontWeight: 800,
  textAlign: 'center',
  margin: '0 0 6px'
}

const introText = {
  color: '#dddddd',
  fontSize: 14,
  textAlign: 'center',
  margin: '0 0 14px',
  lineHeight: 1.5
}

/* EDIT BAR layout */
const editBar = {
  background: '#121212',
  borderRadius: 12,
  border: '1px solid #2f2f2f',
  padding: '10px 12px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  justifyContent: 'center',
  alignItems: 'stretch'
}

const editRow = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  justifyContent: 'center'
}

const saveRow = {
  display: 'flex',
  justifyContent: 'center',
  marginTop: 4
}

const fieldGroup = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 160,
  maxWidth: 260
}

const fieldLabel = {
  color: '#bbbbbb',
  fontSize: 12,
  fontWeight: 500
}

const field = {
  background: '#161616',
  color: '#fff',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14
}

const errorText = {
  marginTop: 4,
  textAlign: 'center',
  color: '#ffb3b3',
  fontSize: 13
}

/* Cross-hatch frame */
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

/* parchment center */
const parchment = {
  background: 'url(/parchment.jpg) repeat, #f3ecdc',
  borderRadius: 10,
  padding: '16px 16px 36px',
  color: '#111',
  overflow: 'hidden'
}

/* Name line */
const stylistName = {
  textAlign: 'center',
  fontSize: 32,
  fontWeight: 900,
  color: '#000',
  margin: '2px 0 14px'
}

/* Steps grid (desktop default: 3 across) */
const stepsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 22,
  marginTop: 6
}

/* translucent “plates” like the logo */
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
const thumbLabel = {
  fontWeight: 700,
  fontSize: 14,
  color: '#5b5b5b',
  marginBottom: 8
}

// 🔵 Updated: no forced square crop, keep aspect ratio, contain inside card
const thumbImg = {
  width: '100%',
  height: 'auto',
  maxHeight: 260,
  objectFit: 'contain',
  borderRadius: 12,
  background: '#fff',
  display: 'block',
  opacity: 0.92
}

const finishedWrap = { marginTop: 16 }
const finishedLabel = {
  textAlign: 'center',
  fontWeight: 700,
  marginBottom: 10,
  fontSize: 13,
  color: '#444'
}
const finishedCard = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(255,255,255,0.82)',
  borderRadius: 16,
  padding: 12,
  boxShadow: '0 6px 18px rgba(0,0,0,.12)',
  maxWidth: 540,
  margin: '0 auto'
}
const finishedImg = {
  width: '100%',
  height: 'auto',
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