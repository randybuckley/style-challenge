'use client'
/* eslint-disable react/no-unescaped-characters, @next/next/no-img-element */

import { useEffect, useState, Suspense } from 'react'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'
import { makeUploadPath } from '../../../lib/uploadPath'
import { useRouter, useSearchParams } from 'next/navigation'

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

  // orientation gate
  const [canUpload, setCanUpload] = useState(true)

  const router = useRouter()
  const searchParams = useSearchParams()

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

  const handleFileChange = (fileObj) => {
    if (!fileObj) {
      setFile(null)
      setPreviewUrl('')
      setUploadMessage('')
      setCanUpload(true)
      return
    }

    const objectUrl = URL.createObjectURL(fileObj)

    setFile(fileObj)
    setPreviewUrl(objectUrl)
    setImageUrl('')
    setUploadMessage('Loading photo…')
    setCanUpload(false) // pessimistic until we know

    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height

      if (!w || !h) {
        setUploadMessage(
          'Photo loaded. Make sure the head and hair fill the oval, then confirm when you are happy.'
        )
        setCanUpload(true)
        return
      }

      const ratio = h / w // >1 = taller than wide

      if (ratio < 1.0) {
        // clear landscape
        setUploadMessage(
          'This looks LANDSCAPE. Please retake in PORTRAIT so the head and hair fill the oval.'
        )
        setCanUpload(false)
      } else if (ratio < 1.2) {
        // almost square
        setUploadMessage(
          'This is almost square. Prefer a tall portrait where the head and hair fill most of the oval.'
        )
        setCanUpload(true)
      } else {
        // clearly portrait
        setUploadMessage(
          'Looks good in portrait. Make sure the head and hair fill the oval, then confirm below.'
        )
        setCanUpload(true)
      }
    }
    img.src = objectUrl
  }

  // Revoke previous object URL ONLY on unmount/change
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
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

    if (!canUpload && !adminDemo) {
      setUploadMessage(
        'This photo is in landscape. Please retake in portrait so the head and hair fill the oval.'
      )
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

      const fullUrl = `https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${path}`
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
    setCanUpload(true)
  }

  const proceedToNextStep = () => {
    router.push('/challenge/step2' + (adminDemo ? '?admin_demo=true' : ''))
  }

  if (loading) return <p>Loading challenge step 1…</p>

  const showImg = previewUrl || imageUrl

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
    width: '70%',
    height: '65%',
    borderRadius: '50%',
    boxShadow: '0 0 0 3px rgba(255,255,255,0.9)',
    outline: '2000px solid rgba(0,0,0,0.45)',
  }

  const hintText = {
    marginTop: 8,
    fontSize: '0.9rem',
    color: '#ffeb99',
    textShadow: '0 0 3px rgba(0,0,0,0.7)',
  }

  const warnText = {
    marginTop: 8,
    fontSize: '0.9rem',
    color: canUpload ? '#c8f7c5' : '#ffb3b3',
    textShadow: '0 0 3px rgba(0,0,0,0.7)',
  }

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
      <p
        style={{
          marginBottom: '2rem',
          fontSize: '1rem',
          color: '#ddd',
        }}
      >
        Watch Patrick’s demo and upload your first image when ready.
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
          <p><strong>Patrick’s Version</strong></p>
          <img
            src="/step1_reference.jpeg"
            alt="Patrick Version Step 1"
            style={{
              width: '100%',
              border: '1px solid #ccc',
              borderRadius: '6px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p><strong>Your Version</strong></p>

          {showImg ? (
            <div style={overlayFrame}>
              <img
                src={showImg}
                alt="Your Version"
                style={previewImageStyle}
              />
              {/* Portrait guidance oval */}
              <div style={ovalMask}>
                <div style={oval} />
              </div>
            </div>
          ) : (
            <p>No image selected yet.</p>
          )}

          <p style={hintText}>
            Hold your phone in <strong>portrait</strong> and fill the oval with
            the head and hair.
          </p>
          {uploadMessage && <p style={warnText}>{uploadMessage}</p>}
        </div>
      </div>

      {/* Upload Section */}
      {!showOptions && !adminDemo && (
        <form onSubmit={handleUpload} style={{ marginTop: '2rem' }}>
          <label
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#000',
              color: '#fff',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: 'pointer',
              textAlign: 'center',
              marginBottom: '0.75rem',
            }}
          >
            📸 Take Photo / Choose Photo
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
            Your photo preview is shown above.  
            Compare it with Patrick’s version — does it capture the shape, balance, and finish?  
            <br /><br />
            If this photo represents your <strong>best work</strong>, confirm below to add it to your Style Challenge portfolio 
            and move to Step 2.  
            <br /><br />
            Not quite right? Take or choose another photo first.
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
            {uploading ? 'Uploading…' : '✅ Confirm, Add to Portfolio & Move to Step 2'}
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
            Take a moment to reflect:  
            Does this image show your <strong>best work</strong> for Step 1?  
            If yes, you’re ready to continue your Style Challenge journey!
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