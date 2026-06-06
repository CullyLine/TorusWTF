import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * torus.wtf — SQLite schema.
 *
 * Conventions:
 *   - Primary keys are text CUIDs (generated app-side via @torus/shared).
 *   - All timestamps are integer Unix ms (milliseconds since epoch).
 *   - Foreign keys + WAL mode are enabled at connection time, see ./client.ts.
 */

// ---------- Users + sessions ----------

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    handle: text('handle').notNull(),
    email: text('email'),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    role: text('role', { enum: ['user', 'admin'] })
      .notNull()
      .default('user'),
    tier: text('tier', { enum: ['free', 'supporter'] })
      .notNull()
      .default('free'),
    tierStartedAt: integer('tier_started_at'),
    tierExpiresAt: integer('tier_expires_at'),
    paymentCustomerId: text('payment_customer_id'),
    /**
     * Cached credit balance in credits (1 credit = 1 US cent). Source of truth is
     * the append-only credits_ledger; this is a denormalized cache kept in sync
     * inside the same transaction as every ledger write for O(1) balance reads.
     */
    creditBalance: integer('credit_balance').notNull().default(0),
    customSubdomain: text('custom_subdomain'),
    discordId: text('discord_id'),
    isBanned: integer('is_banned', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex('users_handle_unique').on(sql`lower(${t.handle})`),
    uniqueIndex('users_email_unique').on(t.email),
    uniqueIndex('users_subdomain_unique').on(t.customSubdomain),
    uniqueIndex('users_discord_unique').on(t.discordId),
  ],
);

/** Previous handles for a user — old /u/<handle> URLs redirect to the current profile. */
export const handleHistory = sqliteTable(
  'handle_history',
  {
    id: text('id').primaryKey(),
    oldHandle: text('old_handle').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    changedAt: integer('changed_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex('handle_history_lower_unique').on(sql`lower(${t.oldHandle})`)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** Single-use magic-link login tokens (email auth). Short-lived. */
export const magicLinks = sqliteTable(
  'magic_links',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index('magic_links_email_idx').on(t.email),
    uniqueIndex('magic_links_token_unique').on(t.tokenHash),
  ],
);

// ---------- Clips ----------

export const clips = sqliteTable(
  'clips',
  {
    id: text('id').primaryKey(),
    shareCode: text('share_code').notNull(),
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title'),
    description: text('description'),

    /** Display name for anonymous uploads (signed-in clips use owner handle). */
    creatorDisplayName: text('creator_display_name'),

    /** Original filename (for "download original" UX). */
    originalFilename: text('original_filename'),

    /** Bytes of the original upload — used for quota accounting. */
    originalBytes: integer('original_bytes'),

    durationMs: integer('duration_ms'),

    /** Storage keys — see @torus/storage StorageKeys. Filled by worker as it processes. */
    originalKey: text('original_key'),
    opusKey: text('opus_key'),
    peaksKey: text('peaks_key'),
    spectrogramKey: text('spectrogram_key'),
    ogImageKey: text('og_image_key'),

    /** JSON: { bass: "#FF2D95", mid: "#22D3CE", high: "#F7E08C" } */
    waveformPalette: text('waveform_palette'),

    visualizerPreset: text('visualizer_preset', {
      enum: ['torus_field', 'particle_storm', 'spectral_tunnel', 'volumetric_waveform', 'none'],
    }),

    status: text('status', { enum: ['pending', 'processing', 'ready', 'failed'] })
      .notNull()
      .default('pending'),

    /** Set when processing fails so we can show a meaningful error on the share page. */
    statusError: text('status_error'),

    visibility: text('visibility', { enum: ['public', 'unlisted'] })
      .notNull()
      .default('public'),

    /** Owner can prevent visitors from downloading the original. */
    allowDownload: integer('allow_download', { mode: 'boolean' }).notNull().default(false),

    playCount: integer('play_count').notNull().default(0),

    /** Single-use token written to localStorage for anonymous uploads, redeemed at signup. */
    claimToken: text('claim_token'),

    /** Soft-delete — see also reports / moderation flow. */
    deletedAt: integer('deleted_at'),
    deletedReason: text('deleted_reason'),

    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex('clips_share_code_unique').on(t.shareCode),
    index('clips_owner_idx').on(t.ownerId),
    index('clips_created_idx').on(t.createdAt),
    index('clips_status_idx').on(t.status),
    uniqueIndex('clips_claim_token_unique').on(t.claimToken),
  ],
);

// ---------- Lightweight metadata ----------

export const clipTags = sqliteTable(
  'clip_tags',
  {
    clipId: text('clip_id')
      .notNull()
      .references(() => clips.id, { onDelete: 'cascade' }),
    /** Examples: genre:dubstep, bpm:140, key:fminor */
    tag: text('tag').notNull(),
  },
  (t) => [primaryKey({ columns: [t.clipId, t.tag] }), index('clip_tags_tag_idx').on(t.tag)],
);

// ---------- Community ----------

export const votes = sqliteTable(
  'votes',
  {
    clipId: text('clip_id')
      .notNull()
      .references(() => clips.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** ISO-week bucket, e.g. "2026-W20". One vote per user per clip per week. */
    weekBucket: text('week_bucket').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.clipId, t.userId, t.weekBucket] }),
    index('votes_clip_week_idx').on(t.clipId, t.weekBucket),
    index('votes_week_idx').on(t.weekBucket),
  ],
);

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    clipId: text('clip_id')
      .notNull()
      .references(() => clips.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    deletedAt: integer('deleted_at'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index('comments_clip_idx').on(t.clipId, t.createdAt),
    index('comments_user_idx').on(t.userId),
  ],
);

export const follows = sqliteTable(
  'follows',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: text('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index('follows_followee_idx').on(t.followeeId),
  ],
);

// ---------- Charts ----------

/** Frozen weekly leaderboard snapshots so history is preserved across vote resets. */
export const weeklyCharts = sqliteTable(
  'weekly_charts',
  {
    weekBucket: text('week_bucket').notNull(),
    rank: integer('rank').notNull(),
    clipId: text('clip_id')
      .notNull()
      .references(() => clips.id, { onDelete: 'cascade' }),
    voteCount: integer('vote_count').notNull(),
    snapshotAt: integer('snapshot_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.weekBucket, t.rank] }),
    index('weekly_charts_week_idx').on(t.weekBucket),
  ],
);

// ---------- Moderation ----------

export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    clipId: text('clip_id').references(() => clips.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    reporterId: text('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    reporterIp: text('reporter_ip'),
    reason: text('reason').notNull(),
    body: text('body'),
    status: text('status', { enum: ['open', 'actioned', 'dismissed'] })
      .notNull()
      .default('open'),
    resolvedAt: integer('resolved_at'),
    resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAction: text('resolved_action'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index('reports_clip_idx').on(t.clipId), index('reports_status_idx').on(t.status)],
);

/** Public, append-only moderation log for transparency. */
export const moderationLog = sqliteTable(
  'moderation_log',
  {
    id: text('id').primaryKey(),
    action: text('action').notNull(), // 'clip_removed', 'user_banned', etc.
    /** Optional: pseudonymized reference (clip id hash, redacted handle). */
    targetRef: text('target_ref'),
    publicReason: text('public_reason').notNull(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index('moderation_log_created_idx').on(t.createdAt)],
);

// ---------- Credits economy ----------

/**
 * Append-only credit ledger. Every credit movement is one row. `delta` is in
 * credits (1 credit = 1 US cent); positive = added, negative = spent.
 * `balanceAfter` snapshots the user's running balance for audit + fast history.
 *
 * Idempotency: (refType, refId) is unique so a Polar webhook or a job settlement
 * replay cannot double-apply. NULL refIds are allowed (SQLite treats NULLs as
 * distinct) for manual adjustments.
 */
export const creditsLedger = sqliteTable(
  'credits_ledger',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reason: text('reason', {
      enum: [
        'topup',
        'signup_bonus',
        'job_reserve',
        'job_settle',
        'job_refund',
        'adjustment',
      ],
    }).notNull(),
    /** What the entry references: 'polar_order' | 'job' | 'manual'. */
    refType: text('ref_type'),
    refId: text('ref_id'),
    /** JSON blob for extra context (provider cost, notes, etc.). */
    metadata: text('metadata'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index('credits_ledger_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('credits_ledger_ref_unique').on(t.refType, t.refId),
  ],
);

/**
 * API keys for machine / AI-agent access. Only the SHA-256 hash is stored; the
 * plaintext key is shown once at creation. `prefix` is a short non-secret label
 * for the UI. Optional per-key spend + rate caps bound the blast radius.
 */
export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Non-secret display prefix, e.g. "tk_live_a1b2". */
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    /** Max credits this key may spend per UTC day. NULL = no cap. */
    dailySpendCap: integer('daily_spend_cap'),
    /** Max requests per minute. NULL = default global limit. */
    rateLimitPerMin: integer('rate_limit_per_min'),
    lastUsedAt: integer('last_used_at'),
    revokedAt: integer('revoked_at'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex('api_keys_hash_unique').on(t.keyHash),
    index('api_keys_user_idx').on(t.userId),
  ],
);

/**
 * Compute jobs (stem separation, transcription, …). Credits are reserved on
 * create, then settled (kept) on success or refunded on failure. `provider` +
 * `providerJobId` let webhooks/pollers map a remote prediction back to a job.
 */
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Set when the job was created via a machine API key (vs the web UI). */
    apiKeyId: text('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    /** Service identifier, e.g. "stems". */
    service: text('service').notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'canceled'],
    })
      .notNull()
      .default('pending'),
    /** 'web' | 'api' — how the job was initiated. */
    source: text('source', { enum: ['web', 'api'] }).notNull().default('web'),
    /** Compute backend: 'replicate' | 'home3090'. */
    provider: text('provider'),
    /** Remote prediction id for webhook/poll correlation. */
    providerJobId: text('provider_job_id'),
    /** Credits reserved/charged for this job. */
    creditCost: integer('credit_cost').notNull(),
    /** Ledger row id of the reservation, for settle/refund traceability. */
    reservationLedgerId: text('reservation_ledger_id'),
    /** Whether the reservation has been settled or refunded (terminal). */
    settled: integer('settled', { mode: 'boolean' }).notNull().default(false),
    /** Storage key of the input object. */
    inputKey: text('input_key'),
    /** JSON: request parameters (model, options). */
    inputMeta: text('input_meta'),
    /** JSON: result payload (output storage keys, provider cost, timings). */
    outputMeta: text('output_meta'),
    error: text('error'),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    index('jobs_user_idx').on(t.userId, t.createdAt),
    index('jobs_status_idx').on(t.status),
    index('jobs_provider_job_idx').on(t.providerJobId),
  ],
);

// ---------- Type exports ----------

export type HandleHistory = typeof handleHistory.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type MagicLink = typeof magicLinks.$inferSelect;
export type NewMagicLink = typeof magicLinks.$inferInsert;
export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Follow = typeof follows.$inferSelect;
export type WeeklyChart = typeof weeklyCharts.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type ModerationLogEntry = typeof moderationLog.$inferSelect;
export type CreditsLedgerEntry = typeof creditsLedger.$inferSelect;
export type NewCreditsLedgerEntry = typeof creditsLedger.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
