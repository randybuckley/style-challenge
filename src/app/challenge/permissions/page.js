// src/app/challenge/permissions/page.js
'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import SignedInAs from '../../../components/SignedInAs'

const STORAGE_KEY = 'style_challenge_image_consent_v1'

// ✅ Pro routing helper (used elsewhere in your Pro flow)
const PRO_NEXT_KEY = 'pc_next'

function PermissionsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [consent, setConsent] = useState(null) // null = not chosen, true/false = chosen
  const [loaded, setLoaded] = useState(false) // page ready for interaction
  const [user, setUser] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const queryNext = useMemo(() => {
    try {
      return (searchParams?.get('next') || '').trim()
    } catch {
      return ''
    }
  }, [searchParams])

  // ✅ Decide where to send the user after permissions are saved:
  // Priority:
  //  1) pc_next (Pro flow state, stored pre-login)
  //  2) ?next= query param (if you choose to use it)
  //  3) default → Pro menu (prepares for MVP v6 deletion)
  const resolveNextPath = () => {
    let storedNext = ''

    if (typeof window !== 'undefined') {
      try {
        storedNext = (window.localStorage.getItem(PRO_NEXT_KEY) || '').trim()
      } catch {}
    }

    const candidate = (queryNext || storedNext || '').trim()

    // Only allow internal paths; refuse absolute/external URLs
    if (candidate && candidate.startsWith('/')) return candidate

    // ✅ IMPORTANT: default to Pro, not MVP v6
    return '/challenges/menu'
  }

  // Load any saved preference from localStorage and initialise Supabase profile
  useEffect(() => {
    let consentFromLocal = null

    // 1) Read any stored preference from localStorage
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === 'true') consentFromLocal = true
        if (raw === 'false') consentFromLocal = false
        if (consentFromLocal !== null) setConsent(consentFromLocal)
      } catch {}
    }

    // 2) Supabase session + profile initialisation
    const init = async () => {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()

      if (sessionError) {
        console.error(sessionError)
        setError('There was a problem checking your session. Please try again.')
        setLoaded(true)
        return
      }

      const sessionUser = sessionData?.session?.user
      if (!sessionUser) {
        router.push('/')
        return
      }

      setUser(sessionUser)

      // Attempt to load profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, media_consent')
        .eq('id', sessionUser.id)
        .maybeSingle()

      if (profileError && profileError.code !== 'PGRST116') {
        setError('There was a problem loading your profile. Please try again.')
        setLoaded(true)
        return
      }

      let effectiveProfile = profile

      // Create profile if missing
      if (!effectiveProfile) {
        const { data: insertedProfile, error: insertError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: sessionUser.id,
              email: sessionUser.email || null,
            },
            { onConflict: 'id' }
          )
          .select('id, email, media_consent')
          .single()

        if (insertError) {
          setError('There was a problem creating your profile.')
          setLoaded(true)
          return
        }

        effectiveProfile = insertedProfile
      }

      // Load DB consent if present
      if (effectiveProfile?.media_consent === true) {
        setConsent(true)
      } else if (effectiveProfile?.media_consent === false) {
        setConsent(false)
      } else if (consentFromLocal !== null) {
        setConsent(consentFromLocal)
      }

      setLoaded(true)
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleContinue = async () => {
    if (consent === null) {
      alert('Please choose one of the two options above before continuing.')
      return
    }

    if (!user) {
      setError('There was a problem with your session. Please log in again.')
      return
    }

    setSaving(true)
    setError(null)

    // 1) Save into Supabase
    const { data: upserted, error: upsertError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email || null,
          media_consent: consent,
          media_consent_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select('id')
      .single()

    if (upsertError || !upserted) {
      setError('There was a problem saving your choice. Please try again.')
      setSaving(false)
      return
    }

    // 2) Mirror into localStorage
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(consent))
      } catch {}
    }

    // 3) Continue into the correct flow (Pro if pc_next/next exists; else Pro menu)
    const nextPath = resolveNextPath()

    // If we used pc_next, clear it so it doesn’t affect future navigation.
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(PRO_NEXT_KEY)
      } catch {}
    }

    router.push(nextPath)
  }

  const currentChoiceText =
    consent === true
      ? 'You’ve said yes — Patrick can use your images, name, and salon name to inspire other stylists.'
      : consent === false
      ? 'You’ve said no — your images stay private to your portfolio and certification review only.'
      : 'Please choose one option above. Your choice will not affect your chance of certification.'

  return (
    <main style={pageShell}>
      <div style={card}>
        {/* Logo */}
        <div style={logoBar}>
          <img
            src="/logo.jpeg"
            alt="Patrick Cameron — Style Challenge"
            style={logo}
          />
        </div>

        {/* ✅ Logged-in strip (Not you? Log out) */}
        <div style={signedInWrap}>
          <SignedInAs style={signedInPill} />
        </div>

        {/* Patrick intro */}
        <div style={heroRow}>
          <div style={portraitWrap}>
            <img src="/press_shot.JPG" alt="Patrick Cameron" style={portrait} />
          </div>

          <div style={heroText}>
            <h1 style={title}>Before We Start</h1>

            <p style={lead}>
              <strong>Hi, Patrick here.</strong> During this Style Challenge
              you’ll be uploading photos of your mannequin work, and possibly
              real models too.
            </p>

            <p style={bodyText}>
              These images are always used for your learning and for me to
              review your work for certification. Sometimes I also like to
              share student work — in classes, online, or in future versions of
              this challenge — to inspire other stylists.
            </p>

            <p style={bodyText}>
              You get to choose how your images are used. Your decision{' '}
              <strong>will not affect</strong> your chance of completing the
              challenge or earning your certificate.
            </p>
          </div>
        </div>

        {/* Options */}
        <section style={choiceSection}>
          <h2 style={choiceHeading}>How would you like your images to be used?</h2>

          <label style={optionRow}>
            <input
              type="checkbox"
              checked={consent === true}
              onChange={() => setConsent(true)}
              style={checkbox}
            />
            <span style={optionText}>
              <strong>Yes</strong> — Patrick may use my images, name, and salon
              name to celebrate my work and inspire other stylists.
            </span>
          </label>

          <label style={optionRow}>
            <input
              type="checkbox"
              checked={consent === false}
              onChange={() => setConsent(false)}
              style={checkbox}
            />
            <span style={optionText}>
              <strong>No</strong> — keep my images private to my portfolio and
              Patrick’s certification review only.
            </span>
          </label>

          <p style={choiceSummary}>{currentChoiceText}</p>
        </section>

        {/* Error */}
        {error && (
          <p style={{ color: '#ff9999', textAlign: 'center', marginTop: 8 }}>
            {error}
          </p>
        )}

        {/* Button */}
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button
            type="button"
            onClick={handleContinue}
            disabled={!loaded || saving}
            style={{
              ...btnPrimary,
              opacity: loaded && !saving ? 1 : 0.7,
              cursor: loaded && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : 'Start the Style Challenge'}
          </button>

          <p style={smallPrint}>
            You can change your mind any time by emailing{' '}
            <a href="mailto:info@accesslonghair.com" style={link}>
              info@accesslonghair.com
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  )
}

// ✅ Suspense wrapper so useSearchParams is allowed during build/prerender
export default function PermissionsPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: '100vh',
            background: '#000',
            color: '#e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily:
              'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
          }}
        >
          Loading…
        </main>
      }
    >
      <PermissionsInner />
    </Suspense>
  )
}

/* ===== Styles ===== */

const pageShell = {
  minHeight: '100vh',
  background: '#000',
  color: '#f5f5f5',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: '24px 12px',
  boxSizing: 'border-box',
  fontFamily:
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
}

const card = {
  width: 'min(900px, 100%)',
  background: '#121212',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
  border: '1px solid #2a2a2a',
}

const logoBar = {
  textAlign: 'center',
  marginBottom: 12,
}

const logo = {
  width: 210,
  height: 'auto',
  borderRadius: 14,
  opacity: 0.95,
}

const signedInWrap = {
  display: 'flex',
  justifyContent: 'center',
  marginBottom: 14,
}

const signedInPill = {
  fontSize: '0.85rem',
  color: '#9ca3af',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  padding: '0.35rem 0.65rem',
  borderRadius: 999,
}

const heroRow = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
  alignItems: 'center',
  marginBottom: 12,
}

const portraitWrap = {
  flex: '0 0 auto',
  display: 'flex',
  justifyContent: 'center',
}

const portrait = {
  width: 130,
  height: 130,
  borderRadius: '50%',
  objectFit: 'cover',
  boxShadow: '0 10px 26px rgba(0,0,0,0.6)',
  border: '2px solid #333',
  background: '#000',
}

const heroText = {
  flex: '1 1 220px',
  minWidth: 220,
}

const title = {
  fontSize: 22,
  fontWeight: 800,
  marginBottom: 8,
}

const lead = {
  fontSize: 15,
  lineHeight: 1.5,
  marginBottom: 8,
  color: '#e0e0e0',
}

const bodyText = {
  fontSize: 14,
  lineHeight: 1.5,
  color: '#dddddd',
  marginBottom: 6,
}

const choiceSection = {
  marginTop: 10,
  marginBottom: 12,
}

const choiceHeading = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 8,
  color: '#ffffff',
}

const optionRow = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  marginBottom: 8,
}

const checkbox = {
  width: 18,
  height: 18,
  marginTop: 3,
  cursor: 'pointer',
}

const optionText = {
  fontSize: 14,
  lineHeight: 1.4,
  color: '#f0f0f0',
}

const choiceSummary = {
  marginTop: 8,
  fontSize: 13,
  color: '#cfcfcf',
  lineHeight: 1.4,
}

const btnPrimary = {
  background: '#28a745',
  color: '#fff',
  border: 'none',
  borderRadius: 999,
  padding: '12px 22px',
  fontWeight: 700,
  fontSize: 15,
  boxShadow: '0 12px 26px rgba(0,0,0,0.45)',
}

const smallPrint = {
  marginTop: 8,
  fontSize: 12,
  color: '#999',
  textAlign: 'center',
}

const link = {
  color: '#9fdcff',
  textDecoration: 'none',
}