CREATE TABLE `watchlist` (
	`user_id` text NOT NULL,
	`domain` text NOT NULL,
	`snapshot` text NOT NULL,
	`checked_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `domain`)
);
