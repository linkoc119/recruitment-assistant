# SEQ-03 — Editing criteria, re-scoring, and comparing two runs

**Status:** proposed behaviour. **Preconditions:** run R1 has been published and reusable CV snapshots exist. **Outcome:** R2 has its own criteria set while R1 remains intact; the user can compare scores, ranks, mandatory-criteria status, and the reason each result changed.

[Open the SVG](diagrams/sequence-03-rescore.svg) to zoom in or embed it in a report.

![SEQ-03 — Editing criteria, re-scoring, and comparing two runs](diagrams/sequence-03-rescore.svg)

```mermaid
---
title: "SEQ-03 — Criteria Revision and Rescoring — Proposed"
---
sequenceDiagram
    autonumber
    actor REC as Recruiter
    participant WEB as WEB · Web App
    participant HTTP as HTTP · API Controllers
    participant CRIT as CRIT · Criteria Service
    participant RUN as RUN · Screening Coordinator
    participant SCORE as SCORE · Scoring Engine
    participant REVIEW as REVIEW · Ranking and Review Service
    participant DB as DB via DATA
    REC->>WEB: Change weight or mandatory/preferred status
    WEB->>HTTP: PUT criteria with expected_revision
    HTTP->>CRIT: Validate and store new revision
    CRIT->>DB: Append R2 criteria snapshot without modifying R1
    CRIT-->>WEB: New revision, current results still use old criteria
    REC->>WEB: Review changes and confirm rescoring
    WEB->>HTTP: POST screening-runs, base_run_id, revision, idempotency key
    HTTP->>RUN: Create R2 from R1's successful CV set
    RUN->>DB: Check base/active runs and freeze inputs in transaction
    alt Stale request or another job is active
        DB-->>RUN: Conflict, no additional run created
        RUN-->>WEB: 409 and current run/active job ID
    else Valid request
        DB-->>RUN: R2 run_id queued, R1 remains published
        RUN-->>WEB: 202 Accepted and R2 run_id
        RUN->>DB: Acquire lease, then read R1 CV snapshots and R2 criteria
        loop Each CV in the frozen rescore set
            RUN->>SCORE: Existing CV snapshot, R2 criteria, same scoring policy
            SCORE-->>RUN: New score, eligibility, contributions, and evidence
            RUN->>DB: Store R2 staged result and progress
        end
        Note over RUN,DB: WEB polls R2 via HTTP while R1 remains readable
        alt An item fails after retries or the run cannot complete
            RUN->>DB: Mark R2 failed and keep published run unchanged
            RUN-->>WEB: Report failure through polling and retain R1 ranking
        else Every item in the comparison set succeeds
            RUN->>DB: BEGIN, lock position, check base_run_id and lease token
            RUN->>DB: R1 latest=false, R2 latest=true, published_run_id=R2
            RUN->>DB: Mark R2 completed and COMMIT atomically
            RUN-->>WEB: Completion through polling, R2 is available
        end
    end
    opt R2 has been published
        REC->>WEB: Compare R1 and R2
        WEB->>HTTP: GET comparison with two explicit run_ids
        HTTP->>REVIEW: Validate both runs belong to the requested position via DATA
        break Missing run or mismatched position context
            REVIEW-->>WEB: Generic 404 without other-position data
        end
        HTTP->>REVIEW: Compare matching resume_id/snapshot pairs
        REVIEW->>DB: Read scores, criteria, policy, and decisions for both runs
        REVIEW-->>WEB: Score/rank/eligibility deltas and changed criteria
    end
```

## Rules and exceptions

Under [Q11](../requirements/non-functional-requirements.md), revision, source-run, progress, and comparison requests include the position context, which is checked before returning data or creating a run. Comparison responses and historical viewers follow the same no-store and sensitive-data handling rules as [SEQ-02](sequence-02-review.md). Position lifecycle remains display/filter only and adds no rescore prerequisite.

The component names match C3; the database is reached through DATA. A solid line is a call and a dashed line a result; responses to WEB are collapsed through HTTP. `alt` is a choice, `loop` an iteration, and `opt` a part that only occurs when its condition holds.

- Re-scoring after a criteria edit uses **exactly the successful CV set and extraction snapshots of the original run**, without calling the AI again. CVs that failed in the first run need a new screening pass to upload or reprocess them; they are not mixed into this R1–R2 comparison.
- Changing the model, the CV version, or the scoring policy constitutes a new kind of evaluation and must not be labelled "criteria change only". This design keeps the policy fixed throughout this flow.
- R1 does not lose its current-run flag the moment re-scoring is requested. All flags and `published_run_id` move together only when the R2 result qualifies for publication. If the transaction fails, the rollback leaves R1 unchanged.
- One active run per position; revision and run IDs must be validated server-side. A retry with the same idempotency key does not create an R3. The lease token prevents an old process from publishing after the job has been reclaimed by another process.
- If the user keeps editing criteria while R2 is running, R2 still uses the snapshot that was fixed at submission. The interface must report when the latest revision differs from the revision behind the results just published.
- Every shortlist/reject decision from R1 is kept in history; R2 starts in the `scored` state so the user reconsiders. Decisions are never transferred automatically on the basis of a new score.
- "Docker becomes mandatory and a candidate therefore moves to not-passed" is a business case that must be tested. The sample figures 92 → 86 and 31 → 19 in the prototype are not commitments made by the implemented formula.

Related: [snapshots and transactions in arc42](arc42.md#8-cross-cutting-concepts).
