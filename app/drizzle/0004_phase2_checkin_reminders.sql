CREATE TABLE `check_in` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` integer NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`duration_seconds` integer,
	`current_step` text DEFAULT 'pay' NOT NULL,
	`pay_landed` integer,
	`pay_amount_minor` integer,
	`balance_minor` integer,
	`expected_minor` integer,
	`spent_minor` integer,
	`as_of` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `check_in_owner` ON `check_in` (`owner_id`);--> statement-breakpoint
CREATE TABLE `payment_confirmation` (
	`id` integer PRIMARY KEY NOT NULL,
	`check_in_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`original_date` text NOT NULL,
	`due_date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_confirmation_occurrence` ON `payment_confirmation` (`check_in_id`,`item_id`,`original_date`);--> statement-breakpoint
CREATE INDEX `payment_confirmation_item` ON `payment_confirmation` (`item_id`,`original_date`);--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_success_at` text,
	`failed_at` text,
	`failure_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_endpoint_unique` ON `push_subscription` (`endpoint`);--> statement-breakpoint
CREATE TABLE `reminder_sent` (
	`payday_date` text PRIMARY KEY NOT NULL,
	`sent_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `owner` ADD `reminder_time` text DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `owner` ADD `reminders_expired_at` text;