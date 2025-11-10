'use client'
/* eslint-disable react/no-unescaped-characters, @next/next/no-img-element */

import { useEffect, useState, Suspense } from 'react'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'
import { makeUploadPath } from '../../../lib/uploadPath'
import { useRouter, useSearchParams } from 'next/navigation'

const STORAGE_PREFIX =
  'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'

function ChallengeStep1Page() {
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

  // Load session / admin demo flag
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

  // Load most recent Step 1 image (for returning stylists)
  useEffect(() => {
    if (!user || adminDemo) return

    const loadExisting = async () => {
      const { data, error } = await supabase
        .from('uploads')
        .select('image_url, created_at')
        .eq('user_id', user.id)
        .eq('step_number', 1)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) {
        console.warn('Error loading existing Step 1 image:', error.message)
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

  // Revoke previous object URL to avoid memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (uploading) return

    // Demo: allow continue without an upload
    if (adminDemo && !file) {
      setUploadMessage('✅ Demo mode: skipping upload.')
      setShowOptions(true)
      return
    }

    if (!file || !user) {
      setUploadMessage('Please select a photo first.')
      return
    }

    try {
      setUploading(true)
      setUploadMessage('Uploading…')

      const filePath = makeUploadPath(user.id, 'step1', file)

      // Upload to Storage
      const { data, error } = await supabase.storage
        .from('uploads')
        .upload(filePath, file)

      if (error) {
        console.error('❌ Storage upload failed (step1):', error.message)
        setUploadMessage(`❌ Upload failed: ${error.message}`)
        return
      }

      const path = data?.path || filePath

      // Insert DB row (non-demo only)
      if (!adminDemo && user) {
        const { error: dbError } = await supabase
          .from('uploads')
          .insert([{ user_id: user.id, step_number: 1, image_url: path }])

        if (dbError) {
          console.error('⚠️ DB insert error (step1):', dbError.message)
          setUploadMessage(`✅ File saved, but DB error: ${dbError.message}`)
          return
        }
      }

      const fullUrl = `${STORAGE_PREFIX}${path}`
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
    router.push('/challenge/step2' + (adminDemo ? '?admin_demo=true' : ''))
  }

  if (loading) return <p>Loading challenge step 1…</p>

  // --- oval overlay styles ---
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
    boxShadow: '0 0 0 3px rgba(255,255,255,0.9)',
    outline: '2000px solid rgba(0,0,0,0.45)',
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

      <h1 style={{ marginBottom: '0.5rem' }}>Step 1: Getting Started</h1>
      <hr
        style={{
          width: '50%',
          margin: '0.5rem auto 1rem auto',
          border: '0.5px solid #666',
        }}
      />

      {/* Step-by-step instructions */}
      <p
        style={{
          marginBottom: '0.75rem',
          fontSize: '1rem',
          color: '#ddd',
        }}
      >
        Follow these steps before you take your photo:
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
        <li>Watch Patrick’s demo for Step 1.</li>
        <li>
          Prepare your mannequin or model so the style matches Patrick’s shape
          and balance.
        </li>
        <li>Position the camera so the head and hair fill the oval frame.</li>
      </ol>
      <p
        style={{
          marginBottom: '2rem',
          fontSize: '1rem',
          color: '#ddd',
        }}
      >
        <strong>Important:</strong> Hold your phone{' '}
        <strong>upright (portrait)</strong> and fill the frame with the
        hairstyle — top to bottom — so it looks great in your portfolio.
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
          src="https://player.vimeo.com/video/1096804604?badge=0&autopause=0&player_id=0&app_id=58479&dnt=1"
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
          title="SC Video 1"
        />
      </div>

      {/* Compare Section */}
      <h3
        style={{ fontSize: '1.3rem', marginBottom: '1rem', marginTop: '2rem' }}
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
              alt="Patrick Version Step 1"
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

          <p
            style={{
              marginTop: '0.75rem',
              fontSize: '1rem',
              color: '#fff',
              lineHeight: '1.4',
              textShadow: '0 0 3px rgba(0,0,0,0.5)',
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
              lineHeight: '1.5',
              textShadow: '0 0 3px rgba(0,0,0,0.5)',
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

/** Suspense wrapper required for components that call useSearchParams(). */
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