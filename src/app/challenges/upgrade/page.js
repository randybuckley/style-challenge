'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import ProPaywall from '../../../components/ProPaywall';

export default function UpgradePage() {
  const router = useRouter();
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

  return (
    <ProPaywall
      userId={user?.id}
      email={user?.email}
    />
  );
}