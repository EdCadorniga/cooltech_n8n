-- Add ordinary n8n Postgres node entry points. Run as the Cooltech migration
-- admin against cooltech_quotes, never against the n8n database.
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'cooltech_quotes' THEN RAISE EXCEPTION 'wrong database'; END IF;
END;
$$;
SET LOCAL ROLE cooltech_quote_owner;

CREATE FUNCTION cooltech_quotes.standard_claim(p_source uuid, p_stamp timestamptz,
  p_offset text, p_digest text, p_files integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT cooltech_quotes.admit(p_source,p_stamp,p_offset) THEN RETURN false; END IF;
  IF NOT cooltech_quotes.claim(p_source,NULL,NULL) OR
     NOT cooltech_quotes.scheduled_plan(p_source,p_digest,p_files) THEN
    RAISE EXCEPTION 'inconsistent claim';
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION cooltech_quotes.standard_finish(p_source uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cooltech_quotes.intent WHERE source=p_source AND step='queue' AND verified_at IS NOT NULL)
    OR NOT cooltech_quotes.close(p_source) THEN RETURN false; END IF;
  PERFORM cooltech_quotes.record_batch_result(p_source,'verified',NULL);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION cooltech_quotes.standard_claim(uuid,timestamptz,text,text,integer),
 cooltech_quotes.standard_finish(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cooltech_quotes.standard_claim(uuid,timestamptz,text,text,integer),
 cooltech_quotes.standard_finish(uuid) TO cooltech_quote_runtime;
COMMIT;
