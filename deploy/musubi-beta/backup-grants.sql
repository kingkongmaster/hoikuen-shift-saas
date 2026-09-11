-- Provision an existing dedicated aen_backup login (credential managed separately).
-- Run as aen_migrator after application-grants.sql on the verified database.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_user <> 'aen_migrator' THEN RAISE EXCEPTION 'Run as aen_migrator'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aen_backup') THEN RAISE EXCEPTION 'Provision the dedicated backup role first'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aen_backup' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
     OR pg_has_role('aen_backup','aen_migrator','MEMBER') OR pg_has_role('aen_backup','aen_app','MEMBER') THEN
    RAISE EXCEPTION 'Unsafe backup role attributes or membership';
  END IF;
END $$;
REVOKE CREATE, TEMPORARY ON DATABASE :"DBNAME" FROM aen_backup;
REVOKE CREATE ON SCHEMA public FROM aen_backup;
GRANT CONNECT ON DATABASE :"DBNAME" TO aen_backup;
GRANT USAGE ON SCHEMA public TO aen_backup;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM aen_backup;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM aen_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO aen_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO aen_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE aen_migrator IN SCHEMA public GRANT SELECT ON TABLES TO aen_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE aen_migrator IN SCHEMA public GRANT SELECT ON SEQUENCES TO aen_backup;
COMMIT;
