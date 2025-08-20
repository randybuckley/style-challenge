'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

function AuthCallbackInner() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    let isMounted = true;

    const go = async () => {
      const code = sp.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.warn('[callback] exchangeCodeForSession error:', error.message);
      } else {
        try {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          const access_token = hash.get('access_token');
          const refresh_token = hash.get('refresh_token');
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) console.warn('[callback] setSession error:', error.message);
          }
        } catch {}
      }

      const queryNext = sp.get('next');
      let storedNext = null;
      try { storedNext = localStorage.getItem('pc_next'); } catch {}
      const next = queryNext || storedNext || '/challenge/step1';
      try { localStorage.removeItem('pc_next'); } catch {}

      if (!isMounted) return;
      router.replace(next);
    };

    go();
    return () => { isMounted = false; };
  }, [router, sp]);

  return (
    <main style={{ padding: '2rem', textAlign: 'center', color: '#ccc' }}>
      Signing you in…
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem', textAlign: 'center', color: '#ccc' }}>Loading…</main>}>
      <AuthCallbackInner />
    </Suspense>
  );
}
