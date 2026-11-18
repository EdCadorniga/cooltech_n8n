-- Provision separately in a dedicated integration database. No customer payload.
CREATE TABLE cooltech_quote_step (
  source_uuid text NOT NULL, step text NOT NULL,
  owner text NOT NULL, result_uuid text,
  PRIMARY KEY(source_uuid,step)
);

-- PostgreSQL pilot adapter. A conflict on an unfinished write is not a retry.
CREATE FUNCTION cooltech_reserve(s text, k text, worker text)
RETURNS TABLE(source_uuid text, step text, owner text) LANGUAGE plpgsql AS $$
DECLARE acquired boolean; saved text;
BEGIN
  INSERT INTO cooltech_quote_step VALUES(s,k,worker,NULL)
    ON CONFLICT ON CONSTRAINT cooltech_quote_step_pkey DO NOTHING;
  acquired := FOUND;
  IF acquired THEN RETURN QUERY SELECT s,k,worker; RETURN; END IF;
  SELECT t.result_uuid INTO saved FROM cooltech_quote_step t
    WHERE t.source_uuid=s AND t.step=k;
  IF saved IS NULL THEN
    RAISE EXCEPTION 'Pending quote step: inspect ledger and reconcile before resuming';
  END IF;
END $$;

CREATE FUNCTION cooltech_confirm(s text,k text,worker text,id text)
RETURNS TABLE(result_uuid text) LANGUAGE plpgsql AS $$
BEGIN
  IF id IS NULL OR id !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Missing valid write receipt; reconcile outstanding intent';
  END IF;
  UPDATE cooltech_quote_step AS t SET result_uuid=id
    WHERE t.source_uuid=s AND t.step=k AND t.owner=worker AND t.result_uuid IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unowned or previously completed intent'; END IF;
  RETURN QUERY SELECT id;
END $$;
