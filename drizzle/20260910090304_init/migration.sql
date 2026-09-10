CREATE TABLE `catalog_materials` (
	`id` text PRIMARY KEY,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`price_rub` integer NOT NULL,
	`article` text,
	`waste_pct` integer
);
--> statement-breakpoint
CREATE TABLE `catalog_overrides` (
	`material_id` text PRIMARY KEY,
	`price_rub` integer,
	`waste_pct` integer
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
