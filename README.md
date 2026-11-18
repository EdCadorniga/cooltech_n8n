# COOLTECH Inbox to Job Automation

## What This Automation Does

This automation watches the ServiceM8 inbox and looks for supported customer enquiries that should become jobs.

When it finds a matching enquiry, it automatically:

1. Creates a new job from the inbox message
2. Places the job into the correct queue
3. Copies the enquiry details into the job description
4. Adds customer contact details for website enquiries

The goal is to reduce manual admin work and make sure genuine supported enquiries are turned into jobs quickly and consistently.

## Current Scope

The automation only handles two enquiry patterns:

1. `Online Service Enquiry`
This is detected from the inbox `message_text`.

2. `New Enquiry - Cooltech Website`
This is detected from the inbox `subject`.

If a message does not match one of those patterns, it is ignored.

This is important operationally: the workflow is not a general inbox processor. Calls, supplier emails, job correspondence, and other unrelated inbox traffic are expected to pass through untouched.

## How It Works

For each matching enquiry, the automation:

1. Converts the inbox item into a ServiceM8 job
2. Waits 500 ms so ServiceM8 can finish linking the new job
3. Re-fetches the inbox item and checks `converted_to_job_uuid`
4. If the UUID is still missing, waits 3 seconds and re-fetches once more
5. Resolves the job UUID using `converted_to_job_uuid || convertResult.uuid`
6. Updates the new job with the correct description and queue
7. Adds contact details for website enquiries
8. Restores website context after contact creation before updating the job

Each enquiry is processed one at a time. This reduces mix-ups and makes the workflow more reliable.

## Queue Used

All jobs created by this automation are placed into:

`X-New Jobs Created Automation`

## What Information Gets Copied

### For Online Service Enquiry messages

The job description is filled using the enquiry content starting from the `Service` section onward.

### For Website enquiries

The automation tries to extract:

- Name
- Email
- Phone number

It then:

- Adds those details to the job contact
- Copies the enquiry message into the job description

## How Often It Runs

The automation checks the inbox every 5 minutes.

It reviews the 20 most recent inbox items each time it runs.

## Reliability Safeguards

The workflow includes safeguards so it is less likely to fail when:

- ServiceM8 takes time to finish creating the job
- A converted inbox item does not expose `converted_to_job_uuid` immediately
- A convert node reports an error even though the job was actually created
- Website contact creation overwrites the current `$json` context
- Multiple matching enquiries arrive close together

The main protections are:

- `Split In Batches` with `batchSize: 1`
- 500 ms initial delay before re-checking the inbox item
- A second retry after 3 seconds
- UUID fallback using `convertResult.uuid`
- Explicit `continueErrorOutput` branches on the main ServiceM8 update nodes
- `Restore Website Context` before the website job update

## Operational Notes

- Attachments transfer automatically from inbox message to job during ServiceM8 conversion. No custom attachment handling is implemented.
- Already converted inbox items are skipped by design.
- Archived website test submissions that already have `converted_to_job_uuid` are skipped by design.
- The workflow is healthy when it stops at `Filter & Route` on non-matching inbox traffic. That is expected behavior, not a failure.

## What To Expect

If a real customer enquiry arrives in one of the supported formats:

- A job should appear automatically in ServiceM8
- The job should already be assigned to `X-New Jobs Created Automation`
- The enquiry text should already be in the job
- Website enquiries should also have contact details added

You should not need to manually convert these messages in normal use.

## What It Does Not Do

This automation does not:

- Process every inbox message
- Handle enquiry formats outside the two supported patterns
- Replace human review for unusual, incomplete, malformed, or unsupported messages

If an enquiry is in an unexpected format, staff may still need to handle it manually.

## Day-To-Day Use

For normal use, staff do not need to trigger anything manually.

1. Let enquiries arrive in ServiceM8 as normal
2. Wait for the next automation run
3. Check that the created job appears in the correct queue
4. Open the job and confirm the description and contact details look right

## Troubleshooting

Signs that the automation is working:

- New supported enquiries are becoming jobs automatically
- Jobs appear in `X-New Jobs Created Automation`
- Website enquiries include contact details
- Job descriptions contain the enquiry details

Signs that a message may need manual attention:

- A genuine supported enquiry remains in the inbox without becoming a job
- A job is created but the description is blank or incomplete
- Contact details were not added for a website enquiry

If something looks wrong:

1. Check recent workflow executions in n8n for `COOLTECH_Inbox_to_Job`
2. Confirm the inbox message actually matches one of the two supported patterns
3. Inspect `Merge Online Data` or `Merge Website Data` if description parsing looks wrong
4. Inspect `Create Job Contact` and `Restore Website Context` if a website job is missing contact or update data
5. If the job exists but the inbox UUID was slow to appear, inspect `UUID Resolved? (Online/Website)` and the retry fetch nodes

## Future Improvement

One design improvement is still identified for later:

ServiceM8 does not always place enquiry text in one stable field. The workflow currently handles this safely with `body || message_text`, but a future refinement could normalize that text earlier into one canonical field such as `sourceText`.

This is not required for normal use today. It would mainly make future maintenance simpler.

## Project Reference

- Project name: `COOLTECH_Inbox_to_Job`
- Platform: ServiceM8 + n8n
- Live workflow ID: `tlomuOHDE0aCDwwp`
- Active version (verified 2026-11-18): `358bb45b-3677-487b-8274-7362e8b6500b`
- Queue name: `X-New Jobs Created Automation`
- Queue UUID: `423e140e-89ce-4616-a685-245674278d7b`
- Schedule: every 5 minutes
- Inbox scan limit: 20 items per run
- Detailed implementation notes: [AGENTS.md](AGENTS.md) and [PLAN.md](PLAN.md)
- The separate website quote intake is not live. See the [draft and audit handoff](quotes/README.md).
