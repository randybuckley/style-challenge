'use client'

import { useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import SignedInAs from '../../../../components/SignedInAs'

export default function ProCertifyPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()

  const rawSlug = params?.slug
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug || 'starter-style'
  const adminDemo = searchParams.get('admin_demo') === 'true'
  const demo = searchParams.get('demo') === '1'

  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(null) // { type:'ok'|'warn'|'err', text:string }
  const [reviewLink, setReviewLink] = useState(null)
  const [showFallback, setShowFallback] = useState(false)

  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const toText = (val, fallback = 'Unexpected error') => {
    try {
      if (val == null) return fallback
      if (typeof val === 'string') return val
      if (val.message) return val.message
      return JSON.stringify(val)
    } catch {
      return fallback
    }
  }

  const setOk = (t) => setBanner({ type: 'ok', text: toText(t) })
  const setWarn = (t) => setBanner({ type: 'warn', text: toText(t) })
  const setErr = (t) => setBanner({ type: 'err', text: toText(t) })

  async function handleSubmit() {
    // ✅ DEMO: no Supabase, no API — go straight to PRO approved result page
    if (demo) {
      const qs = []
      if (adminDemo) qs.push('admin_demo=true')
      qs.push('demo=1')
      const suffix = qs.length ? `?${qs.join('&')}` : ''
      router.push(`/challenges/${encodeURIComponent(slug)}/result/approved${suffix}`)
      return
    }

    setBusy(true)
    setBanner(null)
    setReviewLink(null)
    setShowFallback(false)

    try {
      // 1) Get current session
      const { data: sessionData, error: sErr } = await supabase.auth.getSession()
      if (sErr) {
        setErr(sErr.message)
        return
      }

      const uid = sessionData?.session?.user?.id
      const email = sessionData?.session?.user?.email

      if (!uid || !email) {
        setErr('You must be signed in to submit.')
        return
      }

      // 1b) Resolve challenge_id from the slug (submissions.challenge_id is NOT NULL)
      const { data: challengeRow, error: cErr } = await supabase
        .from('challenges')
        .select('id')
        .eq('slug', slug)
        .single()

      if (cErr || !challengeRow?.id) {
        console.error('[challenges.select id by slug]', slug, cErr)
        setErr(`We could not identify this challenge (${slug}). Please refresh and try again.`)
        return
      }

      const challengeId = challengeRow.id

      // 2) Load latest uploads per step (1–4) for this stylist
      const { data: uploadRows, error: uErr } = await supabase
        .from('uploads')
        .select('step_number, image_url, created_at')
        .eq('user_id', uid)
        .in('step_number', [1, 2, 3, 4])
        .order('created_at', { ascending: false })

      if (uErr) {
        console.error('Error loading uploads before review submit:', uErr)
        setErr('Sorry, we could not read your portfolio images. Please try again.')
        return
      }

      const latestImages = {}
      for (const row of uploadRows || []) {
        if (!latestImages[row.step_number]) {
          latestImages[row.step_number] = row.image_url
        }
      }

      // Optional: hard gate so reviewers always get a complete set
      const required = [1, 2, 3, 4]
      const missing = required.filter((s) => !latestImages[s])
      if (missing.length) {
        setErr(
          `Missing image(s): ${missing
            .map((s) => (s === 4 ? 'Finished Look' : `Step ${s}`))
            .join(', ')}. Please upload before submitting.`
        )
        return
      }

      // 3) Call /api/review/submit
      // Include challenge_id so the API can satisfy submissions.challenge_id NOT NULL.
      const res = await fetch('/api/review/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          userId: uid,
          userEmail: email,
          images: latestImages,

          // required linkage
          slug,
          challengeId, // camelCase
          challenge_id: challengeId, // snake_case
        }),
      })

      const raw = await res.text()
      let data = {}
      try {
        data = raw ? JSON.parse(raw) : {}
      } catch {
        data = { error: raw }
      }

      const token =
        data.token ||
        new URLSearchParams((data.location || '').split('?')[1] || '').get('token')

      const link =
        data.reviewUrl ||
        (token ? `${origin}/review?token=${encodeURIComponent(token)}` : null)

      if (link) setReviewLink(link)

      if (res.ok) {
        if (data.mailer === 'sent') {
          setOk('Submission saved and email sent for review.')
        } else if (data.mailer === 'failed') {
          setWarn('Submission saved. Email could not be sent automatically — see fallback below.')
          setShowFallback(true)
        } else {
          setOk('Submission saved.')
          if (link) setShowFallback(true)
        }
      } else {
        setErr(toText(data?.error || raw))
        if (link) setShowFallback(true)
      }
    } catch (e) {
      setErr(toText(e))
    } finally {
      setBusy(false)
    }
  }

  const pill = (t) => ({
    color: t === 'ok' ? '#155724' : t === 'warn' ? '#856404' : '#721c24',
    background: t === 'ok' ? '#d4edda' : t === 'warn' ? '#fff3cd' : '#f8d7da',
    borderColor: t === 'ok' ? '#c3e6cb' : t === 'warn' ? '#ffeeba' : '#f5c6cb',
  })

  const backQs = (() => {
    const qs = []
    if (adminDemo) qs.push('admin_demo=true')
    if (demo) qs.push('demo=1')
    return qs.length ? `?${qs.join('&')}` : ''
  })()

  // ✅ Demo placeholder card formatting (match previous iterations)
  const placeholderFrame = {
    background: '#fff',
    borderRadius: 12,
    padding: 12,
    border: '1px solid #e6e6e6',
    boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
  }
  const placeholderInner = {
    borderRadius: 10,
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

  const demoVideoPlaceholderUrl = '/demo/images/video_placeholder_certify.jpeg'

  return (
    <main style={pageShell}>
      <div style={{ textAlign: 'center', marginTop: 12, marginBottom: 6 }}>
        <img
          src="/logo.jpeg"
          alt="Patrick Cameron — Style Challenge"
          style={{ width: 200, height: 'auto', borderRadius: 14, opacity: 0.9 }}
        />
      </div>

      {/* ✅ Signed-in identity strip with sign-out */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <SignedInAs />
      </div>

      <h1 style={title}>Become Certified</h1>

      <div style={frame}>
        {/* Video / Demo placeholder */}
        <div style={{ marginBottom: 16 }}>
          {demo ? (
            <div style={placeholderFrame}>
              <div style={placeholderInner}>
                <img
                  src={demoVideoPlaceholderUrl}
                  alt="Demo video placeholder - Certification"
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
          ) : (
            <div style={videoFrame}>
              <iframe
                src="https://player.vimeo.com/video/1138319894?h=ee0f85c7f7&badge=0&autopause=0&player_id=0&app_id=58479"
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
                title="Certificate"
              />
            </div>
          )}
        </div>

        <p style={leadText}>
          You’ve completed the challenge — now submit your portfolio for review.
          Approved work earns a <strong>Patrick Cameron Long Hair Specialist</strong> Certificate.
        </p>

        <div style={ctaRow}>
          <button
            onClick={() =>
              router.push(`/challenges/${encodeURIComponent(slug)}/portfolio${backQs}`)
            }
            style={{ ...btn, background: '#444' }}
          >
            ← Back to your Portfolio
          </button>

          <button
            onClick={handleSubmit}
            disabled={busy}
            style={{
              ...btn,
              background: '#28a745',
              opacity: busy ? 0.7 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
            title={demo ? 'Demo: proceeds to approved result page' : 'Submit for review'}
          >
            {busy ? 'Submitting…' : 'Have Patrick Check My Work'}
          </button>
        </div>

        {banner && (
          <div
            style={{
              marginTop: 12,
              borderRadius: 8,
              padding: '10px 12px',
              border: `1px solid ${pill(banner.type).borderColor}`,
              ...pill(banner.type),
            }}
          >
            {typeof banner.text === 'string' ? banner.text : JSON.stringify(banner.text)}
          </div>
        )}

        {showFallback && (
          <div style={fallbackWrap}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => reviewLink && navigator.clipboard.writeText(reviewLink)}
                disabled={!reviewLink}
                style={btnGhost}
              >
                Copy Review Link
              </button>
              <a
                href={`mailto:info@accesslonghair.com?subject=${encodeURIComponent(
                  'Style Challenge — Review Request'
                )}&body=${encodeURIComponent(
                  `Hi,%0D%0A%0D%0APlease review this submission:%0D%0A${
                    reviewLink || '(link pending)'
                  }%0D%0A%0D%0AAll the best,%0D%0AStyle Challenge`
                )}`}
                style={{ ...btnGhost, textDecoration: 'none' }}
              >
                Open Email to info@accesslonghair.com
              </a>
            </div>
            {reviewLink && <div style={tinyUrl}>{reviewLink}</div>}
          </div>
        )}
      </div>
    </main>
  )
}

/* styles */
const pageShell = {
  minHeight: '100vh',
  background: '#111',
  color: '#eaeaea',
  padding: '16px 12px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  fontFamily: 'system-ui,-apple-system, Segoe UI, Roboto, Helvetica,Arial,sans-serif',
}
const title = {
  margin: '6px 0 14px',
  fontWeight: 900,
  letterSpacing: 0.2,
  textAlign: 'center',
}
const frame = {
  width: 'min(900px, 96vw)',
  background: '#1a1a1a',
  borderRadius: 14,
  padding: 16,
  boxShadow: '0 10px 22px rgba(0,0,0,.35)',
  border: '1px solid #2b2b2b',
}
const videoFrame = {
  width: '100%',
  maxWidth: 900,
  margin: '0 auto 0 auto',
  borderRadius: 12,
  overflow: 'hidden',
  background: '#000',
  aspectRatio: '16 / 9',
  position: 'relative',
  border: '1px solid #2b2b2b',
}
const leadText = {
  textAlign: 'center',
  color: '#dcdcdc',
  margin: '8px auto 16px',
  maxWidth: 780,
  lineHeight: 1.35,
}
const ctaRow = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  justifyContent: 'center',
}
const btn = {
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 10px 22px rgba(0,0,0,.25)',
}
const fallbackWrap = {
  marginTop: 16,
  background: '#151515',
  padding: 12,
  borderRadius: 10,
  border: '1px solid #2a2a2a',
}
const btnGhost = {
  background: '#2b2b2b',
  color: '#fff',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: '10px 12px',
  fontWeight: 700,
  cursor: 'pointer',
}
const tinyUrl = {
  marginTop: 8,
  fontSize: 12,
  color: '#9b9b9b',
  userSelect: 'all',
  overflowWrap: 'anywhere',
}