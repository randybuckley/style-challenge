-- ============================================================
-- STYLE CHALLENGE — SUPABASE SCHEMA REFERENCE
-- Patrick Cameron / randybuckley
-- Last updated: March 2026
-- ============================================================
-- Paste this file into any AI session to provide instant
-- context about the database structure.
-- ============================================================


-- PROFILES
-- One row per user. Extended from auth.users.
-- is_pro is the fast-path Pro check (also enforced via user_entitlements).
CREATE TABLE profiles (
  id                  uuid PRIMARY KEY,           -- matches auth.users.id
  email               text,
  first_name          text,
  second_name         text,
  salon_name          text,
  is_pro              boolean NOT NULL,
  is_pro_since        timestamptz,
  media_consent       boolean,
  media_consent_at    timestamptz,
  social_platform     text,
  social_handle       text,
  vimeo_customer_id   text,
  updated_at          timestamptz
);

-- CHALLENGES
-- Defines individual styling challenges.
-- tier and is_pro_only control access.
-- collection_slug links to collections.
CREATE TABLE challenges (
  id              uuid PRIMARY KEY,
  slug            text NOT NULL UNIQUE,
  title           text NOT NULL,
  description     text,
  tier            text NOT NULL,
  steps           jsonb NOT NULL,
  thumbnail_url   text,
  is_active       boolean,
  is_pro_only     boolean NOT NULL,
  release_date    date,
  sort_order      integer,
  collection_slug text,
  created_at      timestamptz
);

-- COLLECTIONS
-- Groups of challenges (e.g. Essentials, Red Carpet).
-- Controls menu structure and visibility.
CREATE TABLE collections (
  id                    uuid PRIMARY KEY,
  slug                  text NOT NULL UNIQUE,
  title                 text NOT NULL,
  description           text,
  sort_order            integer NOT NULL,
  status                text NOT NULL,
  launch_path           text,
  hero_image_url        text,
  placeholder_image_url text,
  is_active             boolean NOT NULL,
  is_coming_soon        boolean NOT NULL,
  created_at            timestamptz NOT NULL,
  updated_at            timestamptz NOT NULL
);

-- UPLOADS
-- All stylist image submissions.
-- step_number: 1, 2, 3 = steps, 4 = finished look.
-- challenge_id links upload to a specific challenge.
CREATE TABLE uploads (
  id                uuid PRIMARY KEY,
  user_id           uuid NOT NULL,   -- FK to profiles.id
  step_number       integer,
  image_url         text,
  original_image_url text,
  type              text,
  challenge_id      uuid,            -- FK to challenges.id
  created_at        timestamptz
);

-- SUBMISSIONS
-- Created when a stylist submits work for certification.
-- review_token is used in Patrick's approve/reject email links.
-- unique constraint: user_id + challenge_id (one submission per challenge per user).
CREATE TABLE submissions (
  id              uuid PRIMARY KEY,
  user_id         uuid,              -- FK to profiles.id
  challenge_id    uuid NOT NULL,     -- FK to challenges.id
  challenge_slug  text,
  email           text,
  first_name      text,
  second_name     text,
  salon_name      text,
  step1_url       text,
  step2_url       text,
  step3_url       text,
  finished_url    text,
  review_token    uuid NOT NULL,
  status          text,
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  reviewer        text,
  reviewer_email  text,
  feedback        text,
  reason          text,
  comments        text,
  decision_reason text,
  decision_notes  text
);

-- USER_ENTITLEMENTS
-- Single source of truth for Pro access.
-- unique constraint: (user_id, tier) — one active Pro per user.
-- NOTE: profiles.is_pro is a fast-path cache of this table.
-- (This table is the authoritative source.)

-- PROMO_CODES
-- Grants Pro access via codes.
CREATE TABLE promo_codes (
  id          uuid PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  tier        text NOT NULL,
  max_uses    integer,
  uses        integer,
  used_count  integer NOT NULL,
  is_active   boolean NOT NULL,
  expires_at  timestamptz,
  created_at  timestamptz
);

-- VIMEO_OTT_EVENTS
-- Incoming webhook events from Vimeo OTT subscriptions.
-- Acts as audit log and processing queue.
-- Trigger on insert updates user_entitlements automatically.

-- CERTIFICATIONS
-- Built but not yet used (0 rows).
-- Future feature: database-driven certification tracking.
CREATE TABLE certifications (
  id            uuid PRIMARY KEY,
  user_id       uuid,              -- FK to profiles.id
  challenge_id  uuid,              -- FK to challenges.id
  status        text NOT NULL,
  certified_at  timestamptz,
  reviewer      text,
  notes         text,
  created_at    timestamptz
);

-- REVIEW_TOKENS
-- Old submission system. Currently empty (0 rows).
-- Superseded by submissions.review_token.
-- Kept for backwards compatibility with old email links.

-- UPLOADS_WITH_EMAIL
-- Admin reporting view — joins uploads with user email.
-- Used by Patrick/Randy to track uploads by email rather than user_id.

-- VIMEO_OTT_PENDING
-- Processing queue for Vimeo webhook events. Currently empty.

-- ============================================================
-- KEY RELATIONSHIPS
-- profiles.id         → uploads.user_id
-- profiles.id         → submissions.user_id
-- profiles.id         → certifications.user_id
-- challenges.id       → submissions.challenge_id
-- challenges.id       → uploads.challenge_id
-- challenges.id       → certifications.challenge_id
-- challenges.slug     → collections.slug (via collection_slug)

-- ============================================================
-- ACTIVE DATA (as of March 2026)
-- profiles:          108 rows
-- uploads:           460 rows
-- challenges:         17 rows
-- collections:         4 rows
-- submissions:      active
-- user_entitlements: 14 rows
-- vimeo_ott_events: 261 rows
-- certifications:     0 rows (unused)
-- review_tokens:      0 rows (legacy)
-- vimeo_ott_pending:  0 rows

-- ============================================================
-- PRO ACCESS FLOW
-- Promo code:   promo_codes → user_entitlements
-- Subscription: vimeo_ott_events → trigger → user_entitlements
-- Fast check:   profiles.is_pro (cached boolean)

-- ============================================================
-- CERTIFICATION FLOW (active)
-- User submits → submissions table created
-- → /api/review/submit sends email to info@accesslonghair.com
-- → Patrick clicks Approve → /api/review/decision
-- → Patrick clicks Reject → /review/[token] page
-- → Approved: user downloads certificate PDF from /result/approved
-- ============================================================
