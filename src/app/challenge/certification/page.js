'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

export default function CertificationPage() {
  const router = useRouter()

  // IMPORTANT:
  // This must match an existing row in public.challenges.slug.
  // Your screenshot shows 'starter-style' exists in challenges.
  // If this page should submit a different challenge, change this slug accordingly.
  const CHALLENGE_SLUG = 'starter-style'

  // session / profile
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [firstName, setFirstName] = useState('')
  const [secondName, setSecondName] = useState('')
  const [salonName, setSalonName] = useState('')

  // thumbs
  const [latestByStep, setLatestByStep] = useState({})
  const STORAGE_PREFIX =
    'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'

  // submit state
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [infoMsg, setInfoMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const sessionUser = sessionData?.session?.user
        if (!sessionUser) {
          router.replace('/')
          return
        }
        if (cancelled) return
        setUser(sessionUser)

        // uploads newest first
        const { data: uploads, error: upErr } = await supabase
          .from('uploads')
          .select('step_number, image_url, created_at')
          .eq('user_id', sessionUser.id)
          .in('step_number', [1, 2, 3, 4])
          .order('created_at', { ascending: false })
        if (upErr) console.warn('[uploads]', upErr)

        const latest = {}
        for (const row of uploads || []) {
          if (!row?.image_url) continue
          const step = row.step_number
          if (!latest[step]) {
            latest[step] = row.image_url.startsWith('http')
              ? row.image_url
              : STORAGE_PREFIX + row.image_url
          }
        }
        if (!cancelled) setLatestByStep(latest)

        // ensure profile, then load
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert({ id: sessionUser.id, email: sessionUser.email ?? null }, { onConflict: 'id' })
        if (upsertErr) console.warn('[profiles.upsert]', upsertErr)

        const { data: profile, error: profErr } = await supabase
          .from('profiles')
          .select('first_name, second_name, salon_name')
          .eq('id', sessionUser.id)
          .single()
        if (profErr) {
          console.warn('[profiles.select]', profErr)
        } else if (!cancelled && profile) {
          setFirstName(profile.first_name || '')
          setSecondName(profile.second_name || '')
          setSalonName(profile.salon_name || '')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [router])

  const displayName = useMemo(
    () => `${firstName || ''} ${secondName || ''}`.trim(),
    [firstName, secondName]
  )

  // token helper
  const makeToken = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  const handleSubmit = async () => {
    if (submitting) return
    setErrorMsg('')
    setInfoMsg('')

    if (!user) return setErrorMsg('You need to be signed in.')
    if (!latestByStep[4]) return setErrorMsg('Please upload your Finished Look (Step 4) first.')
    if (!agree) return setErrorMsg('Please confirm the checkbox before submitting.')

    setSubmitting(true)
    try {
      // save any edited fields
      const { error: saveErr } = await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email ?? null,
        first_name: (firstName || '').trim() || null,
        second_name: (secondName || '').trim() || null,
        salon_name: (salonName || '').trim() || null
      })
      if (saveErr) {
        console.error('[profiles.upsert on submit]', saveErr)
        throw new Error(`Profile save failed: ${saveErr.message}`)
      }

      // NEW (minimal fix): resolve challenge_id (submissions.challenge_id is NOT NULL in your DB)
      const { data: challengeRow, error: chErr } = await supabase
        .from('challenges')
        .select('id')
        .eq('slug', CHALLENGE_SLUG)
        .single()

      if (chErr) {
        console.error('[challenges.select]', chErr)
        throw new Error(`Could not resolve challenge_id for slug "${CHALLENGE_SLUG}": ${chErr.message}`)
      }
      if (!challengeRow?.id) {
        throw new Error(`Could not resolve challenge_id for slug "${CHALLENGE_SLUG}".`)
      }

      const review_token = makeToken()
      const payload = {
        // REQUIRED by DB:
        challenge_id: challengeRow.id,

        // Existing fields unchanged:
        user_id: user.id,
        email: user.email ?? null,
        first_name: (firstName || '').trim() || null,
        second_name: (secondName || '').trim() || null,
        salon_name: (salonName || '').trim() || null,
        step1_url: latestByStep[1] || null,
        step2_url: latestByStep[2] || null,
        step3_url: latestByStep[3] || null,
        finished_url: latestByStep[4] || null,
        status: 'pending',
        review_token
      }

      // IMPORTANT: select().single() surfaces RLS/constraint errors clearly
      const { data: row, error: insErr } = await supabase
        .from('submissions')
        .insert(payload)
        .select('id')
        .single()

      if (insErr) {
        console.error('[submissions.insert]', insErr)
        throw new Error(insErr.message || 'Submission insert failed.')
      }

      // ping the server to email reviewer
      const res = await fetch('/api/review-certification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: review_token })
      })

      let resBody = null
      try { resBody = await res.json() } catch {}
      if (!res.ok) {
        console.error('[notify reviewer] status', res.status, resBody)
        throw new Error(resBody?.error || `Notify failed (HTTP ${res.status})`)
      }

      // success
      setInfoMsg('Submitted! Redirecting…')
      router.replace('/challenge/submission/portfolio')
    } catch (e) {
      console.error('[certification.submit] ', e)
      setErrorMsg(String(e?.message || e || 'Something went wrong.'))
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

  return (
    <main style={page}>
      <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.75rem' }}>
        🎓 Submit for Certification
      </h2>

      <p style={{ lineHeight: 1.6, marginBottom: '1.25rem', color: '#e6e6e6' }}>
        You’ve completed the challenge — now submit your portfolio for review by Patrick Cameron.
        Approved work earns a <strong>Patrick Cameron Certified</strong> badge and enhanced PDF.
      </p>

      {/* Profile quick edit */}
      <div style={info}>
        <div>
          <div style={label}>Name</div>
          <input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={input} />
        </div>
        <div>
          <div style={label}>&nbsp;</div>
          <input placeholder="Second name" value={secondName} onChange={(e) => setSecondName(e.target.value)} style={input} />
        </div>
        <div style={{ minWidth: 260 }}>
          <div style={label}>Salon (optional)</div>
          <input placeholder="Salon name" value={salonName} onChange={(e) => setSalonName(e.target.value)} style={input} />
        </div>
      </div>

      {/* Thumbs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', margin: '14px 0' }}>
        <StepCard title="Step 1" url={latestByStep[1]} />
        <StepCard title="Step 2" url={latestByStep[2]} />
        <StepCard title="Step 3" url={latestByStep[3]} />
      </div>

      <h3 style={{ textAlign: 'center', marginTop: 14, marginBottom: 8 }}>Finished Look</h3>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ ...card, width: 'min(720px, 92%)' }}>
          {latestByStep[4] ? (
            <img src={latestByStep[4]} alt="Finished Look" style={img} loading="eager" />
          ) : (
            <p style={{ color: '#bbb', margin: 0 }}>No Finished Look uploaded.</p>
          )}
        </div>
      </div>

      {/* Consent */}
      <label style={{ display: 'block', textAlign: 'center', marginTop: 16, color: '#ddd' }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginRight: 8 }} />
        I confirm this portfolio is my own work and I agree to be contacted about the result.
      </label>

      {/* Messages */}
      {errorMsg && <p style={{ color: '#ff6b6b', textAlign: 'center', marginTop: 10 }}>{errorMsg}</p>}
      {infoMsg && <p style={{ color: '#9ee493', textAlign: 'center', marginTop: 6 }}>{infoMsg}</p>}

      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            ...primaryBtn,
            background: submitting ? '#6c757d' : '#28a745',
            cursor: submitting ? 'default' : 'pointer'
          }}
        >
          {submitting ? 'Submitting…' : '✅ Submit Now & Get Certified'}
        </button>
      </div>
    </main>
  )
}

/* small card used for steps 1–3 */
function StepCard({ title, url }) {
  if (!url) {
    return (
      <div style={card}>
        <h4 style={{ margin: '0 0 6px', textAlign: 'center', fontSize: 16, color: '#fff' }}>{title}</h4>
        <p style={{ color: '#bbb', margin: 0, textAlign: 'center' }}>No upload</p>
      </div>
    )
  }
  return (
    <div style={card}>
      <h4 style={{ margin: '0 0 6px', textAlign: 'center', fontSize: 16, color: '#fff' }}>{title}</h4>
      <img src={url} alt={title} style={img} loading="eager" />
    </div>
  )
}

/* styles (unchanged) */
const page = { maxWidth: 800, margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', backgroundColor: '#111', color: '#fff', border: '2px solid #444', borderRadius: 12 }
const info = { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 6 }
const label = { fontSize: 12, color: '#aaa', marginBottom: 4, textAlign: 'center' }
const input = { padding: '10px 12px', borderRadius: 8, border: '1px solid #555', background: '#222', color: '#fff', minWidth: 180, textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }
const card = { width: 260, maxWidth: '92vw', background: 'rgba(255,255,255,0.06)', border: '1px solid #333', borderRadius: 10, padding: 10, boxShadow: '0 10px 24px rgba(0,0,0,0.25)' }
const img = { display: 'block', width: '100%', height: 'auto', borderRadius: 8, border: '1px solid #444' }
const shell = { minHeight: '100vh', background: '#000', color: '#fff', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }
const primaryBtn = { color: '#fff', padding: '0.75rem 1.5rem', borderRadius: 8, border: 'none', fontWeight: 700 }