# arc42 — CV Screening and Ranking against a JD

Version 1.0 · 2026-09-14 · **Proposed design; the backend is not implemented**.

This document set covers only the screening subsystem and the functions that directly support it. The existing prototype is HTML/CSS/JS with sample data. Every API, transaction, background job, and operational requirement described below describes a future solution; none of it claims that the current application already satisfies it. This is a design detailed enough to discuss and to prepare an implementation — not a production quality certification report.

## 1. Introduction and Goals

### 1.1 The problem and the main requirements

A recruiter needs to compare many CVs against one JD, see who fits, and verify why. The system supports the decision; it does not make the hiring decision.

| ID | Business requirement | Flow |
|---|---|---|
| F01 | Enter position/JD, propose criteria, user edits and approves | SEQ-01 |
| F02 | Load multiple CVs, distinguish duplicate files, versions, and read errors | SEQ-01 |
| F03 | Check mandatory criteria, score by weight, rank, and show progress | SEQ-01 |
| F04 | View the evidence for each criterion alongside the correct CV version | SEQ-02 |
| F05 | User shortlists or rejects, including candidates who fail a mandatory criterion | SEQ-02 |
| F06 | Edit criteria, re-score, preserve history, and compare two runs | SEQ-03 |

End-to-end flow: JD → approved criteria → CVs → extraction → matching and scoring → ranking → evidence and decision → criteria adjustment and re-scoring.

### 1.2 Priority quality goals

1. **Explainable:** a score must trace back to the criteria and the evidence of exactly the input it was computed from.
2. **Consistent and reproducible:** the same snapshot and policy give the same score; two runs are never mixed.
3. **Human in control:** AI suggestions are validated; mandatory-criteria status never becomes a rejection decision on its own.
4. **Usable:** results and errors are clear and never conveyed by colour alone.
5. **Recoverable:** a single file failure or a restart does not lose a published run.

### 1.3 Stakeholders

| Party | Concern |
|---|---|
| Recruiter | Correct criteria, results that are easy to read, verify, and decide on |
| Lecturer / reviewer | A deliberate scope, consistency across C1–C3, and the design reasoning |
| Development team | Module boundaries, data contracts, errors, and the scoring rules |
| Trial operator | Configuration, progress, backup, and recovery |

The candidate is the subject of the CV but not a direct user within this scope. No second-level department-head approval role and no in-application administrator role have been designed.

## 2. Architecture Constraints

| Type | Constraint |
|---|---|
| Coursework | Only the screening and ranking functionality is developed in depth; no backend implementation is required |
| Current state | Plain-JS interface, no framework or build step; sample data, no localStorage/sessionStorage |
| Documentation | The new design must not change the prototype, the sample data, or the v2 DBML |
| Proposed technology | JS Web App; Python/FastAPI backend as a modular monolith; PostgreSQL; S3-compatible file store |
| Starting scale | One recruitment team, one trial environment, one backend instance; multi-tenancy is not designed |
| Proposed inputs | Text-layer PDF and DOCX; at most 10 MB per file and 200 CVs per batch — design limits, not measured ones |
| AI | A vendor adapter is used; no vendor or model has been chosen; AI-generated scores are not used |
| Technical exclusions | Automatic OCR, semantic embeddings/pgvector, a worker cluster, and a separate broker are not part of the first version |
| Environment | Synthetic data on a restricted trial network; nothing here implies the system is ready to accept real CVs |

The technology choices and load limits are design assumptions for this document set, not requirements already met by the code.

## 3. Context and Scope

### 3.1 Business context

[C1 — System Context](c1-context.md) describes `SYS` and its external relationships.

| Input | Output |
|---|---|
| The JD and minimal position details | Draft criteria for the user to confirm |
| Criteria, weights, mandatory/preferred flags | An approved criteria revision |
| Candidates' CV files | File status, extracted data, and per-file errors |
| A screening or re-scoring request | A run with an ID, progress, ranking, and evidence |
| The recruiter's decision | Shortlist/reject status attached to a specific result |

In scope: position/JD, criteria, CV files and records, screening, explanation, ranking, decisions, and run history. Out of scope: system-wide CV search, interviews, offers, executive reporting, HR administration, account management/RBAC, the candidate portal, and multi-level approval workflows.

### 3.2 Technical context

The AI extraction service is the only external software system in the pipeline. The backend sends text with unnecessary identifying information removed and receives structured data plus citation positions. A CV is input data, not an "external software system". The CV store and the database are managed by the system and therefore belong inside C2, unlike the AI service.

Do not infer that the AI is an independent internal actor merely because the older use-case model used an "AI System" label. In this architecture, EXTRACT is an internal adapter and the AI is a service outside the boundary.

## 4. Solution Strategy

| Problem | Proposed solution | Consequence |
|---|---|---|
| The scope must stay small | One backend split into modules by responsibility | Few deployment units; limited ability to scale by process |
| Batch processing takes time | Write a durable job to PostgreSQL, return a run ID, poll for progress | Requires leases, retries, and idempotency; no request is held open until the batch finishes |
| The AI can return wrong data | Validate schema, data types, and source spans; the user approves the JD criteria | Extraction is never treated as truth by default |
| Scores must be explainable | A pure scoring engine, a versioned policy, per-criterion contributions | No LLM produces the total score |
| Re-scoring must be comparable | Immutable criteria and CV snapshots, reusing already-extracted data | Costs extra storage but history never changes |
| Publishing half a run causes confusion | Write results staged, switch the published run in one transaction | The old ranking stays readable while re-scoring runs |
| Files differ from queryable data | Files in object storage, metadata and results in the database | Requires orphan-file control and consistent backups |

The solution keeps the underlying formulas of the v2 design but additionally fixes, in §8, how contributions are normalised and how absent criteria groups are handled. The demo figures remain UI illustrations only.

## 5. Building Block View

### 5.1 System and container level

[C2 — Container](c2-containers.md): `SYS` contains `WEB`, `API`, `DB`, and `FILES`; `AI` sits outside. Technologies and protocols are written directly on the diagram.

### 5.2 Component level

[C3 — Component](c3-components.md) opens only `API` into HTTP, CRIT, CV, RUN, SCORE, REVIEW, EXTRACT, and DATA. The SCORE module has no network or data dependency; EXTRACT makes no business decision; DATA owns access and transactions. A component is a logical unit inside the backend, not yet an existing file or service.

### 5.3 Data foundation

[DBML](../../sang-loc-xep-hang-v2.dbml) defines 13 tables. The [ERD and data design](../database-design.md) cover position/JD and criteria revisions; candidate/file identity and position membership; validated extraction snapshots; durable runs/items; and scored results/details. These are proposed persistence structures for the screening subsystem. No database or migration has been deployed.

### 5.4 Comparison with the existing code

| Exists today | Correspondence / limitation |
|---|---|
| `index.html`, `css/` | The shell and interface of the WEB prototype |
| `js/app.js` | Navigation, state, rendering, and simulated interaction in one file; not the C3 backend |
| `js/data.js` | Sample data, not PostgreSQL or a durable repository |
| DBML and DDL in Markdown | A data design; no running database exists in the project |
| The AI/re-scoring progress in the UI | A simulated scenario; the proposed pipeline and formula are not executed |
| The "Semantic Matching" bar in the UI | A sample value shown as though it were a real measurement, while policy v1 returns `semantic_score = null`. It does not enter the total: c1's total of 92 matches `0.55*95 + 0.30*90 + 0.15*85` exactly |
| The Education score in `comps` | The demo criteria set contains no education criterion; under the normalisation rule in §8.3 that group must be dropped from the total, so the correct result is 93.24, not 92 |

## 6. Runtime View

| Flow | Diagram | Consistency condition |
|---|---|---|
| SEQ-01 | [JD setup and the first screening run](sequence-01-screening.md) | Only approved criteria are used; failed CVs are disclosed; results carry a snapshot |
| SEQ-02 | [Verification and decision](sequence-02-review.md) | Reads target the correct run/CV; decisions check the version and the current run |
| SEQ-03 | [Editing criteria and re-scoring](sequence-03-rescore.md) | R1 is kept until R2 is published atomically; the exact CV snapshots are reused |

### 6.1 API contracts at design level

The paths below are proposals under the `/api` prefix; no route is implemented. IDs are issued by the server, and no arbitrary file path is accepted from the client.

| Interface | Main input | Result |
|---|---|---|
| `POST /jobs` | Position title and JD | `201`, `job_id`, stored lifecycle status `draft` |
| `GET /jobs` | Optional lifecycle status filter: `draft`, `open`, or `closed` | Positions with stored lifecycle status |
| `GET /jobs/{id}` | Position ID | Position metadata, original JD, and stored lifecycle status |
| `POST /jobs/{id}/criteria-draft` | The stored JD | Draft criteria, or an AI error that allows manual entry |
| `PUT /jobs/{id}/criteria` | Criteria + `expected_revision` | A new revision, or `409`/`422` |
| `POST /resumes` | Position ID and multipart file | `resume_id`, status; a duplicate file within the position returns the existing ID |
| `POST /jobs/{id}/screening-runs` | Revision, resume IDs or a base run ID, idempotency key | `202`, run ID, or `409` |
| `GET /screening-runs/{id}` | Run ID and position ID | Status, totals, successes, failures, and progress within that position |
| `GET /jobs/{id}/ranking` | Position, filters, pagination | The published run ID and the results of that same run |
| `GET /screenings/{id}` | Screening ID, position ID, and run ID for cross-checking | Breakdown, criteria snapshot, and evidence |
| `GET /resumes/{id}/content` | Resume ID and position ID; run and result IDs for evidence viewing | The file at the verified version, or a read error |
| `PATCH /screenings/{id}/decision` | Decision, position ID, run ID, expected result version | New status and version, or `409` |
| `GET /jobs/{id}/comparison` | Two run IDs for the same position | A diff by resume ID over score, rank, and mandatory status |

Errors carry a `code`, a message the user can understand, a `request_id`, and where relevant a `run_id`/`resume_id`. Error messages never contain stack traces, credentials, raw CV content, or contact details. Resource requests must validate the supplied position and associated run/result/CV before returning data or applying changes. A mismatch returns a generic `404` with no other-position data. Sensitive responses carry `Cache-Control: no-store` (Q11).

Under US-01 AC-4, CRIT manages position metadata through DATA. New positions start in `draft`; WEB displays stored `draft`/`open`/`closed` status and filters the list through `GET /jobs`. V1 has no lifecycle transition control or API operation. Position lifecycle is separate from run and decision states and does not add a screening or rescore prerequisite.

## 7. Deployment View

[Deployment — internal trial](deployment.md) places WEB in the browser; static files on Nginx; the API, PostgreSQL, and the S3 store on one trial server; the AI outside; and backups off the server. This is a proposed trial configuration with no high availability.

The prototype still runs directly from `index.html` or a static HTTP server. Adding this document set creates no infrastructure, connects no accounts, runs no migrations, and deploys no services.

## 8. Cross-cutting Concepts

### 8.1 Lifecycles, concurrency, and retries

- CV file: `uploaded → parsing → parsed | parse_failed`. A hash collision is an outcome of loading a file, not a new CV. Two people with the same name must not be merged automatically; a matching email requires comparing the records before linking them.
- Run: `queued → running → completed | completed_with_errors | failed`. Item: `pending → processing → succeeded | failed`. Run/item states are distinct from the business states `scored/shortlisted/rejected`.
- "One active run per position" is enforced by a database constraint, not merely by disabling a UI button. A lease carries an owner, an expiry, and a token that increments on reclaim; every result write and publication must check the current token.
- Each AI call has a 30-second timeout; at most 3 attempts in total for network/429/5xx errors, with a 2-then-4-second backoff or a Retry-After capped at 60 seconds. Schema/evidence failures found during validation are flagged for review rather than retried indefinitely. This is a starting policy that needs measurement.
- The idempotency key is bound to the position and a payload hash; the same key with the same payload returns the same run, a different payload returns `409`. An item is uniquely identified by `(run_id, resume_id)`.
- Polling is proposed at 2-second intervals while the page is open, backing off on errors and stopping when the run ends. Reloading the page still reads the job state from the database.
- The first run may publish the successful CVs once all items have finished, marked `completed_with_errors` where appropriate. If no CV succeeded, the run fails. A technical error must never become a score of 0 for a candidate.
- Re-scoring after a criteria change requires the entire successful CV set of the base run to be scored successfully. Otherwise the previously published run is kept. The publication transaction locks the position, checks the base run and the lease, and flips the latest flags and the published-run pointer together.

### 8.2 Snapshots and persistence design

The requirements-aligned design is now represented in [DBML](../../sang-loc-xep-hang-v2.dbml) and the [ERD](../database-design-erd.svg). [Database design](../database-design.md) specifies the additional PostgreSQL partial indexes, approval/publication transactions, immutable-record enforcement and JSON contracts that future migrations and services must implement.

| Tables | Content |
|---|---|
| `jobs` | Stored lifecycle, current approved criteria_revision and authoritative published_run_id |
| `job_criteria_versions`, `job_requirements` | Versioned JD, stable criterion keys, weights and thresholds; immutable after approval |
| `candidates`, `resumes`, `position_resumes` | Identity, immutable file versions, and position association before scoring |
| `resume_snapshots`, `resume_skills`, `skills` | Validated source text, employment/education facts, skill evidence and dictionary version |
| `screening_runs`, `screening_run_items` | Frozen CV set, criteria/policy, source run, lease, idempotency and per-file status/error |
| `screenings`, `screening_details` | Scores at calculation precision, separate display values, evidence/reasons, result_version and decision_at |

Composite foreign keys keep positions, CV versions and criteria revisions consistent across run, item and result. Partial unique indexes enforce one active run per position and one latest result per position/CV. Ranking reads the published pointer; latest flags switch in the same publication transaction. scored_round mirrors the position-level run round. Failed files have no scoring result.

Approved criteria and extraction snapshots are immutable. Rescoring reuses the exact successful source snapshots under the same policy, and publication waits for every required item. Historical evidence has no cascade-delete relationship to editable criteria. Erasure of real data would require a consistent policy covering snapshots, files and backups.

Aliases remain versioned configuration; snapshot canonical names and dictionary versions preserve reproducibility. Q11 additionally requires position-scoped repository checks and safe response/browser handling; foreign keys alone do not authorize data access.

### 8.3 Proposed scoring formula and rules — policy v1

The policy does not use a semantic score. The `semantic_score` field returns `null` and the UI states "not applied"; a sample semantic score must not be displayed as a real measurement.

**Criteria-set validation:** at least one criterion; every weight positive; the total exactly 100 in decimal arithmetic; kind limited to skill/experience/education. Version 1 allows at most one experience criterion and one education criterion. Experience must have `min_years > 0`; education must state the required degree level. A draft criterion with weight 0 must be corrected or removed before approval. Skill criteria must not repeat the same canonical skill.

**Mandatory:** every mandatory criterion must have sufficient evidence and meet its threshold. A partial skill match does not satisfy a mandatory criterion in policy v1; experience below the threshold fails even though it still contributes points; an undetermined education level counts as insufficient evidence. These candidates are kept in a separate group and are never moved to rejected automatically. This rule is newly settled here, and some older demo states may not match it.

**Component scores:**

```text
skill = 100 * sum(weight_i * match_i) / sum(weight_i)    for kind=skill
match_i = 1 (matched), 0.5 (partial), 0 (missing)
experience = 80 * min(years_in_resume_snapshot / min_years, 1.25)
education = 100 if the degree meets or exceeds the requirement,
            50 if exactly one level below, 0 if lower or unclear
base coefficients = skill: 0.55, experience: 0.30, education: 0.15
```

Experience takes the non-overlapping number of months from the CV snapshot and divides by 12; the string "5.3" is never read as 5 years and 3 months. It is never negative and never double-counts overlapping employment. Periods that cannot be determined are marked as missing evidence.

Degree ordering for the sample policy: vocational → college → bachelor's → master's → doctorate. This is a proposed technical lookup table driven by the JD requirement, not a judgement about candidate quality or a recruitment standard; a degree that cannot be mapped requires user review. If the JD has no education group, a degree requirement must not be added on the system's own initiative.

**Groups with no criteria:** drop the group from the total and renormalise the coefficients of the remaining groups to sum to 1. For example, with only skill and experience present, the coefficients become `0.55/0.85` and `0.30/0.85`. An empty criteria set is rejected so that no division by zero occurs.

```text
total = sum(normalized_coefficient_g * component_score_g)
skill contribution_i = coefficient_skill * 100 * weight_i * match_i / sum(skill weights)
experience contribution = coefficient_experience * experience
education contribution = coefficient_education * education
```

The contributions therefore sum to the pre-rounding total. `weight` is the configured weight within the criteria set and is **not the same as the maximum points in the final total** once group coefficients apply. The API additionally returns `max_contribution` if the UI needs to show the maximum; the prototype's two-column description will need adjusting when this policy is implemented.

**Weight does not control the balance between groups.** The group coefficients are constants, renormalised only according to *which groups are present*, never according to a group's total weight. Because v1 allows at most one experience and one education criterion, the internal normalisation of those two groups is always 1 and their weights never appear in any calculation. With the demo criteria set (8 skills totalling 86, experience 14), the maximum contribution of Python at weight 22 is `(0.55/0.85)*100*22/86 = 16.55`, while experience at weight 14 contributes `(0.30/0.85)*100 = 35.29` — the contribution order is the inverse of the weight order. Weight only governs the relative distribution inside the skill group.

Consequence for the what-if screen: dragging the weight slider of an experience or education criterion **does not change the score**. Implementing this policy requires either disabling those sliders or annotating them clearly, or a policy v2 in which weight feeds into the group coefficients.

Worked example: a single skill criterion at weight 60 fully matched and an experience criterion at weight 40 requiring 2 years, with a CV showing exactly 2 years. Skill = 100, experience = 80; the total is `(0.55*100 + 0.30*80)/0.85 = 92.941176...`, displayed as 92.94. The two contributions display as 64.71 and 28.23 under the remainder-distribution rule below. This is a new example for the policy and does not change the demo data.

Compute in decimal and store contributions at full precision; display the total to 2 decimal places. Distribute the rounding difference in steps of 0.01 by largest remainder, breaking ties by criterion ID, so that the displayed column sums to the rounded total. The ranking sorts by `passed_mandatory DESC`, then the 2-decimal total `DESC`, with `resume_id ASC` as a stable key; age, gender, and anything outside the JD criteria are never used as an implicit tiebreaker.

### 8.4 Evidence and extraction

CVs and JDs are data, not instructions to the AI. The adapter constrains output to a schema and validates types, value ranges, and the position of each quote within the source text. Document content must never be allowed to change the policy or invoke an executable tool. A citation that does not exist in the source is rejected; a score is never produced from a sentence the AI wrote itself.

Keep the original source text and an offset mapping when email addresses and phone numbers are stripped from the text sent to the AI. If a quote cannot be mapped back to the source, the extraction result is invalid. The PDF page or DOCX paragraph plus offset is what opens the evidence; the prototype has no parser that does this yet.

Matching in v1 relies on canonical skills and validated evidence, not semantic embeddings. A full match requires the canonical name or an alias plus evidence of use; partial means the skill is listed but use is insufficiently evidenced; missing means no valid evidence. The reason is stored so that the user can distinguish "not stated in the CV" from "does not have the skill".

Score explanations use sentence templates over already-computed results; no additional LLM call is needed to view a ranking. Only remarks derived from the criteria and the evidence are stored, and no claim of "bias elimination" is made without empirical evaluation.

### 8.5 User decisions

Shortlist/reject changes status only; it never alters the score or the mandatory status. Each update checks `expected_result_version` and the published run inside a transaction. Decisions on an earlier run are kept; a new run defaults to `scored` so the user reconfirms. This design keeps the current combined application/scoring scope; a candidate pipeline spanning several rounds or interviews would require separating the application lifecycle in a different extension.

### 8.6 Files, interface, and observability

Q11 requires raw CV content and contact details to stay out of URLs, analytics labels, notifications, client-side errors, and persistent browser storage, including localStorage, IndexedDB, and Cache Storage. Sensitive responses use `Cache-Control: no-store`; proxies must preserve it and avoid caching these responses. WEB releases in-memory viewer data and temporary object URLs when the view closes or the position changes. API services validate position/run/result/CV associations before data access; private object storage alone is insufficient. See [C3 responsibilities and verification](c3-components.md#position-lifecycle-and-q11-responsibilities) and [SEQ-02](sequence-02-review.md).

Validate the file's actual format, size limit, and count before parsing; files are stored under a server-generated object key. Content preview must not execute scripts embedded in the document. A scanned PDF is reported as needing reprocessing rather than pretended to be OCR'd. The remaining files are still processed.

The interface has empty/running/error/complete states and shows the number of failed CVs separately from the number who did not pass. Colour must always be accompanied by a label and an icon; the not-passed group sits below a separator and remains actionable. Run ID and revision are shown in the history detail where they mean something to the user; table names and adapter names are never scattered across the UI.

Technical logs carry request/run/item IDs, phase, duration, attempts, and error code; they never contain the raw CV, email addresses, phone numbers, or the AI key. Track job queue time, processing time, parser/AI error rates, and retry counts. These metrics are for operations and are not to be grown into a recruitment reporting module.

## 9. Architecture Decisions

The ADRs below have the status **proposed in design 1.0** and are not yet proven by an implementation.

| ADR | Context and choice | Alternatives considered | Consequence |
|---|---|---|---|
| ADR-01 | A single-flow scope with few operators: use a Python/FastAPI modular monolith | A microservice per step | Easy to deploy, but module boundaries must be maintained; backend resources are shared |
| ADR-02 | Long batches: durable jobs in PostgreSQL with the coordinator inside the API | A synchronous request; a separate queue/worker | Recoverable, but leases and idempotency are required; a worker can be split out once load figures exist |
| ADR-03 | Scores must be verifiable: the AI only extracts, SCORE computes under a fixed policy | An LLM scoring and ranking directly | Reproducible from a snapshot; quality still depends on extraction and criteria |
| ADR-04 | Criteria change: immutable snapshots and atomic per-run publication | Editing requirements in place and overwriting results | More tables and storage; history is preserved and half-old rankings avoided |
| ADR-05 | A CV is a file: separate object storage, metadata in PostgreSQL | A blob in the database; public files on the web server | Needs compensation when the metadata write fails, and backups of both stores |
| ADR-06 | Keep the screening scope: decisions belong to a run and do not carry over automatically | A separate application entity with cross-run state | Easy to explain today; must be separated if the candidate pipeline is extended |
| ADR-07 | The old formula and the UI scores are interpreted differently: settle policy v1 and normalised contributions | Bending the formula to match each demo number | The demo is not an oracle; the UI must distinguish weight from maximum contribution; experience/education weights do not affect the score in v1, so the what-if screen must reflect that |
| ADR-08 | No load data yet: a one-host trial with no broker or cluster | HA infrastructure from the start | Low cost, single point of failure; no claim of production readiness |

The original data decisions are carried over: candidates and resumes are separate, canonical skills are used, a score belongs to a CV–position pair, and the details hold the evidence. See [the requirements-aligned data model](../../sang-loc-xep-hang-v2.dbml).

## 10. Quality Requirements

All of these are **proposed acceptance criteria**, not test results from the prototype. Correctness and explainability take priority over performance.

| ID | Scenario and stimulus | Required response | How it is verified |
|---|---|---|---|
| Q01 | The user opens a published result | Every criterion has a status and a reason; the evidence points at the correct snapshot; missing data is stated explicitly | Check 100% of the rows of the annotated synthetic CV set |
| Q02 | Score twice with the same input snapshot and policy | Identical scores, mandatory status, and ordering | Compare results exactly, without calling the AI again |
| Q03 | One corrupt PDF in a batch of 42 files | The failed file is reported separately; the other 41 continue if valid; the failed file is not counted as not-passed | Inject a parser failure and check the statistics |
| Q04 | Read the ranking repeatedly while R2 is being published | Each response contains only R1 or only R2, never a mix; R1 is unchanged if publication fails | Concurrency test plus database rollback |
| Q05 | Send a scoring command twice, then restart the backend | One logical run; no duplicate item results; the job is reclaimed after the lease expires | Send duplicates, kill the process, and restart |
| Q06 | The user confirms a shortlist from a stale screen | `409`, and no decision written against the new run | Publish or change a decision between the GET and the PATCH |
| Q07 | 10 users view a ranking of up to 200 results on the trial machine | P95 for GET ranking under 2 seconds over 100 post-warm-up measurements, excluding file/AI load | Measure on the deployment configuration; no commitment yet on AI batch completion time |
| Q08 | The user cannot distinguish colours | Status remains understandable through text and icons; the main actions are keyboard-operable | Check in greyscale, plus tab/focus order and control labels |
| Q09 | Recovery after losing the trial machine | Database, files, and manifest agree; RPO ≤ 24 hours, RTO ≤ 4 hours | Rehearse a restore from the off-server backup |
| Q10 | Inspect the logs of a failed batch | Request/run/item and the cause are traceable; no raw CV or credentials present | Inspect logs using synthetic marked-identity data |
| Q11 | Use CV upload, ranking, evidence, and cross-position links | Raw CV content and contact details stay out of URLs, analytics labels, notifications, client-side errors, and persistent browser storage; a resource requested under the wrong position context does not expose data from the other position | Inspect browser storage and captured client telemetry with marked synthetic data; test cross-position context mismatches |

## 11. Risks and Technical Debt

| ID | Risk / limitation | Impact | Handling in the design or before implementation |
|---|---|---|---|
| R01 | The old README describes several functions as implemented | Readers mistake the demo for a real AI system | Add a current-state warning and point to the proposal document set |
| R02 | DBML v2 lacks snapshots, runs/items, leases, and decision versions | Full history and background processing cannot be implemented | A dedicated migration per §8.2 before writing a backend that depends on them |
| R03 | The demo scores, contributions, and the old formula are inconsistent | There is no correct oracle for scoring | Policy v1 in §8.3 plus a separate acceptance data set; the demo is not modified in this documentation pass |
| R04 | The AI returns wrong data or citations; a CV contains fake instructions | Wrong scores or explanations | The adapter validates source and schema, separates data from instructions, and is tested with annotated CVs |
| R05 | Missing evidence is read as missing ability | The user over-interprets the results | Clear labels, the original CV retained, the user decides; no claim that bias is eliminated |
| R06 | No AI provider chosen and no extraction-quality evaluation | Accuracy, latency, and cost are unknown | Trial the adapter on synthetic data; settle provider and model before integration |
| R07 | No auth/RBAC and no retention policy for real CVs | The environment is not suitable for real use | Restrict network and use synthetic data for the trial; add access control, retention/deletion, and conditions for sending data to the AI before real CVs |
| R08 | One host, with the coordinator inside the API | Single point of failure; heavy batches affect the API | Limit concurrency, measure Q07, keep backups; consider a separate worker after measuring |
| R09 | Uploads span two stores, and the old schema cascade-deletes | Orphan files or lost historical evidence | Compensating upload logic, soft-delete/versioned criteria, backups with a manifest |
| R10 | No OCR, and ambiguous degrees/experience are not all handled | Some CVs need a human to read them | Record errors and missing evidence explicitly; never fabricate data to complete a score |

The above are known limitations and preconditions for a future implementation. They are not a reason to widen this project's scope to the whole recruitment system.

## 12. Glossary

| Term | Meaning in this design |
|---|---|
| JD | Job Description |
| CV/resume | The application file; one person may have several versions |
| Mandatory / preferred | Required / preferred; mandatory affects the passing group, and both may carry a weight |
| Match Score | The total score under the policy — not a probability that the candidate will perform well |
| Evidence/span | The quoted passage and its position within the correct source CV text |
| Canonical skill / alias | The standard skill name / a configured equivalent spelling |
| Snapshot | An immutable capture of the inputs of a revision or a run |
| Revision | A version of the criteria set confirmed by the user |
| Run/round | One scoring pass over a position and a frozen CV set |
| Published/staged | A result that is published / a result being prepared that has not replaced the current ranking |
| Shortlist | The list the user wants to consider further; not a hiring decision |
| Idempotency | Resending the same command does not create another logical job |
| Lease/token | A time-limited right to process a job / the value that stops an old process from continuing to write |
| Modular monolith | One deployed application, divided into modules with clear responsibilities |
| Container / component | A C4 application or data-store unit / a part inside one application |
| ADR | Architectural Decision Record, capturing an architecture choice and its consequences |
| Polling | The client asks for progress at intervals |
| RPO / RTO | Acceptable data loss measured in time / target recovery time |
| P95 | 95% of measurements fall at or below this threshold |

## Sources and related documents

The section structure follows the [arc42 Template Overview](https://arc42.org/overview/); the views follow [C4 Container](https://c4model.com/diagrams/container), [C4 Component](https://c4model.com/diagrams/component), and [C4 Notation](https://c4model.com/diagrams/notation). The business content comes from the project documents; the policy, the infrastructure, and the API contracts are proposals, stated as such throughout this design set.

Back to the [architecture index](README.md).
