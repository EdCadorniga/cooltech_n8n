-- Fresh, dedicated Cooltech database; do not migrate/release legacy pending claims.
BEGIN;
CREATE TABLE website_quote_plan (
  source uuid PRIMARY KEY,
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$')
);
CREATE TABLE website_quote_intent (
  source uuid NOT NULL REFERENCES website_quote_plan(source),
  step text NOT NULL CHECK (step ~ '^(quote|contact|note|(file|upload):[0-9a-f]{64})$'),
  intent_id uuid NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  PRIMARY KEY(source,step)
);
CREATE TABLE website_quote_pilot_used (
  source uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
