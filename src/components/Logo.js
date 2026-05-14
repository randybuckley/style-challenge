import Image from 'next/image'

export default function Logo({ width = 220, borderRadius = 12 }) {
  return (
    <div style={{
      display: 'inline-block',
      padding: 10,
      border: '2px solid #1d1d1d',
      background: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      borderRadius,
      overflow: 'hidden',
    }}>
      <Image
        src="/logo.jpeg"
        alt="Patrick Cameron Style Challenge"
        width={width}
        height={0}
        style={{ height: 'auto', maxWidth: '100%', display: 'block' }}
        priority
      />
    </div>
  )
}