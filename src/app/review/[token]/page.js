'use client'

import { useEffect, useState } from 'react'

const reasons = [
  'Lighting / Focus',
  'Angle / Framing',
  'Doesn’t match reference',
  'Finish / Polish',
  'Upload quality',
  'Other'
]

export default function ReviewPage({ params }) {
  const token = params.token
  const [loading, setLoading] = useState(true)
  const [sub, setSub] = useState(null)
  const [action, setAction] = useState('approve')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [reviewerEmail, setReviewerEmail] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const run = async () => {
      const res = await fetch(`/api/review-certification?token=${encodeURIComponent(token)}`)
      if (res.ok) setSub((await res.json()).submission)
      setLoading(false)
    }
    run()
  }, [token])

  const submitDecision = async () => {
    setMsg('')
    const res = await fetch('/api/review-certification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action, reason, notes, reviewerEmail })
    })
    if (res.ok) setMsg('Decision saved and email sent.')
    else setMsg('Error saving decision.')
  }

  if (loading) return <main style={shell}><p>Loading…</p></main>
  if (!sub) return <main style={shell}><p>Submission not found.</p></main>

  return (
    <main style={page}>
      <h1>Review Submission</h1>
      <p><strong>User:</strong> {sub.email}</p>
      <p><strong>Name:</strong> {[sub.first_name, sub.second_name].filter(Boolean).join(' ') || '—'}</p>
      <p><strong>Salon:</strong> {sub.salon_name || '—'}</p>
      <div style={grid}>
        {sub.step1_url && <img src={sub.step1_url} alt="Step 1" style={img} />}
        {sub.step2_url && <img src={sub.step2_url} alt="Step 2" style={img} />}
        {sub.step3_url && <img src={sub.step3_url} alt="Step 3" style={img} />}
        {sub.finished_url && <img src={sub.finished_url} alt="Finished" style={{ ...img, gridColumn: 'span 2' }} />}
      </div>

      <div style={{ marginTop: 16 }}>
        <label>
          Reviewer email:{' '}
          <input value={reviewerEmail} onChange={(e) => setReviewerEmail(e.target.value)} style={input} />
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>
          Decision:{' '}
          <select value={action} onChange={(e) => setAction(e.target.value)} style={input}>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
          </select>
        </label>
      </div>

      {action === 'reject' && (
        <div style={{ marginTop: 12 }}>
          <label>
            Reason:{' '}
            <select value={reason} onChange={(e) => setReason(e.target.value)} style={input}>
              <option value="">Select…</option>
              {reasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <label>
          Notes:{' '}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} style={{ ...input, width: '100%' }} />
        </label>
      </div>

      <button onClick={submitDecision} style={primaryBtn} disabled={action==='reject' && !reason}>
        {action === 'approve' ? 'Approve & Email User' : 'Reject & Email User'}
      </button>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
    </main>
  )
}

const page = { maxWidth: 920, margin: '0 auto', padding: 20, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' }
const shell = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 10 }
const img = { width: '100%', height: 'auto', border: '1px solid #ccc', borderRadius: 8 }
const input = { padding: '6px 8px', borderRadius: 6, border: '1px solid #bbb' }
const primaryBtn = { marginTop: 14, background: '#28a745', color: '#fff', padding: '10px 16px', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }