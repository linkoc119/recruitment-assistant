# C3 — Component: Screening Backend

**Runtime/API update (2026-09-16):** This view reflects the [Next.js backend decision](nextjs-backend.md): `API` (Next.js Route Handlers) and `WORKER` (Node.js/TypeScript) are separate processes, coordinated only through a lease/command table in PostgreSQL, with no message broker. [OpenAPI](../api/openapi.yaml) defines canonical HTTP behavior; business invariants are unchanged.

**Status:** proposed decomposition. The API and worker it describes are implemented under `backend/`, though on process-local storage and with the worker hosted inside the API process. The component names here are design labels, not module names in the code.

**Scope:** opens up `API` and `WORKER` from C2.

**Audience:** backend designers and developers.

[Open the SVG](diagrams/c3-components.svg) to zoom in or embed it in a report.

![C3 — Component: Screening Backend](diagrams/c3-components.svg)

<details>
<summary>Mermaid — equivalent content and relationships</summary>

```mermaid
---
title: "C3 — Component: Screening Backend and Worker — Proposed"
---
flowchart TB
    WEB["WEB · Web App<br/>[Container · HTML/CSS/JavaScript]<br/>Sends commands and displays results"]
    subgraph API["API · Screening Backend — Next.js Route Handlers Container"]
        HTTP["HTTP · API Controllers<br/>[Component · Next.js Route Handlers]<br/>Validates requests, context, and versions"]
        CRIT["CRIT · Criteria Service<br/>[Component · TypeScript]<br/>Manages positions, JDs, and criteria revisions"]
        CV["CV · Resume Service<br/>[Component · TypeScript]<br/>Accepts uploads; manages files, hashes, and versions"]
        REVIEW["REVIEW · Ranking and Review Service<br/>[Component · TypeScript]<br/>Provides rankings, evidence, decisions, and comparisons"]
        HTTP -->|"Creates/reads positions and manages criteria · function call"| CRIT
        HTTP -->|"Uploads or reads a CV file · function call"| CV
        HTTP -->|"Writes a durable run command and reads progress · function call"| DATA
        HTTP -->|"Reads results and records decisions · function call"| REVIEW
        CRIT -->|"Extracts JD data · function call"| EXTRACT
        CRIT -->|"Reads/writes positions and criteria · function call"| DATA
        CV -->|"Stores file, hash, and version · function call"| DATA
        REVIEW -->|"Reads runs/evidence and records decisions · function call"| DATA
    end
    subgraph WORKER["WORKER · Screening Worker — Node.js/TypeScript Container"]
        RUN["RUN · Screening Coordinator<br/>[Component · Node.js durable worker loop]<br/>Claims durable commands, coordinates retries, and publishes runs"]
        RUN -->|"Claims durable commands, stores jobs/snapshots, and publishes transactionally · function call"| DATA
        RUN -->|"Executes a claimed CV extraction job · function call"| EXTRACT
        RUN -->|"Scores a snapshot under the policy · function call"| SCORE
    end
    SCORE["SCORE · Scoring Engine<br/>[Component · TypeScript domain module · shared]<br/>Evaluates eligibility, scores, and criterion contributions"]
    EXTRACT["EXTRACT · Extraction Adapter<br/>[Component · TypeScript HTTP client · shared]<br/>Calls AI and validates schemas and source evidence"]
    DATA["DATA · Repositories<br/>[Component · TypeScript SQL/S3 clients · shared]<br/>Provides data/file access and transaction boundaries"]
    DB[("DB · Screening Database<br/>[Container · PostgreSQL]<br/>Business data, durable commands/leases, jobs, and history")]
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

In the SVG, `API` and `WORKER` are each drawn as their own frame — two separate processes, per the [Next.js backend decision](nextjs-backend.md) — with `SCORE`, `EXTRACT`, and `DATA` drawn outside both frames because their code is shared by both processes, not owned by either one. A box with two tabs on its left edge and a `[Component]` label is a component. WEB, DB, and FILES sit outside both backend frames but still belong to the system; AI is a red box outside every frame. The Mermaid version omits the outer `SYS` frame from C2 to keep the focus on the backend; the elements and relationships are equivalent to the SVG.

A dashed arrow runs from caller to provider and states whether the call is internal or a network protocol; it does not express execution order or synchronous versus asynchronous behaviour. An arrow never crosses the `API`/`WORKER` process boundary directly — the two processes coordinate only by writing and polling rows in `DATA`, never by calling one another's components. Element-type labels accompany the icons, so meaning does not depend on colour alone. PDF/DOCX are CV formats; the remaining abbreviations follow the [arc42 glossary](arc42.md#12-glossary).

`SCORE` only receives a snapshot and returns a result: it does not call the AI, write to the database, or read files. That makes it testable — the same input always yields the same score. `EXTRACT` returns either validated data or a structured error; it never decides a shortlist. `DATA` contains no scoring formula. `RUN`, in the `WORKER` process, owns the job lifecycle and the run-publication transaction; `REVIEW`, in the `API` process, owns human actions.

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

Calls into DATA are shown at the shared repository level; no service calls the database directly. Background processing runs in `WORKER`, a Node.js/TypeScript process separate from `API`; the two coordinate only through the durable command/lease rows in `DATA`, never through a direct call — see [Background processing in C2](c2-containers.md#background-processing-a-separate-worker-coordinated-by-a-lease-table).

## Position lifecycle and Q11 responsibilities

`CRIT` also owns position metadata and the original JD in this subsystem. Through DATA, it creates a position with status `draft`, reads position details, and lists positions with an optional `draft`/`open`/`closed` filter. HTTP validates the filter, returns stored status, and exposes no status-transition operation. WEB displays and filters status without allowing edits. Run state and decision state remain separate. This implements [US-01 AC-4](../requirements/README.md#us-01--create-position-and-jd) without adding a recruitment lifecycle workflow.

For [Q11](../requirements/non-functional-requirements.md), HTTP requires the position context on resource requests. It passes that context directly to the service it calls in-process (CRIT, CV, REVIEW); for a durable run, it writes the position context into the command row that RUN, in the separate WORKER process, later reads when it claims the lease. RUN checks run membership from that durable record, REVIEW checks run/result membership (and both runs for comparison), and CV checks the selected CV's association with the position. For an evidence viewer, CV also checks that the requested version is the one referenced by the selected result and run. DATA performs these scoped lookups before returning sensitive data or resolving a file object key. A mismatch returns a generic `404` without content or metadata from the other position. This context check does not replace future user authorization.

WEB excludes raw CV content and contact details from URLs, analytics labels, notifications, error messages, and persistent storage. HTTP returns sanitized error codes and correlation IDs, never submitted sensitive values. CV content and sensitive API responses use `Cache-Control: no-store`; WEB must not persist these responses in localStorage, IndexedDB, or Cache Storage, and releases viewer data/object URLs when the view closes or changes position. Notifications use generic text rather than candidate contact details or raw filenames.

Verification uses marked synthetic CV/contact data to inspect URLs, browser storage, telemetry, notifications, and client errors after upload, ranking, and evidence viewing. Cross-position requests for runs, results, and CV content must return no data from the other position. Valid historical requests within the correct position must remain readable.

See [the three runtime flows](arc42.md#6-runtime-view) and [the scoring rules](arc42.md#8-cross-cutting-concepts).

## One level below: the class views

[CLS-02 — services and ports](class-services.md) opens these components into the classes that implement them: each service stereotype there carries the component ID used above (`CRIT`, `CV`, `RUN`, `SCORE`, `REVIEW`, `EXTRACT`, `DATA`), so a component on this page maps to a named module under `backend/src`. The rule that no service calls the database directly appears there as the `Repository<T>` port that every service depends on, and the separation of `EXTRACT` from `SCORE` appears as `AiExtractionService` and `ScoringEngine` having no relationship to each other. [CLS-01 — domain model](class-domain.md) gives the data those classes operate on.

## Durable extraction and scoring storage

[The accepted extraction-job decision](extraction-jobs.md) uses `resume_extraction_jobs` for CV extraction and `screening_runs` / `screening_run_items` for scoring. Workers poll both durable work types without blocking an execution slot while awaiting extraction. One active extraction is shared per immutable resume; each work type has its own fenced lease. Upload/reprocess commit extraction work before acknowledgment; public screening still requires parsed CVs and rescore never enqueues extraction. Production adapters and migrations remain to be implemented.
