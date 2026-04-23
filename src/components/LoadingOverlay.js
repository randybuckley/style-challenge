// src/components/LoadingOverlay.js

export default function LoadingOverlay({ message = "Working on it…" }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.85)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
    }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        border: '5px solid rgba(255,255,255,0.15)',
        borderTopColor: '#28a745',
        animation: 'spin 0.9s linear infinite',
      }} />
      <p style={{
        color: '#e5e7eb',
        fontSize: '1.05rem',
        fontWeight: 600,
        textAlign: 'center',
        maxWidth: 280,
        lineHeight: 1.5,
        margin: 0,
      }}>
        {message}
      </p>
      <p style={{
        color: '#6b7280',
        fontSize: '0.85rem',
        textAlign: 'center',
        maxWidth: 260,
        lineHeight: 1.5,
        margin: 0,
      }}>
        This can take a moment on slower connections.
      </p>
    </div>
  )
}