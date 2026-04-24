'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import ProPaywall from '../../../components/ProPaywall';

function UpgradePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data?.session?.user) {
        router.replace('/welcome-back?next=/challenges/upgrade');
        return;
      }
      setUser(data.session.user);
      setLoading(false);
    };
    load();
  }, [router]);

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: '#000', color: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading…</p>
      </main>
    );
  }

  if (searchParams.get('success') === 'true') {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ maxWidth: 480, width: '100%', padding: '2rem 1.25rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#e5e7eb' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 12, color: '#f9fafb' }}>You're now Pro!</h1>
          <p style={{ fontSize: '0.95rem', color: '#94a3b8', lineHeight: 1.6, marginBottom: 24 }}>
            Your payment was successful. Pro access is being activated — it may take a few seconds to update.
          </p>
          <a href="/challenges/menu" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.85rem 2rem', borderRadius: 999, background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#0b1120', fontWeight: 800, fontSize: '1rem', textDecoration: 'none' }}>
            Go to Collections
          </a>
        </div>
      </div>
    );
  }

  if (searchParams.get('cancelled') === 'true') {
    return (
      <ProPaywall
        userId={user?.id}
        email={user?.email}
        message="Payment cancelled — no charge was made. Try again when you're ready."
      />
    );
  }

  return (
    <ProPaywall
      userId={user?.id}
      email={user?.email}
    />
  );
}

export default function UpgradePageWrapper() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', background: '#000', color: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Loading…</p></main>}>
      <UpgradePage />
    </Suspense>
  );
}