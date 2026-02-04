'use client'

/* eslint-disable react/no-unescaped-characters, @next/next/no-img-element */

import { useEffect, useState, Suspense, useCallback } from 'react'
import Image from 'next/image'
import Cropper from 'react-easy-crop'
import { supabase } from '../../../lib/supabaseClient'
import { makeUploadPath } from '../../../lib/uploadPath'
import { useRouter, useSearchParams } from 'next/navigation'

const STORAGE_PREFIX = 'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'

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

function FinishedLookInner() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [mannequinFile, setMannequinFile] = useState(null) // cropped mannequin (judging/UI)
  const [modelFile, setModelFile] = useState(null) // cropped model (optional, judging/UI)

  const [mannequinUrl, setMannequinUrl] = useState('')
  const [modelUrl, setModelUrl] = useState('')

  // Keep originals for marketing upload (downsized)
  const [mannequinOriginalFile, setMannequinOriginalFile] = useState(null)
  const [mannequinOriginalName, setMannequinOriginalName] = useState('photo.jpg')
  const [modelOriginalFile, setModelOriginalFile] = useState(null)
  const [modelOriginalName, setModelOriginalName] = useState('photo.jpg')

  const [uploadMessage, setUploadMessage] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)
  const [uploading, setUploading] = useState(false)

  // ✅ Cropper state (shared; target decides which file we’re editing)
  const [isCropOpen, setIsCropOpen] = useState(false)
  const [cropTarget, setCropTarget] = useState(null) // 'mannequin' | 'model'
  const [rawSelectedUrl, setRawSelectedUrl] = useState('')
  const [rawSelectedName, setRawSelectedName] = useState('photo.jpg')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [cropping, setCropping] = useState(false)

  // ---- Upload guardrails (match Step2/Step3 amends) ----
  const MAX_INPUT_BYTES = 20 * 1024 * 1024 // 20 MB
  const MAX_MARKETING_BYTES = 3 * 1024 * 1024 // 3 MB
  const MARKETING_MAX_LONG_EDGE = 2048
  const MARKETING_QUALITY = 0.9

  const router = useRouter()
  const searchParams = useSearchParams()

  // Session + admin flag
  useEffect(() => {
    let alive = true
    const isAdminDemo = searchParams.get('admin_demo') === 'true'
    setAdminDemo(isAdminDemo)

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      const sessionUser = data.session?.user
      if (!sessionUser && !isAdminDemo) {
        router.push('/')
        return
      }
      setUser(sessionUser || null)
      setLoading(false)
    })

    return () => {
      alive = false
    }
  }, [router, searchParams])

  // Fetch any existing step-4 uploads
  useEffect(() => {
    const fetchFinishedImages = async () => {
      if (!user || adminDemo) return

      const { data, error } = await supabase.from('uploads').select('image_url').eq('user_id', user.id).eq('step_number', 4)

      if (error) {
        console.warn('Error fetching finished look uploads:', error.message)
        return
      }

      if (data && data.length > 0) {
        const mannequin = data.find((img) => img.image_url.includes('mannequin'))
        const model = data.find((img) => img.image_url.includes('model'))

        if (mannequin) {
          setMannequinUrl(`${STORAGE_PREFIX}${mannequin.image_url}`)
        }
        if (model) {
          setModelUrl(`${STORAGE_PREFIX}${model.image_url}`)
        }

        setShowOptions(true)
      }
    }

    fetchFinishedImages()
  }, [user, adminDemo])

  // Revoke any previous blob URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (mannequinUrl && mannequinUrl.startsWith('blob:')) URL.revokeObjectURL(mannequinUrl)
      if (modelUrl && modelUrl.startsWith('blob:')) URL.revokeObjectURL(modelUrl)
      if (rawSelectedUrl && rawSelectedUrl.startsWith('blob:')) URL.revokeObjectURL(rawSelectedUrl)
    }
  }, [mannequinUrl, modelUrl, rawSelectedUrl])

  // ✅ Crop callbacks
  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const openCropperForFile = (fileObj, target) => {
    if (!fileObj || !target) return

    if (fileObj.size > MAX_INPUT_BYTES) {
      setUploadMessage(
        `❌ That file is ${formatBytes(fileObj.size)}. Please choose a smaller photo (max ${formatBytes(MAX_INPUT_BYTES)}).`
      )
      return
    }

    // Revoke any previous raw URL
    if (rawSelectedUrl && rawSelectedUrl.startsWith('blob:')) URL.revokeObjectURL(rawSelectedUrl)

    const objUrl = URL.createObjectURL(fileObj)
    setCropTarget(target)
    setRawSelectedUrl(objUrl)
    setRawSelectedName(fileObj.name || 'photo.jpg')
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setIsCropOpen(true)

    // Store originals for marketing upload later
    if (target === 'mannequin') {
      setMannequinOriginalFile(fileObj)
      setMannequinOriginalName(fileObj.name || 'photo.jpg')
    } else {
      setModelOriginalFile(fileObj)
      setModelOriginalName(fileObj.name || 'photo.jpg')
    }
  }

  const handleMannequinSelect = (fileObj) => {
    setUploadMessage('')
    setShowOptions(false)
    if (!fileObj) {
      // clear
      if (mannequinUrl && mannequinUrl.startsWith('blob:')) URL.revokeObjectURL(mannequinUrl)
      setMannequinFile(null)
      setMannequinUrl('')
      setMannequinOriginalFile(null)
      setMannequinOriginalName('photo.jpg')
      return
    }
    openCropperForFile(fileObj, 'mannequin')
  }

  const handleModelSelect = (fileObj) => {
    setUploadMessage('')
    setShowOptions(false)
    if (!fileObj) {
      if (modelUrl && modelUrl.startsWith('blob:')) URL.revokeObjectURL(modelUrl)
      setModelFile(null)
      setModelUrl('')
      setModelOriginalFile(null)
      setModelOriginalName('photo.jpg')
      return
    }
    openCropperForFile(fileObj, 'model')
  }

  const confirmCrop = async () => {
    if (!rawSelectedUrl || !croppedAreaPixels || !cropTarget) {
      setIsCropOpen(false)
      return
    }

    try {
      setCropping(true)

      const blob = await getCroppedBlob(rawSelectedUrl, croppedAreaPixels, { quality: 0.92 })
      const croppedFile = new File([blob], guessFileName(rawSelectedName), { type: 'image/jpeg' })
      const preview = URL.createObjectURL(croppedFile)

      if (cropTarget === 'mannequin') {
        if (mannequinUrl && mannequinUrl.startsWith('blob:')) URL.revokeObjectURL(mannequinUrl)
        setMannequinFile(croppedFile)
        setMannequinUrl(preview)
      } else {
        if (modelUrl && modelUrl.startsWith('blob:')) URL.revokeObjectURL(modelUrl)
        setModelFile(croppedFile)
        setModelUrl(preview)
      }

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

  const handleUpload = async (e) => {
    e.preventDefault()
    if (uploading) return

    if (!mannequinFile && !adminDemo) {
      setUploadMessage('Please upload a mannequin photo to finish.')
      return
    }

    try {
      setUploading(true)
      setUploadMessage('Uploading…')

      const userId = user?.id || 'demo-user'

      // --- helper: upload downsized "original" to Storage only (no DB change) ---
      const uploadMarketingOriginal = async (originalFile, originalName, originalsFolder) => {
        if (!originalFile) return

        const tmpUrl = URL.createObjectURL(originalFile)
        try {
          const originalBlob = await getResizedBlob(tmpUrl, {
            maxLongEdge: MARKETING_MAX_LONG_EDGE,
            quality: MARKETING_QUALITY,
          })

          if (originalBlob.size > MAX_MARKETING_BYTES) {
            throw new Error(
              `Your photo is still too large after processing (${formatBytes(originalBlob.size)}). Please choose a different photo.`
            )
          }

          const resizedOriginalFile = new File([originalBlob], guessOriginalName(originalName || 'photo.jpg'), {
            type: 'image/jpeg',
          })

          const originalPath = makeUploadPath(userId, originalsFolder, resizedOriginalFile)

          const { error } = await supabase.storage.from('uploads').upload(originalPath, resizedOriginalFile)
          if (error) throw new Error(error.message)
        } finally {
          URL.revokeObjectURL(tmpUrl)
        }
      }

      // Mannequin (required outside demo)
      if (mannequinFile) {
        // 1) Save marketing original (downsized) to Storage
        await uploadMarketingOriginal(mannequinOriginalFile, mannequinOriginalName, 'originals/finished-mannequin')

        // 2) Upload cropped/judging file
        const mannequinPath = makeUploadPath(userId, 'finished-mannequin', mannequinFile)
        const { error: manError } = await supabase.storage.from('uploads').upload(mannequinPath, mannequinFile)

        if (manError) {
          setUploadMessage(`❌ Mannequin upload failed: ${manError.message}`)
          return
        }

        if (!adminDemo && user?.id) {
          const { error: dbError } = await supabase.from('uploads').insert([
            {
              user_id: user.id,
              step_number: 4,
              image_url: mannequinPath,
              type: 'mannequin',
            },
          ])

          if (dbError) {
            console.warn('DB insert error:', dbError.message)
          }
        }

        setMannequinUrl(`${STORAGE_PREFIX}${mannequinPath}`)
      }

      // Model (optional)
      if (modelFile) {
        // 1) Save marketing original (downsized) to Storage
        await uploadMarketingOriginal(modelOriginalFile, modelOriginalName, 'originals/finished-model')

        // 2) Upload cropped/judging file
        const modelPath = makeUploadPath(userId, 'finished-model', modelFile)
        const { error: modelError } = await supabase.storage.from('uploads').upload(modelPath, modelFile)

        if (modelError) {
          setUploadMessage(`❌ Model upload failed: ${modelError.message}`)
          return
        }

        if (!adminDemo && user?.id) {
          const { error: dbError } = await supabase.from('uploads').insert([
            {
              user_id: user.id,
              step_number: 4,
              image_url: modelPath,
              type: 'model',
            },
          ])

          if (dbError) {
            console.warn('DB insert error:', dbError.message)
          }
        }

        setModelUrl(`${STORAGE_PREFIX}${modelPath}`)
      }

      setUploadMessage('✅ Finished Look upload complete!')
      setShowOptions(true)
    } catch (err) {
      console.error(err)
      const msg = err?.message ? String(err.message) : 'Upload failed.'
      setUploadMessage(`❌ ${msg}`)
    } finally {
      setUploading(false)
    }
  }

  const resetUpload = () => {
    if (mannequinUrl && mannequinUrl.startsWith('blob:')) URL.revokeObjectURL(mannequinUrl)
    if (modelUrl && modelUrl.startsWith('blob:')) URL.revokeObjectURL(modelUrl)

    setMannequinFile(null)
    setModelFile(null)
    setMannequinUrl('')
    setModelUrl('')
    setMannequinOriginalFile(null)
    setMannequinOriginalName('photo.jpg')
    setModelOriginalFile(null)
    setModelOriginalName('photo.jpg')

    setUploadMessage('')
    setShowOptions(false)
  }

  // Replace instead of push to avoid bouncing back here
  const proceedToPortfolio = () => {
    router.replace('/challenge/portfolio' + (adminDemo ? '?admin_demo=true' : ''))
  }

  if (loading) return <p>Loading Finished Look…</p>

  // --- shared frame + oval styles (match Steps 1–3, but WITHOUT global outline) ---
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

  const placeholderStyle = {
    ...previewImageStyle,
    background: 'radial-gradient(circle at 30% 20%, #444 0, #111 60%, #000 100%)',
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
    border: '3px solid rgba(255,255,255,0.9)',
  }

  const hasMannequin = !!mannequinUrl
  const hasModel = !!modelUrl

  return (
    <main
      style={{
        maxWidth: 700,
        margin: '0 auto',
        padding: '2rem',
        fontFamily: 'sans-serif',
        textAlign: 'center',
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
              <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                Adjust your photo {cropTarget === 'model' ? '(Model)' : '(Mannequin)'}
              </div>
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

      <h1 style={{ marginBottom: '0.5rem' }}>Finished Look: Show Off Your Best Work</h1>
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
          lineHeight: '1.5',
        }}
      >
        This is your final step! Capture your <strong>very best work</strong>.
        <br />
        A clear mannequin photo completes the challenge, and an optional in-real-life model photo turns your style into a powerful portfolio image.
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
          src="https://player.vimeo.com/video/1096804435?badge=0&autopause=0&player_id=0&app_id=58479&dnt=1"
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
          title="SC Video 4"
        />
      </div>

      {/* Compare section */}
      <h3 style={{ fontSize: '1.3rem', marginBottom: '1rem', marginTop: '2rem' }}>
        Compare Your Finished Look
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
        {/* Patrick finished (no oval, just the same frame) */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <p>
            <strong>Patrick’s Finished Version</strong>
          </p>
          <div style={overlayFrame}>
            <img
              src="/style_one/finished_reference.jpeg"
              alt="Patrick Finished Reference"
              style={previewImageStyle}
            />
          </div>
        </div>

        {/* Mannequin */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <p>
            <strong>Your Mannequin Photo</strong>
          </p>
          <div style={overlayFrame}>
            {hasMannequin ? <img src={mannequinUrl} alt="Mannequin Upload" style={previewImageStyle} /> : <div style={placeholderStyle} />}

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

          {!!mannequinUrl && mannequinUrl.startsWith('blob:') && !adminDemo && !showOptions && (
            <button
              type="button"
              onClick={() => {
                // Re-crop from the *cropped preview* (no original for this re-crop path)
                if (rawSelectedUrl && rawSelectedUrl.startsWith('blob:')) URL.revokeObjectURL(rawSelectedUrl)
                setCropTarget('mannequin')
                setRawSelectedUrl(mannequinUrl)
                setRawSelectedName(mannequinFile?.name || 'photo.jpg')
                setCrop({ x: 0, y: 0 })
                setZoom(1)
                setCroppedAreaPixels(null)
                setIsCropOpen(true)
              }}
              style={{
                marginTop: 12,
                padding: '0.6rem 1rem',
                borderRadius: 999,
                border: '1px solid rgba(0,0,0,0.15)',
                background: '#f5f5f5',
                color: '#000',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Adjust crop
            </button>
          )}
        </div>

        {/* Model */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <p>
            <strong>Your Model Photo (Optional)</strong>
          </p>
          <div style={overlayFrame}>
            {hasModel ? <img src={modelUrl} alt="Model Upload" style={previewImageStyle} /> : <div style={placeholderStyle} />}

            <div style={ovalMask}>
              <div style={oval} />
            </div>

            {!hasModel && (
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
                Optional — hold phone upright and fill the oval
              </div>
            )}
          </div>

          {!!modelUrl && modelUrl.startsWith('blob:') && !adminDemo && !showOptions && (
            <button
              type="button"
              onClick={() => {
                if (rawSelectedUrl && rawSelectedUrl.startsWith('blob:')) URL.revokeObjectURL(rawSelectedUrl)
                setCropTarget('model')
                setRawSelectedUrl(modelUrl)
                setRawSelectedName(modelFile?.name || 'photo.jpg')
                setCrop({ x: 0, y: 0 })
                setZoom(1)
                setCroppedAreaPixels(null)
                setIsCropOpen(true)
              }}
              style={{
                marginTop: 12,
                padding: '0.6rem 1rem',
                borderRadius: 999,
                border: '1px solid rgba(0,0,0,0.15)',
                background: '#f5f5f5',
                color: '#000',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Adjust crop
            </button>
          )}
        </div>
      </div>

      {/* Upload form */}
      {!showOptions && (
        <form onSubmit={handleUpload} style={{ marginTop: '2rem' }}>
          {/* Mannequin (required) */}
          <label
            style={{
              display: 'block',
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
            📸 Take Photo / Choose Photo (Mannequin – Required)
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleMannequinSelect(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </label>

          {/* Model (optional) */}
          <label
            style={{
              display: 'block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f5f5f5',
              color: '#000',
              borderRadius: '999px',
              border: '2px solid #000',
              fontSize: '1rem',
              cursor: 'pointer',
              textAlign: 'center',
              marginBottom: '1rem',
              fontWeight: 600,
            }}
          >
            📸 Take Photo / Choose Photo (Optional – In-Real-Life Model)
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleModelSelect(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </label>

          <p
            style={{
              fontSize: '1rem',
              color: '#fff',
              lineHeight: '1.4',
              textShadow: '0 0 3px rgba(0,0,0,0.5)',
              marginBottom: '1rem',
            }}
          >
            Make sure these images reflect your <strong>best work</strong> before confirming.
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
              opacity: uploading ? 0.85 : 1,
            }}
          >
            {uploading ? 'Uploading…' : '✅ Confirm & Add to Portfolio'}
          </button>

          {uploadMessage && <p style={{ marginTop: 8 }}>{uploadMessage}</p>}
        </form>
      )}

      {/* After upload */}
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
            🎉 Finished Look Complete!
          </h2>
          <p
            style={{
              fontSize: '1.1rem',
              color: '#fff',
              lineHeight: '1.5',
              textShadow: '0 0 3px rgba(0,0,0,0.5)',
              marginBottom: '1rem',
            }}
          >
            Does this final look represent your <strong>best work</strong>? If yes, you’re ready to view your portfolio.
          </p>

          <button
            onClick={proceedToPortfolio}
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
            ✅ Yes, Add to Portfolio
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

// Suspense wrapper for useSearchParams()
export default function FinishedLookPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: '2rem', color: '#ccc', textAlign: 'center' }}>
          Loading…
        </main>
      }
    >
      <FinishedLookInner />
    </Suspense>
  )
}