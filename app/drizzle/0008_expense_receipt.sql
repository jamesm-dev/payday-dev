-- Phase 11: works without signal (ADR-0029). Only adds: a new, empty table of the expense ids phones
-- made, so an expense sent twice is saved once. Nothing existing changes. The public-API grants come
-- off it like every table's: 0001's block runs again after every migration run, and the same guarded
-- block ends this file, so the table is never readable by `anon` or `authenticated`, not even between
-- this migration and that run.
CREATE TABLE "payday"."expense_receipt" (
	"owner_id" integer NOT NULL,
	"client_id" text NOT NULL,
	"received_at" text NOT NULL,
	CONSTRAINT "expense_receipt_owner_id_client_id_pk" PRIMARY KEY("owner_id","client_id")
);--> statement-breakpoint
DO $$
DECLARE
	role_name text;
BEGIN
	FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
		IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
			EXECUTE format('REVOKE ALL ON TABLE payday.expense_receipt FROM %I', role_name);
		END IF;
	END LOOP;
END
$$;
