'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'

export default function FinishedLookPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mannequinFile, setMannequinFile] = useState(null)
  const [modelFile, setModelFile] = useState(null)
  const [mannequinUrl, setMannequinUrl] = useState('')
  const [modelUrl, setModelUrl] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)

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
      setUser(sessionUser)
      setLoading(false)
    })
  }, [router, searchParams])

  const handleMannequinSelect = (file) => {
    if (file) {
      setMannequinFile(file)
      setMannequinUrl(URL.createObjectURL(file))
    }
  }

  const handleModelSelect = (file) => {
    if (file) {
      setModelFile(file)
      setModelUrl(URL.createObjectURL(file))
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!mannequinFile && !adminDemo) {
      setUploadMessage('Please upload a mannequin photo to finish.')
      return
    }

    const userId = user?.id || 'demo-user'

    // ✅ Upload mannequin (required)
    if (mannequinFile) {
      const mannequinPath = `${userId}/finished-mannequin-${Date.now()}-${mannequinFile.name}`

      const { error: manError } = await supabase.storage
        .from('uploads')
        .upload(mannequinPath, mannequinFile)

      if (manError) return setUploadMessage(`❌ Mannequin upload failed: ${manError.message}`)

      if (!adminDemo) {
        const { error: dbError } = await supabase
          .from('uploads')
          .insert([{ user_id: user.id, step_number: 4, image_url: mannequinPath }])
        if (dbError) console.warn('DB insert error:', dbError.message)
      }

      setMannequinUrl(`https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${mannequinPath}`)
    }

    // ✅ Upload model (optional)
    if (modelFile) {
      const modelPath = `${userId}/finished-model-${Date.now()}-${modelFile.name}`

      const { error: modelError } = await supabase.storage
        .from('uploads')
        .upload(modelPath, modelFile)

      if (modelError) return setUploadMessage(`❌ Model upload failed: ${modelError.message}`)

      if (!adminDemo) {
        const { error: dbError } = await supabase
          .from('uploads')
          .insert([{ user_id: user.id, step_number: 4, image_url: modelPath }])
        if (dbError) console.warn('DB insert error:', dbError.message)
      }

      setModelUrl(`https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${modelPath}`)
    }

    setUploadMessage('✅ Finished Look upload complete!')
    setShowOptions(true)
  }

  const resetUpload = () => {
    setMannequinFile(null)
    setModelFile(null)
    setMannequinUrl('')
    setModelUrl('')
    setUploadMessage('')
    setShowOptions(false)
  }

  const proceedToPortfolio = () => {
    router.push('/challenge/portfolio' + (adminDemo ? '?admin_demo=true' : ''))
  }

  if (loading) return <p>Loading Finished Look...</p>

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Image src="/logo.jpeg" alt="Style Challenge Logo" width={240} height={0} style={{ height: 'auto', maxWidth: '100%' }} priority />
      </div>

      <h1 style={{ marginBottom: '0.5rem' }}>Finished Look: Show Off Your Best Work</h1>
      <hr style={{ width: '50%', margin: '0.5rem auto 1rem auto', border: '0.5px solid #666' }} />
      <p style={{ marginBottom: '2rem', fontSize: '1rem', color: '#ddd', lineHeight: '1.5' }}>
        This is your final step! Take a moment to capture your <strong>very best work</strong>.  
        A clear mannequin photo completes the challenge, and an optional in‑real‑life model photo  
        transforms your style into a portfolio piece to impress clients and followers.
      </p>

      {/* Compare */}
      <h3 style={{ fontSize: '1.3rem', marginBottom: '1rem', marginTop: '2rem' }}>Compare Your Work</h3>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p><strong>Patrick's Finished Version</strong></p>
          <img src="/finished_reference.jpeg" alt="Patrick Finished Reference" style={{ width: '100%', border: '1px solid #ccc', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p><strong>Your Mannequin Upload</strong></p>
          {mannequinUrl ? (
            <img src={mannequinUrl} alt="Mannequin Upload" style={{ width: '100%', border: '1px solid #ccc', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }} />
          ) : (
            <p>No mannequin uploaded yet.</p>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p><strong>Your Model Upload (Optional)</strong></p>
          {modelUrl ? (
            <img src={modelUrl} alt="Model Upload" style={{ width: '100%', border: '1px solid #ccc', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }} />
          ) : (
            <p>No model uploaded yet.</p>
          )}
        </div>
      </div>

      {!showOptions && (
        <form onSubmit={handleUpload} style={{ marginTop: '2rem' }}>
          <label style={{ display: 'block', padding: '0.75rem 1.5rem', backgroundColor: '#000', color: '#fff', borderRadius: '4px', fontSize: '1rem', cursor: 'pointer', textAlign: 'center', marginBottom: '0.75rem' }}>
            📸 Take Photo / Choose Photo (Mannequin – Required)
            <input type="file" accept="image/*" capture="environment" onChange={(e) => handleMannequinSelect(e.target.files[0])} style={{ display: 'none' }} />
          </label>

          <label style={{ display: 'block', padding: '0.75rem 1.5rem', backgroundColor: '#000', color: '#fff', borderRadius: '4px', fontSize: '1rem', cursor: 'pointer', textAlign: 'center', marginBottom: '1rem' }}>
            📸 Take Photo / Choose Photo (Optional – In‑Real‑Life Model)
            <input type="file" accept="image/*" capture="environment" onChange={(e) => handleModelSelect(e.target.files[0])} style={{ display: 'none' }} />
          </label>

          <p style={{ fontSize: '1rem', color: '#fff', lineHeight: '1.5', marginBottom: '1rem' }}>
            💡 Make sure this image reflects your <strong>best work</strong> before confirming.  
            A polished upload will make your portfolio shine!
          </p>

          <button type="submit" style={{ display: 'block', margin: '0.5rem auto', padding: '1rem 2rem', backgroundColor: '#28a745', color: '#fff', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: '600', minWidth: '260px' }}>
            ✅ Confirm & Add to Portfolio
          </button>

          {uploadMessage && <p>{uploadMessage}</p>}
        </form>
      )}

      {(showOptions || adminDemo) && (
        <div style={{ marginTop: '3rem', padding: '1.5rem', border: '2px solid #28a745', borderRadius: '8px', background: 'rgba(40, 167, 69, 0.1)', textAlign: 'center' }}>
          <h2 style={{ color: '#28a745', fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: '700' }}>
            🎉 Finished Look Complete!
          </h2>
          <p style={{ fontSize: '1.1rem', color: '#fff', lineHeight: '1.5', marginBottom: '1rem' }}>
            Does this final look represent your <strong>best work</strong>?  
            If yes, share it proudly in your portfolio!
          </p>

          <button onClick={proceedToPortfolio} style={{ backgroundColor: '#28a745', color: '#fff', padding: '0.75rem 1.5rem', fontSize: '1.1rem', border: 'none', borderRadius: '6px', marginRight: '1rem', cursor: 'pointer', fontWeight: '600', minWidth: '200px' }}>
            ✅ Yes, Add to Portfolio
          </button>

          {!adminDemo && (
            <button onClick={resetUpload} style={{ backgroundColor: '#000', color: '#fff', padding: '0.75rem 1.5rem', fontSize: '1.1rem', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', minWidth: '200px' }}>
              🔁 No, I'll Upload a Better Pic
            </button>
          )}
        </div>
      )}
    </main>
  )
}