CREATE TABLE `handle_history` (
	`id` text PRIMARY KEY NOT NULL,
	`old_handle` text NOT NULL,
	`user_id` text,
	`changed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handle_history_lower_unique` ON `handle_history` (lower("old_handle"));--> statement-breakpoint
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
	`payment_customer_id` text,
	`production_license_at` integer,
	`production_license_order_id` text,
	`custom_subdomain` text,
	`discord_id` text,
	`is_banned` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (lower("handle"));--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_subdomain_unique` ON `users` (`custom_subdomain`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_unique` ON `users` (`discord_id`);