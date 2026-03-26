'use client'

import { useEffect, useState } from 'react'

function isInAppBrowser() {
  const ua = navigator.userAgent || ''
  return (
    ua.includes('FBAN') ||
    ua.includes('FBAV') ||
    ua.includes('Instagram') ||
    ua.includes('LinkedInApp') ||
    ua.includes('YahooMail') ||
    ua.includes('Outlook')
  )
}

export default function InAppBrowserWarning() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (isInAppBrowser()) {
      setShow(true)
    }
  }, [])

  if (!show) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <p style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
        Please open this in your browser
      </p>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        This app needs camera access, which isn't available inside email or social media apps.
      </p>
      <p style={{ fontSize: '0.875rem', color: '#999' }}>
        Tap the <strong>⋯</strong> or <strong>Share</strong> button and choose <strong>"Open in Browser"</strong>
      </p>
    </div>
  )
}