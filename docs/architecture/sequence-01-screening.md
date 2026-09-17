# SEQ-01 - JD setup, durable extraction and initial screening

**Updated 2026-09-17. Proposed behavior, not implemented.** API and worker are separate processes. PostgreSQL stores extraction jobs and screening runs; the shared domain/repository code is called inside each process, never across their boundary. Public API paths and responses remain governed by [OpenAPI](../api/openapi.yaml).

[Open the SVG](diagrams/sequence-01-screening.svg)

![SEQ-01 - Durable extraction and initial screening](diagrams/sequence-01-screening.svg)

```mermaid
sequenceDiagram
    autonumber
    actor REC as Recruiter
    participant WEB as Web app
    participant API as Next.js API
    participant DB as PostgreSQL via repositories
    participant WORKER as Separate worker process
    participant FILES as Private file store
    participant AI as AI extraction adapter
    participant SCORE as Pure scoring engine
    REC->>WEB: Create position, enter JD and approve criteria
    WEB->>API: Position and criteria commands
    API->>DB: Validate versions and freeze approved criteria
    API-->>WEB: Position and approved revision
    REC->>WEB: Upload PDF/DOCX batch
    WEB->>API: POST /jobs/{job_id}/resume-batches
    API->>FILES: Stage and validate accepted files
    API->>DB: Lock resumes, accept membership, reuse snapshot/job or enqueue extraction
    Note over API,DB: Commit metadata + extraction work + command outcome before response
    API-->>WEB: Existing batch outcome DTO (200)
    loop Due extraction jobs and expired leases
        WORKER->>DB: Lock resume then job, claim/reclaim and increment token/attempts
        WORKER->>FILES: Read immutable CV file
        WORKER->>AI: Extract using frozen config, one provider attempt
        AI-->>WORKER: Facts and evidence, or safe error
        alt Valid schema and source evidence
            WORKER->>DB: Fence lease, commit snapshot + skills + job success + resume parsed
        else Transient error with remaining budget
            WORKER->>DB: Fence lease, requeue with available_at, clear lease
        else Permanent error or exhausted budget
            WORKER->>DB: Mark failed + resume parse_failed, no scoring result
        end
    end
    WEB->>API: GET /jobs/{job_id}/resumes
    API->>DB: Read position-scoped resume states
    API-->>WEB: Existing states and can_screen
    opt Explicit eligible retry
        WEB->>API: POST /jobs/{job_id}/resumes/{resume_id}/reprocess
        API->>DB: Replay prior command or atomically enqueue new job for failed CV
        API-->>WEB: Existing accepted resume DTO (202) or conflict
        Note over DB,WORKER: Same extraction queue, retry budget and fenced completion
    end
    REC->>WEB: Select parsed CVs and start screening
    WEB->>API: POST /jobs/{job_id}/screening-runs
    API->>DB: Lock position, freeze criteria, policy and parsed snapshots, insert run/items
    API-->>WEB: 202 with run_id
    WORKER->>DB: Claim run lease, read frozen inputs
    loop Each selected snapshot
        WORKER->>SCORE: Score immutable snapshot under frozen criteria/policy
        SCORE-->>WORKER: Score, eligibility, contributions and evidence
        WORKER->>DB: Fence run lease, commit staged result and item state
    end
    WORKER->>DB: Lock position, publish ranks + flags + pointer atomically
    Note over DB,WORKER: At least one success for initial run, otherwise preserve previous ranking
    WEB->>API: Poll run/items then POST /jobs/{job_id}/ranking/query
    API->>DB: Read scoped progress and published pointer
    API-->>WEB: Consistent counts, ranking and separate failures
```

## Rules and exceptions

- [Extraction-job decision](extraction-jobs.md) defines one active job per immutable resume globally, lease renewal/fencing, three total attempts and atomic completion. Duplicate uploads do not reset failed jobs. Reprocess applies only to a parse-failed CV without a validated snapshot; command replay precedes current-state checks.
- The API never starts unawaited parsing work. Worker polling and browser polling can proceed concurrently; neither depends on the original request staying open. A failed metadata transaction compensates/cleans up only newly staged files.
- The public v1 start-run command still accepts parsed CVs only. The defensive internal recovery path for an unassigned initial item resolves the shared extraction job, pins its ID, then yields its run lease while waiting. It never calls AI directly or blocks the only worker slot. A bound extraction failure fails the item; a later reprocess cannot silently change its inputs.
- No extraction job publishes rankings or writes screening results. A technical extraction/scoring failure is separate from missing evidence and mandatory eligibility; it never creates a zero-score candidate or automatic rejection. Initial runs may publish successes with separate errors; no success means no publication.
- Same run key/payload replays the logical run; different payload conflicts. Rescore uses the exact successful base-run snapshots and policy with no extraction jobs, and publishes only when all required items succeed.
- New positions start draft; lifecycle remains display/filter only. Q11 checks position membership before lookup and before returning files/evidence. Cross-position shared-job origin stays internal. Sensitive responses use no-store; raw CV/contact data stays out of URLs, logs, notifications and persistent browser storage.
- Corrupt/textless documents require corrected uploads; OCR is outside scope. Missing information in a readable CV remains insufficient evidence, not proof of absent ability.

Related: [C3](c3-components.md), [database design](../database-design.md), [review](sequence-02-review.md), [rescore](sequence-03-rescore.md).
