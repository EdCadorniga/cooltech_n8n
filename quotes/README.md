# Website quote draft

Katwill personal project **Automations Server**, workflow `WLNTc3jAC37vdSqE`.
`workflow.ts` is the self-contained SDK export; rebuild with `node quotes/build.mjs`.
Manual execution generates fixtures. The pilot gate returns zero items. All
database, network and ServiceM8 pilot adapters are individually disabled.
Do not just enable the nodes: disabled n8n nodes pass their inputs through.

Hosted run `285467`: 18 deliveries, eight excluded or held before creation,
nine distinct simulated quotes, 19 binary attachments, zero duplicate writes.
Six completed; three had a rejected transfer. Tested dual markers, cutoff,
manual handling, contact/site/form mapping, both sources separately and together,
inline exclusion, partial upload, invalid bytes, redirects, size, same bytes
under different names, repeat delivery, throttling and lost write responses.
No live download or upload is implied. `python quotes/test-ledger.py` checks
two database connections; `test-postgres.mjs` checks the actual SQL routines
locally across a database restart. Never provision `ledger.sql` in n8n's
internal DB or another client's DB.

## Before a one-message pilot

1. Name the approving owner, operator, exception reviewer, time window and
   cleanup procedure. Reserve one fresh synthetic message from staff handling.
   Include labelled URLs, one actual attached file and one cross-source duplicate.
2. Verify an existing unsent Quote in the destination read-only. Confirm native
   create supports the selected queue field at creation, the note is private,
   and account automations cannot send, price or schedule. Confirm client UUID
   and expected original/inline attachment inventory. Unknown client or
   unsupported file type requires review; no client creation or billing update.
3. Approve a dedicated PostgreSQL ledger and limited credential; apply the schema
   there and test the hosted bindings with synthetic rows. Bind only Cooltech's
   ServiceM8 credential to its own API/native nodes, never the photo downloader.
   Confirm response envelopes, UUID receipts, binary mode and retention. Set
   execution retention/time limits before handling customer data. The downloader
   requests a byte range and rejects oversized/partial files after receipt;
   confirm an enforced transport cap if the server ignores Range. The pilot
   allows JPEG/PNG and email PDFs; other formats require review.
4. Separately approve just one manual run with `source`, `client`, `cutoff`,
   `until`, `verifiedEmailFiles` and `verifiedInlineIds` set from reviewed data.
   Never use fixture IDs. The pilot reads at most four pages of 25 with an exact
   UUID filter, and re-reads the allowlisted message. Do not open the gate if
   any external adapter is bypassed. Leave schedule and publication off.
5. Verify one quote, queue/status, contact, description, private note, file
   counts and openable bytes in ServiceM8, unchanged inbox state and no sends.
   Unknown write outcome: inspect outstanding ledger intent and actual record;
   only record a verified UUID. Never release a claim to try creating again.
   Close the gate and disable adapters afterwards. No automated cleanup.

Normal multi-message scheduling, client resolution and a moving-inbox polling
checkpoint require separate work and rollout approval. No historical import.
