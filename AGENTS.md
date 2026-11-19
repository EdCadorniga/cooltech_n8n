# Agent Instructions

## n8n Instance

We use **katwill** as our n8n instance: `https://automation.katwillservices.com.au/home/workflows`.

Two tool prefixes are available:

| Tool prefix | What it does |
|---|---|
| `n8n_katwill_*` | Basic CRUD (list, create, update, delete workflows; activate/deactivate; run webhooks) |
| `n8n_katwill_remote_*` | Advanced SDK tools (search nodes, get type defs, validate & create workflows from code, manage data tables, etc.) |

**Prefer `n8n_katwill_remote_*` for building workflows** — it supports the n8n Workflow SDK (`create_workflow_from_code`, `validate_workflow`, `search_nodes`, `get_node_types`, `get_sdk_reference`).

## Workflow Creation Flow

1. **Plan**: Identify triggers, API calls, logic nodes, and their connections.
2. **Look up node types**: Use `search_nodes` to find node IDs, then `get_node_types` to get exact parameter schemas.
3. **Write code**: Use the n8n Workflow SDK (`import { workflow, node, trigger, ... } from '@n8n/workflow-sdk'`).
4. **Validate**: Always run `validate_workflow` before attempting creation.
5. **Create**: Use `create_workflow_from_code` with `projectId` resolved via `search_projects`.

## Key Rules

- Always call `get_sdk_reference` before writing SDK code if unfamiliar with the syntax.
- Use `newCredential(...)` for credentials, never hard-code secrets.
- Use `expr(...)` for n8n expressions inside node parameters.
- When editing existing workflows, use `update_workflow` with atomic operations rather than recreating.
- Always resolve project IDs via `search_projects` before creating workflows.
- **All workflow names must be prefixed with `COOLTECH_`** (e.g. `COOLTECH_Inbox_to_Job`).
- **Do not use IF nodes** — use Switch nodes (v3.4, rules mode) for all branching logic.
- For this workflow, `onError: continueErrorOutput` must be paired with actual error-output connections in the live graph. After publish, verify error branches still connect to the intended fallback nodes; if they do not, add them with atomic `update_workflow` connection ops.
- ServiceM8 inbox content is not guaranteed to land in a single stable field. Today the workflow uses `body || message_text` when building the description. Possible future hardening: normalize this once in `Filter & Route` into a canonical field such as `sourceText`, and require all downstream parsing nodes to use only that field.

## ServiceM8 Integration

- Base URL: `https://api.servicem8.com/api_1.0`
- Auth: API key sent as `X-Api-Key` header (or via the native ServiceM8 node credential — see Auth section below).
- **Credential: `Gii70BGIUVSFSVwi`** — name: "COOLTECH ServiceM8 Credentials account", type: `serviceM8CredentialsApi`. This is the native ServiceM8 community node credential. Auto-assigns to all `serviceM8` resource nodes during workflow creation.
- A native ServiceM8 community node exists (`@servicem8/n8n-nodes-servicem8.serviceM8`) and **should be preferred** over HTTP Request nodes. The `get_node_types` tool fails to load type definitions for it (the `@` prefix breaks the package-name validator), so construct node parameters manually by reading the source: `https://github.com/servicem8/n8n-nodes-servicem8/tree/master/nodes/ServiceM8`.
- Main resources: `attachment`, `client`, `email`, `inbox`, `job`, `jobBooking`, `jobCheckin`, `search`, `sms`.
- Rate limits: 180 req/min, 20,000 req/day.
- **Queue target**: `X-New Jobs Created Automation` → UUID `423e140e-89ce-4616-a685-245674278d7b`.

### Auth — use the native node + credential

The previous attempts (HTTP Request + `httpHeaderAuth` credential, then HTTP Request + manual `X-Api-Key` header) failed to auto-assign credentials and were archived. The working approach:
- Use `@servicem8/n8n-nodes-servicem8.serviceM8` v1 nodes
- Reference credentials in code via `credentials: { serviceM8CredentialsApi: newCredential('COOLTECH ServiceM8 Credentials account') }`
- n8n auto-assigns the credential to all matching nodes on workflow creation
- Do **not** try to resolve queue UUIDs at runtime with `search.objectSearch`: the native node exposes `objectSearch`, but the ServiceM8 API rejects `objectType: 'queue'`. Store the queue UUID in `CONFIG` instead.

The X-Api-Key value lives in `.env` as `COOLTECH_API_KEY`. Use this for **direct API calls** (backfills, lookups, quick edits) instead of creating n8n workflows. CONFIG node only holds non-secret config (`targetQueueName`).

### Direct API (for backfills, lookups, quick edits)

Prefer direct HTTP calls to the ServiceM8 API over creating temporary n8n workflows:

| Operation | Method | Endpoint |
|-----------|--------|----------|
| GET job | GET | `/api_1.0/job/{uuid}.json` |
| UPDATE job | POST | `/api_1.0/job/{uuid}.json` (body: flat JSON of fields) |
| GET job contacts | GET | `/api_1.0/jobcontact.json?$filter=job_uuid eq '{uuid}'` |
| UPDATE job contact | POST | `/api_1.0/jobcontact/{contactUuid}.json` (body: flat JSON of fields) |

Header: `X-Api-Key: {COOLTECH_API_KEY}`, Content-Type: `application/json`.

Note: `jobcontact` records are separate from `client` records. Job contacts use `type: "JOB"`.

### Message Match Criteria

1. **Online Service Enquiry** — `message_text` starts with `Online Service Enquiry`. Copy body from the `Service` line down into job description.
2. **New Enquiry - Cooltech Website** — `subject` contains `New Enquiry - Cooltech Website`. Parse body for contact name/email/phone; set as job contact; copy everything under `You've received a new enquiry` into job description.

### Native ServiceM8 Node Parameter Reference (verified from source)

Read these files to get the exact parameter schema before constructing nodes:
- `nodes/ServiceM8/Inbox/InboxDescription.ts` — for `inbox.getMany` (params: `inboxFilter`, `inboxSearch`, `limit`) and `inbox.convertToJob` (params: `uuid`, optional `jobTemplateUUID`, `fields` collection with optional `note`).
- `nodes/ServiceM8/Job/JobDescription.ts` — for `job.*` operations. Most operations use `uuid` (required) plus a `fields` collection.
- `nodes/ServiceM8/Attachment/AttachmentDescription.ts` — for `attachment.*` operations. `getMany` supports `relatedObjectType` (`job`/`company`) and `relatedObjectUuid`. `create` supports `fileData` (binary) and related object fields.
- `nodes/ServiceM8/Inbox/InboxObjects.ts` and `Job/JobObjects.ts` — for `fields` collection items.

**Known mistakes to avoid** (from prior session):
- `inboxMessageUuid` is wrong — the parameter is `uuid`.
- `jobUuid`, `jobDescription`, `queueUuid` as top-level parameters are wrong — most operations take `uuid` + a `fields` collection.

## GitHub Repository

- Remote: `https://github.com/EdCadorniga/cooltech_n8n`
- Always commit workflow changes to this repo for version tracking.
- Keep `.env` in `.gitignore` — never commit secrets.

## Active n8n Resources (current session)

- **Project**: `HfMlqgFS6NFMj6hI` ("Automations Server <admin@sm8setup.com.au>")
- **Active workflow**: `tlomuOHDE0aCDwwp` (`COOLTECH_Inbox_to_Job`, 30 nodes, active and not archived; published `358bb45b-3677-487b-8274-7362e8b6500b`, draft `3558c490-c81b-4556-a517-6f99b3909871`, verified 2026-11-18). Inspect the published version for production behavior.
- **Website Quotes**: `WLNTc3jAC37vdSqE` (48 nodes, zero `CUSTOM.*`) is published on the ServiceM8 `inbox.message_received` webhook (`cooltech-quotes` subscription) — webhook is now the only trigger (no schedule, no manual/scan branch). Published 2026-11-19 as `8300c5a1-dc44-48a7-be18-4062c44e03f0` (draft == published). Audit fixes (2026-11-19): subset inbox snapshot; error-output wiring to ledger unresolved paths; `Derive` admits fresh candidates so `Map` classifies + records them; deterministic job/contact/note/attachment UUIDs from source+step; tolerant readback comparison; duplicate photo bytes → recorded review; 30s photo timeouts + retries on idempotent GETs; `saveExecutionProgress:true`, error data saved, timeout 300s. Structure: webhook → `Derive candidate from inbox item` → ledger claim → `Map` → attachments gate → photos → seal → per-step reserve/readback write sequence. Next: owner sends one fresh website submission; observe the webhook execution + ledger `batch_results`, review quote/queue/contact/diary/photos/no-sends in ServiceM8. Then plan the combine with jobs (single callback URL → shared classifier + shared claim ledger; jobs migrates to exact-UUID webhook) — plan only, no build, no jobs edits, no backlog without separate approval. Never use `Postgres account` or replay the pilot. See the [handoff](quotes/README.md#current-pilot-handoff) and [plan](PLAN_Website_Quotes.md). Keep live jobs unchanged until the combine is approved.
- **Schedule**: Every **5 minutes** (changed from 10 min on 2026-06-24)
- **Credential**: `Gii70BGIUVSFSVwi` ("COOLTECH ServiceM8 Credentials account")
- **Reference workflow**: `XFf8KEv7i8uOIRX6` ("Wauchope Solar and Electrical SM8", 66 nodes, webhook-driven — studied for multi-retry and context restoration patterns)
- **Archived workflows** (don't reuse): `3ei7WaLiYVwDZbaR`, `CQIRmHfW3yYJkJcn`, `oWD4WUSEcWmSZwd6`

## Current Working Behavior

- The live workflow has been verified against a real enquiry and is working.
- Inbox polling scans the 20 most recent inbox items.
- Matching items are processed one at a time via `Split In Batches` with `batchSize: 1`.
- After converting an inbox item to a job, the workflow waits **500 ms**, re-fetches the inbox item, and checks `converted_to_job_uuid`.
- If the UUID is not yet resolved after the first fetch, the workflow waits **3 s** and re-fetches once more before giving up.
- Both merge nodes now resolve the job UUID via `converted_to_job_uuid || convertResult.uuid`.
- Online Service Enquiry messages update the created job description and queue.
- Cooltech Website enquiries create/update the job contact, update the job description, and assign the target queue.
- If a conversion succeeds in ServiceM8 but the node reports an error, the retry plus `convertResult.uuid` fallback is intended to prevent the workflow from stopping on that item.
- The live graph now also includes explicit error-output connections so queue assignment and description update still run after convert-node error outputs when the job was actually created.
- Both `Merge Online Data` and `Merge Website Data` now apply per-line `.trim()` + blank-line collapsing to descriptions, removing HTML-to-text tab indentation.
- `Merge Online Data` and `Merge Website Data` were crashing with `"A 'json' property isn't an object"` in `runOnceForEachItem` mode. Fixed by changing both to `runOnceForAllItems` mode using `$input.all()`, which avoids the n8n validation issue in SplitInBatches contexts. Both nodes now use `$('CONFIG').first().json.targetQueueUuid` for the queue UUID.
- `Merge Website Data` still avoids the old broad cross-node references; the only cross-node lookup reintroduced is the narrow `Convert Website to Job` UUID fallback via `.first().json.uuid`.
- **Bugs found and fixed (2026-06-24, execution 70987):**
  1. **Contact parsing broken**: HTML-to-text format places labels and values on separate lines (e.g. `Full Name:\nKatwill Testautomation`). Old regex `/^(Full Name):\s*/i` failed because lines after conversion start with `\t`. Fix: `findValueAfterLabel()` helper in Merge Website Data that finds the label line then scans forward for the next non-empty value line.
  2. **`$json` overwrite by ServiceM8 node**: `Create Job Contact` (a ServiceM8 `job.updateContacts` call) outputs its own result `{"uuid": "..."}`, overwriting `$json.jobUuid`/`description`/`queueUuid` before `Update Website Job` runs. Fix: `Update Website Job` now uses `$("Merge Website Data").first().json.*` instead of `$json.*`.
  3. **Finish node crash on error output**: `Finish Website Item` (Code node, `runOnceForEachItem`) crashed with the same `"A 'json' property isn't an object"` error when receiving the error output from `Update Website Job`. Fix: switched both `Finish Website Item` and `Finish Online Item` to `runOnceForAllItems` with `$input.all().map(...)`.
- Backfilled existing jobs (Kylie Kylie job, Renee Lancaster job, Katwill Testautomation job) with descriptions, contacts, and queue assignments via direct ServiceM8 API after workflow errors.
- **Attachment auto-transfer verified**: ServiceM8 automatically transfers attachments from inbox messages to jobs upon conversion. No custom attachment handling needed.

## Completed Changes (June 24, 2026)

### Phase 4 — Multi-retry Loop
After each path's 500ms fetch, the workflow now inserts a Switch + Wait 3s + Re-fetch:
- `UUID Resolved? (Online/Website)` checks `converted_to_job_uuid`
- `true` routes to Merge
- `false` routes to `Wait (3s)` → `Fetch Retry` → Merge

### Phase 5 — Context Restoration
`Restore Website Context` now sits between `Create Job Contact` and `Update Website Job`:
- Merges contact result (`$json`) with saved context from `$("Merge Website Data").first().json`
- `Update Website Job` now uses `$json.jobUuid`, `$json.description`, `$json.queueUuid` again

### Implementation Process
1. Read current workflow JSON from n8n via `get_workflow_details`
2. Plan node positions and connections
3. Apply operations with `update_workflow` (atomic batch ops)
4. Re-publish with `publish_workflow`
5. Verify post-publish that all `continueErrorOutput` branches still connect to the intended fallback nodes in the live graph
6. Test with a real or simulated enquiry
7. Commit changes

## Key Code Patterns

### Context restoration (to prevent `$json` overwrite)
```javascript
// Restore Website Context — placed after Create Job Contact
const savedContext = $("Merge Website Data").first().json;
return {
  jobUuid: savedContext.jobUuid,
  description: savedContext.description,
  queueUuid: savedContext.queueUuid,
  contactResult: $json,  // preserve contact creation result
};
```

### Finish node (runOnceForAllItems, error-output safe)
```javascript
const items = $input.all();
return items.map(item => ({
  json: {
    processed: true,
    route: item.json.route || 'unknown',
    ...item.json,
  },
}));
```

### Description clean-up (used in both Merge nodes)
```javascript
const clean = description
  .split('\n')
  .map(l => l.trim())
  .filter(l => l !== '')
  .join('\n');
```
