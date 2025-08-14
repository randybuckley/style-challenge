'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'

export default function ChallengeStep1Page() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    setAdminDemo(searchParams.get('admin_demo') === 'true')

    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user
      if (!sessionUser) {
        router.push('/')
        return
      }
      setUser(sessionUser)
      setLoading(false)
    })
  }, [router, searchParams])

  const handleFileChange = (fileObj) => {
    setFile(fileObj)
    if (fileObj) {
      setPreviewUrl(URL.createObjectURL(fileObj))
    } else {
      setPreviewUrl('')
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file || !user) {
      setUploadMessage('Please select a photo first.')
      return
    }

    const filePath = `${user.id}/step1-${Date.now()}-${file.name}`

    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(filePath, file)

    if (error) {
      setUploadMessage(`❌ Upload failed: ${error.message}`)
      return
    }

    const { error: dbError } = await supabase
      .from('uploads')
      .insert([{ user_id: user.id, step_number: 1, image_url: data.path }])

    if (dbError) {
      setUploadMessage(`✅ File saved, but DB error: ${dbError.message}`)
      return
    }

    const fullUrl = `https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${data.path}`
    setImageUrl(fullUrl)
    setUploadMessage('✅ Upload complete!')
    setShowOptions(true)
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

  if (loading) return <p>Loading challenge step 1...</p>

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
          <p><strong>Patrick's Version</strong></p>
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
          {previewUrl || imageUrl ? (
            <img
              src={previewUrl || imageUrl}
              alt="Your Version"
              style={{
                width: '100%',
                border: '1px solid #ccc',
                borderRadius: '6px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
            />
          ) : (
            <p>No image selected yet.</p>
          )}
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
            <br/><br/>
            If this photo represents your <strong>best work</strong>, confirm below to add it to your Style Challenge portfolio 
            and move to Step 2.  
            <br/><br/>
            Not quite right? Take or choose another photo first.
          </p>

          <button
            type="submit"
            style={{
              marginTop: '0.5rem',
              padding: '1rem 2rem',
              backgroundColor: '#28a745',
              color: '#fff',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: '600',
              minWidth: '260px',
            }}
          >
            ✅ Confirm, Add to Portfolio & Move to Step 2
          </button>

          {uploadMessage && <p>{uploadMessage}</p>}
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
            Does this image show your <strong>best work</strong> for Step 1?  
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
              🔁 No, I'll Upload a Better Pic
            </button>
          )}
        </div>
      )}
    </main>
  )
}