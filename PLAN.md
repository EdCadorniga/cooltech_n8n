# Workflow Plan: COOLTECH_Inbox_to_Job

## Goal

Poll ServiceM8 inbox, convert matching messages to jobs with proper descriptions, contact info, and queue assignment. Runs on the **katwill** n8n instance.

## Status (as of June 24, 2026)

- ✅ Workflow exists: **ID `tlomuOHDE0aCDwwp`** (28 nodes, native ServiceM8 nodes, published, active)
- ✅ Active version: **`ee380c9b`**
- ✅ Verified end-to-end against real enquiries (both Online Service Enquiry and Cooltech Website)
- ✅ Schedule: every **5 minutes** (changed from 10 min on 2026-06-24)
- ✅ Native-node parameter mismatches fixed: uses correct `uuid`, `fields`, `contactFields` shapes
- ✅ Queue routing via CONFIG node: `423e140e-89ce-4616-a685-245674278d7b`
- ✅ Per-item looping via `Split In Batches` (`batchSize: 1`)
- ✅ 500 ms delay between conversion and inbox re-fetch
- ✅ Fallback UUID resolution restored: `converted_to_job_uuid || convertResult.uuid`
- ✅ Error-output connections on all convert/update nodes
- ✅ With `.trim()` + blank-line collapsing on descriptions
- ✅ `runOnceForAllItems` mode on both Merge nodes (fixed `"A 'json' property isn't an object"` crash)
- ✅ Contact parsing uses `findValueAfterLabel()` to handle HTML-to-text label/value on separate lines
- ✅ `$json` overwrite fix: `Update Website Job` uses `$("Merge Website Data").first().json.*` instead of `$json.*`
- ✅ Both Finish nodes use `runOnceForAllItems` to avoid crash on error output
- ✅ Retry gates added on both branches: Switch → Wait 3s → Re-fetch → Merge
- ✅ `Restore Website Context` inserted after `Create Job Contact`
- ✅ `Update Website Job` now uses restored local `$json.*` context again
- ✅ Post-publish health check passed: execution `71158` succeeded at `2026-06-24T05:30:13Z`
- ✅ Backfilled affected jobs via direct API: Kylie Kylie, Renee Lancaster, Katwill Testautomation
- ✅ Attachments auto-transfer to job on conversion (verified; no custom attachment handling needed)

## Match Criteria

1. **Online Service Enquiry** — `message_text` starts with `Online Service Enquiry`. Copy body from `Service` line down.
2. **New Enquiry - Cooltech Website** — `subject` contains `New Enquiry - Cooltech Website`. Parse for contact name/email/phone; copy everything under `You've received a new enquiry`.

## Processing Steps (per message)

1. Convert inbox → job (`inbox.convertToJob`)
2. Wait 500 ms, re-fetch, check `converted_to_job_uuid`
3. If UUID is missing, wait 3 s and re-fetch once more
4. Resolve job UUID via `converted_to_job_uuid || convertResult.uuid`
5. Set job contact (website only — `job.updateContacts`)
6. Restore website context after contact creation
7. Update job description & queue UUID (`job.update`)
8. Terminal — return control to loop

## Current Live Nodes (28)

1. `Check Inbox` — Schedule Trigger, every 5 min
2. `CONFIG` — Code, `runOnceForAllItems`: `{ targetQueueUuid: '423e140e-...' }`
3. `List Inbox Messages` — ServiceM8 `inbox.getMany`, limit 20
4. `Filter & Route` — Code, sort desc, take 20, classify
5. `Process Matched Items` — Split In Batches, `batchSize: 1`
6. `Route by Type` — Switch, rules: `online` / `website`
7. `Convert Online to Job` — ServiceM8 `inbox.convertToJob`
8. `Wait Before Fetch Online` — Wait 500 ms
9. `Fetch Converted Online Message` — ServiceM8 `inbox.get`
10. `UUID Resolved? (Online)` — Switch
11. `Wait Online Retry` — Wait 3s
12. `Fetch Online Retry` — ServiceM8 `inbox.get`
13. `Merge Online Data` — Code, `runOnceForAllItems`
14. `Route Resolved Online Item` — Switch: `process` / `skip`
15. `Update Online Job` — ServiceM8 `job.update`
16. `Finish Online Item` — Code, `runOnceForAllItems`
17. `Convert Website to Job` — ServiceM8 `inbox.convertToJob`
18. `Wait Before Fetch Website` — Wait 500 ms
19. `Fetch Converted Website Message` — ServiceM8 `inbox.get`
20. `UUID Resolved? (Website)` — Switch
21. `Wait Website Retry` — Wait 3s
22. `Fetch Website Retry` — ServiceM8 `inbox.get`
23. `Merge Website Data` — Code, `runOnceForAllItems`
24. `Route Resolved Website Item` — Switch: `process` / `skip`
25. `Create Job Contact` — ServiceM8 `job.updateContacts`
26. `Restore Website Context` — Code
27. `Update Website Job` — ServiceM8 `job.update`
28. `Finish Website Item` — Code, `runOnceForAllItems`

### Connection Flow

```
Check Inbox (Schedule, 5 min)
  → CONFIG (Code)
    → List Inbox Messages (ServiceM8 inbox.getMany, limit 20)
      → Filter & Route (Code — sort, classify)
            ↓ (empty → exit clean)
            → Process Matched Items (Split In Batches, batchSize 1)
                → Route by Type (Switch)
                    ├── Online: Convert → Wait → Fetch → UUID Resolved?
                    │     ├── true → Merge → Route Resolved → Update → Finish
                    │     └── false → Wait 3s → Fetch Retry → Merge → ...
                    └── Website: Convert → Wait → Fetch → UUID Resolved?
                          ├── true → Merge → Route Resolved → Contact → Restore Context → Update → Finish
                          └── false → Wait 3s → Fetch Retry → Merge → ...
```

## Phase 4 — Multi-retry Loop (implemented)

After the 500ms fetch, insert a Switch checking `converted_to_job_uuid`:
- **Has UUID** → Merge (existing path, unchanged)
- **No UUID** → Wait 3s → Re-fetch → Merge

This gives ServiceM8 one more retry window before giving up.

**Online path**: `UUID Resolved? (Online)` → `Wait Online Retry` → `Fetch Online Retry`
**Website path**: `UUID Resolved? (Website)` → `Wait Website Retry` → `Fetch Website Retry`

## Phase 5 — Context Restoration (implemented)

Insert `Restore Website Context` Code node between `Create Job Contact` and `Update Website Job`. Merges the contact creation result (`$json`) with the saved context from `$("Merge Website Data").first().json`.

After adding this node, revert `Update Website Job` to use `$json.jobUuid`, `$json.description`, `$json.queueUuid` instead of cross-node references.

This prevents the ServiceM8 `job.updateContacts` output `{"uuid": "..."}` from overwriting the upstream context before the job update runs.

## Verification Notes

- Published version `ee380c9b-0ab0-4a1c-a58e-a0863e2f872c` is active.
- Existing `continueErrorOutput` branches were re-checked in the live graph after publish and remained connected.
- First post-publish scheduled execution `71158` succeeded, but it did not process a matched enquiry, so the new retry/restore path has not yet been exercised on a live matching item.

## Key IDs (preserve across sessions)

| Resource | ID |
|---|---|
| Project | `HfMlqgFS6NFMj6hI` ("Automations Server <admin@sm8setup.com.au>") |
| Workflow | `tlomuOHDE0aCDwwp` (`COOLTECH_Inbox_to_Job`, active `ee380c9b`) |
| Credential | `Gii70BGIUVSFSVwi` ("COOLTECH ServiceM8 Credentials account", `serviceM8CredentialsApi`) |
| Queue UUID | `423e140e-89ce-4616-a685-245674278d7b` |
| Archived (don't reuse) | `3ei7WaLiYVwDZbaR`, `CQIRmHfW3yYJkJcn`, `oWD4WUSEcWmSZwd6` |
| Reference workflow | `XFf8KEv7i8uOIRX6` ("Wauchope Solar and Electrical SM8", 66 nodes) |

## Design Decisions

- **CONFIG node** centralises queue UUID — no magic strings.
- **Native ServiceM8 node** over HTTP Request — credential auto-assigns.
- **Code nodes** for parsing (multi-condition checks, string slicing).
- **Switch** for clean multi-way routing (IF nodes banned).
- **`runOnceForAllItems`** on merge/finish nodes — avoids n8n validation bug with `"A 'json' property isn't an object"` inside SplitInBatches context.
- **Cross-node refs** are now limited to merge-time fallback/context lookup; `Update Website Job` uses restored local `$json` context again.
- **Multi-retry** (3s) after initial 500ms wait — mimics Wauchope reference's escalating retry pattern.
- **No attachment handling needed** — ServiceM8 auto-transfers attachments on conversion.
