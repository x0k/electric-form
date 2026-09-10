CREATE TABLE `price_offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`run_id` integer,
	`material_id` text NOT NULL,
	`shop` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`article` text,
	`price_rub` integer NOT NULL,
	`unit` text NOT NULL,
	`in_stock` integer NOT NULL,
	`city` text NOT NULL,
	`observed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`city` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`started_at` text NOT NULL,
	`finished_at` text
);
