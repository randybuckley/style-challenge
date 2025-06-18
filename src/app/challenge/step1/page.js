'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'

export default function ChallengeStep1Page() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState(null)
  const [uploadMessage, setUploadMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [adminDemo, setAdminDemo] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    console.log('⏳ Loading Step 1 page...')
    setAdminDemo(searchParams.get('admin_demo') === 'true')

    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user
      if (!sessionUser) {
        router.push('/')
        return
      }

      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('has_paid, is_subscriber')
        .eq('id', sessionUser.id)
        .single()

      console.log('👤 Session user:', sessionUser)
      console.log('📄 User row:', userRow)

      const canAccess = userRow?.has_paid || userRow?.is_subscriber

      if (!canAccess && !adminDemo) {
        router.push('/pay')
        return
      }

      setUser(sessionUser)
      setLoading(false)
    })
  }, [router, searchParams])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file || !user) {
      setUploadMessage('Please select a file.')
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
    setImageUrl('')
    setUploadMessage('')
    setShowOptions(false)
  }

  const proceedToNextStep = () => {
    router.push('/challenge/step2' + (adminDemo ? '?admin_demo=true' : ''))
  }

  if (loading) return <p>Loading challenge step 1...</p>

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Step 1: Getting Started</h1>
      <p>Watch Patrick’s demo and upload your first image when ready.</p>

      <div style={{ margin: '1rem 0' }}>
        <iframe
          src="https://player.vimeo.com/video/76979871"
          width="100%"
          height="315"
          frameBorder="0"
          allow="fullscreen; picture-in-picture"
          allowFullScreen
          title="Tutorial Step 1"
        ></iframe>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>Compare Your Work</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <p><strong>Patrick's Reference</strong></p>
            <img
              src="/placeholder_image.jpeg"
              alt="Patrick Reference Step 1"
              style={{ width: '100%', border: '1px solid #ccc' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <p><strong>Your Upload</strong></p>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Your Upload"
                style={{ width: '100%', border: '1px solid #ccc' }}
              />
            ) : (
              <p>No image uploaded yet.</p>
            )}
          </div>
        </div>
      </div>

      {!showOptions && !adminDemo && (
        <form onSubmit={handleUpload} style={{ marginTop: '2rem' }}>
          <label>
            Upload your result for Step 1:<br />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => setFile(e.target.files[0])}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
          <br />
          <button type="submit" style={{ marginTop: '1rem' }}>Upload</button>
          {uploadMessage && <p>{uploadMessage}</p>}
        </form>
      )}

      {(showOptions || adminDemo) && (
        <div style={{ marginTop: '2rem' }}>
          <p>Are you happy with your result?</p>
          <button onClick={proceedToNextStep} style={{ marginRight: '1rem' }}>✅ Yes, continue to Step 2</button>
          {!adminDemo && <button onClick={resetUpload}>🔁 No, upload another</button>}
        </div>
      )}
    </main>
  )
}