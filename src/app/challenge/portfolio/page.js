'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'
import jsPDF from 'jspdf'

export default function PortfolioPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState({})
  const [adminDemo, setAdminDemo] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [secondName, setSecondName] = useState('')
  const [salon, setSalon] = useState('')

  const router = useRouter()
  const searchParams = useSearchParams()

  // ✅ Load portfolio + profile
  useEffect(() => {
    const isAdminDemo = searchParams.get('admin_demo') === 'true'
    setAdminDemo(isAdminDemo)

    const loadData = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      let sessionUser = sessionData?.session?.user || null

      // ✅ fallback to stored session if supabase returns null
      if (!sessionUser) {
        const stored = localStorage.getItem('supabaseSession')
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            sessionUser = parsed.user || null
          } catch {}
        }
      }

      // ✅ store session for next time
      if (sessionUser) {
        localStorage.setItem('supabaseSession', JSON.stringify({ user: sessionUser }))
      }

      if (!sessionUser && !isAdminDemo) {
        router.push('/')
        return
      }
      setUser(sessionUser)

      // 1️⃣ Load uploads
      let uploads = []
      if (isAdminDemo) {
        const { data } = await supabase
          .from('uploads')
          .select('step_number, image_url, inserted_at')
          .like('image_url', '%demo-user%')
          .order('inserted_at', { ascending: true })
        uploads = data || []
      } else if (sessionUser) {
        const { data } = await supabase
          .from('uploads')
          .select('step_number, image_url, inserted_at')
          .eq('user_id', sessionUser.id)
          .order('inserted_at', { ascending: true })
        uploads = data || []

        // 2️⃣ Load profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, second_name, salon_name')
          .eq('id', sessionUser.id)
          .single()

        if (profile) {
          setFirstName(profile.first_name || '')
          setSecondName(profile.second_name || '')
          setSalon(profile.salon_name || '')
        }
      }

      // ✅ Group by step number and ensure correct URL
      const grouped = {}
      uploads
        .filter(u => u.image_url)
        .forEach(u => {
          const fullUrl = u.image_url.startsWith('http')
            ? u.image_url
            : `https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/${u.image_url}`

          if (!grouped[u.step_number]) grouped[u.step_number] = []
          grouped[u.step_number].push(fullUrl)
        })

      setImages(grouped)
      setLoading(false)
    }

    loadData()
  }, [router, searchParams])

  // ✅ Auto-save profile to Supabase
  useEffect(() => {
    if (!user) return
    const debounce = setTimeout(async () => {
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        first_name: firstName,
        second_name: secondName,
        salon_name: salon,
        updated_at: new Date(),
      })
    }, 800)
    return () => clearTimeout(debounce)
  }, [firstName, secondName, salon, user])

  const handleDownloadPDF = () => {
    const doc = new jsPDF('p', 'pt', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()

    // 1️⃣ Logo
    const logo = '/logo.jpeg'
    doc.addImage(logo, 'JPEG', pageWidth / 2 - 120, 30, 240, 0)

    let y = 120
    doc.setFontSize(18)
    doc.text('Style Challenge Portfolio', pageWidth / 2, y, { align: 'center' })
    y += 20

    const displayName = `${firstName || ''} ${secondName || ''}`.trim()
    if (displayName || salon) {
      doc.setFontSize(12)
      doc.text(`${displayName}${salon ? ' – ' + salon : ''}`, pageWidth / 2, y, { align: 'center' })
      y += 20
    }

    // 2️⃣ Steps 1–3 in a row
    const stepImages = [1, 2, 3].map(step => images[step]?.slice(-1)[0] || null)
    let x = 60
    stepImages.forEach((url, idx) => {
      if (url) {
        doc.addImage(url, 'JPEG', x, y, 100, 70)
        doc.setFontSize(10)
        doc.text(`Step ${idx + 1}`, x + 50, y + 85, { align: 'center' })
      } else {
        doc.setFontSize(10)
        doc.text(`Step ${idx + 1} - No upload`, x + 50, y + 35, { align: 'center' })
      }
      x += 150
    })
    y += 120

    // 3️⃣ Finished Look(s)
    const finishedImages = images[4] || []
    if (finishedImages.length) {
      doc.setFontSize(14)
      doc.text('Finished Look', pageWidth / 2, y, { align: 'center' })
      y += 20

      finishedImages.forEach((url, idx) => {
        if (y > 600) {
          doc.addPage()
          y = 60
        }
        const imgWidth = finishedImages.length > 1 ? 180 : 260
        const xPos = pageWidth / 2 - imgWidth / 2
        doc.addImage(url, 'JPEG', xPos, y, imgWidth, 0)
        y += 200
      })
    }

    // 4️⃣ Footer branding
    doc.setFontSize(10)
    doc.text('Created with Patrick Cameron’s Style Challenge', pageWidth / 2, 800, { align: 'center' })

    doc.save('style-challenge-portfolio.pdf')
  }

  if (loading) return <p>Loading your portfolio...</p>

  const stepImages = [1, 2, 3].map(step => images[step] || [])
  const finishedImages = images[4] || []

  return (
    <main
      style={{
        maxWidth: 900,
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

      <h1 style={{ marginBottom: '0.5rem' }}>Your Style Challenge Portfolio</h1>
      <hr style={{ width: '50%', margin: '0.5rem auto 1rem auto', border: '0.5px solid #666' }} />

      <p style={{ marginBottom: '1.5rem', fontSize: '1rem', color: '#fff', lineHeight: '1.5' }}>
        This portfolio captures your progress and final look.  
        Share it with clients or on social media — and download as a PDF for your records!
      </p>

      {/* Name & Salon fields */}
      {user && (
        <div style={{ marginBottom: '2rem' }}>
          <input
            type="text"
            placeholder="First Name"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            style={{
              width: '200px',
              padding: '0.5rem',
              margin: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #555',
              textAlign: 'center',
            }}
          />
          <input
            type="text"
            placeholder="Second Name"
            value={secondName}
            onChange={e => setSecondName(e.target.value)}
            style={{
              width: '200px',
              padding: '0.5rem',
              margin: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #555',
              textAlign: 'center',
            }}
          />
          <input
            type="text"
            placeholder="Salon Name (Optional)"
            value={salon}
            onChange={e => setSalon(e.target.value)}
            style={{
              width: '260px',
              padding: '0.5rem',
              margin: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #555',
              textAlign: 'center',
            }}
          />
        </div>
      )}

      {/* Steps 1-3 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {stepImages.map((urls, idx) => (
          <div key={idx} style={{ width: '30%', minWidth: 200 }}>
            <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>Step {idx + 1}</h3>
            {urls.length > 0 ? (
              <img
                src={urls[urls.length - 1]}
                alt={`Step ${idx + 1}`}
                style={{
                  width: '100%',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                }}
              />
            ) : (
              <p style={{ color: '#999' }}>No upload</p>
            )}
          </div>
        ))}
      </div>

      {/* Finished Looks */}
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ color: '#fff', marginBottom: '1rem' }}>Finished Look</h2>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          {finishedImages.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`Finished Look ${idx + 1}`}
              style={{
                width: finishedImages.length > 1 ? '45%' : '70%',
                border: '1px solid #ccc',
                borderRadius: '6px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button
          onClick={handleDownloadPDF}
          style={{
            background: '#28a745',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            border: 'none',
            fontSize: '1rem',
            marginRight: '1rem',
          }}
        >
          📄 Download PDF
        </button>
        <button
          style={{
            background: '#0070f3',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            border: 'none',
            fontSize: '1rem',
          }}
          onClick={() => router.push('/challenge')}
        >
          🔄 Start a New Challenge
        </button>
      </div>
    </main>
  )
}