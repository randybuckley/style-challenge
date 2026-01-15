// src/app/challenges/[slug]/portfolio/page.js
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../../../lib/supabaseClient'
import SignedInAs from '../../../../components/SignedInAs'

const STORAGE_PREFIX =
  'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'

export default function ChallengePortfolioPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams()

  const rawSlug = params?.slug
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug || 'starter-style'

  const adminDemo = searchParams.get('admin_demo') === 'true'
  const demo = searchParams.get('demo') === '1'

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [firstName, setFirstName] = useState('')
  const [secondName, setSecondName] = useState('')
  const [salonName, setSalonName] = useState('')

  const [images, setImages] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  // Demo images (easy to swap in /public/demo/images/)
  const demoImages = useMemo(() => {
    return {
      1: '/demo/images/stylist_step1_reference.jpeg',
      2: '/demo/images/stylist_step2_reference.jpeg',
      3: '/demo/images/stylist_step3_reference.jpeg',
      4: '/demo/images/stylist_finished_reference.jpeg',
    }
  }, [])

  // ---------- load session ----------
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      // ✅ DEMO: no Supabase calls; just load local images
      if (demo) {
        if (!cancelled) {
          setUser(null)
          setImages(demoImages)
          setFirstName('SAMPLE')
          setSecondName('STYLIST')
          setSalonName('SAMPLE SALON')
          setLoading(false)
        }
        return
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()

      if (sessionError) {
        console.error('Session error:', sessionError.message)
        if (!cancelled) {
          setError('Error checking your session.')
          setLoading(false)
        }
        return
      }

      const u = sessionData?.session?.user
      if (!u && !adminDemo) {
        router.replace('/')
        return
      }

      if (!cancelled) {
        setUser(u || null)
      }

      await Promise.all([
        loadProfile(u),
        loadUploads(u, adminDemo, slug).then((imgMap) => {
          if (!cancelled) setImages(imgMap)
        }),
      ])

      if (!cancelled) setLoading(false)
    }

    run()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, adminDemo, demo, demoImages, slug])

  // ---------- helpers: profile + uploads ----------

  const loadProfile = async (u) => {
    if (!u) return
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, second_name, salon_name')
      .eq('id', u.id)
      .single()

    if (profileError) {
      console.warn('Profile load error:', profileError.message)
      return
    }

    setFirstName(profile.first_name || '')
    setSecondName(profile.second_name || '')
    setSalonName(profile.salon_name || '')
  }

  const resolveChallengeIdBySlug = async (challengeSlug) => {
    const { data, error: chErr } = await supabase
      .from('challenges')
      .select('id')
      .eq('slug', challengeSlug)
      .eq('is_active', true)
      .single()

    if (chErr) {
      console.warn('Challenge lookup failed:', chErr.message)
      return null
    }

    return data?.id || null
  }

  const loadUploads = async (u, isAdminDemo, challengeSlug) => {
    const imgMap = {}

    if (!u && !isAdminDemo) {
      return imgMap
    }

    // We only support real uploads when we have a real user session
    if (!u) {
      return imgMap
    }

    // ✅ Key fix: filter uploads to THIS challenge (by UUID challenge_id)
    const challengeId = await resolveChallengeIdBySlug(challengeSlug)
    if (!challengeId) {
      // If we can’t resolve, fail gracefully rather than showing wrong images
      console.warn('No active challenge found for slug:', challengeSlug)
      return imgMap
    }

    // DB rows first (latest per step within this challenge)
    const { data: rows, error: rowsError } = await supabase
      .from('uploads')
      .select('step_number, image_url, created_at')
      .eq('user_id', u.id)
      .eq('challenge_id', challengeId)
      .in('step_number', [1, 2, 3, 4])
      .order('created_at', { ascending: false })

    if (rowsError) {
      console.warn('Uploads load error:', rowsError.message)
    } else if (rows && rows.length > 0) {
      const latest = {}
      for (const r of rows) {
        if (!latest[r.step_number]) {
          const url = r.image_url?.startsWith('http')
            ? r.image_url
            : STORAGE_PREFIX + r.image_url
          latest[r.step_number] = url
        }
      }
      Object.assign(imgMap, latest)
    }

    // Fallback for finished look: read directly from storage if needed
    // NOTE: your image_url shows files stored under `${user_id}/finished-mannequin-...`,
    // so list the user root folder (not `${user_id}/finished-mannequin/`).
    if (!imgMap[4] && u) {
      try {
        const folder = `${u.id}`
        const { data: files, error: listError } = await supabase.storage
          .from('uploads')
          .list(folder, { limit: 200 })

        if (listError) {
          console.warn('Storage list error (finished):', listError.message)
        } else if (files && files.length > 0) {
          const finishedFiles = files
            .filter((f) => f?.name && f.name.startsWith('finished'))
            .sort((a, b) => {
              const at = new Date(a?.updated_at || a?.created_at || 0).getTime()
              const bt = new Date(b?.updated_at || b?.created_at || 0).getTime()
              return at - bt
            })

          const latestFile = finishedFiles[finishedFiles.length - 1]
          if (latestFile?.name) {
            const path = `${folder}/${latestFile.name}`
            imgMap[4] = STORAGE_PREFIX + path
          }
        }
      } catch (err) {
        console.warn('Finished storage fallback error:', err)
      }
    }

    return imgMap
  }

  const ensureIdentityComplete = () => {
    // ✅ DEMO: do not block flow; still allow editing fields for realism
    if (demo) {
      setError('')
      return true
    }

    const fn = (firstName || '').trim()
    const sn = (secondName || '').trim()
    const sa = (salonName || '').trim()

    if (!fn || !sn || !sa) {
      const msg =
        'Please add your first name, last name, and salon name — this is how they will appear on your portfolio.'
      setError(msg)
      alert(msg)
      return false
    }
    setError('')
    return true
  }

  const saveProfile = async () => {
    if (demo) return
    if (!user) return
    if (!ensureIdentityComplete()) return

    setSaving(true)
    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email ?? null,
        first_name: (firstName || '').trim(),
        second_name: (secondName || '').trim(),
        salon_name: (salonName || '').trim(),
      })
    } finally {
      setSaving(false)
    }
  }

  // ---------- PDF download ----------
  const handleDownload = async () => {
    if (!ensureIdentityComplete()) return

    const s1 = images[1]
    const s2 = images[2]
    const s3 = images[3]
    const fin = images[4]

    if (!s1 || !s2 || !s3 || !fin) {
      alert(
        'Please make sure you have uploaded images for Steps 1, 2, 3 and the Finished Look before downloading your portfolio.'
      )
      return
    }

    setDownloading(true)
    try {
      const fullName = `${(firstName || '').trim()} ${(secondName || '').trim()}`
        .trim()
        .replace(/\s+/g, ' ')
      const challengeTitle =
        slug === 'starter-style' ? 'Starter Style Challenge' : 'Style Challenge'

      // ✅ DEMO: use absolute URLs so /api/pro-portfolio can fetch local images
      const origin =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : ''

      const step1Url = demo ? origin + s1 : s1
      const step2Url = demo ? origin + s2 : s2
      const step3Url = demo ? origin + s3 : s3
      const finalUrl = demo ? origin + fin : fin

      const res = await fetch('/api/pro-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step1Url,
          step2Url,
          step3Url,
          finalUrl,
          challengeTitle,
          stylistName: fullName || (demo ? 'SAMPLE STYLIST' : ''),
          salonName: (salonName || '').trim() || (demo ? 'SAMPLE SALON' : ''),
          demo: demo,
        }),
      })

      if (!res.ok) {
        console.error('PDF error', await res.text())
        alert('Sorry, there was a problem generating your portfolio PDF.')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = demo
        ? 'SAMPLE-style-challenge-portfolio.pdf'
        : 'style-challenge-portfolio.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF download error:', err)
      alert('Sorry, there was a problem downloading your portfolio.')
    } finally {
      setDownloading(false)
    }
  }

  const handleBackToCollections = () => {
    router.push('/challenges/menu')
  }

  // ---------- certification wiring ----------
  const handleBecomeCertified = async () => {
    if (!ensureIdentityComplete()) return
    await saveProfile()

    const qs = []
    if (adminDemo) qs.push('admin_demo=true')
    if (demo) qs.push('demo=1')
    const suffix = qs.length ? `?${qs.join('&')}` : ''

    router.push(`/challenges/${encodeURIComponent(slug)}/certify${suffix}`)
  }

  if (loading) {
    return (
      <main style={pageShell}>
        <p style={{ color: '#ccc' }}>Loading portfolio…</p>
      </main>
    )
  }

  const nameLine =
    [firstName, secondName].filter(Boolean).join(' ') ||
    (demo ? 'SAMPLE STYLIST' : user?.email || '')

  const challengeTitle =
    slug === 'starter-style' ? 'Starter Style Challenge' : 'Style Challenge'

  return (
    <main style={pageShell}>
      <div style={introWrap}>
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={260}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        {/* ✅ Signed-in identity strip with sign-out */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <SignedInAs />
        </div>

        <h1 style={introTitle}>{nameLine}</h1>
        {salonName && <div style={introSub}>{salonName}</div>}

        <p style={introText}>
          Before you download your portfolio, please add your{' '}
          <strong>first name</strong>, <strong>last name</strong>, and{' '}
          <strong>salon name</strong> exactly as you want them to appear on your
          portfolio.
          {demo && (
            <>
              <br />
              <span style={{ color: '#bdbdbd' }}>
                Demo mode uses local sample images and generates a PDF from them.
              </span>
            </>
          )}
        </p>

        <div style={editBar}>
          <div style={editRow}>
            <div style={fieldGroup}>
              <label style={fieldLabel}>First name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Randy"
                style={field}
              />
            </div>
            <div style={fieldGroup}>
              <label style={fieldLabel}>Last name</label>
              <input
                value={secondName}
                onChange={(e) => setSecondName(e.target.value)}
                placeholder="e.g. Buckley"
                style={field}
              />
            </div>
            <div style={{ ...fieldGroup, flexBasis: '100%', maxWidth: 320 }}>
              <label style={fieldLabel}>Salon name</label>
              <input
                value={salonName}
                onChange={(e) => setSalonName(e.target.value)}
                placeholder="e.g. BigDeal Hair"
                style={{ ...field, minWidth: 220 }}
              />
            </div>
          </div>
          <div style={saveRow}>
            <button onClick={saveProfile} disabled={saving || demo} style={btnSmall}>
              {demo ? 'Demo mode' : saving ? 'Saving…' : 'Save details'}
            </button>
          </div>
          {error && <div style={errorText}>{error}</div>}
        </div>
      </div>

      <div style={outerCard}>
        <h2 style={portfolioTitle}>Your Style Challenge Portfolio</h2>
        {nameLine && <div style={portfolioMeta}>{nameLine}</div>}
        {salonName && <div style={portfolioMeta}>{salonName}</div>}
        <div style={portfolioMeta}>{challengeTitle}</div>

        <div style={stepsRow}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={thumbCard}>
              <div style={thumbLabel}>Step {n}</div>
              {images[n] ? (
                <img
                  src={images[n]}
                  alt={`Step ${n}`}
                  style={thumbImg}
                  data-embed="true"
                />
              ) : (
                <div style={missing}>No image</div>
              )}
            </div>
          ))}
        </div>

        <div style={finishedWrap}>
          <div style={finishedCard}>
            <div style={finishedLabel}>Finished Look</div>
            {images[4] ? (
              <img
                src={images[4]}
                alt="Finished Look"
                style={finishedImg}
                data-embed="true"
              />
            ) : (
              <div style={missing}>No image</div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, textAlign: 'center' }}>
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{ ...btn, marginRight: 10 }}
        >
          {downloading
            ? demo
              ? 'Generating sample PDF…'
              : 'Generating PDF…'
            : demo
              ? '📄 Download Sample Portfolio'
              : '📄 Download Portfolio'}
        </button>

        <button
          onClick={handleBecomeCertified}
          style={{
            ...btn,
            marginRight: 10,
            background: '#28a745',
            cursor: 'pointer',
          }}
          title="Start certification"
        >
          ✅ Become Certified
        </button>

        <button onClick={handleBackToCollections} style={btn}>
          ⬅️ Back to Collections
        </button>
      </div>
    </main>
  )
}

/* ===================== styles ===================== */

const pageShell = {
  minHeight: '100vh',
  background: '#000',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '20px 12px 32px',
  boxSizing: 'border-box',
  fontFamily:
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
}

const introWrap = {
  width: 'min(800px, 95vw)',
  marginBottom: 16,
}

const introTitle = {
  color: '#ffffff',
  fontSize: 22,
  fontWeight: 800,
  textAlign: 'center',
  margin: '0 0 2px',
}

const introSub = {
  color: '#e5e7eb',
  fontSize: 14,
  textAlign: 'center',
  marginBottom: 6,
}

const introText = {
  color: '#dddddd',
  fontSize: 14,
  textAlign: 'center',
  margin: '0 0 14px',
  lineHeight: 1.5,
}

const editBar = {
  background: '#121212',
  borderRadius: 12,
  border: '1px solid #2f2f2f',
  padding: '10px 12px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  justifyContent: 'center',
  alignItems: 'stretch',
}

const editRow = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  justifyContent: 'center',
}

const saveRow = {
  display: 'flex',
  justifyContent: 'center',
  marginTop: 4,
}

const fieldGroup = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 160,
  maxWidth: 260,
}

const fieldLabel = {
  color: '#bbbbbb',
  fontSize: 12,
  fontWeight: 500,
}

const field = {
  background: '#161616',
  color: '#fff',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
}

const errorText = {
  marginTop: 4,
  textAlign: 'center',
  color: '#ffb3b3',
  fontSize: 13,
}

const outerCard = {
  width: 'min(800px, 95vw)',
  marginTop: 10,
  background: '#020617',
  borderRadius: 16,
  border: '1px solid #111827',
  padding: '18px 16px 20px',
  boxShadow: '0 18px 48px rgba(0,0,0,.35)',
}

const portfolioTitle = {
  color: '#f9fafb',
  fontSize: 18,
  fontWeight: 700,
  textAlign: 'center',
  margin: '0 0 4px',
}

const portfolioMeta = {
  color: '#d1d5db',
  fontSize: 13,
  textAlign: 'center',
}

const stepsRow = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 16,
  marginTop: 16,
}

const thumbCard = {
  background: '#020617',
  borderRadius: 16,
  border: '1px solid #111827',
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const thumbLabel = {
  fontWeight: 600,
  fontSize: 13,
  color: '#e5e7eb',
  marginBottom: 8,
}

const thumbImg = {
  width: '100%',
  height: 'auto',
  maxHeight: 260,
  objectFit: 'contain',
  borderRadius: 12,
  background: '#fff',
  display: 'block',
}

const finishedWrap = { marginTop: 18 }

const finishedCard = {
  background: '#020617',
  borderRadius: 16,
  border: '1px solid #111827',
  padding: 12,
  maxWidth: 540,
  margin: '0 auto',
}

const finishedLabel = {
  textAlign: 'center',
  fontWeight: 700,
  marginBottom: 10,
  fontSize: 13,
  color: '#e5e7eb',
}

const finishedImg = {
  width: '100%',
  height: 'auto',
  maxHeight: 680,
  objectFit: 'contain',
  borderRadius: 12,
  background: '#fff',
  display: 'block',
}

const missing = {
  color: '#888',
  fontStyle: 'italic',
  marginTop: 18,
  textAlign: 'center',
}

const btn = {
  background: '#0b5ed7',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '12px 16px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 10px 22px rgba(0,0,0,.25)',
  fontSize: 14,
}

const btnSmall = {
  background: '#444',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 12px',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}