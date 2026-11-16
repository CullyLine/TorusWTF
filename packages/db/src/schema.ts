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
 * Scope: optional accounts and their sessions. The visualizer, Conductor, and
 * Transcriber run in the browser and store nothing here.
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
    /*
     * Records from the retired Production License, a one-time purchase sold
     * through Polar until torus became free. Nothing writes these columns any
     * more. They are kept so past purchases stay on record, and
     * `productionLicenseAt` drives the "Early supporter" profile badge.
     */
    /** Polar customer id from the buyer's checkout. */
    paymentCustomerId: text('payment_customer_id'),
    /** When the license was bought (Unix ms), or null. */
    productionLicenseAt: integer('production_license_at'),
    /** Polar order id for that purchase. */
    productionLicenseOrderId: text('production_license_order_id'),
    /** Vanity subdomain: `<customSubdomain>.torus.wtf` shows this user's profile. */
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
