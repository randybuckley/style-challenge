'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ChallengeIndexRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/challenge/step1')
  }, [router])

  return <p>Redirecting to Step 1...</p>
}