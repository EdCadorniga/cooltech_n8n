# COOLTECH Inbox to Job Automation

## What This Automation Does

This automation watches the ServiceM8 inbox and looks for new customer enquiries that should become jobs.

When it finds a matching enquiry, it automatically:

1. Creates a new job from the inbox message
2. Places the job into the correct queue
3. Copies the enquiry details into the job description
4. Adds customer contact details for website enquiries

The goal is simple: reduce manual admin work and make sure genuine new enquiries are turned into jobs quickly and consistently.

## What It Looks For

The automation currently checks for two types of enquiries:

1. `Online Service Enquiry`
This is detected from the message text in the inbox.

2. `New Enquiry - Cooltech Website`
This is detected from the email subject line.

If a message does not match one of those patterns, it is ignored.

## What Happens After a Match Is Found

For each matching enquiry, the automation:

1. Converts the inbox item into a ServiceM8 job
2. Waits briefly so ServiceM8 can finish linking the new job properly
3. Checks the inbox item again to confirm the job that was created
4. Updates the new job with the correct description and queue
5. Adds contact details if the enquiry came from the website

Each enquiry is processed one at a time. This helps prevent mix-ups and makes the workflow more reliable.

## Queue Used

All jobs created by this automation are placed into:

`X-New Jobs Created Automation`

## What Information Gets Copied

### For Online Service Enquiry messages

The job description is filled using the enquiry content starting from the `Service` section onward.

### For Website enquiries

The automation tries to pull out:

- Name
- Email
- Phone number

It then:

- Adds those details to the job contact
- Copies the enquiry message into the job description

## How Often It Runs

The automation checks the inbox every 10 minutes.

It reviews the 20 most recent inbox items each time it runs.

## What To Expect as a User

If a real customer enquiry comes in and matches the supported formats:

- A job should appear automatically in ServiceM8
- The job should already be assigned to the correct queue
- The enquiry text should already be in the job
- Website enquiries should also have contact details added

You should not need to manually convert these messages in normal use.

## What This Automation Is Designed To Avoid

The workflow includes safeguards so it is less likely to fail when:

- ServiceM8 takes a moment to finish creating the job
- A converted inbox message reports an error even though the job was actually created
- Multiple matching enquiries arrive close together

It processes matching items one by one and double-checks the created job before updating it.

## What It Does Not Do

This automation does not:

- Process every email in the inbox
- Handle enquiry formats outside the two supported patterns
- Replace human review for unusual, incomplete, or malformed customer messages

If an enquiry is in an unexpected format, staff may still need to handle it manually.

## How To Use It

For day-to-day use, there is nothing special staff need to do.

1. Let enquiries arrive in ServiceM8 as normal
2. Wait for the next automation run
3. Check that the created job appears in the correct queue
4. Open the job and confirm the description and contact details look right

## How To Check If It Is Working

Signs that the automation is working:

- New supported enquiries are becoming jobs automatically
- Jobs appear in `X-New Jobs Created Automation`
- Website enquiries include contact details
- Job descriptions contain the enquiry details

Signs that a message may need manual attention:

- A genuine enquiry remains in the inbox without becoming a job
- A job is created but the description is blank or incomplete
- Contact details were not added for a website enquiry

## Current Design Summary

In plain English, the automation works like this:

1. Check the inbox on a schedule
2. Find recent unprocessed enquiries
3. Keep only the supported enquiry types
4. Process them one at a time
5. Convert each one into a job
6. Wait briefly and confirm which job was created
7. Update the job with the correct details

This step-by-step design was chosen to make the automation more dependable and easier to support.

## Project Reference

- Project: `COOLTECH_Inbox_to_Job`
- Platform: ServiceM8 + n8n
- Live workflow ID: `tlomuOHDE0aCDwwp`

