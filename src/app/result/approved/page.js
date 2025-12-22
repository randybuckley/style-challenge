// src/app/result/approved/page.js
'use client'

import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'

function ApprovedResultInner() {
  const searchParams = useSearchParams()

  const token = searchParams.get('token') || ''
  const userEmail = searchParams.get('userEmail') || ''
  const demo = searchParams.get('demo') === '1' // ✅ demo/offline

  const [busy, setBusy] = useState(false)

  async function handleCertificateClick() {
    // ✅ DEMO: download static demo certificate from /public/demo/Certificate_DEMO.pdf
    if (demo) {
      setBusy(true)
      try {
        const res = await fetch('/demo/Certificate_DEMO.pdf', { method: 'GET' })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          console.error('Demo certificate fetch failed:', res.status, text)
          alert('Could not load the demo certificate PDF.')
          return
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = 'Certificate_DEMO.pdf'
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } catch (err) {
        console.error('Demo certificate error:', err)
        alert('Could not download the demo certificate PDF.')
      } finally {
        setBusy(false)
      }
      return
    }

    // ✅ Existing behaviour unchanged (real certificate generation)
    if (!token) {
      alert('Sorry, we could not find your approval token.')
      return
    }
    if (!userEmail) {
      alert('Sorry, we are missing your email address for this certificate link.')
      return
    }

    setBusy(true)
    try {
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
        return
      }

      const meta = await metaRes.json()
      if (!meta || meta.ok === false) {
        console.error('Metadata payload error:', meta)
        alert(
          'Sorry, we could not prepare your certificate details.\n\n' +
            (meta?.error || 'Unknown metadata error')
        )
        return
      }

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

  // Non-demo Vimeo frame (fixed 16:9)
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

  // ✅ Demo wrapper (NO fixed aspect ratio, NO overflow clipping)
  const demoVideoWrap = {
    width: 'min(900px, 96vw)',
    margin: '0 auto 18px auto',
  }

  // ✅ Demo placeholder container formatting
  const placeholderFrame = {
    background: '#fff',
    borderRadius: 16,
    padding: 12,
    border: '1px solid #e6e6e6',
    boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
  }

  const placeholderInner = {
    borderRadius: 14,
    overflow: 'hidden',
    border: '1px solid #dcdcdc',
    background: '#f7f7f7',
  }

  const placeholderCaption = {
    marginTop: 10,
    fontSize: '0.9rem',
    color: '#555',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  }

  const captionPill = {
    display: 'inline-block',
    padding: '0.25rem 0.6rem',
    borderRadius: 999,
    background: '#f1f1f1',
    border: '1px solid #e1e1e1',
    fontSize: '0.8rem',
    color: '#444',
    lineHeight: 1,
    whiteSpace: 'nowrap',
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

  const tiny = {
    marginTop: 10,
    fontSize: 11,
    color: '#777',
    userSelect: 'all',
    wordBreak: 'break-all',
  }

  // ✅ From your screenshot: public/demo/images/video_placeholder_congratulations.jpeg
  const demoCongratsPlaceholderUrl =
    '/demo/images/video_placeholder_congratulations.jpeg'

  return (
    <main style={pageShell}>
      {/* Logo header */}
      <div style={headerLogoWrap}>
        <img
          src="/logo.jpeg"
          alt="Patrick Cameron — Style Challenge"
          style={logoStyle}
        />
      </div>

      {/* Video (real) OR demo placeholder (offline) */}
      {demo ? (
        <div style={demoVideoWrap}>
          <div style={placeholderFrame}>
            <div style={placeholderInner}>
              <img
                src={demoCongratsPlaceholderUrl}
                alt="Demo video placeholder - Congratulations"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>

            <div style={placeholderCaption}>
              <span style={captionPill}>Video placeholder</span>
              <span style={{ fontSize: '0.85rem', color: '#666' }}>
                Live video loads when Wi-Fi is available
              </span>
            </div>
          </div>
        </div>
      ) : (
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
      )}

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
              Click the button below and we&apos;ll prepare a printable PDF certificate
              with your name and challenge details. You can save it, print it, or share it online.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCertificateClick}
          disabled={busy}
          style={btn}
        >
          {busy ? 'Preparing your certificate…' : 'Download your certificate'}
        </button>

        {/* token + email for debugging / support */}
        <div style={tiny}>
          demo: {demo ? 'true' : 'false'}
          <br />
          token: {token || '(missing)'}
          {userEmail && (
            <>
              <br />
              email: {userEmail}
            </>
          )}
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
            fontFamily:
              'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
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