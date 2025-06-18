'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'

export default function ChallengeStep2Page() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState(null)
  const [uploadMessage, setUploadMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()

  const isAdminDemo = searchParams?.get('admin_demo') === 'true'

  useEffect(() => {
    const getSessionAndUser = async () => {
      console.log('🌀 Loading Step 2...')
      const { data: sessionData } = await supabase.auth.getSession()
      console.log('📦 Session result: ', sessionData)
      const sessionUser = sessionData.session?.user

      if (!sessionUser && !isAdminDemo) {
        router.push('/')
        return
      }

      if (isAdminDemo) {
        setUser({ id: 'admin', email: 'demo@admin.com', has_paid: true })
        setLoading(false)
        return
      }

      console.log('👤 Session user: ', sessionUser)

      let { data: userRow, error: userError } = await supabase
        .from('users')
        .select('has_paid, is_subscriber')
        .eq('id', sessionUser.id)
        .single()

      console.log('📄 User row:', userRow)
      console.log('🐞 User error:', userError)

      if (!userRow && !userError) {
        const { error: insertError } = await supabase
          .from('users')
          .insert([{ id: sessionUser.id, email: sessionUser.email }])

        if (insertError) {
          console.error('❌ Failed to insert user row:', insertError)
          setUploadMessage('❌ Could not create user profile.')
          return
        }

        const { data: newUserRow } = await supabase
          .from('users')
          .select('has_paid, is_subscriber')
          .eq('id', sessionUser.id)
          .single()

        userRow = newUserRow
      }

      if (!userRow) {
        setUploadMessage('❌ Could not load user access status.')
        return
      }

      const canAccess = userRow.has_paid || userRow.is_subscriber

      if (!canAccess) {
        router.push('/pay')
        return
      }

      setUser({ ...sessionUser, ...userRow })
      setLoading(false)
    }

    getSessionAndUser()
  }, [router, searchParams])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file || !user) {
      setUploadMessage('Please select a file.')
      return
    }

    const filePath = `${user.id}/step2-${Date.now()}-${file.name}`

    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(filePath, file)

    if (error) {
      setUploadMessage(`❌ Upload failed: ${error.message}`)
      return
    }

    const { error: dbError } = await supabase
      .from('uploads')
      .insert([{ user_id: user.id, step_number: 2, image_url: data.path }])

    if (dbError) {
      setUploadMessage(`✅ File saved, but failed to write to database: ${dbError.message}`)
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
    router.push('/challenge/step3')
  }

  if (loading) return <p>Loading Step 2...</p>

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Step 2: Style Progression</h1>
      <p>Watch Patrick’s demo and upload your second image when ready.</p>

      <div style={{ margin: '1rem 0' }}>
        <iframe
          src="https://player.vimeo.com/video/76979871"
          width="100%"
          height="315"
          frameBorder="0"
          allow="fullscreen; picture-in-picture"
          allowFullScreen
          title="Tutorial Step 2"
        ></iframe>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>Compare Your Work</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <p><strong>Patrick's Reference</strong></p>
            <img
              src="/placeholder_image.jpeg"
              alt="Reference Step 2"
              style={{ width: '100%', border: '1px solid #ccc' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <p><strong>Your Upload</strong></p>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Uploaded result"
                style={{ width: '100%', border: '1px solid #ccc' }}
              />
            ) : (
              <p style={{ fontStyle: 'italic' }}>Upload an image to compare</p>
            )}
          </div>
        </div>
      </div>

      {!showOptions && !isAdminDemo && (
        <form onSubmit={handleUpload} style={{ marginTop: '2rem' }}>
          <label>
            Upload your result for Step 2:<br />
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

      {(showOptions || isAdminDemo) && (
        <div style={{ marginTop: '2rem' }}>
          <p>Are you happy with your result?</p>
          <button onClick={proceedToNextStep} style={{ marginRight: '1rem' }}>✅ Yes, continue</button>
          {!isAdminDemo && <button onClick={resetUpload}>🔁 No, upload another</button>}
        </div>
      )}
    </main>
  )
}