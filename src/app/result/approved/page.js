'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

export default function ApprovedResultPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') || '' // currently only for dev/debug

  const [user, setUser] = useState(null)
  const [firstName, setFirstName] = useState('')
  const [secondName, setSecondName] = useState('')
  const [salonName, setSalonName] = useState('')
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  // Load session + profile
  useEffect(() => {
    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const u = sessionData?.session?.user

      if (!u) {
        // if they somehow hit this page logged-out, send them home
        router.push('/')
        return
      }

      setUser(u)

      const { data: profile, error: profError } = await supabase
        .from('profiles')
        .select('first_name, second_name, salon_name')
        .eq('id', u.id)
        .single()

      if (profError) {
        console.warn('Profile fetch error:', profError.message)
      }

      if (profile) {
        setFirstName(profile.first_name || '')
        setSecondName(profile.second_name || '')
        setSalonName(profile.salon_name || '')
      }

      setLoadingProfile(false)
    }

    run()
  }, [router])

  const ensureIdentityComplete = () => {
    const fn = (firstName || '').trim()
    const sn = (secondName || '').trim()
    const sa = (salonName || '').trim()

    if (!fn || !sn || !sa) {
      const msg =
        'Please add your first name, last name, and salon name on your portfolio page before downloading your certificate.'
      setError(msg)
      alert(msg)
      // Nudge them to the portfolio page where they can update details
      router.push('/challenge/portfolio')
      return false
    }

    setError('')
    return true
  }

  const handleCertificateClick = async (e) => {
    e.preventDefault()
    if (downloading) return
    if (!ensureIdentityComplete()) return

    try {
      setDownloading(true)

      const fn = firstName.trim()
      const sn = secondName.trim()
      const sa = salonName.trim()
      const stylistName = [fn, sn].filter(Boolean).join(' ')
      const styleName = 'Challenge Number One' // change label here if needed

      // Today as YYYY-MM-DD
      const today = new Date()
      const yyyy = today.getFullYear()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      const date = `${yyyy}-${mm}-${dd}`

      // Simple ID – for MVP this is fine, later we can use DB IDs
      const ts = Date.now().toString()
      const certificateId = `PC-${ts.slice(-6)}`

      const payload = {
        stylistName,
        salonName: sa,
        styleName,
        date,
        certificateId
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        console.error('Certificate PDF error:', await res.text())
        alert('Sorry, your certificate could not be generated. Please try again.')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Certificate_${stylistName.replace(/\s+/g, '_')}_Challenge_One.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
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
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <img src="/logo.jpeg" alt="Patrick Cameron – Style Challenge" width="160" />
        </div>

        <h1 style={{ fontSize: 24, margin: '4px 0 14px', textAlign: 'center' }}>
          Congratulations!
        </h1>

        <p style={{ margin: '0 0 16px', textAlign: 'center', color: '#cfcfcf' }}>
          Patrick has approved your Style Challenge submission. Your certificate is ready to download –
          a professional milestone to share with clients, salons, and followers.
        </p>

        {/* Patrick’s message video */}
        <div style={{
          aspectRatio: '16 / 9',
          width: '100%',
          background: '#0f0f10',
          border: '1px dashed #2a2b2f',
          borderRadius: 12,
          overflow: 'hidden',
          margin: '16px 0 18px'
        }}>
          <iframe
            src="https://player.vimeo.com/video/000000000?h=placeholder&title=0&byline=0&portrait=0"
            style={{ border: 0, width: '100%', height: '100%' }}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="Patrick’s message"
          />
        </div>

        {/* Single main CTA */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a
            href="#"
            onClick={handleCertificateClick}
            style={{
              background: downloading ? '#c0c0c0' : '#eaeaea',
              color: '#111',
              textDecoration: 'none',
              padding: '10px 14px',
              borderRadius: 8,
              fontWeight: 700,
              display: 'inline-block',
              pointerEvents: downloading ? 'none' : 'auto'
            }}
          >
            {downloading ? 'Generating your certificate…' : 'Download your Patrick Cameron Certificate'}
          </a>
        </div>

        {loadingProfile && (
          <div style={{ marginTop: 14, fontSize: 12, color: '#8a8a8a', textAlign: 'center' }}>
            Loading your details…
          </div>
        )}

        {error && !loadingProfile && (
          <div style={{ marginTop: 14, fontSize: 13, color: '#ffb3b3', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {process.env.NODE_ENV !== 'production' && token && (
          <div style={{ marginTop: 14, fontSize: 12, color: '#8a8a8a' }}>
            token: {token}
          </div>
        )}
      </div>
    </main>
  )
}