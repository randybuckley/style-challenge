// src/app/challenges/menu/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import SignedInAs from '../../../components/SignedInAs';

export default function ChallengesMenuPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isPro, setIsPro] = useState(false);

  // keyed by slug: 'not-started' | 'in-progress' | 'complete'
  const [portfolioStatus, setPortfolioStatus] = useState({});
  // keyed by slug: 'not-submitted' | 'in-review' | 'approved' | 'rejected'
  const [certificateStatus, setCertificateStatus] = useState({});

  const [isNarrow, setIsNarrow] = useState(false);

  // Collections from DB (public.collections)
  const [collections, setCollections] = useState([]);

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const FALLBACK_PLACEHOLDER =
    (SUPABASE_URL ? `${SUPABASE_URL}` : '') +
    '/storage/v1/object/public/assets/collections/placeholder.jpeg';

  const normalizeStatus = (s) => (s || '').toString().trim().toLowerCase();

  const resolvePublicUrl = (maybeUrl) => {
    if (!maybeUrl) return '';
    const u = maybeUrl.toString().trim();
    if (!u) return '';
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/storage/')) return (SUPABASE_URL || '') + u;
    return u;
  };

  const getCertificateStateFromRows = (rows) => {
    if (!rows || rows.length === 0) return 'not-submitted';

    const statuses = rows.map((r) => normalizeStatus(r.status));
    if (statuses.includes('approved')) return 'approved';
    if (statuses.includes('rejected')) return 'rejected';
    return 'in-review';
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia('(max-width: 520px)');
    const apply = () => setIsNarrow(!!mq.matches);

    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else mq.addListener(apply);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else mq.removeListener(apply);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setCollectionsLoading(true);
      setError(null);

      try {
        // Session
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        const sessionUser = sessionData?.session?.user || null;
        if (!sessionUser) {
          router.replace('/welcome-back?next=/challenges/menu');
          return;
        }
        if (cancelled) return;
        setUser(sessionUser);

        // Pro entitlement
        const { data: entitlements, error: entErr } = await supabase
          .from('user_entitlements')
          .select('tier')
          .eq('user_id', sessionUser.id)
          .eq('tier', 'pro')
          .limit(1);

        if (!cancelled) setIsPro(!entErr && !!entitlements?.length);

        // ------------------------------------------------------------
        // Load collections for menu cards (DB-driven; no redeploy needed)
        // status is constrained to: 'live' | 'coming-soon' | 'hidden'
        // ------------------------------------------------------------
        const { data: dbCollections, error: colErr } = await supabase
          .from('collections')
          .select(
            'id, slug, title, description, hero_image_url, placeholder_image_url, launch_path, sort_order, is_active, is_coming_soon, status'
          )
          .eq('is_active', true)
          .not('status', 'eq', 'hidden')
          .order('sort_order', { ascending: true });

        if (!colErr && Array.isArray(dbCollections)) {
          if (!cancelled) setCollections(dbCollections);
        } else if (colErr) {
          console.warn('[menu] collections load error:', colErr);
          if (!cancelled) setCollections([]);
        }

        if (!cancelled) setCollectionsLoading(false);

        // ------------------------------------------------------------
        // Progress + certificate only needed for:
        // - starter-style challenge card
        // - essentials badge (computed from essentials-* challenges)
        // ------------------------------------------------------------
        const { data: challenges, error: chErr } = await supabase
          .from('challenges')
          .select('id, slug, steps, sort_order')
          .or('slug.eq.starter-style,slug.like.essentials-%')
          .order('sort_order', { ascending: true });

        if (chErr) throw chErr;

        const challengeIdToSlug = {};
        const requiredStepsBySlug = {};
        const essentialsSlugsLocal = [];

        (challenges || []).forEach((c) => {
          if (!c?.id || !c?.slug) return;
          challengeIdToSlug[c.id] = c.slug;

          const required = Array.isArray(c.steps) ? c.steps.length : 4;
          requiredStepsBySlug[c.slug] = required;

          if (c.slug.startsWith('essentials-')) essentialsSlugsLocal.push(c.slug);
        });

        const { data: uploads, error: upErr } = await supabase
          .from('uploads')
          .select('challenge_id, step_number')
          .eq('user_id', sessionUser.id);

        if (upErr) throw upErr;

        const stepsBySlug = {};
        (uploads || []).forEach((row) => {
          const slug = challengeIdToSlug[row.challenge_id];
          if (!slug) return;
          if (!stepsBySlug[slug]) stepsBySlug[slug] = new Set();
          stepsBySlug[slug].add(row.step_number);
        });

        const portfolioBySlug = {};

        // Starter status
        const starterSlug = 'starter-style';
        const starterCount = stepsBySlug[starterSlug]?.size || 0;
        const starterRequired = requiredStepsBySlug[starterSlug] ?? 4;

        portfolioBySlug[starterSlug] =
          starterCount >= starterRequired ? 'complete' : starterCount > 0 ? 'in-progress' : 'not-started';

        // Essentials status (for badge)
        essentialsSlugsLocal.forEach((slug) => {
          const count = stepsBySlug[slug]?.size || 0;
          const required = requiredStepsBySlug[slug] ?? 4;

          portfolioBySlug[slug] = count >= required ? 'complete' : count > 0 ? 'in-progress' : 'not-started';
        });

        const { data: submissions, error: subErr } = await supabase
          .from('submissions')
          .select('challenge_slug, status, submitted_at, reviewed_at')
          .eq('user_id', sessionUser.id);

        if (subErr) throw subErr;

        const rowsBySlug = {};
        (submissions || []).forEach((s) => {
          const slug = s?.challenge_slug;
          if (!slug) return;
          if (!rowsBySlug[slug]) rowsBySlug[slug] = [];
          rowsBySlug[slug].push(s);
        });

        const certificateBySlug = {};
        certificateBySlug[starterSlug] = getCertificateStateFromRows(rowsBySlug[starterSlug] || []);

        essentialsSlugsLocal.forEach((slug) => {
          certificateBySlug[slug] = getCertificateStateFromRows(rowsBySlug[slug] || []);
        });

        if (!cancelled) {
          setPortfolioStatus(portfolioBySlug);
          setCertificateStatus(certificateBySlug);
        }
      } catch (e) {
        console.error('[menu] load error:', e);
        if (!cancelled) setError('Something went wrong loading your collections.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const starterPortfolioState = portfolioStatus['starter-style'] || 'not-started';
  const starterCertState = certificateStatus['starter-style'] || 'not-submitted';

  // Essentials badge logic (based on essentials-* challenges)
  const essentialsSlugs = useMemo(
    () => Object.keys(portfolioStatus).filter((s) => s.startsWith('essentials-')),
    [portfolioStatus]
  );

  const essentialsAllCompleteAndApproved =
    essentialsSlugs.length > 0 &&
    essentialsSlugs.every(
      (slug) => portfolioStatus[slug] === 'complete' && certificateStatus[slug] === 'approved'
    );

  const essentialsAnyStarted =
    essentialsSlugs.length > 0 &&
    essentialsSlugs.some((slug) => portfolioStatus[slug] !== 'not-started');

  // If collections table empty or failing, render sensible fallbacks
  const menuCollections = useMemo(() => {
    if (Array.isArray(collections) && collections.length > 0) return collections;

    return [
      {
        slug: 'essentials',
        title: 'Patrick Cameron Essentials',
        description: 'A focused set of core styles designed to make you faster, calmer, and more profitable in the salon.',
        hero_image_url: (SUPABASE_URL ? `${SUPABASE_URL}` : '') + '/storage/v1/object/public/assets/collections/essentials_hero.jpeg',
        placeholder_image_url: FALLBACK_PLACEHOLDER,
        launch_path: '/challenges/essentials',
        sort_order: 10,
        is_active: true,
        is_coming_soon: false,
        status: 'live',
      },
      {
        slug: 'party-styles',
        title: 'Party Styles',
        description: 'A party-hair collection for time-pressed stylists.',
        hero_image_url: '',
        placeholder_image_url: FALLBACK_PLACEHOLDER,
        launch_path: '',
        sort_order: 20,
        is_active: true,
        is_coming_soon: true,
        status: 'coming-soon',
      },
      {
        slug: 'essential-bridal',
        title: 'Essential Bridal',
        description: 'Bridal foundations and signature looks.',
        hero_image_url: '',
        placeholder_image_url: FALLBACK_PLACEHOLDER,
        launch_path: '',
        sort_order: 30,
        is_active: true,
        is_coming_soon: true,
        status: 'coming-soon',
      },
    ];
  }, [collections, SUPABASE_URL, FALLBACK_PLACEHOLDER]);

  if (loading) {
    return (
      <main style={loadingShell}>
        <p>Loading your collections…</p>
      </main>
    );
  }

  if (!user) return null;

  return (
    <div style={pageShell}>
      <main style={pageMain(isNarrow)}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={260}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        {/* Signed-in strip */}
        <div style={identityRow(isNarrow)}>
          <SignedInAs style={identityPill} />
          <span style={isPro ? proBadge : lockedBadge}>{isPro ? 'PRO UNLOCKED' : 'NOT UNLOCKED'}</span>
        </div>

        {/* Welcome (first person, Patrick) */}
        <section style={intro}>
          <h1 style={title}>Welcome</h1>
          <p style={introText}>
            I’m glad you’re here. This is where you choose your learning pathway.
            <br />
            If you’re new, start with <strong>Essentials</strong> first — it’s the core foundation before you move on
            to party or bridal work.
          </p>
        </section>

        {/* Starter Challenge (separate card) */}
        <section style={cardSection}>
          <div style={card(isNarrow)}>
            <div style={cardLeft}>
              <img src="/style_one/finished_reference.jpeg" alt="Starter Style Challenge" style={thumb} />
              <div style={{ minWidth: 0 }}>
                <div style={eyebrowMuted}>Free trial</div>

                <div style={cardTitle}>Starter Style Challenge</div>
                <p style={cardText}>
                  Try the Style Challenge experience — see how it works, upload your steps, and get your first result.
                </p>

                <div style={statusRow}>
                  <span
                    style={
                      starterPortfolioState === 'complete'
                        ? statusPillComplete
                        : starterPortfolioState === 'in-progress'
                        ? statusPillProgress
                        : statusPillIdle
                    }
                    title="Portfolio progress"
                  >
                    {starterPortfolioState === 'complete'
                      ? 'PORTFOLIO: COMPLETE'
                      : starterPortfolioState === 'in-progress'
                      ? 'PORTFOLIO: IN PROGRESS'
                      : 'PORTFOLIO: NOT STARTED'}
                  </span>

                  <span
                    style={
                      starterCertState === 'approved'
                        ? statusPillComplete
                        : starterCertState === 'in-review'
                        ? statusPillProgress
                        : starterCertState === 'rejected'
                        ? statusPillRejected
                        : statusPillIdle
                    }
                    title="Certificate progress"
                  >
                    {starterCertState === 'approved'
                      ? 'CERTIFICATE: APPROVED'
                      : starterCertState === 'in-review'
                      ? 'CERTIFICATE: IN REVIEW'
                      : starterCertState === 'rejected'
                      ? 'CERTIFICATE: REJECTED'
                      : 'CERTIFICATE: NOT SUBMITTED'}
                  </span>
                </div>
              </div>
            </div>

            <div style={cardRight(isNarrow)}>
              <Link href="/challenges/starter-style/step1" style={greenButton(isNarrow)}>
                Try this free challenge
              </Link>
            </div>
          </div>
        </section>

        {/* Collections (DB-driven) */}
        <section style={collectionsSection}>
          <div style={collectionsHeader}>
            <h2 style={collectionsTitle}>Collections</h2>
            <p style={collectionsText}>Choose a collection below. Essentials is the best place to start.</p>
          </div>

          <div style={collectionsGrid(isNarrow)}>
            {menuCollections.map((c) => {
              const status = normalizeStatus(c.status);
              const isComingSoon = status === 'coming-soon' || !!c.is_coming_soon;
              const isLive = status === 'live' && !isComingSoon;

              const heroUrl =
                resolvePublicUrl(c.hero_image_url) ||
                resolvePublicUrl(c.placeholder_image_url) ||
                FALLBACK_PLACEHOLDER;

              const isEssentials = c.slug === 'essentials';

              // ✅ FIX: Essentials should NOT default to "IN PROGRESS" when nothing has started
              let badgeText = 'LIVE';
              let badgeStyle = liveBadge;

              if (isComingSoon) {
                badgeText = 'COMING SOON';
                badgeStyle = comingSoonBadge;
              } else if (isEssentials) {
                if (essentialsSlugs.length === 0) {
                  // No essentials-* challenges found → don’t invent progress
                  badgeText = 'LIVE';
                  badgeStyle = liveBadge;
                } else if (essentialsAllCompleteAndApproved) {
                  badgeText = 'COMPLETED';
                  badgeStyle = completedBadge;
                } else if (essentialsAnyStarted) {
                  badgeText = 'IN PROGRESS';
                  badgeStyle = progressBadge;
                } else {
                  badgeText = 'NOT STARTED';
                  badgeStyle = notStartedBadge;
                }
              }

              const canLaunch = isLive && !!c.launch_path;

              return (
                <div key={c.id || c.slug} style={collectionCard}>
                  <div style={collectionInner}>
                    <div style={collectionHeaderBlock}>
                      <div style={eyebrow}>Collection</div>
                      <h3 style={collectionTitle}>{c.title || 'Untitled Collection'}</h3>
                      <p style={collectionDesc}>{c.description || ''}</p>
                    </div>

                    <div style={collectionBody}>
                      <div style={heroWrap}>
                        <img src={heroUrl} alt={c.title || 'Collection hero'} style={heroImg} />
                        <span style={badgeStyle}>{badgeText}</span>
                      </div>

                      {canLaunch ? (
                        <Link href={c.launch_path} style={greenButton(isNarrow)}>
                          Launch the collection
                        </Link>
                      ) : (
                        <div style={disabledButton(isNarrow)}>Coming soon</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {collectionsLoading && (
            <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: 12 }}>
              Loading collections…
            </p>
          )}
        </section>

        {error && <p style={errorText}>{error}</p>}
      </main>
    </div>
  );
}

/* ---------------- styles ---------------- */

const pageShell = {
  minHeight: '100vh',
  background: '#000',
  display: 'flex',
  justifyContent: 'center',
  overflowX: 'hidden',
};

const pageMain = (isNarrow) => ({
  width: '100%',
  maxWidth: 960,
  padding: isNarrow ? '2.2rem 1rem 3rem' : '2.5rem 1.25rem 3rem',
  color: '#e5e7eb',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  boxSizing: 'border-box',
});

const loadingShell = {
  minHeight: '100vh',
  background: '#000',
  color: '#e5e7eb',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const identityRow = (isNarrow) => ({
  display: 'flex',
  justifyContent: 'center',
  gap: 10,
  marginBottom: 20,
  flexWrap: 'wrap',
  padding: isNarrow ? '0 6px' : 0,
  boxSizing: 'border-box',
});

const identityPill = {
  fontSize: '0.85rem',
  color: '#9ca3af',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  padding: '0.35rem 0.65rem',
  borderRadius: 999,
  maxWidth: '100%',
  boxSizing: 'border-box',
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

const intro = { textAlign: 'center', marginBottom: 26 };
const title = { fontSize: '2rem', marginBottom: 8 };
const introText = { fontSize: '0.95rem', color: '#cbd5f5', lineHeight: 1.55 };

const cardSection = { marginBottom: 28 };

const card = (isNarrow) => ({
  borderRadius: 16,
  background: '#020617',
  border: '1px solid #1e293b',
  padding: '1.1rem 1.3rem',
  display: 'flex',
  flexDirection: isNarrow ? 'column' : 'row',
  justifyContent: 'space-between',
  alignItems: isNarrow ? 'stretch' : 'center',
  gap: isNarrow ? 14 : 20,
  boxSizing: 'border-box',
  overflow: 'hidden',
});

const cardLeft = { display: 'flex', gap: 16, alignItems: 'center' };

const cardRight = (isNarrow) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: isNarrow ? 'stretch' : 'flex-end',
});

const thumb = {
  width: 72,
  height: 72,
  borderRadius: 12,
  objectFit: 'contain',
  flexShrink: 0,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
};

const eyebrow = {
  fontSize: '0.75rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#9ca3af',
};

const eyebrowMuted = {
  ...eyebrow,
  color: '#94a3b8',
  opacity: 0.9,
};

const cardTitle = { fontSize: '1rem', fontWeight: 600 };
const cardText = { fontSize: '0.85rem', color: '#cbd5f5', margin: 0 };

const greenButton = (isNarrow) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.6rem 1.4rem',
  borderRadius: 999,
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  color: '#0b1120',
  fontWeight: 800,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  width: isNarrow ? '100%' : 'auto',
  boxSizing: 'border-box',
});

const disabledButton = (isNarrow) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.6rem 1.4rem',
  borderRadius: 999,
  background: 'rgba(148,163,184,0.12)',
  color: '#94a3b8',
  fontWeight: 800,
  border: '1px solid rgba(148,163,184,0.25)',
  width: isNarrow ? '100%' : 'auto',
  boxSizing: 'border-box',
});

const statusRow = {
  marginTop: 10,
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

const collectionsSection = { marginTop: 10 };
const collectionsHeader = { textAlign: 'center', marginBottom: 14 };
const collectionsTitle = { fontSize: '1.35rem', marginBottom: 6 };
const collectionsText = { fontSize: '0.9rem', color: '#cbd5f5', margin: 0 };

const collectionsGrid = (isNarrow) => ({
  display: 'grid',
  gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr',
  gap: 14,
});

const collectionCard = { marginBottom: 0 };

const collectionInner = {
  borderRadius: 16,
  background: '#020617',
  border: '1px solid #1f2937',
  padding: '1.4rem',
  height: '100%',
  boxSizing: 'border-box',
};

const collectionHeaderBlock = { textAlign: 'center', marginBottom: 14 };

const collectionTitle = { fontSize: '1.1rem', margin: '6px 0 6px' };
const collectionDesc = { fontSize: '0.9rem', color: '#e5e7eb', margin: 0, lineHeight: 1.45 };

const collectionBody = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
};

const heroWrap = {
  position: 'relative',
  width: 240,
  maxWidth: '100%',
};

const heroImg = {
  width: '100%',
  borderRadius: 14,
  display: 'block',
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(255,255,255,0.03)',
};

const baseBadge = {
  position: 'absolute',
  bottom: 8,
  left: 8,
  padding: '0.25rem 0.6rem',
  borderRadius: 999,
  fontSize: '0.7rem',
  fontWeight: 900,
  letterSpacing: '0.03em',
};

const completedBadge = {
  ...baseBadge,
  background: '#22c55e',
  color: '#0b1120',
};

const progressBadge = {
  ...baseBadge,
  background: '#facc15',
  color: '#0b1120',
};

const notStartedBadge = {
  ...baseBadge,
  background: 'rgba(148,163,184,0.95)',
  color: '#0b1120',
};

const comingSoonBadge = {
  ...baseBadge,
  background: 'rgba(148,163,184,0.95)',
  color: '#0b1120',
};

const liveBadge = {
  ...baseBadge,
  background: 'rgba(34,197,94,0.25)',
  color: '#22c55e',
  border: '1px solid rgba(34,197,94,0.35)',
};

const errorText = {
  marginTop: 18,
  textAlign: 'center',
  color: '#fca5a5',
};