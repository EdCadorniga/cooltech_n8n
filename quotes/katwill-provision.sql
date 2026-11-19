-- Run from the production PostgreSQL admin session, connected to postgres.
-- Pass an SCRAM verifier (not a plaintext password) as psql runtime_verifier.
\set ON_ERROR_STOP on
CREATE ROLE cooltech_quote_owner NOLOGIN;
CREATE ROLE cooltech_quote_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4;
CREATE DATABASE cooltech_quotes OWNER cooltech_quote_owner;
\connect cooltech_quotes
REVOKE ALL ON DATABASE cooltech_quotes FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE cooltech_quotes TO cooltech_quote_runtime;
SET ROLE cooltech_quote_owner;
\ir katwill-ledger.sql
GRANT USAGE ON SCHEMA cooltech_quotes TO cooltech_quote_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cooltech_quotes TO cooltech_quote_runtime;
RESET ROLE;
ALTER ROLE cooltech_quote_runtime LOGIN PASSWORD :'runtime_verifier';
