'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import SignedInAs from '../../../components/SignedInAs';

export default function ChallengesMenuPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isPro, setIsPro] = useState(false);
  const [portfolioStatus, setPortfolioStatus] = useState({});
  const [certificateStatus, setCertificateStatus] = useState({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData?.session?.user;

        if (!sessionUser) {
          router.replace('/welcome-back?next=/challenges/menu');
          return;
        }

        if (cancelled) return;
        setUser(sessionUser);

        const { data: entitlements } = await supabase
          .from('user_entitlements')
          .select('tier')
          .eq('user_id', sessionUser.id)
          .eq('tier', 'pro')
          .limit(1);

        if (!cancelled) setIsPro(!!entitlements?.length);

        const { data: uploads } = await supabase
          .from('uploads')
          .select('challenge_id, step_number')
          .eq('user_id', sessionUser.id);

        const portfolio = {};
        uploads?.forEach((row) => {
          if (!portfolio[row.challenge_id]) {
            portfolio[row.challenge_id] = new Set();
          }
          portfolio[row.challenge_id].add(row.step_number);
        });

        const portfolioBySlug = {
          'starter-style':
            portfolio?.['starter-style']?.size === 4 ? 'complete' : 'in-progress',
        };

        const { data: submissions } = await supabase
          .from('submissions')
          .select('challenge_slug, status')
          .eq('user_id', sessionUser.id);

        const certificateBySlug = {
          'starter-style': submissions?.some(
            (s) => s.challenge_slug === 'starter-style' && s.status === 'approved'
          )
            ? 'complete'
            : 'in-progress',
        };

        if (!cancelled) {
          setPortfolioStatus(portfolioBySlug);
          setCertificateStatus(certificateBySlug);
        }
      } catch (e) {
        if (!cancelled) setError('Something went wrong loading your challenges.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <main style={loadingShell}>
        <p>Loading your collections…</p>
      </main>
    );
  }

  if (!user) return null;

  const essentialsCompleted =
    portfolioStatus['starter-style'] === 'complete' &&
    certificateStatus['starter-style'] === 'complete';

  return (
    <div style={pageShell}>
      <main style={pageMain}>
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
        <div style={identityRow}>
          <SignedInAs style={identityPill} />
          <span style={isPro ? proBadge : lockedBadge}>
            {isPro ? 'PRO UNLOCKED' : 'NOT UNLOCKED'}
          </span>
        </div>

        {/* Intro */}
        <section style={intro}>
          <h1 style={title}>Style Challenge Collections</h1>
          <p style={introText}>
            Complete challenges, build your portfolio, and submit your work for
            review. Approved work earns a Patrick Cameron certificate.
          </p>
        </section>

        {/* Starter Challenge */}
        <section style={cardSection}>
          <div style={card}>
            <div style={cardLeft}>
              <img
                src="/style_one/finished_reference.jpeg"
                alt="Starter Style Challenge"
                style={thumb}
              />
              <div>
                <div style={eyebrow}>Starter Challenge</div>
                <div style={cardTitle}>Starter Style Challenge</div>
                <p style={cardText}>
                  The original free challenge that introduces the Style Challenge
                  format.
                </p>
              </div>
            </div>

            <div style={cardRight}>
              <Link href="/challenges/starter-style/step1" style={greenButton}>
                Launch the challenge
              </Link>
            </div>
          </div>
        </section>

        {/* Essentials Collection */}
        <section style={collectionCard}>
          <div style={collectionInner}>
            <div style={collectionHeader}>
              <div style={eyebrow}>Collection One</div>
              <h2 style={collectionTitle}>Patrick Cameron Essentials</h2>
              <p style={collectionText}>
                A focused set of core styles designed to make you faster, calmer,
                and more profitable in the salon.
              </p>
            </div>

            <div style={collectionBody}>
              <div style={heroWrap}>
                <img
                  src="/collections/essentials-hero.jpeg"
                  alt="Patrick Cameron Essentials"
                  style={heroImg}
                />
                <span style={essentialsCompleted ? completedBadge : progressBadge}>
                  {essentialsCompleted ? 'COMPLETED' : 'IN PROGRESS'}
                </span>
              </div>

              <Link
                href="/challenges/essentials"
                style={greenButton}
              >
                Launch the collection
              </Link>
            </div>
          </div>
        </section>

        {/* Party Styles */}
        <section style={comingSoon}>
          <h3 style={comingTitle}>Party Styles</h3>
          <p style={comingText}>
            A party-hair collection for time-pressed stylists. Coming soon.
          </p>
        </section>

        {/* Bridal */}
        <section style={comingSoon}>
          <h3 style={comingTitle}>Essential Bridal</h3>
          <p style={comingText}>
            Bridal foundations and signature looks. Coming soon.
          </p>
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
};

const pageMain = {
  width: '100%',
  maxWidth: 960,
  padding: '2.5rem 1.25rem 3rem',
  color: '#e5e7eb',
  fontFamily:
    'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
};

const loadingShell = {
  minHeight: '100vh',
  background: '#000',
  color: '#e5e7eb',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const identityRow = {
  display: 'flex',
  justifyContent: 'center',
  gap: 10,
  marginBottom: 20,
};

const identityPill = {
  fontSize: '0.85rem',
  color: '#9ca3af',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
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
};

const lockedBadge = {
  ...proBadge,
  borderColor: 'rgba(250,204,21,0.45)',
  color: '#facc15',
};

const intro = { textAlign: 'center', marginBottom: 28 };
const title = { fontSize: '2rem', marginBottom: 8 };
const introText = { fontSize: '0.95rem', color: '#cbd5f5' };

const cardSection = { marginBottom: 30 };

const card = {
  borderRadius: 16,
  background: '#020617',
  border: '1px solid #1e293b',
  padding: '1.1rem 1.3rem',
  display: 'flex',
  justifyContent: 'space-between',
  gap: 20,
};

const cardLeft = { display: 'flex', gap: 16, alignItems: 'center' };
const cardRight = { display: 'flex', alignItems: 'center' };

const thumb = {
  width: 72,
  height: 72,
  borderRadius: 12,
  objectFit: 'contain',
};

const eyebrow = {
  fontSize: '0.75rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#9ca3af',
};

const cardTitle = { fontSize: '1rem', fontWeight: 600 };
const cardText = { fontSize: '0.85rem', color: '#cbd5f5' };

const greenButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.6rem 1.4rem',
  borderRadius: 999,
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  color: '#0b1120',
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const collectionCard = { marginBottom: 32 };
const collectionInner = {
  borderRadius: 16,
  background: '#020617',
  border: '1px solid #1f2937',
  padding: '1.6rem',
};

const collectionHeader = { textAlign: 'center', marginBottom: 16 };
const collectionTitle = { fontSize: '1.2rem', marginBottom: 6 };
const collectionText = { fontSize: '0.9rem', color: '#e5e7eb' };

const collectionBody = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
};

const heroWrap = {
  position: 'relative',
  width: 220,
};

const heroImg = {
  width: '100%',
  borderRadius: 14,
};

const completedBadge = {
  position: 'absolute',
  bottom: 8,
  left: 8,
  background: '#22c55e',
  color: '#0b1120',
  padding: '0.25rem 0.6rem',
  borderRadius: 999,
  fontSize: '0.7rem',
  fontWeight: 800,
};

const progressBadge = {
  ...completedBadge,
  background: '#facc15',
};

const comingSoon = {
  textAlign: 'center',
  opacity: 0.75,
  marginBottom: 22,
};

const comingTitle = { fontSize: '1rem', marginBottom: 4 };
const comingText = { fontSize: '0.85rem', color: '#cbd5f5' };

const errorText = {
  marginTop: 20,
  textAlign: 'center',
  color: '#fca5a5',
};