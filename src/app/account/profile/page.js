'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'
import SignedInAs from '../../../components/SignedInAs'

const STORAGE_PREFIX =
  'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'

const SOCIAL_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'none', label: "I'm not on social media" },
]

function resolveUrl(url) {
  if (!url) return null
  return url.startsWith('http') ? url : STORAGE_PREFIX + url
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

export default function ProfilePage() {
  const router = useRouter()

  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [saved, setSaved]                   = useState(false)
  const [error, setError]                   = useState('')
  const [firstName, setFirstName]           = useState('')
  const [secondName, setSecondName]         = useState('')
  const [salonName, setSalonName]           = useState('')
  const [socialPlatform, setSocialPlatform] = useState('')
  const [socialHandle, setSocialHandle]     = useState('')
  const [email, setEmail]                   = useState('')
  const [certifications, setCertifications] = useState([])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const u = sessionData?.session?.user
      if (!u) { router.replace('/'); return }
      if (cancelled) return

      setEmail(u.email || '')

      const [profileRes, certsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('first_name, second_name, salon_name, social_platform, social_handle')
          .eq('id', u.id)
          .single(),
        supabase
          .from('submissions')
          .select('id, challenge_slug, review_token, reviewed_at, finished_url')
          .eq('user_id', u.id)
          .eq('status', 'approved')
          .order('reviewed_at', { ascending: false }),
      ])

      if (cancelled) return

      if (!profileRes.error && profileRes.data) {
        const p = profileRes.data
        setFirstName(p.first_name || '')
        setSecondName(p.second_name || '')
        setSalonName(p.salon_name || '')
        setSocialPlatform(p.social_platform || '')
        setSocialHandle(p.social_handle || '')
      }

      if (!certsRes.error && certsRes.data) {
        setCertifications(certsRes.data)
      }

      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [router])

  const handleSave = async () => {
    setError('')
    setSaved(false)
    const fn       = firstName.trim()
    const sn       = secondName.trim()
    const platform = socialPlatform.trim()
    const handle   = socialHandle.trim()
    if (!fn || !sn) {
      setError('Please add your first and last name.'); return
    }
    if (!platform) {
      setError('Please select a social media platform.'); return
    }
    if (platform !== 'none' && !handle) {
      setError('Please add your social media username.'); return
    }
    setSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const u = sessionData?.session?.user
      if (!u) { setError('Session expired. Please sign in again.'); return }
      const { error: saveError } = await supabase.from('profiles').upsert({
        id: u.id,
        email: u.email ?? null,
        first_name: fn,
        second_name: sn,
        salon_name: salonName.trim() || null,
        social_platform: platform || null,
        social_handle: handle.replace(/^@/, '') || null,
      })
      if (saveError) { setError('Sorry, there was a problem saving your profile.'); return }
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main style={shell}>
        <p style={{ color: '#ccc' }}>Loading your profile…</p>
      </main>
    )
  }

  return (
    <main style={shell}>
      <div style={wrap}>

        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={220}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <SignedInAs />
        </div>

        {/* ── Profile form ── */}
        <h1 style={pageTitle}>My Profile</h1>
        <p style={pageSubtitle}>
          Keep your details up to date. Your name appears on your portfolio and certificate.
          Your social handle lets us tag you when we share your work on Patrick's channels.
        </p>

        <div style={card}>

          <div style={fieldGroup}>
            <label style={fieldLabel}>Email address</label>
            <input
              value={email}
              disabled
              style={{ ...field, opacity: 0.5, cursor: 'not-allowed' }}
            />
            <div style={hint}>This is your login — it can't be changed here.</div>
          </div>

          <div style={divider} />

          <div style={row}>
            <div style={fieldGroup}>
              <label style={fieldLabel}>First name</label>
              <input
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); setSaved(false) }}
                placeholder="e.g. Sarah"
                style={field}
              />
            </div>
            <div style={fieldGroup}>
              <label style={fieldLabel}>Last name</label>
              <input
                value={secondName}
                onChange={(e) => { setSecondName(e.target.value); setSaved(false) }}
                placeholder="e.g. Jones"
                style={field}
              />
            </div>
          </div>

          <div style={fieldGroup}>
            <label style={fieldLabel}>Salon name</label>
            <input
              value={salonName}
              onChange={(e) => { setSalonName(e.target.value); setSaved(false) }}
              placeholder="e.g. Salon Elegance"
              style={field}
            />
          </div>

          <div style={divider} />

          <div style={fieldGroup}>
            <label style={fieldLabel}>Social media platform</label>
            <select
              value={socialPlatform}
              onChange={(e) => { setSocialPlatform(e.target.value); setSocialHandle(''); setSaved(false) }}
              style={field}
            >
              {SOCIAL_OPTIONS.map((o) => (
                <option key={o.value || 'blank'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {socialPlatform && socialPlatform !== 'none' && (
            <div style={fieldGroup}>
              <label style={fieldLabel}>Social media username</label>
              <input
                value={socialHandle}
                onChange={(e) => { setSocialHandle(e.target.value); setSaved(false) }}
                placeholder="e.g. sarahjones_hair"
                style={field}
              />
              <div style={hint}>Don't include "@" — we'll handle that.</div>
            </div>
          )}

          {error && <div style={errorStyle}>{error}</div>}
          {saved && <div style={successStyle}>✓ Profile saved successfully.</div>}

          <button onClick={handleSave} disabled={saving} style={{ ...btn, marginTop: 8 }}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>

        </div>

        {/* ── Certified challenges ── */}
        {certifications.length > 0 && (
          <>
            <h2 style={{ ...pageTitle, marginTop: 32, marginBottom: 8 }}>
              My Certifications
            </h2>
            <p style={pageSubtitle}>
              {certifications.length === 1
                ? 'You have 1 Patrick Cameron certification.'
                : `You have ${certifications.length} Patrick Cameron certifications.`}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {certifications.map((c) => {
                const thumbUrl = resolveUrl(c.finished_url)
                const certUrl  = `/result/approved?token=${c.review_token}&userEmail=${encodeURIComponent(email)}`
                const title    = c.challenge_slug
                  ? c.challenge_slug
                      .split('-')
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(' ')
                  : 'Style Challenge'

                return (
                  <div key={c.id} style={certCard}>
                    {thumbUrl && (
                      <img
                        src={thumbUrl}
                        alt={title}
                        style={thumbStyle}
                      />
                    )}
                    <div style={certInfo}>
                      <div style={certTitle}>{title}</div>
                      <div style={certDate}>
                        Certified {formatDate(c.reviewed_at)}
                      </div>
                      <a href={certUrl} style={certLink}>
                        Download certificate →
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <button onClick={() => router.push('/challenges/menu')} style={backBtn}>
            ← Back to challenges
          </button>
        </div>

      </div>
    </main>
  )
}

/* ── styles ── */

const shell = {
  minHeight: '100vh',
  background: '#000',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '28px 12px 48px',
  boxSizing: 'border-box',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
}

const wrap         = { width: 'min(540px, 95vw)' }
const pageTitle    = { color: '#fff', fontSize: 22, fontWeight: 800, textAlign: 'center', margin: '0 0 8px' }
const pageSubtitle = { color: '#9ca3af', fontSize: 13, textAlign: 'center', margin: '0 0 20px', lineHeight: 1.6 }

const card = {
  background: '#141414',
  borderRadius: 14,
  border: '1px solid #2a2a2a',
  padding: '20px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
}

const row        = { display: 'flex', gap: 12, flexWrap: 'wrap' }
const fieldGroup = { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 160 }
const fieldLabel = { color: '#bbbbbb', fontSize: 12, fontWeight: 600 }
const field      = { background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: 8, padding: '10px 12px', fontSize: 14, width: '100%', boxSizing: 'border-box' }
const hint       = { fontSize: 12, color: '#6b7280' }
const divider    = { borderTop: '1px solid #2a2a2a', margin: '2px 0' }

const errorStyle   = { color: '#ffb3b3', fontSize: 13, textAlign: 'center' }
const successStyle = { color: '#6ee7b7', fontSize: 13, textAlign: 'center' }

const btn = {
  background: '#0b5ed7',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '12px 20px',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 15,
  width: '100%',
}

const backBtn = {
  background: 'transparent',
  border: 'none',
  color: '#9ca3af',
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
}

const certCard = {
  background: '#141414',
  borderRadius: 14,
  border: '1px solid #2a2a2a',
  padding: 14,
  display: 'flex',
  gap: 14,
  alignItems: 'center',
  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
}

const thumbStyle = {
  width: 80,
  height: 80,
  objectFit: 'cover',
  borderRadius: 10,
  flexShrink: 0,
  background: '#fff',
}

const certInfo  = { display: 'flex', flexDirection: 'column', gap: 4 }
const certTitle = { color: '#fff', fontSize: 15, fontWeight: 700 }
const certDate  = { color: '#9ca3af', fontSize: 12 }
const certLink  = { color: '#facc15', fontSize: 13, fontWeight: 700, textDecoration: 'none', marginTop: 4 }