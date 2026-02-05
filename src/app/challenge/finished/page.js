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

function guessFileName(originalName = 'photo.jpg') {
  const base = originalName.replace(/\.[^/.]+$/, '')
  return `${base}_cropped.jpg`
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

  const [file, setFile] = useState(null)
  const [photoUrl, setPhotoUrl] = useState('')

  const [uploadMessage, setUploadMessage] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Cropper state
  const [isCropOpen, setIsCropOpen] = useState(false)
  const [rawSelectedUrl, setRawSelectedUrl] = useState('')
  const [rawSelectedName, setRawSelectedName] = useState('photo.jpg')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [cropping, setCropping] = useState(false)

  // Guardrails
  const MAX_INPUT_BYTES = 20 * 1024 * 1024 // 20 MB

  const router = useRouter()
  const searchParams = useSearchParams()

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

  // Fetch any existing step-4 uploads (best effort)
  useEffect(() => {
    const fetchFinished = async () => {
      if (!user || adminDemo) return

      const { data, error } = await supabase.from('uploads').select('image_url').eq('user_id', user.id).eq('step_number', 4)

      if (error) {
        console.warn('Error fetching finished uploads:', error.message)
        return
      }

      if (data && data.length > 0) {
        // Prefer finished-mannequin folder if present; otherwise take first
        const best =
          data.find((img) => (img?.image_url || '').includes('finished-mannequin')) ||
          data[0]

        if (best?.image_url) {
          setPhotoUrl(`${STORAGE_PREFIX}${best.image_url}`)
          setShowOptions(true)
        }
      }
    }

    fetchFinished()
  }, [user, adminDemo])

  useEffect(() => {
    return () => {
      if (photoUrl && photoUrl.startsWith('blob:')) URL.revokeObjectURL(photoUrl)
      if (rawSelectedUrl && rawSelectedUrl.startsWith('blob:')) URL.revokeObjectURL(rawSelectedUrl)
    }
  }, [photoUrl, rawSelectedUrl])

  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const openCropperForFile = (fileObj) => {
    if (!fileObj) return

    if (fileObj.size > MAX_INPUT_BYTES) {
      setUploadMessage(`❌ That file is ${formatBytes(fileObj.size)}. Please choose a smaller photo (max ${formatBytes(MAX_INPUT_BYTES)}).`)
      return
    }

    if (rawSelectedUrl && rawSelectedUrl.startsWith('blob:')) URL.revokeObjectURL(rawSelectedUrl)

    const objUrl = URL.createObjectURL(fileObj)
    setRawSelectedUrl(objUrl)
    setRawSelectedName(fileObj.name || 'photo.jpg')
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setIsCropOpen(true)
  }

  const handleSelect = (fileObj) => {
    setUploadMessage('')
    setShowOptions(false)

    if (!fileObj) {
      if (photoUrl && photoUrl.startsWith('blob:')) URL.revokeObjectURL(photoUrl)
      setFile(null)
      setPhotoUrl('')
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
      const croppedFile = new File([blob], guessFileName(rawSelectedName), { type: 'image/jpeg' })
      const preview = URL.createObjectURL(croppedFile)

      if (photoUrl && photoUrl.startsWith('blob:')) URL.revokeObjectURL(photoUrl)

      setFile(croppedFile)
      setPhotoUrl(preview)
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

    if (!file && !adminDemo) {
      setUploadMessage('Please upload your Finished Look photo to continue.')
      return
    }

    try {
      setUploading(true)
      setUploadMessage('Uploading…')

      const userId = user?.id || 'demo-user'

      if (file) {
        // Keep storage folder naming stable (do NOT change path conventions)
        const filePath = makeUploadPath(userId, 'finished-mannequin', file)
        const { error: upErr } = await supabase.storage.from('uploads').upload(filePath, file)

        if (upErr) {
          setUploadMessage(`❌ Upload failed: ${upErr.message}`)
          return
        }

        if (!adminDemo && user?.id) {
          const { error: dbError } = await supabase.from('uploads').insert([
            { user_id: user.id, step_number: 4, image_url: filePath },
          ])
          if (dbError) console.warn('DB insert error:', dbError.message)
        }

        setPhotoUrl(`${STORAGE_PREFIX}${filePath}`)
      }

      setUploadMessage('✅ Finished Look upload complete!')
      setShowOptions(true)
    } catch (err) {
      console.error(err)
      setUploadMessage(`❌ ${err?.message ? String(err.message) : 'Upload failed.'}`)
    } finally {
      setUploading(false)
    }
  }

  const resetUpload = () => {
    if (photoUrl && photoUrl.startsWith('blob:')) URL.revokeObjectURL(photoUrl)
    setFile(null)
    setPhotoUrl('')
    setUploadMessage('')
    setShowOptions(false)
  }

  const proceedToPortfolio = () => {
    router.replace('/challenge/portfolio' + (adminDemo ? '?admin_demo=true' : ''))
  }

  if (loading) return <p>Loading Finished Look…</p>

  // Styles
  const overlayFrame = { position: 'relative', width: '100%', maxWidth: 320, margin: '0 auto' }

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

  const ovalMask = { position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const oval = { width: '88%', height: '78%', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.9)' }

  const hasPhoto = !!photoUrl

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
      {/* Crop modal */}
      {isCropOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: 520, background: '#111', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
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
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '78%', height: '74%', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.9)', boxShadow: '0 0 0 2000px rgba(0,0,0,0.35)' }} />
              </div>
            </div>

            <div style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: '#bbb', minWidth: 44 }}>Zoom</span>
                <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: '70%' }} />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
                <button type="button" onClick={cancelCrop} disabled={cropping} style={{ flex: 1, padding: '0.85rem 1rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: '#000', color: '#fff', fontWeight: 700, cursor: cropping ? 'not-allowed' : 'pointer' }}>
                  Cancel
                </button>
                <button type="button" onClick={confirmCrop} disabled={cropping} style={{ flex: 1.2, padding: '0.85rem 1rem', borderRadius: 10, border: 'none', background: '#28a745', color: '#fff', fontWeight: 800, cursor: cropping ? 'not-allowed' : 'pointer', opacity: cropping ? 0.85 : 1 }}>
                  {cropping ? 'Saving…' : 'Use this crop'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <Image src="/logo.jpeg" alt="Style Challenge Logo" width={240} height={0} style={{ height: 'auto', maxWidth: '100%' }} priority />
      </div>

      <h1 style={{ marginBottom: '0.5rem' }}>Finished Look: Show Off Your Best Work</h1>
      <hr style={{ width: '50%', margin: '0.5rem auto 1rem auto', border: '0.5px solid #666' }} />
      <p style={{ marginBottom: '2rem', fontSize: '1rem', color: '#ddd', lineHeight: '1.5' }}>
        This is your final step! Capture your <strong>very best work</strong>.
        <br />
        A clear photo completes the challenge.
      </p>

      <div style={{ marginBottom: '2rem', width: '100%', aspectRatio: '16 / 9', position: 'relative' }}>
        <iframe
          src="https://player.vimeo.com/video/1096804435?badge=0&autopause=0&player_id=0&app_id=58479&dnt=1"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: '2px solid #555', borderRadius: '6px' }}
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
          allowFullScreen
          title="SC Video 4"
        />
      </div>

      <h3 style={{ fontSize: '1.3rem', marginBottom: '1rem', marginTop: '2rem' }}>Compare Your Finished Look</h3>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p><strong>Patrick’s Finished Version</strong></p>
          <div style={overlayFrame}>
            <img src="/style_one/finished_reference.jpeg" alt="Patrick Finished Reference" style={previewImageStyle} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <p><strong>Your Finished Look Photo</strong></p>
          <div style={overlayFrame}>
            {hasPhoto ? <img src={photoUrl} alt="Your Finished Look" style={previewImageStyle} /> : <div style={placeholderStyle} />}
            <div style={ovalMask}><div style={oval} /></div>
            {!hasPhoto && (
              <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, color: '#fff', fontSize: '0.9rem', textAlign: 'center', opacity: 0.9 }}>
                Hold phone upright — fill the oval
              </div>
            )}
          </div>
        </div>
      </div>

      {!showOptions && (
        <form onSubmit={handleUpload} style={{ marginTop: '2rem' }}>
          <label style={{ display: 'block', padding: '0.75rem 1.5rem', backgroundColor: '#f5f5f5', color: '#000', borderRadius: '999px', border: '2px solid #000', fontSize: '1rem', cursor: 'pointer', textAlign: 'center', marginBottom: '0.75rem', fontWeight: 600 }}>
            📸 Take Photo / Choose Photo (Required)
            <input type="file" accept="image/*" capture="environment" onChange={(e) => handleSelect(e.target.files[0])} style={{ display: 'none' }} />
          </label>

          <p style={{ fontSize: '1rem', color: '#fff', lineHeight: '1.4', textShadow: '0 0 3px rgba(0,0,0,0.5)', marginBottom: '1rem' }}>
            Make sure this image reflects your <strong>best work</strong> before confirming.
          </p>

          <button type="submit" disabled={uploading} style={{ marginTop: '0.5rem', padding: '1rem 2rem', backgroundColor: uploading ? '#1c7e33' : '#28a745', color: '#fff', borderRadius: '6px', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '1.1rem', fontWeight: '600', minWidth: '260px', opacity: uploading ? 0.85 : 1 }}>
            {uploading ? 'Uploading…' : '✅ Confirm & Add to Portfolio'}
          </button>

          {uploadMessage && <p style={{ marginTop: 8 }}>{uploadMessage}</p>}
        </form>
      )}

      {(showOptions || adminDemo) && (
        <div style={{ marginTop: '3rem', padding: '1.5rem', border: '2px solid #28a745', borderRadius: '8px', background: 'rgba(40, 167, 69, 0.1)', textAlign: 'center' }}>
          <h2 style={{ color: '#28a745', fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: '700' }}>🎉 Finished Look Complete!</h2>
          <p style={{ fontSize: '1.1rem', color: '#fff', lineHeight: '1.5', textShadow: '0 0 3px rgba(0,0,0,0.5)', marginBottom: '1rem' }}>
            Does this final look represent your <strong>best work</strong>? If yes, you’re ready to view your portfolio.
          </p>

          <button onClick={proceedToPortfolio} style={{ backgroundColor: '#28a745', color: '#fff', padding: '0.75rem 1.5rem', fontSize: '1.1rem', border: 'none', borderRadius: '6px', marginRight: '1rem', cursor: 'pointer', fontWeight: '600', minWidth: '200px' }}>
            ✅ Yes, Add to Portfolio
          </button>

          {!adminDemo && (
            <button onClick={resetUpload} style={{ backgroundColor: '#000', color: '#fff', padding: '0.75rem 1.5rem', fontSize: '1.1rem', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', minWidth: '200px' }}>
              🔁 No, I’ll Upload a Better Pic
            </button>
          )}
        </div>
      )}
    </main>
  )
}

export default function FinishedLookPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem', color: '#ccc', textAlign: 'center' }}>Loading…</main>}>
      <FinishedLookInner />
    </Suspense>
  )
}