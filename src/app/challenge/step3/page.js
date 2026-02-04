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

function ChallengeStep3Inner() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [file, setFile] = useState(null) // cropped file (judging/UI)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)
  const [uploading, setUploading] = useState(false)

  // ✅ Cropper state (same amends as Step2)
  const [isCropOpen, setIsCropOpen] = useState(false)
  const [rawSelectedUrl, setRawSelectedUrl] = useState('') // object URL of the selected photo
  const [rawSelectedName, setRawSelectedName] = useState('photo.jpg')
  const [rawSelectedFile, setRawSelectedFile] = useState(null) // keep the original File object
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [cropping, setCropping] = useState(false)

  // ---- Upload guardrails (match Step2 amends) ----
  const MAX_INPUT_BYTES = 20 * 1024 * 1024 // 20 MB
  const MAX_MARKETING_BYTES = 3 * 1024 * 1024 // 3 MB
  const MARKETING_MAX_LONG_EDGE = 2048
  const MARKETING_QUALITY = 0.9

  const router = useRouter()
  const searchParams = useSearchParams()

  // Session / admin-demo
  useEffect(() => {
    const isAdminDemo = searchParams.get('admin_demo') === 'true'
    setAdminDemo(isAdminDemo)

    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user
      if (!sessionUser && !isAdminDemo) {
        router.push('/')
        return
      }
      setUser(sessionUser || null)
      setLoading(false)
    })
  }, [router, searchParams])

  // Load most recent Step 3 image for this user (if any)
  useEffect(() => {
    if (!user || adminDemo) return

    const loadExisting = async () => {
      const { data, error } = await supabase
        .from('uploads')
        .select('image_url, created_at')
        .eq('user_id', user.id)
        .eq('step_number', 3)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) {
        console.warn('Error loading existing Step 3 image:', error.message)
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

  // Revoke previous object URLs
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (rawSelectedUrl) URL.revokeObjectURL(rawSelectedUrl)
    }
  }, [previewUrl, rawSelectedUrl])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (uploading) return

    // Admin demo behaviour
    if (adminDemo) {
      if (!file && imageUrl) {
        setUploadMessage('✅ Demo mode: using your existing photo.')
        setShowOptions(true)
        return
      }
      if (!file && !imageUrl) {
        setUploadMessage('✅ Demo mode: skipping upload.')
        setShowOptions(true)
        return
      }
    }

    // Normal mode: block if we have no file and no existing image
    if (!file && !imageUrl && !adminDemo) {
      setUploadMessage('Please select a file first.')
      return
    }

    // Normal mode: no new file, but we already have an image -> just confirm
    if (!file && imageUrl && !adminDemo) {
      setUploadMessage('✅ Using your existing photo for Step 3.')
      setShowOptions(true)
      return
    }

    if (!user && !adminDemo) {
      setUploadMessage('There was a problem with your session. Please sign in again.')
      return
    }

    try {
      setUploading(true)
      setUploadMessage('Uploading…')

      const userId = user?.id || 'demo-user'

      // 1) Upload marketing "original" (downsized) based on the raw selected file
      // Starter schema doesn't store original_image_url, so save to Storage only.
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

        const originalPath = makeUploadPath(userId, 'originals/step3', originalFile)

        const { error: origErr } = await supabase.storage.from('uploads').upload(originalPath, originalFile)
        if (origErr) {
          console.error('❌ Storage upload failed (original step3):', origErr.message)
          setUploadMessage('❌ Upload failed (original): ' + origErr.message)
          return
        }
      }

      // 2) Upload cropped/judging image (existing behaviour)
      const filePath = makeUploadPath(userId, 'step3', file)

      if (file) {
        const { error: storageError } = await supabase.storage.from('uploads').upload(filePath, file)

        if (storageError) {
          console.error('❌ Storage upload failed (step3):', storageError.message)
          setUploadMessage(`❌ Upload failed: ${storageError.message}`)
          return
        }
      }

      if (!adminDemo && file && user?.id) {
        const { error: dbError } = await supabase
          .from('uploads')
          .insert([{ user_id: user.id, step_number: 3, image_url: filePath }])

        if (dbError) {
          console.error('⚠️ DB insert error (step3):', dbError.message)
          setUploadMessage(`✅ File saved, but DB error: ${dbError.message}`)
          return
        }
      }

      if (file) {
        const fullUrl = `${STORAGE_PREFIX}${filePath}`
        setImageUrl(fullUrl)
      }

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
    router.push('/challenge/finished' + (adminDemo ? '?admin_demo=true' : ''))
  }

  if (loading) return <p>Loading challenge step 3…</p>

  // Shared frame styles
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
        minHeight: '100vh',
        backgroundColor: '#111',
        color: '#f5f5f5',
        boxSizing: 'border-box',
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

      <h1 style={{ marginBottom: '0.5rem' }}>Step 3: Final Touch</h1>
      <hr
        style={{
          width: '50%',
          margin: '0.5rem auto 1rem auto',
          border: '0.5px solid #666',
        }}
      />
      <p
        style={{
          marginBottom: '2rem',
          fontSize: '1rem',
          color: '#ddd',
        }}
      >
        Watch Patrick’s demo for Step&nbsp;3, then capture your final working image.
      </p>

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
          src="https://player.vimeo.com/video/1138769636?badge=0&autopause=0&player_id=0&app_id=58479"
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
          title="SC style 1 Step 3"
        />
      </div>

      {/* Compare section */}
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
              src="/style_one/step3_reference.jpeg"
              alt="Patrick Version Step 3"
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
                alt="Your Version Step 3"
                style={previewImageStyle}
              />
            ) : (
              <div
                style={{
                  ...previewImageStyle,
                  background:
                    'radial-gradient(circle at 30% 20%, #444 0, #111 60%, #000 100%)',
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
            Your photo preview is shown above. Compare carefully with Patrick’s version and only confirm if this image
            shows your <strong>best work</strong>.
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
            {uploading ? 'Uploading…' : '✅ Confirm, Add to Portfolio & Go to Finished Look'}
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
            🌟 Step 3 Complete!
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
            Does this final step show your <strong>best work</strong>? If yes, you’re ready to finish strong with the
            Completed Look.
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

export default function ChallengeStep3Page() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: '2rem', color: '#ccc', textAlign: 'center' }}>
          Loading…
        </main>
      }
    >
      <ChallengeStep3Inner />
    </Suspense>
  )
}