'use client'

import { useRouter } from 'next/navigation'

export default function CertificationPage() {
  const router = useRouter()

  const handleSubmit = () => {
    router.push('/challenge/payment')
  }

  return (
    <main
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: '2rem',
        fontFamily: 'sans-serif',
        backgroundColor: '#fff',
        color: '#000',
      }}
    >
      <h2 style={{ fontSize: '2rem', fontWeight: 'bold' }}>🎓 Submit for Certification</h2>

      <p style={{ marginTop: '1rem', fontSize: '1rem' }}>
        You’ve completed your styling challenge — now take the final step. Submit your portfolio to be reviewed by Patrick Cameron himself.
        <br />
        <br />
        Once submitted, Patrick will review your work. Excellent portfolios will be shared on Patrick’s socials and entered into the Style Challenge competition.
      </p>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <iframe
          src="https://player.vimeo.com/video/76979871"
          width="100%"
          height="360"
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title="Certification Intro Video"
          style={{ border: '1px solid #ccc', backgroundColor: '#000' }}
        ></iframe>
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button
          onClick={handleSubmit}
          style={{
            fontSize: '1rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#000',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ✅ Submit Now & Get Certified
        </button>
      </div>
    </main>
  )
}