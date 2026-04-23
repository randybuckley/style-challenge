'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function ProPaywall({ challengeTitle, challengeThumbnail, userId, email }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStripeCheckout = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shell}>
      <div style={inner}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={200}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        {/* Challenge context */}
        {(challengeTitle || challengeThumbnail) && (
          <div style={challengeRow}>
            {challengeThumbnail && (
              <img src={challengeThumbnail} alt={challengeTitle} style={thumb} />
            )}
            <div>
              <div style={eyebrow}>Pro Challenge</div>
              <div style={challengeName}>{challengeTitle}</div>
            </div>
          </div>
        )}

        {/* Headline */}
        <div style={headlineBlock}>
          <div style={lockIcon}>🔒</div>
          <h1 style={headline}>Unlock Pro Access</h1>
          <p style={subline}>
            Get lifetime access to every Pro challenge, build your portfolio,
            and work toward certification — created by Patrick Cameron.
          </p>
        </div>

        {/* Divider */}
        <div style={divider} />

        {/* Pathway 1 — Stripe */}
        <div style={primaryCard}>
          <div style={pathwayEyebrow}>Most popular</div>
          <div style={pathwayTitle}>One-time payment</div>
          <div style={priceRow}>
            <span style={price}>£9.99</span>
            <span style={priceNote}>lifetime access</span>
          </div>
          <p style={pathwayDesc}>
            Pay once, access everything. No subscription, no renewal.
          </p>
          <button
            onClick={handleStripeCheckout}
            disabled={loading}
            style={loading ? primaryBtnDisabled : primaryBtn}
          >
            {loading ? 'Redirecting to payment…' : 'Unlock Pro — £9.99'}
          </button>
          {error && <p style={errorText}>{error}</p>}
        </div>

        {/* Divider */}
        <div style={divider} />

        <p style={altLabel}>Already have access?</p>

        {/* Pathway 2 — Access Long Hair member */}
        <a href="/challenges/redeem/subscriber" style={secondaryCard}>
          <div style={secondaryCardLeft}>
            <div style={pathwayTitle}>Access Long Hair member</div>
            <p style={pathwayDesc}>
              Your membership includes Pro access. Activate it here.
            </p>
          </div>
          <div style={chevron}>›</div>
        </a>

        {/* Pathway 3 — Promo code */}
        <a href="/challenges/redeem/promo" style={secondaryCard}>
          <div style={secondaryCardLeft}>
            <div style={pathwayTitle}>I have a promo code</div>
            <p style={pathwayDesc}>
              From your salon, academy, or product company.
            </p>
          </div>
          <div style={chevron}>›</div>
        </a>

      </div>
    </div>
  );
}

/* -------- styles -------- */

const shell = {
  minHeight: '100vh',
  background: '#000',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: '2rem 1rem 4rem',
  boxSizing: 'border-box',
};

const inner = {
  width: '100%',
  maxWidth: 480,
  color: '#e5e7eb',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
};

const challengeRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  background: '#020617',
  border: '1px solid #1e293b',
  borderRadius: 14,
  padding: '0.9rem 1rem',
  marginBottom: 24,
};

const thumb = {
  width: 56,
  height: 56,
  borderRadius: 10,
  objectFit: 'cover',
  flexShrink: 0,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
};

const eyebrow = {
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#facc15',
  marginBottom: 2,
};

const challengeName = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#e5e7eb',
};

const headlineBlock = {
  textAlign: 'center',
  marginBottom: 24,
};

const lockIcon = {
  fontSize: '2rem',
  marginBottom: 8,
};

const headline = {
  fontSize: '1.6rem',
  fontWeight: 800,
  margin: '0 0 10px',
};

const subline = {
  fontSize: '0.92rem',
  color: '#94a3b8',
  lineHeight: 1.55,
  margin: 0,
};

const divider = {
  height: 1,
  background: '#1e293b',
  margin: '20px 0',
};

const primaryCard = {
  background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(22,163,74,0.04))',
  border: '1px solid rgba(34,197,94,0.3)',
  borderRadius: 16,
  padding: '1.4rem',
  marginBottom: 8,
};

const pathwayEyebrow = {
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#22c55e',
  marginBottom: 6,
  fontWeight: 700,
};

const pathwayTitle = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#e5e7eb',
  marginBottom: 4,
};

const priceRow = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  margin: '8px 0',
};

const price = {
  fontSize: '2rem',
  fontWeight: 900,
  color: '#22c55e',
};

const priceNote = {
  fontSize: '0.85rem',
  color: '#94a3b8',
};

const pathwayDesc = {
  fontSize: '0.85rem',
  color: '#94a3b8',
  lineHeight: 1.5,
  margin: '0 0 14px',
};

const primaryBtn = {
  width: '100%',
  padding: '0.85rem 1rem',
  borderRadius: 999,
  border: 'none',
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  color: '#0b1120',
  fontWeight: 800,
  fontSize: '1rem',
  cursor: 'pointer',
  boxSizing: 'border-box',
};

const primaryBtnDisabled = {
  ...primaryBtn,
  opacity: 0.6,
  cursor: 'not-allowed',
};

const errorText = {
  marginTop: 10,
  fontSize: '0.85rem',
  color: '#f87171',
  textAlign: 'center',
};

const altLabel = {
  fontSize: '0.8rem',
  color: '#64748b',
  textAlign: 'center',
  margin: '0 0 12px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const secondaryCard = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  background: '#020617',
  border: '1px solid #1e293b',
  borderRadius: 14,
  padding: '1rem 1.1rem',
  marginBottom: 10,
  textDecoration: 'none',
  color: 'inherit',
  cursor: 'pointer',
};

const secondaryCardLeft = {
  flex: 1,
};

const chevron = {
  fontSize: '1.4rem',
  color: '#475569',
  flexShrink: 0,
};