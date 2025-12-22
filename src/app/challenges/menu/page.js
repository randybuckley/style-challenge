'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

export default function ChallengesMenuPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [challenges, setChallenges] = useState([]);

  // status keyed by slug: 'in-progress' | 'complete'
  const [portfolioStatus, setPortfolioStatus] = useState({});
  const [certificateStatus, setCertificateStatus] = useState({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      // 1. Session
      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();

      if (sessionErr) {
        console.error('Session error:', sessionErr.message);
        if (!cancelled) {
          setError('Error checking your session.');
          setLoading(false);
        }
        return;
      }

      const sessionUser = sessionData?.session?.user || null;
      if (!sessionUser) {
        router.replace(
          `/welcome-back?next=${encodeURIComponent('/challenges/menu')}`,
        );
        return;
      }

      if (cancelled) return;
      setUser(sessionUser);

      // 2. Load challenges (for now, just the one 'starter-style')
      const { data: challengeData, error: challengeErr } = await supabase
        .from('challenges')
        .select('id, slug, title, tier, is_pro_only, thumbnail_url, is_active')
        .eq('is_active', true)
        .order('id', { ascending: true });

      if (challengeErr) {
        console.error('Challenge error:', challengeErr.message);
        if (!cancelled) {
          setError('Error loading challenges.');
          setLoading(false);
        }
        return;
      }

      const cleaned = (challengeData || []).map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title || 'Untitled Challenge',
        tier: c.tier || null,
        is_pro_only: !!c.is_pro_only,
        thumbnail_url: c.thumbnail_url || null,
      }));

      if (cancelled) return;
      setChallenges(cleaned);

      // 3. Portfolio status from uploads table
      const { data: uploadRows, error: uploadErr } = await supabase
        .from('uploads')
        .select('challenge_id, step_number')
        .eq('user_id', sessionUser.id);

      const portfolioBySlug = {};

      if (!uploadErr && uploadRows && uploadRows.length > 0) {
        // Build challenge_id -> set of step_numbers
        const byChallengeId = new Map();

        for (const row of uploadRows) {
          if (!row.challenge_id) continue;
          if (!byChallengeId.has(row.challenge_id)) {
            byChallengeId.set(row.challenge_id, new Set());
          }
          byChallengeId.get(row.challenge_id).add(row.step_number);
        }

        // For each challenge we know about, check if steps 1–4 exist
        for (const ch of cleaned) {
          const stepSet = byChallengeId.get(ch.id);
          if (stepSet &&
              stepSet.has(1) &&
              stepSet.has(2) &&
              stepSet.has(3) &&
              stepSet.has(4)) {
            portfolioBySlug[ch.slug] = 'complete';
          } else {
            portfolioBySlug[ch.slug] = 'in-progress';
          }
        }
      } else {
        // If uploads query fails, default everything to in-progress
        for (const ch of cleaned) {
          portfolioBySlug[ch.slug] = 'in-progress';
        }
      }

      if (!cancelled) {
        setPortfolioStatus(portfolioBySlug);
      }

      // 4. Certificate status from certifications table (if present)
      const certificateBySlug = {};
      try {
        const { data: certRows, error: certErr } = await supabase
          .from('certifications')
          .select('challenge_id, status')
          .eq('user_id', sessionUser.id);

        if (!certErr && certRows && certRows.length > 0) {
          const byChallengeId = new Map();
          for (const row of certRows) {
            if (!row.challenge_id) continue;
            const status = (row.status || '').toLowerCase();
            // Treat any row with status 'approved' as complete
            if (!byChallengeId.has(row.challenge_id)) {
              byChallengeId.set(row.challenge_id, status === 'approved');
            } else if (status === 'approved') {
              byChallengeId.set(row.challenge_id, true);
            }
          }

          for (const ch of cleaned) {
            const approved = byChallengeId.get(ch.id) === true;
            certificateBySlug[ch.slug] = approved
              ? 'complete'
              : 'in-progress';
          }
        } else {
          // If no rows or error, default to in-progress
          for (const ch of cleaned) {
            certificateBySlug[ch.slug] = 'in-progress';
          }
        }
      } catch (err) {
        console.warn('Certificate status check failed:', err);
        for (const ch of cleaned) {
          certificateBySlug[ch.slug] = 'in-progress';
        }
      }

      if (!cancelled) {
        setCertificateStatus(certificateBySlug);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const starterChallenge =
    challenges.find((ch) => ch.slug === 'starter-style') || null;

  // helper for label + colour
  const getPortfolioLabel = (slug) => {
    const status = portfolioStatus[slug] || 'in-progress';
    const complete = status === 'complete';
    return {
      text: complete ? 'Portfolio – complete' : 'Portfolio – in progress',
      color: complete ? '#facc15' : '#e5e7eb',
    };
  };

  const getCertificateLabel = (slug) => {
    const status = certificateStatus[slug] || 'in-progress';
    const complete = status === 'complete';
    return {
      text: complete ? 'Certificate – complete' : 'Certificate – in progress',
      color: complete ? '#facc15' : '#e5e7eb',
    };
  };

  if (loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          backgroundColor: '#000',
          color: '#e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <p>Loading your collections…</p>
      </main>
    );
  }

  if (!user) {
    // We’ll almost never see this because of the redirect, but just in case
    return (
      <main
        style={{
          minHeight: '100vh',
          backgroundColor: '#000',
          color: '#e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <p>Redirecting to sign-in…</p>
      </main>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#000',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <main
        style={{
          width: '100%',
          maxWidth: 960,
          padding: '2.5rem 1.25rem 3rem',
          color: '#e5e7eb',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {/* Logo */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <Image
            src="/logo.jpeg"
            alt="Patrick Cameron Style Challenge"
            width={260}
            height={0}
            style={{ height: 'auto', maxWidth: '100%' }}
            priority
          />
        </div>

        {/* Page title */}
        <section
          style={{
            textAlign: 'center',
            maxWidth: 720,
            margin: '0 auto 2rem auto',
          }}
        >
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 600,
              color: '#f9fafb',
              marginBottom: '0.5rem',
            }}
          >
            Style Challenge Collections
          </h1>
          <p
            style={{
              fontSize: '0.98rem',
              lineHeight: 1.6,
              color: '#e5e7eb',
              marginBottom: 0,
            }}
          >
            Complete the challenge, upload your photos to build your
            professional portfolio to share. When you’re ready, submit your work
            for review — and if approved, I’ll award you with a Patrick Cameron
            certificate.
          </p>
        </section>

        {/* Starter challenge block */}
        {starterChallenge && (
          <section
            style={{
              maxWidth: 780,
              margin: '0 auto 2.1rem auto',
            }}
          >
            <div
              style={{
                borderRadius: 16,
                background:
                  'radial-gradient(circle at top, #020617 0, #020617 45%, #020617 100%)',
                border: '1px solid #1e293b',
                padding: '1.1rem 1.3rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.9rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.9rem',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.9rem',
                    flex: '1 1 260px',
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 14,
                      overflow: 'hidden',
                      border: '1px solid #1f2937',
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src="/style_one/finished_reference.jpeg"
                      alt="Starter Style finished look"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: '#9ca3af',
                        marginBottom: '0.2rem',
                      }}
                    >
                      Starter Challenge
                    </div>
                    <div
                      style={{
                        fontSize: '0.98rem',
                        fontWeight: 600,
                        color: '#f9fafb',
                        marginBottom: '0.2rem',
                      }}
                    >
                      Starter Style Challenge
                    </div>
                    <p
                      style={{
                        fontSize: '0.86rem',
                        color: '#cbd5f5',
                        margin: 0,
                      }}
                    >
                      Launch the original free challenge that introduces the
                      Style Challenge format.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '0.45rem',
                  }}
                >
                  <Link
                    href="/challenge/step1"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.65rem 1.5rem',
                      borderRadius: 999,
                      background:
                        'linear-gradient(135deg, #22c55e, #16a34a, #22c55e)',
                      color: '#0b1120',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      boxShadow: '0 12px 30px rgba(34,197,94,0.35)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Launch the challenge
                  </Link>

                  {/* Progress labels */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.75rem',
                      fontSize: '0.8rem',
                    }}
                  >
                    {(() => {
                      const p = getPortfolioLabel(starterChallenge.slug);
                      const c = getCertificateLabel(starterChallenge.slug);
                      return (
                        <>
                          <span style={{ color: p.color }}>{p.text}</span>
                          <span style={{ color: c.color }}>{c.text}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Collection One – Essentials */}
        <section
          style={{
            maxWidth: 780,
            margin: '0 auto 2.1rem auto',
          }}
        >
          <div
            style={{
              borderRadius: 16,
              background:
                'radial-gradient(circle at top, #020617 0, #020617 55%, #020617 100%)',
              border: '1px solid #1f2937',
              padding: '1.3rem 1.3rem 1.6rem',
            }}
          >
            <div
              style={{
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#9ca3af',
                textAlign: 'center',
                marginBottom: '0.35rem',
              }}
            >
              Collection One
            </div>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 600,
                color: '#f9fafb',
                textAlign: 'center',
                marginBottom: '0.3rem',
              }}
            >
              Patrick Cameron Essentials
            </h2>
            <p
              style={{
                fontSize: '0.9rem',
                lineHeight: 1.6,
                color: '#e5e7eb',
                textAlign: 'center',
                maxWidth: 640,
                margin: '0 auto 1.1rem auto',
              }}
            >
              Ten styles, easy to learn yet powerful in the salon. Equip
              yourself with key achievable looks your clients will love and you
              can make money with in the salon.
            </p>

            {/* Essentials grid – 2 columns */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '0.9rem',
              }}
            >
              {Array.from({ length: 10 }).map((_, index) => {
                const styleNumber = index + 1;

                // For now, Style 1 uses the real starter-style slug.
                const slug =
                  styleNumber === 1 ? 'starter-style' : `essentials-${styleNumber}`;

                const isLive = styleNumber === 1; // others "coming soon" for now

                const thumbSrc = '/style_one/finished_reference.jpeg';

                const portfolio = getPortfolioLabel(slug);
                const certificate = getCertificateLabel(slug);

                return (
                  <div
                    key={styleNumber}
                    style={{
                      borderRadius: 14,
                      border: '1px solid #111827',
                      backgroundColor: '#020617',
                      padding: '0.8rem 0.9rem',
                      display: 'flex',
                      gap: '0.8rem',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 68,
                        height: 68,
                        borderRadius: 12,
                        overflow: 'hidden',
                        border: '1px solid #111827',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={thumbSrc}
                        alt={`Essentials Style ${styleNumber}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          color: '#f9fafb',
                          marginBottom: '0.15rem',
                        }}
                      >
                        Essentials Style {styleNumber}
                      </div>

                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: '#e5e7eb',
                          marginBottom: '0.45rem',
                        }}
                      >
                        <div style={{ marginBottom: 2, color: portfolio.color }}>
                          {portfolio.text}
                        </div>
                        <div style={{ color: certificate.color }}>
                          {certificate.text}
                        </div>
                      </div>

                      {isLive ? (
                        <Link
                          href={`/challenges/${slug}/step1`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0.55rem 1.2rem',
                            borderRadius: 999,
                            background:
                              'linear-gradient(135deg, #22c55e, #16a34a, #22c55e)',
                            color: '#0b1120',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                            boxShadow: '0 10px 24px rgba(34,197,94,0.35)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Launch the challenge
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          style={{
                            padding: '0.5rem 1.1rem',
                            borderRadius: 999,
                            border: '1px dashed #4b5563',
                            backgroundColor: '#020617',
                            color: '#9ca3af',
                            fontSize: '0.8rem',
                            cursor: 'not-allowed',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Coming soon
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Collection Two – Party Styles (coming soon) */}
        <section
          style={{
            maxWidth: 780,
            margin: '0 auto',
          }}
        >
          <div
            style={{
              borderRadius: 16,
              background:
                'radial-gradient(circle at top, #020617 0, #020617 55%, #020617 100%)',
              border: '1px solid #1f2937',
              padding: '1.1rem 1.3rem 1.4rem',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#9ca3af',
                marginBottom: '0.35rem',
              }}
            >
              Collection Two
            </div>
            <h2
              style={{
                fontSize: '1.05rem',
                fontWeight: 600,
                color: '#f9fafb',
                marginBottom: '0.3rem',
              }}
            >
              Party Styles – coming soon
            </h2>
            <p
              style={{
                fontSize: '0.88rem',
                lineHeight: 1.5,
                color: '#e5e7eb',
                maxWidth: 540,
                margin: '0 auto',
              }}
            >
              A full party-hair collection designed for time-pressed stylists
              who need beautiful, camera-ready looks that photograph well and
              keep clients coming back.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}