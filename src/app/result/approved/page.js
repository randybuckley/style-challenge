// src/app/result/approved/page.js
'use client'

import React, { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ApprovedResultInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [isGenerating, setIsGenerating] = useState(false)

  const handleCertificateClick = async (e) => {
    e.preventDefault()
    if (!token) {
      alert('Missing review token – cannot generate certificate.')
      return
    }
    if (isGenerating) return

    setIsGenerating(true)

    try {
      const res = await fetch('/api/certificates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      if (!res.ok) {
        let message = 'Could not generate certificate.'
        try {
          const err = await res.json()
          if (err?.error) message = err.error
        } catch {
          // ignore JSON parse error
        }
        alert(message)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = 'Patrick_Cameron_Certificate.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Certificate generation error:', err)
      alert('Something went wrong generating your certificate. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0f0f10',
        color: '#eaeaea',
        fontFamily:
          'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px',
      }}
    >
      <div
        style={{
          width: 'min(920px, 100%)',
          background: '#17181a',
          border: '1px solid #2a2b2f',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(0,0,0,.35)',
          padding: '22px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <img
            src="/logo.jpeg"
            alt="Patrick Cameron – Style Challenge"
            width="160"
          />
        </div>

        <h1
          style={{
            fontSize: 24,
            margin: '4px 0 14px',
            textAlign: 'center',
          }}
        >
          Congratulations!
        </h1>
        <p
          style={{
            margin: '0 0 16px',
            textAlign: 'center',
            color: '#cfcfcf',
          }}
        >
          Patrick has approved your Style Challenge submission. Keep building
          your long-hair artistry—this is just the start.
        </p>

        <div
          style={{
            aspectRatio: '16 / 9',
            width: '100%',
            background: '#0f0f10',
            border: '1px dashed #2a2b2f',
            borderRadius: 12,
            overflow: 'hidden',
            margin: '16px 0 18px',
          }}
        >
          {/* TODO: replace with your hosted video URL */}
          <iframe
            src="https://player.vimeo.com/video/000000000?h=placeholder&title=0&byline=0&portrait=0"
            style={{ border: 0, width: '100%', height: '100%' }}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="Patrick’s message"
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <a
            href="#"
            onClick={handleCertificateClick}
            style={{
              background: isGenerating ? '#c0c0c0' : '#eaeaea',
              color: '#111',
              textDecoration: 'none',
              padding: '10px 14px',
              borderRadius: 8,
              fontWeight: 700,
              display: 'inline-block',
              opacity: isGenerating ? 0.85 : 1,
              pointerEvents: isGenerating ? 'none' : 'auto',
            }}
          >
            {isGenerating
              ? 'Generating your certificate...'
              : 'Download your Patrick Cameron Certificate'}
          </a>
        </div>

        {process.env.NODE_ENV !== 'production' && token && (
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              color: '#8a8a8a',
              wordBreak: 'break-all',
            }}
          >
            token: {token}
          </div>
        )}
      </div>
    </main>
  )
}

export default function ApprovedResultPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: '100vh',
            background: '#0f0f10',
            color: '#eaeaea',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily:
              'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
          }}
        >
          <p>Loading approval result…</p>
        </main>
      }
    >
      <ApprovedResultInner />
    </Suspense>
  )
}