ALTER TABLE "payday"."schedule_item" ADD COLUMN "rule_day_2" integer;--> statement-breakpoint
ALTER TABLE "payday"."schedule_item" ADD COLUMN "is_main_pay" boolean DEFAULT false NOT NULL;