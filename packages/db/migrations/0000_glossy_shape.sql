CREATE TABLE `clip_tags` (
	`clip_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`clip_id`, `tag`),
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clip_tags_tag_idx` ON `clip_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `clips` (
	`id` text PRIMARY KEY NOT NULL,
	`share_code` text NOT NULL,
	`owner_id` text,
	`title` text,
	`description` text,
	`original_filename` text,
	`original_bytes` integer,
	`duration_ms` integer,
	`original_key` text,
	`opus_key` text,
	`peaks_key` text,
	`spectrogram_key` text,
	`og_image_key` text,
	`waveform_palette` text,
	`visualizer_preset` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_error` text,
	`visibility` text DEFAULT 'public' NOT NULL,
	`allow_download` integer DEFAULT true NOT NULL,
	`play_count` integer DEFAULT 0 NOT NULL,
	`claim_token` text,
	`deleted_at` integer,
	`deleted_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clips_share_code_unique` ON `clips` (`share_code`);--> statement-breakpoint
CREATE INDEX `clips_owner_idx` ON `clips` (`owner_id`);--> statement-breakpoint
CREATE INDEX `clips_created_idx` ON `clips` (`created_at`);--> statement-breakpoint
CREATE INDEX `clips_status_idx` ON `clips` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `clips_claim_token_unique` ON `clips` (`claim_token`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`clip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_clip_idx` ON `comments` (`clip_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_user_idx` ON `comments` (`user_id`);--> statement-breakpoint
CREATE TABLE `follows` (
	`follower_id` text NOT NULL,
	`followee_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`follower_id`, `followee_id`),
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`followee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follows_followee_idx` ON `follows` (`followee_id`);--> statement-breakpoint
CREATE TABLE `magic_links` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `magic_links_email_idx` ON `magic_links` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `magic_links_token_unique` ON `magic_links` (`token_hash`);--> statement-breakpoint
CREATE TABLE `moderation_log` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`target_ref` text,
	`public_reason` text NOT NULL,
	`actor_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `moderation_log_created_idx` ON `moderation_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`clip_id` text,
	`user_id` text,
	`reporter_id` text,
	`reporter_ip` text,
	`reason` text NOT NULL,
	`body` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	`resolved_action` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reports_clip_idx` ON `reports` (`clip_id`);--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`email` text,
	`avatar_url` text,
	`bio` text,
	`role` text DEFAULT 'user' NOT NULL,
	`tier` text DEFAULT 'free' NOT NULL,
	`tier_started_at` integer,
	`tier_expires_at` integer,
	`payment_customer_id` text,
	`custom_subdomain` text,
	`discord_id` text,
	`is_banned` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (lower("handle"));--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_subdomain_unique` ON `users` (`custom_subdomain`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_unique` ON `users` (`discord_id`);--> statement-breakpoint
CREATE TABLE `votes` (
	`clip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`week_bucket` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`clip_id`, `user_id`, `week_bucket`),
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `votes_clip_week_idx` ON `votes` (`clip_id`,`week_bucket`);--> statement-breakpoint
CREATE INDEX `votes_week_idx` ON `votes` (`week_bucket`);--> statement-breakpoint
CREATE TABLE `weekly_charts` (
	`week_bucket` text NOT NULL,
	`rank` integer NOT NULL,
	`clip_id` text NOT NULL,
	`vote_count` integer NOT NULL,
	`snapshot_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`week_bucket`, `rank`),
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `weekly_charts_week_idx` ON `weekly_charts` (`week_bucket`);