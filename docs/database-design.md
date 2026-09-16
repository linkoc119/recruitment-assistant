# Database design — CV screening and ranking

Version 3.0 · 2026-09-16 · Proposed schema, not a deployed database.

[DBML source](../sang-loc-xep-hang-v2.dbml) · [ERD PNG](database-design-erd.png)

The retained v2 filename is a stable repository link. The current model has 13 tables and covers the screening subsystem only. DBML defines columns, enums, checks, indexes and composite foreign keys. This document specifies the cross-row invariants required when implementing PostgreSQL migrations and services. No backend or applied migration is claimed.

## Tables and requirement coverage

| Tables | Responsibility | Requirements |
|---|---|---|
| jobs | Original JD, display/filter lifecycle, approved revision and published run pointers | US-01, Q11 |
| job_criteria_versions, job_requirements | Draft editing and immutable approved criteria, thresholds and JD evidence | BR-CRI-01–05 |
| skills | Canonical vocabulary; aliases remain versioned configuration | BR-EVD-02 |
| candidates, resumes | Identity and immutable file versions; identity review follows D-02 | BR-CV-01–03 |
| position_resumes | Accepted CV membership before any screening | US-04–05, Q11 |
| resume_snapshots, resume_skills | Immutable validated extraction and normalized skill facts | US-06, BR-EVD-01–03 |
| screening_runs, screening_run_items | Frozen inputs, durable processing, failures, idempotency and source-run reuse | BR-RUN-01–04, BR-RSC-01–02 |
| screenings, screening_details | Successful scores, evidence, decisions and historical comparison | BR-SCR, BR-RNK, BR-DEC, BR-RSC-03–04 |

Position status is stored as draft/open/closed, with draft as the creation default. No status-transition operation exists in v1 and this status does not gate screening.

## Constraints beyond portable DBML

The following PostgreSQL indexes are required in a future migration, in addition to the DBML indexes:

```sql
CREATE UNIQUE INDEX ux_active_run_per_job
ON screening_runs (job_id) WHERE status IN ('queued', 'running');

CREATE UNIQUE INDEX ux_latest_result_per_cv
ON screenings (job_id, resume_id) WHERE is_latest;

CREATE UNIQUE INDEX ux_single_experience_criterion
ON job_requirements (criteria_version_id) WHERE kind = 'experience';

CREATE UNIQUE INDEX ux_single_education_criterion
ON job_requirements (criteria_version_id) WHERE kind = 'education';
```

Composite foreign keys enforce matching position, criteria revision and CV across run/item/result relationships. They do not prove that a referenced run is published or a revision is approved. Those state checks belong to the transactions below, with database triggers or restricted write procedures protecting immutable records in the implementation. Cross-row validation cannot be replaced by a row CHECK.

- **Approval (BR-CRI):** lock the position and verify expected revision. Draft weights may be zero; approval requires at least one criterion, all weights positive and sum exactly 100. Validate kind/threshold, unique canonical skills and evidence. Freeze the revision and its criteria, set approved_at and update jobs.criteria_revision atomically. First approval is revision 1; later approval is N+1. Concurrent draft/approval requests cannot allocate the same revision. Once approved, prohibit UPDATE/DELETE of criteria content.
- **Upload (BR-CV, Q11):** accept at most 200 PDF/DOCX files of at most 10 MB each, validating actual format. Resolve candidate identity without automatic name/email merging; an unresolved identity record may have NULL name/contact fields until extraction or review. Hash reuse is internal: attach an existing file through position_resumes without exposing another position's metadata. Duplicate membership returns the existing association. Immutable file content/object key/hash/version must not be overwritten.
- **Extraction:** store only schema- and evidence-validated snapshots. Freeze resume_snapshots and their resume_skills together. A parsed CV has a validated snapshot; a technical failure has an error code, not a synthetic score. Re-extraction creates another snapshot, never changes an old one.
- **Run creation:** lock the position, validate an approved revision, CV membership and the active-run constraint. Bind the idempotency key to position and normalized payload hash. Same key/payload returns the same logical run; a changed payload conflicts. Insert all selected items before committing. Initial runs reuse a valid selected snapshot or assign one after extraction; snapshot_id becomes immutable once assigned. Rescore uses precisely the successful base-run (resume_id, snapshot_id) pairs and the same policy snapshot; validate the published source and newly approved revision. Freeze run inputs and item membership.
- **Processing:** lease acquisition/reclaim increments lease_token. Every item/result write checks owner/token/expiry in a transaction. Counts derive from item states, avoiding independently mutable totals. Store a staged result and mark its item succeeded atomically; failed items have no result. Persist reason codes, not raw CV/contact data in errors.
- **Publication:** lock the position and validate the lease, terminal items and expected base pointer. Initial screening may publish successful items if at least one succeeds; rescore must succeed for every required source item. Finalize rank, run status and published_at, clear prior latest flags, set new latest flags, and update jobs.published_run_id in one transaction. Failure rolls back the switch and preserves the previous ranking. Completion with errors is permitted only for initial screening. A published run and its results remain immutable except for current-result human decisions.
- **Ranking:** read via jobs.published_run_id, or an explicit historical published run. Sort passed_mandatory DESC, displayed_total DESC, resume_id ASC. rank_in_job is the resulting position within that run, and scored_round equals run.round. is_latest is a compatibility projection, not an independent source. Full-precision numeric calculations and displayed two-decimal values are distinct; allocate displayed contributions using BR-SCR-04.
- **Decision:** verify job/run/result association, published pointer and expected result_version under the same position lock used for publication. Apply only the requested human decision, set decision_at and increment version. A stale request conflicts. New results start scored with no decision timestamp, including rescoring. Historical decisions remain attached to their original results.
- **History/comparison:** read stored snapshots only. Compare published runs within the same position by CV/snapshot identity; absence is explicit, not a zero score. Do not join mutable candidate facts into historical scoring explanations.

## Snapshot and evidence contracts

JSON fields are typed application contracts, not arbitrary AI output. Validate before storage:

| Field | Required content |
|---|---|
| resume_snapshots.extraction | Validated employment periods and non-overlapping months, education level or explicit missing evidence, extracted skill facts, and source mapping to the original file version. Contact redaction mapping must preserve valid source spans. |
| resume_skills.evidence | Array of quotes, page/paragraph and start/end offsets into snapshot raw_text, with evidence-of-use classification. Empty array means no validated evidence. |
| job_requirements.jd_evidence | For AI suggestions, quote and source offsets into the revision jd_snapshot; manual criteria may omit it. |
| screening_runs.policy_snapshot | Version, group coefficients, formulas/match values, degree order, missing-data rules, rounding and stable ordering. Semantic scoring is disabled in v1. |
| screening_details.evidence | Array of source snapshot IDs, quotes, page/paragraph and offsets. Every ID must equal the selected run item's snapshot and every quote must match the source. Empty array accompanies missing evidence, with a separate reason. |

Experience and education used for scoring belong to the extraction snapshot, not the editable candidate identity. Degree thresholds use the ordered lookup vocational → college → bachelor → master → doctorate. The normalized resume_skills projection and extraction payload must agree and be inserted atomically.

## Privacy and history preservation

Q11 is enforced by scoped service/repository queries and response handling as well as relational membership. A private object key, hash, or valid resource ID alone is insufficient: validate position/run/result/CV associations before resolving a file or returning data. Raw CV/contact data stays out of URLs, telemetry labels, notifications, client errors and persistent browser storage. Sensitive responses use Cache-Control: no-store.

All historical foreign keys use RESTRICT rather than cascade-delete. Ordinary criteria edits never delete historical evidence. This is not an indefinite retention policy: any later authorized erasure must consistently address database snapshots, files and backups under an agreed policy.

## Rendering and validation

Run `node docs/render-erd.cjs` to generate Mermaid ER source directly from the DBML table columns and foreign keys. The overview collapses parallel composite foreign keys between the same pair of tables; exact columns, checks, indexes and enum members remain in DBML.

Render with Mermaid CLI:

```powershell
npx.cmd --yes @mermaid-js/mermaid-cli -i docs/database-design-erd.mmd -o docs/database-design-erd.svg -b white
npx.cmd --yes @mermaid-js/mermaid-cli -i docs/database-design-erd.mmd -o docs/database-design-erd.png -b white -s 2
```

If using an installed Chrome instead of Puppeteer's browser, supply `-p` with a local Puppeteer configuration containing its executablePath. Generated SQL from DBML is a syntax check and starting point only: it does not include the partial indexes or transaction/immutability enforcement above.
