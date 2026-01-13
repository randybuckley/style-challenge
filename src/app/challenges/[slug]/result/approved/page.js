import { redirect } from 'next/navigation'

export default function ApprovedRedirect({ searchParams }) {
  const token = searchParams?.token ? String(searchParams.token) : ''
  const userEmail = searchParams?.userEmail ? String(searchParams.userEmail) : ''

  const qs = new URLSearchParams()
  if (token) qs.set('token', token)
  if (userEmail) qs.set('userEmail', userEmail)

  redirect(`/result/approved${qs.toString() ? `?${qs.toString()}` : ''}`)
}