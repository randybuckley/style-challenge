'use client'
/* eslint-disable react/no-unescaped-characters, @next/next/no-img-element */

import { useEffect, useState, Suspense, useCallback } from 'react'
import Image from 'next/image'
import Cropper from 'react-easy-crop'
import { supabase } from '../../../../lib/supabaseClient'
import { makeUploadPath } from '../../../../lib/uploadPath'
import { useRouter, useSearchParams, useParams } from 'next/navigation'

// -------------------- Crop helpers --------------------
function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (err) => reject(err))
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })
}

async function getCroppedBlob(imageSrc, croppedAreaPixels, { quality = 0.92 } = {}) {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context not available')

  const { width, height, x, y } = croppedAreaPixels

  canvas.width = Math.max(1, Math.floor(width))
  canvas.height = Math.max(1, Math.floor(height))

  ctx.drawImage(
    image,
    x,
    y,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Image crop failed (no blob).'))
        resolve(blob)
      },
      'image/jpeg',
      quality
    )
  })
}

function guessFileName(originalName = 'photo.jpg') {
  const base = originalName.replace(/\.[^/.]+$/, '')
  return `${base}_cropped.jpg`
}

// -------------------- Page --------------------
function ChallengeStep1Page() {
  const params = useParams()
  const slugParam = params?.slug
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam

  const [user, setUser] = useState(null)
  const [loadingUser, setLoadingUser] = useState(true)

  const [challenge, setChallenge] = useState(null)
  const [loadingChallenge, setLoadingChallenge] = useState(true)

  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [navigating, setNavigating] = useState(false)

  // ✅ Cropper state
  const [isCropOpen, setIsCropOpen] = useState(false)
  const [rawSelectedUrl, setRawSelectedUrl] = useState('') // original selected image URL (object URL)
  const [rawSelectedName, setRawSelectedName] = useState('photo.jpg')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [cropping, setCropping] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()

  // ✅ Demo flag (offline)
  const demo = searchParams.get('demo') === '1'

  const challengeId = challenge?.id || null

  // ✅ Helper: preserve where the user was trying to go
  const buildReturnToHerePath = () => {
    if (typeof window === 'undefined') return ''
    const path = window.location.pathname || ''
    const qs = window.location.search || ''
    return `${path}${qs}`
  }

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
            stepNumber: 1,
            videoUrl: '/demo/video/step_1.mp4',
            referenceImageUrl: '/demo/images/step1_reference.jpeg',
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

      if (error) {
        console.error('Error loading challenge by slug:', error.message)
      }

      if (data) {
        setChallenge(data)
      }
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

      // If we have a real user and are NOT in admin demo,
      // check whether they’ve answered the permission question.
      if (sessionUser && !isAdminDemo) {
        const { data: profile, error: profErr } = await supabase
          .from('profiles')
          .select('media_consent')
          .eq('id', sessionUser.id)
          .maybeSingle()

        if (profErr) {
          console.warn(
            'Error loading profile for consent check:',
            profErr.message
          )
        }

        const consent = profile?.media_consent

        // If media_consent is null/undefined → send to permissions page,
        // BUT preserve where the user was trying to go.
        if (consent === null || typeof consent === 'undefined') {
          const returnTo = buildReturnToHerePath()
          const nextParam = returnTo ? `?next=${encodeURIComponent(returnTo)}` : ''
          router.push(`/challenge/permissions${nextParam}`)
          return
        }
      }

      setUser(sessionUser || null)
      setLoadingUser(false)
    }

    loadSessionAndConsent()
  }, [router, searchParams, demo])

  // -------- Load last Step 1 image for this challenge --------
  useEffect(() => {
    if (!user || adminDemo || demo || !challengeId) return

    let cancelled = false

    const loadLastStep1Image = async () => {
      const { data, error } = await supabase
        .from('uploads')
        .select('image_url')
        .eq('user_id', user.id)
        .eq('step_number', 1)
        .eq('challenge_id', challengeId)

      if (error) {
        console.error('Error loading existing Step 1 image:', error.message)
        return
      }

      if (!cancelled && data && data.length > 0) {
        const last = data[data.length - 1]
        if (last?.image_url) {
          const fullUrl =
            'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/' +
            last.image_url
          setImageUrl(fullUrl)
        }
      }
    }

    loadLastStep1Image()

    return () => {
      cancelled = true
    }
  }, [user, adminDemo, demo, challengeId])

  // ✅ Crop callbacks
  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const openCropperForFile = (fileObj) => {
    if (!fileObj) return
    const objUrl = URL.createObjectURL(fileObj)
    setRawSelectedUrl(objUrl)
    setRawSelectedName(fileObj.name || 'photo.jpg')
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setIsCropOpen(true)
  }

  const handleFileChange = (fileObj) => {
    setUploadMessage('')
    setShowOptions(false)

    if (!fileObj) {
      setFile(null)
      setPreviewUrl('')
      return
    }

    // We don’t immediately set `file`/`previewUrl` as final.
    // We open cropper first; on "Use this crop" we’ll set the final `file`.
    openCropperForFile(fileObj)
  }

  const confirmCrop = async () => {
    if (!rawSelectedUrl || !croppedAreaPixels) {
      setIsCropOpen(false)
      return
    }

    try {
      setCropping(true)

      const blob = await getCroppedBlob(rawSelectedUrl, croppedAreaPixels, {
        quality: 0.92,
      })

      const croppedFile = new File([blob], guessFileName(rawSelectedName), {
        type: 'image/jpeg',
      })

      // Replace any previous preview URL
      setFile(croppedFile)
      const newPreview = URL.createObjectURL(croppedFile)
      setPreviewUrl(newPreview)
      setUploadMessage('✅ Photo adjusted. Now confirm to upload.')
      setIsCropOpen(false)
    } catch (err) {
      console.error(err)
      setUploadMessage('❌ Could not crop that image. Please try again.')
      setIsCropOpen(false)
    } finally {
      setCropping(false)
    }
  }

  const cancelCrop = () => {
    setIsCropOpen(false)
  }

  // Revoke object URLs on unmount / change
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (rawSelectedUrl) URL.revokeObjectURL(rawSelectedUrl)
    }
    // Intentionally include both, so we always clean up the latest object URLs.
  }, [previewUrl, rawSelectedUrl])

  // -------- Derive Step 1 assets from challenge JSON --------
  const stepConfig = (() => {
    if (!challenge || !challenge.steps) return null
    const steps = Array.isArray(challenge.steps) ? challenge.steps : []
    if (!steps.length) return null

    const byNumber = steps.find((s) => Number(s.stepNumber) === 1)
    return byNumber || steps[0]
  })()

  const stepVideoUrl =
    stepConfig?.videoUrl ||
    'https://player.vimeo.com/video/1138763970?badge=0&autopause=0&player_id=0&app_id=58479'

  const referenceImageUrlRaw =
    stepConfig?.referenceImageUrl || '/style_one/step1_reference.jpeg'

  const referenceImageUrl =
    typeof referenceImageUrlRaw === 'string' &&
    referenceImageUrlRaw.startsWith('/storage/')
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}${referenceImageUrlRaw}`
      : referenceImageUrlRaw

  const demoYourImageUrl = '/demo/images/stylist_step1_reference.jpeg'
  const demoVideoPlaceholderUrl = '/demo/images/video_placeholder_step1.jpeg'

  // -------- Upload handler --------
  const handleUpload = async (e) => {
    e.preventDefault()
    if (uploading) return

    // ✅ DEMO: no uploads; just proceed
    if (demo) {
      setUploadMessage('✅ Demo mode: using the demo stylist image.')
      setShowOptions(true)
      return
    }

    if (!challengeId && !adminDemo) {
      setUploadMessage(
        'There was a problem loading this challenge. Please try again.'
      )
      return
    }

    if (adminDemo && !file && imageUrl) {
      setUploadMessage('✅ Demo mode: using your existing photo.')
      setShowOptions(true)
      return
    }

    if (!file && !imageUrl) {
      setUploadMessage('Please select a photo first.')
      return
    }

    if (!file && imageUrl) {
      setUploadMessage('✅ Using your existing photo for Step 1.')
      setShowOptions(true)
      return
    }

    if (!user && !adminDemo) {
      setUploadMessage(
        'There was a problem with your session. Please sign in again.'
      )
      return
    }

    try {
      setUploading(true)
      setUploadMessage('Uploading…')

      const userId = user?.id || 'demo-user'
      const filePath = makeUploadPath(userId, 'step1', file)

      const { data, error } = await supabase.storage
        .from('uploads')
        .upload(filePath, file)

      if (error) {
        console.error('❌ Storage upload failed (step1):', error.message)
        setUploadMessage('❌ Upload failed: ' + error.message)
        return
      }

      const path = data?.path || filePath

      if (!adminDemo && user && challengeId) {
        const { error: dbError } = await supabase.from('uploads').insert([
          {
            user_id: user.id,
            step_number: 1,
            image_url: path,
            challenge_id: challengeId,
          },
        ])

        if (dbError) {
          console.error('⚠️ DB insert error (step1):', dbError.message)
          setUploadMessage('✅ File saved, but DB error: ' + dbError.message)
          return
        }
      }

      const fullUrl =
        'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/' +
        path
      setImageUrl(fullUrl)
      setUploadMessage('✅ Upload complete!')
      setShowOptions(true)
    } finally {
      setUploading(false)
    }
  }

  const resetUpload = () => {
    setFile(null)
    setPreviewUrl('')
    setImageUrl('')
    setUploadMessage('')
    setShowOptions(false)
    setNavigating(false)
  }

  const proceedToNextStep = () => {
    if (navigating) return
    setNavigating(true)

    const qs = []
    if (adminDemo) qs.push('admin_demo=true')
    if (demo) qs.push('demo=1')
    const suffix = qs.length ? `?${qs.join('&')}` : ''

    router.push('/challenges/' + slug + '/step2' + suffix)
  }

  if (loadingUser || loadingChallenge || !slug) {
    return <p>Loading challenge step 1…</p>
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

  // -------- Styles --------
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

  const hasImage = !!(previewUrl || imageUrl || demo)

  const yourImageSrc = demo ? demoYourImageUrl : previewUrl || imageUrl

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
      {/* ✅ Crop modal */}
      {isCropOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.82)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: '#111',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.12)',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
            }}
          >
            <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>Adjust your photo</div>
              <div style={{ fontSize: '0.9rem', color: '#bbb', marginTop: 6 }}>
                Drag to centre. Pinch or use the slider to zoom until the style fills the oval guide.
              </div>
            </div>

            <div style={{ position: 'relative', width: '100%', height: 420, background: '#000' }}>
              <Cropper
                image={rawSelectedUrl}
                crop={crop}
                zoom={zoom}
                aspect={3 / 4}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                restrictPosition={false}
                objectFit="cover"
              />

              {/* Oval guide overlay (visual only) */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '78%',
                    height: '74%',
                    borderRadius: '50%',
                    border: '3px solid rgba(255,255,255,0.9)',
                    boxShadow: '0 0 0 2000px rgba(0,0,0,0.35)',
                  }}
                />
              </div>
            </div>

            <div style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: '#bbb', minWidth: 44 }}>Zoom</span>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.01"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  style={{ width: '70%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
                <button
                  onClick={cancelCrop}
                  disabled={cropping}
                  style={{
                    flex: 1,
                    padding: '0.85rem 1rem',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: '#000',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: cropping ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>

                <button
                  onClick={confirmCrop}
                  disabled={cropping}
                  style={{
                    flex: 1.2,
                    padding: '0.85rem 1rem',
                    borderRadius: 10,
                    border: 'none',
                    background: '#28a745',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: cropping ? 'not-allowed' : 'pointer',
                    opacity: cropping ? 0.85 : 1,
                  }}
                >
                  {cropping ? 'Saving…' : 'Use this crop'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logo */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Image
          src="/logo.jpeg"
          alt="Style Challenge Logo"
          width={240}
          height={0}
          style={{ height: 'auto', maxWidth: '100%' }}
          priority
        />
      </div>

      <h1 style={{ marginBottom: '0.5rem' }}>Step 1: Getting Started</h1>
      <hr
        style={{
          width: '50%',
          margin: '0.5rem auto 1rem auto',
          border: '0.5px solid #666',
        }}
      />

      <p style={{ marginBottom: '0.75rem', fontSize: '1rem', color: '#ddd' }}>
        Follow these steps before you take your photo:
      </p>

      <ol
        style={{
          paddingLeft: '1.2rem',
          textAlign: 'left',
          color: '#ddd',
          fontSize: '0.95rem',
          maxWidth: 520,
          marginInline: 'auto',
          lineHeight: 1.5,
          marginBottom: '2rem',
        }}
      >
        <li>Watch Patrick’s demo for Step 1.</li>
        <li>
          Prepare your mannequin or model so the style matches Patrick’s shape
          and balance.
        </li>
        <li>Position the camera so the head and hair fill the oval frame.</li>
      </ol>

      {/* Video / Demo placeholder */}
      <div style={{ marginBottom: '2rem' }}>
        {demo ? (
          <div style={placeholderFrame}>
            <div style={placeholderInner}>
              <Image
                src={demoVideoPlaceholderUrl}
                alt="Demo video placeholder - Step 1"
                width={1200}
                height={675}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                }}
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
          <div
            style={{
              width: '100%',
              position: 'relative',
              paddingTop: '56.25%',
            }}
          >
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
              title={challenge.title + ' – Step 1'}
            />
          </div>
        )}
      </div>

      {/* Compare */}
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
            <strong>Patrick’s Version</strong>
          </p>
          <div style={overlayFrame}>
            <img
              src={referenceImageUrl}
              alt="Patrick Step 1"
              style={previewImageStyle}
            />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <p>
            <strong>Your Version</strong>
          </p>

          <div style={overlayFrame}>
            {hasImage ? (
              <img
                src={yourImageSrc}
                alt="Your Version"
                style={previewImageStyle}
              />
            ) : (
              <div
                style={{
                  ...previewImageStyle,
                  background:
                    'radial-gradient(circle at 30% 20%, #777 0, #444 55%, #222 100%)',
                }}
              />
            )}

            <div style={ovalMask}>
              <div style={oval} />
            </div>

            {!hasImage && (
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

          {/* ✅ Quick adjust button (only when a new file is selected/cropped preview exists) */}
          {!!previewUrl && !demo && !adminDemo && !showOptions && (
            <button
              type="button"
              onClick={() => {
                // Re-open cropper using the already-cropped preview as the source
                // (so users can iterate without re-selecting)
                setRawSelectedUrl(previewUrl)
                setRawSelectedName(file?.name || 'photo.jpg')
                setCrop({ x: 0, y: 0 })
                setZoom(1)
                setCroppedAreaPixels(null)
                setIsCropOpen(true)
              }}
              style={{
                marginTop: 12,
                padding: '0.6rem 1rem',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.25)',
                background: '#111',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Adjust crop
            </button>
          )}

          {uploadMessage && <p style={{ marginTop: 8 }}>{uploadMessage}</p>}
        </div>
      </div>

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
            📸 Take Photo / Choose Photo (Portrait)
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFileChange(e.target.files[0])}
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
            Make sure the hairstyle fills the frame in <strong>portrait</strong>{' '}
            mode, with the head and hair inside the oval.
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
            {uploading
              ? 'Uploading…'
              : '✅ Confirm, Add to Portfolio & Move to Step 2'}
          </button>

          {uploadMessage && <p style={{ marginTop: 8 }}>{uploadMessage}</p>}
        </form>
      )}

      {/* ✅ In demo mode, show the same CTA box as "completed" */}
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
          <h2
            style={{
              color: '#28a745',
              fontSize: '1.5rem',
              marginBottom: '0.75rem',
              fontWeight: 700,
            }}
          >
            🎉 Great work!
          </h2>
          <p
            style={{
              fontSize: '1.1rem',
              color: '#fff',
              lineHeight: 1.5,
              marginBottom: '1rem',
            }}
          >
            Does this image show your <strong>best work</strong> for Step 1? If
            yes, you’re ready to continue your Style Challenge journey!
          </p>

          <button
            onClick={proceedToNextStep}
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
            {navigating ? 'Loading next step…' : '✅ Yes, This is My Best Work – Continue'}
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
              Moving to Step 2… please wait.
            </p>
          )}
        </div>
      )}
    </main>
  )
}

/** Suspense wrapper */
export default function Step1Page() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: '2rem', color: '#ccc', textAlign: 'center' }}>
          Loading…
        </main>
      }
    >
      <ChallengeStep1Page />
    </Suspense>
  )
}