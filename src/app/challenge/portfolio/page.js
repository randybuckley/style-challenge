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

  // intrinsic sizes (to avoid stretch & mirror orientation)
  const [dims, setDims] = useState({}) // {1:{w,h},2:{w,h},3:{w,h},4:{w,h}}

  const router = useRouter()

  // Refs we temporarily tweak for PDF export
  const rootRef = useRef(null)       // whole export root
  const hatchRef = useRef(null)      // cross-hatch frame
  const sheetRef = useRef(null)      // inner “sheet” (double-ruled)
  const parchmentRef = useRef(null)  // parchment center (we pad bottom for a clean finish)
  const stepsRef = useRef(null)      // steps grid container
  const nameRef = useRef(null)       // name H2
  const finishedImgRef = useRef(null)

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

  // remember intrinsic size on first load (prevents any stretch)
  const rememberDims = (step, e) => {
    const img = e.currentTarget
    if (!img?.naturalWidth || !img?.naturalHeight) return
    setDims(d => d[step] ? d : { ...d, [step]: { w: img.naturalWidth, h: img.naturalHeight } })
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

  // ---------- PDF export (compact grid, no grey strip, never stretch) ----------
  const downloadPDF = async () => {
    const html2pdf = (await import('html2pdf.js')).default
    const root = rootRef.current
    const hatch = hatchRef.current
    const sheet = sheetRef.current
    const parchment = parchmentRef.current
    if (!root || !hatch || !sheet || !parchment) return

    // Letter @ ~96dpi
    const PDF_W = 816
    const PDF_H = 1056

    // snapshot styles we will touch
    const prevRoot = root.getAttribute('style') || ''
    const prevHatch = hatch.getAttribute('style') || ''
    const prevSheet = sheet.getAttribute('style') || ''
    const prevParch = parchment.getAttribute('style') || ''
    const prevStepsCols = stepsRef.current?.style.gridTemplateColumns || ''
    const prevNameSize = nameRef.current?.style.fontSize || ''
    const prevFinished = {
      maxH: finishedImgRef.current?.style.maxHeight || '',
      w: finishedImgRef.current?.style.width || '',
      h: finishedImgRef.current?.style.height || '',
      maxW: finishedImgRef.current?.style.maxWidth || ''
    }

    // lock layout to exact page and remove hatch padding so it can’t show at the bottom
    root.style.width = `${PDF_W}px`
    root.style.height = `${PDF_H}px`
    root.style.margin = '0 auto'

    hatch.style.padding = '0'
    hatch.style.borderRadius = '0'
    hatch.style.minHeight = `${PDF_H}px`
    hatch.style.boxShadow = 'none'

    // ensure sheet fills full height so hatch never peeks through
    sheet.style.minHeight = `${PDF_H}px`
    sheet.style.borderRadius = '0'
    sheet.style.boxShadow =
      'inset 0 0 0 2px #cbbfa3, inset 0 0 0 10px #f2ebda, inset 0 0 0 12px #cbbfa3'

    // show a deliberate small sliver of parchment under Finished Look (and no grey)
    const parchmentBottomPad = 54
    parchment.style.paddingBottom = `${parchmentBottomPad}px`

    // compact top row in PDF and slightly reduce sizes so it all fits on one page
    if (stepsRef.current) stepsRef.current.style.gridTemplateColumns = 'repeat(3, 1fr)'
    if (nameRef.current) nameRef.current.style.fontSize = '28px'
    const thumbCards = root.querySelectorAll('[data-thumb="1"]')
    const prevCardHeights = []
    thumbCards.forEach(card => {
      prevCardHeights.push(card.style.minHeight)
      card.style.minHeight = '210px'
    })

    // Finished Look: mirror orientation, never stretch
    const fin = finishedImgRef.current
    if (fin) {
      fin.style.width = 'auto'
      fin.style.height = 'auto'
      fin.style.maxWidth = '100%'
      // If portrait, restrict by height a bit more; if landscape, height restriction is enough.
      const isPortrait = dims[4]?.h && dims[4]?.w ? (dims[4].h > dims[4].w) : true
      fin.style.maxHeight = isPortrait ? '460px' : '420px'
    }

    // embed images for crisp PDF (and avoid any dimension attributes)
    const imgs = root.querySelectorAll('img[data-embed="true"]')
    const originals = []
    await Promise.all(
      Array.from(imgs).map(async (img) => {
        originals.push([img, img.src])
        try { img.src = await toDataURL(img.src) } catch {}
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
    sheet.setAttribute('style', prevSheet)
    parchment.setAttribute('style', prevParch)
    if (stepsRef.current) stepsRef.current.style.gridTemplateColumns = prevStepsCols
    if (nameRef.current) nameRef.current.style.fontSize = prevNameSize
    thumbCards.forEach((card, i) => (card.style.minHeight = prevCardHeights[i] || ''))
    if (finishedImgRef.current) {
      finishedImgRef.current.style.maxHeight = prevFinished.maxH
      finishedImgRef.current.style.width = prevFinished.w
      finishedImgRef.current.style.height = prevFinished.h
      finishedImgRef.current.style.maxWidth = prevFinished.maxW
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
  const isFinishedPortrait = dims[4]?.h && dims[4]?.w ? (dims[4].h > dims[4].w) : null

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
          <div ref={sheetRef} style={sheet}>
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

              {/* Steps: stack on mobile, 3-across desktop (unchanged live look) */}
              <div
                ref={stepsRef}
                style={{ ...stepsGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)' }}
              >
                {[1,2,3].map(n=>(
                  <div key={n} data-thumb="1" style={thumbCard}>
                    <div style={thumbLabel}>Step {n}</div>
                    {images[n]
                      ? <img
                          src={images[n]}
                          alt={`Step ${n}`}
                          data-embed="true"
                          onLoad={(e)=>rememberDims(n, e)}
                          style={thumbImg}
                        />
                      : <div style={missing}>No image</div>}
                  </div>
                ))}
              </div>

              {/* Finished look (card mirrors orientation; never stretches) */}
              <div style={finishedWrap}>
                <div style={finishedLabel}>Finished Look — Challenge Number One</div>
                <div
                  style={{
                    ...finishedCard,
                    // Small live-time nudge so the card “feels” sized to the photo
                    maxWidth: isFinishedPortrait === true ? 680 : '100%'
                  }}
                >
                  {images[4]
                    ? <img
                        ref={finishedImgRef}
                        src={images[4]}
                        alt="Finished Look"
                        data-embed="true"
                        onLoad={(e)=>rememberDims(4, e)}
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
  padding: '16px 16px 36px', // baseline; PDF export temporarily sets bottom to 54px
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
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(255,255,255,0.82)',
  borderRadius: 16,
  boxShadow: '0 8px 22px rgba(0,0,0,.08)',
  padding: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}
const finishedImg = {
  maxWidth: '100%',
  height: 'auto',     // keep intrinsic aspect ratio
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