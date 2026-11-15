-- Phase 11: works without signal (ADR-0029). Only adds: a new, empty table of the expense ids phones
-- made, so an expense sent twice is saved once. Nothing existing changes. The public-API grants come
-- off it like every table's, by 0001's block, which runs again after every migration run.
CREATE TABLE "payday"."expense_receipt" (
	"owner_id" integer NOT NULL,
	"client_id" text NOT NULL,
	"received_at" text NOT NULL,
	CONSTRAINT "expense_receipt_owner_id_client_id_pk" PRIMARY KEY("owner_id","client_id")
);
