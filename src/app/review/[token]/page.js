// src/app/review/[token]/page.js
'use client'

import { useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

const REASONS = [
  'One or more steps are missing',
  'Images unclear / blurry',
  'Lighting / background needs improvement',
  'Style does not match the exemplar',
  'Retake finished look',
  'Other'
]

export default function ReviewRejectPage() {
  const { token } = useParams()
  const qp = useSearchParams()
  const userEmail = qp.get('userEmail') || '' // fallback from shim

  const [reason, setReason] = useState(REASONS[0])
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState({ kind: 'idle', msg: '' })

  const submit = async (e) => {
    e.preventDefault()
    setStatus({ kind: 'busy', msg: 'Sending feedback…' })
    try {
      const res = await fetch('/api/review/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, reason, notes, userEmail })
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to send feedback')
      setStatus({ kind: 'ok', msg: `Feedback sent to ${data.sentTo}` })
    } catch (err) {
      setStatus({ kind: 'err', msg: err.message || String(err) })
    }
  }

  return (
    <div style={{minHeight:'100vh',background:'#0f0f10',color:'#eaeaea',display:'flex',justifyContent:'center',alignItems:'flex-start',padding:'40px 16px'}}>
      <div style={{width:'100%',maxWidth:720,background:'#17181a',border:'1px solid #2a2b2f',borderRadius:16,boxShadow:'0 8px 24px rgba(0,0,0,.35)',padding:22}}>
        <h1 style={{fontSize:22,margin:'0 0 12px'}}>Send feedback to the stylist</h1>
        <form onSubmit={submit} style={{opacity: status.kind === 'busy' ? .7 : 1}}>
          <label htmlFor="reason" style={{display:'block',margin:'12px 0 6px',fontWeight:600}}>Reason</label>
          <select id="reason" value={reason} onChange={(e)=>setReason(e.target.value)}
                  style={{width:'100%',borderRadius:10,border:'1px solid #2a2b2f',background:'#0f0f10',color:'#eaeaea',padding:'10px 12px'}}>
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <label htmlFor="notes" style={{display:'block',margin:'12px 0 6px',fontWeight:600}}>Additional feedback (optional)</label>
          <textarea id="notes"
            placeholder="Be specific and kind—what should they change or redo?"
            value={notes} onChange={(e)=>setNotes(e.target.value)}
            style={{width:'100%',minHeight:120,resize:'vertical',borderRadius:10,border:'1px solid #2a2b2f',background:'#0f0f10',color:'#eaeaea',padding:'10px 12px'}}
          />

          <div style={{display:'flex',gap:10,marginTop:14}}>
            <button type="submit" style={{cursor:'pointer',fontWeight:700,background:'#c82333',borderColor:'#c82333',color:'#fff',border:'1px solid #c82333',padding:'10px 12px',borderRadius:10}}>
              Send Feedback
            </button>
          </div>
        </form>

        {status.kind === 'ok'   && <div style={{marginTop:12,padding:'10px 12px',borderRadius:10,background:'#153d19',border:'1px solid #2f6b36'}}>{status.msg}</div>}
        {status.kind === 'err'  && <div style={{marginTop:12,padding:'10px 12px',borderRadius:10,background:'#3d1515',border:'1px solid #6b2f2f'}}>{status.msg}</div>}
        {status.kind === 'busy' && <div style={{marginTop:12,padding:'10px 12px',borderRadius:10,border:'1px solid #2a2b2f'}}>Sending…</div>}
      </div>
    </div>
  )
}