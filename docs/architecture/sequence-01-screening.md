# SEQ-01 — JD setup and the first screening run

**Status:** proposed backend behaviour. **Preconditions:** the user has a JD and the CVs; the position has no active job. **Outcome:** one published run, holding results and evidence for the CVs that succeeded plus a separate list of failed CVs.

[Open the SVG](diagrams/sequence-01-screening.svg) to zoom in or embed it in a report.

![SEQ-01 — JD setup and the first screening run](diagrams/sequence-01-screening.svg)

```mermaid
---
title: "SEQ-01 — JD Setup and Initial Screening — Proposed"
---
sequenceDiagram
    autonumber
    actor REC as Recruiter
    participant WEB as WEB · Web App
    participant API as API · HTTP + CRIT + CV
    participant RUN as RUN · Screening Coordinator
    participant AI as AI via EXTRACT
    participant SCORE as SCORE · Scoring Engine
    participant DB as DB via DATA
    participant FILES as FILES via DATA
    REC->>WEB: Enter position and JD
    WEB->>API: POST /jobs with title and original JD
    API->>DB: Store position and original JD with lifecycle status draft
    API-->>WEB: 201, job_id and stored status draft
    opt View or filter positions
        WEB->>API: GET /jobs with optional lifecycle status filter
        API->>DB: Read positions matching draft, open, or closed
        API-->>WEB: Positions with stored status for list and workspace
    end
    WEB->>API: POST /jobs/{id}/criteria-draft
    API->>AI: Extract criteria from JD text
    alt AI failure or invalid data
        AI-->>API: Structured error
        API-->>WEB: Report failure and allow manual criteria entry
    else Valid data
        AI-->>API: Draft criteria with JD evidence
        API-->>WEB: Suggestions for recruiter review
    end
    REC->>WEB: Edit and approve the criteria set
    WEB->>API: PUT criteria with expected_revision
    API->>DB: Check version and store immutable revision
    API-->>WEB: New criteria_revision
    REC->>WEB: Select and upload CVs
    loop Each file
        WEB->>API: POST resumes, job_id and file multipart
        API->>API: Validate format, size, and SHA-256
        API->>DB: Look up existing hash
        alt Duplicate file
            API-->>WEB: Existing resume_id, no copy created
        else Valid new file
            API->>FILES: Store under a unique object key
            API->>DB: Store metadata and CV version
            API-->>WEB: resume_id and uploaded status
        else Invalid file
            API-->>WEB: File-specific error
        end
    end
    REC->>WEB: Start screening valid CVs
    WEB->>API: POST screening-runs, revision, resume_ids, idempotency key
    API->>RUN: Create initial run
    RUN->>DB: Create queued run transaction and freeze inputs
    API-->>WEB: 202 Accepted, run_id
    par Background processing in backend
    RUN->>DB: Acquire lease and move run to running
    loop Each CV in the run snapshot
        RUN->>API: Read text from selected CV version
        API->>FILES: Retrieve original file
        API-->>RUN: Text or file-read error
        opt Readable text
            RUN->>AI: Extract CV data
            AI-->>RUN: Validated data or error
        end
        alt File read or extraction fails after retries
            RUN->>DB: Mark item failed, store cause, and update progress
        else Input is eligible for scoring
            RUN->>DB: Store extraction snapshot and model version
            RUN->>SCORE: Score CV snapshot against criteria and policy
            SCORE-->>RUN: Score, eligibility, contributions, and evidence
            RUN->>DB: Store staged result and mark item succeeded
        end
    end
    alt At least one CV succeeded and every item is terminal
        RUN->>DB: Publish run transaction and mark results current
    else No successful result
        RUN->>DB: Mark run failed and do not publish ranking
    end
    and Track progress from the interface
    loop While the job is not terminal
        WEB->>API: GET screening-runs/{run_id}
        API->>RUN: Read progress
        RUN->>DB: Read persisted state
        API-->>WEB: Total, succeeded, failed, pending, and run status
    end
    end
    REC->>WEB: View results
    WEB->>API: GET jobs/{id}/ranking
    API->>DB: REVIEW reads published run via DATA
    API-->>WEB: Ranking, run_id, criteria used, and failure list
```

## Rules and exceptions

- [US-01 AC-4](../requirements/README.md#us-01--create-position-and-jd): CRIT owns position creation and status reads through DATA. New positions start as `draft`; stored `draft`/`open`/`closed` status is displayed and filterable, with no transition control or API command in v1. Lifecycle status does not gate screening.
- [Q11](../requirements/non-functional-requirements.md): uploads and run reads carry the position context. The API checks each selected CV/run belongs to that position before accepting or returning data. WEB keeps raw CV/contact data out of URLs, telemetry labels, notifications, errors, and persistent storage. Failure messages contain safe codes/IDs, not file contents or contact details. Sensitive responses are not cached.

- The `API` lane collapses the `HTTP`, `CRIT`, and `CV` components into their container; `RUN` and `SCORE` are kept separate because the flow turns on their interaction. Participants annotated `via DATA` or `via EXTRACT` collapse the C3 adapter calls to keep the diagram readable; no service bypasses the repository on its own. RUN is a module inside the API, not a separate process or service. A solid line is a request, a dashed line a response; `alt` is a conditional branch and `loop` an iteration.
- The `par` block shows background processing and polling happening concurrently. WEB does not have to wait for scoring to finish before asking for progress; once the run ends, the interface can fetch the results or display the error.
- A missing, invalid, or superseded criteria set returns `422`/`409` and no job is created. Resending the same idempotency key with the same payload returns the same run; a different payload returns `409`.
- A PDF with no text layer is flagged as needing reprocessing; automatic OCR is not part of this first proposal. A failed file is never counted as a candidate who did not meet the criteria.
- If the file is stored successfully but the metadata write fails, the API deletes the object just created or records it for orphan cleanup; it never touches files belonging to another CV record. A unique constraint handles concurrent duplicate uploads.
- A run may end as `completed_with_errors`; the ranking contains only successful items and always states the number of failed CVs. If every CV fails, no empty ranking table is published as though scoring had completed.
- Information missing from a readable CV is recorded as insufficient evidence, which is distinct from a technical failure to read the file. The scoring rules are in [arc42 §8](arc42.md#8-cross-cutting-concepts).

Related: [C3](c3-components.md), [SEQ-02](sequence-02-review.md).
