import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * torus.wtf — SQLite schema (libSQL / Turso).
 *
 * Conventions:
 *   - Primary keys are text CUIDs (generated app-side via @torus/shared).
 *   - All timestamps are integer Unix ms (milliseconds since epoch).
 *   - Foreign keys are enabled at connection time, see ./client.ts.
 *
 * Scope: accounts, sessions, and the one-time Production License. Clip hosting
 * and community tables were removed in 0.1 — the product is the visualizer plus
 * the Conductor / Transcriber tools, with lightweight profiles on top.
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
    /** Polar customer id, set on first checkout (idempotency / support lookups). */
    paymentCustomerId: text('payment_customer_id'),
    /**
     * One-time Production License. Null = unlicensed; a timestamp (Unix ms) =
     * the moment the $10 license was granted. Account-bound, site-wide perks.
     */
    productionLicenseAt: integer('production_license_at'),
    /** Polar order id for the license purchase (support / idempotency). */
    productionLicenseOrderId: text('production_license_order_id'),
    /** Custom profile subdomain — a Production License perk. */
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

// ---------- Type exports ----------

export type HandleHistory = typeof handleHistory.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type MagicLink = typeof magicLinks.$inferSelect;
export type NewMagicLink = typeof magicLinks.$inferInsert;
