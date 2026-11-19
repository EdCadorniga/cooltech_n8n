-- Run as migration owner ONLY in a dedicated Cooltech database on the
-- production server. Do not run in n8n's database. Runtime receives EXECUTE
-- on the workflow functions, not table access or object ownership.
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
  client uuid,
  baseline_quote uuid,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  inbox_utc_offset text NOT NULL CHECK (inbox_utc_offset ~ '^[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00)$'),
  expected_photos integer NOT NULL DEFAULT 3 CHECK (expected_photos = 3),
  claimed_at timestamptz,
  closed_at timestamptz,
  plan_digest text CHECK (plan_digest ~ '^[0-9a-f]{64}$'),
  CHECK (closes_at > opens_at AND closes_at <= opens_at + interval '15 minutes')
);

CREATE TABLE cooltech_quotes.intent (
  source uuid NOT NULL REFERENCES cooltech_quotes.pilot(source),
  step text NOT NULL CHECK (step ~ '^(quote|contact|note|queue|(file|upload):[0-9a-f]{64})$'),
  target uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  verified_at timestamptz,
  PRIMARY KEY (source, step)
);

CREATE FUNCTION cooltech_quotes.claim(p_source uuid, p_client uuid, p_baseline uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH claimed AS (
    UPDATE cooltech_quotes.pilot
    SET claimed_at = clock_timestamp()
    WHERE source = p_source AND client IS NOT DISTINCT FROM p_client
      AND baseline_quote IS NOT DISTINCT FROM p_baseline
      AND claimed_at IS NULL AND closed_at IS NULL
      AND clock_timestamp() >= opens_at AND clock_timestamp() < closes_at
    RETURNING source
  )
  SELECT EXISTS (SELECT FROM claimed);
$$;

-- Return only the settings for the already-claimed permit. No table grants.
CREATE FUNCTION cooltech_quotes.settings(p_source uuid)
RETURNS TABLE (opens_at timestamptz, closes_at timestamptz, inbox_utc_offset text, expected_photos integer)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT p.opens_at,p.closes_at,p.inbox_utc_offset,p.expected_photos
  FROM cooltech_quotes.pilot p
  WHERE p.source=p_source AND p.claimed_at IS NOT NULL AND p.closed_at IS NULL
    AND clock_timestamp() < p.closes_at;
$$;

CREATE FUNCTION cooltech_quotes.close(p_source uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH sealed AS (
    UPDATE cooltech_quotes.pilot
    SET closed_at=coalesce(closed_at,clock_timestamp())
    WHERE source=p_source AND claimed_at IS NOT NULL
    RETURNING source
  )
  SELECT EXISTS (SELECT FROM sealed);
$$;

CREATE FUNCTION cooltech_quotes.plan(p_source uuid, p_digest text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH frozen AS (
    UPDATE cooltech_quotes.pilot
    SET plan_digest = p_digest
    WHERE source = p_source AND claimed_at IS NOT NULL AND closed_at IS NULL
      AND clock_timestamp() < closes_at AND plan_digest IS NULL AND p_digest IS NOT NULL
    RETURNING source
  )
  SELECT EXISTS (SELECT FROM frozen);
$$;

-- A committed intent is required before a POST. A duplicate reservation
-- returns false: read the stored UUID out of band, never attempt another POST.
CREATE FUNCTION cooltech_quotes.reserve(p_source uuid, p_step text, p_target uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH permitted AS (
    SELECT source FROM cooltech_quotes.pilot
    WHERE source = p_source AND claimed_at IS NOT NULL AND closed_at IS NULL AND plan_digest IS NOT NULL
      AND clock_timestamp() < closes_at FOR SHARE
  ), reserved AS (
    INSERT INTO cooltech_quotes.intent (source, step, target)
    SELECT source, p_step, p_target FROM permitted
    WHERE CASE
      WHEN p_step = 'quote' THEN true
      WHEN p_step = 'queue' THEN
        (SELECT count(*) FROM cooltech_quotes.intent WHERE source = p_source AND verified_at IS NOT NULL
          AND (step IN ('contact', 'note') OR step LIKE 'upload:%')) = 5
        AND EXISTS (SELECT FROM cooltech_quotes.intent WHERE source = p_source
          AND step = 'quote' AND target = p_target AND verified_at IS NOT NULL)
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
