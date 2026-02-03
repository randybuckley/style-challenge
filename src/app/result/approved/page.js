// src/app/result/approved/page.js
'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, Suspense } from 'react'

function ApprovedResultInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const token = searchParams.get('token') || ''
  const userEmail = searchParams.get('userEmail') || ''

  const [busy, setBusy] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const [emailBusy, setEmailBusy] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState('')

  // Cache certificate metadata so download/email can share it without refetching
  const [metaCache, setMetaCache] = useState(null)

  async function fetchCertificateMeta() {
    if (!token) {
      alert('Sorry, we could not find your approval token.')
      return null
    }
    if (!userEmail) {
      alert('Sorry, we are missing your email address for this certificate link.')
      return null
    }

    const metaRes = await fetch('/api/review-certification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ token, userEmail }),
    })

    if (!metaRes.ok) {
      const text = await metaRes.text().catch(() => '')
      console.error('Metadata error:', metaRes.status, text)
      alert(
        'Sorry, we could not prepare your certificate details.\n\n' +
          (text || `Status: ${metaRes.status}`)
      )
      return null
    }

    const meta = await metaRes.json()
    if (!meta || meta.ok === false) {
      console.error('Metadata payload error:', meta)
      alert(
        'Sorry, we could not prepare your certificate details.\n\n' +
          (meta?.error || 'Unknown metadata error')
      )
      return null
    }

    // Ensure email is present for downstream routes (email route requires it)
    const metaWithEmail = {
      ...meta,
      email: meta.email || userEmail,
    }

    setMetaCache(metaWithEmail)
    return metaWithEmail
  }

  async function handleCertificateClick() {
    setBusy(true)
    setDownloaded(false)

    try {
      // 1) Fetch certificate metadata from our API (or cache)
      const meta = metaCache || (await fetchCertificateMeta())
      if (!meta) return

      // 2) Ask the server to generate the PDF (keep existing route unchanged)
      const pdfRes = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/pdf',
        },
        body: JSON.stringify(meta),
      })

      if (!pdfRes.ok) {
        const text = await pdfRes.text().catch(() => '')
        console.error('PDF generation error:', pdfRes.status, text)
        alert(
          'Sorry, there was a problem generating your certificate PDF.\n\n' +
            (text || `Status: ${pdfRes.status}`)
        )
        return
      }

      const blob = await pdfRes.blob()
      const url = URL.createObjectURL(blob)

      const stylistSlug = (meta.stylistName || 'Stylist')
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9_]/g, '')

      const styleSlug = (meta.styleName || 'Challenge')
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9_]/g, '')

      const filename = `Certificate_${stylistSlug}_${styleSlug}.pdf`

      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      setDownloaded(true)
    } catch (err) {
      console.error('Unexpected error while preparing certificate:', err)
      alert(
        'Sorry, something went wrong while preparing your certificate.\n\n' +
          (err?.message || String(err))
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleEmailCertificateClick() {
    setEmailBusy(true)
    setEmailSent(false)
    setEmailError('')

    try {
      // Reuse cached meta if available
      const meta = metaCache || (await fetchCertificateMeta())
      if (!meta) return

      const res = await fetch('/api/certificates/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          stylistName: meta.stylistName,
          salonName: meta.salonName,
          styleName: meta.styleName,
          date: meta.date,
          certificateId: meta.certificateId,
          email: meta.email || userEmail,
          watermark: meta.watermark || 'PC',
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.error('Email certificate error:', res.status, text)
        setEmailError(text || `Status: ${res.status}`)
        return
      }

      const payload = await res.json().catch(() => ({}))
      if (payload?.ok === false) {
        setEmailError(payload?.error || 'Unknown error sending email.')
        return
      }

      setEmailSent(true)
    } catch (err) {
      console.error('Unexpected error while emailing certificate:', err)
      setEmailError(err?.message || String(err))
    } finally {
      setEmailBusy(false)
    }
  }

  function goToCollections() {
    router.push('/challenges/menu')
  }

  function goToEssentials() {
    router.push('/challenges/essentials')
  }

  // ---- styles ----
  const pageShell = {
    minHeight: '100vh',
    background: '#111',
    color: '#eaeaea',
    padding: '16px 12px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
  }

  const headerLogoWrap = {
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
  }

  const logoStyle = {
    width: 200,
    height: 'auto',
  }

  const videoFrame = {
    width: 'min(900px, 96vw)',
    margin: '0 auto 18px auto',
    borderRadius: 16,
    overflow: 'hidden',
    background: '#000',
    aspectRatio: '16 / 9',
    position: 'relative',
    border: '1px solid #2b2b2b',
  }

  const card = {
    width: 'min(900px, 96vw)',
    background: '#1a1a1a',
    borderRadius: 14,
    padding: 20,
    boxShadow: '0 10px 22px rgba(0,0,0,.35)',
    border: '1px solid #2b2b2b',
    textAlign: 'center',
  }

  const btn = {
    marginTop: 16,
    background: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '12px 18px',
    fontWeight: 700,
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.7 : 1,
    boxShadow: '0 10px 22px rgba(0,0,0,.25)',
    minWidth: 220,
  }

  const btnSecondary = {
    marginTop: 10,
    background: '#101010',
    color: '#eaeaea',
    border: '1px solid #2b2b2b',
    borderRadius: 10,
    padding: '12px 18px',
    fontWeight: 800,
    cursor: emailBusy ? 'default' : 'pointer',
    opacity: emailBusy ? 0.7 : 1,
    boxShadow: '0 10px 22px rgba(0,0,0,.18)',
    minWidth: 220,
  }

  const smallHelper = {
    marginTop: 8,
    fontSize: 12,
    color: '#bdbdbd',
  }

  const navRow = {
    marginTop: 12,
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
    flexWrap: 'wrap',
  }

  const navBtnBase = {
    border: '1px solid #2b2b2b',
    background: '#101010',
    color: '#eaeaea',
    borderRadius: 10,
    padding: '11px 14px',
    fontWeight: 800,
    cursor: 'pointer',
    minWidth: 220,
    boxShadow: '0 10px 22px rgba(0,0,0,.18)',
  }

  const navBtnPrimary = {
    ...navBtnBase,
    background: 'rgba(255,255,255,0.06)',
  }

  const infoStrip = {
    margin: '14px auto 4px',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #333',
    background: '#101010',
    textAlign: 'left',
    maxWidth: 520,
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    fontSize: 13,
    color: '#dcdcdc',
  }

  const bulletIcon = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: '1px solid #28a745',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    color: '#28a745',
    flexShrink: 0,
    marginTop: 2,
  }

  const downloadedNote = {
    marginTop: 10,
    fontSize: 13,
    color: '#9fe6b0',
  }

  const emailOkNote = {
    marginTop: 10,
    fontSize: 13,
    color: '#9fd6ff',
  }

  const emailErrNote = {
    marginTop: 10,
    fontSize: 13,
    color: '#ffb3b3',
    whiteSpace: 'pre-wrap',
  }

  return (
    <main style={pageShell}>
      {/* Logo header */}
      <div style={headerLogoWrap}>
        <img src="/logo.jpeg" alt="Patrick Cameron — Style Challenge" style={logoStyle} />
      </div>

      {/* Vimeo: Patrick's congratulations */}
      <div style={videoFrame}>
        <iframe
          src="https://player.vimeo.com/video/1138761655?badge=0&autopause=0&player_id=0&app_id=58479"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          title="Congratulations from Patrick"
        />
      </div>

      {/* Certificate card */}
      <div style={card}>
        <h1 style={{ margin: '4px 0 10px' }}>Congratulations!</h1>
        <p style={{ margin: '0 0 10px', color: '#dcdcdc', lineHeight: 1.4 }}>
          Patrick has approved your Style Challenge submission.
          <br />
          Keep building your long-hair artistry — this is just the start.
        </p>

        <div style={infoStrip}>
          <div style={bulletIcon}>✓</div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Your certificate is ready to download.
            </div>
            <div>
              Click the button below and we&apos;ll prepare a printable PDF certificate with your
              name and challenge details. You can save it, print it, or share it online.
            </div>
          </div>
        </div>

        <button type="button" onClick={handleCertificateClick} disabled={busy || emailBusy} style={btn}>
          {busy ? 'Preparing your certificate…' : 'Download your certificate'}
        </button>

        <div style={smallHelper}>Not downloaded? We can email it to you as a PDF attachment.</div>

        <button
          type="button"
          onClick={handleEmailCertificateClick}
          disabled={busy || emailBusy}
          style={btnSecondary}
        >
          {emailBusy ? 'Emailing your certificate…' : 'Email my certificate'}
        </button>

        {emailSent ? (
          <div style={emailOkNote}>
            Sent. Check your inbox for your certificate PDF.
          </div>
        ) : null}

        {emailError ? (
          <div style={emailErrNote}>
            Sorry — we couldn’t email your certificate.
            {'\n'}
            {emailError}
          </div>
        ) : null}

        {downloaded ? (
          <div style={downloadedNote}>
            Downloaded. You can return to Collections or continue with Essentials.
          </div>
        ) : null}

        <div style={navRow}>
          <button type="button" onClick={goToCollections} style={navBtnPrimary}>
            Back to Collections
          </button>
          <button type="button" onClick={goToEssentials} style={navBtnBase}>
            Go to Essentials
          </button>
        </div>
      </div>
    </main>
  )
}

// Suspense wrapper so useSearchParams is allowed
export default function ApprovedResultPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: '100vh',
            background: '#111',
            color: '#ccc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
          }}
        >
          Loading…
        </main>
      }
    >
      <ApprovedResultInner />
    </Suspense>
  )
}