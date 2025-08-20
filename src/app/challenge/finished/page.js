'use client'

import { useEffect, useState, Suspense } from 'react'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'
import { makeUploadPath } from '../../../lib/uploadPath'
import { useRouter, useSearchParams } from 'next/navigation'

function FinishedLookInner() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [mannequinFile, setMannequinFile] = useState(null)
  const [modelFile, setModelFile] = useState(null)

  const [mannequinUrl, setMannequinUrl] = useState('')
  const [modelUrl, setModelUrl] = useState('')

  const [uploadMessage, setUploadMessage] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)
  const [uploading, setUploading] = useState(false)

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

      const { data, error } = await supabase
        .from('uploads')
        .select('image_url')
        .eq('user_id', user.id)
        .eq('step_number', 4)

      if (error) {
        console.warn('Error fetching finished look uploads:', error.message)
        return
      }

      if (data && data.length > 0) {
        const mannequin = data.find((img) => img.image_url.includes('mannequin'))
        const model = data.find((img) => img.image_url.includes('model'))

        if (mannequin) {
          setMannequinUrl(
            `https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${mannequin.image_url}`
          )
        }
        if (model) {
          setModelUrl(
            `https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${model.image_url}`
          )
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
    }
  }, [mannequinUrl, modelUrl])

  const handleMannequinSelect = (file) => {
    if (mannequinUrl && mannequinUrl.startsWith('blob:')) URL.revokeObjectURL(mannequinUrl)
    if (file) {
      setMannequinFile(file)
      setMannequinUrl(URL.createObjectURL(file))
    } else {
      setMannequinFile(null)
      setMannequinUrl('')
    }
  }

  const handleModelSelect = (file) => {
    if (modelUrl && modelUrl.startsWith('blob:')) URL.revokeObjectURL(modelUrl)
    if (file) {
      setModelFile(file)
      setModelUrl(URL.createObjectURL(file))
    } else {
      setModelFile(null)
      setModelUrl('')
    }
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

      // Mannequin (required outside demo)
      if (mannequinFile) {
        const mannequinPath = makeUploadPath(userId, 'finished-mannequin', mannequinFile)
        const { error: manError } = await supabase.storage
          .from('uploads')
          .upload(mannequinPath, mannequinFile)

        if (manError) {
          setUploadMessage(`❌ Mannequin upload failed: ${manError.message}`)
          return
        }

        if (!adminDemo && user?.id) {
          const { error: dbError } = await supabase
            .from('uploads')
            .insert([{ user_id: user.id, step_number: 4, image_url: mannequinPath, type: 'mannequin' }])
          if (dbError) console.warn('DB insert error:', dbError.message)
        }

        setMannequinUrl(
          `https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${mannequinPath}`
        )
      }

      // Model (optional)
      if (modelFile) {
        const modelPath = makeUploadPath(userId, 'finished-model', modelFile)
        const { error: modelError } = await supabase.storage
          .from('uploads')
          .upload(modelPath, modelFile)

        if (modelError) {
          setUploadMessage(`❌ Model upload failed: ${modelError.message}`)
          return
        }

        if (!adminDemo && user?.id) {
          const { error: dbError } = await supabase
            .from('uploads')
            .insert([{ user_id: user.id, step_number: 4, image_url: modelPath, type: 'model' }])
          if (dbError) console.warn('DB insert error:', dbError.message)
        }

        setModelUrl(
          `https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${modelPath}`
        )
      }

      setUploadMessage('✅ Finished Look upload complete!')
      setShowOptions(true)
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
    setUploadMessage('')
    setShowOptions(false)
  }

  // Replace instead of push to avoid bouncing back here
  const proceedToPortfolio = () => {
    router.replace('/challenge/portfolio' + (adminDemo ? '?admin_demo=true' : ''))
  }

  if (loading) return <p>Loading Finished Look…</p>

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
      <hr style={{ width: '50%', margin: '0.5rem auto 1rem auto', border: '0.5px solid #666' }} />
      <p style={{ marginBottom: '2rem', fontSize: '1rem', color: '#ddd', lineHeight: '1.5' }}>
        This is your final step! Take a moment to capture your <strong>very best work</strong>.
        <br />
        A clear mannequin photo completes the challenge, and an optional in-real-life model photo
        transforms your style into a portfolio piece to impress clients and followers.
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
          <p><strong>Patrick’s Finished Version</strong></p>
          <img
            src="/finished_reference.jpeg"
            alt="Patrick Finished Reference"
            style={{ width: '100%', border: '1px solid #ccc', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p><strong>Your Mannequin Upload</strong></p>
          {mannequinUrl ? (
            <img
              src={mannequinUrl}
              alt="Mannequin Upload"
              style={{ width: '100%', border: '1px solid #ccc', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
            />
          ) : (
            <p>No mannequin uploaded yet.</p>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p><strong>Your Model Upload (Optional)</strong></p>
          {modelUrl ? (
            <img
              src={modelUrl}
              alt="Model Upload"
              style={{ width: '100%', border: '1px solid #ccc', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
            />
          ) : (
            <p>No model uploaded yet.</p>
          )}
        </div>
      </div>

      {!showOptions && (
        <form onSubmit={handleUpload} style={{ marginTop: '2rem' }}>
          <label
            style={{
              display: 'block',
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
            📸 Take Photo / Choose Photo (Mannequin – Required)
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleMannequinSelect(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </label>

          <label
            style={{
              display: 'block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#000',
              color: '#fff',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: 'pointer',
              textAlign: 'center',
              marginBottom: '1rem',
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

          <p style={{ fontSize: '1rem', color: '#fff', lineHeight: '1.5', marginBottom: '1rem' }}>
            💡 Make sure this image reflects your <strong>best work</strong> before confirming.
            A polished upload will make your portfolio shine!
          </p>

          <button
            type="submit"
            disabled={uploading}
            style={{
              display: 'block',
              margin: '0.5rem auto',
              padding: '1rem 2rem',
              backgroundColor: uploading ? '#1c7e33' : '#28a745',
              color: '#fff',
              borderRadius: '6px',
              border: 'none',
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: '1.1rem',
              fontWeight: '600',
              minWidth: '260px',
              opacity: uploading ? 0.85 : 1
            }}
          >
            {uploading ? 'Uploading…' : '✅ Confirm & Add to Portfolio'}
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
          <h2 style={{ color: '#28a745', fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: '700' }}>
            🎉 Finished Look Complete!
          </h2>
          <p style={{ fontSize: '1.1rem', color: '#fff', lineHeight: '1.5', marginBottom: '1rem' }}>
            Does this final look represent your <strong>best work</strong>? If yes, share it proudly in your portfolio!
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

// Suspense wrapper satisfies Next’s requirement for components using useSearchParams()
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