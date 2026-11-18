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

## End-of-session audit handoff — 2026-11-18

Read-only Katwill verification: draft `e725cb08-54bc-4763-972f-0d339ac7194d`,
39 nodes (21 disabled), inactive, unpublished, not archived. `285467` is
successful; no new, running or waiting draft executions. The live jobs workflow
`tlomuOHDE0aCDwwp` remains active with 30 nodes and matching draft/published
version `358bb45b-3677-487b-8274-7362e8b6500b`. The credential-free committed
SDK export is a rebuild reference, not an export of the live jobs workflow.

Start with the pilot path, not the green fixture result. The fixture writer
does not traverse the disabled adapters. Audit these potential pilot blockers:

- `Recover quote UUID` has two incoming paths. Check branch order, empty
  Postgres output, double fan-out and `.first()` scope. Check whether batched
  file claims commit before earlier items can upload or confirm.
- Contact and note acknowledgments use the known quote UUID, not a
  step-specific receipt. Verify actual native node errors and response shapes,
  stale-intent reconciliation, and retry behavior after a file fails mid-batch.
  There is no final read-back/completion gate in the pilot path.
- Verify original attachment inventory shape, n8n item pairing after SQL,
  and HTTP binary response metadata. Marker checks are not full file
  validation. The current size check is after receipt; do not assume Range is
  honored. Test mixed-source dedupe through the real graph with stubs.
- Review fresh-message authorization, source recheck versus staff handling,
  exact UUID filter/offset behavior, timezone and parser coverage for real
  split, ducted and multiline variants. Keep the unimplemented scheduled
  checkpoint separate from the one-message pilot decision.

### Next-session starter prompt

> In the Cooltech repo, read `AGENTS.md`, `PLAN_Website_Quotes.md`, and `quotes/README.md`. Audit Katwill draft `COOLTECH_Website_to_Quote` (`WLNTc3jAC37vdSqE`) against `quotes/workflow.ts` and the installed node contracts. Review the sealed pilot path first: trace graph/item flow and binary pairing, then test empty outputs, lost responses, partial writes, concurrent claims, and deduplication with synthetic fixtures and stubbed adapters only. Check matching, parsing, source rechecks, paging, queue/status, note visibility, attachment inventory and file limits. Report findings in severity order with node/file references, reproduction evidence, recommended fixes, and a one-message pilot go/no-go. This is an audit, not a deployment: don’t edit or run the live jobs workflow, modify the website, write to ServiceM8, process backlog, unseal, publish, or activate anything. Keep the draft unchanged unless I separately ask for fixes.
