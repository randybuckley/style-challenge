'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import jsPDF from 'jspdf'
import exifr from 'exifr'
import { supabase } from '../../../lib/supabaseClient' // keep this path

export default function PortfolioPage() {
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [latestByStep, setLatestByStep] = useState({}) // {1:url,2:url,3:url,4:url}
  const [loading, setLoading] = useState(true)

  const [firstName, setFirstName] = useState('')
  const [secondName, setSecondName] = useState('')
  const [salonName, setSalonName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [skipNextAutosave, setSkipNextAutosave] = useState(true) // avoids autosave right after load
  const [pdfBusy, setPdfBusy] = useState(false) // 👈 prevent double-clicks while generating

  const frameRef = useRef(null)
  const STORAGE_PREFIX =
    'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'

  // Load session, uploads (latest per step), and profile
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const sessionUser = sessionData?.session?.user
        if (!sessionUser) {
          router.push('/')
          return
        }
        if (cancelled) return
        setUser(sessionUser)

        // newest first → keep first per step
        const { data: uploads, error: upErr } = await supabase
          .from('uploads')
          .select('step_number, image_url, created_at')
          .eq('user_id', sessionUser.id)
          .in('step_number', [1, 2, 3, 4])
          .order('created_at', { ascending: false })

        if (upErr) console.warn('[uploads] error:', upErr.message)

        const latest = {}
        for (const row of uploads || []) {
          if (!row?.image_url) continue
          const step = row.step_number
          if (!latest[step]) {
            latest[step] = row.image_url.startsWith('http')
              ? row.image_url
              : STORAGE_PREFIX + row.image_url
          }
        }
        if (!cancelled) setLatestByStep(latest)

        // ensure profile row + load fields
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert(
            { id: sessionUser.id, email: sessionUser.email ?? null },
            { onConflict: 'id' }
          )
        if (upsertErr) console.warn('[profiles.upsert] error:', upsertErr.message)

        const { data: profile, error: profErr } = await supabase
          .from('profiles')
          .select('first_name, second_name, salon_name')
          .eq('id', sessionUser.id)
          .single()

        if (profErr) {
          console.warn('[profiles.select] error:', profErr.message)
        } else if (profile && !cancelled) {
          setFirstName(profile.first_name || '')
          setSecondName(profile.second_name || '')
          setSalonName(profile.salon_name || '')
          setSkipNextAutosave(true) // skip the initial autosave triggered by these sets
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [router])

  // Debounced autosave (skips the first run after loading the profile)
  useEffect(() => {
    if (!user) return
    if (skipNextAutosave) {
      setSkipNextAutosave(false)
      return
    }
    setSaving(true)
    const t = setTimeout(async () => {
      try {
        const { error } = await supabase.from('profiles').upsert({
          id: user.id,
          email: user.email ?? null,
          first_name: (firstName || '').trim() || null,
          second_name: (secondName || '').trim() || null,
          salon_name: (salonName || '').trim() || null
        })
        if (error) {
          console.warn('[profiles.autosave] error:', error.message)
        } else {
          setSavedAt(Date.now())
        }
      } finally {
        setSaving(false)
      }
    }, 600)
    return () => clearTimeout(t)
  }, [firstName, secondName, salonName, user, skipNextAutosave])

  const displayName = useMemo(
    () => `${firstName || ''} ${secondName || ''}`.trim(),
    [firstName, secondName]
  )

  // -------- PDF helpers (EXIF-aware) --------
  const blobToDataURL = (blob) =>
    new Promise((resolve) => {
      const r = new FileReader()
      r.onloadend = () => resolve(r.result)
      r.readAsDataURL(blob)
    })

  const urlToDataURL = async (url) => {
    try {
      const res = await fetch(url, { mode: 'cors' })
      const blob = await res.blob()
      return await blobToDataURL(blob)
    } catch (e) {
      console.warn('[urlToDataURL] fallback for', url, e)
      // last resort: return empty 1x1 so PDF still renders
      return 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
    }
  }

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = (err) => reject(err)
      img.src = src
    })

  const drawOriented = (ctx, img, orientation, targetW, targetH) => {
    const c = ctx.canvas
    const swap = () => {
      const tmp = c.width
      c.width = c.height
      c.height = tmp
    }
    c.width = targetW
    c.height = targetH

    switch (orientation) {
      case 2: ctx.translate(c.width, 0); ctx.scale(-1, 1); break
      case 3: ctx.translate(c.width, c.height); ctx.rotate(Math.PI); break
      case 4: ctx.translate(0, c.height); ctx.scale(1, -1); break
      case 5: swap(); ctx.rotate(0.5 * Math.PI); ctx.scale(1, -1); break
      case 6: swap(); ctx.rotate(0.5 * Math.PI); ctx.translate(0, -c.width); break
      case 7: swap(); ctx.rotate(-0.5 * Math.PI); ctx.scale(1, -1); ctx.translate(-c.height, 0); break
      case 8: swap(); ctx.rotate(-0.5 * Math.PI); ctx.translate(-c.height, 0); break
      default: break
    }

    const arImg = img.width / img.height
    const arBox = (orientation >= 5 && orientation <= 8)
      ? c.height / c.width
      : c.width / c.height

    let sx = 0, sy = 0, sw = img.width, sh = img.height
    if (arImg > arBox) {
      const newW = sh * arBox
      sx = (sw - newW) / 2
      sw = newW
    } else {
      const newH = sw / arBox
      sy = (sh - newH) / 2
      sh = newH
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
  }

  const orientedDataURL = async (url, outW, outH) => {
    try {
      const [img, exif] = await Promise.all([loadImage(url), exifr.parse(url)])
      const orientation = exif?.Orientation || 1
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      drawOriented(ctx, img, orientation, outW, outH)
      return canvas.toDataURL('image/jpeg', 0.92)
    } catch (err) {
      console.warn('[orientedDataURL] fallback (no EXIF) for', url, err)
      try {
        const img = await loadImage(url)
        const canvas = document.createElement('canvas')
        canvas.width = outW
        canvas.height = outH
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, outW, outH)
        return canvas.toDataURL('image/jpeg', 0.92)
      } catch (err2) {
        console.warn('[orientedDataURL] final fallback 1x1 for', url, err2)
        return 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
      }
    }
  }

  const handleDownloadPDF = async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const doc = new jsPDF('p', 'pt', 'a4')
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()

      try {
        const parchment = await urlToDataURL('/parchment.jpg')
        doc.addImage(parchment, 'JPEG', 0, 0, pageW, pageH)
      } catch {}

      // double frame
      doc.setDrawColor(43, 43, 43)
      doc.setLineWidth(3); doc.rect(18, 18, pageW - 36, pageH - 36)
      doc.setLineWidth(1); doc.rect(28, 28, pageW - 56, pageH - 56)

      let y = 48

      // logo card (keep aspect)
      try {
        const logoImg = await loadImage('/logo.jpeg')
        const logoW = 240
        const logoH = Math.round((logoImg.height / logoImg.width) * logoW)
        const pad = 12
        const cardW = logoW + pad * 2
        const cardH = logoH + pad * 2
        const cardX = pageW / 2 - cardW / 2

        doc.setFillColor(200, 200, 200); doc.rect(cardX + 6, y + 6, cardW, cardH, 'F')
        doc.setFillColor(255, 255, 240); doc.setDrawColor(0, 0, 0); doc.setLineWidth(1.2)
        doc.rect(cardX, y, cardW, cardH, 'FD')
        doc.setLineWidth(0.5); doc.rect(cardX + 4, y + 4, cardW - 8, cardH - 8)
        const logoData = await urlToDataURL('/logo.jpeg')
        doc.addImage(logoData, 'JPEG', cardX + pad, y + pad, logoW, logoH)
        y += cardH + 26
      } catch {
        // If logo somehow fails, keep layout moving
        y += 120
      }

      doc.setTextColor(30, 30, 30)
      doc.setFontSize(20)
      doc.text('Your Style Challenge Portfolio', pageW / 2, y, { align: 'center' })
      y += 18
      const line = [displayName, salonName].filter(Boolean).join(' – ')
      if (line) {
        doc.setFontSize(12)
        doc.text(line, pageW / 2, y, { align: 'center' })
        y += 14
      }
      y += 8

      // steps 1–3
      const steps = [1, 2, 3]
      const thumbW = 120, thumbH = 90, gap = 24
      const rowW = steps.length * thumbW + (steps.length - 1) * gap
      let x = pageW / 2 - rowW / 2

      doc.setFontSize(11)
      for (const s of steps) {
        const url = latestByStep[s]
        if (url) {
          doc.setFillColor(210, 210, 210); doc.rect(x + 5, y + 5, thumbW, thumbH, 'F')
          doc.setFillColor(255, 255, 255); doc.setDrawColor(0, 0, 0); doc.setLineWidth(1)
          doc.rect(x, y, thumbW, thumbH, 'FD')
          const imgData = await orientedDataURL(url, thumbW, thumbH)
          doc.addImage(imgData, 'JPEG', x, y, thumbW, thumbH)
          doc.text(`Step ${s}`, x + thumbW / 2, y + thumbH + 12, { align: 'center' })
        } else {
          doc.text(`Step ${s} — no upload`, x + thumbW / 2, y + thumbH / 2, { align: 'center' })
        }
        x += thumbW + gap
      }
      y += thumbH + 42

      // finished
      doc.setFontSize(14)
      doc.text('Finished Look – Challenge Number One', pageW / 2, y, { align: 'center' })
      y += 18

      if (latestByStep[4]) {
        const bigW = 380, bigH = 270, xPos = pageW / 2 - bigW / 2
        doc.setFillColor(210, 210, 210); doc.rect(xPos + 7, y + 7, bigW, bigH, 'F')
        doc.setFillColor(255, 255, 255); doc.setDrawColor(0, 0, 0); doc.setLineWidth(1.2)
        doc.rect(xPos, y, bigW, bigH, 'FD')
        const finData = await orientedDataURL(latestByStep[4], bigW, bigH)
        doc.addImage(finData, 'JPEG', xPos, y, bigW, bigH)
      } else {
        doc.setFontSize(12)
        doc.text('No finished look uploaded yet.', pageW / 2, y + 12, { align: 'center' })
      }

      doc.save('style-challenge-portfolio.pdf')
    } finally {
      setPdfBusy(false)
    }
  }

  if (loading) {
    return (
      <main style={pageShell}>
        <p style={{ color: '#ccc' }}>Loading your portfolio…</p>
      </main>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 24,
        backgroundImage: 'url("/parchment.jpg")',
        backgroundSize: 'cover',
        backgroundRepeat: 'repeat',
        backgroundAttachment: 'fixed',
        fontFamily:
          'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        color: '#111'
      }}
    >
      <div
        ref={frameRef}
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '28px 20px',
          background: 'transparent',
          border: '6px double #2b2b2b',
          borderRadius: 14,
          boxShadow: '0 18px 50px rgba(0,0,0,0.35)'
        }}
      >
        {/* Framed Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div
            style={{
              display: 'inline-block',
              padding: 10,
              border: '2px solid #1d1d1d',
              background: '#fffdf0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
            }}
          >
            <img
              src="/logo.jpeg"
              alt="Patrick Cameron Style Challenge"
              style={{ display: 'block', width: 260, maxWidth: '80vw', height: 'auto' }}
              loading="eager"
            />
          </div>
        </div>

        <h1 style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 'clamp(22px,4.5vw,34px)' }}>
          Your Style Challenge Portfolio
        </h1>
        <p
          style={{
            textAlign: 'center',
            margin: '0 auto 16px',
            maxWidth: 700,
            lineHeight: 1.5,
            color: '#222',
            padding: '0 12px'
          }}
        >
          Brilliant work — you’ve completed the challenge. Download your portfolio below
          to keep and share in the salon. If you wish, you can submit your work to be
          reviewed by Patrick for a <strong>Long Hair Specialist</strong> certificate and
          entry to the Style Challenge Competition.
        </p>

        {/* Quick profile edit */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: 16
          }}
        >
          <input
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={profileInput}
          />
          <input
            placeholder="Second name"
            value={secondName}
            onChange={(e) => setSecondName(e.target.value)}
            style={profileInput}
          />
          <input
            placeholder="Salon name (optional)"
            value={salonName}
            onChange={(e) => setSalonName(e.target.value)}
            style={{ ...profileInput, minWidth: 260 }}
          />
        </div>
        <p style={{ textAlign: 'center', color: '#555', marginTop: -4, marginBottom: 12 }}>
          {saving ? 'Saving…' : savedAt ? 'Saved' : '\u00A0'}
        </p>

        {/* Steps 1–3 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <StepCard title="Step 1" url={latestByStep[1]} />
          <StepCard title="Step 2" url={latestByStep[2]} />
          <StepCard title="Step 3" url={latestByStep[3]} />
        </div>

        {/* Finished Look */}
        <h2 style={{ textAlign: 'center', margin: '26px 0 12px', fontSize: 'clamp(20px,4vw,28px)' }}>
          Finished Look
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ ...cardStyle, width: 'min(720px, 92%)' }}>
            {latestByStep[4] ? (
              <img src={latestByStep[4]} alt="Finished Look" style={imgStyle} loading="eager" />
            ) : (
              <p style={{ color: '#555', margin: 0, textAlign: 'center' }}>No upload</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
          <button onClick={handleDownloadPDF} style={{ ...primaryBtn, opacity: pdfBusy ? 0.85 : 1 }} disabled={pdfBusy}>
            {pdfBusy ? 'Generating…' : '📄 Download PDF'}
          </button>
          <button onClick={() => router.push('/challenge/certification')} style={secondaryBtn}>
            🎓 Become Patrick Cameron Certified
          </button>
        </div>
      </div>
    </div>
  )
}

/* styles */
const cardStyle = {
  width: 260,
  maxWidth: '92vw',
  background: 'rgba(255,255,255,0.92)',
  border: '2px solid #000',
  borderRadius: 10,
  padding: 12,
  boxShadow: '0 10px 24px rgba(0,0,0,0.35)'
}
const imgStyle = {
  display: 'block',
  width: '100%',
  height: 'auto',
  borderRadius: 8,
  border: '1px solid #cfcfcf'
}
const profileInput = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #555',
  background: '#fff',
  color: '#111',
  minWidth: 180,
  textAlign: 'center',
  boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
}
const primaryBtn = {
  background: '#28a745',
  color: '#fff',
  padding: '0.75rem 1.5rem',
  borderRadius: 8,
  border: 'none',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 6px 16px rgba(0,0,0,0.25)'
}
const secondaryBtn = {
  background: '#0b5ed7',
  color: '#fff',
  padding: '0.75rem 1.5rem',
  borderRadius: 8,
  border: 'none',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 6px 16px rgba(0,0,0,0.25)'
}
const pageShell = {
  minHeight: '100vh',
  padding: 24,
  background: '#000',
  color: '#fff',
  fontFamily:
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center'
}

/* small card */
function StepCard({ title, url }) {
  if (!url) {
    return (
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 8px', textAlign: 'center', fontSize: 16, color: '#111' }}>
          {title}
        </h3>
        <p style={{ color: '#555', margin: 0, textAlign: 'center' }}>No upload</p>
      </div>
    )
  }
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 8px', textAlign: 'center', fontSize: 16, color: '#111' }}>
        {title}
      </h3>
      <img src={url} alt={title} style={imgStyle} loading="eager" />
    </div>
  )
}