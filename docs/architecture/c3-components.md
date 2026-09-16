# C3 — Component: Screening Backend

**Status:** proposed; these components do not exist in the current code.

**Scope:** opens up the `API` container from C2 only.

**Audience:** backend designers and developers.

[Open the SVG](diagrams/c3-components.svg) to zoom in or embed it in a report.

![C3 — Component: Screening Backend](diagrams/c3-components.svg)

<details>
<summary>Mermaid — equivalent content and relationships</summary>

```mermaid
---
title: "C3 — Component: Screening Backend — Proposed"
---
flowchart TB
    WEB["WEB · Web App<br/>[Container · HTML/CSS/JavaScript]<br/>Sends commands and displays results"]
    subgraph API["API · Screening Backend — Proposed Python/FastAPI Container"]
        HTTP["HTTP · API Controllers<br/>[Component · FastAPI routers]<br/>Validates requests, context, and versions"]
        CRIT["CRIT · Criteria Service<br/>[Component · Python]<br/>Manages positions, JDs, and criteria revisions"]
        CV["CV · Resume Service<br/>[Component · Python/PDF-DOCX parser]<br/>Manages files, hashes, versions, and CV text"]
        RUN["RUN · Screening Coordinator<br/>[Component · Python async tasks]<br/>Coordinates durable jobs, retries, and publication"]
        SCORE["SCORE · Scoring Engine<br/>[Component · Python domain module]<br/>Evaluates eligibility, scores, and criterion contributions"]
        REVIEW["REVIEW · Ranking and Review Service<br/>[Component · Python]<br/>Provides rankings, evidence, decisions, and comparisons"]
        EXTRACT["EXTRACT · Extraction Adapter<br/>[Component · Python HTTP client]<br/>Calls AI and validates schemas and source evidence"]
        DATA["DATA · Repositories<br/>[Component · Python SQL/S3 clients]<br/>Provides data/file access and transaction boundaries"]
        HTTP -->|"Creates/reads positions and manages criteria · function call"| CRIT
        HTTP -->|"Uploads or reads a CV file · function call"| CV
        HTTP -->|"Creates jobs and reads progress · function call"| RUN
        HTTP -->|"Reads results and records decisions · function call"| REVIEW
        CRIT -->|"Extracts JD data · function call"| EXTRACT
        CRIT -->|"Reads/writes positions and criteria · function call"| DATA
        CV -->|"Stores file, hash, and version · function call"| DATA
        RUN -->|"Reads text from the selected CV version · function call"| CV
        RUN -->|"Extracts a CV without a snapshot · function call"| EXTRACT
        RUN -->|"Scores a snapshot under the policy · function call"| SCORE
        RUN -->|"Stores jobs and snapshots and publishes transactionally · function call"| DATA
        REVIEW -->|"Reads runs/evidence and records decisions · function call"| DATA
    end
    DB[("DB · Screening Database<br/>[Container · PostgreSQL]<br/>Business data, jobs, and history")]
    FILES[("FILES · CV Store<br/>[Container · S3-compatible storage]<br/>Private original CV files")]
    AI["AI · AI Extraction Service<br/>[External Software System · HTTPS API]<br/>Returns structured JD and CV data"]
    WEB -->|"HTTPS/JSON or multipart"| HTTP
    DATA -->|"Reads/writes and runs transactions · SQL/TCP"| DB
    DATA -->|"Stores/reads files · HTTPS/S3 API"| FILES
    EXTRACT -->|"Extracts text data · HTTPS/JSON"| AI
    classDef internal fill:#fff,color:#146ac4,stroke:#146ac4,stroke-width:3px
    classDef neighbour fill:#fff,color:#146ac4,stroke:#146ac4,stroke-width:3px
    classDef external fill:#fff,color:#c71025,stroke:#c71025,stroke-width:3px
    class HTTP,CRIT,CV,RUN,SCORE,REVIEW,EXTRACT,DATA internal
    class WEB,DB,FILES neighbour
    class AI external
    linkStyle default stroke:#494949,stroke-width:2px,stroke-dasharray:8 6
```

</details>

## Legend and dependency rules

In the SVG, the outer frame is the `SYS` system and the inner frame is the `API` container. A box with two tabs on its left edge and a `[Component]` label is a component inside the backend. WEB, DB, and FILES sit outside the backend frame but still belong to the system; AI is a red box outside both frames. The Mermaid version omits the outer frame to keep the focus on the API; the elements and relationships are equivalent to the SVG.

A dashed arrow runs from caller to provider and states whether the call is internal or a network protocol; it does not express execution order or synchronous versus asynchronous behaviour. Element-type labels accompany the icons, so meaning does not depend on colour alone. PDF/DOCX are CV formats; the remaining abbreviations follow the [arc42 glossary](arc42.md#12-glossary).

`SCORE` only receives a snapshot and returns a result: it does not call the AI, write to the database, or read files. That makes it testable — the same input always yields the same score. `EXTRACT` returns either validated data or a structured error; it never decides a shortlist. `DATA` contains no scoring formula. `RUN` owns the job lifecycle and the run-publication transaction; `REVIEW` owns human actions.

| Component | Main contract | Failure cases |
|---|---|---|
| HTTP | Valid request and position context → scoped service call; response carries the ID and version | `422` for invalid data, generic `404` for context mismatch, `409` for a version or job conflict |
| CRIT | Creates/reads positions and filters stored status; JD → draft criteria; user approval → an immutable revision | Invalid position input/status filter, too few criteria, invalid weights, edits to a superseded revision |
| CV | Valid file → `resume_id`, hash, object key, status | Corrupt file, size limit exceeded, duplicate hash; never merges people on matching names alone |
| RUN | Input revision + CV list → `run_id`, progress, published run | Bounded retries, lease expiry, no CV processed successfully |
| SCORE | CV snapshot + criteria + policy → score, pass/fail, contributions | Missing data is recorded explicitly; an invalid policy is rejected |
| REVIEW | Published run → ranking/detail/diff; decisions carry an expected version | A newer run appears → the user is asked to re-check; writes never land on the wrong run |
| EXTRACT | Text + schema → data with valid spans plus metadata | Timeout, malformed JSON, evidence absent from the source |
| DATA | Repository methods plus the transaction boundary | Database rollback; compensating deletion of written files when the metadata cannot be saved |

Calls into DATA are shown at the shared repository level; no service calls the database directly. Background processing uses `RUN` inside the same API container — no worker container has been left out of the diagram.

## Position lifecycle and Q11 responsibilities

`CRIT` also owns position metadata and the original JD in this subsystem. Through DATA, it creates a position with status `draft`, reads position details, and lists positions with an optional `draft`/`open`/`closed` filter. HTTP validates the filter, returns stored status, and exposes no status-transition operation. WEB displays and filters status without allowing edits. Run state and decision state remain separate. This implements [US-01 AC-4](../requirements/README.md#us-01--create-position-and-jd) without adding a recruitment lifecycle workflow.

For [Q11](../requirements/non-functional-requirements.md), HTTP requires the position context on resource requests and passes it to the responsible service. RUN checks run membership, REVIEW checks run/result membership (and both runs for comparison), and CV checks the selected CV's association with the position. For an evidence viewer, CV also checks that the requested version is the one referenced by the selected result and run. DATA performs these scoped lookups before returning sensitive data or resolving a file object key. A mismatch returns a generic `404` without content or metadata from the other position. This context check does not replace future user authorization.

WEB excludes raw CV content and contact details from URLs, analytics labels, notifications, error messages, and persistent storage. HTTP returns sanitized error codes and correlation IDs, never submitted sensitive values. CV content and sensitive API responses use `Cache-Control: no-store`; WEB must not persist these responses in localStorage, IndexedDB, or Cache Storage, and releases viewer data/object URLs when the view closes or changes position. Notifications use generic text rather than candidate contact details or raw filenames.

Verification uses marked synthetic CV/contact data to inspect URLs, browser storage, telemetry, notifications, and client errors after upload, ranking, and evidence viewing. Cross-position requests for runs, results, and CV content must return no data from the other position. Valid historical requests within the correct position must remain readable.

See [the three runtime flows](arc42.md#6-runtime-view) and [the scoring rules](arc42.md#8-cross-cutting-concepts).
