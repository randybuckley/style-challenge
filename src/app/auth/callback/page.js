// src/app/auth/callback/page.js
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
      // 1) Establish session
      const code = sp.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.warn('[callback] exchangeCodeForSession error:', error.message);
      } else {
        // hash-based fallback (older flows)
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

      // 2) Determine destination
      const queryNextRaw = sp.get('next') || '';

      // Only allow internal, relative paths
      const queryNext =
        queryNextRaw.startsWith('/') && !queryNextRaw.startsWith('//')
          ? queryNextRaw
          : '';

      let storedNext = null;
      try {
        storedNext = localStorage.getItem('pc_next');
      } catch {}

      try {
        localStorage.removeItem('pc_next');
      } catch {}

      // If we already have an explicit destination, honour it.
      const explicitNext = queryNext || storedNext;
      if (explicitNext) {
        if (!isMounted) return;
        router.replace(explicitNext);
        return;
      }

      // Otherwise: decide based on entitlement (source of truth).
      // Pro users -> /challenges/menu
      // Non-pro users -> MVP v6 default (/challenge/step1)
      let fallbackNext = '/challenge/step1';

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData?.session?.user || null;

        if (sessionUser) {
          const { data: entRows, error: entErr } = await supabase
            .from('user_entitlements')
            .select('tier')
            .eq('user_id', sessionUser.id)
            .eq('tier', 'pro')
            .limit(1);

          if (!entErr && entRows && entRows.length > 0) {
            fallbackNext = '/challenges/menu';
          }
        }
      } catch (err) {
        console.warn('[callback] entitlement fallback failed:', err);
        // Fail open to MVP v6 (existing behaviour)
      }

      if (!isMounted) return;
      router.replace(fallbackNext);
    };

    go();
    return () => {
      isMounted = false;
    };
  }, [router, sp]);

  return (
    <main style={{ padding: '2rem', textAlign: 'center', color: '#ccc' }}>
      Signing you in…
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: '2rem', textAlign: 'center', color: '#ccc' }}>
          Loading…
        </main>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}