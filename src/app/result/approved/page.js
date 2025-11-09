// src/app/result/approved/page.js
'use client'

import { useSearchParams } from 'next/navigation'

export default function ApprovedResultPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const handleCertificateClick = (e) => {
    e.preventDefault()
    alert('Certificate download is coming soon.')
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#0f0f10',
      color: '#eaeaea',
      fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '28px'
    }}>
      <div style={{
        width: 'min(920px, 100%)',
        background: '#17181a',
        border: '1px solid #2a2b2f',
        borderRadius: '16px',
        boxShadow: '0 8px 24px rgba(0,0,0,.35)',
        padding: '22px'
      }}>
        <div style={{textAlign:'center', marginBottom: 12}}>
          <img src="/logo.jpeg" alt="Patrick Cameron – Style Challenge" width="160" />
        </div>

        <h1 style={{fontSize: 24, margin: '4px 0 14px', textAlign:'center'}}>Congratulations!</h1>
        <p style={{margin:'0 0 16px', textAlign:'center', color:'#cfcfcf'}}>
          Patrick has approved your Style Challenge submission. Keep building your long-hair artistry—this is just the start.
        </p>

        <div style={{
          aspectRatio: '16 / 9',
          width: '100%',
          background: '#0f0f10',
          border: '1px dashed #2a2b2f',
          borderRadius: 12,
          overflow: 'hidden',
          margin: '16px 0 18px'
        }}>
          {/* TODO: replace with your hosted video URL */}
          <iframe
            src="https://player.vimeo.com/video/000000000?h=placeholder&title=0&byline=0&portrait=0"
            style={{border:0,width:'100%',height:'100%'}}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="Patrick’s message"
          />
        </div>

        <div style={{display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center'}}>
          <a
            href="#"
            onClick={handleCertificateClick}
            style={{
              background:'#eaeaea',
              color:'#111',
              textDecoration:'none',
              padding:'10px 14px',
              borderRadius:8,
              fontWeight:700,
              display:'inline-block'
            }}
          >
            Download your Patrick Cameron Certificate
          </a>

          <a
            href="/"
            style={{
              background:'#2a2b2f',
              color:'#eaeaea',
              textDecoration:'none',
              padding:'10px 14px',
              borderRadius:8,
              fontWeight:700,
              display:'inline-block'
            }}
          >
            Back to the Style Challenge
          </a>
        </div>

        {process.env.NODE_ENV !== 'production' && token && (
          <div style={{marginTop:14,fontSize:12,color:'#8a8a8a'}}>token: {token}</div>
        )}
      </div>
    </main>
  )
}