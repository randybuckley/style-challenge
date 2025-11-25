'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function ChallengesPage() {
  // Make sure this whole page is invisible unless Pro is enabled
  if (process.env.NEXT_PUBLIC_ENABLE_PRO !== 'true') {
    return null
  }

  const router = useRouter()
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch all challenges
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true)
        .order('tier', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error loading challenges:', error.message)
        setError(error.message)
        setLoading(false)
        return
      }

      setChallenges(data || [])
      setLoading(false)
    }

    load()
  }, [])

  const freeChallenges = challenges.filter((c) => c.tier === 'free')
  const proChallenges = challenges.filter((c) => c.tier === 'pro')

  // Keep v6 MVP route for now
  const handleStartFree = () => {
    router.push('/challenge/step1')
  }

  // Dev-only: exercise the new /challenges/[slug]/step1 flow
  const handleDevTestFree = () => {
    if (freeChallenges.length === 0) return
    const first = freeChallenges[0]
    if (!first || !first.slug) return
    router.push(`/challenges/${first.slug}/step1`)
  }

  const handleProClick = (slug) => {
    alert('Pro style selected. The Pro flow will be added next.')
  }

  if (loading) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        Loading challenges…
      </main>
    )
  }

  if (error) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <p>There was a problem loading the challenges.</p>
        <p style={{ color: '#666' }}>{error}</p>
      </main>
    )
  }

  return (
    <main
      style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: '2rem',
        fontFamily: 'sans-serif',
      }}
    >
      <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>
        Style Challenges
      </h1>

      {/* Free section */}
      <section style={{ marginBottom: '3rem' }}>
        <h2>Free Challenge</h2>

        {freeChallenges.length === 0 ? (
          <p style={{ color: '#555', marginTop: '0.5rem' }}>
            No free challenge configured yet.
          </p>
        ) : (
          freeChallenges.map((ch) => (
            <div
              key={ch.id}
              style={{
                border: '1px solid #ccc',
                padding: '1rem',
                borderRadius: 8,
                marginTop: '1rem',
              }}
            >
              <h3>{ch.title}</h3>
              {ch.description && (
                <p style={{ color: '#444', marginTop: '0.25rem' }}>
                  {ch.description}
                </p>
              )}

              <button
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem 1.25rem',
                  backgroundColor: '#000',
                  color: '#fff',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                }}
                onClick={handleStartFree}
              >
                Start
              </button>

              {/* Dev-only: new dynamic flow */}
              <button
                style={{
                  marginTop: '0.5rem',
                  marginLeft: '0.75rem',
                  padding: '0.6rem 1.1rem',
                  backgroundColor: '#444',
                  color: '#fff',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
                onClick={handleDevTestFree}
              >
                Dev Test (New Flow)
              </button>
            </div>
          ))
        )}
      </section>

      {/* Pro section */}
      <section>
        <h2>Pro Styles</h2>
        <p style={{ color: '#555', marginTop: '0.5rem' }}>
          Unlock 10 essential long-hair looks with your Access Long Hair
          subscription or promo code.
        </p>

        {proChallenges.length === 0 ? (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              border: '1px dashed #888',
              borderRadius: 8,
            }}
          >
            Pro styles will appear here when they’re configured.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              marginTop: '1rem',
            }}
          >
            {proChallenges.map((ch) => (
              <div
                key={ch.id}
                style={{
                  border: '1px solid #ccc',
                  padding: '1rem',
                  borderRadius: 8,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    backgroundColor: '#000',
                    color: '#fff',
                    fontSize: '0.75rem',
                    padding: '2px 6px',
                    borderRadius: 999,
                  }}
                >
                  PRO
                </div>

                <h3>{ch.title}</h3>
                {ch.description && (
                  <p style={{ color: '#444', marginTop: '0.25rem' }}>
                    {ch.description}
                  </p>
                )}

                <button
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.6rem 1rem',
                    backgroundColor: '#f5f5f5',
                    border: '1px solid #999',
                    borderRadius: 6,
                    cursor: 'pointer',
                    width: '100%',
                  }}
                  onClick={() => handleProClick(ch.slug)}
                >
                  View Style
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}