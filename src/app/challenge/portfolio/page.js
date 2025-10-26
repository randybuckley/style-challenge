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

  // live-page refs
  const rootRef = useRef(null)
  const hatchRef = useRef(null)
  const stepsRef = useRef(null)
  const nameRef = useRef(null)

  // PDF-only layout ref (off-screen, exact Letter size)
  const pdfRootRef = useRef(null)

  // finished-look natural dimensions (prevents stretch)
  const [finDims, setFinDims] = useState({ w: 0, h: 0 })

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

  // pre-measure Finished Look to avoid stretch in both page & PDF
  useEffect(() => {
    if (!images[4]) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setFinDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = images[4]
  }, [images[4]])

  // embed image for PDF fidelity
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

  // Generate PDF from the dedicated off-screen layout (no side effects on live page)
  const downloadPDF = async () => {
    const html2pdf = (await import('html2pdf.js')).default
    const pdfRoot = pdfRootRef.current
    if (!pdfRoot) return

    // swap image src to data URLs for crispness (export layout only)
    const imgs = pdfRoot.querySelectorAll('img[data-embed="true"]')
    const originals = []
    await Promise.all(
      Array.from(imgs).map(async (img) => {
        originals.push([img, img.src])
        try {
          img.src = await toDataURL(img.src)
        } catch {}
      })
    )

    await html2pdf()
      .from(pdfRoot)
      .set({
        margin: 0,
        filename: 'style-challenge-portfolio.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      })
      .save()

    // restore
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

  // finished-look sizing helpers
  const isPortrait = finDims.w && finDims.h ? finDims.h >= finDims.w : false

  // live-page finished image style (no stretch, centered)
  const liveFinishedImgStyle = isPortrait
    ? { width: 'auto', height: '100%', maxHeight: 680, objectFit: 'contain' }
    : { width: '100%', height: 'auto', maxHeight: 680, objectFit: 'contain' }

  // PDF finished image style (mirrors orientation; card centers image)
  const pdfFinishedImgStyle = isPortrait
    ? { width: 'auto', height: '100%', maxHeight: 520, objectFit: 'contain' }
    : { width: '100%', height: 'auto', maxHeight: 520, objectFit: 'contain' }

  return (
    <main style={pageShell}>
      {/* ====== Editable identity bar (live page) ====== */}
      <div style={editBar}>
        <input value={firstName} onChange={(e)=>setFirstName(e.target.value)} placeholder="First Name" style={field}/>
        <input value={secondName} onChange={(e)=>setSecondName(e.target.value)} placeholder="Last Name" style={field}/>
        <input value={salonName} onChange={(e)=>setSalonName(e.target.value)} placeholder="Salon" style={{...field,minWidth:220}}/>
        <button onClick={saveProfile} disabled={saving} style={btnSmall}>{saving?'Saving…':'Save'}</button>
      </div>

      {/* ====== LIVE PAGE CERTIFICATE (unchanged look & feel) ====== */}
      <div ref={rootRef} style={container}>
        <div ref={hatchRef} style={hatchWrap}>
          <div style={sheet}>
            <div style={parchment}>
              {/* logo */}
              <div style={{ textAlign:'center', marginTop:6, marginBottom:6 }}>
                <img
                  src="/logo.jpeg"
                  alt="Patrick Cameron — Style Challenge"
                  data-embed="true"
                  style={{ width:220, height:'auto', display:'inline-block', opacity:.6, borderRadius:16 }}
                />
              </div>

              {/* name */}
              <h2 ref={nameRef} style={stylistName}>
                {nameLine}
                {salonName ? <span style={{ fontWeight:500 }}>{' — '}{salonName}</span> : null}
              </h2>

              {/* Steps 1–3 */}
              <div
                ref={stepsRef}
                style={{ ...stepsGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)' }}
              >
                {[1,2,3].map(n=>(
                  <div key={n} style={thumbCard}>
                    <div style={thumbLabel}>Step {n}</div>
                    {images[n]
                      ? <img src={images[n]} alt={`Step ${n}`} data-embed="true" style={thumbImg}/>
                      : <div style={missing}>No image</div>}
                  </div>
                ))}
              </div>

              {/* Finished Look — live page (no stretch, centered) */}
              <div style={finishedWrap}>
                <div style={finishedLabel}>Finished Look — Challenge Number One</div>
                <div style={finishedCardLive}>
                  {images[4]
                    ? (
                      <div style={finishedViewportLive(isPortrait)}>
                        <img
                          src={images[4]}
                          alt="Finished Look"
                          data-embed="true"
                          style={{ ...finishedImgBase, ...liveFinishedImgStyle }}
                        />
                      </div>
                    )
                    : <div style={missing}>No final image</div>}
                </div>
              </div>

              {/* tiny preloader to ensure we have finDims */}
              {images[4] && (
                <img
                  src={images[4]}
                  alt=""
                  style={{ display:'none' }}
                  onLoad={(e)=>setFinDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ====== ACTIONS ====== */}
      <div style={{ marginTop: 18, textAlign:'center' }}>
        <button onClick={downloadPDF} style={{ ...btn, marginRight:10 }}>📄 Download Portfolio</button>
        <button onClick={()=>router.push('/challenge/submission/competition')} style={{ ...btn, background:'#28a745' }}>
          ✅ Become Certified
        </button>
      </div>

      {/* ====== OFF-SCREEN PDF LAYOUT (exact Letter size; no grey strip) ====== */}
      <div style={{ position:'fixed', left:-99999, top:0 }}>
        <div
          ref={pdfRootRef}
          style={{
            width: 816,           // 8.5in * 96
            height: 1056,         // 11in  * 96
            background:
              'repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 2px, rgba(0,0,0,0) 2px 7px),' +
              'repeating-linear-gradient(0deg, rgba(0,0,0,.045) 0 2px, rgba(0,0,0,0) 2px 7px)',
            backgroundColor:'#eae7df',
            display:'flex',
            alignItems:'center',
            justifyContent:'center'
          }}
        >
          <div
            style={{
              width: 744,          // inner content width
              padding: 18,
              background:'#f2ebda',
              borderRadius: 0,
              boxShadow:'inset 0 0 0 2px #cbbfa3, inset 0 0 0 10px #f2ebda, inset 0 0 0 12px #cbbfa3'
            }}
          >
            <div style={{ background:'url(/parchment.jpg) repeat, #f3ecdc', padding:'12px 12px 18px' }}>
              {/* logo */}
              <div style={{ textAlign:'center', margin:'4px 0 6px' }}>
                <img
                  src="/logo.jpeg"
                  data-embed="true"
                  alt=""
                  style={{ width:200, height:'auto', opacity:.6, borderRadius:14 }}
                />
              </div>

              <h2 style={{ textAlign:'center', fontSize:28, fontWeight:900, margin:'2px 0 10px', color:'#000' }}>
                {nameLine}{salonName ? <span style={{ fontWeight:500 }}>{' — '}{salonName}</span> : null}
              </h2>

              {/* steps (always 3 across in PDF) */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16, marginTop:6 }}>
                {[1,2,3].map(n=>(
                  <div key={n} style={thumbCardPDF}>
                    <div style={thumbLabelPDF}>Step {n}</div>
                    {images[n]
                      ? <img src={images[n]} data-embed="true" alt="" style={thumbImgPDF}/>
                      : <div style={missing}>No image</div>}
                  </div>
                ))}
              </div>

              {/* Finished Look (card matches photo orientation; centered; no stretch) */}
              <div style={{ marginTop: 14 }}>
                <div style={{ textAlign:'center', fontWeight:700, marginBottom:10 }}>
                  Finished Look — Challenge Number One
                </div>
                <div style={finishedCardPDF}>
                  {images[4] ? (
                    <div style={finishedViewportPDF(isPortrait)}>
                      <img
                        src={images[4]}
                        data-embed="true"
                        alt=""
                        style={{ ...finishedImgBase, ...pdfFinishedImgStyle }}
                      />
                    </div>
                  ) : (
                    <div style={missing}>No final image</div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

/* ===================== styles (live) ===================== */

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
  padding: '16px 16px 20px',
  color: '#111'
}

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
  objectFit: 'cover',
  borderRadius: 12,
  background: '#fff',
  display: 'block',
  opacity: 0.92
}

/* Live finished look: viewport & base img */
const finishedWrap = { marginTop: 16 }
const finishedLabel = { textAlign: 'center', fontWeight: 700, marginBottom: 10 }
const finishedCardLive = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 16,
  boxShadow: '0 8px 22px rgba(0,0,0,.08)',
  padding: 12
}
const finishedViewportLive = (portrait) => ({
  width: '100%',
  maxHeight: 680,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: portrait ? '3 / 4' : '16 / 10',
  background: '#fff',
  borderRadius: 12,
  overflow: 'hidden'
})
const finishedImgBase = {
  background: '#fff',
  display: 'block',
  borderRadius: 12,
  opacity: 0.92
}

/* PDF-specific small cards */
const thumbCardPDF = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(255,255,255,0.82)',
  borderRadius: 14,
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minHeight: 180
}
const thumbLabelPDF = { fontWeight: 700, fontSize: 12, color: '#5b5b5b', marginBottom: 6 }
const thumbImgPDF = {
  width: '100%',
  aspectRatio: '1 / 1',
  objectFit: 'cover',
  borderRadius: 10,
  background: '#fff',
  display: 'block'
}

/* PDF finished look card & viewport (fixed space; image centers without stretch) */
const finishedCardPDF = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(255,255,255,0.82)',
  borderRadius: 16,
  padding: 12
}
const finishedViewportPDF = (portrait) => ({
  width: '100%',
  height: portrait ? 520 : 420, // give portrait more vertical room
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#fff',
  borderRadius: 12,
  overflow: 'hidden'
})

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