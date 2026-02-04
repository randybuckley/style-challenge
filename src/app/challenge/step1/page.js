'use client'
/* eslint-disable react/no-unescaped-characters, @next/next/no-img-element */

import { useEffect, useState, Suspense, useCallback } from 'react'
import Image from 'next/image'
import Cropper from 'react-easy-crop'
import { supabase } from '../../../lib/supabaseClient'
import { makeUploadPath } from '../../../lib/uploadPath'
import { useRouter, useSearchParams } from 'next/navigation'

// -------------------- Crop + image helpers --------------------
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

  ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height)

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

// Resize an image Blob (from File/ObjectURL) to a capped long edge.
// This is the "marketing original": high quality, but not enormous.
async function getResizedBlob(imageSrc, { maxLongEdge = 2048, quality = 0.9 } = {}) {
  const image = await createImage(imageSrc)

  const srcW = image.naturalWidth || image.width
  const srcH = image.naturalHeight || image.height
  if (!srcW || !srcH) throw new Error('Could not read image dimensions.')

  const longEdge = Math.max(srcW, srcH)
  const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1

  const outW = Math.max(1, Math.round(srcW * scale))
  const outH = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context not available')

  canvas.width = outW
  canvas.height = outH

  ctx.drawImage(image, 0, 0, outW, outH)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Resize failed (no blob).'))
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

function guessOriginalName(originalName = 'photo.jpg') {
  const base = originalName.replace(/\.[^/.]+$/, '')
  return `${base}_original.jpg`
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}

// -------------------- Page --------------------
function ChallengeStep1Page() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [file, setFile] = useState(null) // cropped file (judging/UI)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)
  const [uploading, setUploading] = useState(false)

  // ✅ Cropper state (same architecture as Step 3)
  const [isCropOpen, setIsCropOpen] = useState(false)
  const [rawSelectedUrl, setRawSelectedUrl] = useState('') // object URL of the selected photo
  const [rawSelectedName, setRawSelectedName] = useState('photo.jpg')
  const [rawSelectedFile, setRawSelectedFile] = useState(null) // keep the original File object
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [cropping, setCropping] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()

  // ---- Upload guardrails (same architecture as Step 3) ----
  const MAX_INPUT_BYTES = 20 * 1024 * 1024 // 20 MB
  const MAX_MARKETING_BYTES = 3 * 1024 * 1024 // 3 MB
  const MARKETING_MAX_LONG_EDGE = 2048
  const MARKETING_QUALITY = 0.9

  // ✅ Crop callbacks
  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const openCropperForFile = (fileObj) => {
    if (!fileObj) return

    if (fileObj.size > MAX_INPUT_BYTES) {
      setUploadMessage(
        `❌ That file is ${formatBytes(fileObj.size)}. Please choose a smaller photo (max ${formatBytes(
          MAX_INPUT_BYTES
        )}).`
      )
      return
    }

    const objUrl = URL.createObjectURL(fileObj)
    setRawSelectedUrl(objUrl)
    setRawSelectedName(fileObj.name || 'photo.jpg')
    setRawSelectedFile(fileObj)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setIsCropOpen(true)
  }

  // -------- Session + admin flag + consent gate --------
  useEffect(() => {
    const isAdminDemo = searchParams.get('admin_demo') === 'true'
    setAdminDemo(isAdminDemo)

    const loadSessionAndConsent = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Error getting session:', error.message)
        setLoading(false)
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
          console.warn('Error loading profile for consent check:', profErr.message)
        }

        const consent = profile?.media_consent

        // If media_consent is null/undefined → send to permissions page
        if (consent === null || typeof consent === 'undefined') {
          router.push('/challenge/permissions')
          return
        }
      }

      setUser(sessionUser || null)
      setLoading(false)
    }

    loadSessionAndConsent()
  }, [router, searchParams])

  // -------- Load last Step 1 image --------
  useEffect(() => {
    if (!user || adminDemo) return

    let cancelled = false

    const loadLastStep1Image = async () => {
      const { data, error } = await supabase
        .from('uploads')
        .select('image_url')
        .eq('user_id', user.id)
        .eq('step_number', 1)

      if (error) {
        console.error('Error loading existing Step 1 image:', error.message)
        return
      }

      if (!cancelled && data && data.length > 0) {
        const last = data[data.length - 1]
        if (last?.image_url) {
          const fullUrl =
            `https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${last.image_url}`
          setImageUrl(fullUrl)
        }
      }
    }

    loadLastStep1Image()

    return () => {
      cancelled = true
    }
  }, [user, adminDemo])

  const handleFileChange = (fileObj) => {
    setUploadMessage('')
    setShowOptions(false)

    if (!fileObj) {
      setFile(null)
      setPreviewUrl('')
      setRawSelectedFile(null)
      return
    }

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
  }, [previewUrl, rawSelectedUrl])

  // -------- Upload handler --------
  const handleUpload = async (e) => {
    e.preventDefault()
    if (uploading) return

    // Demo mode shortcut: use existing image if there is one
    if (adminDemo && !file && imageUrl) {
      setUploadMessage('✅ Demo mode: using your existing photo.')
      setShowOptions(true)
      return
    }

    // No new file and no existing image → block
    if (!file && !imageUrl) {
      setUploadMessage('Please select a photo first.')
      return
    }

    // No new file, but existing image → just confirm
    if (!file && imageUrl) {
      setUploadMessage('✅ Using your existing photo for Step 1.')
      setShowOptions(true)
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

      // 1) Upload marketing "original" (downsized) based on the raw selected file
      let originalPath = null

      if (rawSelectedUrl && rawSelectedFile) {
        const originalBlob = await getResizedBlob(rawSelectedUrl, {
          maxLongEdge: MARKETING_MAX_LONG_EDGE,
          quality: MARKETING_QUALITY,
        })

        if (originalBlob.size > MAX_MARKETING_BYTES) {
          setUploadMessage(
            `❌ Your photo is still too large after processing (${formatBytes(
              originalBlob.size
            )}). Please choose a different photo.`
          )
          setUploading(false)
          return
        }

        const originalFile = new File([originalBlob], guessOriginalName(rawSelectedName), {
          type: 'image/jpeg',
        })

        originalPath = makeUploadPath(userId, 'originals/step1', originalFile)

        const { data: origData, error: origErr } = await supabase.storage
          .from('uploads')
          .upload(originalPath, originalFile)

        if (origErr) {
          console.error('❌ Storage upload failed (original step1):', origErr.message)
          setUploadMessage('❌ Upload failed (original): ' + origErr.message)
          return
        }

        originalPath = origData?.path || originalPath
      }

      // 2) Upload cropped/judging image
      const filePath = makeUploadPath(userId, 'step1', file)

      const { data, error } = await supabase.storage
        .from('uploads')
        .upload(filePath, file)

      if (error) {
        console.error('❌ Storage upload failed (step1 cropped):', error.message)
        setUploadMessage(`❌ Upload failed: ${error.message}`)
        return
      }

      const croppedPath = data?.path || filePath

      // 3) Insert DB row with both paths
      if (!adminDemo && user) {
        const payload = {
          user_id: user.id,
          step_number: 1,
          image_url: croppedPath,
          original_image_url: originalPath,
        }

        const { error: dbError } = await supabase.from('uploads').insert([payload])

        if (dbError) {
          console.error('⚠️ DB insert error (step1):', dbError.message)
          setUploadMessage(`✅ Files saved, but DB error: ${dbError.message}`)
          return
        }
      }

      const fullUrl =
        `https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${croppedPath}`
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
    setRawSelectedFile(null)
  }

  const proceedToNextStep = () => {
    router.push('/challenge/step2' + (adminDemo ? '?admin_demo=true' : ''))
  }

  if (loading) return <p>Loading challenge step 1…</p>

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
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
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
    boxShadow: '0 0 0 3px rgba(255, 255, 255, 0.9)',
    outline: '1200px solid rgba(0, 0, 0, 0.22)',
  }

  const hasImage = !!(previewUrl || imageUrl)

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
      {/* ✅ Crop modal (same architecture as Step 3) */}
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

      {/* Video */}
      <div
        style={{
          marginBottom: '2rem',
          width: '100%',
          position: 'relative',
          paddingTop: '56.25%', // 16:9
        }}
      >
        <iframe
          src="https://player.vimeo.com/video/1138763970?badge=0&autopause=0&player_id=0&app_id=58479"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: '2px solid #555',
            borderRadius: '6px',
          }}
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          title="Style 1 Step 1"
        />
      </div>

      {/* Compare */}
      <h3
        style={{
          fontSize: '1.3rem',
          marginBottom: '1rem',
          marginTop: '2rem',
        }}
      >
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
              src="/style_one/step1_reference.jpeg"
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
                src={previewUrl || imageUrl}
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

          {/* ✅ Adjust crop button (same pattern as Step 3) */}
          {!!previewUrl && !adminDemo && !showOptions && (
            <button
              type="button"
              onClick={() => {
                setRawSelectedUrl(previewUrl)
                setRawSelectedName(file?.name || 'photo.jpg')
                setRawSelectedFile(null) // no raw original in this re-crop path
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
      {!showOptions && !adminDemo && (
        <form onSubmit={handleUpload} style={{ marginTop: '2rem' }}>
          <label
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f5f5f5',
              color: '#000',
              borderRadius: '999px',
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

          {/* CAMERA HELP — now directly under the Take Photo control */}
          <section
            style={{
              margin: '1rem auto 0',
              maxWidth: 520,
              textAlign: 'left',
              backgroundColor: '#151515',
              borderRadius: 10,
              padding: '10px 12px',
              border: '1px solid #333',
            }}
          >
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                marginBottom: 6,
                color: '#f5f5f5',
              }}
            >
              If your camera doesn’t appear
            </h3>

            <p
              style={{
                fontSize: '0.85rem',
                lineHeight: 1.4,
                color: '#dddddd',
                marginBottom: 4,
              }}
            >
              When you tap <strong>“Take Photo / Choose Photo”</strong> you
              should see your camera open. If nothing happens, try this:
            </p>

            <ul
              style={{
                margin: '0 0 4px 18px',
                padding: 0,
                fontSize: '0.85rem',
                lineHeight: 1.4,
                color: '#dddddd',
              }}
            >
              <li>
                If you opened this from another app (Instagram, Facebook, some
                email apps), use that app’s menu and choose{' '}
                <strong>“Open in Safari”</strong> or{' '}
                <strong>“Open in Chrome”</strong>.
              </li>
              <li>
                Check your browser permissions — look for a camera icon or
                “Permissions” in the address bar and choose{' '}
                <strong>Allow</strong>.
              </li>
              <li>
                If your camera still doesn’t open, take the photo using your
                normal camera app first, then come back here and try again.
              </li>
            </ul>

            <p style={{ fontSize: '0.8rem', color: '#aaaaaa', margin: 0 }}>
              The camera is only used when you choose to take a photo — never in
              the background.
            </p>
          </section>

          <p
            style={{
              marginTop: '0.75rem',
              fontSize: '1rem',
              color: '#fff',
              lineHeight: '1.4',
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
              borderRadius: '6px',
              border: 'none',
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: '1.1rem',
              fontWeight: '600',
              minWidth: '260px',
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

      {(showOptions || adminDemo) && (
        <div
          style={{
            marginTop: '3rem',
            padding: '1.5rem',
            border: '2px solid #28a745',
            borderRadius: '8px',
            background: 'rgba(40, 167, 69, 0.1)',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              color: '#28a745',
              fontSize: '1.5rem',
              marginBottom: '0.75rem',
              fontWeight: '700',
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
            style={{
              backgroundColor: '#28a745',
              color: '#fff',
              padding: '0.75rem 1.5rem',
              fontSize: '1.1rem',
              border: 'none',
              borderRadius: '6px',
              marginRight: '1rem',
              cursor: 'pointer',
              fontWeight: '600',
              minWidth: '200px',
            }}
          >
            ✅ Yes, This is My Best Work – Continue
          </button>

          {!adminDemo && (
            <button
              onClick={resetUpload}
              style={{
                backgroundColor: '#000',
                color: '#fff',
                padding: '0.75rem 1.5rem',
                fontSize: '1.1rem',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                minWidth: '200px',
              }}
            >
              🔁 No, I’ll Upload a Better Pic
            </button>
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