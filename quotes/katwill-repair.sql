BEGIN;
DO $$
BEGIN
  IF current_database() <> 'cooltech_quotes' THEN RAISE EXCEPTION 'wrong database'; END IF;
END;
$$;
ALTER TABLE cooltech_quotes.intent DROP CONSTRAINT intent_step_check,
 ADD CONSTRAINT intent_step_check CHECK (step ~ '^(quote|contact|note|queue|(file|upload|combined):[0-9a-f]{64})$');
SET ROLE cooltech_quote_owner;
CREATE TABLE IF NOT EXISTS cooltech_quotes.repair (
 source uuid PRIMARY KEY REFERENCES cooltech_quotes.pilot(source),
 quote uuid NOT NULL,
 expires timestamptz NOT NULL,
 claimed_at timestamptz,
 closed_at timestamptz
);
CREATE FUNCTION cooltech_quotes.claim_repair(p_source uuid,p_quote uuid)
RETURNS TABLE (opens_at timestamptz, closes_at timestamptz, inbox_utc_offset text, expected_photos integer)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
 WITH claimed AS (
   UPDATE cooltech_quotes.repair r SET claimed_at=clock_timestamp()
   FROM cooltech_quotes.pilot p, cooltech_quotes.intent i
   WHERE r.source=p_source AND r.quote=p_quote AND r.claimed_at IS NULL AND r.closed_at IS NULL
      AND r.expires>clock_timestamp() AND r.expires<=clock_timestamp()+interval '15 minutes'
      AND p.source=r.source AND p.closed_at IS NOT NULL AND p.client IS NULL
      AND i.source=r.source AND i.step='quote' AND i.target=r.quote
   RETURNING r.claimed_at,r.expires,p.inbox_utc_offset,p.expected_photos
 ) SELECT * FROM claimed;
$$;
CREATE FUNCTION cooltech_quotes.close_repair(p_source uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
 WITH closed AS (
   UPDATE cooltech_quotes.repair SET closed_at=clock_timestamp()
   WHERE source=p_source AND claimed_at IS NOT NULL AND closed_at IS NULL RETURNING source
 ) SELECT EXISTS(SELECT FROM closed);
$$;
CREATE FUNCTION cooltech_quotes.repair_plan(p_source uuid,p_digest text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT EXISTS(SELECT FROM cooltech_quotes.pilot p JOIN cooltech_quotes.repair r USING(source)
 WHERE p.source=p_source AND p.plan_digest=p_digest AND r.claimed_at IS NOT NULL
   AND r.closed_at IS NULL AND r.expires>clock_timestamp());
$$;
CREATE FUNCTION cooltech_quotes.repair_intent(p_source uuid,p_step text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT i.target FROM cooltech_quotes.intent i JOIN cooltech_quotes.repair r USING(source)
 WHERE i.source=p_source AND i.step=p_step AND r.claimed_at IS NOT NULL
   AND r.closed_at IS NULL AND r.expires>clock_timestamp();
$$;
REVOKE ALL ON FUNCTION cooltech_quotes.claim_repair(uuid,uuid),cooltech_quotes.close_repair(uuid),
 cooltech_quotes.repair_plan(uuid,text),cooltech_quotes.repair_intent(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cooltech_quotes.claim_repair(uuid,uuid),cooltech_quotes.close_repair(uuid),
 cooltech_quotes.repair_plan(uuid,text),cooltech_quotes.repair_intent(uuid,text) TO cooltech_quote_runtime;
REVOKE ALL ON cooltech_quotes.repair FROM PUBLIC;
RESET ROLE;
COMMIT;
