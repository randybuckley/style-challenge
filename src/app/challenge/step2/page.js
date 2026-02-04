'use client'

/* eslint-disable react/no-unescaped-characters, @next/next/no-img-element */

import { useEffect, useState, Suspense, useCallback } from 'react'
import Image from 'next/image'
import Cropper from 'react-easy-crop'
import { supabase } from '../../../lib/supabaseClient'
import { makeUploadPath } from '../../../lib/uploadPath'
import { useRouter, useSearchParams } from 'next/navigation'

const STORAGE_PREFIX =
  'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'

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

function ChallengeStep2Inner() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [file, setFile] = useState(null) // cropped file (judging/UI)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)
  const [uploading, setUploading] = useState(false)

  // ✅ Cropper state (from Pro pattern)
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

  // ---- Upload guardrails (match Pro defaults) ----
  const MAX_INPUT_BYTES = 20 * 1024 * 1024 // 20 MB
  const MAX_MARKETING_BYTES = 3 * 1024 * 1024 // 3 MB
  const MARKETING_MAX_LONG_EDGE = 2048
  const MARKETING_QUALITY = 0.9

  // Load session / admin-demo flag
  useEffect(() => {
    const isAdminDemo = searchParams.get('admin_demo') === 'true'
    setAdminDemo(isAdminDemo)

    supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user
      if (!sessionUser && !isAdminDemo) {
        router.push('/')
        return
      }
      setUser(sessionUser || null)
      setLoading(false)
    })
  }, [router, searchParams])

  // Load most recent Step 2 image for this user (if any)
  useEffect(() => {
    if (!user || adminDemo) return

    const loadExisting = async () => {
      const { data, error } = await supabase
        .from('uploads')
        .select('image_url, created_at')
        .eq('user_id', user.id)
        .eq('step_number', 2)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) {
        console.warn('Error loading existing Step 2 image:', error.message)
        return
      }

      const row = data?.[0]
      if (row?.image_url) {
        const path = row.image_url
        const fullUrl = path.startsWith('http') ? path : `${STORAGE_PREFIX}${path}`

        setImageUrl(fullUrl)
        setShowOptions(false)
        setUploadMessage('')
      }
    }

    loadExisting()
  }, [user, adminDemo])

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

      const blob = await getCroppedBlob(rawSelectedUrl, croppedAreaPixels, { quality: 0.92 })

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

  // Revoke object URLs to avoid leaks
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (rawSelectedUrl) URL.revokeObjectURL(rawSelectedUrl)
    }
  }, [previewUrl, rawSelectedUrl])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (uploading) return

    // Demo: allow continue without an upload if an existing image is present
    if (adminDemo && !file && imageUrl) {
      setUploadMessage('✅ Demo mode: using your existing photo.')
      setShowOptions(true)
      return
    }

    // If there is neither a new file nor an existing saved image, block
    if (!file && !imageUrl) {
      setUploadMessage('Please select a file first.')
      return
    }

    // If no new file but we already have an existing image, just confirm
    if (!file && imageUrl) {
      setUploadMessage('✅ Using your existing photo for Step 2.')
      setShowOptions(true)
      return
    }

    // From here on, we know we have a NEW cropped file to upload
    if (!user && !adminDemo) {
      setUploadMessage('There was a problem with your session. Please sign in again.')
      return
    }

    try {
      setUploading(true)
      setUploadMessage('Uploading…')

      const userId = user?.id || 'demo-user'

      // 1) Upload "marketing original" (downsized) based on the raw selected file
      // Starter schema doesn't store original_image_url, so we save it to Storage only.
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
          return
        }

        const originalFile = new File([originalBlob], guessOriginalName(rawSelectedName), {
          type: 'image/jpeg',
        })

        const originalPath = makeUploadPath(userId, 'originals/step2', originalFile)

        const { error: origErr } = await supabase.storage.from('uploads').upload(originalPath, originalFile)
        if (origErr) {
          console.error('❌ Storage upload failed (original step2):', origErr.message)
          setUploadMessage('❌ Upload failed (original): ' + origErr.message)
          return
        }
      }

      // 2) Upload cropped/judging image (existing starter behaviour)
      const filePath = makeUploadPath(userId, 'step2', file)

      const { error: storageError } = await supabase.storage.from('uploads').upload(filePath, file)

      if (storageError) {
        console.error('❌ Storage upload failed:', storageError.message)
        setUploadMessage(`❌ Upload failed: ${storageError.message}`)
        return
      }

      // 3) Insert row (non-demo only) — keep starter schema unchanged
      if (!adminDemo && user) {
        const { error: dbError } = await supabase
          .from('uploads')
          .insert([{ user_id: user.id, step_number: 2, image_url: filePath }])

        if (dbError) {
          console.error('⚠️ DB insert error:', dbError.message)
          setUploadMessage(`✅ File saved, but DB error: ${dbError.message}`)
          return
        }
      }

      const fullUrl = `${STORAGE_PREFIX}${filePath}`
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
    router.push('/challenge/step3' + (adminDemo ? '?admin_demo=true' : ''))
  }

  if (loading) return <p>Loading challenge step 2…</p>

  // ---- shared “Your Version” frame styles (aligned with other steps) ----
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
                  type="button"
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
                  type="button"
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

      <h1 style={{ marginBottom: '0.5rem' }}>Step 2: Continue the Style</h1>
      <hr
        style={{
          width: '50%',
          margin: '0.5rem auto 1rem auto',
          border: '0.5px solid #666',
        }}
      />

      <p style={{ marginBottom: '0.75rem', fontSize: '1rem', color: '#ddd' }}>
        Before you take your Step&nbsp;2 photo:
      </p>

      <ol
        style={{
          margin: '0 0 1.5rem',
          paddingLeft: '1.2rem',
          textAlign: 'left',
          color: '#ddd',
          fontSize: '0.95rem',
          maxWidth: 520,
          marginInline: 'auto',
          lineHeight: 1.5,
        }}
      >
        <li>Watch Patrick’s demo for Step 2.</li>
        <li>Check that your shape and balance still match Patrick’s version.</li>
        <li>Position the camera so the head and hair fill the oval frame.</li>
      </ol>

      <p style={{ marginBottom: '2rem', fontSize: '1rem', color: '#ddd' }}>
        <strong>Important:</strong> Keep your phone <strong>upright (portrait)</strong> and make sure the Step&nbsp;2
        detail is clearly visible inside the oval.
      </p>

      {/* Video */}
      <div
        style={{
          marginBottom: '2rem',
          width: '100%',
          aspectRatio: '16 / 9',
          position: 'relative',
        }}
      >
        <iframe
          src="https://player.vimeo.com/video/1096804527?badge=0&autopause=0&player_id=0&app_id=58479&dnt=1"
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
          allowFullScreen
          title="SC Video 2"
        />
      </div>

      {/* Compare section */}
      <h3 style={{ fontSize: '1.3rem', marginBottom: '1rem', marginTop: '2rem' }}>Compare Your Work</h3>

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
        {/* Patrick */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <p>
            <strong>Patrick’s Version</strong>
          </p>
          <div style={overlayFrame}>
            <img src="/style_one/step2_reference.jpeg" alt="Patrick Version Step 2" style={previewImageStyle} />
          </div>
        </div>

        {/* Your Version */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <p>
            <strong>Your Version</strong>
          </p>

          <div style={overlayFrame}>
            {hasImage ? (
              <img src={previewUrl || imageUrl} alt="Your Version Step 2" style={previewImageStyle} />
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

          {!!previewUrl && !adminDemo && !showOptions && (
            <button
              type="button"
              onClick={() => {
                // Re-crop the *cropped preview* only (no raw/original available on this path)
                setRawSelectedUrl(previewUrl)
                setRawSelectedName(file?.name || 'photo.jpg')
                setRawSelectedFile(null)
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

      {/* Upload controls */}
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

          <p
            style={{
              marginTop: '0.75rem',
              fontSize: '1rem',
              color: '#fff',
              lineHeight: '1.4',
              textShadow: '0 0 3px rgba(0, 0, 0, 0.5)',
              marginBottom: '1rem',
            }}
          >
            Check that the head and hair stay inside the oval and the Step&nbsp;2 detail is clearly visible.
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
            {uploading ? 'Uploading…' : '✅ Confirm, Add to Portfolio & Move to Step 3'}
          </button>
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
            🎉 Step 2 looks great!
          </h2>

          <p
            style={{
              fontSize: '1.1rem',
              color: '#fff',
              lineHeight: '1.5',
              textShadow: '0 0 3px rgba(0, 0, 0, 0.5)',
              marginBottom: '1rem',
            }}
          >
            Does this image show your <strong>best work</strong> for Step 2? If yes, you’re ready to move on to Step 3.
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

// Suspense wrapper as before
export default function ChallengeStep2Page() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: '2rem', color: '#ccc', textAlign: 'center' }}>
          Loading…
        </main>
      }
    >
      <ChallengeStep2Inner />
    </Suspense>
  )
}