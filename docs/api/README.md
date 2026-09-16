# API contract — CV screening and ranking

Version 1.0 · 2026-09-16 · Design contract; backend implementation and integration tests are pending.

## 1. Scope and sources

[openapi.yaml](openapi.yaml) is the OpenAPI **3.0.3** contract for the Next.js/TypeScript backend. Import it into Swagger Editor or render it with Swagger UI. The documented localhost server is a proposed address, not a running API. Examples contain synthetic data.

The contract implements [US-01–US-17](../requirements/README.md), [business rules](../requirements/business-rules.md), [Q01–Q11](../requirements/non-functional-requirements.md), [D-01–D-05](../requirements/decisions.md) and the [screen specifications](../ui-ux/screen-specifications.md). Business rules and accepted decisions take precedence over older illustrative endpoint names in architecture diagrams. The YAML defines HTTP paths, schemas and responses; this guide defines transactional and cross-field invariants that OpenAPI cannot fully express.

`job` means recruitment position. UI routes may use `positions`; API routes use `jobs` to match the database. Base path: `/api`. Scope includes JD criteria, CV ingestion, deterministic ranking, evidence, decisions and historical comparison. No lifecycle mutation, location field, candidate merge, interviews, reporting, authentication/RBAC or semantic scoring is added.

The selected runtime and differences from the earlier Python design are recorded in [Next.js backend decision](../architecture/nextjs-backend.md). The existing [13-table DBML](../../sang-loc-xep-hang-v2.dbml) remains a domain design; section 8 identifies storage additions required before implementation.

## 2. HTTP and data conventions

- JSON uses `snake_case`. Database bigint identifiers are decimal **strings**, including tie-break comparisons, which use numeric ID order rather than lexical string order.
- Timestamps are UTC ISO 8601. Weights and authoritative scores are decimal strings. Use decimal arithmetic; never derive authoritative scores in the browser. Display scores have exactly two decimals.
- Omitted fields and `null` differ. Required response fields with unknown values return `null` where permitted. Undeclared request properties fail validation. There is no generic mass-assignment endpoint.
- All responses, including errors and files, carry `Cache-Control: no-store` and `X-Request-Id`. Errors return safe codes/messages; never echo CV text, contact details, filenames, provider payloads, credentials or storage paths.
- Resolve the entire `job → run → result → resume/snapshot` relationship for every nested read/write. Wrong-position IDs return the same `404 resource_not_found` as nonexistent IDs. Do not first fetch globally and expose resource metadata in an error.
- Pagination uses `offset` and `limit` (default 50, maximum 100). Collection endpoints use ascending numeric ID order unless stated otherwise. Revisions sort by ascending revision; runs sort by descending round. Non-ranking lists may change between requests; they are not historical snapshots.
- Ranking uses a POST **read** endpoint so search text stays out of URLs. Search and response bodies must also be excluded from telemetry/logs. Ranking filters never recalculate ranks.
- `security: []` explicitly describes the internal synthetic-data trial. Position scoping enforces context integrity; it is not authentication or tenant authorization. Production identity/security requires a separate scope decision.

### Errors

| HTTP | Representative codes | Client action |
|---|---|---|
| 400 | `invalid_request`, `invalid_manifest` | Fix syntax, field types or manifest mapping |
| 404 | `resource_not_found` | Leave unavailable resource; do not infer other-position membership |
| 409 | `stale_job`, `stale_draft`, `stale_criteria`, `active_run`, `stale_result`, `run_not_current`, `decision_final`, `page_changed`, `idempotency_mismatch`, `request_in_progress` | Refresh relevant state; never silently overwrite/rebase |
| 413 | `batch_too_large`, `request_too_large` | Submit within the documented limits |
| 415 | `unsupported_media_type` | Correct the request Content-Type |
| 422 | `invalid_criteria`, `invalid_run_selection`, `confirmation_required`, `invalid_evidence`, `extraction_refused`, `invalid_schema`, `incomplete_output` | Correct input or use manual criteria entry |
| 429 | `rate_limited` | Respect `Retry-After` |
| 500 | `internal_error` | Show request ID and preserve UI input |
| 503 | `provider_unavailable`, `extraction_timeout`, `service_unavailable` | Respect `Retry-After`; retry only under the rules below |

Example `409` body:

```json
{"code":"stale_result","message":"This result changed. Reload it before deciding.","request_id":"req-demo-01","retryable":false}
```

## 3. Endpoint coverage

Paths below are relative to `/api`; exact parameters and schemas are in the YAML. Every operation also has `x-user-stories` for machine-readable traceability.

| Story / screen | Operations | Observable result |
|---|---|---|
| US-01 / SCR-01,02 | GET/POST `/jobs`; GET/PUT `/jobs/{job_id}` | Create/edit JD, read readiness and filter stored lifecycle |
| US-02 / SCR-03 | POST `/jobs/{job_id}/criteria-suggestions`; GET `/skills` | Evidence-validated suggestions; manual fallback |
| US-03,14 / SCR-03,09 | GET/PUT `/jobs/{job_id}/criteria-draft`; GET/POST `/jobs/{job_id}/criteria-revisions`; GET revision | Save incomplete draft; approve immutable revision |
| US-04,05 / SCR-04 | GET `/jobs/{job_id}/candidates`; POST `/jobs/{job_id}/resume-batches`; GET resumes | Per-file acceptance, duplicate handling and confirmed new versions |
| US-06 / SCR-04,05 | GET resume; POST resume `/reprocess` | Durable extraction state and explicit recovery |
| US-07,08 / SCR-05 | POST/GET screening-runs; GET run and run `/items` | One durable command, progress and separate file failures |
| US-09,10,11 / SCR-06 | POST `/jobs/{job_id}/ranking/query`; GET run result | Backend eligibility, deterministic score and ordering |
| US-12 / SCR-07 | GET result, result `/source`, result `/file` | Snapshot-specific criteria, quotes and original source |
| US-13 / SCR-06,07 | PATCH result `/decision` | Explicit recruiter decision with concurrency protection |
| US-15 / SCR-05,09 | POST screening-runs with `mode=rescore` | Same CV snapshots, new criteria and atomic publication |
| US-16 / SCR-08 | GET screening-runs, revision and historical result/ranking | Original published history remains readable |
| US-17 / SCR-10 | GET `/jobs/{job_id}/comparison` | Compare two published runs within one position |

Eligibility and scoring are worker responsibilities, not endpoints accepting client-provided scores. No public publication, run-status mutation or cancellation endpoint exists.

## 4. Main workflows

### 4.1 Position and approved criteria

1. `POST /jobs` with a fresh `Idempotency-Key` and `{"title":"Backend Developer","jd_raw_text":"Python is required.","level":"Mid"}`. New positions have stored status `draft`; lifecycle is display/filter metadata and does not gate screening. Readiness derives from approved criteria, parsed CVs and active-run state.
2. Request criteria suggestions with `expected_job_version`. Extraction is bounded and synchronous; frontend keeps a loading state and can switch to manual entry after failure. This call returns unapproved suggestions and never overwrites a saved draft. AI supplies neither weights nor scores: adapter prepares editable default weights and marks ambiguous thresholds for review.
3. Save a draft with expected job version, current criteria revision (0 initially) and draft version (0 when absent). Existing drafts require their returned version. Drafts may be incomplete, but schema and kind vocabulary remain valid. `criterion_key` is a stable opaque key maintained across revisions for comparison; new criteria receive new keys.
4. Approve with all three expected values. Lock/check job and draft; reject stale values; validate BR-CRI-01–05; freeze JD, evidence and dictionary version; increment revision; consume draft atomically. Initial revision is 1. Approval does not start screening.

Approval rejects empty sets, non-positive weights, decimal sums other than 100, duplicate canonical skills, unknown skill IDs, more than one experience/education criterion, or invalid thresholds. Skill requires a canonical skill ID and no experience/degree threshold; experience requires `min_years > 0`; education requires a degree. Manual criteria need not have an AI quote. AI-origin evidence must validate against the captured JD. A JD edit makes an old draft stale; reload and explicitly rebase/review it before approval. Previously approved revisions remain unchanged.

### 4.2 Upload, identity and extraction

Upload `multipart/form-data`: repeated binary `files` parts plus an `application/json` `manifest` part. Manifest entries use unique `client_file_id` values and zero-based `file_index`; every file has exactly one entry.

```json
[
  {"client_file_id":"cv-a","file_index":0,"identity_mode":"new_candidate"},
  {"client_file_id":"cv-b","file_index":1,"identity_mode":"new_version","candidate_id":"12","identity_confirmed":true}
]
```

For `new_candidate`, candidate_id is omitted/null and confirmation omitted/false. For `new_version`, a candidate in this position and explicit confirmation are required. Lock candidate/version allocation. Identical content in the same position is always a duplicate and never reassigns candidate identity. Cross-position file reuse is internal: return no other-position identity or history. Name/email similarity never merges records.

Accept at most 200 files, each at most 10,485,760 bytes inclusive. Validate actual PDF/DOCX type. Invalid batch count/manifest rejects the whole command before acceptance. A valid envelope returns 200 with `accepted`, `new_version`, `duplicate` or `rejected` per file; rejected files have safe error codes such as `file_too_large`, `unsupported_file_type` or `invalid_candidate_context`. Acceptance does not mean extraction succeeded.

Stream/stage files under a batch command, validate the full envelope, then commit accepted memberships and durable extraction work. A lost response must replay the same outcomes, not create new candidate versions. Clean up uncommitted staging files after crashes. Infrastructure must allow 200 maximum-size files plus multipart overhead (proposed whole-request cap 2,200,000,000 bytes), with independent per-file enforcement; do not buffer the entire batch in application memory.

Resume states: `uploaded → parsing → parsed` or `parse_failed`. Worker validates the [extraction contract](../requirements/extraction-contract.md), persists the immutable snapshot and source mapping atomically, and reports technical failures separately. A parse-failed file creates no score. Explicit reprocessing is limited to parse-failed resumes; it cannot replace a snapshot already used by a run. Corrupt/textless files require a corrected new upload; OCR is outside scope.

### 4.3 Screening and progress

```json
{"mode":"initial","criteria_revision":1,"resume_ids":["21","22"]}
```

Start with a fresh idempotency key. Validate latest approved revision and the selected parsed CVs in this position. Initial selection is explicit, nonempty and at most 200 unique resume IDs; preserve each explicitly selected CV version as its own snapshot identity. Lock the position, enforce one active run, assign a monotonically increasing round, freeze criteria/policy/CV snapshots and commit durable run/items **before** returning 202. Round allocation includes failed attempts. `initial` means an explicitly selected screening set and can also be used for a later new CV batch; it is distinct from criteria-only rescore.

Poll run/items (suggested two-second interval while visible; back off on failure). Counters are read from one consistent state and sum to total. Resume pending work after process restart using expiring leases; result uniqueness prevents duplicate item results. Technical failures stay in run items, outside the ranking table.

| Run state | Meaning / publication |
|---|---|
| `queued` | Durable command awaiting worker |
| `running` | Items executing/recovering |
| `completed` | All required items succeeded and publication committed |
| `completed_with_errors` | Initial-mode run published successful items; failed items are separate |
| `failed` | No new publication; initial had zero successes, rescore had any failure, or publication failed |

No `cancelled` state is defined. In one publication transaction, finalize run/result states and switch `jobs.published_run_id` and compatibility flags. Readers see all old or all new results. A failed run may have successful internal item results but those are not a published historical ranking.

### 4.4 Ranking, evidence and decisions

POST ranking query `{}` to resolve the current published run; before first publication return an empty ranking with nullable run fields. Ordering is mandatory eligibility descending, **displayed** total descending, numeric resume ID ascending. Exact scores remain available in detail. An absent scoring group has a null score and coefficients are normalized; semantic score is always null. Follow BR-SCR-01–04 for precision and contribution rounding.

For subsequent pages send the returned `run_id` and `decision_epoch` with unchanged filters. Epoch changes after a human decision; mismatches return `409 page_changed` to avoid inconsistent decision-filter pages. A newly published run does not silently change a pinned old run: the response marks it historical. Each response computes items, counts and metadata in one database snapshot. Rank values remain global within the selected run, even when filtered.

Result detail and source/file endpoints require the full scoped path. Detail reads the selected immutable CV/criteria snapshot, including candidate display/contact facts captured for that CV, never current candidate fields. Evidence offsets are zero-based Unicode code-point offsets into the returned source text, end-exclusive; JavaScript viewers must translate them to UTF-16 indices. Render source as text, not HTML. `/source` supports PDF and DOCX; `/file` delivers validated original bytes, uses `nosniff`, and forces DOCX download. Do not expose object keys or public file URLs.

```json
{"decision":"shortlisted","expected_result_version":1,"confirm_failed_mandatory":true}
```

Decision transaction checks current publication, then expected result version, then transition and mandatory confirmation. Only `scored → shortlisted/rejected` is allowed. Increment version and run decision epoch once, stamp decision_at once. An identical decision with the **current** version is a no-op. A stale version conflicts even for the same decision; a different final decision conflicts. No required reason field exists. A lost-response retry must refetch; it cannot silently upgrade the expected version. Decisions use version checks, not an idempotency replay that bypasses stale-data validation.

### 4.5 Rescore and history

```json
{"mode":"rescore","criteria_revision":2,"base_run_id":"31"}
```

The source must be the current published run and the criteria revision must be newly approved relative to that run and current at command acceptance. Do not accept resume_ids for rescore. Freeze exactly the source's successful resume/snapshot identities, its policy, normalization version and extraction as_of_date. Never call AI or recalculate Present dates during criteria-only rescoring. New results start `scored`.

Publish only if **every** required source item succeeds. Otherwise keep the previous published run and all its decisions. Published historical runs remain readable. Comparison requires two distinct published runs in the same position; align by exact resume/snapshot pair, show an absent side explicitly with null score/rank, and calculate right-minus-left deltas only for present pairs. Changing CV version produces separate rows. Comparison reads both sides and decisions in one consistent database snapshot.

## 5. Idempotency and concurrency

Every documented command with `Idempotency-Key` requires an opaque client-generated key of 8–200 characters, generated once per intentional command. Scope by HTTP method + concrete path + key (and principal when authentication is later introduced). Fingerprint normalized JSON; for multipart include ordered file hashes and normalized manifest, never multipart boundaries. Same key/different fingerprint returns 409. Concurrent execution returns `409 request_in_progress`; client waits and retries the same key.

Persist command claim, fingerprint and outcome. After a completed mutation, replay its original status/body without reevaluating current preconditions; the client then refreshes resource state. This is essential when a run has already completed or approval has consumed its draft. Keep mutation command records for the life of their resources in this trial; no silent 24-hour expiry. A rejected command with no side effect can be retried after correction with a new key. Interrupted commands recover or roll back before allowing another executor. A transient provider failure with no mutation may release its claim so the same suggestions request can retry.

Job/draft/result versions are independent positive counters. Zero means “not created yet” only in draft/base-revision requests. Never accept a client-set resource version or status. Use position locks/constraints for publication and active runs, result version predicates for decisions, and unique command/item constraints for retries. Database durability is required; frontend disabling buttons is only an interaction aid.

## 6. Security, operations and quality acceptance

Q10/Q11 apply to handlers, worker, proxy and browser: redact bodies/query search, no raw CV/contact/provider data in errors or logs, no persistent browser storage for sensitive data, and no analytics labels containing those fields. Correlate request/run/item IDs and safe error codes. AI credentials and source redaction maps remain server-only. Sanitize filenames for storage and response headers; file responses use a generic download name. Test cross-position reads/writes/files and browser notifications, not only ranking queries.

API acceptance must include: source-quote validation (Q01), deterministic snapshot replay (Q02), one corrupt file among 42 (Q03), concurrent publication reads (Q04), command replay/restart recovery (Q05), stale and concurrent decisions (Q06), 200-result ranking under the specified Q07 load, and telemetry/storage leakage checks (Q10/Q11). Q08 remains frontend accessibility; Q09 requires database/files/manifest restore rehearsal. These are implementation test obligations, not tests passed by writing this document.

## 7. OpenAPI validation and Swagger viewing

Run from the repository root:

```sh
npx --yes @apidevtools/swagger-cli@4.0.4 validate docs/api/openapi.yaml
```

Open the YAML in a local Swagger Editor/UI installation. A deployed Swagger UI route is not included in this documentation change. “Try it out” needs the future backend. OpenAPI validation checks structure and references; database transactions, semantic evidence and cross-field rules require backend tests. AI JSON schemas use their own JSON Schema dialect and remain separate from OpenAPI 3.0 Schema Objects.

## 8. Persistence mapping and implementation prerequisites

| API concept | Existing design | Required implementation detail / gap |
|---|---|---|
| Position/readiness | jobs, position_resumes | Add metadata `version`, `updated_at`; derive readiness; no lifecycle write endpoint |
| Draft and approval | job_criteria_versions, job_requirements | Add draft edit version and base job version; stable criterion_key across revisions; atomic approval validation |
| Identity/version | candidates, resumes, position_resumes | Candidate lock and version uniqueness; never expose cross-position membership |
| Extraction queue | resumes, resume_snapshots, resume_skills | Durable extraction tasks/leases and attempts are needed before screening, separate from run items; snapshot-local candidate display facts/source mapping |
| Command replay | screening_runs has run idempotency | Durable command/outcome records also needed for uploads, job edits, draft save, approval and reprocess; do not overload run-only keys |
| Run/publication | screening_runs, screening_run_items, screenings | Active-run uniqueness, transactional publication and recovery leases; preserve all frozen inputs |
| Decision pagination | screenings.version | Add run decision_epoch (starts 0), atomically increment on actual decision writes |
| Detail/comparison | screening_details plus immutable snapshots | Preserve criterion keys, original evidence offsets and exact score precision; compare frozen identities |

These gaps are explicit follow-up schema/migration work; this API documentation does not claim the current DBML already defines every operational field/table. ORM choice, detailed three-tier folder structure and class/sequence design are the next implementation-design tasks. They must preserve this contract and the accepted business rules.

[Back to project](../../README.md) · [Architecture](../architecture/README.md) · [Requirements](../requirements/README.md)

## 9. Endpoint behavior details

The OpenAPI file keeps request/response schemas and concise summaries. The following endpoint notes retain the detailed workflow rules. Shared headers, responses and scalar schemas are referenced through components. `required`, `enum` and tag lists use inline YAML for readability.

Error selection: malformed path/query/body values return 400. Read-only lookups do not use 422; comparison retains 422 for invalid run combinations. Listing positions cannot return a resource-level 404. Upload envelope errors use 400/413/415; individual file rejections stay in the 200 outcome. Start-run has no application 429 policy; JD suggestions retain 429 for rate limiting. Reprocessing uses 409 for active/already-parsed state or idempotency conflicts. Shared 500/503 responses remain applicable to storage/database failures on all endpoints; 503 also covers unavailable source files and extraction providers where relevant. Infrastructure-generated errors outside the application are not an exhaustive part of this contract.

### updateJob

`PUT /jobs/{job_id}`

Expected version prevents lost edits. Existing revision/run snapshots stay unchanged. JD change invalidates draft source version; refresh draft before approval. Lifecycle field is forbidden.

### saveCriteriaDraft

`PUT /jobs/{job_id}/criteria-draft`

One draft per position. 0 expected_draft_version creates it; current approved revision and job version must match. Draft permits zero weights and incomplete thresholds. Preserve stable criterion_key across edits; no duplicate keys.

### suggestCriteria

`POST /jobs/{job_id}/criteria-suggestions`

Synchronous bounded extraction of stored JD; does not save/approve a draft. Preserve manual draft on failure. Return 422 invalid_evidence or 503 provider_unavailable; no fabricated fallback data.

### approveCriteria

`POST /jobs/{job_id}/criteria-revisions`

Initial approval creates revision 1, then N+1. Validate nonempty criteria, positive weights summing exactly to 100, no duplicate canonical skills, <=1 experience/education criterion, valid kind thresholds. Freeze JD/evidence/dictionary snapshot. Consumes draft; does not start scoring.

### listPositionCandidates

`GET /jobs/{job_id}/candidates`

Only this position; choose candidate before different-content upload, confirm explicitly. No global search or identity-merge API. Identity/contact data never goes in URL filters.

### listResumes

`GET /jobs/{job_id}/resumes`

Polling returns persisted uploaded/parsing/parsed/parse_failed states. Duplicate upload does not create another membership. Stable order uploaded_at then resume_id.

### uploadResumeBatch

`POST /jobs/{job_id}/resume-batches`

Check batch count and manifest before writing any file. <=200 files, each <=10,485,760 bytes; validate actual format. Individually reject oversized/unsupported files while accepting others. Accepted files enqueue durable extraction. new_version requires candidate_id and identity_confirmed=true in current position; new_candidate forbids candidate_id. Same hash/current position reports duplicate; reuse across positions reveals no other-position data. Full details in README.

### startRun

`POST /jobs/{job_id}/screening-runs`

Returns only after durable run/items commit. Initial mode requires latest approved revision and parsed, position-associated resumes. Rescore requires current published base, newly approved revision and unchanged policy; server freezes exact successful CV snapshots. One active run per position. Idempotent replay returns same run before applying current prerequisite checks. No cancel endpoint.

### getRun

`GET /jobs/{job_id}/screening-runs/{run_id}`

Counts total = pending+processing+succeeded+failed. Poll every 2 seconds with backoff. First screening may completed_with_errors; no successes fails without publication. Rescore publishes only if all source items succeed.

### queryRanking

`POST /jobs/{job_id}/ranking/query`

Read-only query via POST to keep candidate search text out of URLs (Q11). Default order eligibility DESC, displayed total DESC, resume_id ASC. Pin run and decision_epoch for subsequent pages. An old but published run remains readable; is_current=false disables decisions. Failed files are summarized outside items.

### getResult

`GET /jobs/{job_id}/screening-runs/{run_id}/results/{result_id}`

Published runs only. Validate full position/run/result/snapshot association. Historical detail reads frozen source. Source-file unavailability does not hide stored analysis. Semantic always null.

### getResultSource

`GET /jobs/{job_id}/screening-runs/{run_id}/results/{result_id}/source`

Text preview maps evidence for PDF or DOCX. Never serve executable document HTML. 503 source_unavailable is distinct from missing evidence.

### getResultFile

`GET /jobs/{job_id}/screening-runs/{run_id}/results/{result_id}/file`

Server resolves private object key after full scoped lookup. PDF inline or DOCX attachment; use source endpoint for DOCX in-app viewing. No arbitrary path or public bucket URL. File errors leave analysis readable.

### recordDecision

`PATCH /jobs/{job_id}/screening-runs/{run_id}/results/{result_id}/decision`

Lock position; check published run and expected result version first. D-05 permits scored->shortlisted/rejected only. Same current-version decision is unchanged success; stale version is 409 even for same value. Different final decision is 409 decision_final. Shortlisting failed eligibility requires confirm_failed_mandatory=true. Does not modify scores, evidence or eligibility. Successful change increments decision_epoch for run pagination.

### compareRuns

`GET /jobs/{job_id}/comparison`

Both runs must be distinct and belong to this position; may be any published history. Missing side is explicit. Only score/rank/eligibility and criteria changes are compared; decision states are returned for context, never transferred.

### reprocessResume

`POST /jobs/{job_id}/resumes/{resume_id}/reprocess`

Only parse_failed resumes without a validated snapshot can be queued again. Corrupt/textless input requires a corrected upload. Lock the resume and persist one extraction task before 202. Parsed/active resumes conflict. Never mutate a snapshot used by a run. Same idempotency key replays the outcome.


## 10. Cross-field schema rules

### Evidence

Offsets are Unicode code point offsets [start,end) into frozen original source text. Require end > start and exact quote matching. For draft/suggestion JD evidence source_id identifies the captured job version as a string within job context; after approval it identifies the immutable criteria-version row. CV source_id identifies resume_snapshots.id.

### RunInput

initial requires resume_ids and forbids base_run_id. rescore requires base_run_id and forbids resume_ids: the server derives exactly the successful source set and policy. Cross-field violations are 422. Initial mode requires resume_ids and forbids base_run_id; rescore requires base_run_id and forbids resume_ids. Preserve each explicitly selected CV version as its own snapshot identity.

### RankingQuery

Search is in POST body, never URL/analytics. Server searches candidate/file display text inside the selected run. offset>0 requires explicit run_id and decision_epoch from first response; mismatch returns 409 page_changed. Offset 0 may omit run_id to resolve current published run.
