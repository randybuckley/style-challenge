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
  const portfolioRef = useRef()
  const hatchRef = useRef()

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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

  const downloadPDF = async () => {
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const root = portfolioRef.current
      if (!root) return

      // US Letter in CSS px at ~96dpi
      const PDF_PX_W = 816
      const PDF_PX_H = 1056

      // Snapshot styles we’ll temporarily override
      const hatch = hatchRef.current
      const prev = {
        root: root.getAttribute('style') || '',
        hatch: hatch?.getAttribute('style') || '',
      }

      // Lock layout so cross-hatch hits page edges, no side gaps
      root.style.width = `${PDF_PX_W}px`
      root.style.margin = '0 auto'
      if (hatch) {
        hatch.style.borderRadius = '0px'
        hatch.style.padding = '16px'       // slightly tighter than before
        hatch.style.paddingBottom = '8px'  // minimize grey at bottom
        hatch.style.minHeight = `${PDF_PX_H}px`
        hatch.style.boxShadow = 'none'
      }

      // More parchment bottom, but keep total height in check for width-fit
      const parchmentEl = root.querySelector('[data-parchment="1"]')
      const prevParchPad = parchmentEl?.style.paddingBottom || ''
      if (parchmentEl) parchmentEl.style.paddingBottom = '44px'

      // ---------- TEMP PDF-ONLY LAYOUT OVERRIDES ----------
      // Force Steps into 3 columns small at top, big Finished below
      const stepsGridEl = root.querySelector('[data-role="steps-grid"]')
      const thumbCards = root.querySelectorAll('[data-role="thumb-card"]')
      const finishedImgEl = root.querySelector('[data-role="finished-img"]')

      const prevStepsStyle = stepsGridEl?.getAttribute('style') || ''
      if (stepsGridEl) {
        stepsGridEl.style.display = 'grid'
        stepsGridEl.style.gridTemplateColumns = 'repeat(3, 1fr)'
        stepsGridEl.style.gap = '14px'
        stepsGridEl.style.marginTop = '6px'
      }
      const prevThumbs = []
      thumbCards.forEach((el) => {
        prevThumbs.push([el, el.getAttribute('style') || ''])
        el.style.minHeight = '200px'
        el.style.padding = '10px'
      })
      const prevFinishedStyle = finishedImgEl?.getAttribute('style') || ''
      if (finishedImgEl) {
        // slightly smaller to keep overall height within 1 page on width-fit
        finishedImgEl.style.maxHeight = '600px'
        finishedImgEl.style.objectFit = 'contain'
        finishedImgEl.style.width = '100%'
      }
      // ---------- /TEMP OVERRIDES ----------

      // Embed any remote images so CORS can’t blank the canvas
      const imgs = root.querySelectorAll('img[data-embed="true"]')
      const originals = []
      await Promise.all(
        Array.from(imgs).map(async (img) => {
          originals.push([img, img.src])
          try {
            const dataUrl = await toDataURL(img.src)
            img.setAttribute('src', dataUrl)
          } catch {}
        })
      )

      // Capture to canvas
      const canvas = await html2canvas(root, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: PDF_PX_W,
        windowHeight: Math.max(PDF_PX_H, root.scrollHeight),
      })

      // Build single-page PDF with **no left/right margin**:
      const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()

      const pxToPt = 0.75 // 96 -> 72 dpi
      const imgWpt = canvas.width * pxToPt
      const imgHpt = canvas.height * pxToPt

      // Fill width first (no side margins). If too tall, fall back to "fit page".
      let scaleW = pageW / imgWpt
      let scaledH = imgHpt * scaleW
      let useScale = scaleW
      if (scaledH > pageH) {
        // fallback: fit-to-page to avoid cropping (adds small margins if needed)
        const scaleFit = Math.min(pageW / imgWpt, pageH / imgHpt)
        useScale = scaleFit
        scaledH = imgHpt * useScale
      }

      const drawW = imgWpt * useScale
      const drawH = scaledH
      const x = (drawW === pageW) ? 0 : (pageW - drawW) / 2   // 0 if width-fit
      const y = (pageH - drawH) / 2                            // center vertically

      doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, y, drawW, drawH)
      doc.save('style-challenge-portfolio.pdf')

      // Restore DOM
      originals.forEach(([img, src]) => img.setAttribute('src', src))
      if (parchmentEl) parchmentEl.style.paddingBottom = prevParchPad
      root.setAttribute('style', prev.root)
      if (hatch) hatch.setAttribute('style', prev.hatch)
      if (stepsGridEl) stepsGridEl.setAttribute('style', prevStepsStyle)
      thumbCards.forEach((el, i) => el.setAttribute('style', prevThumbs[i][1]))
      if (finishedImgEl) finishedImgEl.setAttribute('style', prevFinishedStyle)
    } catch (e) {
      alert('PDF render failed. Please try again.')
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
  const stepsGridStyle = {
    ...stepsGrid,
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)'
  }

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
        <div ref={hatchRef} style={hatchWrap}>
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

              {/* Prominent black name */}
              <h2 style={stylistName}>
                {nameLine}
                {salonName ? <span style={{ fontWeight: 500 }}>{' — '}{salonName}</span> : null}
              </h2>

              {/* Steps 1–3 (responsive; PDF forces 3-up via downloadPDF) */}
              <div data-role="steps-grid" style={stepsGridStyle}>
                {[1, 2, 3].map((n) => (
                  <div key={n} data-role="thumb-card" style={thumbCard}>
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
                      data-role="finished-img"
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

const container = { width: 'min(800px, 95vw)' }

/* Cross-hatch “margin” layer */
const hatchWrap = {
  padding: 22, // export temporarily sets bottom to 8px
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
  padding: '16px 16px 36px', // baseline; lifted to 44px in PDF to show more parchment
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

/* steps grid: columns set at runtime for mobile/desktop */
const stepsGrid = {
  display: 'grid',
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