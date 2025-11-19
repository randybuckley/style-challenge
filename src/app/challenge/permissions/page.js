'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

export default function PermissionsPage() {
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [choice, setChoice] = useState(null) // 'yes' | 'no' | null
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  // ---------- simple mobile detection for layout ----------
  useEffect(() => {
    const measure = () => {
      if (typeof window === 'undefined') return
      setIsMobile(window.innerWidth < 640)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // ---------- load session + existing consent ----------
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Error getting session:', error.message)
        return
      }

      const sessionUser = data.session?.user
      if (!sessionUser) {
        router.push('/')
        return
      }

      setUser(sessionUser)

      // Check if they’ve already answered
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('marketing_consent')
        .eq('id', sessionUser.id)
        .maybeSingle()

      if (profErr) {
        console.warn('Error loading profile for consent:', profErr.message)
      }

      const consent = profile?.marketing_consent
      if (consent === true) setChoice('yes')
      if (consent === false) setChoice('no')
    }

    load()
  }, [router])

  // ---------- save choice ----------
  const saveChoice = async () => {
    if (!choice) {
      setError('Please choose one option.')
      return
    }
    if (!user) {
      setError('You need to be signed in to continue.')
      return
    }

    setSaving(true)
    setError('')

    const { error: upsertErr } = await supabase
      .from('profiles')
      .update({
        marketing_consent: choice === 'yes',
        marketing_consent_at: new Date().toISOString()
      })
      .eq('id', user.id)

    if (upsertErr) {
      console.error('Error saving marketing_consent:', upsertErr.message)
      setError('Sorry, we could not save your choice. Please try again.')
      setSaving(false)
      return
    }

    setSaving(false)
    router.push('/challenge/step1')
  }

  return (
    <main
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: isMobile ? '1.5rem 1rem 2.5rem' : '2.25rem 1.5rem 3rem',
        color: '#fff',
        background: '#000',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        minHeight: '100vh'
      }}
    >
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: isMobile ? '1.25rem' : '1.75rem' }}>
        <Image
          src="/logo.jpeg"
          alt="Style Challenge Logo"
          width={isMobile ? 220 : 260}
          height={0}
          style={{ height: 'auto', maxWidth: '100%' }}
          priority
        />
      </div>

      {/* Patrick's portrait + intro */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'center' : 'flex-start',
          gap: isMobile ? '1rem' : '1.25rem',
          marginBottom: isMobile ? '1.25rem' : '1.75rem',
          textAlign: isMobile ? 'center' : 'left'
        }}
      >
        <img
          src="/press_shot.JPG"
          alt="Patrick Cameron"
          style={{
            width: isMobile ? 140 : 120,
            height: 'auto',
            borderRadius: 12,
            objectFit: 'cover',
            flexShrink: 0
          }}
        />

        <div style={{ maxWidth: 520 }}>
          <h2
            style={{
              margin: 0,
              fontWeight: 800,
              fontSize: isMobile ? '1.35rem' : '1.6rem'
            }}
          >
            Hi, Patrick here.
          </h2>
          <p
            style={{
              marginTop: '0.6rem',
              lineHeight: 1.5,
              color: '#ddd',
              fontSize: isMobile ? '0.96rem' : '1rem'
            }}
          >
            I’m really pleased you’re doing this Style Challenge.
            <br />
            <br />
            One of my favourite things is sharing the work of stylists and
            students from around the world — on Facebook, Instagram, TikTok,
            my website and in classes. It inspires other hairdressers and it’s
            a brilliant way to shine a light on <strong>your</strong> skills
            and your salon.
            <br />
            <br />
            Some people love their work being shown, others prefer to keep
            their images private. Both choices are absolutely fine and will
            not affect your challenge, your feedback or your certificate.
            <br />
            <br />
            If you ever change your mind later, just email me and my team at{' '}
            <strong>info@accesslonghair.com</strong>.
          </p>
        </div>
      </div>

      {/* Consent options */}
      <div
        style={{
          marginTop: '0.5rem',
          color: '#eee',
          fontSize: isMobile ? '0.95rem' : '1rem'
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
            marginBottom: '1rem',
            cursor: 'pointer'
          }}
        >
          <input
            type="checkbox"
            checked={choice === 'yes'}
            onChange={() => setChoice(choice === 'yes' ? null : 'yes')}
            style={{ width: 20, height: 20, marginTop: 3 }}
          />
          <span>
            <strong>Yes</strong> — I’m happy for Patrick and his team to use my
            photos (and my name / salon name when appropriate) on things like
            Facebook, Instagram, TikTok, the website or live classes to
            showcase my work and inspire other stylists.
          </span>
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
            cursor: 'pointer'
          }}
        >
          <input
            type="checkbox"
            checked={choice === 'no'}
            onChange={() => setChoice(choice === 'no' ? null : 'no')}
            style={{ width: 20, height: 20, marginTop: 3 }}
          />
          <span>
            <strong>No</strong> — please keep my photos private. They can be
            used inside the Style Challenge and for my assessment and
            certification only, but not posted or shared publicly.
          </span>
        </label>

        {error && (
          <p style={{ color: '#ffb3b3', marginTop: '0.75rem' }}>{error}</p>
        )}
      </div>

      <p
        style={{
          marginTop: '1.75rem',
          textAlign: 'center',
          color: '#bbb',
          fontSize: isMobile ? '0.9rem' : '0.95rem'
        }}
      >
        Please choose one option above — you can still complete the challenge
        whichever you prefer.
      </p>

      {/* Save button */}
      <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
        <button
          onClick={saveChoice}
          disabled={saving}
          style={{
            background: '#28a745',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '14px 22px',
            fontSize: '1.05rem',
            fontWeight: 700,
            cursor: saving ? 'default' : 'pointer',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            opacity: saving ? 0.7 : 1,
            minWidth: 260
          }}
        >
          {saving ? 'Saving…' : 'Save my choice and start the challenge'}
        </button>
      </div>
    </main>
  )
}