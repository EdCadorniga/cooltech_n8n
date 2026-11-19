BEGIN;
DO $$
BEGIN
  IF current_database() <> 'cooltech_quotes' THEN RAISE EXCEPTION 'wrong database'; END IF;
END;
$$;
ALTER TABLE cooltech_quotes.pilot DROP CONSTRAINT pilot_expected_photos_check,
 ADD CONSTRAINT pilot_expected_photos_check CHECK (expected_photos BETWEEN -1 AND 3);
SET ROLE cooltech_quote_owner;
CREATE TABLE cooltech_quotes.rollout (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  starts_at timestamptz NOT NULL
);
CREATE TABLE cooltech_quotes.batch_results (
  source uuid PRIMARY KEY REFERENCES cooltech_quotes.pilot(source),
  outcome text NOT NULL CHECK (outcome ~ '^[a-z_]{1,45}$'),
  detail text CHECK (detail ~ '^[a-z_]{1,45}$'),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION cooltech_quotes.rollout_start() RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT starts_at FROM cooltech_quotes.rollout WHERE singleton;
$$;
CREATE FUNCTION cooltech_quotes.admit(p_source uuid,p_stamp timestamptz,p_offset text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH added AS (
   INSERT INTO cooltech_quotes.pilot(source,opens_at,closes_at,inbox_utc_offset,expected_photos)
   SELECT p_source,statement_timestamp(),statement_timestamp()+interval '4 minutes',p_offset,-1
   FROM cooltech_quotes.rollout
   WHERE singleton AND p_stamp >= starts_at
     AND p_stamp <= statement_timestamp() AND p_stamp > statement_timestamp()-interval '24 hours'
   ON CONFLICT(source) DO NOTHING RETURNING source
 ) SELECT EXISTS(SELECT FROM added);
$$;
CREATE FUNCTION cooltech_quotes.scheduled_plan(p_source uuid,p_digest text,p_photos integer)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH changed AS (
   UPDATE cooltech_quotes.pilot SET plan_digest=p_digest,expected_photos=p_photos
   WHERE source=p_source AND expected_photos=-1 AND plan_digest IS NULL
     AND claimed_at IS NOT NULL AND closed_at IS NULL AND closes_at>clock_timestamp()
     AND p_photos BETWEEN 0 AND 3 AND p_digest IS NOT NULL RETURNING source
 ) SELECT EXISTS(SELECT FROM changed);
$$;
CREATE FUNCTION cooltech_quotes.record_batch_result(p_source uuid,p_outcome text,p_detail text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 INSERT INTO cooltech_quotes.batch_results(source,outcome,detail)
 SELECT p_source,p_outcome,p_detail FROM cooltech_quotes.pilot p
 WHERE p.source=p_source
 ON CONFLICT(source) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION cooltech_quotes.rollout_start(),cooltech_quotes.admit(uuid,timestamptz,text),
 cooltech_quotes.scheduled_plan(uuid,text,integer),cooltech_quotes.record_batch_result(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cooltech_quotes.rollout_start(),cooltech_quotes.admit(uuid,timestamptz,text),
 cooltech_quotes.scheduled_plan(uuid,text,integer),cooltech_quotes.record_batch_result(uuid,text,text) TO cooltech_quote_runtime;
RESET ROLE;
COMMIT;
