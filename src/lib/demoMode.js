// src/lib/demoMode.js
export function isDemoMode(searchParams) {
  const demo = searchParams?.get?.('demo')
  const adminDemo = searchParams?.get?.('admin_demo')
  return demo === '1' || adminDemo === 'true'
}