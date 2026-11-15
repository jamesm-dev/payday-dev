-- Phase 12: Continue with Google, built switched off. Only adds: the account number Google gives a person
-- (nullable, so every existing row is unchanged) and a unique index so one Google account is one person.
-- Postgres treats nulls as distinct, so any number of rows may have none.
ALTER TABLE "payday"."owner" ADD COLUMN "google_sub" text;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_google_sub" ON "payday"."owner" USING btree ("google_sub");