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

  const toDataURL = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'Anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      }
      img.onerror = () => reject(new Error('Could not load image'))
      img.src = url
    })

  const downloadPDF = async () => {
    const html2pdf = (await import('html2pdf.js')).default
    if (!portfolioRef.current) return

    const imgElements = portfolioRef.current.querySelectorAll('img')

    await Promise.all(
      Array.from(imgElements).map(async (img) => {
        const dataUrl = await toDataURL(img.src)
        img.setAttribute('src', dataUrl)
      })
    )

    html2pdf()
      .from(portfolioRef.current)
      .set({
        margin: 0.5,
        filename: 'my-portfolio.pdf',
        image: { type: 'jpeg', quality: 0.9 },
        html2canvas: {
          scale: 2,
          backgroundColor: '#ffffff',
          allowTaint: true,
          useCORS: true,
        },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
      })
      .save()
  }

  if (!user) return <p>Loading portfolio...</p>

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: 800, margin: '0 auto', backgroundColor: '#fff' }}>
      <h1 style={{ color: '#000' }}>📸 Your Styling Portfolio</h1>
      <p style={{ color: '#000' }}>
        Here’s your full styling journey. You can download a PDF or submit it to Patrick.
      </p>

      <div ref={portfolioRef} style={{ backgroundColor: '#fff', padding: '1rem', border: '1px solid #ddd', color: '#000' }}>
        {/* Thumbnails for Steps 1–3 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          {[1, 2, 3].map((step) => (
            <div key={step} style={{ width: '30%', textAlign: 'center' }}>
              <h4 style={{ marginBottom: '0.5rem', color: '#000' }}>Step {step}</h4>
              {images[step] ? (
                <img
                  src={images[step]}
                  alt={`Step ${step}`}
                  crossOrigin="anonymous"
                  style={{ width: '100%', height: 'auto', border: '1px solid #ccc' }}
                />
              ) : (
                <p style={{ color: '#000' }}>Image not uploaded</p>
              )}
            </div>
          ))}
        </div>

        {/* Full-width Finished Look */}
        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ color: '#000' }}>Finished Look</h3>
          {images[4] ? (
            <img
              src={images[4]}
              alt="Finished Look"
              crossOrigin="anonymous"
              style={{ width: '100%', border: '2px solid #333' }}
            />
          ) : (
            <p style={{ color: '#000' }}>No final image uploaded.</p>
          )}
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
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