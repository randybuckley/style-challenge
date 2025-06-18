'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function PortfolioPage() {
  const [user, setUser] = useState(null)
  const [images, setImages] = useState({})
  const router = useRouter()
  const portfolioRef = useRef()

  useEffect(() => {
    const getUserAndImages = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const sessionUser = sessionData.session?.user

      if (!sessionUser) {
        router.push('/')
        return
      }

      setUser(sessionUser)

      const { data, error } = await supabase
        .from('uploads')
        .select('step_number, image_url')
        .eq('user_id', sessionUser.id)

      if (!error && data) {
        const grouped = {}
        data.forEach(({ step_number, image_url }) => {
          grouped[step_number] = `https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${image_url}`
        })
        setImages(grouped)
      }
    }

    getUserAndImages()
  }, [router])

  const downloadPDF = async () => {
    const html2pdf = (await import('html2pdf.js')).default
    if (!portfolioRef.current) return

    html2pdf()
      .from(portfolioRef.current)
      .set({
        margin: 0.5,
        filename: 'my-portfolio.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
      })
      .save()
  }

  if (!user) return <p>Loading portfolio...</p>

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: 800, margin: '0 auto' }}>
      <h1>📸 Your Styling Portfolio</h1>
      <p>Here’s your full styling journey. You can download a PDF or submit it to Patrick.</p>

      <div ref={portfolioRef}>
        {[1, 2, 3].map(step => (
          <div key={step} style={{ marginBottom: '1rem' }}>
            <h3>Step {step}</h3>
            {images[step] ? (
              <img
                src={images[step]}
                alt={`Step ${step}`}
                style={{ maxWidth: '100%', border: '1px solid #ccc' }}
              />
            ) : (
              <p>Image not uploaded</p>
            )}
          </div>
        ))}

        <div style={{ marginBottom: '2rem' }}>
          <h3>Finished Look</h3>
          {images[4] ? (
            <img
              src={images[4]}
              alt="Finished Look"
              style={{ width: '100%', border: '2px solid #333' }}
            />
          ) : (
            <p>No final image uploaded.</p>
          )}
        </div>
      </div>

      <div>
        <button onClick={downloadPDF} style={{ marginRight: '1rem' }}>
          📄 Download Portfolio
        </button>
        <button onClick={() => router.push('/challenge/submission/competition')}>
          🏆 Submit to Competition
        </button>
      </div>
    </main>
  )
}