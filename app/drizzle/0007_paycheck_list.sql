CREATE TABLE `paid_mark` (
	`id` integer PRIMARY KEY NOT NULL,
	`item_id` integer NOT NULL,
	`original_date` text NOT NULL,
	`marked_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paid_mark_occurrence` ON `paid_mark` (`item_id`,`original_date`);--> statement-breakpoint
ALTER TABLE `schedule_item` ADD `group_name` text;--> statement-breakpoint
ALTER TABLE `schedule_item` ADD `optional` integer DEFAULT false NOT NULL;