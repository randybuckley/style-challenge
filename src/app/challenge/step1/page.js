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

  const router = useRouter()
  const searchParams = useSearchParams()

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
    setFile(fileObj || null)
    setPreviewUrl(fileObj ? URL.createObjectURL(fileObj) : '')
    setUploadMessage('')
  }

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

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
      const filePath = makeUploadPath(userId, 'step1', file)

      const { data, error } = await supabase.storage
        .from('uploads')
        .upload(filePath, file)

      if (error) {
        console.error('❌ Storage upload failed (step1):', error.message)
        setUploadMessage(`❌ Upload failed: ${error.message}`)
        return
      }

      const path = data?.path || filePath

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

      const fullUrl =
        `https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${path}`
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