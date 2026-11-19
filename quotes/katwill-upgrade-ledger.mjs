// Emit the reviewed V2 migration. Apply to the Cooltech database only after
// saving a backup and confirming there's no open permit.
import {readFileSync} from 'node:fs';
const schema=readFileSync(new URL('./katwill-ledger.sql',import.meta.url),'utf8');
const routines=['claim','reserve'].map(name=>{
  const block=schema.match(new RegExp(`CREATE FUNCTION cooltech_quotes\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))?.[0];
  if(!block)throw Error(`Missing ledger routine: ${name}`);
  return block.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
}).join('\n');
process.stdout.write(`BEGIN;
DO $$
BEGIN
  IF current_database() <> 'cooltech_quotes' OR to_regclass('public.workflow_entity') IS NOT NULL THEN
    RAISE EXCEPTION 'Expected the dedicated cooltech_quotes database';
  END IF;
END;
$$;
LOCK TABLE cooltech_quotes.pilot IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT FROM cooltech_quotes.pilot WHERE closed_at IS NULL AND closes_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'Close the existing permit before migration';
  END IF;
END;
$$;
ALTER TABLE cooltech_quotes.pilot ALTER COLUMN client DROP NOT NULL, ALTER COLUMN baseline_quote DROP NOT NULL;
ALTER TABLE cooltech_quotes.intent DROP CONSTRAINT intent_step_check,
  ADD CONSTRAINT intent_step_check CHECK (step ~ '^(quote|contact|note|queue|(file|upload):[0-9a-f]{64})$');
SET ROLE cooltech_quote_owner;
${routines}
RESET ROLE;
COMMIT;
`);
