-- Phase 9: more than one person. Only adds; nothing is renamed, dropped or rewritten, so the code that
-- ran before this still works against it. The statements are drizzle-kit's, with the data
-- statements below added by hand (as 0003 did).
--
--  * owner.email: how a person signs in. Null for owner 1 until they set one; unique ignoring case.
--  * owner_one_without_email: every row with no address has the same key (true), so at most one
--    owner can lack an email, and that one is the person who registered before emails existed.
--  * owner.webauthn_user_id: the bytes WebAuthn uses as the passkey user handle. New rows get 16
--    random bytes; owner 1 is set below to the UTF-8 bytes of `payday-owner`, the handle
--    server/auth/webauthn.ts has always sent, so their existing passkeys keep matching.
--  * owner.backup_id: a random id that says whose a backup file is. Each existing row gets its own.
--  * indexes on account(owner_id) and recovery_code(owner_id).
ALTER TABLE "payday"."owner" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "payday"."owner" ADD COLUMN "webauthn_user_id" "bytea" DEFAULT decode(replace(gen_random_uuid()::text, '-', ''), 'hex') NOT NULL;--> statement-breakpoint
ALTER TABLE "payday"."owner" ADD COLUMN "backup_id" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
CREATE INDEX "account_owner" ON "payday"."account" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_email_lower" ON "payday"."owner" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "owner_one_without_email" ON "payday"."owner" USING btree (("email" is null)) WHERE "email" is null;--> statement-breakpoint
CREATE INDEX "recovery_code_owner" ON "payday"."recovery_code" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "payday"."owner" ADD CONSTRAINT "owner_webauthn_user_id_unique" UNIQUE("webauthn_user_id");--> statement-breakpoint
ALTER TABLE "payday"."owner" ADD CONSTRAINT "owner_backup_id_unique" UNIQUE("backup_id");--> statement-breakpoint
-- Owner 1 keeps the handle their passkeys were made with. Only id 1: it is the only row there is.
UPDATE "payday"."owner" SET "webauthn_user_id" = convert_to('payday-owner', 'UTF8') WHERE "id" = 1;--> statement-breakpoint
-- registerOwner inserted id 1 by hand, so the id counter never moved. Set it past the highest id, so
-- the next sign-up gets id 2 and not a clash with 1. An empty table is left alone: its max() is
-- null, the counter already starts at 1, and the guard only makes that explicit.
SELECT setval(pg_get_serial_sequence('payday.owner', 'id'), (SELECT max("id") FROM "payday"."owner")) WHERE EXISTS (SELECT 1 FROM "payday"."owner");
