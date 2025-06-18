'use client'

import { useEffect, useState } from 'react'
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
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const adminMode = searchParams.get('admin_demo') === 'true'
    console.log('🌀 Loading finished look page...')
    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user
      console.log('📦 Session result:', data)
      if (!sessionUser && !adminMode) {
        router.push('/')
        return
      }
      if (adminMode) {
        setUser({ id: 'admin_demo', email: 'admin@example.com', is_admin: true })
        setLoading(false)
        return
      }

      console.log('👤 Session user:', sessionUser)
      const { data: userRow, error } = await supabase
        .from('users')
        .select('has_paid, is_subscriber')
        .eq('id', sessionUser.id)
        .single()

      console.log('📄 User row:', userRow)
      if (error) console.log('🐞 User error:', error)

      if (!userRow || (!userRow.has_paid && !userRow.is_subscriber)) {
        router.push('/pay')
        return
      }

      setUser({ ...sessionUser, ...userRow })
      setLoading(false)
    })
  }, [router, searchParams])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!mannequinFile || !user) {
      setUploadMessage('Please upload at least a mannequin photo to complete.')
      return
    }

    const uploads = []

    const mannequinPath = `${user.id}/finished-mannequin-${Date.now()}-${mannequinFile.name}`
    const { data: mData, error: mError } = await supabase.storage
      .from('uploads')
      .upload(mannequinPath, mannequinFile)

    if (mError) {
      setUploadMessage(`❌ Upload failed: ${mError.message}`)
      return
    }

    uploads.push({
      user_id: user.id,
      step_number: 4,
      image_url: mData.path,
      type: 'mannequin'
    })

    setMannequinUrl(`https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${mData.path}`)

    if (modelFile) {
      const modelPath = `${user.id}/finished-model-${Date.now()}-${modelFile.name}`
      const { data: moData, error: moError } = await supabase.storage
        .from('uploads')
        .upload(modelPath, modelFile)

      if (!moError) {
        uploads.push({
          user_id: user.id,
          step_number: 4,
          image_url: moData.path,
          type: 'model'
        })

        setModelUrl(`https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${moData.path}`)
      }
    }

    const { error: dbError } = await supabase
      .from('uploads')
      .insert(uploads)

    if (dbError) {
      setUploadMessage(`✅ Files saved, but DB failed: ${dbError.message}`)
      return
    }

    setUploadMessage('✅ Upload complete!')
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

  const proceedToSubmit = () => {
    router.push('/challenge/submission/portfolio')
  }

  if (loading) return <p>Loading finished look page...</p>

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Finished Look</h1>
      <p>This final step completes your style. Upload a mannequin photo (required) and optionally a real-life model photo.</p>

      <div style={{ margin: '1rem 0' }}>
        <iframe
          src="https://player.vimeo.com/video/76979871"
          width="100%"
          height="315"
          frameBorder="0"
          allow="fullscreen; picture-in-picture"
          allowFullScreen
          title="Finished Look Tutorial"
        ></iframe>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <div style={{ flex: 1 }}>
          <p><strong>Patrick’s Finished Look</strong></p>
          <img
            src="/placeholder_image.jpeg"
            alt="Patrick's reference"
            style={{ width: '100%', border: '1px solid #ccc' }}
          />
        </div>

        {mannequinUrl && (
          <div style={{ flex: 1 }}>
            <p><strong>Your Mannequin Upload</strong></p>
            <img
              src={mannequinUrl}
              alt="Uploaded mannequin"
              style={{ width: '100%', border: '1px solid #ccc' }}
            />
          </div>
        )}
      </div>

      {!showOptions && (
        <form onSubmit={handleUpload}>
          <label>
            Upload mannequin photo (required):<br />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => setMannequinFile(e.target.files[0])}
              style={{ marginBottom: '1rem' }}
            />
          </label>
          <br />
          <label>
            Upload real model photo (optional):<br />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => setModelFile(e.target.files[0])}
              style={{ marginBottom: '1rem' }}
            />
          </label>
          <br />
          <button type="submit">Upload</button>
          {uploadMessage && <p>{uploadMessage}</p>}
        </form>
      )}

      {showOptions && (
        <div style={{ marginTop: '2rem' }}>
          <p>You're all done! What would you like to do next?</p>
          <button onClick={() => router.push('/challenge/submission/portfolio')} style={{ marginRight: '1rem' }}>
            📁 View in Portfolio
          </button>
          <button onClick={() => router.push('/challenge/submission/competition')}>
            🏆 Submit to Competition
          </button>
        </div>
      )}
    </main>
  )
}