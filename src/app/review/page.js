'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ReviewInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [reason, setReason] = useState('photo_quality_step1')
  const [comments, setComments] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!token) setMsg('Missing review token.')
  }, [token])

  const onSend = async () => {
    if (!token) return
    setSending(true)
    setMsg('')
    try {
      const res = await fetch('/api/review-certification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision: 'reject', reason, comments })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Send failed')
      }
      setMsg('Rejection sent. The stylist has been emailed.')
    } catch (e) {
      setMsg(e.message || 'Error sending rejection.')
    } finally {
      setSending(false)
    }
  }

  return (
    <main style={page}>
      <h1 style={{ margin: '0 0 12px' }}>Review — Send Rejection</h1>
      {!token ? (
        <p style={{ color: '#ff6b6b' }}>{msg || 'Missing token'}</p>
      ) : (
        <>
          <label style={label}>Reason for rejection</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={input}>
            {/* Photo quality reasons */}
            <option value="photo_quality_step1">Photo quality — Step 1</option>
            <option value="photo_quality_step2">Photo quality — Step 2</option>
            <option value="photo_quality_step3">Photo quality — Step 3</option>
            <option value="photo_quality_finished_look">Photo quality — Finished Look</option>
            {/* Needs work reasons */}
            <option value="needs_work_step1">Needs work — Step 1</option>
            <option value="needs_work_step2">Needs work — Step 2</option>
            <option value="needs_work_step3">Needs work — Step 3</option>
            <option value="needs_work_finished_look">Needs work — Finished Look</option>
            {/* Freeform */}
            <option value="other">Other</option>
          </select>

          <label style={label}>Comments (optional but encouraged)</label>
          <textarea
            rows={5}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            style={{ ...input, height: 120, resize: 'vertical' }}
            placeholder="Share supportive, specific guidance the stylist can act on."
          />

          <button onClick={onSend} disabled={sending} style={primaryBtn}>
            {sending ? 'Sending…' : 'Send Rejection'}
          </button>

          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </>
      )}
    </main>
  )
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<main style={page}>Loading…</main>}>
      <ReviewInner />
    </Suspense>
  )
}

const page = {
  maxWidth: 760,
  margin: '0 auto',
  padding: '24px',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  background: '#111',
  color: '#fff',
  border: '2px solid #333',
  borderRadius: 12,
  fontSize: '18px',
  lineHeight: 1.55
}
const label = { display: 'block', marginTop: 12, marginBottom: 6, color: '#ddd', fontWeight: 600 }
const input = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #555',
  background: '#1a1a1a',
  color: '#fff'
}
const primaryBtn = {
  marginTop: 14,
  background: '#dc3545',
  color: '#fff',
  padding: '12px 16px',
  border: 'none',
  borderRadius: 10,
  fontWeight: 800,
  cursor: 'pointer'
}