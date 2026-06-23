# Workflow Plan: ServiceM8 Inbox → Job Automation

## Goal

Build an n8n workflow (`COOLTECH_Inbox_to_Job`) on the **katwill** n8n instance that polls the ServiceM8 inbox and auto-converts matching messages into jobs with proper descriptions, contact info, and queue assignment.

## Status (as of last session)

- ✅ Workflow exists in n8n instance: **ID `oWD4WUSEcWmSZwd6`** (12 nodes, native ServiceM8 community node, credentials assigned)
- ✅ Workflow is **executable and published** — manual test execution `68155` completed with status `success` on **June 23, 2026**.
- ✅ Native-node parameter mismatches were fixed by switching to the correct `uuid`, `fields`, and `contactFields` shapes from the upstream source.
- ✅ Queue routing now uses a fixed CONFIG value instead of runtime lookup: `X-New Jobs Created Automation` → `423e140e-89ce-4616-a685-245674278d7b`.
- ℹ️ Latest successful manual run found no matching inbox items after filtering, so no jobs were created in that test.
- 📦 Archived: `3ei7WaLiYVwDZbaR` (HTTP Request with `httpHeaderAuth` credential), `CQIRmHfW3yYJkJcn` (HTTP Request with `X-Api-Key` header).
- ✅ Project: `HfMlqgFS6NFMj6hI` ("Automations Server <admin@sm8setup.com.au>")
- ✅ Credential: `Gii70BGIUVSFSVwi` ("COOLTECH ServiceM8 Credentials account", type `serviceM8CredentialsApi`)
- ✅ Workflow SDK code file: `COOLTECH_Inbox_to_Job.ts`

## Match Criteria

1. **Online Service Enquiry** — `message_text` starts with `Online Service Enquiry`. Copy body from the `Service` line down into the job description.
2. **New Enquiry - Cooltech Website** — `subject` contains `New Enquiry - Cooltech Website`. Parse body for contact name/email/phone, set as job contact, copy everything under `You've received a new enquiry` into the job description.

## Processing Steps (per message)

1. Convert inbox message → job (`POST /inboxmessage/{uuid}/convert-to-job.json`)
2. Set job contact (website enquiries only — `POST /jobcontact.json`)
3. Update job description & queue UUID (`POST /job/{uuid}.json`)
4. Queue target: `X-New Jobs Created Automation`

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
- Reads items, pulls `queueUuid` from `CONFIG`, sorts by date desc, takes 5, drops already-converted, classifies by `message_text` / `subject` pattern.
- Returns `[]` if nothing matches → workflow exits cleanly.

### 6 — `Route by Type` (Switch)
- Type: `n8n-nodes-base.switch` v3.4, mode `rules`
- Rules:
  - `Online` if `$json.type === "online"`
  - `Website` if `$json.type === "website"`
- `fallbackOutput: 'none'`

### Branch A — Online
- **`Convert Online to Job`** — ServiceM8 `inbox.convertToJob` (uuid param)
- **`Merge Online Data`** — Code (`runOnceForEachItem`). Reads `$("Filter & Route").item.json` for body+queueUuid, parses "Service:" line, returns `{ jobUuid: $json.uuid, description, queueUuid }`.
- **`Update Online Job`** — ServiceM8 `job.update` (uuid + additional fields)

### Branch B — Website
- **`Convert Website to Job`** — ServiceM8 `inbox.convertToJob`
- **`Merge Website Data`** — Code. Parses `Name:`, `Email:`, `Phone:`, extracts description after `"You've received a new enquiry"`. Returns `{ jobUuid, description, queueUuid, contactFirst, contactLast, contactEmail, contactPhone }`.
- **`Create Job Contact`** — ServiceM8 `job.updateContacts`
- **`Update Website Job`** — ServiceM8 `job.update` (uses `$("Merge Website Data").item.json.*` for fields)

---

## Connection Flow

```
Check Inbox (Schedule, 10 min)
  → CONFIG (Code)
    → List Inbox Messages (ServiceM8 inbox.getMany, executeOnce)
      → Filter & Route (Code — sort desc, take 5, classify)
            ↓ (empty = success, exit clean)
            → Route by Type (Switch)
                ├── Online:  Convert → Merge Online Data → Update Online Job
                └── Website: Convert → Merge Website Data → Create Job Contact → Update Website Job
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

### Key IDs / context (don't lose)

- Project ID: `HfMlqgFS6NFMj6hI` ("Automations Server <admin@sm8setup.com.au>")
- Credential: `Gii70BGIUVSFSVwi` — "COOLTECH ServiceM8 Credentials account" — type `serviceM8CredentialsApi`
- Current workflow: `oWD4WUSEcWmSZwd6` (`COOLTECH_Inbox_to_Job`, 12 nodes)
- Archived (don't reuse): `3ei7WaLiYVwDZbaR`, `CQIRmHfW3yYJkJcn`
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
- **5 most recent only**: We sort inbox by date descending and take the top 5 before filtering. If none match criteria, the array is empty → downstream nodes are skipped → workflow exits with success. No special error handling needed.

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
- [ ] Phase 9: Commit & push `COOLTECH_Inbox_to_Job.ts` to GitHub
- [x] Phase 10: Update AGENTS.md with final auth approach
