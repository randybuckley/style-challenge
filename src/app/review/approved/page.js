// src/app/review/approved/page.js

export const metadata = { title: 'Review – Approved' };

function btnStyle(bg) {
  return {
    background: bg,
    color: '#fff',
    textDecoration: 'none',
    padding: '10px 14px',
    borderRadius: 8,
    fontWeight: 700,
    display: 'inline-block',
    border: '1px solid transparent',
  };
}

export default function ApprovedPage({ searchParams }) {
  const note =
    searchParams?.msg === 'resent' ? 'Resent confirmation email.' : '';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f0f10',
        color: '#eaeaea',
        fontFamily:
          'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
      }}
    >
      <div style={{ maxWidth: 780, margin: '60px auto', padding: '0 16px' }}>
        <div
          style={{
            background: '#17181a',
            border: '1px solid #2a2b2f',
            borderRadius: 16,
            boxShadow: '0 8px 24px rgba(0,0,0,.35)',
            padding: '22px',
          }}
        >
          <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>
            Approval recorded
          </h1>
          <p style={{ margin: '0 0 10px' }}>
            Thanks — your approval has been saved and the stylist has been
            notified by email.
          </p>

          {note && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 10,
                background: '#153d19',
                border: '1px solid #2f6b36',
              }}
            >
              {note}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <a href="/challenge/certify?msg=ok" style={btnStyle('#28a745')}>
              Close
            </a>
            <a href="/challenge/portfolio" style={btnStyle('#343a40')}>
              Open Portfolio
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}