'use client';

import { useEffect, useState, Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import SignedInAs from '../../components/SignedInAs';

function WelcomeBackInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // resend-link form state
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  // user-supplied next destination (may be absent)
  const explicitNextRaw = sp.get('next') || '';

  // Only allow internal, relative paths
  const explicitNext =
    explicitNextRaw.startsWith('/') && !explicitNextRaw.startsWith('//')
      ? explicitNextRaw
      : '';

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      const sessionUser = data?.session?.user ?? null;
      setUser(sessionUser);
      setLoading(false);
    };

    loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Routing policy for welcome-back:
   * - If a page sent a next param, honour it (internal paths only).
   * - Otherwise, default to Pro landing for *this* welcome-back flow.
   *
   * This avoids falling back into MVP v6 when the user is coming from /challenges/*
   * flows and keeps MVP v6 intact because MVP v6 links can still pass their own next.
   */
  const computeNextPath = () => {
    if (explicitNext) return explicitNext;
    return '/challenges/menu';
  };

  const handleContinue = () => {
    router.replace(computeNextPath());
  };

  const handleSendLink = async (e) => {
    e.preventDefault();
    setMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage('Please enter your email.');
      return;
    }

    setSending(true);

    try {
      const nextPath = computeNextPath();

      // fallback destination in case email client strips params
      try {
        localStorage.setItem('pc_next', nextPath);
      } catch {}

      // ✅ Pro routing: include flow=pro and next=...
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('flow', 'pro');
      callback.searchParams.set('next', nextPath);

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: callback.toString() }
      });

      if (error) {
        setMessage(`Couldn’t send link: ${error.message}`);
      } else {
        setMessage('Check your email for a sign-in link. Open it on this device.');
      }
    } catch (err) {
      setMessage('Something went wrong sending the link. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <main style={shell}>
        <p style={{ color: '#ccc' }}>Checking your session…</p>
      </main>
    );
  }

  // If user is signed in
  if (user) {
    return (
      <main style={shell}>
        <div style={{ marginBottom: 16 }}>
          <Image
            src="/logo.jpeg"
            alt="Style Challenge"
            width={240}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        {/* Signed-in identity strip (with sign-out) */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <SignedInAs
            style={{
              fontSize: '0.85rem',
              color: '#9ca3af',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              padding: '0.35rem 0.65rem',
              borderRadius: 999
            }}
          />
        </div>

        <h1 style={{ margin: '6px 0 8px' }}>Welcome back</h1>
        <p style={{ color: '#ccc', marginBottom: 20, textAlign: 'center' }}>
          Continue to your collections.
        </p>

        <button onClick={handleContinue} style={primaryBtn}>
          Continue
        </button>
      </main>
    );
  }

  // No session → sign-in form
  return (
    <main style={shell}>
      <div style={{ marginBottom: 16 }}>
        <Image
          src="/logo.jpeg"
          alt="Style Challenge"
          width={240}
          height={0}
          style={{ height: 'auto', maxWidth: '100%' }}
          priority
        />
      </div>

      <h1 style={{ margin: '6px 0 8px' }}>Sign back in</h1>
      <p style={{ color: '#ccc', marginBottom: 16, maxWidth: 520 }}>
        Enter your email and we’ll send a sign-in link.
      </p>

      <form
        onSubmit={handleSendLink}
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}
      >
        <input
          type="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          disabled={sending}
          required
        />
        <button type="submit" style={primaryBtn} disabled={sending}>
          {sending ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>

      {message ? (
        <p style={{ marginTop: 12, color: '#ccc', maxWidth: 520 }}>{message}</p>
      ) : null}
    </main>
  );
}

export default function WelcomeBackPage() {
  return (
    <Suspense
      fallback={
        <main style={shell}>
          <p style={{ color: '#ccc' }}>Loading…</p>
        </main>
      }
    >
      <WelcomeBackInner />
    </Suspense>
  );
}

/* styles */
const shell = {
  minHeight: '100vh',
  background: '#000',
  color: '#fff',
  fontFamily:
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  textAlign: 'center'
};

const inputStyle = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #555',
  background: '#fff',
  color: '#111',
  minWidth: 260,
  maxWidth: '80vw',
  boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
};

const primaryBtn = {
  background: '#28a745',
  color: '#fff',
  padding: '0.75rem 1.5rem',
  borderRadius: 8,
  border: 'none',
  fontWeight: 700,
  cursor: 'pointer',
  minWidth: 200,
  boxShadow: '0 6px 16px rgba(0,0,0,0.25)'
};