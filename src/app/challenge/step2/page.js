'use client'

import { useEffect, useState, Suspense } from 'react'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'
import { makeUploadPath } from '../../../lib/uploadPath'
import { useRouter, useSearchParams } from 'next/navigation'

const STORAGE_PREFIX =
  'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'

function ChallengeStep2Inner() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)
  const [uploading, setUploading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()

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
        const fullUrl = path.startsWith('http')
          ? path
          : `${STORAGE_PREFIX}${path}`

        setImageUrl(fullUrl)
        setShowOptions(false)
        setUploadMessage('')
      }
    }

    loadExisting()
  }, [user, adminDemo])

  const handleFileChange = (fileObj) => {
    setFile(fileObj || null)
    setPreviewUrl(fileObj ? URL.createObjectURL(fileObj) : '')
    setUploadMessage('')
  }

  // Revoke previous object URL to avoid leaks
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

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

    // From here on, we know we have a NEW file to upload
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
      const filePath = makeUploadPath(userId, 'step2', file)

      // Upload to Storage
      const { error: storageError } = await supabase.storage
        .from('uploads')
        .upload(filePath, file)

      if (storageError) {
        console.error('❌ Storage upload failed:', storageError.message)
        setUploadMessage(`❌ Upload failed: ${storageError.message}`)
        return
      }

      // Insert row (non-demo only)
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
    margin: '0 auto'
  }

  const previewImageStyle = {
    width: '100%',
    aspectRatio: '3 / 4',
    objectFit: 'cover',
    borderRadius: 12,
    border: '1px solid #ccc',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
    background: '#000',
    display: 'block'
  }

  const ovalMask = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }

  // 🔧 Changed: remove dark outline overlay, use a simple border only
  const oval = {
    width: '88%',
    height: '78%',
    borderRadius: '50%',
    border: '3px solid rgba(255, 255, 255, 0.9)'
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
        backgroundColor: '#000', // lock dark mode
        color: '#fff',
        minHeight: '100vh'
      }}
    >
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
          border: '0.5px solid #666'
        }}
      />

      <p
        style={{
          marginBottom: '0.75rem',
          fontSize: '1rem',
          color: '#ddd'
        }}
      >
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
          lineHeight: 1.5
        }}
      >
        <li>Watch Patrick’s demo for Step 2.</li>
        <li>Check that your shape and balance still match Patrick’s version.</li>
        <li>Position the camera so the head and hair fill the oval frame.</li>
      </ol>
      <p
        style={{
          marginBottom: '2rem',
          fontSize: '1rem',
          color: '#ddd'
        }}
      >
        <strong>Important:</strong> Keep your phone <strong>upright (portrait)</strong>{' '}
        and make sure the Step&nbsp;2 detail is clearly visible inside the oval.
      </p>

      {/* Video */}
      <div
        style={{
          marginBottom: '2rem',
          width: '100%',
          aspectRatio: '16 / 9',
          position: 'relative'
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
            borderRadius: '6px'
          }}
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
          allowFullScreen
          title="SC Video 2"
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
          marginBottom: '2rem'
        }}
      >
        {/* Patrick */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <p>
            <strong>Patrick’s Version</strong>
          </p>
          <div style={overlayFrame}>
            <img
              src="/style_one/step2_reference.jpeg"
              alt="Patrick Version Step 2"
              style={previewImageStyle}
            />
          </div>
        </div>

        {/* Your Version */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <p>
            <strong>Your Version</strong>
          </p>
          <div style={overlayFrame}>
            {hasImage ? (
              <img
                src={previewUrl || imageUrl}
                alt="Your Version Step 2"
                style={previewImageStyle}
              />
            ) : (
              <div
                style={{
                  ...previewImageStyle,
                  // lighter placeholder (matches other steps)
                  background:
                    'radial-gradient(circle at 30% 20%, #777 0, #444 55%, #222 100%)'
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
                  opacity: 0.9
                }}
              >
                Hold phone upright — fill the oval
              </div>
            )}
          </div>

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
              fontWeight: 600
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
              marginBottom: '1rem'
            }}
          >
            Check that the head and hair stay inside the oval and the Step&nbsp;2
            detail is clearly visible.
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
              opacity: uploading ? 0.8 : 1
            }}
          >
            {uploading
              ? 'Uploading…'
              : '✅ Confirm, Add to Portfolio & Move to Step 3'}
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
            textAlign: 'center'
          }}
        >
          <h2
            style={{
              color: '#28a745',
              fontSize: '1.5rem',
              marginBottom: '0.75rem',
              fontWeight: '700'
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
              marginBottom: '1rem'
            }}
          >
            Does this image show your <strong>best work</strong> for Step 2? If
            yes, you’re ready to move on to Step 3.
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
              minWidth: '200px'
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
                minWidth: '200px'
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