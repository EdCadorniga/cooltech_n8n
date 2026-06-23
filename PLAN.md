# Workflow Plan: ServiceM8 Inbox → Job Automation

## Goal

Build an n8n workflow (`COOLTECH_Inbox_to_Job`) on the **katwill** n8n instance that polls the ServiceM8 inbox and auto-converts matching messages into jobs with proper descriptions, contact info, and queue assignment.

## Status (as of June 23, 2026)

- ✅ Workflow exists in n8n instance: **ID `tlomuOHDE0aCDwwp`** (21 nodes, native ServiceM8 community node, credentials assigned)
- ✅ Workflow is **executable and published** — manual test executions `68811` and `68813` completed with status `success` on **June 23, 2026**.
- ✅ A real enquiry was submitted and successfully detected and processed by the live workflow on **June 23, 2026**.
- ✅ Native-node parameter mismatches were fixed by switching to the correct `uuid`, `fields`, and `contactFields` shapes from the upstream source.
- ✅ Queue routing now uses a fixed CONFIG value instead of runtime lookup: `X-New Jobs Created Automation` → `423e140e-89ce-4616-a685-245674278d7b`.
- ✅ Per-item looping is now explicit via `Split In Batches` (`batchSize: 1`) and both branches return control to the loop.
- ✅ A 500 ms delay now sits between conversion and inbox re-fetch on both branches.
- ✅ Job UUID resolution now falls back to `converted_to_job_uuid || convertResult.uuid`, and unresolved items are skipped instead of crashing the run.
- ✅ The live graph now has explicit error-output connections for the convert/fetch/update nodes, so queue and description updates continue even when ServiceM8 conversion succeeds but returns an error output.
- ✅ Job `#2600953SM` was backfilled directly via the ServiceM8 API after confirming the workflow had created the job but skipped the final update step.
- ℹ️ Earlier manual dry runs found no matching inbox items after filtering, but live verification with a real enquiry has now confirmed end-to-end behavior.
- 📦 Archived: `3ei7WaLiYVwDZbaR` (HTTP Request with `httpHeaderAuth` credential), `CQIRmHfW3yYJkJcn` (HTTP Request with `X-Api-Key` header), `oWD4WUSEcWmSZwd6` (older native-node workflow with loop/config issues).
- ✅ Project: `HfMlqgFS6NFMj6hI` ("Automations Server <admin@sm8setup.com.au>")
- ✅ Credential: `Gii70BGIUVSFSVwi` ("COOLTECH ServiceM8 Credentials account", type `serviceM8CredentialsApi`)
- ✅ Workflow SDK code file: `COOLTECH_Inbox_to_Job.ts`

## Match Criteria

1. **Online Service Enquiry** — `message_text` starts with `Online Service Enquiry`. Copy body from the `Service` line down into the job description.
2. **New Enquiry - Cooltech Website** — `subject` contains `New Enquiry - Cooltech Website`. Parse body for contact name/email/phone, set as job contact, copy everything under `You've received a new enquiry` into the job description.

## Processing Steps (per message)

1. Convert inbox message → job (`POST /inboxmessage/{uuid}/convert-to-job.json`)
2. Wait 500 ms, then re-fetch the inbox item to resolve the converted job UUID
3. Set job contact (website enquiries only — `POST /jobcontact.json`)
4. Update job description & queue UUID (`POST /job/{uuid}.json`)
5. Queue target: `X-New Jobs Created Automation`

---

## Current Node Configuration (using native ServiceM8 community node)

### 1 — `Check Inbox` (Schedule Trigger)
- Type: `n8n-nodes-base.scheduleTrigger` v1.3
- Every 10 minutes.

### 2 — `CONFIG` (Code)
- Type: `n8n-nodes-base.code` v2, mode `runOnceForAllItems`
- Output: `{ targetQueueName: 'X-New Jobs Created Automation', targetQueueUuid: '423e140e-89ce-4616-a685-245674278d7b' }`
- (CONFIG no longer holds the API key — auth is delegated to the credential.)

### 3 — `Find Queue UUID` (ServiceM8 `search.objectSearch`)
- Removed. `search.objectSearch` cannot be used for queue lookup because ServiceM8 rejects `objectType: 'queue'`.
- Replacement: `CONFIG` now outputs `targetQueueUuid: '423e140e-89ce-4616-a685-245674278d7b'`.

### 4 — `List Inbox Messages` (ServiceM8 `inbox.getMany`)
- Type: `@servicem8/n8n-nodes-servicem8.serviceM8` v1
- Parameters: `resource: 'inbox'`, `operation: 'getMany'`, plus optional filter/search/limit
- `executeOnce: true`

### 5 — `Filter & Route` (Code)
- Type: `n8n-nodes-base.code` v2, mode `runOnceForAllItems`
- Reads items, pulls `queueUuid` from `CONFIG`, sorts by date desc, takes 20, drops already-converted, classifies by `message_text` / `subject` pattern, and preserves both `from_name`/`from_email` and camelCase fallbacks.
- Returns `[]` if nothing matches → workflow exits cleanly.

### 6 — `Route by Type` (Switch)
- Type: `n8n-nodes-base.switch` v3.4, mode `rules`
- Rules:
  - `Online` if `$json.type === "online"`
  - `Website` if `$json.type === "website"`
- `fallbackOutput: 'none'`

### Branch A — Online
- **`Convert Online to Job`** — ServiceM8 `inbox.convertToJob` (uuid param, `continueErrorOutput`)
- **`Wait Before Fetch Online`** — Wait 500 ms
- **`Fetch Converted Online Message`** — ServiceM8 `inbox.get`
- **`Merge Online Data`** — Code (`runOnceForEachItem`). Reads `$("Filter & Route").item.json`, resolves `jobUuid` from `converted_to_job_uuid || convertResult.uuid`, parses "Service:" line, and returns `{ route, jobUuid, description, queueUuid }`.
- **`Route Resolved Online Item`** — Switch: `process` vs `skip`
- **`Update Online Job`** — ServiceM8 `job.update` (uuid + additional fields)
- **`Finish Online Item`** — terminal node that returns control to the loop

### Branch B — Website
- **`Convert Website to Job`** — ServiceM8 `inbox.convertToJob` (`continueErrorOutput`)
- **`Wait Before Fetch Website`** — Wait 500 ms
- **`Fetch Converted Website Message`** — ServiceM8 `inbox.get`
- **`Merge Website Data`** — Code. Parses `Name:`, `Email:`, `Phone:`, extracts description after `"You've received a new enquiry"`, resolves `jobUuid` from `converted_to_job_uuid || convertResult.uuid`, and returns `{ route, jobUuid, description, queueUuid, contactFirst, contactLast, contactEmail, contactPhone }`.
- **`Route Resolved Website Item`** — Switch: `process` vs `skip`
- **`Create Job Contact`** — ServiceM8 `job.updateContacts`
- **`Update Website Job`** — ServiceM8 `job.update` (uses `$("Merge Website Data").item.json.*` for fields)
- **`Finish Website Item`** — terminal node that returns control to the loop

---

## Connection Flow

```
Check Inbox (Schedule, 10 min)
  → CONFIG (Code)
    → List Inbox Messages (ServiceM8 inbox.getMany, executeOnce, limit 20)
      → Filter & Route (Code — sort desc, take 20, classify)
            ↓ (empty = success, exit clean)
            → Process Matched Items (Split In Batches, batchSize 1)
                → Route by Type (Switch)
                    ├── Online:  Convert → Wait → Fetch → Merge → Route Resolved → Update/Skip → Finish → next batch
                    └── Website: Convert → Wait → Fetch → Merge → Route Resolved → Contact/Update or Skip → Finish → next batch
```

---

## Phase 2 — Resolved Issues

The ServiceM8 community node parameter mismatches are fixed. The published workflow now uses:

- `inbox.getMany` with `inboxFilter`, `inboxSearch`, `limit`
- `inbox.convertToJob` with `uuid`
- `job.update` with `uuid` + `fields.field[]`
- `job.updateContacts` with `uuid`, `contactType`, `contactFields`

One important design correction came from live testing:

- `search.objectSearch` is valid syntactically, but the ServiceM8 API returns `400 Unsupported object type: queue` for queue searches.
- Because of that, queue lookup was removed from the workflow. The queue UUID is now stored in `CONFIG`.

Another important correction came from conversion testing:

- ServiceM8 conversion can succeed even when the convert node reports a failure.
- Because of that, the workflow now waits 500 ms, re-fetches the inbox item, and resolves the created job UUID via `converted_to_job_uuid || convertResult.uuid`.
- Unresolved conversions are routed to `skip` so the loop can continue processing later items instead of halting.
- The published graph must also carry explicit error-output connections; `continueErrorOutput` by itself was not enough in the live workflow version that failed to assign queue and description on Job `#2600953SM`.

### Key IDs / context (don't lose)

- Project ID: `HfMlqgFS6NFMj6hI` ("Automations Server <admin@sm8setup.com.au>")
- Credential: `Gii70BGIUVSFSVwi` — "COOLTECH ServiceM8 Credentials account" — type `serviceM8CredentialsApi`
- Current workflow: `tlomuOHDE0aCDwwp` (`COOLTECH_Inbox_to_Job`, 21 nodes)
- Archived (don't reuse): `3ei7WaLiYVwDZbaR`, `CQIRmHfW3yYJkJcn`, `oWD4WUSEcWmSZwd6`
- Schedule: every 10 minutes
- Queue target: `X-New Jobs Created Automation`
- Queue UUID: `423e140e-89ce-4616-a685-245674278d7b`
- API key (for documentation / fallback): `smk-f6d33c-b98e46653ac5783f-4ccc6dd94e040eb2`

## Design Decisions

- **CONFIG node** centralises the queue name and queue UUID — no magic strings, no secrets.
- **Native ServiceM8 community node** over HTTP Request — type defs can't be loaded by the `get_node_types` tool (`@` prefix), but the credential auto-assigns, so manual parameter construction from the source repo is the workaround.
- **executeOnce: true** on inbox fetcher prevents N×M item multiplication.
- **Code nodes** for filtering/parsing because multi-condition checks and string slicing need a full language.
- **Switch** for clean multi-way routing with labelled outputs (IF nodes explicitly banned).
- All expressions reference `$("CONFIG")` for configuration values and upstream nodes by name (`$("Merge Website Data").item.json.*`) for fan-in data.
- **20 most recent only**: We sort inbox by date descending and take the top 20 before filtering. If none match criteria, the array is empty → downstream nodes are skipped → workflow exits with success.
- **Loop control is explicit**: `Split In Batches` ensures all matched items are processed one at a time.
- **Conversion is eventually consistent**: after conversion the workflow waits 500 ms, re-fetches the inbox item, and falls back to the convert node response if the inbox record has not updated yet.
- **Current text-source rule**: description parsing currently uses `body || message_text` because ServiceM8 inbox payloads are not uniform across all message types.
- **Future hardening option**: normalize the inbound text once in `Filter & Route` into a canonical field such as `sourceText`, and make all downstream nodes consume only that field. This has been documented but not applied yet.
- **Live verification is complete**: the current published workflow has now processed a real enquiry successfully, not just synthetic/manual dry runs.

---

## GitHub Setup

- Remote: `https://github.com/EdCadorniga/cooltech_n8n`
- `.gitignore` excludes `.env` and `node_modules/`.
- Workflow SDK code and documentation are committed for version tracking.
- **Note**: changes since last commit — `COOLTECH_Inbox_to_Job.ts` was completely rewritten (HTTP Request → native ServiceM8 node). Not yet committed/pushed.

## Remaining Steps (new session)

- [x] Phase 1: Research & Planning
- [x] Phase 2: Write the workflow SDK file (`COOLTECH_Inbox_to_Job.ts`)
- [x] Phase 3: Validate (`validate_workflow` — clean)
- [x] Phase 4: Resolve project ID
- [x] Phase 5: Create workflow (`oWD4WUSEcWmSZwd6`)
- [x] Phase 6: Fix ServiceM8 native-node parameter names
- [x] Phase 7: Re-test with `execute_workflow executionMode: manual`
- [x] Phase 8: Publish with `publish_workflow`
- [x] Phase 8b: Replace broken live workflow with audited workflow (`tlomuOHDE0aCDwwp`) and archive `oWD4WUSEcWmSZwd6`
- [x] Phase 8c: Verify against a real incoming enquiry
- [ ] Phase 9: Commit & push `COOLTECH_Inbox_to_Job.ts` to GitHub
- [x] Phase 10: Update AGENTS.md with final auth approach
