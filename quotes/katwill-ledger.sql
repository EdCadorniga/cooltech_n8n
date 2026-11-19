-- Run as migration owner ONLY in a dedicated Cooltech database on the
-- production server. Do not run in n8n's database. Runtime receives EXECUTE
-- on the three workflow functions, not table access or object ownership.
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'cooltech_quotes'
      OR to_regclass('public.workflow_entity') IS NOT NULL THEN
    RAISE EXCEPTION 'Expected the dedicated cooltech_quotes database';
  END IF;
END;
$$;
CREATE SCHEMA cooltech_quotes;
REVOKE ALL ON SCHEMA cooltech_quotes FROM PUBLIC;

CREATE TABLE cooltech_quotes.pilot (
  source uuid PRIMARY KEY,
  client uuid NOT NULL,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  claimed_at timestamptz,
  closed_at timestamptz,
  CHECK (closes_at > opens_at AND closes_at <= opens_at + interval '15 minutes')
);

CREATE TABLE cooltech_quotes.intent (
  source uuid NOT NULL REFERENCES cooltech_quotes.pilot(source),
  step text NOT NULL CHECK (step ~ '^(quote|contact|note|(file|upload):[0-9a-f]{64})$'),
  target uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  verified_at timestamptz,
  PRIMARY KEY (source, step)
);

CREATE FUNCTION cooltech_quotes.claim(p_source uuid, p_client uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH claimed AS (
    UPDATE cooltech_quotes.pilot
    SET claimed_at = clock_timestamp()
    WHERE source = p_source AND client = p_client
      AND claimed_at IS NULL AND closed_at IS NULL
      AND clock_timestamp() >= opens_at AND clock_timestamp() < closes_at
    RETURNING source
  )
  SELECT EXISTS (SELECT FROM claimed);
$$;

-- A committed intent is required before a POST. A duplicate reservation
-- returns false: read the stored UUID out of band, never attempt another POST.
CREATE FUNCTION cooltech_quotes.reserve(p_source uuid, p_step text, p_target uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH permitted AS (
    SELECT source FROM cooltech_quotes.pilot
    WHERE source = p_source AND claimed_at IS NOT NULL AND closed_at IS NULL
      AND clock_timestamp() < closes_at FOR SHARE
  ), reserved AS (
    INSERT INTO cooltech_quotes.intent (source, step, target)
    SELECT source, p_step, p_target FROM permitted
    WHERE CASE
      WHEN p_step = 'quote' THEN true
      WHEN p_step LIKE 'upload:%' THEN EXISTS (
        SELECT FROM cooltech_quotes.intent
        WHERE source = p_source AND step = 'file:' || split_part(p_step, ':', 2)
          AND target = p_target AND verified_at IS NOT NULL
      )
      ELSE EXISTS (
        SELECT FROM cooltech_quotes.intent
        WHERE source = p_source AND step = 'quote' AND verified_at IS NOT NULL
      )
    END
    ON CONFLICT (source, step) DO NOTHING
    RETURNING target
  )
  SELECT EXISTS (SELECT FROM reserved);
$$;

-- Call only after exact UUID and payload (or binary digest) verification.
-- Readback may finish after a permit is closed; this grants no POST authority.
CREATE FUNCTION cooltech_quotes.confirm(p_source uuid, p_step text, p_target uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH confirmed AS (
    UPDATE cooltech_quotes.intent
    SET verified_at = coalesce(verified_at, clock_timestamp())
    WHERE source = p_source AND step = p_step AND target = p_target
    RETURNING target
  )
  SELECT EXISTS (SELECT FROM confirmed);
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA cooltech_quotes FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cooltech_quotes FROM PUBLIC;
COMMIT;
