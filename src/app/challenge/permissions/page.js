'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

export default function PermissionsPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [choice, setChoice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Load session + existing consent
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getSession()
      const sessionUser = data.session?.user

      if (!sessionUser) {
        router.push('/')
        return
      }

      setUser(sessionUser)

      // Load existing consent if any
      const { data: profile } = await supabase
        .from('profiles')
        .select('media_consent')
        .eq('id', sessionUser.id)
        .single()

      if (profile?.media_consent !== null) {
        setChoice(profile.media_consent ? 'yes' : 'no')
      }
    }

    load()
  }, [router])

  const saveChoice = async () => {
    if (!choice) {
      setError('Please choose one option.')
      return
    }

    setSaving(true)
    setError('')

    await supabase
      .from('profiles')
      .update({
        media_consent: choice === 'yes',
        media_consent_at: new Date().toISOString()
      })
      .eq('id', user.id)

    setSaving(false)
    router.push('/challenge/step1')
  }

  return (
    <main
      style={{
        maxWidth: 700,
        margin: '0 auto',
        padding: '2rem 1rem',
        color: '#fff',
        background: '#000',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        minHeight: '100vh'
      }}
    >
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <Image
          src="/logo.jpeg"
          alt="Style Challenge Logo"
          width={240}
          height={0}
          style={{ height: 'auto' }}
        />
      </div>

      {/* Patrick's portrait + intro */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'flex-start',
          marginBottom: '1.5rem'
        }}
      >
        <img
          src="/press_shot.JPG"
          alt="Patrick Cameron"
          style={{
            width: 110,
            height: 'auto',
            borderRadius: 12,
            objectFit: 'cover'
          }}
        />

        <div>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.5rem' }}>
            Hi, Patrick here.
          </h2>
          <p style={{ marginTop: '0.5rem', lineHeight: 1.45, color: '#ddd' }}>
            I’m really pleased you’re doing this Style Challenge.
            <br />
            <br />
            One of my favourite things is sharing the work of stylists and
            students from around the world — on Facebook, Instagram, TikTok,
            my website and in classes. It inspires other hairdressers and
            it’s a brilliant way to shine a light on <strong>your</strong> skills
            and your salon.
            <br />
            <br />
            Some people love their work being shown, others prefer to keep
            their images private. Both choices are absolutely fine and will
            not affect your challenge, your feedback or your certificate.
            <br />
            <br />
            If you ever change your mind later, just email me and my team at:{' '}
            <strong>info@accesslonghair.com</strong>.
          </p>
        </div>
      </div>

      {/* Consent options */}
      <div style={{ marginTop: '1rem', color: '#eee' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '1rem'
          }}
        >
          <input
            type="checkbox"
            checked={choice === 'yes'}
            onChange={() => setChoice(choice === 'yes' ? null : 'yes')}
            style={{ width: 20, height: 20 }}
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
            alignItems: 'center',
            gap: '0.6rem'
          }}
        >
          <input
            type="checkbox"
            checked={choice === 'no'}
            onChange={() => setChoice(choice === 'no' ? null : 'no')}
            style={{ width: 20, height: 20 }}
          />
          <span>
            <strong>No</strong> — please keep my photos private. They can be
            used inside the Style Challenge and for my assessment and
            certification only, but not posted or shared publicly.
          </span>
        </label>

        {error && (
          <p style={{ color: '#ffb3b3', marginTop: '0.75rem' }}>
            {error}
          </p>
        )}
      </div>

      <p style={{ marginTop: '2rem', textAlign: 'center', color: '#bbb' }}>
        Please choose one option above — you can still complete the challenge
        whichever you prefer.
      </p>

      {/* Save button */}
      <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <button
          onClick={saveChoice}
          disabled={saving}
          style={{
            background: '#28a745',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '14px 22px',
            fontSize: '1.1rem',
            fontWeight: 700,
            cursor: 'pointer',
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