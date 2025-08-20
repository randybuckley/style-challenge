'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Processing your login...')

  useEffect(() => {
    const handleLogin = async () => {
      // ✅ Parse the hash fragment from the magic link
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (!accessToken || !refreshToken) {
        console.error('❌ No tokens found in URL')
        setStatus('Login failed. Please request a new magic link.')
        return
      }

      // ✅ Save session to Supabase
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (error || !data.session) {
        console.error('❌ Login failed:', error?.message)
        setStatus('Login failed. Please request a new magic link.')
        return
      }

      console.log('✅ Login successful!', data.session.user)
      localStorage.setItem('supabaseSession', JSON.stringify({ user: data.session.user }))

      setStatus('Login successful! Redirecting...')
      setTimeout(() => router.push('/challenge'), 1500)
    }

    handleLogin()
  }, [router])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#fff',
        background: '#000',
      }}
    >
      <h2>{status}</h2>
    </main>
  )
}