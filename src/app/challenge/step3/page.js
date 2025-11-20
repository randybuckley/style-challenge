'use client'

import { useEffect, useState, Suspense } from 'react'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'
import { makeUploadPath } from '../../../lib/uploadPath'
import { useRouter, useSearchParams } from 'next/navigation'

const STORAGE_PREFIX =
  'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'

function ChallengeStep3Inner() {
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

  // Revoke previous object URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

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
      const filePath = makeUploadPath(userId, 'step3', file)

      if (file) {
        const { error: storageError } = await supabase.storage
          .from('uploads')
          .upload(filePath, file)

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

  // 🔧 Changed: remove huge outline overlay, use a simple border like Finished page
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
            Your photo preview is shown above. Compare carefully with Patrick’s
            version and only confirm if this image shows your{' '}
            <strong>best work</strong>.
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
              : '✅ Confirm, Add to Portfolio & Go to Finished Look'}
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
            Does this final step show your <strong>best work</strong>? If yes,
            you’re ready to finish strong with the Completed Look.
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