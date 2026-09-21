# Durable CV extraction jobs

**Decision accepted: 2026-09-17. The worker task and the extraction repository are implemented on process-local storage; the PostgreSQL migrations remain outstanding.**

Use `resume_extraction_jobs` for extraction work and retain `screening_runs` / `screening_run_items` for scoring. The target topology is API and worker as separate processes sharing PostgreSQL, with no broker; today the worker runs inside the API process and both share process-local repositories. This extends the domain schema to 14 tables; it does not close the other storage gaps in [API §8](../api/README.md#8-persistence-mapping-and-implementation-prerequisites).

## Identity and deduplication

An extraction job belongs to an immutable `resume_id`. `job_id` records the originating position and has a composite foreign key to its accepted membership. `trigger_source` is upload, reprocess or screening; it is audit context, not a different extraction algorithm. A partial unique index permits **one queued/running job per resume globally**, including when identical file content is attached to two positions. A position-specific key would allow duplicate extraction of that shared file.

Every public request validates its own `(job_id, resume_id)` membership before any lookup. Joining an existing job from another position is internal reuse only: do not return the job's origin, ID, other memberships, filenames or contact metadata. The public API continues to expose its existing resume/run DTOs; there is no extraction-job endpoint.

Enqueue locks the resume, rechecks snapshots and active jobs, then either reuses a valid snapshot, joins the active job, or inserts one queued row for a new CV. If there is terminal failed history, return that failure unless this is an explicitly eligible reprocess command; internal screening recovery must not reset the retry budget. Freeze `resume_id`, origin, trigger and `extraction_config` at insertion. The config contains parser/model/prompt/schema/dictionary/normalization versions and server UTC `as_of_date`; retries must use the same values. Configuration changes cannot silently rewrite queued work. A new authorized reprocess is a new row; terminal rows are never reset.

## Upload and explicit reprocess

- Upload stages/validates the file, then commits accepted metadata/membership and the required extraction job atomically. If a snapshot or active job already exists, reuse it. A duplicate upload of a terminally failed CV returns its existing state; it does not restart extraction. File/object cleanup handles failed metadata commits without deleting reused files.
- Reprocess retains the existing API rules: only `parse_failed` resumes without a validated snapshot qualify. Corrupt/textless files require a corrected upload, not OCR. Lock and recheck before creating a new job and changing the resume to `uploaded`. Active/already-parsed resumes conflict for a new command. Check completed idempotency replay before current-state preconditions.
- API command idempotency is distinct from active-job deduplication. The same accepted reprocess/upload command must replay its original status/body even after the job finishes. Use the durable command/outcome mechanism required by API §8 in the same mutation transaction; its general-purpose storage remains a separate implementation prerequisite. Do not misuse the run-only idempotency key or claim this table alone provides HTTP replay.

## Claim, retry and recovery

States are `queued → running → succeeded`, `running → queued` for bounded retry, or `running → failed`. The resume is `uploaded` while queued before its first claim, `parsing` while running (including backoff after a started attempt), `parsed` on success and `parse_failed` on terminal failure.

Poll due queued rows (`available_at <= database time`) and expired running rows. Candidate selection may be unlocked, but each claim must lock the resume, then the extraction row, recheck eligibility and commit the claim. This order matches enqueue/completion and avoids reversing locks. If a mutation also locks a position, lock position first, then resumes in ID order, then extraction rows. No database transaction spans file parsing, network calls, backoff or waiting for another job.

A claim increments `attempts` and monotonically increasing `lease_token`, sets owner/expiry and initializes `started_at` once. Default lease TTL is 120 seconds, renewed every 30 seconds by a non-blocking heartbeat using database time. Renew, retry, completion and release require the current owner/token and an unexpired lease. An expired token cannot renew or commit. A worker may still finish computing after expiry; this is at-least-once execution with fenced, at-most-one committed snapshot per job, not exactly-once provider invocation.

One claim permits at most one provider attempt; disable additional SDK/adapter retries for CV extraction. A provider call times out after 30 seconds. Network/429/5xx failures requeue the same row, preserving config, with 2 then 4 seconds of backoff or provider Retry-After capped at 60 seconds. Clear lease fields and persist `available_at` plus a safe error code. At most three claims/attempts are allowed, including abandoned attempts after crashes; reaching the budget marks the job failed. Permanent file/schema/evidence/refusal errors fail immediately. A crashed third attempt is finalized by recovery under the same locks after expiry, with a new fencing token and a safe exhaustion code, without a fourth provider call. JD suggestion retries remain governed by their existing synchronous deadline.

## Atomic completion

After validating schema and original-source evidence, lock the resume then job and recheck the live lease against current database wall-clock time (`clock_timestamp()`, not a transaction-start timestamp) at the guarded write. In **one transaction**, insert `resume_snapshots` and matching `resume_skills`, set the job to succeeded with that snapshot, set the resume to parsed, clear its error, clear the lease and stamp finish/update times. The snapshot must belong to the same resume; the composite FK enforces that identity. A rejected/rolled-back completion leaves no partial snapshot or skill projection. Once terminal, the job and its result association are immutable.

Terminal failure atomically marks the job failed and resume parse_failed, saves a sanitized error code, clears lease fields and stamps completion. It creates no scoring result. A response lost after a successful commit is recovered by reading the terminal row; it must not run AI again. Historical snapshots remain immutable and are never replaced by retries.

## Screening and rescore integration

The public v1 start-run contract still accepts **parsed CVs with validated snapshots only**. It freezes their exact snapshot IDs at acceptance. Adding this table does not make uploaded/parsing CVs eligible or change readiness, response schemas or UI states.

For an internal initial-run recovery path that encounters an unassigned snapshot, call the same enqueue/resolve operation; never call AI directly from `RunService`. Bind `screening_run_items.extraction_job_id` once to the selected job (composite FK checks resume identity). If that job succeeds, assign its snapshot once under the run lease; if it fails, fail that item with `error_phase=extraction`. Do not silently switch an existing item to a newer reprocess job. A waiting item stays pending and contributes to existing counters. Waiting consumes no scoring attempt and holds no worker slot/transaction: yield the run lease and poll extraction and ready scoring work fairly, so a single worker cannot deadlock waiting for its own queue. Run active-state uniqueness remains in force while waiting.

`extraction_job_id` is null when a validated snapshot was frozen directly, including every criteria-only rescore item. Rescore requires the exact successful base-run pairs and policy; it neither creates nor waits for extraction work. Extraction completion does not publish a ranking, change a decision, or write a screening result. Scoring and publication retain their existing transactions and run leases.

## Required verification before implementation is accepted

1. Concurrent uploads in the same/different positions reuse one active job for the same resume; cross-position requests expose no foreign metadata.
2. Duplicate commands replay after completion; a new command against active/parsed resumes conflicts; a new eligible reprocess creates a new terminal-history-preserving row.
3. Kill a worker before/after provider return and before/after commit: reclaim only after expiry, reject stale writes, and commit at most one snapshot with consistent skill facts.
4. Transient errors back off with a maximum of three total attempts; permanent errors and an expired third attempt terminate without a score.
5. A pending internal run resumes from its pinned job; one-worker scheduling makes progress; rescore performs zero enqueue/extraction calls.
6. Roll back snapshot/job/resume completion together on any write failure. Restart API/worker and recover solely from persisted state.

Related: [database constraints](../database-design.md), [services](class-services.md), [screening sequence](sequence-01-screening.md), [runtime](nextjs-backend.md).
