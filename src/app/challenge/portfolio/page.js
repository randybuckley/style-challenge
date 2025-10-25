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

  // Refs (we only tweak styles during PDF export)
  const rootRef = useRef(null)        // whole export root
  const hatchRef = useRef(null)       // cross-hatch frame
  const stepsRef = useRef(null)       // steps grid container
  const nameRef = useRef(null)        // name H2
  const parchmentRef = useRef(null)   // parchment center
  const finishedWrapRef = useRef(null) // wrapper around finished card
  const finishedCardRef = useRef(null) // the white rounded “card”
  const finishedImgRef = useRef(null)  // finished look <img>

  // ---------- load/profile ----------
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

  // ---------- PDF export (no page changes) ----------
  const downloadPDF = async () => {
    const html2pdf = (await import('html2pdf.js')).default
    const root = rootRef.current
    const hatch = hatchRef.current
    const steps = stepsRef.current
    const nameEl = nameRef.current
    const parch = parchmentRef.current
    const finWrap = finishedWrapRef.current
    const finCard = finishedCardRef.current
    const finImg = finishedImgRef.current
    if (!root || !hatch || !steps || !nameEl || !parch || !finWrap || !finCard || !finImg) return

    // Letter @ 96dpi
    const PDF_W = 816
    const PDF_H = 1056

    // snapshot styles
    const prevRoot = root.getAttribute('style') || ''
    const prevHatch = hatch.getAttribute('style') || ''
    const prevStepsCols = steps.style.gridTemplateColumns || ''
    const prevNameSize = nameEl.style.fontSize || ''
    const prevParchPadB = parch.style.paddingBottom || ''

    // finished block snapshots
    const prevFWTextAlign = finWrap.style.textAlign || ''
    const prevCardDisplay  = finCard.style.display || ''
    const prevCardWidth    = finCard.style.width || ''
    const prevImgWidth     = finImg.style.width || ''
    const prevImgHeight    = finImg.style.height || ''
    const prevImgMaxH      = finImg.style.maxHeight || ''

    // full-bleed frame to kill grey strip & keep one page
    root.style.width = `${PDF_W}px`
    root.style.height = `${PDF_H}px`
    root.style.margin = '0 auto'
    hatch.style.padding = '0'
    hatch.style.borderRadius = '0'
    hatch.style.minHeight = `${PDF_H}px`
    hatch.style.boxShadow = 'none'
    // tiny extra parchment at bottom so it never looks “snipped”
    parch.style.paddingBottom = '18px'

    // compact header and steps
    steps.style.gridTemplateColumns = 'repeat(3, 1fr)'
    nameEl.style.fontSize = '28px'

    // *** Finished Look: make card mirror image orientation & center it ***
    // 1) Make wrapper center children
    finWrap.style.textAlign = 'center'
    // 2) Let the card shrink to its content (the image)
    finCard.style.display = 'inline-block'
    finCard.style.width = 'auto'
    // 3) Prevent any stretching of the image; constrain by height only
    finImg.style.width = 'auto'
    finImg.style.height = 'auto'
    finImg.style.maxHeight = '460px'

    // embed images for crisp canvas
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

    // restore DOM styles
    root.setAttribute('style', prevRoot)
    hatch.setAttribute('style', prevHatch)
    steps.style.gridTemplateColumns = prevStepsCols
    nameEl.style.fontSize = prevNameSize
    parch.style.paddingBottom = prevParchPadB

    finWrap.style.textAlign = prevFWTextAlign
    finCard.style.display = prevCardDisplay
    finCard.style.width = prevCardWidth
    finImg.style.width = prevImgWidth
    finImg.style.height = prevImgHeight
    finImg.style.maxHeight = prevImgMaxH

    originals.forEach(([img, src]) => (img.src = src))
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
        <input value={firstName} onChange={(e)=>setFirstName(e.target.value)} placeholder="First Name" style={field}/>
        <input value={secondName} onChange={(e)=>setSecondName(e.target.value)} placeholder="Last Name" style={field}/>
        <input value={salonName} onChange={(e)=>setSalonName(e.target.value)} placeholder="Salon" style={{...field,minWidth:220}}/>
        <button onClick={saveProfile} disabled={saving} style={btnSmall}>{saving?'Saving…':'Save'}</button>
      </div>

      {/* export root */}
      <div ref={rootRef} style={container}>
        <div ref={hatchRef} style={hatchWrap}>
          <div style={sheet}>
            <div ref={parchmentRef} style={parchment} data-parchment="1">
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
              <div ref={finishedWrapRef} style={finishedWrap}>
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

/* Finished Look */
const finishedWrap = { marginTop: 16 } // we center this (textAlign) only during PDF export
const finishedLabel = { textAlign: 'center', fontWeight: 700, marginBottom: 10 }
const finishedCard = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 16,
  boxShadow: '0 8px 22px rgba(0,0,0,.08)',
  padding: 12
}
const finishedImg = {
  width: '100%',      // page view fills card width; for PDF we override to 'auto'
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
  border: '1px solid '#333',
  borderRadius: 8,
  padding: '10px 12px',
  minWidth: 160
}