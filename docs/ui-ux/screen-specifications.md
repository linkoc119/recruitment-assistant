# Screen Specifications

Version 1.0 · 2026-09-15

These specifications describe target behavior. Routes are proposals; screen IDs and requirement references are stable design identifiers. Shared interaction, accessibility, and responsive requirements are defined in [Interaction and UI/UX Rules](interaction-rules.md).

## Shared screen anatomy

Every position-scoped screen uses this order:

1. breadcrumb and position context;
2. screen title, status, and concise purpose;
3. alerts for stale data, active runs, partial failures, or unsaved edits;
4. primary content and contextual actions;
5. persistent or sticky action area only when a form has a clear completion action.

Primary actions appear once per screen state. Technical identifiers are shown only in history/detail contexts where they support auditability.

---

## SCR-01 — Position List

| Attribute | Specification |
|---|---|
| Purpose | Let the recruiter find an existing position or begin a new screening workspace |
| Stories / use cases | US-01 / UC-01 |
| Entry | Product start; return from a position workspace |
| Exit | SCR-02 for create/edit; selected position workspace |
| Primary action | Create position |
| Secondary actions | Open position; search; filter by lifecycle; sort |
| Main NFR | Q08 |

### Layout and content

- Page header with title, one-sentence scope, and Create position.
- Contextual search and status filter; no global candidate search.
- Position table/cards showing title, optional level, CV-ready count, published-run status/time, shortlist count, and position lifecycle.
- Row action reflects readiness: Continue setup, View CVs, View progress, or View ranking.

### States

| State | Required presentation |
|---|---|
| Empty | Explain the JD-to-ranking workflow and offer Create position |
| Loading | Stable row skeletons with the header/action available |
| Results | Show actual positions; disabled actions must explain missing prerequisites |
| No search match | Preserve filters and offer Clear filters |
| Load failure | Explain failure and offer Retry; do not show a fabricated empty state |

### Acceptance notes

- Creating a position opens a real SCR-02 form.
- Opening one row establishes the position context used by every workspace screen.
- Search/filter state must not change position data.
- Lifecycle uses the stored `draft`, `open`, or `closed` value for display and filtering only. SCR-01 provides no lifecycle transition action in v1.

---

## SCR-02 — Create or Edit Position and JD

| Attribute | Specification |
|---|---|
| Purpose | Capture the position context and preserve the original JD |
| Stories / use cases | US-01 / UC-01 |
| Entry | Create position from SCR-01; Edit position action from the workspace context |
| Exit | SCR-03 after save; prior screen on cancel |
| Primary action | Save and review criteria |
| Secondary actions | Save draft; cancel |
| Main rules/NFR | US-01 AC; Q08 |

### Fields

| Field | Requirement | Validation/presentation |
|---|---|---|
| Position title | Required | Trim whitespace; inline error and summary link |
| Original JD | Required | Large plain-text area; preserve exact saved content |
| Level | Optional position metadata | Matches the stored job level (junior/middle/senior); must not become a scoring criterion automatically |

### Behavior and states

- New mode starts blank; edit mode loads the saved position and JD.
- Save failure leaves all entered values intact and focuses the error summary.
- Leaving with edits opens a discard/stay dialog.
- After save, show the saved timestamp and transition to criteria review.
- Editing the JD after an approved revision must explain that existing revisions/runs stay unchanged and a new draft is needed.

---

## SCR-03 — Criteria Review and Approval

| Attribute | Specification |
|---|---|
| Purpose | Turn AI suggestions or manual input into approved criteria revision 1 |
| Stories / use cases | US-02, US-03 / UC-02, UC-03 |
| Entry | SCR-02; Criteria workspace tab before revision 1 |
| Exit | SCR-04 after approval; remain with draft |
| Primary action | Approve criteria |
| Secondary actions | Generate/retry suggestions; add criterion; save draft; reset suggestion |
| Main rules/NFR | BR-CRI-01, BR-CRI-02, BR-CRI-03, BR-CRI-04, BR-CRI-05, BR-EVD-01; Q08, Q10 |

### Layout

- Split workspace on wide screens: original JD/evidence on the left, editable criteria on the right.
- On narrow screens: criteria first, with a clearly labeled action to open the referenced JD passage.
- Draft banner states whether criteria came from AI suggestion, manual entry, or both.
- Validation summary remains visible near the approval action.

### Criterion editor

Each row contains stable criterion label, kind, mandatory/preferred, weight, kind-specific threshold, source evidence, and remove action. Supported kinds are skill, experience, and education.

Rules:

- show the running weight total and require exactly 100 for approval;
- reject duplicate canonical skills;
- permit at most one experience and one education criterion in policy v1;
- require positive experience threshold and a degree level when applicable;
- allow weight 0 in a draft but block approval;
- explain that experience/education weight does not change the policy-v1 score;
- never label an AI suggestion as approved until the recruiter confirms it.

### States

| State | Required presentation |
|---|---|
| Generating | Keep JD readable; show cancellable/non-blocking progress if supported |
| Suggested draft | Mark as unapproved; evidence links available |
| Manual draft | Full editor available without AI output |
| Suggestion failure | Explain failure without losing JD; highlight manual path |
| Invalid draft | Inline errors plus summary; approval disabled or rejected accessibly |
| Saving/approving | Prevent duplicate submission; retain visible criteria |
| Approved | Show revision 1 and approval time; continue to CVs |

---

## SCR-04 — CV Workspace

| Attribute | Specification |
|---|---|
| Purpose | Upload CVs and prepare a transparent valid set for screening |
| Stories / use cases | US-04, US-05, US-06 / UC-04, UC-05 |
| Entry | Position workspace; after criteria approval |
| Exit | SCR-05 when prerequisites are satisfied |
| Primary action | Continue to screening |
| Secondary actions | Select/drop files; remove unsubmitted file; filter; retry supported processing |
| Main rules/NFR | BR-CV-01, BR-CV-02, BR-CV-03, BR-EVD-01, BR-EVD-02, BR-EVD-03; Q03, Q08, Q10, Q11 |

### Upload area

- Accept text-layer PDF and DOCX as the proposed v1 formats.
- State maximum 10 MiB (10,485,760 bytes) per file and 200 files per batch before selection.
- Validate batch count and each file's actual format/size.
- Preserve the selection when the batch exceeds the limit so the recruiter can reduce it.

### File table

Columns: file name, candidate when known, CV version/outcome, uploaded time, processing status, reason, and available action. Filters: All, Uploaded/Parsing, Ready, Duplicate, New version, Failed.

Required distinctions:

- duplicate content points to the reused record and is not counted twice;
- a new version identifies the prior version without overwriting it;
- parse failure states the technical cause and is not shown as failed eligibility;
- ambiguous identity does not auto-merge from name alone;
- D-02: before submitting a different-content file, offer New candidate or Attach as new CV version. The latter selects a candidate already associated with this position and requires confirmation showing its existing CV/version. Cancel leaves the upload unsubmitted; no global identity search or later history-rewriting merge is provided.
- no OCR action is offered in v1; a scanned PDF is labeled as requiring external reprocessing.

### Summary and states

Show selected, accepted, ready, processing, duplicate, new-version, and failed counts. The screening action uses the actual ready set and explains why it is unavailable when criteria or CV prerequisites are missing.

---

## SCR-05 — Screening Run

| Attribute | Specification |
|---|---|
| Purpose | Confirm frozen inputs, start a first run or rescore, and monitor it to a terminal state |
| Stories / use cases | US-07, US-08, US-15 / UC-06, UC-07, UC-14 |
| Entry | CV Workspace; active-run link; rescore confirmation from SCR-09 |
| Exit | SCR-06 after publication; SCR-08 for completed/failed history |
| Primary action | Start screening or Open published ranking, depending on state |
| Main rules/NFR | BR-RUN-01, BR-RUN-02, BR-RUN-03, BR-RUN-04, BR-RSC-01, BR-RSC-02; Q03, Q04, Q05, Q08, Q10 |

### Pre-start state

Show a review card with position, run type (initial/rescore), approved criteria revision, scoring policy, CV count, excluded failures/duplicates, and source run for rescoring. Link each item back to its workspace.

The confirmation states:

- inputs become frozen for this run;
- initial runs can publish successful items with disclosed file failures;
- rescoring requires the entire source set to succeed;
- decisions from the source run do not carry forward.

### Progress state

Show run status, start time, elapsed time, and counts for total, pending, processing, succeeded, and failed. A per-item table shows the CV version, phase, status, and recruiter-readable error. Processing continues when the recruiter leaves the screen.

### Terminal states

| State | Result and action |
|---|---|
| Completed | New run is published; open ranking |
| Completed with file errors | Initial-run successes are published; inspect failed files or open ranking |
| Failed initial run | No new ranking; return to CVs or inspect errors |
| Failed rescore | Previous ranking remains current; inspect errors/history |
| Interrupted/recovering | State that recovery is in progress; do not create a replacement run from reload |

Repeated start submissions show the existing logical run. Technical queue/lease/retry details do not appear in user copy.

---

## SCR-06 — Published Ranking

| Attribute | Specification |
|---|---|
| Purpose | Present one consistent published run and direct the recruiter to evidence-based review |
| Stories / use cases | US-09, US-10, US-11 / UC-08, UC-09 |
| Entry | Workspace Ranking; successful publication; return from result detail |
| Exit | SCR-07, SCR-08, or SCR-09 |
| Primary action | Contextual: Review selected result or Create criteria revision |
| Main rules/NFR | BR-ELG-01, BR-ELG-02, BR-SCR-01, BR-SCR-02, BR-SCR-03, BR-SCR-04, BR-RNK-01, BR-RUN-03, BR-RUN-04; Q02, Q04, Q07, Q08, Q11 |

### Header and run context

Show position, “Current published ranking,” run label/ID, criteria revision, completion time, policy v1, successful result count, and technical failure count. If a newer run is active, show a non-blocking banner linking to SCR-05 while this ranking remains unchanged.

### Ranking table

Columns: rank, candidate/CV version, mandatory eligibility, match score, key matched/missing criteria, recruiter decision, and actions.

- mandatory-pass group appears first;
- a labeled separator precedes results that failed mandatory eligibility;
- technical failures are summarized outside the ranking table;
- ordering follows BR-RNK-01 and remains stable;
- semantic score is absent or explicitly “Not applied,” never a measured bar;
- shortlist/reject never changes score, rank, eligibility, or evidence.

### Search/filter behavior

Search candidate/file text within the current run. Filters cover mandatory eligibility and recruiter decision. Sorting may expose supported views, but the default/published rank remains visible and cannot be silently redefined.

### States

Loading, no published run, completed, completed with file errors, active newer run, no filter match, and read failure must be distinguishable. Pagination or incremental loading preserves the run context and published rank.

---

## SCR-07 — Candidate Result and Evidence

| Attribute | Specification |
|---|---|
| Purpose | Verify one result against its frozen criteria and CV source, then record a human decision |
| Stories / use cases | US-12, US-13 / UC-10, UC-11, UC-12 |
| Entry | Candidate/result link from SCR-06 or SCR-08 |
| Exit | Exact source ranking/history context; next/previous result in the same run |
| Primary action | Shortlist or Reject, according to current state and action intent |
| Main rules/NFR | BR-EVD-01, BR-EVD-02, BR-EVD-03, BR-DEC-01, BR-DEC-02, BR-DEC-03, BR-DEC-04, BR-DEC-05, BR-RSC-03; Q01, Q06, Q08, Q11 |

### Context header

Show candidate, CV version/file, position, selected run, criteria revision, mandatory eligibility, match score, published/historical status, and recruiter decision. A historical badge prevents the user from mistaking an old result for the current one.

### Main layout

Wide layout uses two synchronized panes:

- analysis: component scores, per-criterion status/reason/contribution, and decision controls;
- source: correct CV version with evidence location highlighting.

Narrow layout stacks analysis before source and provides a return anchor from evidence to the selected criterion.

### Criterion row

Each row shows criterion snapshot label/type, mandatory/preferred, matched/partial/missing, reason, configured weight, maximum contribution where useful, actual contribution, and evidence link or “No sufficient evidence.” Weight and maximum contribution must not be conflated.

### Evidence behavior

- Selecting evidence focuses and highlights the exact mapped source passage.
- If mapping is invalid, do not display the generated quote as valid evidence.
- If the file cannot load, retain analysis and show a source-preview error.
- Explanations remain consistent with stored calculations and do not introduce unsupported claims.

### Decision behavior

- Shortlisting a failed-mandatory result lists failed criteria and requires confirmation.
- Rejecting a high-scoring/passing result remains allowed after confirmation.
- Save failure retains the intended action and does not show success.
- A stale/conflicting write is rejected and offers to open the current result.
- Historical runs are read-only for decisions.
- D-05: only scored results in the current run expose shortlist/reject actions. Once decided, display the saved decision without undo/switch controls. Identical current-version retries preserve the original saved state.

---

## SCR-08 — Run History

| Attribute | Specification |
|---|---|
| Purpose | Let the recruiter inspect immutable prior screening runs and choose runs for comparison |
| Stories / use cases | US-16 / UC-15 |
| Entry | Position workspace; Ranking history action; failed-run link |
| Exit | Historical SCR-07, SCR-09, SCR-10, or SCR-05 for active run |
| Primary action | Compare selected runs when two eligible runs are selected |
| Main rules/NFR | BR-DEC-05, BR-RSC-03; Q01, Q08 |

### Run table/timeline

Show run label/ID, round, type, criteria revision, started/completed time, status, total/succeeded/failed counts, published/current marker, source run, and View action.

History includes failed and superseded runs, with clear distinctions:

- published/current;
- published/historical;
- completed with file errors;
- failed and never published;
- active.

Opening a run shows its frozen inputs and results. It never rebuilds history from current criteria or CV data. Decision states remain visible but historical decisions are not editable.

### Comparison selection

Only two published runs from this position can be selected. With fewer than two runs, keep history fully usable and explain that comparison becomes available later.

---

## SCR-09 — Create Criteria Revision

| Attribute | Specification |
|---|---|
| Purpose | Create approved revision N+1 without changing an earlier revision or starting a run automatically |
| Stories / use cases | US-14 / UC-13 |
| Entry | Criteria workspace, Ranking, or Run History |
| Exit | SCR-05 rescore review after approval; cancel to source context |
| Primary action | Approve new revision |
| Secondary actions | Add/remove/reset criterion; cancel |
| Main rules/NFR | BR-CRI-01, BR-CRI-02, BR-CRI-03, BR-CRI-04, BR-CRI-05, BR-RSC-01; Q08 |

### Layout and differences

Reuse the criterion editor from SCR-03, but add:

- base revision and creation context;
- a change summary by stable criterion identity;
- before/after mandatory status, threshold, and weight;
- policy-v1 notices for changes that do not affect score;
- explicit statement that current rankings remain based on their original revision.

After approval, show revision N+1 and route to SCR-05 for a separate rescore confirmation. If the base revision became stale, reject overwrite and offer to reload/compare the newer revision.

---

## SCR-10 — Run Comparison

| Attribute | Specification |
|---|---|
| Purpose | Explain differences in score, rank, and mandatory eligibility between two published runs |
| Stories / use cases | US-17 / UC-16 |
| Entry | Two selected runs in SCR-08; compare action from ranking/history |
| Exit | Either run/result or Run History |
| Primary action | None required; comparison is an inspection task |
| Main rules/NFR | BR-RSC-04; Q08 |

### Comparison header

Show position and left/right run cards with run label, criteria revision, time, policy, successful-result count, and published/historical state. Allow swapping sides without changing data.

### Change summary

Show:

- number moving into/out of mandatory-pass group;
- score/rank increases and decreases;
- criteria added, removed, or changed;
- CVs present in only one run;
- technical differences that make the runs not criteria-only, if applicable.

### Candidate comparison table

Align rows to the correct CV snapshots. Columns include candidate/CV, rank left/right/delta, score left/right/delta, mandatory eligibility left/right, changed criterion reasons, and links to each historical result.

Do not:

- fabricate zero score/rank for absence;
- compare runs from different positions;
- imply causality beyond changed criteria and stored evidence;
- alter either run or its decisions.

### States

Invalid selection, loading, comparison ready, no changed results, partial membership difference, and read failure each have explicit messages and a path back to Run History.

---

## Screen-level traceability summary

| Screen | Stories | Business-rule groups | Quality requirements |
|---|---|---|---|
| SCR-01 | US-01 | — | Q08 |
| SCR-02 | US-01 | — | Q08 |
| SCR-03 | US-02, US-03 | Criteria, Evidence | Q08, Q10 |
| SCR-04 | US-04, US-05, US-06 | CV, Evidence | Q03, Q08, Q10, Q11 |
| SCR-05 | US-07, US-08, US-15 | Run, Rescore | Q03, Q04, Q05, Q08, Q10 |
| SCR-06 | US-09, US-10, US-11 | Eligibility, Scoring, Ranking, Run | Q02, Q04, Q07, Q08, Q11 |
| SCR-07 | US-12, US-13 | Evidence, Decision, History | Q01, Q06, Q08, Q11 |
| SCR-08 | US-16 | Decision history, Rescore history | Q01, Q08 |
| SCR-09 | US-14 | Criteria, Rescore | Q08 |
| SCR-10 | US-17 | Comparison | Q08 |

Back to the [UI/UX index](README.md).
