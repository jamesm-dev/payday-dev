-- Supabase's data API (PostgREST) serves the `public` schema and any role it maps to a request:
-- `anon` and `authenticated`. Every Payday table lives in the `payday` schema, which the API is not
-- told to expose; this takes away the SQL-level grants as well, so a mistake in the API's settings
-- would still find nothing readable (ADR-0014). The roles exist only on Supabase, so the block is
-- guarded and does nothing on PGlite or a plain Postgres.
--
-- Default privileges belong to the role they were set for (Supabase sets its own for schema
-- `public`), and `ALTER DEFAULT PRIVILEGES` without `FOR ROLE` only touches the running role's, so
-- revoking them here would not reliably cover FUTURE tables. Instead this whole block is idempotent
-- and is run again after every migration run (`pnpm db:migrate`, and when the in-process database
-- opens), which takes the grants off any table a later migration added.
DO $$
DECLARE
	role_name text;
BEGIN
	FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
		IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
			EXECUTE format('REVOKE ALL ON SCHEMA payday FROM %I', role_name);
			EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA payday FROM %I', role_name);
			EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA payday FROM %I', role_name);
			EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA payday FROM %I', role_name);
		END IF;
	END LOOP;
END
$$;
