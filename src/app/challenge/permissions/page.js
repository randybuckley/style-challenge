'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

export default function PermissionsPage() {
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [choice, setChoice] = useState(null) // 'yes' | 'no' | null
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Fetch session and ensure a profile row exists
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      setError(null)

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()

      if (sessionError) {
        console.error('Error getting session:', sessionError)
        setError('There was a problem checking your session. Please try again.')
        setLoading(false)
        return
      }

      const sessionUser = sessionData?.session?.user

      if (!sessionUser) {
        // No authenticated user – send back to home / login
        router.push('/')
        return
      }

      console.log('Permissions: session user', sessionUser)
      setUser(sessionUser)

      // 1. Try to fetch existing profile
      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('id, email, media_consent')
        .eq('id', sessionUser.id)
        .maybeSingle()

      if (profileError && profileError.code !== 'PGRST116') {
        // PGRST116 = "Results contain 0 rows" for maybeSingle; treat that as "no profile yet"
        console.error('Error fetching profile:', profileError)
        setError('There was a problem loading your profile. Please try again.')
        setLoading(false)
        return
      }

      let effectiveProfile = profile

      // 2. If no profile row yet, create one with id + email via upsert
      if (!effectiveProfile) {
        console.log('No profile found; creating one via upsert')
        const {
          data: insertedProfile,
          error: insertError,
        } = await supabase
          .from('profiles')
          .upsert(
            {
              id: sessionUser.id,
              email: sessionUser.email || null,
            },
            { onConflict: 'id' },
          )
          .select('id, email, media_consent')
          .single()

        if (insertError) {
          console.error('Error creating profile:', insertError)
          setError('There was a problem creating your profile. Please try again.')
          setLoading(false)
          return
        }

        effectiveProfile = insertedProfile
      }

      console.log('Effective profile:', effectiveProfile)

      // 3. Pre-select consent choice if already set
      if (effectiveProfile?.media_consent === true) {
        setChoice('yes')
      } else if (effectiveProfile?.media_consent === false) {
        setChoice('no')
      } else {
        setChoice(null)
      }

      setLoading(false)
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleSave = async () => {
    if (!user) {
      setError('No user found. Please log in again.')
      return
    }

    if (!choice) {
      setError('Please select one of the options to continue.')
      return
    }

    setSaving(true)
    setError(null)

    const selectedConsent = choice === 'yes'

    console.log('Saving media_consent:', {
      userId: user.id,
      email: user.email,
      media_consent: selectedConsent,
    })

    const {
      data: upserted,
      error: upsertError,
    } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email || null,
          media_consent: selectedConsent,
          media_consent_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .select('id')
      .single()

    if (upsertError) {
      console.error('Error saving media_consent:', upsertError)
      setError('There was a problem saving your choice. Please try again.')
      setSaving(false)
      return
    }

    if (!upserted) {
      console.error('Upsert returned no data')
      setError('There was a problem saving your choice. Please try again.')
      setSaving(false)
      return
    }

    console.log('Consent saved, navigating to /challenge/step1')
    router.push('/challenge/step1')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md border rounded-lg p-6 shadow-sm bg-white">
        <h1 className="text-xl font-semibold mb-4">Permissions</h1>
        <p className="mb-4">
          Do you give Patrick Cameron permission to use your uploaded images for education and
          marketing? You can still complete the challenge if you say no.
        </p>

        <div className="space-y-3 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="consent"
              value="yes"
              checked={choice === 'yes'}
              onChange={() => setChoice('yes')}
            />
            <span>Yes, I give permission.</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="consent"
              value="no"
              checked={choice === 'no'}
              onChange={() => setChoice('no')}
            />
            <span>No, I don&apos;t give permission.</span>
          </label>
        </div>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 px-4 rounded-md border bg-black text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save and continue'}
        </button>
      </div>
    </div>
  )
}
