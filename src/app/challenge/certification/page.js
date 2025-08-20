'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CertificationPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    try {
      const storedSession = localStorage.getItem('supabaseSession')
      const user = storedSession ? JSON.parse(storedSession).user : null

      const first_name = document.getElementById('firstName')?.value || ''
      const second_name = document.getElementById('secondName')?.value || ''
      const salon = document.getElementById('salon')?.value || ''

      const response = await fetch(
        'https://sifluvnvdgszfchtudkv.functions.supabase.co/review-certification',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: user?.id || null,
            first_name,
            second_name,
            salon,
          }),
        }
      )

      if (!response.ok) {
        throw new Error('Submission failed.')
      }

      alert('✅ Submission received! Patrick will review your portfolio soon.')
      router.push('/challenge/payment')
    } catch (err) {
      console.error('Error:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: '2rem',
        fontFamily: 'sans-serif',
        backgroundColor: '#111',
        color: '#fff',
        border: '2px solid #444',
        borderRadius: '12px',
      }}
    >
      <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        🎓 Submit for Certification
      </h2>

      <p style={{ fontSize: '1rem', lineHeight: 1.5 }}>
        You’ve completed your styling challenge — now take the final step.
        <br />
        Submit your portfolio to be reviewed by Patrick Cameron himself.
        <br />
        <br />
        Excellent portfolios may be shared on Patrick’s socials and entered into the Style Challenge competition.
      </p>

      <div style={{ margin: '2rem 0', textAlign: 'center' }}>
        <iframe
          src="https://player.vimeo.com/video/76979871"
          width="100%"
          height="360"
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title="Certification Intro Video"
          style={{
            borderRadius: '10px',
            border: '2px solid #333',
            backgroundColor: '#000',
          }}
        ></iframe>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
        <input
          id="firstName"
          type="text"
          placeholder="First Name"
          style={{
            padding: '0.75rem',
            borderRadius: '6px',
            border: '1px solid #555',
            textAlign: 'center',
            backgroundColor: '#222',
            color: '#fff',
          }}
        />
        <input
          id="secondName"
          type="text"
          placeholder="Second Name"
          style={{
            padding: '0.75rem',
            borderRadius: '6px',
            border: '1px solid #555',
            textAlign: 'center',
            backgroundColor: '#222',
            color: '#fff',
          }}
        />
        <input
          id="salon"
          type="text"
          placeholder="Salon Name (Optional)"
          style={{
            padding: '0.75rem',
            borderRadius: '6px',
            border: '1px solid #555',
            textAlign: 'center',
            backgroundColor: '#222',
            color: '#fff',
          }}
        />
      </div>

      {error && <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}

      <div style={{ textAlign: 'center' }}>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            fontSize: '1rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: submitting ? '#888' : '#28a745',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          ✅ {submitting ? 'Submitting...' : 'Submit Now & Get Certified'}
        </button>
      </div>
    </main>
  )
}