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
  const portfolioRef = useRef(null) // kept (not used by PDF now, but harmless)
  const hatchRef = useRef(null)     // kept for parity

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

  // simple responsive switch for Steps grid
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const apply = () => setIsMobile(!!mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

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

  // ---------- PDF helpers (off-screen one-page layout) ----------
  const toDataURL = async (url) => {
    if (!url) return null
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
        img.src = url
      })
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      return c.toDataURL('image/jpeg', 0.95)
    } catch {
      return url // fallback
    }
  }

  function buildPdfDom({ nameLine, salonName, urls }) {
    // Letter page at ~96dpi
    const W = 816
    const H = 1056

    // tuned constants to keep within one page
    const OUTER_PAD = 18
    const PARCH_PAD = 16
    const THUMB_SIZE = 170
    const THUMB_GAP = 14
    const FINISHED_H = 460
    const NAME_FS = 28

    // Outer hatch
    const hatch = document.createElement('div')
    Object.assign(hatch.style, {
      position: 'fixed',
      left: '-10000px', // off-screen so it doesn't flash
      top: '0',
      width: `${W}px`,
      height: `${H}px`,
      boxSizing: 'border-box',
      padding: `${OUTER_PAD}px`,
      backgroundImage:
        'repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 2px, rgba(0,0,0,0) 2px 7px),' +
        'repeating-linear-gradient(0deg, rgba(0,0,0,.045) 0 2px, rgba(0,0,0,0) 2px 7px)',
      backgroundColor: '#eae7df',
      borderRadius: '0',
    })

    // sheet
    const sheet = document.createElement('div')
    Object.assign(sheet.style, {
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      background: '#f2ebda',
      borderRadius: '12px',
      boxShadow:
        'inset 0 0 0 2px #cbbfa3, inset 0 0 0 10px #f2ebda, inset 0 0 0 12px #cbbfa3',
      overflow: 'hidden',
    })
    hatch.appendChild(sheet)

    // parchment
    const parchment = document.createElement('div')
    Object.assign(parchment.style, {
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      padding: `${PARCH_PAD}px`,
      background: 'url(/parchment.jpg) repeat, #f3ecdc',
      borderRadius: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    })
    sheet.appendChild(parchment)

    // logo
    const logoWrap = document.createElement('div')
    Object.assign(logoWrap.style, { textAlign: 'center', marginTop: '2px', marginBottom: '0' })
    const logo = document.createElement('img')
    logo.src = '/logo.jpeg'
    logo.setAttribute('data-embed', 'true')
    Object.assign(logo.style, {
      width: '200px',
      height: 'auto',
      opacity: '0.6',
      borderRadius: '16px',
    })
    logoWrap.appendChild(logo)
    parchment.appendChild(logoWrap)

    // prominent name
    const nameLineEl = document.createElement('div')
    nameLineEl.textContent = salonName ? `${nameLine} — ${salonName}` : nameLine
    Object.assign(nameLineEl.style, {
      textAlign: 'center',
      fontSize: `${NAME_FS}px`,
      fontWeight: '900',
      color: '#000',
      margin: '2px 0 8px'
    })
    parchment.appendChild(nameLineEl)

    // steps row
    const stepsRow = document.createElement('div')
    Object.assign(stepsRow.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: `${THUMB_GAP}px`,
      alignItems: 'start'
    })
    parchment.appendChild(stepsRow)

    ;[1, 2, 3].forEach((n) => {
      const card = document.createElement('div')
      Object.assign(card.style, {
        background: 'rgba(255,255,255,0.60)',
        border: '1px solid rgba(255,255,255,0.82)',
        borderRadius: '16px',
        padding: '10px',
        boxShadow: '0 6px 18px rgba(0,0,0,.12)',
        minHeight: `${THUMB_SIZE + 44}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      })
      const label = document.createElement('div')
      label.textContent = `Step ${n}`
      Object.assign(label.style, {
        fontWeight: '700',
        fontSize: '14px',
        color: '#5b5b5b',
        marginBottom: '6px'
      })
      card.appendChild(label)

      if (urls[n]) {
        const img = document.createElement('img')
        img.src = urls[n]
        img.setAttribute('data-embed', 'true')
        Object.assign(img.style, {
          width: '100%',
          maxWidth: `${THUMB_SIZE}px`,
          height: `${THUMB_SIZE}px`,
          objectFit: 'contain',
          borderRadius: '12px',
          background: '#fff',
          border: '1px solid #eee',
          opacity: '0.92',
          display: 'block'
        })
        card.appendChild(img)
      } else {
        const miss = document.createElement('div')
        miss.textContent = 'No image'
        Object.assign(miss.style, { color: '#888', fontStyle: 'italic', marginTop: '18px' })
        card.appendChild(miss)
      }

      stepsRow.appendChild(card)
    })

    // finished look
    const finWrap = document.createElement('div')
    Object.assign(finWrap.style, { marginTop: '10px' })
    const finLabel = document.createElement('div')
    finLabel.textContent = 'Finished Look — Challenge Number One'
    Object.assign(finLabel.style, { textAlign: 'center', fontWeight: 700, marginBottom: '8px' })
    finWrap.appendChild(finLabel)

    const finCard = document.createElement('div')
    Object.assign(finCard.style, {
      background: '#fff',
      border: '1px solid #e6e6e6',
      borderRadius: '16px',
      boxShadow: '0 8px 22px rgba(0,0,0,.08)',
      padding: '12px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: `${FINISHED_H}px`
    })

    if (urls[4]) {
      const fin = document.createElement('img')
      fin.src = urls[4]
      fin.setAttribute('data-embed', 'true')
      Object.assign(fin.style, {
        width: '100%',
        maxHeight: `${FINISHED_H}px`,
        objectFit: 'contain',
        borderRadius: '12px',
        background: '#fff',
        display: 'block',
        opacity: '0.92'
      })
      finCard.appendChild(fin)
    } else {
      const miss = document.createElement('div')
      miss.textContent = 'No final image'
      Object.assign(miss.style, { color: '#888', fontStyle: 'italic' })
      finCard.appendChild(miss)
    }

    finWrap.appendChild(finCard)
    parchment.appendChild(finWrap)

    return hatch
  }

  const downloadPDF = async () => {
    const nameLine = [firstName, secondName].filter(Boolean).join(' ') || user?.email
    const urls = { 1: images[1], 2: images[2], 3: images[3], 4: images[4] }
    const pdfRoot = buildPdfDom({ nameLine, salonName, urls })
    document.body.appendChild(pdfRoot)

    // embed imgs
    const imgs = Array.from(pdfRoot.querySelectorAll('img[data-embed="true"]'))
    const originals = []
    await Promise.all(
      imgs.map(async (img) => {
        originals.push([img, img.src])
        const dataUrl = await toDataURL(img.src)
        if (dataUrl) img.src = dataUrl
      })
    )

    const html2pdf = (await import('html2pdf.js')).default
    await html2pdf()
      .from(pdfRoot)
      .set({
        margin: 0,
        filename: 'style-challenge-portfolio.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      })
      .save()

    pdfRoot.remove()
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

      {/* Certificate container (on-screen layout remains) */}
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

              {/* Steps 1–3 (equal sizes; stacks on mobile) */}
              <div style={getStepsGrid(isMobile)}>
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
  padding: '16px 16px 36px',
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

// responsive steps grid
const getStepsGrid = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
  gap: 22,
  marginTop: 6
})

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