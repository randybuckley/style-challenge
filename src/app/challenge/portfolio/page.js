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

  const router = useRouter()

  // Refs (used for PDF export-time tweaks)
  const rootRef = useRef(null)
  const hatchRef = useRef(null)
  const stepsRef = useRef(null)
  const nameRef = useRef(null)
  const finishedImgRef = useRef(null)

  // ---------- load/profile ----------
  useEffect(() => {
    const mq = () =>
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 560)
    mq()
    window.addEventListener('resize', mq)
    return () => window.removeEventListener('resize', mq)
  }, [])

  useEffect(() => {
    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const u = sessionData?.session?.user
      if (!u) {
        router.push('/')
        return
      }
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

  // Live-page fit: never stretch portrait Finished Look horizontally
  const fitFinishedForScreen = () => {
    const el = finishedImgRef.current
    if (!el) return
    const nw = el.naturalWidth || 0
    const nh = el.naturalHeight || 0
    // reset then re-apply based on orientation
    el.style.width = ''
    el.style.height = ''
    el.style.maxHeight = '680px'
    el.style.maxWidth = '100%'
    el.style.objectFit = 'contain'
    if (nw && nh && nh > nw) {
      // portrait: constrain by height, let width be auto
      el.style.height = '680px'
      el.style.width = 'auto'
    } else {
      // landscape or square: normal full-width
      el.style.width = '100%'
      el.style.height = 'auto'
    }
  }

  // Call screen fit whenever the Finished Look image changes/loads
  useEffect(() => {
    const el = finishedImgRef.current
    if (!el) return
    if (el.complete) fitFinishedForScreen()
    el.addEventListener('load', fitFinishedForScreen)
    return () => el.removeEventListener('load', fitFinishedForScreen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images[4]])

  // ---------- PDF export (compact layout + crisp images) ----------
  const downloadPDF = async () => {
    const html2pdf = (await import('html2pdf.js')).default
    const root = rootRef.current
    const hatch = hatchRef.current
    if (!root || !hatch) return

    // Letter @ ~96dpi
    const PDF_W = 816
    const PDF_H = 1056

    // snapshot styles we will touch
    const prevRoot = root.getAttribute('style') || ''
    const prevHatch = hatch.getAttribute('style') || ''
    const prevStepsCols = stepsRef.current?.style.gridTemplateColumns || ''
    const prevNameSize = nameRef.current?.style.fontSize || ''
    const prevFinishedMaxH = finishedImgRef.current?.style.maxHeight || ''
    const finishedCardEl = root.querySelector('[data-el="finishedCard"]')
    const prevFinishedCardMB = finishedCardEl?.style.marginBottom || ''

    // full-bleed frame in export (no grey band)
    root.style.width = `${PDF_W}px`
    root.style.height = `${PDF_H}px`
    root.style.margin = '0 auto'
    hatch.style.padding = '0'
    hatch.style.borderRadius = '0'
    hatch.style.minHeight = `${PDF_H}px`
    hatch.style.boxShadow = 'none'

    // make sure we leave a subtle parchment sliver at the very bottom
    const parchmentEl = root.querySelector('[data-parchment="1"]')
    const prevParchPad = parchmentEl?.style.paddingBottom || ''
    if (parchmentEl) parchmentEl.style.paddingBottom = '26px'
    if (finishedCardEl) finishedCardEl.style.marginBottom = '8px'

    // compact top row (always 3 across for PDF)
    if (stepsRef.current) stepsRef.current.style.gridTemplateColumns = 'repeat(3, 1fr)'
    // slightly smaller name/cards for one-page fit
    if (nameRef.current) nameRef.current.style.fontSize = '28px'
    const thumbCards = root.querySelectorAll('[data-thumb="1"]')
    const prevCardHeights = []
    thumbCards.forEach((card) => {
      prevCardHeights.push(card.style.minHeight)
      card.style.minHeight = '210px'
    })

    // Finished Look: orientation-aware sizing (no horizontal stretch)
    if (finishedImgRef.current) {
      const el = finishedImgRef.current
      const nw = el.naturalWidth || 0
      const nh = el.naturalHeight || 0
      el.style.maxHeight = '520px'
      el.style.maxWidth = '100%'
      el.style.objectFit = 'contain'
      el.style.aspectRatio = 'auto'
      if (nw && nh && nh > nw) {
        // portrait
        el.style.width = 'auto'
        el.style.height = '520px'
      } else {
        // landscape or square
        el.style.width = '100%'
        el.style.height = 'auto'
      }
    }

    // embed images so html2canvas sees crisp pixels & no forced dimensions
    const imgs = root.querySelectorAll('img[data-embed="true"]')
    const originals = []
    await Promise.all(
      Array.from(imgs).map(async (img) => {
        originals.push([img, img.src])
        try {
          img.src = await toDataURL(img.src)
        } catch {}
        img.removeAttribute('width')
        img.removeAttribute('height')
        img.style.height = 'auto'
      })
    )

    await html2pdf()
      .from(root)
      .set({
        margin: 0,
        filename: 'style-challenge-portfolio.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      })
      .save()

    // restore page styles
    root.setAttribute('style', prevRoot)
    hatch.setAttribute('style', prevHatch)
    if (parchmentEl) parchmentEl.style.paddingBottom = prevParchPad
    if (finishedCardEl) finishedCardEl.style.marginBottom = prevFinishedCardMB
    if (stepsRef.current) stepsRef.current.style.gridTemplateColumns = prevStepsCols
    if (nameRef.current) nameRef.current.style.fontSize = prevNameSize
    thumbCards.forEach((card, i) => (card.style.minHeight = prevCardHeights[i] || ''))
    if (finishedImgRef.current) finishedImgRef.current.style.maxHeight = prevFinishedMaxH
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
      {/* editable identity bar */}
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

      {/* export root */}
      <div ref={rootRef} style={container}>
        <div ref={hatchRef} style={hatchWrap}>
          <div style={sheet}>
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

              {/* prominent name line */}
              <h2 ref={nameRef} style={stylistName}>
                {nameLine}
                {salonName ? (
                  <span style={{ fontWeight: 500 }}>{' — '}{salonName}</span>
                ) : null}
              </h2>

              {/* Steps (stack on mobile; 3-across on desktop; PDF forces 3-across) */}
              <div
                ref={stepsRef}
                style={{
                  ...stepsGrid,
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)'
                }}
              >
                {[1, 2, 3].map((n) => (
                  <div key={n} data-thumb="1" style={thumbCard}>
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
                <div style={finishedLabel}>Finished Look — Challenge Number One</div>
                <div style={finishedCard} data-el="finishedCard">
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

const container = { width: 'min(800px, 95vw)' }

/* Cross-hatch frame (trimmed bottom on live page) */
const hatchWrap = {
  padding: '22px 22px 14px',
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
  color: '#111'
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
const thumbLabel = { fontWeight: 700, fontSize: 14, color: '#5b5b5b', marginBottom: 8 }
const thumbImg = {
  width: '100%',
  aspectRatio: '1 / 1',
  objectFit: 'cover',
  borderRadius: 12,
  background: '#fff',
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
  height: 'auto',          // keep intrinsic aspect ratio
  maxHeight: 680,
  objectFit: 'contain',    // no crop/stretch
  aspectRatio: 'auto',
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