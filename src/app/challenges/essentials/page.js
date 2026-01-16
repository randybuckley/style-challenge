// src/app/challenges/essentials/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import SignedInAs from '../../../components/SignedInAs';

export default function EssentialsCollectionPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isPro, setIsPro] = useState(false);

  // Loaded from DB
  const [essentialsChallenges, setEssentialsChallenges] = useState([]); // [{ id, slug, steps, sort_order, thumbnail_url }]

  // portfolio: 'not-started' | 'in-progress' | 'complete'
  const [portfolioStatus, setPortfolioStatus] = useState({});
  // certificate: 'not-submitted' | 'in-review' | 'approved' | 'rejected'
  const [certificateStatus, setCertificateStatus] = useState({});

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

  const normalizeStatus = (s) => (s || '').toString().trim().toLowerCase();

  const getCertificateStateFromRows = (rows) => {
    if (!rows || rows.length === 0) return 'not-submitted';

    const statuses = rows.map((r) => normalizeStatus(r.status));
    if (statuses.includes('approved')) return 'approved';
    if (statuses.includes('rejected')) return 'rejected';
    return 'in-review';
  };

  const prettifySlug = (slug) => {
    // essentials-classic-chignon -> Classic Chignon
    const raw = (slug || '').replace(/^essentials-/, '');
    return raw
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const resolveAssetUrl = (url) => {
    const u = (url || '').toString().trim();
    if (!u) return '';
    if (u.startsWith('http://') || u.startsWith('https://')) return u;

    // Supabase public storage URLs stored as "/storage/v1/object/public/..."
    if (u.startsWith('/storage/')) {
      if (!SUPABASE_URL) return u; // will fail, but avoids crashing if env missing
      return `${SUPABASE_URL}${u}`;
    }

    // Next.js public/ paths (e.g. "/style_one/finished_reference.jpeg")
    if (u.startsWith('/')) return u;

    return u;
  };

  const styles = useMemo(() => {
    return (essentialsChallenges || []).map((c, idx) => ({
      number: idx + 1,
      slug: c.slug,
      title: prettifySlug(c.slug),
      isLive: true,
      thumbSrc: resolveAssetUrl(c.thumbnail_url),
      launchHref: `/challenges/${c.slug}/step1`,
      requiredSteps: Array.isArray(c.steps) ? c.steps.length : 4,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [essentialsChallenges, SUPABASE_URL]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1) Session
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        const sessionUser = sessionData?.session?.user || null;
        if (!sessionUser) {
          router.replace(`/welcome-back?next=${encodeURIComponent('/challenges/essentials')}`);
          return;
        }

        if (cancelled) return;
        setUser(sessionUser);

        // 2) Entitlement
        const { data: entRows, error: entErr } = await supabase
          .from('user_entitlements')
          .select('tier')
          .eq('user_id', sessionUser.id)
          .eq('tier', 'pro')
          .limit(1);

        if (!cancelled) setIsPro(!entErr && !!entRows?.length);

        // 3) Load Essentials challenges from DB
        const { data: chRows, error: chErr } = await supabase
          .from('challenges')
          .select('id, slug, steps, sort_order, thumbnail_url')
          .like('slug', 'essentials-%')
          .order('sort_order', { ascending: true });

        if (chErr) throw chErr;

        const essentials = (chRows || []).filter((c) => c?.id && c?.slug);
        if (!cancelled) setEssentialsChallenges(essentials);

        // Build id->slug and required steps maps for portfolio computation
        const idToSlug = new Map();
        const requiredBySlug = {};
        essentials.forEach((c) => {
          idToSlug.set(c.id, c.slug);
          requiredBySlug[c.slug] = Array.isArray(c.steps) ? c.steps.length : 4;
        });

        // 4) Portfolio status from uploads
        const { data: uploadRows, error: uploadErr } = await supabase
          .from('uploads')
          .select('challenge_id, step_number')
          .eq('user_id', sessionUser.id);

        if (uploadErr) throw uploadErr;

        const stepsBySlug = new Map();
        for (const row of uploadRows || []) {
          const slug = idToSlug.get(row.challenge_id);
          if (!slug) continue; // ignore non-essentials uploads
          if (!stepsBySlug.has(slug)) stepsBySlug.set(slug, new Set());
          stepsBySlug.get(slug).add(row.step_number);
        }

        const portfolioBySlug = {};
        essentials.forEach((c) => {
          const slug = c.slug;
          const count = stepsBySlug.get(slug)?.size || 0;
          const required = requiredBySlug[slug] ?? 4;

          portfolioBySlug[slug] =
            count >= required ? 'complete' : count > 0 ? 'in-progress' : 'not-started';
        });

        if (!cancelled) setPortfolioStatus(portfolioBySlug);

        // 5) Certificate status from submissions
        const { data: submissionRows, error: subErr } = await supabase
          .from('submissions')
          .select('challenge_slug, status, submitted_at, reviewed_at')
          .eq('user_id', sessionUser.id);

        if (subErr) throw subErr;

        const rowsBySlug = new Map();
        for (const r of submissionRows || []) {
          const slug = r?.challenge_slug;
          if (!slug) continue;
          if (!rowsBySlug.has(slug)) rowsBySlug.set(slug, []);
          rowsBySlug.get(slug).push(r);
        }

        const certBySlug = {};
        essentials.forEach((c) => {
          certBySlug[c.slug] = getCertificateStateFromRows(rowsBySlug.get(c.slug) || []);
        });

        if (!cancelled) setCertificateStatus(certBySlug);
      } catch (e) {
        console.error('[essentials] load error:', e);
        if (!cancelled) setError('Something went wrong loading Essentials.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const portfolioPill = (slug) => {
    const state = portfolioStatus[slug] || 'not-started';
    return {
      state,
      style:
        state === 'complete'
          ? statusPillComplete
          : state === 'in-progress'
            ? statusPillProgress
            : statusPillIdle,
      text:
        state === 'complete'
          ? 'PORTFOLIO: COMPLETE'
          : state === 'in-progress'
            ? 'PORTFOLIO: IN PROGRESS'
            : 'PORTFOLIO: NOT STARTED',
    };
  };

  const certificatePill = (slug) => {
    const state = certificateStatus[slug] || 'not-submitted';
    return {
      state,
      style:
        state === 'approved'
          ? statusPillComplete
          : state === 'in-review'
            ? statusPillProgress
            : state === 'rejected'
              ? statusPillRejected
              : statusPillIdle,
      text:
        state === 'approved'
          ? 'CERTIFICATE: APPROVED'
          : state === 'in-review'
            ? 'CERTIFICATE: IN REVIEW'
            : state === 'rejected'
              ? 'CERTIFICATE: REJECTED'
              : 'CERTIFICATE: NOT SUBMITTED',
    };
  };

  if (loading) {
    return (
      <main style={loadingShell}>
        <p>Loading Essentials…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={loadingShell}>
        <p>Redirecting to sign-in…</p>
      </main>
    );
  }

  return (
    <div style={pageShell}>
      <main style={pageMain}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.1rem' }}>
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={260}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        {/* Signed-in identity strip + tier indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={identityRow}>
            <SignedInAs style={identityPill} />
            <span style={isPro ? proBadge : lockedBadge}>{isPro ? 'PRO UNLOCKED' : 'NOT UNLOCKED'}</span>
          </div>
        </div>

        {/* Title */}
        <section style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 1rem' }}>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: '#f9fafb' }}>
            Patrick Cameron Essentials
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: '#e5e7eb', lineHeight: 1.6 }}>
            A focused set of essential salon styles. Track your progress and launch each style from here.
          </p>
        </section>

        {!isPro && (
          <section style={{ maxWidth: 820, margin: '0 auto 1.1rem auto' }}>
            <div style={nonProCard}>
              <div style={{ color: '#e5e7eb', fontSize: '0.92rem' }}>
                You can browse the Essentials collection, but you’ll need to unlock Pro to launch Essentials styles and submit for certification.
              </div>
              <div style={{ marginTop: 12 }}>
                <Link href="/challenges/redeem" style={redeemButton}>
                  Redeem a promo code
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Grid */}
        <section style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={grid}>
            {styles.map((s) => {
              const p = portfolioPill(s.slug);
              const c = certificatePill(s.slug);

              const launchBlocked = !isPro;

              return (
                <div key={s.slug} style={{ ...tile, opacity: launchBlocked ? 0.85 : 1 }}>
                  <div style={thumbWrap}>
                    {s.thumbSrc ? (
                      <img
                        src={s.thumbSrc}
                        alt={s.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%' }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f9fafb' }}>
                      {s.title}
                    </div>

                    <div style={statusRow}>
                      <span style={p.style}>{p.text}</span>
                      <span style={c.style}>{c.text}</span>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      {launchBlocked ? (
                        <Link href="/challenges/redeem" style={lockedCta}>
                          Locked — redeem code
                        </Link>
                      ) : (
                        <Link href={s.launchHref} style={launchCta}>
                          Launch the challenge
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <Link href="/challenges/menu" style={backButton}>
              ← Back to Collections
            </Link>
          </div>

          {error ? <p style={errorText}>{error}</p> : null}
        </section>
      </main>
    </div>
  );
}

/* ---------------- styles ---------------- */

const pageShell = {
  minHeight: '100vh',
  backgroundColor: '#000',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
};

const pageMain = {
  width: '100%',
  maxWidth: 960,
  padding: '2.2rem 1.25rem 3rem',
  color: '#e5e7eb',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
};

const loadingShell = {
  minHeight: '100vh',
  backgroundColor: '#000',
  color: '#e5e7eb',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
};

const identityRow = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const identityPill = {
  fontSize: '0.85rem',
  color: '#9ca3af',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  padding: '0.35rem 0.65rem',
  borderRadius: 999,
};

const proBadge = {
  fontSize: '0.75rem',
  fontWeight: 800,
  padding: '0.35rem 0.6rem',
  borderRadius: 999,
  border: '1px solid rgba(34,197,94,0.45)',
  color: '#22c55e',
  whiteSpace: 'nowrap',
};

const lockedBadge = {
  ...proBadge,
  borderColor: 'rgba(250,204,21,0.45)',
  color: '#facc15',
};

const nonProCard = {
  borderRadius: 16,
  background: 'radial-gradient(circle at top, #020617 0, #020617 55%, #020617 100%)',
  border: '1px solid rgba(250,204,21,0.35)',
  padding: '0.95rem 1.05rem',
  textAlign: 'center',
};

const redeemButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.6rem 1.3rem',
  borderRadius: 999,
  background: 'linear-gradient(135deg, #facc15, #f59e0b, #facc15)',
  color: '#0b1120',
  fontSize: '0.88rem',
  fontWeight: 800,
  textDecoration: 'none',
  boxShadow: '0 12px 30px rgba(250,204,21,0.25)',
  whiteSpace: 'nowrap',
};

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '0.9rem',
};

const tile = {
  borderRadius: 14,
  border: '1px solid #111827',
  backgroundColor: '#020617',
  padding: '0.85rem 0.95rem',
  display: 'flex',
  gap: '0.85rem',
  alignItems: 'center',
};

const thumbWrap = {
  width: 72,
  height: 72,
  borderRadius: 12,
  overflow: 'hidden',
  border: '1px solid #111827',
  flexShrink: 0,
  backgroundColor: '#020617',
  display: 'grid',
  placeItems: 'center',
};

const statusRow = {
  marginTop: 8,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const statusPillBase = {
  fontSize: '0.7rem',
  fontWeight: 800,
  padding: '0.25rem 0.55rem',
  borderRadius: 999,
  letterSpacing: '0.03em',
  border: '1px solid rgba(255,255,255,0.12)',
  whiteSpace: 'nowrap',
};

const statusPillComplete = {
  ...statusPillBase,
  background: 'rgba(34,197,94,0.15)',
  color: '#22c55e',
  borderColor: 'rgba(34,197,94,0.35)',
};

const statusPillProgress = {
  ...statusPillBase,
  background: 'rgba(250,204,21,0.15)',
  color: '#facc15',
  borderColor: 'rgba(250,204,21,0.35)',
};

const statusPillIdle = {
  ...statusPillBase,
  background: 'rgba(148,163,184,0.12)',
  color: '#94a3b8',
  borderColor: 'rgba(148,163,184,0.25)',
};

const statusPillRejected = {
  ...statusPillBase,
  background: 'rgba(248,113,113,0.14)',
  color: '#f87171',
  borderColor: 'rgba(248,113,113,0.35)',
};

const launchCta = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.55rem 1.15rem',
  borderRadius: 999,
  background: 'linear-gradient(135deg, #22c55e, #16a34a, #22c55e)',
  color: '#0b1120',
  fontSize: '0.82rem',
  fontWeight: 700,
  textDecoration: 'none',
  boxShadow: '0 10px 24px rgba(34,197,94,0.35)',
  whiteSpace: 'nowrap',
};

const lockedCta = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.55rem 1.15rem',
  borderRadius: 999,
  border: '1px solid rgba(250,204,21,0.45)',
  backgroundColor: '#020617',
  color: '#facc15',
  fontSize: '0.82rem',
  fontWeight: 800,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const backButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.62rem 1.25rem',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#e5e7eb',
  fontSize: '0.86rem',
  fontWeight: 800,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const errorText = {
  marginTop: 18,
  color: '#fca5a5',
  textAlign: 'center',
};