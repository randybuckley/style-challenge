'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ReviewInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const preselectAction = searchParams.get('action') || '' // 'approve'|'reject' optional

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sub, setSub] = useState(null)

  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('quality')
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!token) {
        setError('Missing token.')
        setLoading(false)
        return
      }
      try {
        const res = await fetch(`/api/review-certification?token=${encodeURIComponent(token)}&details=1`, {
          cache: 'no-store'
        })
        const data = await res.json()
        if (!res.ok || !data?.ok) {
          setError(data?.error || 'Could not load submission.')
        } else {
          setSub(data.submission)
          if (preselectAction === 'reject') setRejectOpen(true)
        }
      } catch (e) {
        setError('Network error. Please refresh.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [token, preselectAction])

  const openPortfolioWindow = () => {
    if (!sub) return
    const w = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=800')
    if (!w) return
    const steps = [
      { n: 1, url: sub.step1_url },
      { n: 2, url: sub.step2_url },
      { n: 3, url: sub.step3_url }
    ]
    const html = `
<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Portfolio Preview</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:#f7f7f7;color:#111}
  .wrap{max-width:1000px;margin:0 auto;padding:16px}
  .card{background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.1);padding:16px;margin-bottom:16px}
  .row{display:flex;gap:12px;flex-wrap:wrap}
  .col{flex:1 1 300px}
  img{display:block;width:100%;height:auto;border-radius:8px;border:1px solid #ccc;background:#fff}
  h1{margin:6px 0 12px;font-size:22px}
  h2{margin:8px 0 8px;font-size:18px}
</style>
<div class="wrap">
  <div class="card">
    <h1>Portfolio – ${[sub.first_name, sub.second_name].filter(Boolean).join(' ') || ''}${sub.salon_name ? ` — ${sub.salon_name}` : ''}</h1>
    <p style="margin:0 0 6px">${sub.email || ''}</p>
  </div>
  <div class="card">
    <h2>Steps 1–3</h2>
    <div class="row">
      ${steps.map(s => `
        <div class="col">
          <div style="font-weight:600;margin:0 0 6px">Step ${s.n}</div>
          ${s.url ? `<img src="${s.url}" alt="Step ${s.n}" />` : `<div style="color:#777">No upload</div>`}
        </div>
      `).join('')}
    </div>
  </div>
  <div class="card">
    <h2>Finished Look</h2>
    ${sub.finished_url ? `<img src="${sub.finished_url}" alt="Finished Look" />` : `<div style="color:#777">No finished look uploaded</div>`}
  </div>
</div>
`
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  const doApprove = async () => {
    if (!token || submitting) return
    setSubmitting(true); setError(''); setDoneMsg('')
    try {
      const res = await fetch('/api/review-certification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision: 'approve' })
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Approve failed')
      } else {
        setDoneMsg('Approved ✔ – candidate notified.')
      }
    } catch (e) {
      setError('Network error.')
    } finally {
      setSubmitting(false)
    }
  }

  const doReject = async () => {
    if (!token || submitting) return
    setSubmitting(true); setError(''); setDoneMsg('')
    try {
      const res = await fetch('/api/review-certification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision: 'reject', reason, comments })
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Reject failed')
      } else {
        setDoneMsg('Decision sent – candidate notified to try again.')
      }
    } catch (e) {
      setError('Network error.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main style={shell}>
        <p style={{ color: '#ccc' }}>Loading…</p>
      </main>
    )
  }
  if (error) {
    return (
      <main style={shell}>
        <p style={{ color: '#ff6b6b' }}>{error}</p>
      </main>
    )
  }
  if (!sub) {
    return (
      <main style={shell}>
        <p style={{ color: '#ccc' }}>No submission.</p>
      </main>
    )
  }

  return (
    <main style={page}>
      <h1 style={{ margin: '0 0 6px' }}>Review Submission</h1>
      <p style={{ margin: 0, color: '#bbb' }}>
        {[sub.first_name, sub.second_name].filter(Boolean).join(' ') || 'Unknown'}
        {sub.salon_name ? ` — ${sub.salon_name}` : ''}<br />
        {sub.email || ''}
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <button onClick={openPortfolioWindow} style={btnPrimary}>View Portfolio</button>
        <button onClick={doApprove} disabled={submitting} style={{ ...btn, background: '#28a745' }}>
          {submitting ? 'Working…' : 'Approve'}
        </button>
        <button onClick={() => setRejectOpen(v => !v)} disabled={submitting} style={{ ...btn, background: '#6c757d' }}>
          {rejectOpen ? 'Hide Reject' : 'Reject'}
        </button>
      </div>

      {rejectOpen && (
        <div style={panel}>
          <div style={{ marginBottom: 8 }}>
            <label>
              Reason:&nbsp;
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="quality">Check the quality of your photos and resubmit</option>
                <option value="step1">Step 1 needs work — try again and resubmit</option>
                <option value="step2">Step 2 needs work — try again and resubmit</option>
                <option value="step3">Step 3 needs work — try again and resubmit</option>
                <option value="finished">Finished Look needs work — try again and resubmit</option>
              </select>
            </label>
          </div>
          <textarea
            placeholder="Optional comments for the candidate…"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={4}
            style={ta}
          />
          <div>
            <button onClick={doReject} disabled={submitting} style={{ ...btn, background: '#dc3545' }}>
              {submitting ? 'Sending…' : 'Send Rejection'}
            </button>
          </div>
        </div>
      )}

      {doneMsg && <p style={{ marginTop: 12, color: '#28a745' }}>{doneMsg}</p>}

      <section style={{ marginTop: 18 }}>
        <h3 style={{ margin: '0 0 8px' }}>Quick Preview</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[{n:1,u:sub.step1_url},{n:2,u:sub.step2_url},{n:3,u:sub.step3_url}].map(s => (
            <div key={s.n} style={{ width: 220, flex: '1 1 220px' }}>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>Step {s.n}</div>
              {s.u ? <img src={s.u} alt={`Step ${s.n}`} style={img} /> : <div style={{ color: '#777' }}>No upload</div>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>Finished Look</div>
          {sub.finished_url ? <img src={sub.finished_url} alt="Finished" style={{ ...img, maxWidth: 860 }} /> : <div style={{ color: '#777' }}>No finished look uploaded</div>}
        </div>
      </section>
    </main>
  )
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<main style={shell}><p style={{ color: '#ccc' }}>Loading…</p></main>}>
      <ReviewInner />
    </Suspense>
  )
}

/* styles */
const page = {
  maxWidth: 980,
  margin: '0 auto',
  padding: '18px',
  fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
  color: '#fff',
  background: '#111',
  border: '1px solid #333',
  borderRadius: 12
}
const shell = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#000',
  color: '#fff',
  fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
  padding: 24,
  textAlign: 'center'
}
const btn = {
  color: '#fff',
  padding: '10px 14px',
  borderRadius: 8,
  border: 'none',
  fontWeight: 700,
  cursor: 'pointer'
}
const btnPrimary = { ...btn, background: '#0b5ed7' }
const panel = {
  marginTop: 12,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid #333',
  borderRadius: 10,
  padding: 12
}
const ta = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 8,
  border: '1px solid #555',
  background: '#222',
  color: '#fff',
  padding: 10,
  marginBottom: 10
}
const img = {
  display: 'block',
  width: '100%',
  height: 'auto',
  borderRadius: 8,
  border: '1px solid #444',
  background: '#000'
}
