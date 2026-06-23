# Workflow Plan: ServiceM8 Inbox → Job Automation

## Goal

Build an n8n workflow (`COOLTECH_Inbox_to_Job`) on the **katwill** n8n instance that polls the ServiceM8 inbox and auto-converts matching messages into jobs with proper descriptions, contact info, and queue assignment.

## Match Criteria

1. **Online Service Enquiry** — `message_text` starts with `Online Service Enquiry`. Copy body from the `Service` line down into the job description.
2. **New Enquiry - Cooltech Website** — `subject` contains `New Enquiry - Cooltech Website`. Parse body for contact name/email/phone, set as job contact, copy everything under `You've received a new enquiry` into the job description.

## Processing Steps (per message)

1. Convert inbox message → job (`POST /inboxmessage/{uuid}/convert-to-job.json`)
2. Set job contact (website enquiries only — `POST /jobcontact.json`)
3. Update job description & queue UUID (`POST /job/{uuid}.json`)
4. Queue target: `X-New Jobs Created Automation`

---

## Node-by-Node Configuration

### 1 — Schedule Trigger: `Check Inbox`

| Field | Value |
|---|---|
| Type | `n8n-nodes-base.scheduleTrigger` v1.3 |
| Interval | Every 10 minutes |

### 2 — CONFIG (Code Node)

| Field | Value |
|---|---|
| Type | `n8n-nodes-base.code` v2 (mode: `runOnceForAllItems`) |
| Name | `CONFIG` |
| Language | JavaScript |

Runs once per execution. All runtime variables live here so they're never hard-coded elsewhere.

**Output:**
```json
{
  "serviceM8BaseUrl": "https://api.servicem8.com/api_1.0",
  "targetQueueName": "X-New Jobs Created Automation",
  "credentialName": "ServiceM8 API Key"
}
```

Other nodes reference values via `expr('{{ $("CONFIG").item.json.serviceM8BaseUrl }}')`.

### 3 — List Job Queues

| Field | Value |
|---|---|
| Type | `n8n-nodes-base.httpRequest` v4.4 |
| Name | `List Job Queues` |
| Method | `GET` |
| URL | `{{ $("CONFIG").item.json.serviceM8BaseUrl }}/queue.json` |
| Auth | `genericCredentialType` → `httpHeaderAuth` |
| Credential | `newCredential('ServiceM8 API Key')` |
| Response | `responseFormat: 'json'` |
| executeOnce | `true` |

### 4 — Find Queue UUID (Code)

| Field | Value |
|---|---|
| Type | Code v2 (mode: `runOnceForAllItems`) |
| Name | `Find Queue UUID` |
| Language | JavaScript |

Logic: Loop `$json` array, find queue where `name === $("CONFIG").item.json.targetQueueName`, throw if not found.

**Output:** `{ queueUuid: "..." }`

### 5 — List Inbox Messages

| Field | Value |
|---|---|
| Type | HTTP Request v4.4 |
| Name | `List Inbox Messages` |
| Method | `GET` |
| URL | `{{ $("CONFIG").item.json.serviceM8BaseUrl }}/inboxmessage.json?filter=all` |
| Auth | Same as Node 3 |
| executeOnce | `true` |

### 6 — Filter & Route Messages (Code)

| Field | Value |
|---|---|
| Type | Code v2 (mode: `runOnceForAllItems`) |
| Name | `Filter & Route` |
| Language | JavaScript |

Logic:
- Read message array + `queueUuid`
- Sort by `date` descending, take **only the 5 most recent** items
- Skip if `converted_to_job_uuid` is truthy
- Check `message_text` starts with `Online Service Enquiry` → tag `type: "online"`
- Check `subject` contains `New Enquiry - Cooltech Website` → tag `type: "website"`
- Carry through: `uuid, body, fromName, fromEmail, subject, queueUuid`
- If no messages match → return empty array → workflow ends cleanly (success)

### 7 — Switch (Route by Enquiry Type)

| Field | Value |
|---|---|
| Type | `n8n-nodes-base.switch` v3.4 (mode: `rules`) |
| Name | `Route by Type` |
| Rule 0 | `$json.type equals "online"` → output `Online` |
| Rule 1 | `$json.type equals "website"` → output `Website` |
| Options | `fallbackOutput: 'none'` |

---

### Branch A: Online Service Enquiry

### 8a — Convert to Job

| Field | Value |
|---|---|
| Type | HTTP Request v4.4 |
| Name | `Convert Online to Job` |
| Method | `POST` |
| URL | `{{ $("CONFIG").item.json.serviceM8BaseUrl }}/inboxmessage/{{ $json.uuid }}/convert-to-job.json` |
| Body | `{}` (JSON) |

### 9a — Extract Description (Code)

| Field | Value |
|---|---|
| Type | Code v2 (mode: `runOnceForAllItems`) |
| Name | `Extract Online Description` |
| Language | JavaScript |

Logic:
- Get `$json.job.uuid` from convert response
- Get original body from `$("Filter & Route").item.json.body`
- Find line starting with `Service`, take everything from there

**Output:** `{ jobUuid, description, queueUuid }`

### 10a — Update Job

| Field | Value |
|---|---|
| Type | HTTP Request v4.4 |
| Name | `Update Online Job` |
| Method | `POST` |
| URL | `{{ $("CONFIG").item.json.serviceM8BaseUrl }}/job/{{ $json.jobUuid }}.json` |
| Body (JSON) | `{ "job_description": "{{ $json.description }}", "queue_uuid": "{{ $json.queueUuid }}" }` |

---

### Branch B: Website Enquiry

### 8b — Convert to Job

| Field | Value |
|---|---|
| Type | HTTP Request v4.4 |
| Name | `Convert Website to Job` |
| Method | `POST` |
| URL | `{{ $("CONFIG").item.json.serviceM8BaseUrl }}/inboxmessage/{{ $json.uuid }}/convert-to-job.json` |
| Body | `{}` |

### 9b — Parse Website Enquiry (Code)

| Field | Value |
|---|---|
| Type | Code v2 (mode: `runOnceForAllItems`) |
| Name | `Parse Website Enquiry` |
| Language | JavaScript |

Logic:
- Get `$json.job.uuid` from convert response
- Get original body from `$("Filter & Route").item.json.body`
- Parse for `Name:`, `Email:`, `Phone:` patterns
- Extract description as everything under `You've received a new enquiry`
- Split `Name` into first/last

**Output:** `{ jobUuid, description, firstName, lastName, email, phone, queueUuid }`

### 10b — Create Job Contact

| Field | Value |
|---|---|
| Type | HTTP Request v4.4 |
| Name | `Create Job Contact` |
| Method | `POST` |
| URL | `{{ $("CONFIG").item.json.serviceM8BaseUrl }}/jobcontact.json` |
| Body (JSON) | `{ "job_uuid": "{{ $json.jobUuid }}", "first": "{{ $json.firstName }}", "last": "{{ $json.lastName }}", "email": "{{ $json.email }}", "phone": "{{ $json.phone }}", "type": "JOB" }` |

### 11b — Update Job

| Field | Value |
|---|---|
| Type | HTTP Request v4.4 |
| Name | `Update Website Job` |
| Method | `POST` |
| URL | `{{ $("CONFIG").item.json.serviceM8BaseUrl }}/job/{{ $json.jobUuid }}.json` |
| Body (JSON) | `{ "job_description": "{{ $json.description }}", "queue_uuid": "{{ $json.queueUuid }}" }` |

---

## Connection Flow

```
Check Inbox (Scheduler, every 10 min)
  → List Job Queues (executeOnce)
    → Find Queue UUID (Code)
      → List Inbox Messages (executeOnce)
        → Filter & Route (Code) — sort desc, take 5, match criteria
              ↓ (empty = success, exit clean)
              → Route by Type (Switch)
                  ├── Online: Convert → Extract Description → Update Job (desc + queue)
                  └── Website: Convert → Parse (contact + desc) → Create Contact → Update Job
```

## Design Decisions

- **CONFIG node** centralises base URL, queue name, credential name — no magic strings scattered across nodes.
- **executeOnce: true** on queue & inbox fetchers prevents N×M item multiplication.
- **Code nodes** for filtering/parsing because multi-condition checks and regex parsing need a full language.
- **Switch** for clean multi-way routing with labelled outputs.
- All expressions reference `$("CONFIG")` for configuration values.
- **No OAuth2**: ServiceM8 uses a static `X-Api-Key` header (`httpHeaderAuth` credential type). Every step (inbox, job, jobcontact, queue) uses the same auth — no tokens to refresh.
- **5 most recent only**: We sort inbox by `date` descending and take the top 5 before filtering. If none match criteria, the array is empty → downstream nodes are skipped → workflow exits with success. No special error handling needed.

---

## GitHub Setup

- Remote: `https://github.com/EdCadorniga/cooltech_n8n`
- `.gitignore` excludes `.env` and `node_modules/`.
- Workflow SDK code and documentation are committed for version tracking.

## Remaining Steps

- [ ] **Step 1**: Write the full workflow using the n8n Workflow SDK.
- [ ] **Step 2**: Validate the workflow code with `validate_workflow`.
- [ ] **Step 3**: Resolve the project ID via `search_projects`.
- [ ] **Step 4**: Create the workflow with `create_workflow_from_code`.
- [ ] **Step 5**: Verify the workflow appears in the katwill n8n instance.
- [ ] **Step 6**: Optionally activate/publish the workflow.
