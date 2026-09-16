# SEQ-02 — Reviewing evidence and deciding shortlist/reject

**Status:** proposed behaviour. **Preconditions:** a published run exists. **Outcome:** the user can verify the scores; a decision is written only against the exact result being viewed, and only while it is not stale.

[Open the SVG](diagrams/sequence-02-review.svg) to zoom in or embed it in a report.

![SEQ-02 — Reviewing evidence and deciding shortlist/reject](diagrams/sequence-02-review.svg)

```mermaid
---
title: "SEQ-02 — Evidence Review and Shortlist/Reject Decision — Proposed"
---
sequenceDiagram
    autonumber
    actor REC as Recruiter
    participant WEB as WEB · Web App
    participant HTTP as HTTP · API Controllers
    participant REVIEW as REVIEW · Ranking and Review Service
    participant CV as CV · Resume Service
    participant DB as DB via DATA
    participant FILES as FILES via DATA
    REC->>WEB: Open the position ranking
    WEB->>HTTP: GET jobs/{id}/ranking
    HTTP->>REVIEW: Get the published run
    REVIEW->>DB: Read run_id and a consistent snapshot of results
    REVIEW-->>WEB: Ranking, run_id, result_version
    REC->>WEB: Open details and evidence
    WEB->>HTTP: GET screenings/{id} with job_id and run_id
    HTTP->>REVIEW: Validate position/run/result association via DATA
    break Missing resource or mismatched position context
        REVIEW-->>WEB: Generic 404 without other-position data
    end
    HTTP->>REVIEW: Read the selected historical result
    REVIEW->>DB: Read score, criteria snapshot, and evidence spans
    REVIEW-->>WEB: Score, contributions, and citation locations
    WEB->>HTTP: GET resumes/{resume_id}/content with job_id, run_id, result_id
    HTTP->>CV: Validate position/run/result/CV version association via DATA
    break Missing resource or mismatched evidence context
        CV-->>WEB: Generic 404 without file data or metadata
    end
    HTTP->>CV: Read the file for the displayed result
    CV->>DB: Look up the correct CV version's object key
    CV->>FILES: Read private file
    alt File available
        CV-->>WEB: CV content with excerpt mapping, Cache-Control no-store
    else File temporarily unavailable
        CV-->>WEB: CV viewer error, retain loaded analysis
    end
    REC->>WEB: Select shortlist or reject and confirm
    WEB->>HTTP: PATCH decision, job_id, run_id, expected_result_version
    HTTP->>REVIEW: Request decision write
    REVIEW->>DB: Lock position and check published run/version in transaction
    alt New run published or decision changed
        DB-->>REVIEW: Conflict and rollback
        REVIEW-->>WEB: 409, load current result and review again
    else Result is still current
        REVIEW->>DB: Update status and decision_at, increment result_version
        DB-->>REVIEW: Commit
        REVIEW-->>WEB: Saved decision and new version
    end
    WEB-->>REC: Display status using text, icon, and color
```

## Rules and exceptions

[Q11](../requirements/non-functional-requirements.md) applies to ranking, historical detail, evidence, and decision requests. Position-context validation happens before returning data or applying changes. A context mismatch returns a generic `404`; a valid context with a stale decision returns `409`. Valid historical results remain readable within their position. These checks enforce resource relationships and do not introduce a new login or role workflow.

WEB puts only identifiers and non-sensitive navigation/filter values in URLs. Raw CV content and contact details must not enter analytics labels, notifications, client-side error messages, or persistent browser storage. Sensitive API responses use `Cache-Control: no-store`. Viewer data stays in memory and is released on close or position change, including any temporary object URL. Verify with marked synthetic data and cross-position requests, as described in [C3](c3-components.md#position-lifecycle-and-q11-responsibilities).

A solid line is a request and a dashed line a response; responses reaching WEB are drawn collapsed through HTTP. DB and FILES are reached only through DATA. A ranking read must pin a single `run_id` within one query or transaction, so that figures from two runs are never combined if a publication happens concurrently.

The AI is not called when existing results are viewed. Evidence always references the CV version and the criteria snapshot of the run being viewed. The API never accepts an arbitrary URL or file path from the browser in order to read a file.

A candidate who fails a mandatory criterion can still be viewed and shortlisted. If the user shortlists someone who did not pass, the interface states plainly which criteria were not met and asks for confirmation; the decision does not alter `passed_mandatory` or the score. Nothing is auto-rejected for a missing criterion.

Decisions belong to a run within this scope. A new run starts in the `scored` state; decisions from the previous run remain readable but are not carried over automatically. A retry with the same decision and the current version may return the existing state; a stale version returns a conflict rather than overwriting a newer decision.

Related: [SEQ-03](sequence-03-rescore.md), [arc42 §9](arc42.md#9-architecture-decisions).
