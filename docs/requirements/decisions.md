# Decisions D-01–D-05

Version 1.0 · 2026-09-16 · Product decisions accepted by the project owner.
Implementation and integration acceptance remain outstanding. D-04 estimates are provisional, not a sprint commitment.

## D-01 — Extraction provider and contract

Use OpenAI GPT-4o mini for JD/CV extraction through a server-side adapter. The initial reproducible model configuration is `gpt-4o-mini-2024-07-18`; do not silently switch models if unavailable. Persist actual model, prompt, schema and parser versions in snapshots. No API call is made by this documentation change.

Use Chat Completions with `response_format.type=json_schema` and `strict:true`. GPT-4o mini supports Structured Outputs; schema conformance does not prove factual correctness. See [model documentation](https://developers.openai.com/api/docs/models/gpt-4o-mini) and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

The internal contract is specified in [extraction-contract.md](extraction-contract.md). It precedes, but does not replace, the future application OpenAPI document. No scores, ranking, eligibility verdict or human decisions are requested from the model.

Evaluate against self-authored synthetic JD/CV data and annotated expected facts. Start with [synthetic cases](fixtures/extraction-cases.json). Before integration acceptance, expand these into text-layer PDF and DOCX fixtures, add corrupt/scanned-file and 42-file batch cases, and record real model outputs separately from hand-authored gold data. Text fixtures alone do not prove PDF/DOCX parsing or AI integration. Acceptance requires every stored quote to map to the correct source, rejection of fabricated evidence, and correct handling of missing data and technical failures; record extraction precision/recall and review discrepancies before approving integration.

## D-02 — Identity, duplicates and CV versions

- Identical content in the same position returns its existing membership and reports duplicate; no new file/version/item.
- Identical content in another position may reuse the stored file internally and create a new position_resumes link. Never disclose which other position has the file, its candidates or historical results.
- Different content is not automatically merged based on name, email or phone. Default to a separate provisional candidate identity.
- In SCR-04, before accepting a different-content upload, the recruiter may select an existing candidate from the current position and choose **Attach as new CV version**. Show the selected candidate and existing file/version, require confirmation, and send the selected candidate ID with upload. Cancel keeps the file unsubmitted; choosing **New candidate** creates a separate identity. No global candidate search or administration screen is added.
- Backend validates candidate membership in the requested position and allocates the next version under a candidate lock/unique constraint. The recruiter choice is authoritative identity confirmation, not a model decision.
- The confirmation applies to the new upload only. It never moves an already-used resume to another candidate or rewrites historical snapshots. Cross-position linking of different-content CVs and later merging existing identities are outside v1.

## D-03 — File limits and experience normalization

Limits: at most 200 files per batch, at most **10,485,760 bytes per file**, inclusive. UI wording is **10 MiB (10,485,760 bytes)**. Check actual PDF/DOCX type rather than extension; reject oversized batches as a whole before accepting files. Corrupt/textless PDFs are technical failures; OCR is outside v1.

Date normalization version: `months-v1`.

- Preserve the raw start/end strings and evidence. Accept unambiguous ISO dates, YYYY-MM and explicit month/year forms. Ambiguous numeric dates and year-only dates remain missing evidence; do not invent January or December.
- Normalize known endpoints to month boundaries and use half-open intervals [start_month, end_month). Thus Jan 2022–Jan 2023 is 12 months; the same month is 0. Days are ignored once the date is unambiguous. Show the month-based policy where duration is explained.
- At initial extraction capture a server UTC `as_of_date` in the validated snapshot. Present/current employment ends at the first day of that month, counting only prior months. For example, Jan 2024–Present at 2026-09-16 is 32 months.
- Reject reversed or future intervals as insufficient evidence. Missing/ambiguous intervals contribute no invented months and must be reported explicitly. The union of valid intervals gives supported months; overlapping work is counted once.
- Experience years = supported months / 12. Retain months as the source value, not a rounded candidate-level decimal. A bare “5.3 years” is not parsed as five years three months and does not replace evidenced periods.
- If supported months already reach the threshold, they can prove it despite additional ambiguous periods. Otherwise report insufficient supported duration, not proof the person lacks experience.
- Criteria-only rescore reuses the exact snapshot, normalization version and as_of_date; it never recalculates Present using today's date.

## D-04 — Provisional sizing and delivery slices

Assumption for sizing only: one developer familiar with the stack; one person-day is focused effort. Include code, relevant tests and review/fixes. Exclude waiting for credentials, deployment setup and learning an unfamiliar stack. Estimates must be revised after OpenAPI and folder design; no team capacity or sprint length has been provided.

| Story | Person-days | Assessment / next slice |
|---|---:|---|
| US-01 | 1–2 | One position/JD creation and read/filter outcome |
| US-02 | 2–4 | Suggested criteria with validated evidence and manual fallback |
| US-03 | 2–3 | Edit/approve valid immutable criteria |
| US-04 | 2–3 | Batch acceptance and per-file validation |
| US-05 | 2–4 | Duplicate handling and confirmed CV version upload |
| US-06 | 5–8 | Split: 06a evidenced text-PDF extraction (3–5), 06b DOCX support (2–3); each includes failure reporting |
| US-07 | 2–3 | One durable idempotent run |
| US-08 | 4–6 | Split: 08a progress/per-file failures (2–3), 08b resume progress after restart (2–3) |
| US-09 | 1–2 | Mandatory eligibility against synthetic snapshots |
| US-10 | 2–3 | Deterministic scores/contributions/rounding |
| US-11 | 2–3 | Consistent published ranking |
| US-12 | 3–5 | Evidence detail and source viewer; split by format if necessary |
| US-13 | 1–2 | Final decision, confirmation and conflicts |
| US-14 | 1–2 | New criteria revision preserving history |
| US-15 | 4–6 | Split: 15a rescore exact source set (2–3), 15b recovery and failure-preserved publication (2–3) |
| US-16 | 1–2 | Historical published-run inspection |
| US-17 | 2–3 | Same-position comparison with explicit absence |

Child slices retain parent IDs for traceability and are planning units, not new unrelated stories. US-08/15 are not complete until recovery/failure acceptance criteria pass; slice 15a must still preserve the old ranking on ordinary failure and never publish partial rescores. US-06 is not complete until both supported formats pass. Shared repository/transaction infrastructure is estimated once during detailed planning, not independently in every story.

Confirm sprint fit only after API contracts, dependencies, owner availability and sprint length are known. Estimates do not assert that every story is ready now.

## D-05 — Final human decisions in v1

Allow only `scored → shortlisted` or `scored → rejected` on the currently published run and expected result version. No undo to scored and no switch between shortlisted/rejected in v1. UI shows the saved decision and removes editing actions.

Same decision repeated with the current version may return the existing state without incrementing version or replacing decision_at. A stale version conflicts even if the requested value is the same. A different decision on an already-decided result returns a conflict with safe error code `decision_final`. Invalid decision values fail validation. Historic results are read-only. New runs start scored and do not inherit decisions.

[Back to requirements](README.md)

