CREATE TABLE `handle_history` (
	`id` text PRIMARY KEY NOT NULL,
	`old_handle` text NOT NULL,
	`user_id` text,
	`changed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handle_history_lower_unique` ON `handle_history` (lower(`old_handle`));
