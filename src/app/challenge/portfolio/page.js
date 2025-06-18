'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function PortfolioPage() {
  const [user, setUser] = useState(null)
  const [images, setImages] = useState({})
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const portfolioRef = useRef(null)

  useEffect(() => {
    const fetchData = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const sessionUser = sessionData?.session?.user

      if (!sessionUser) {
        router.push('/')
        return
      }

      setUser(sessionUser)

      const { data: uploads, error } = await supabase
        .from('uploads')
        .select('step_number, image_url')
        .eq('user_id', sessionUser.id)

      console.log('📸 Raw uploads from Supabase:', uploads)

      if (error) {
        console.error('❌ Error fetching uploads:', error)
        return
      }

      const imageMap = {}
      uploads.forEach(upload => {
        imageMap[upload.step_number] = upload.image_url
      })

      setImages(imageMap)
      setLoading(false)
    }

    fetchData()
  }, [router])

  const handleDownloadPDF = async () => {
    const html2pdf = (await import('html2pdf.js')).default
    const element = portfolioRef.current
    if (!element) return

    const imgElements = element.querySelectorAll('img')
    await Promise.all(
      Array.from(imgElements).map(img => {
        return new Promise(resolve => {
          if (img.complete) resolve()
          else img.onload = img.onerror = resolve
        })
      })
    )

    html2pdf()
      .from(element)
      .set({
        margin: 1,
        filename: 'my-portfolio.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      })
      .save()
  }

  if (loading) return <p style={{ color: '#000' }}>Loading portfolio...</p>

  const renderImage = (label, step) => (
    <div style={{ flex: '1 0 30%', textAlign: 'center' }} key={step}>
      <h4 style={{ color: '#000' }}>{label}</h4>
      {images[step] ? (
        <img
          crossOrigin="anonymous"
          src={`https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${images[step]}`}
          alt={`Step ${step}`}
          style={{ width: '100%', maxWidth: '300px', border: '1px solid #ccc' }}
        />
      ) : (
        <p style={{ color: '#000' }}>Image not uploaded</p>
      )}
    </div>
  )

  return (
    <main style={{ backgroundColor: '#fff', maxWidth: 1000, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif', color: '#000' }}>
      <div ref={portfolioRef}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img
            src="/style_challenge_logo.jpeg"
            alt="Style Challenge Logo"
            style={{ maxWidth: '200px', marginBottom: '1rem' }}
            crossOrigin="anonymous"
          />
          <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#000' }}>
            📸 Your Styling Portfolio
          </h2>
          <p style={{ fontSize: '1rem', color: '#000' }}>
            Here's your full styling journey. You can download a PDF or submit it to Patrick.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {[1, 2, 3].map(step => renderImage(`Step ${step}`, step))}
        </div>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <h3 style={{ color: '#000' }}>Finished Look</h3>
          {images[4] ? (
            <img
              crossOrigin="anonymous"
              src={`https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${images[4]}`}
              alt="Finished Look"
              style={{ width: '100%', maxWidth: '500px', border: '1px solid #ccc' }}
            />
          ) : (
            <p style={{ color: '#000' }}>No final image uploaded.</p>
          )}
        </div>
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button onClick={handleDownloadPDF} style={{ marginRight: '1rem' }}>
          📥 Download your portfolio
        </button>
        <button onClick={() => router.push('/challenge/certification')}>
          ✅ Submit for Certification
        </button>
        <p style={{ marginTop: '1rem', fontSize: '0.95rem', color: '#000' }}>
          Once submitted, Patrick will review your work. Excellent portfolios will be shared on Patrick’s socials and entered into the Style Challenge competition.
        </p>
      </div>
    </main>
  )
}