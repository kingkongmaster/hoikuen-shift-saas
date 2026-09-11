-- Run as aen_migrator after migrate deploy, on the explicitly verified target.
-- No role/password creation. Existing Phase 3 roles are prerequisites.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_user <> 'aen_migrator' THEN RAISE EXCEPTION 'Run as aen_migrator on the verified target'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aen_app' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
     OR pg_has_role('aen_app','aen_migrator','MEMBER') THEN
    RAISE EXCEPTION 'Unsafe application role attributes or membership';
  END IF;
END $$;
REVOKE CREATE, TEMPORARY ON DATABASE :"DBNAME" FROM PUBLIC, aen_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, aen_app;
GRANT CONNECT ON DATABASE :"DBNAME" TO aen_app;
GRANT USAGE ON SCHEMA public TO aen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aen_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aen_app;
ALTER DEFAULT PRIVILEGES FOR ROLE aen_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aen_app;
ALTER DEFAULT PRIVILEGES FOR ROLE aen_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO aen_app;
REVOKE ALL ON TABLE public._prisma_migrations FROM aen_app;
-- Read-only release attestation; never expose migration logs or grant DML here.
CREATE OR REPLACE VIEW public.aen_release_migration_status AS
  SELECT migration_name, checksum, finished_at, rolled_back_at
  FROM public._prisma_migrations;
REVOKE ALL ON public.aen_release_migration_status FROM PUBLIC, aen_app;
GRANT SELECT ON public.aen_release_migration_status TO aen_app;
COMMIT;
