# Website quote draft

## Current pilot handoff

**Quote-first revision:** ServiceM8's Job Create schema
requires `status`, not `company_uuid`. The revised pilot creates directly
in `Quote` status with no preselected client, verifies the submitted job
contact and diary note, verifies all three photos, then assigns
`X-New Website Quotes` in a separate, ledger-protected update. The inbox is
read only; this is not the native Convert to Job action. A reference Quote
can still be checked if available. The dedicated DB migration produced by
`node quotes/katwill-upgrade-ledger.mjs` was applied after a verified ledger
backup, and the revised native extension files were installed with a rollback
copy. Both n8n services were healthy after restart. Hosted manual read-only
execution `286839` returned `preflight_verified` with three distinct decoded
photos; manual execution retention was turned back off. The draft remains
inactive and unpublished; the live jobs workflow's draft and published IDs
were unchanged. No pilot permit or write. Confirm ServiceM8 account-side
sends and diary privacy and agree to the one-message permit and cleanup.

**Production infrastructure deployed — 2026-11-19.** The private node is
installed on Katwill's shared volume and both n8n containers are healthy
after restart. PostgreSQL 17 TLS was enabled by reload after a fresh readable
n8n backup and saved configuration. Existing application auth rules were
preserved. The dedicated `cooltech_quotes` DB is provisioned, and a test from
the production n8n container confirmed verified TLS, no direct ledger table
access, and denial of both non-TLS and internal `n8n` DB logins. The
`Cooltech Quote Ledger` credential is stored in Katwill. No permit was opened.
Include the new database in the backup plan before any ongoing processing.

`WLNTc3jAC37vdSqE`, version `b31dd8b4-a867-4417-99a4-3323ee4bc528`,
is inactive and unpublished with Manual Trigger → native read-only preflight.
Both credentials are bound; optional client and baseline Quote UUIDs are
intentionally blank. `katwill-workflow.ts` is the
sanitized native graph; `workflow.ts` is the older adapter rollback artifact.
The exact source was fresh when rechecked with three decodable photos and
zero direct files. ServiceM8 diary privacy and account-side automation still
need verification. No write run,
ServiceM8 or inbox mutation, or live jobs workflow edit or manual run occurred.

**Native node implementation and install reference.** The private node in
`quotes/katwill/` runs the bounded downloader, full image decoder, ServiceM8
read-back and durable claim inside the Katwill worker. It needs no external
adapter host. It defaults to read-only preflight and refuses non-manual
executions or any workflow other than `WLNTc3jAC37vdSqE`. This implements the
one-message, three-linked-photo pilot only; direct email attachments cause a
hold. It is not a scheduled production rollout.

Local infrastructure checks: the extension loaded on n8n `2.45.4` with
the ServiceM8 credential type present. In a disposable PostgreSQL `18.6`
instance, two concurrent SQL sessions using the restricted role attempted
the same synthetic permit; exactly one claim succeeded. These are not
hosted binding or ServiceM8 production tests. The Katwill infrastructure
repo's `main` push triggers a shared-stack redeploy; don't push it as a
staging step. Verify current backups and obtain a restart window.

1. **Katwill admin:** use `node quotes/stage-katwill.mjs <new-directory>` and
   `npm ci --omit=dev` inside the staged directory on the target OS/architecture
   (the image decoder has native dependencies). Stage the directory outside the
   repo, and load it as a private extension using `N8N_CUSTOM_EXTENSIONS`
   on the editor and execution workers. Validate against a matching non-live
   n8n image before a separately approved server rollout; don't restart the
   live instance to install it without a maintenance plan. The MCP tools do
   not install this private extension.
2. **DB admin:** provision `cooltech_quotes` on the existing server and apply
   `katwill-ledger.sql` as a dedicated owner. Use a non-owner login
   `cooltech_quote_runtime` with TLS verification; grant only DB `CONNECT`,
   schema `USAGE`, and `EXECUTE` on `claim`, `settings`, `plan`, `reserve`,
   `confirm`, and `close` in the ledger schema. No role memberships or object
   ownership. Restrict this login to the dedicated DB by host access rules;
   check other DBs are denied. Configure a **Cooltech Quote Ledger** credential
   in n8n with the TLS hostname, password, and the CA if private. Prove real
   concurrent claims with two sessions using a synthetic permit and no API.
3. **Operator:** after installation, bind only the new ledger credential and
   Cooltech's existing ServiceM8 credential. Replace the disabled legacy
   adapter chain in `WLNTc3jAC37vdSqE` with Manual Trigger → the private node
   in `Read-Only Preflight` mode. Disable node retries and execution data
   retention; keep it inactive and unpublished. Check a verified client,
   baseline Quote and only the exact approved source; if stale or ineligible,
   stop and obtain a fresh exact UUID. Read-only mode cannot consume a permit.
   Verify diary privacy, storage redirect hosts and account automations
   separately; the job API alone cannot prove no notifications.
4. **Owner approval:** agree source, client, baseline, at-most-15-minute
   window, expected writes and cleanup. Only then may the owner insert the
   permit (`source`, `client`, `baseline_quote`, `opens_at`, `closes_at`,
   `inbox_utc_offset`, three expected photos) and the operator switch to
   `Run Approved Permit Once` for a single manual run. The permit is closed by
   the node on normal return/error; if the worker dies or closure cannot be
   verified, set `closed_at` for that exact source and retain both tables. Go
   back to read-only mode. Independently verify the exact Quote and inbox in
   ServiceM8, including all openable photos, the private diary note and no
   sends. On uncertainty inspect the exact recorded UUIDs; do not reset a
   claim, retry a create, or perform unapproved cleanup.

**Resume prompt:** Read `AGENTS.md`, `PLAN_Website_Quotes.md` and this handoff.
Confirm the private node has been installed and the dedicated Cooltech ledger
credential provisioned. Wire only `WLNTc3jAC37vdSqE` in read-only mode and
complete preflight for the exact supplied UUID. If it is no longer eligible,
ask for a fresh exact UUID. Get separate approval for one manual write and
cleanup. Do not publish, activate, process backlog, or touch live jobs.

**Historical check before infrastructure deployment — 2026-11-19:** No production pilot, permit, ledger deployment,
or ServiceM8 writes. Katwill read-only execution `286793` proved that
`Postgres account` connects as an elevated `n8n` role to the internal `n8n`
database. Do not use it for the ledger. The temporary SQL probe was removed;
the three-node disabled-adapter graph was restored as draft
`fb9cba27-be96-4a89-a9fd-c9b2c8ffdc87`, inactive, unpublished and not archived.

`katwill-ledger.sql` is a local migration for a dedicated `cooltech_quotes`
database on the same server, not for the internal database. The DB admin must
provision the database and separate owner/runtime roles, apply the migration,
and configure a new Katwill credential for the runtime role. Grant it `CONNECT`
on the dedicated DB, `USAGE` on the ledger schema, and `EXECUTE` on the
named functions only; do not grant table access. Confirm the role has no
elevated attributes or inherited privileges and cannot access n8n or other
clients' tables. Local tests exercised the permit, denied table access and
repeat create guard; real concurrent sessions, a hosted binding and the
Katwill-native ServiceM8 graph remain to be verified on the host.

Only the supplied inbox UUID was looked up. Its sender matched, it was active,
unarchived, unconverted and unsnoozed, and three distinct photos decoded with
zero direct attachments. Its freshness cutoff is **20 Nov 01:13:57 AEDT**.
The queue was confirmed active; a bounded filtered job API query did not
return a matching Quote. Obtain a known unsent Quote UUID and approved test
client UUID and verify account automation and diary privacy before approving
a window. If the original item is no longer eligible, ask for a fresh one and
its exact UUID. Do not open a permit simply because a candidate is available.

**EOS — 2026-11-19:** Next session's goal is one end-to-end manual test of the
actual production write path, not rollout. No live test or ServiceM8 write
occurred. Prior Katwill workflow `WLNTc3jAC37vdSqE`, draft
`45a411ae-eb9a-4d22-8248-388d1f90e7f0`, is inactive, unpublished, not archived,
and has no pending runs. Its three nodes are Manual Trigger → disabled,
uncredentialed `.invalid` adapter → receipt verification. No synthetic branch.
The live jobs workflow is still active on published version
`358bb45b-3677-487b-8274-7362e8b6500b` and was only read.

On `main`, `69eb842` records the manual-only graph and `fcc9727` adds the
read-only source/file preflight with the same image decoder used by the engine.
Six local tests passed. Hosted execution `285504` used stubs and does not prove
live bindings or writes. The exact test item matched the sender and template
and was eligible when checked. It has no linked client or active original
attachment records; three distinct JPEGs downloaded and fully decoded.
Contact, address and note mapped locally, not in a saved Quote.

1. Finish the native write path in Katwill; no separate adapter host exists.
   Use a Cooltech-only ledger and least-privilege role on the existing
   production PostgreSQL server. Verify the target and scope of `Postgres
   account` before using it; never write to n8n's internal or other clients'
   tables. Prove one-shot claims, exact-UUID readback and no duplicate creates
   if a write response is lost. Keep the draft unpublished.
2. Complete ServiceM8 preflight: confirm the approved test client, an existing
   unsent Quote in `X-New Website Quotes`, internal note privacy and no automatic
   sends, scheduling or pricing. Default to creating the job record directly
   in Quote status. Native inbox conversion changes the source and must not
   be substituted unless a verified production template creates the unsent
   Quote in the correct queue without a temporary work order and the owner
   explicitly agrees to the inbox change.
3. Recheck only the exact test UUID from the conversation (not Git). Use
   `node --env-file=.env quotes/inspect-source.mjs <exact-uuid> --check-files`.
   The current item's 24-hour window ends **20 Nov at 01:13:57 AEDT**. Ask for a
   fresh test UUID if stale or otherwise ineligible. Confirm the UUID, test
   window (at most 15 minutes), expected writes and cleanup before one run.
4. Verify exactly one unsent Quote in `X-New Website Quotes`, correct job
   contact, address and description, private diary note, and all expected
   files open. Verify no unexpected sends or inbox changes. Close the permit,
   retain the ledger and do not retry an uncertain create. Do not publish,
   activate, schedule, process backlog, edit the website or touch live jobs.

**Next-session starter prompt:**

> In Cooltech, read `AGENTS.md`, `PLAN_Website_Quotes.md`, and the current
> handoff in `quotes/README.md`. Finish the Katwill-native production path in
> unpublished draft `WLNTc3jAC37vdSqE` using the existing production PostgreSQL
> server with a Cooltech-only ledger, not n8n's internal tables. Complete
> ServiceM8 preflight and recheck only the exact test inbox UUID I provided;
> ask for a fresh one if ineligible. Confirm the approved client, UUID, window,
> expected writes and cleanup with me, then run the actual production path
> manually once. Verify one unsent Quote in `X-New Website Quotes`, correct
> job contact, address, description, private diary note and openable photos,
> with no unexpected sends or inbox changes. Close the permit and retain the
> ledger. Do not publish, activate, schedule, process backlog, edit the website
> or edit/run the live jobs workflow.

## Historical adapter-host handoff (superseded)
The objective is one manually approved, unsent website Quote, not a rollout.
Katwill was rechecked read-only: the draft is not archived, no quote
executions are new/running/waiting, and the live jobs workflow remains active
with the same published version. No live pilot, ServiceM8 writes, deployment,
publication, activation, or schedule changes occurred.

Implementation commits `4f18798` and `fc1115e` are local on `main`, two commits
ahead of `origin/main`. The only uncommitted changes at closeout are handoff
updates in `AGENTS.md`, `PLAN_Website_Quotes.md`, and this file.

Katwill personal project **Automations Server**, workflow `WLNTc3jAC37vdSqE`,
draft `4ec0688b-7e83-47d2-9cef-255c0701e8df`: inactive, unpublished, manual
trigger only. The six-node draft is sealed: mode is hard-coded to synthetic,
the uncredentialed HTTP adapter is disabled and its URL ends in `.invalid`.
Rollback references: prior hardened sealed draft `49794895-5a88-4775-8e83-dde02ca8e862`
(older subject/footer rules), and pre-change sealed draft
`be158c18-e636-4fa5-9c96-19f7db022d34`. Neither is approved for a live run.
The live jobs workflow was only read:
its published graph re-fetches the exact inbox item after both conversion
outcomes. We use its two delay intervals for exact quote UUID reconciliation,
but do not convert or modify the inbox item.

### Build and test

```sh
npm ci --prefix quotes
npm test --prefix quotes
node quotes/build.mjs
```

`workflow.ts` is generated. Hosted run `285504` passed eight cases against
the same `engine.mjs` used by `server.mjs`, with stub ServiceM8 and ledger
adapters. Local tests also exercise the actual ledger SQL in PGlite across a
restart, the HTTP permit/receipt path on loopback, and streamed transfer
limits and redirect credential separation. All five local tests passed on
closeout. The hosted HTTP adapter did not run; deployed bindings, real
PostgreSQL multi-session locking and ServiceM8 write/read-back behavior
remain unverified. ServiceM8 documents supplied
create UUIDs for [jobs](https://developer.servicem8.com/reference/createjobs),
[job contacts](https://developer.servicem8.com/reference/createjobcontacts),
[notes](https://developer.servicem8.com/reference/createnotes) and
[attachment metadata](https://developer.servicem8.com/reference/createattachments).
The engine saves each UUID before POST, uses exact GET and field checks for
all receipts, and uses an exact-byte digest for file upload completion. With
no proof of a write, it holds rather than sending another create/upload.
Files are validated before the first ServiceM8 write; the adapter enforces
10 MiB per file, 32 MiB total and timeout limits, decodes JPEG/PNG, and never
passes the ServiceM8 key to the website or a storage redirect. PDFs and other
formats are held before writing (not supported by this pilot).

The only positive match signal is the case-insensitive phrase
`New website quote request` anywhere in the email body; neither subject prefix
nor Page URL is required. A mention without a valid form is held, and legacy
jobs-rule overlap still blocks processing. The pilot additionally requires
an exact UUID and independently verified sender. The full copy-and-paste block
(address, contact, category, status, lead source and generated description) goes
into the internal diary note, followed by labelled source photo links. Form
answers are also mapped to the job description. Landline-like values go to
Phone; mobile values to Mobile. The reported bare `61` landline form is kept
as supplied, not silently repaired or used to dial.

### Pilot prerequisites — do not unseal yet

1. The owner authorized a bounded, read-only API search. Both supplied examples
   matched; the newer test passed source-state and freshness checks at lookup
   and had three photo links and zero direct attachments. The older test was
   outside the 24-hour window. Use the newer exact UUID from the session
   handoff (not Git) and recheck it. Its offset-less API timestamp normalized
   to `2026-11-18T14:13:57Z` at the corroborated `+11:00` offset; request a fresh
   submission if the 24-hour lookback has expired. For the exact read, use
   `node --env-file=.env quotes/inspect-source.mjs <exact-uuid>` from repo root;
   this makes one exact read and prints no message body or contact details.
   If archived, converted, stale, previously used or ambiguous, ask for a
   fresh submission. Do not reset it. Keep the approved item out of staff
   handling during the pilot (advisory locks do not lock ServiceM8 staff out).
2. Approve a dedicated Cooltech adapter host and PostgreSQL database; never
   use n8n's internal or another client's DB. Apply `pilot-ledger.sql` as a
   migration owner and give the runtime identity only `SELECT`/`INSERT` on
   the three dedicated tables and `UPDATE(verified)` on `website_quote_intent`.
   Use a session-capable connection (no transaction pooler); test exclusivity
   with two hosted sessions and verify any legacy ledger has no claim for
   the item. Run the service behind a private, Katwill-only HTTPS proxy with
   redirect following and POST retries off. Set `COOLTECH_PILOT_DATABASE_URL`,
   `COOLTECH_API_KEY`, `COOLTECH_PILOT_TOKEN` (random 32 bytes encoded as hex),
   exact verified `COOLTECH_STORAGE_HOSTS`, and `COOLTECH_PILOT_APPROVAL` via
   protected configuration, not Git. Test hosted bindings with synthetic
   dependencies before loading a real permit. Verify retention and proxy logs.
3. Read-only preflight: check a known unsent Quote in the exact queue, verify
   account automation cannot send, schedule or price, confirm private diary
   note behavior and approved client UUID. Verify the selected item's original
   and inline attachment inventory, source origin and exact GET response.
   The permit contains `source`, `client`, `sender`, `from`, `until`, `cutoff`
   (explicit timezone, ≤15-minute run window, ≤24-hour lookback), `inboxUtcOffset`
   for offset-less ServiceM8 timestamps (verify for the candidate date), `emailFiles`,
   `inlineIds`, and the verified `inboxRelation` when files are present.
   Keep only this UUID approved; no inbox listing/backlog scan.
4. Confirm exact UUID, window, expected writes and cleanup with the owner
   before one manual run. Expected ServiceM8 changes: one unsent Quote, one
   job contact, one internal diary note, one metadata
   record and binary upload for each unique file; no inbox or client writes,
   no sends. Bind only the dedicated adapter bearer credential in Katwill;
   do not publish, activate, or schedule.
5. Independently verify one Quote in **X-New Website Quotes**, correct fields,
   private note, openable files, unchanged exact inbox item, and no unexpected
   customer/staff notifications or activity. A link-only submission cannot
   prove original email files or mixed-source deduplication live. If unresolved,
   inspect the exact stored intent UUID and remote record read-only. Do not
   clear the one-shot guard, rerun, or retry a create; any repair is separately
    approved. Restore the invalid URL, disabled adapter and no selected
    credential; remove the permit, stop the adapter, retain the ledger.
   Do not clean up ServiceM8 records without the agreed procedure.

**Resume prompt:** In Cooltech, read `AGENTS.md`, `PLAN_Website_Quotes.md`, and
the current handoff in `quotes/README.md`. Verify Katwill draft `WLNTc3jAC37vdSqE`
is sealed. Recheck the newer test inbox UUID read-only or request a fresh
submission if ineligible. Agree on a private adapter host and dedicated
PostgreSQL ledger, then complete hosted synthetic and ServiceM8 read-only
preflight. Confirm UUID, window, writes and cleanup before one manual pilot.
Verify the unsent Quote, files, no sends or inbox changes, and re-seal. Do not
publish, activate, schedule, process backlog, edit the site, or edit/run live jobs.

## Historical draft notes (superseded)

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

## EOS handoff — 2026-11-18

**No-go for live writes as-is.** Next objective: production-quality
implementation kept as an inactive, unpublished draft. The one-message pilot
does not authorize scheduled rollout.

Read-only closeout: quote draft `be158c18-e636-4fa5-9c96-19f7db022d34`,
39 nodes (21 disabled), inactive, unpublished, not archived. Graph and
parameters match `workflow.ts` apart from layout and omitted defaults.
Jobs workflow `tlomuOHDE0aCDwwp` is active and not archived (30 nodes;
published `358bb45b-3677-487b-8274-7362e8b6500b`, draft
`3558c490-c81b-4556-a517-6f99b3909871`). Neither had new, running or waiting
executions. No workflow/code changes or ServiceM8 calls. `main` tracked
`origin/main` and was clean before this docs-only closeout. Preserve the
current draft version or a sanitized export before editing.

1. **Recovery and receipts (`pilot.mjs`, `ledger.sql`):** A stubbed create
   committed then threw. Replay blocked a duplicate but could not find the
   quote. Persist a verified remote correlation ID before the write and route
   acquired/confirmed/pending through one recovery step; clean create currently
   fans out twice. Contact and note accepted empty receipts and stored the
   quote UUID. Require step-specific receipts and final read-back. Published
   jobs conversion re-fetches the exact inbox UUID after either outcome
   (500 ms, then 3 s if the link is absent). Apply the same reconcile-before-
   retry rule; direct quote creation does not set `converted_to_job_uuid`.
2. **Intake (`map.js`, `pilot.mjs`):** Use an exact UUID GET for the pilot.
   Inbox list `$filter` is undocumented; a short page with `has_more` passed
   as complete. Normalize documented boolean source state; reject jobs-rule
   overlap, handled sources and ambiguous origin. Harden template, phone,
   timestamp and approval bounds. Reserve the item from staff and recheck
   immediately before writes.
3. **Files (`pilot.mjs`):** Preflight unique inventory and dedupe combined
   bytes, then claim/upload/confirm one file at a time. Same-batch duplicates
   produced zero uploads; failing upload two of three left three pending
   claims. Record the metadata UUID before transfer to reconcile partial
   uploads. Enforce transfer-time byte/time budgets and structural validation.
   Verify storage redirect credentials, original file linkage and inline inventory.
4. **Test gates:** Local `test-ledger.py` and `test-postgres.mjs` passed.
   The modeled pilot used actual Code bodies and SQL with stubs: cross-source
   dedupe restored the surviving file and confirmed replay wrote nothing.
   Hosted `285467` exercised fixture nodes and the seal only. Test the fixed
   full graph with stubs, then verify hosted bindings, receipts, binary pairing,
   dedicated ledger, status/queue, note privacy and retention. Confirm no
   automatic sends, pricing or scheduling.
5. **Candidate:** owner's existing website test submission. Obtain its exact
   UUID and inspect only that item read-only. If archived, converted, previously
   used or ambiguous, ask for a fresh submission; do not reset it. If link-only,
   original-file and mixed-source behavior remain unverified live. Confirm the
   UUID, window, expected writes and cleanup before one manual live run.
   Verify the outcome and re-seal afterward.

### Next-session starter prompt

> In the Cooltech repo, read `AGENTS.md`, `PLAN_Website_Quotes.md`, and the EOS handoff in `quotes/README.md`. Fix the audit blockers in the repo source and the existing Katwill draft `COOLTECH_Website_to_Quote` (`WLNTc3jAC37vdSqE`). Make it production-ready, but keep it inactive and unpublished. Test the full graph with synthetic fixtures and stubbed adapters first, including a create that commits but returns an error, competing claims, missing receipts, and mixed-source partial uploads. Recover the existing quote; never blindly create again.
>
> Use the inbox item from my website test submission as the proposed one-message pilot. Ask me for its exact UUID, inspect only that item read-only, and confirm it is still eligible. If not, ask for a fresh submission. Once stub tests and preflight pass, confirm the UUID, window, expected writes and cleanup with me before a single manual live run. Verify one unsent Quote in `X-New Website Quotes`, with correct contact, address, description, private notes, expected openable files, and no unexpected sends or inbox changes. Re-seal afterward. Do not publish, activate, run or edit the live jobs workflow, change the website, process the backlog, or enable scheduled processing.

## Historical pre-audit handoff (superseded by EOS above)

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
