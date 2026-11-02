CREATE TABLE `expense` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`note` text,
	`spent_on` text NOT NULL,
	`logged_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expense_owner_spent_on` ON `expense` (`owner_id`,`spent_on`);--> statement-breakpoint
ALTER TABLE `account` ADD `balance_saved_at` text;