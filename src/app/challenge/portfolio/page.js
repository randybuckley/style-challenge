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

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const rootRef = useRef(null)           // whole export root
  const hatchRef = useRef(null)          // cross-hatch frame
  const stepsRef = useRef(null)          // steps grid container
  const nameRef = useRef(null)           // name H2
  const finishedImgRef = useRef(null)    // Finished Look <img>
  const finishedCardRef = useRef(null)   // Finished Look card (white rounded box)

  // ── Load/profile ────────────────────────────────────────────────────────────
  useEffect(() => {
    const mq = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 560)
    mq(); window.addEventListener('resize', mq)
    return () => window.removeEventListener('resize', mq)
  }, [])

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
    setSaving(true)
    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email ?? null,
        first_name: (firstName || '').trim() || null,
        second_name: (secondName || '').trim() || null,
        salon_name: (salonName || '').trim() || null
      })
    } finally { setSaving(false) }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
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

  // ── PDF export (no grey band + never-stretched Finished Look) ───────────────
  const downloadPDF = async () => {
    const html2pdf = (await import('html2pdf.js')).default
    const root = rootRef.current
    const hatch = hatchRef.current
    const parchmentEl = root?.querySelector('[data-parchment="1"]')
    if (!root || !hatch || !parchmentEl) return

    // Letter @ ~96dpi
    const PDF_W = 816
    const PDF_H = 1056

    // Snapshot existing styles to restore later
    const prevRoot = root.getAttribute('style') || ''
    const prevHatch = hatch.getAttribute('style') || ''
    const prevParchPad = parchmentEl.style.paddingBottom || ''
    const prevStepsCols = stepsRef.current?.style.gridTemplateColumns || ''
    const prevNameSize = nameRef.current?.style.fontSize || ''

    const finishedImg = finishedImgRef.current
    const finishedCard = finishedCardRef.current
    const prevCardStyle = {
      position: finishedCard?.style.position || '',
      height: finishedCard?.style.height || '',
      overflow: finishedCard?.style.overflow || '',
      display: finishedCard?.style.display || '',
    }
    const prevImgStyle = finishedImg ? {
      position: finishedImg.style.position || '',
      top: finishedImg.style.top || '',
      left: finishedImg.style.left || '',
      transform: finishedImg.style.transform || '',
      maxWidth: finishedImg.style.maxWidth || '',
      maxHeight: finishedImg.style.maxHeight || '',
      width: finishedImg.style.width || '',
      height: finishedImg.style.height || '',
    } : {}

    // 1) Full-bleed cross-hatch; no grey band
    root.style.width = `${PDF_W}px`
    root.style.height = `${PDF_H}px`
    root.style.margin = '0 auto'
    hatch.style.padding = '0'               // push parchment to the very edge
    hatch.style.borderRadius = '0'
    hatch.style.minHeight = `${PDF_H}px`
    hatch.style.boxShadow = 'none'
    // ensure we see parchment (not cross-hatch) at the very bottom
    parchmentEl.style.paddingBottom = '28px'

    // 2) Compact top row to keep everything on one page
    if (stepsRef.current) stepsRef.current.style.gridTemplateColumns = 'repeat(3, 1fr)'
    if (nameRef.current) nameRef.current.style.fontSize = '28px'
    const thumbCards = root.querySelectorAll('[data-thumb="1"]')
    const prevCardHeights = []
    thumbCards.forEach(card => { prevCardHeights.push(card.style.minHeight); card.style.minHeight = '210px' })

    // 3) Finished Look: letterbox inside the white rounded card (no stretching)
    if (finishedImg && finishedCard) {
      // detect orientation safely
      let natW = finishedImg.naturalWidth, natH = finishedImg.naturalHeight
      if (!natW || !natH) {
        const probe = new Image()
        probe.src = finishedImg.src
        await new Promise(res => { probe.onload = res; probe.onerror = res })
        natW = probe.naturalWidth || 1
        natH = probe.naturalHeight || 1
      }
      const isPortrait = natH >= natW

      // give the card a fixed box; image will be absolutely centered
      finishedCard.style.position = 'relative'
      finishedCard.style.display  = 'block'
      finishedCard.style.overflow = 'hidden'
      finishedCard.style.height   = isPortrait ? '540px' : '420px'

      finishedImg.style.position  = 'absolute'
      finishedImg.style.top       = '50%'
      finishedImg.style.left      = '50%'
      finishedImg.style.transform = 'translate(-50%, -50%)'
      finishedImg.style.maxWidth  = '100%'
      finishedImg.style.maxHeight = '100%'
      finishedImg.style.width     = 'auto'
      finishedImg.style.height    = 'auto'
    }

    // 4) Embed images for crisp PDF
    const imgs = root.querySelectorAll('img[data-embed="true"]')
    const originals = []
    await Promise.all(
      Array.from(imgs).map(async (img) => {
        originals.push([img, img.src])
        try { img.src = await toDataURL(img.src) } catch {}
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

    // Restore everything
    root.setAttribute('style', prevRoot)
    hatch.setAttribute('style', prevHatch)
    parchmentEl.style.paddingBottom = prevParchPad
    if (stepsRef.current) stepsRef.current.style.gridTemplateColumns = prevStepsCols
    if (nameRef.current) nameRef.current.style.fontSize = prevNameSize
    thumbCards.forEach((card, i) => (card.style.minHeight = prevCardHeights[i] || ''))
    if (finishedCard) {
      finishedCard.style.position = prevCardStyle.position
      finishedCard.style.height   = prevCardStyle.height
      finishedCard.style.overflow = prevCardStyle.overflow
      finishedCard.style.display  = prevCardStyle.display
    }
    if (finishedImg) {
      finishedImg.style.position  = prevImgStyle.position
      finishedImg.style.top       = prevImgStyle.top
      finishedImg.style.left      = prevImgStyle.left
      finishedImg.style.transform = prevImgStyle.transform
      finishedImg.style.maxWidth  = prevImgStyle.maxWidth
      finishedImg.style.maxHeight = prevImgStyle.maxHeight
      finishedImg.style.width     = prevImgStyle.width
      finishedImg.style.height    = prevImgStyle.height
    }
    originals.forEach(([img, src]) => (img.src = src))
  }

  // ── UI ───────────────────────────────────────────────────────────────────────
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
        <input value={firstName} onChange={(e)=>setFirstName(e.target.value)} placeholder="First Name" style={field}/>
        <input value={secondName} onChange={(e)=>setSecondName(e.target.value)} placeholder="Last Name" style={field}/>
        <input value={salonName} onChange={(e)=>setSalonName(e.target.value)} placeholder="Salon" style={{...field,minWidth:220}}/>
        <button onClick={saveProfile} disabled={saving} style={btnSmall}>{saving?'Saving…':'Save'}</button>
      </div>

      {/* export root */}
      <div ref={rootRef} style={container}>
        <div ref={hatchRef} style={hatchWrap}>
          <div style={sheet}>
            <div style={parchment} data-parchment="1">
              {/* translucent rounded logo */}
              <div style={{ textAlign:'center', marginTop:6, marginBottom:6 }}>
                <img
                  src="/logo.jpeg"
                  alt="Patrick Cameron — Style Challenge"
                  data-embed="true"
                  style={{ width:220, height:'auto', display:'inline-block', opacity:.6, borderRadius:16 }}
                />
              </div>

              {/* prominent name line */}
              <h2 ref={nameRef} style={stylistName}>
                {nameLine}
                {salonName ? <span style={{ fontWeight:500 }}>{' — '}{salonName}</span> : null}
              </h2>

              {/* Steps */}
              <div
                ref={stepsRef}
                style={{ ...stepsGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)' }}
              >
                {[1,2,3].map(n=>(
                  <div key={n} data-thumb="1" style={thumbCard}>
                    <div style={thumbLabel}>Step {n}</div>
                    {images[n]
                      ? <img src={images[n]} alt={`Step ${n}`} data-embed="true" style={thumbImg}/>
                      : <div style={missing}>No image</div>}
                  </div>
                ))}
              </div>

              {/* Finished look */}
              <div style={finishedWrap}>
                <div style={finishedLabel}>Finished Look — Challenge Number One</div>
                <div ref={finishedCardRef} style={finishedCard}>
                  {images[4]
                    ? <img
                        ref={finishedImgRef}
                        src={images[4]}
                        alt="Finished Look"
                        data-embed="true"
                        style={finishedImg}
                      />
                    : <div style={missing}>No final image</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* actions */}
      <div style={{ marginTop: 18, textAlign:'center' }}>
        <button onClick={downloadPDF} style={{ ...btn, marginRight:10 }}>📄 Download Portfolio</button>
        <button onClick={()=>router.push('/challenge/submission/competition')} style={{ ...btn, background:'#28a745' }}>
          ✅ Become Certified
        </button>
      </div>
    </main>
  )
}

/* ===================== styles (unchanged for the live page) ================== */

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
  background: 'rgba(255,255,255,0.60)',        // match opacity of step cards
  border: '1px solid rgba(255,255,255,0.82)',
  borderRadius: 16,
  boxShadow: '0 8px 22px rgba(0,0,0,.12)',
  padding: 12
}
const finishedImg = {
  width: '100%',
  height: 'auto',       // page view stays as before; export overrides for letterbox
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