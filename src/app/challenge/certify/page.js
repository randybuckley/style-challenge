'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

export default function CertifyPage() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(null) // { type:'ok'|'warn'|'err', text:string }
  const [reviewLink, setReviewLink] = useState(null)
  const [showFallback, setShowFallback] = useState(false)

  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')

  const toText = (val, fallback = 'Unexpected error') => {
    try {
      if (val == null) return fallback
      if (typeof val === 'string') return val
      if (val.message) return val.message
      return JSON.stringify(val)
    } catch { return fallback }
  }
  const setOk   = (t) => setBanner({ type:'ok',   text: toText(t) })
  const setWarn = (t) => setBanner({ type:'warn', text: toText(t) })
  const setErr  = (t) => setBanner({ type:'err',  text: toText(t) })

  async function handleSubmit() {
    setBusy(true); setBanner(null); setReviewLink(null); setShowFallback(false)
    try {
      const { data: sessionData, error: sErr } = await supabase.auth.getSession()
      if (sErr) { setErr(sErr.message); return }
      const uid = sessionData?.session?.user?.id
      if (!uid) { setErr('You must be signed in to submit.'); return }

      const res = await fetch('/api/review-certification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ userId: uid, notifyEmail: 'info@accesslonghair.com' })
      })

      const raw = await res.text()
      let data = {}
      try { data = raw ? JSON.parse(raw) : {} } catch { data = { error: raw } }

      const token =
        data.token ||
        new URLSearchParams((data.location || '').split('?')[1] || '').get('token')
      const link = data.reviewUrl || (token ? `${origin}/review?token=${encodeURIComponent(token)}` : null)
      if (link) setReviewLink(link)

      if (res.ok) {
        if (data.mailer === 'sent') {
          setOk('Submission saved and email sent to Patrick.')
        } else if (data.mailer === 'failed') {
          setWarn('Submission saved. Email could not be sent automatically — see fallback below.')
          setShowFallback(true)
        } else {
          setOk('Submission saved. (Mailer skipped.)')
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
    color: t==='ok'?'#155724':t==='warn'?'#856404':'#721c24',
    background: t==='ok'?'#d4edda':t==='warn'?'#fff3cd':'#f8d7da',
    borderColor: t==='ok'?'#c3e6cb':t==='warn'?'#ffeeba':'#f5c6cb'
  })

  return (
    <main style={pageShell}>
      <div style={{ textAlign:'center', marginTop: 12, marginBottom: 6 }}>
        <img src="/logo.jpeg" alt="Patrick Cameron — Style Challenge"
             style={{ width:200, height:'auto', borderRadius:14, opacity:.9 }}/>
      </div>

      <h1 style={title}>Become Certified</h1>

      <div style={frame}>
        <div style={videoBox}><div style={videoGhost}>Video: Patrick explains certification</div></div>

        <p style={leadText}>
          You’ve completed the challenge — now submit your portfolio for review by Patrick Cameron.
          Approved work earns a <strong>Patrick Cameron Long Hair Specialist</strong> Certificate.
        </p>

        <div style={ctaRow}>
          <button onClick={()=>router.push('/challenge/portfolio')} style={{ ...btn, background:'#444' }}>
            ← Back to your Portfolio
          </button>
          <button onClick={handleSubmit} disabled={busy} style={{ ...btn, background:'#28a745', opacity: busy ? .7 : 1 }}>
            {busy ? 'Submitting…' : 'Have Patrick Check My Work'}
          </button>
        </div>

        {banner && (
          <div style={{ marginTop:12, borderRadius:8, padding:'10px 12px', border:`1px solid ${pill(banner.type).borderColor}`, ...pill(banner.type) }}>
            {typeof banner.text === 'string' ? banner.text : JSON.stringify(banner.text)}
          </div>
        )}

        {showFallback && (
          <div style={fallbackWrap}>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button
                onClick={()=> reviewLink && navigator.clipboard.writeText(reviewLink)}
                disabled={!reviewLink}
                style={btnGhost}
              >
                Copy Review Link
              </button>
              <a
                href={`mailto:info@accesslonghair.com?subject=${encodeURIComponent('Style Challenge — Review Request')}&body=${encodeURIComponent(
                  `Hi Patrick,%0D%0A%0D%0APlease review this submission:%0D%0A${reviewLink || '(link pending)'}%0D%0A%0D%0AAll the best,%0D%0AStyle Challenge`
                )}`}
                style={{ ...btnGhost, textDecoration:'none' }}
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
const pageShell = { minHeight:'100vh', background:'#111', color:'#eaeaea', padding:'16px 12px', display:'flex', flexDirection:'column', alignItems:'center', fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif' }
const title = { margin:'6px 0 14px', fontWeight:900, letterSpacing:.2, textAlign:'center' }
const frame = { width:'min(900px, 96vw)', background:'#1a1a1a', borderRadius:14, padding:16, boxShadow:'0 10px 22px rgba(0,0,0,.35)', border:'1px solid #2b2b2b' }
const videoBox = { border:'1px dashed #333', borderRadius:12, background:'#000', height:300, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16 }
const videoGhost = { color:'#9a9a9a', fontSize:14 }
const leadText = { textAlign:'center', color:'#dcdcdc', margin:'8px auto 16px', maxWidth:780, lineHeight:1.35 }
const ctaRow = { display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center' }
const btn = { color:'#fff', border:'none', borderRadius:10, padding:'12px 16px', fontWeight:700, cursor:'pointer', boxShadow:'0 10px 22px rgba(0,0,0,.25)' }
const fallbackWrap = { marginTop:16, background:'#151515', padding:12, borderRadius:10, border:'1px solid #2a2a2a' }
const btnGhost = { background:'#2b2b2b', color:'#fff', border:'1px solid #3a3a3a', borderRadius:8, padding:'10px 12px', fontWeight:700, cursor:'pointer' }
const tinyUrl = { marginTop:8, fontSize:12, color:'#9b9b9b', userSelect:'all', overflowWrap:'anywhere' }