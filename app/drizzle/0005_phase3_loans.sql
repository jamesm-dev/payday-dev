CREATE TABLE `loan` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` integer NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`lender` text,
	`balance_minor` integer NOT NULL,
	`balance_as_of` text NOT NULL,
	`rate_bp` integer,
	`schedule_item_id` integer,
	`min_pct_bp` integer,
	`min_floor_minor` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`closed_at` text
);
--> statement-breakpoint
CREATE INDEX `loan_owner` ON `loan` (`owner_id`);--> statement-breakpoint
CREATE INDEX `loan_schedule_item` ON `loan` (`schedule_item_id`);--> statement-breakpoint
CREATE TABLE `loan_balance` (
	`id` integer PRIMARY KEY NOT NULL,
	`loan_id` integer NOT NULL,
	`check_in_id` integer,
	`as_of` text NOT NULL,
	`balance_minor` integer NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `loan_balance_loan` ON `loan_balance` (`loan_id`);--> statement-breakpoint
CREATE INDEX `loan_balance_check_in` ON `loan_balance` (`check_in_id`);