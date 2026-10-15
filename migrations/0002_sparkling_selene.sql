CREATE TABLE `catalog_history` (
	`domain` text PRIMARY KEY NOT NULL,
	`tld` text NOT NULL,
	`release_at` text NOT NULL,
	`snapshot` text NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `catalog_history_release_idx` ON `catalog_history` (`release_at`,`tld`);