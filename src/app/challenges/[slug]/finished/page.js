'use client'
/* eslint-disable react/no-unescaped-characters, @next/next/no-img-element */

import { useEffect, useState, Suspense } from 'react'
import Image from 'next/image'
import { supabase } from '../../../../lib/supabaseClient'
import { makeUploadPath } from '../../../../lib/uploadPath'
import { useRouter, useSearchParams, useParams } from 'next/navigation'

const STORAGE_PREFIX =
  'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'

function ChallengeFinishedPage() {
  const params = useParams()
  const slugParam = params?.slug
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam

  const [user, setUser] = useState(null)
  const [loadingUser, setLoadingUser] = useState(true)

  const [challenge, setChallenge] = useState(null)
  const [loadingChallenge, setLoadingChallenge] = useState(true)

  // uploads
  const [fileMannequin, setFileMannequin] = useState(null)
  const [previewMannequin, setPreviewMannequin] = useState('')
  const [fileModel, setFileModel] = useState(null)
  const [previewModel, setPreviewModel] = useState('')

  // latest existing images (best-effort)
  const [existingMannequinUrl, setExistingMannequinUrl] = useState('')
  const [existingModelUrl, setExistingModelUrl] = useState('')

  const [uploadMessage, setUploadMessage] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [navigating, setNavigating] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()

  // ✅ Demo flag (offline)
  const demo = searchParams.get('demo') === '1'

  const challengeId = challenge?.id || null

  // -------- Load challenge metadata by slug --------
  useEffect(() => {
    if (!slug) return

    // ✅ DEMO: do not call Supabase; use local assets under /public/demo/...
    if (demo) {
      setChallenge({
        id: 'demo-challenge-style-one',
        slug,
        title: 'Challenge Number One',
        steps: [
          {
            stepNumber: 4,
            videoUrl: '/demo/video/finished.mp4',
            referenceImageUrl: '/demo/images/finished_reference.jpeg',
          },
        ],
      })
      setLoadingChallenge(false)
      return
    }

    const loadChallenge = async () => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (error) console.error('Error loading challenge by slug:', error.message)
      if (data) setChallenge(data)
      setLoadingChallenge(false)
    }

    loadChallenge()
  }, [slug, demo])

  // -------- Session + admin flag + consent gate --------
  useEffect(() => {
    const isAdminDemo = searchParams.get('admin_demo') === 'true'
    setAdminDemo(isAdminDemo)

    const loadSessionAndConsent = async () => {
      // ✅ DEMO bypasses auth/consent gating
      if (demo) {
        setUser(null)
        setLoadingUser(false)
        return
      }

      const { data, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Error getting session:', error.message)
        setLoadingUser(false)
        return
      }

      const sessionUser = data.session?.user

      // Not logged in and not in demo mode → back to home
      if (!sessionUser && !isAdminDemo) {
        router.push('/')
        return
      }

      // Consent gate (real user only)
      if (sessionUser && !isAdminDemo) {
        const { data: profile, error: profErr } = await supabase
          .from('profiles')
          .select('media_consent')
          .eq('id', sessionUser.id)
          .maybeSingle()

        if (profErr) {
          console.warn('Error loading profile for consent check:', profErr.message)
        }

        const consent = profile?.media_consent
        if (consent === null || typeof consent === 'undefined') {
          router.push('/challenge/permissions')
          return
        }
      }

      setUser(sessionUser || null)
      setLoadingUser(false)
    }

    loadSessionAndConsent()
  }, [router, searchParams, demo])

  // -------- Load latest Finished Look images (mannequin + model) --------
  useEffect(() => {
    if (!user || adminDemo || demo || !challengeId) return

    let cancelled = false

    const loadLatestFinished = async () => {
      // 1) DB rows for step 4 (latest first)
      const { data: rows, error } = await supabase
        .from('uploads')
        .select('image_url, created_at')
        .eq('user_id', user.id)
        .eq('step_number', 4)
        .eq('challenge_id', challengeId)
        .order('created_at', { ascending: false })

      if (error) {
        console.warn('Error loading existing Finished Look rows:', error.message)
      }

      // Split mannequin vs model by folder naming convention.
      if (!cancelled && rows && rows.length) {
        let mannequin = ''
        let model = ''

        for (const r of rows) {
          const p = r?.image_url || ''
          const full = p.startsWith('http') ? p : STORAGE_PREFIX + p
          if (!mannequin && p.includes('finished-mannequin')) mannequin = full
          if (!model && p.includes('finished-model')) model = full
          if (mannequin && model) break
        }

        if (mannequin) setExistingMannequinUrl(mannequin)
        if (model) setExistingModelUrl(model)
      }

      // 2) Storage fallback (mannequin)
      if (!cancelled) {
        try {
          const folder = `${user.id}/finished-mannequin`
          const { data: files, error: listError } = await supabase.storage
            .from('uploads')
            .list(folder, { limit: 50 })

          if (!listError && files && files.length > 0) {
            const latestFile = files[files.length - 1]
            const path = `${folder}/${latestFile.name}`
            if (!existingMannequinUrl) setExistingMannequinUrl(STORAGE_PREFIX + path)
          }
        } catch (err) {
          console.warn('Finished mannequin storage fallback error:', err)
        }
      }

      // 3) Storage fallback (model)
      if (!cancelled) {
        try {
          const folder = `${user.id}/finished-model`
          const { data: files, error: listError } = await supabase.storage
            .from('uploads')
            .list(folder, { limit: 50 })

          if (!listError && files && files.length > 0) {
            const latestFile = files[files.length - 1]
            const path = `${folder}/${latestFile.name}`
            if (!existingModelUrl) setExistingModelUrl(STORAGE_PREFIX + path)
          }
        } catch (err) {
          console.warn('Finished model storage fallback error:', err)
        }
      }
    }

    loadLatestFinished()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, adminDemo, demo, challengeId])

  const handleMannequinChange = (fileObj) => {
    setFileMannequin(fileObj || null)
    setPreviewMannequin(fileObj ? URL.createObjectURL(fileObj) : '')
    setUploadMessage('')
  }

  const handleModelChange = (fileObj) => {
    setFileModel(fileObj || null)
    setPreviewModel(fileObj ? URL.createObjectURL(fileObj) : '')
    setUploadMessage('')
  }

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewMannequin) URL.revokeObjectURL(previewMannequin)
      if (previewModel) URL.revokeObjectURL(previewModel)
    }
  }, [previewMannequin, previewModel])

  // -------- Derive Finished assets from challenge JSON --------
  const stepConfig = (() => {
    if (!challenge || !challenge.steps) return null
    const steps = Array.isArray(challenge.steps) ? challenge.steps : []
    if (!steps.length) return null

    // ✅ stepNumber can be stored as a string in JSONB ("4"), so normalize.
    const byNumber = steps.find((s) => Number(s.stepNumber) === 4)

    return byNumber || steps[3] || steps[steps.length - 1] || steps[0]
  })()

  const stepVideoUrl =
    stepConfig?.videoUrl ||
    'https://player.vimeo.com/video/1138763970?badge=0&autopause=0&player_id=0&app_id=58479'

  // Raw value from DB (can be /storage/... or full https://... or /public/... fallback)
  const referenceImageUrlRaw =
    stepConfig?.referenceImageUrl || '/style_one/finished_reference.jpeg'

  // ✅ If DB stores /storage/... paths, prefix with Supabase project URL so the browser loads it correctly.
  const referenceImageUrl =
    typeof referenceImageUrlRaw === 'string' &&
    referenceImageUrlRaw.startsWith('/storage/')
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}${referenceImageUrlRaw}`
      : referenceImageUrlRaw

  // ✅ DEMO "Your Version" images (single placeholder asset, per your Finder screenshot)
  // File exists at: public/demo/images/stylist_finished_reference.jpeg
  const demoYourMannequinUrl = '/demo/images/stylist_finished_reference.jpeg'
  const demoYourModelUrl = '/demo/images/stylist_finished_reference.jpeg'

  // ✅ DEMO video placeholder image (same placeholder card pattern as Step 3)
  const demoVideoPlaceholderUrl = '/demo/images/video_placeholder_finished.jpeg'

  // -------- Upload handler --------
  const handleUpload = async (e) => {
    e.preventDefault()
    if (uploading) return

    // ✅ DEMO: no uploads; just proceed
    if (demo) {
      setUploadMessage('✅ Demo mode: using the demo finished look images.')
      setShowOptions(true)
      return
    }

    if (!challengeId && !adminDemo) {
      setUploadMessage('There was a problem loading this challenge. Please try again.')
      return
    }

    // Admin demo shortcut: allow proceeding if mannequin already exists
    if (adminDemo && !fileMannequin && existingMannequinUrl) {
      setUploadMessage('✅ Demo mode: using your existing Finished Look mannequin photo.')
      setShowOptions(true)
      return
    }

    // Block if no mannequin file AND no existing mannequin
    if (!fileMannequin && !existingMannequinUrl) {
      setUploadMessage('Please upload your Finished Look mannequin photo to continue.')
      return
    }

    // New file but no valid session (outside demo) → block
    if (!user && !adminDemo) {
      setUploadMessage('There was a problem with your session. Please sign in again.')
      return
    }

    try {
      setUploading(true)
      setUploadMessage('Uploading…')

      const userId = user?.id || 'demo-user'

      // If no new mannequin, keep existing
      let mannequinPath = null
      if (fileMannequin) {
        const filePath = makeUploadPath(userId, 'finished-mannequin', fileMannequin)
        const { data, error } = await supabase.storage
          .from('uploads')
          .upload(filePath, fileMannequin)

        if (error) {
          console.error('❌ Storage upload failed (finished mannequin):', error.message)
          setUploadMessage('❌ Upload failed: ' + error.message)
          return
        }
        mannequinPath = data?.path || filePath
      }

      let modelPath = null
      if (fileModel) {
        const filePath = makeUploadPath(userId, 'finished-model', fileModel)
        const { data, error } = await supabase.storage
          .from('uploads')
          .upload(filePath, fileModel)

        if (error) {
          console.error('❌ Storage upload failed (finished model):', error.message)
          setUploadMessage('❌ Upload failed: ' + error.message)
          return
        }
        modelPath = data?.path || filePath
      }

      // DB insert only for real users
      if (!adminDemo && user && challengeId) {
        const rows = []
        if (mannequinPath) {
          rows.push({
            user_id: user.id,
            step_number: 4,
            image_url: mannequinPath,
            challenge_id: challengeId,
          })
        }
        if (modelPath) {
          rows.push({
            user_id: user.id,
            step_number: 4,
            image_url: modelPath,
            challenge_id: challengeId,
          })
        }

        if (rows.length) {
          const { error: dbError } = await supabase.from('uploads').insert(rows)
          if (dbError) {
            console.error('⚠️ DB insert error (finished):', dbError.message)
            setUploadMessage('✅ File saved, but DB error: ' + dbError.message)
            return
          }
        }
      }

      // update UI for newly uploaded items
      if (mannequinPath) setExistingMannequinUrl(STORAGE_PREFIX + mannequinPath)
      if (modelPath) setExistingModelUrl(STORAGE_PREFIX + modelPath)

      setUploadMessage('✅ Upload complete!')
      setShowOptions(true)
    } finally {
      setUploading(false)
    }
  }

  const resetUpload = () => {
    setFileMannequin(null)
    setPreviewMannequin('')
    setFileModel(null)
    setPreviewModel('')
    setUploadMessage('')
    setShowOptions(false)
    setNavigating(false)
  }

  const proceedToPortfolio = () => {
    if (navigating) return
    setNavigating(true)

    const qs = []
    if (adminDemo) qs.push('admin_demo=true')
    if (demo) qs.push('demo=1')
    const suffix = qs.length ? `?${qs.join('&')}` : ''

    router.push('/challenges/' + encodeURIComponent(slug) + '/portfolio' + suffix)
  }

  // Combined loading state
  if (loadingUser || loadingChallenge || !slug) {
    return <p>Loading finished look…</p>
  }

  if (!challenge) {
    return (
      <main
        style={{
          maxWidth: 700,
          margin: '0 auto',
          padding: '2rem',
          fontFamily: 'sans-serif',
          textAlign: 'center',
          color: '#fff',
          backgroundColor: '#000',
          minHeight: '100vh',
        }}
      >
        <p>We couldn’t find this challenge.</p>
      </main>
    )
  }

  // -------- Styles (carry over Step 3 card + formatting) --------
  const overlayFrame = {
    position: 'relative',
    width: '100%',
    maxWidth: 320,
    margin: '0 auto',
  }

  const previewImageStyle = {
    width: '100%',
    aspectRatio: '3 / 4',
    objectFit: 'cover',
    borderRadius: 12,
    border: '1px solid #ccc',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
    background: '#000',
    display: 'block',
  }

  const ovalMask = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const oval = {
    width: '88%',
    height: '78%',
    borderRadius: '50%',
    border: '3px solid rgba(255, 255, 255, 0.9)',
  }

  // --- Demo placeholder container formatting (EXACT same pattern as Step 3) ---
  const placeholderFrame = {
    background: '#fff',
    borderRadius: 12,
    padding: 12,
    border: '1px solid #e6e6e6',
    boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
  }

  const placeholderInner = {
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid #dcdcdc',
    background: '#f7f7f7',
  }

  const placeholderCaption = {
    marginTop: 10,
    fontSize: '0.9rem',
    color: '#555',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  }

  const captionPill = {
    display: 'inline-block',
    padding: '0.25rem 0.6rem',
    borderRadius: 999,
    background: '#f1f1f1',
    border: '1px solid #e1e1e1',
    fontSize: '0.8rem',
    color: '#444',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  }

  const mannequinSrc = demo ? demoYourMannequinUrl : previewMannequin || existingMannequinUrl
  const modelSrc = demo ? demoYourModelUrl : previewModel || existingModelUrl

  const hasMannequin = !!mannequinSrc
  const hasModel = !!modelSrc

  return (
    <main
      style={{
        maxWidth: 700,
        margin: '0 auto',
        padding: '2rem',
        fontFamily: 'sans-serif',
        textAlign: 'center',
        backgroundColor: '#000',
        color: '#fff',
        minHeight: '100vh',
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: '1.25rem' }}>
        <Image
          src="/logo.jpeg"
          alt="Style Challenge Logo"
          width={240}
          height={0}
          style={{ height: 'auto', maxWidth: '100%' }}
          priority
        />
      </div>

      <h1 style={{ marginBottom: '0.5rem' }}>Finished Look: Show Off Your Best Work</h1>

      <p style={{ marginBottom: '1rem', fontSize: '1rem', color: '#ddd', lineHeight: 1.5 }}>
        This is your final step! Capture your very best work.
        <br />
        A clear mannequin photo completes the challenge, and an optional in-real-life model photo turns your
        style into a powerful portfolio image.
      </p>

      <hr
        style={{
          width: '50%',
          margin: '0.5rem auto 1rem auto',
          border: '0.5px solid #666',
        }}
      />

      {/* Video / Demo placeholder */}
      <div style={{ marginBottom: '2rem' }}>
        {demo ? (
          <div style={placeholderFrame}>
            <div style={placeholderInner}>
              <Image
                src={demoVideoPlaceholderUrl}
                alt="Demo video placeholder - Finished Look"
                width={1200}
                height={675}
                style={{ width: '100%', height: 'auto', display: 'block' }}
                priority
              />
            </div>

            <div style={placeholderCaption}>
              <span style={captionPill}>Video placeholder</span>
              <span style={{ fontSize: '0.85rem', color: '#666' }}>
                Live video loads when Wi-Fi is available
              </span>
            </div>
          </div>
        ) : (
          <div style={{ width: '100%', position: 'relative', paddingTop: '56.25%' }}>
            <iframe
              src={stepVideoUrl}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: '2px solid #555',
                borderRadius: 6,
              }}
              frameBorder="0"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              title={challenge.title + ' – Finished Look'}
            />
          </div>
        )}
      </div>

      {/* Compare (includes Real Model panel) */}
      <h3 style={{ fontSize: '1.3rem', marginBottom: '1rem', marginTop: '2rem' }}>
        Compare Your Work
      </h3>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          textAlign: 'center',
          marginBottom: '2rem',
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <p>
            <strong>Patrick’s Finished Version</strong>
          </p>
          <div style={overlayFrame}>
            <img src={referenceImageUrl} alt="Patrick Finished Look" style={previewImageStyle} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <p>
            <strong>Your Mannequin Photo</strong>
            <br />
            <span style={{ fontSize: '0.85rem', color: '#bbb' }}>(Required)</span>
          </p>
          <div style={overlayFrame}>
            {hasMannequin ? (
              <img src={mannequinSrc} alt="Your Finished Look (Mannequin)" style={previewImageStyle} />
            ) : (
              <div
                style={{
                  ...previewImageStyle,
                  background: 'radial-gradient(circle at 30% 20%, #777 0, #444 55%, #222 100%)',
                }}
              />
            )}

            <div style={ovalMask}>
              <div style={oval} />
            </div>

            {!hasMannequin && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 14,
                  left: 0,
                  right: 0,
                  color: '#fff',
                  fontSize: '0.9rem',
                  textAlign: 'center',
                  opacity: 0.9,
                }}
              >
                Hold phone upright — fill the oval
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <p>
            <strong>Your Model Photo</strong>
            <br />
            <span style={{ fontSize: '0.85rem', color: '#bbb' }}>(Optional)</span>
          </p>
          <div style={overlayFrame}>
            {hasModel ? (
              <img src={modelSrc} alt="Your Finished Look (Real Model)" style={previewImageStyle} />
            ) : (
              <div
                style={{
                  ...previewImageStyle,
                  background: 'radial-gradient(circle at 30% 20%, #777 0, #444 55%, #222 100%)',
                }}
              />
            )}
          </div>

          <p style={{ marginTop: 8, fontSize: '0.9rem', color: '#bbb' }}>
            Optional — adds to your portfolio.
          </p>
        </div>
      </div>

      {uploadMessage && <p style={{ marginTop: 8 }}>{uploadMessage}</p>}

      {/* Upload Section */}
      {!showOptions && !adminDemo && !demo && (
        <form onSubmit={handleUpload} style={{ marginTop: '2rem' }}>
          <label
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f5f5f5',
              color: '#000',
              borderRadius: 999,
              border: '2px solid #000',
              fontSize: '1rem',
              cursor: 'pointer',
              textAlign: 'center',
              marginBottom: '0.75rem',
              fontWeight: 600,
            }}
          >
            📸 Finished Look (Mannequin) — Required
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleMannequinChange(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </label>

          <div style={{ height: 10 }} />

          <label
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f5f5f5',
              color: '#000',
              borderRadius: 999,
              border: '2px solid #000',
              fontSize: '1rem',
              cursor: 'pointer',
              textAlign: 'center',
              marginBottom: '0.75rem',
              fontWeight: 600,
            }}
          >
            📸 Finished Look (Real Model) — Optional
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleModelChange(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </label>

          <p
            style={{
              marginTop: '0.75rem',
              fontSize: '1rem',
              color: '#fff',
              lineHeight: 1.4,
              marginBottom: '1rem',
            }}
          >
            The mannequin photo is required to complete the challenge. The real model photo is optional.
          </p>

          <button
            type="submit"
            disabled={uploading}
            style={{
              marginTop: '0.5rem',
              padding: '1rem 2rem',
              backgroundColor: uploading ? '#1c7e33' : '#28a745',
              color: '#fff',
              borderRadius: 6,
              border: 'none',
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: '1.1rem',
              fontWeight: 600,
              minWidth: 260,
              opacity: uploading ? 0.8 : 1,
            }}
          >
            {uploading ? 'Uploading…' : '✅ Confirm, Add to Portfolio & Continue'}
          </button>
        </form>
      )}

      {(showOptions || adminDemo || demo) && (
        <div
          style={{
            marginTop: '3rem',
            padding: '1.5rem',
            border: '2px solid #28a745',
            borderRadius: 8,
            background: 'rgba(40, 167, 69, 0.1)',
            textAlign: 'center',
          }}
        >
          <h2 style={{ color: '#28a745', fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: 700 }}>
            🎉 Finished Look saved!
          </h2>
          <p style={{ fontSize: '1.1rem', color: '#fff', lineHeight: 1.5, marginBottom: '1rem' }}>
            Next, view your Portfolio page to review your images, download your portfolio PDF, and become certified.
          </p>

          <button
            onClick={proceedToPortfolio}
            disabled={navigating}
            style={{
              backgroundColor: navigating ? '#1c7e33' : '#28a745',
              color: '#fff',
              padding: '0.75rem 1.5rem',
              fontSize: '1.1rem',
              border: 'none',
              borderRadius: 6,
              marginRight: '1rem',
              cursor: navigating ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              minWidth: 200,
              opacity: navigating ? 0.9 : 1,
            }}
          >
            {navigating ? 'Loading portfolio…' : '✅ Go to Portfolio'}
          </button>

          {!adminDemo && !demo && (
            <button
              onClick={resetUpload}
              disabled={navigating}
              style={{
                backgroundColor: '#000',
                color: '#fff',
                padding: '0.75rem 1.5rem',
                fontSize: '1.1rem',
                border: 'none',
                borderRadius: 6,
                cursor: navigating ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                minWidth: 200,
              }}
            >
              🔁 No, I’ll Upload a Better Pic
            </button>
          )}

          {navigating && (
            <p style={{ marginTop: '0.75rem', fontSize: '0.95rem', color: '#cce8d5' }}>
              Moving to your Portfolio… please wait.
            </p>
          )}
        </div>
      )}
    </main>
  )
}

/** Suspense wrapper */
export default function FinishedPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: '2rem', color: '#ccc', textAlign: 'center' }}>
          Loading…
        </main>
      }
    >
      <ChallengeFinishedPage />
    </Suspense>
  )
}