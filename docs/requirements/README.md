# Part 1 — Requirements and INVEST User Stories

Application API: [OpenAPI 3.0.3](../api/openapi.yaml) and [contract guide / story mapping](../api/README.md). Backend implementation and contract acceptance tests remain pending.

Version 1.1 · 2026-09-15 · **Requirements for the proposed solution, not implemented capabilities.**

## 1. Basis and scope

[arc42](../architecture/arc42.md) is authoritative for scope and scoring policy v1. This document turns F01–F06 into independently testable slices of value; prototype behavior and sample scores are not requirement sources. The [use cases](use-cases.md), [Business Rules](business-rules.md), [Non-functional Requirements](non-functional-requirements.md), and [traceability matrix](traceability.md) form one consistent requirement set with this backlog.

Selected workflow: create position/JD → confirm criteria → upload and parse CVs → screen and rank → verify evidence → shortlist/reject → adjust criteria, rescore, and compare.

**Direct user:** Recruiter. The AI service supports extraction; it is not the beneficiary of a user story and does not calculate scores. Separate hiring-manager approval, a dictionary administration screen, accounts/RBAC, interviews, offers, reporting, and a candidate portal are outside this scope. The trial uses synthetic data on a restricted network as stated in arc42.

## 2. Applying INVEST

Following [Creating the Perfect User Story with INVEST Criteria](https://scrum-master.org/en/creating-the-perfect-user-story-with-invest-criteria/): **Independent** — minimize dependencies; **Negotiable** — leave room for discussion; **Valuable** — benefit the user; **Estimable** — provide enough clarity to estimate; **Small** — keep scope manageable; **Testable** — define verifiable outcomes. Each story states who needs what and why, without treating a technical layer as user value.

Application to this backlog:

- **I:** each story has its own input and outcome; the dependency table shows only integration ordering. Fixtures and stubs permit isolated testing but do not remove delivery dependencies.
- **N:** layout, interaction, and technical design remain negotiable. Changes to scoring, snapshots, or scope must update arc42 and the related requirements.
- **V:** the “so that” clause states value for the recruiter.
- **E:** acceptance criteria, fixtures, and preconditions provide an estimation basis. Story points remain for the implementation team to assign.
- **S:** each story delivers one main business outcome. Extraction, background processing, and rescoring stories require further splitting if the team cannot complete them within a sprint.
- **T:** acceptance criteria use **Given / When / Then**. Future tests should reference `US-xx.AC-n`.

Priority **M** means required to accept the v1 workflow; **S** means desirable and can follow the core workflow. This is a proposed backlog order, not a delivery commitment. Every story remains **Draft — awaiting team estimation** until refinement confirms it is ready.

## 3. Backlog and traceability

“Depends on” lists business outcomes needed for integration. A story may be tested separately with an equivalent fixture. The [use-case catalog](use-cases.md) defines each UC.

| Story | Independently testable outcome | Priority | Source | UC | Depends on |
|---|---|---|---|---|---|
| US-01 | Store a position and its original JD | M | F01 | UC-01 | None |
| US-02 | Receive suggested criteria from a JD | M | F01 | UC-02 | US-01 |
| US-03 | Approve a valid criteria set | M | F01 | UC-03 | US-01; US-02 optional |
| US-04 | Upload a CV batch and see which files were accepted | M | F02 | UC-04 | US-01 |
| US-05 | Distinguish duplicate files from new CV versions | M | F02 | UC-04 | US-04 |
| US-06 | Receive evidenced CV data or a parse error | M | F02 | UC-05 | US-04 |
| US-07 | Start one screening run | M | F03 | UC-06 | US-03, US-06 |
| US-08 | Track run progress and per-CV failures | M | F03 | UC-07 | US-07 |
| US-09 | Know whether a CV meets mandatory criteria | M | F03 | UC-08 | Criteria/CV snapshots |
| US-10 | Receive reproducible scores and contributions | M | F03 | UC-08 | Criteria/CV snapshots |
| US-11 | Read a consistent ranking | M | F03 | UC-09 | US-09, US-10 |
| US-12 | Verify every criterion against the original CV | M | F04 | UC-10 | US-11 |
| US-13 | Record a shortlist or reject decision | M | F05 | UC-11, UC-12 | US-11 |
| US-14 | Save an adjusted criteria revision | M | F06 | UC-13 | US-03 |
| US-15 | Rescore the same CV set while preserving the current result on failure | M | F06 | UC-14 | US-14, a source run |
| US-16 | Read screening-run history | M | F06 | UC-15 | A published run |
| US-17 | Compare two runs for one position | S | F06 | UC-16 | Two published runs |

### US-01 — Create Position and JD

**As a recruiter, I want to create a position with its JD, so that screening has one consistent job context.**

- **AC-1:** Given a position name and non-empty JD, when I save them, then the system creates an identified position and returns the original JD unchanged.
- **AC-2:** Given a name or JD containing only whitespace, when I save, then the system identifies the missing field and does not create a screenable position. This validation is proposed for F01.
- **AC-3:** Given a save failure, when the failure is returned, then the system states that nothing was saved and retains my entered content for retry.
- **AC-4:** Given stored positions whose lifecycle status is `draft`, `open`, or `closed`, when I view the position list or workspace, then the system displays the stored status and lets me filter the list by it. A new position starts as `draft`; changing lifecycle status is outside v1 and no transition control is presented.

### US-02 — Suggest Criteria from the JD

**As a recruiter, I want a draft criteria set suggested from the JD, so that I reduce manual entry while retaining control of the requirements.**

- **AC-1:** Given a JD containing skill, experience, or education requirements, when valid extraction completes, then I receive draft criteria that I can review, edit, or remove; they are not yet approved.
- **AC-2:** Given a JD without an education requirement, when suggestions are generated, then the system does not invent a degree requirement; equivalent skills are represented consistently under BR-CRI-03.
- **AC-3:** Given that the suggestion service fails or returns information unsupported by the JD, when the response is processed, then invalid data is not accepted, the failure is disclosed, and I can enter criteria manually under BR-EVD-01.

### US-03 — Review and Approve Criteria

**As a recruiter, I want to edit and approve the criteria set, so that a screening run uses only requirements I have reviewed.**

- **AC-1:** Given draft criteria, when I add, edit, or remove criteria, set mandatory/preferred and weights, and approve, then revision 1 is created only if BR-CRI-01, BR-CRI-02, BR-CRI-03, and BR-CRI-04 hold.
- **AC-2:** Given criteria that violate a criteria rule, when I approve them, then the invalid criterion/rule is identified and no approved revision is created. Boundary cases cover BR-CRI-01, BR-CRI-02, and BR-CRI-03.
- **AC-3:** Given experience or education criteria, when I configure them, then the interface explains that their weights do not change scores under policy v1 and does not present a weight as maximum contribution.

### US-04 — Upload a CV Batch

**As a recruiter, I want to upload multiple CVs and see which files were accepted, so that I can prepare the screening set without overlooking failures.**

- **AC-1:** Given no more than 200 text-layer PDF or DOCX files of no more than 10 MiB (10,485,760 bytes) each, when I upload the batch, then each accepted file has its own identifier/status and is associated with the position.
- **AC-2:** Given an oversized file or unsupported actual format, when validation runs, then the file receives its own error while valid files are accepted; renaming an extension does not bypass format validation.
- **AC-3:** Given 201 selected files, when I submit the batch, then the system asks me to split it and does not silently omit file 201. Rejecting this entire oversized batch is a proposed interpretation of the arc42 limit.

### US-05 — Detect Duplicate Files and CV Versions

**As a recruiter, I want to know whether an uploaded CV is a duplicate or a new version, so that I neither score it twice nor lose earlier records.**

- **AC-1:** Given an accepted file, when identical content is uploaded again to the same position, then the existing CV is identified, the duplicate is reported, and no copy is added to the screening set.
- **AC-2:** Given an identified candidate and different CV content, when the new version is accepted, then the prior version and its history remain intact; completed runs do not change their referenced content.
- **AC-3:** Given insufficient evidence that two records represent the same person, when the file is accepted, then the system does not merge them from name alone. Candidate identity confirmation follows accepted decision D-02 in [Decisions](decisions.md) and does not introduce a candidate-administration screen.

### US-06 — Parse a CV with Evidence

**As a recruiter, I want evidenced data from each CV or a clear parse failure, so that I do not mistake a technical failure for candidate capability.**

- **AC-1:** Given a readable CV, when extraction succeeds, then the stored data and evidence point to the correct page/paragraph/location in that source version and the CV becomes parsed.
- **AC-2:** Given a scanned PDF, corrupt file, or invalid extracted data/evidence, when processing occurs, then the system reports a parse/extraction failure or need for reprocessing; it does not pretend OCR succeeded, create a zero score, or mark mandatory criteria failed.
- **AC-3:** Given source text whose contact details were protected during processing, when evidence is returned, then it maps to the original source; unmappable evidence is invalid. Instructions inside a JD or CV cannot change policy or invoke an executable tool.

### US-07 — Start a Screening Run

**As a recruiter, I want to screen the prepared CV set against approved criteria, so that I receive a traceable evaluation run.**

- **AC-1:** Given approved criteria and at least one valid CV, when I start screening, then one run is created with criteria, CV, and policy snapshots; later source edits do not change those inputs.
- **AC-2:** Given no approved criteria or no valid CV, when I start screening, then the missing prerequisite is reported and no empty run is created.
- **AC-3:** Given repeated start actions for the same criteria and CV set, when the system receives them, then only one logical run exists. If the position already has an active run, I am informed and no second run is created under BR-RUN-02.

### US-08 — Track Screening Progress

**As a recruiter, I want to track CVs that are pending, successful, or failed, so that I know when results are ready and which files need attention.**

- **AC-1:** Given a running run, when I view or reload the page, then I continue to see that run and its stored status/counts; reloading does not create another run.
- **AC-2:** Given 42 CVs with one technical failure, when the initial run ends, then the other 41 valid CVs continue, successful results are published as completed with errors, and the technical failure count is separate from failed mandatory eligibility. If no CV succeeds, no new ranking is published.
- **AC-3:** Given interrupted processing, when the system recovers, then the same run can continue without duplicate results; if it cannot complete, it shows a failure instead of remaining in progress indefinitely. Q05 defines reliability acceptance.

### US-09 — Evaluate Mandatory Criteria

**As a recruiter, I want to distinguish CVs that meet mandatory criteria from those that do not, so that I can prioritize review according to the JD.**

- **AC-1:** Given sufficient evidence that every mandatory criterion meets its threshold, when the CV is evaluated, then it passes mandatory eligibility. With no mandatory criteria, no mandatory condition is violated.
- **AC-2:** Given a partial mandatory skill, experience below the required threshold, or undetermined education, when the CV is evaluated, then it fails mandatory eligibility with criterion-specific reasons while still retaining component scores.
- **AC-3:** Given a CV that fails mandatory eligibility, when results are published, then it remains scored in a separate group and is not automatically rejected; missing evidence is not presented as proof of missing ability.

### US-10 — Calculate Scores and Contributions

**As a recruiter, I want consistent scores and per-criterion contributions, so that I understand why a CV received its score.**

- **AC-1:** Given the same snapshots and policy v1, when scoring is repeated, then scores, mandatory eligibility, and ordering are identical under BR-SCR-01, BR-SCR-02, BR-SCR-03, BR-SCR-04, and Q02.
- **AC-2:** Given fixture AT-01, when it is scored, then the displayed total is 92.94, contributions are 64.71 and 28.23, and displayed contributions sum to the displayed total. Semantic score is null/not applied.
- **AC-3:** Given a criterion group with no criteria, when the total is calculated, then that group is removed and remaining coefficients are normalized; overlapping experience is not double-counted and unclear education is not assumed to pass.

### US-11 — View Ranking

**As a recruiter, I want to view the ranking of a published run, so that I can choose which profiles to inspect first.**

- **AC-1:** Given published results, when I open the ranking, then ordering follows BR-RNK-01: mandatory-pass results first, then score, with stable ordering for ties; age and gender are not tie-breakers.
- **AC-2:** Given publication of a new run, when I load the ranking, then each response contains one complete run and never mixes old and new results. With no published run, the appropriate empty or processing state is shown.
- **AC-3:** Given profiles that fail mandatory eligibility, when I view the ranking, then they appear below a labeled separator with reasons and remain available for detail review and decisions.

### US-12 — Inspect Candidate Evidence

**As a recruiter, I want to compare each criterion result with the correct CV version, so that I can verify the result before deciding.**

- **AC-1:** Given a selected result, when I open its details, then every criterion shows status, reason, contribution, and evidence or a missing-evidence label from that run's snapshot; current criteria do not replace historical criteria.
- **AC-2:** Given valid evidence, when I select its citation, then the correct CV version and source location open; the explanation remains consistent with the published result under BR-EVD-01 and BR-RSC-03.
- **AC-3:** Given that the source file is temporarily unavailable, when I open it, then the viewer reports the file error while retaining the loaded analysis; embedded content cannot execute scripts.

### US-13 — Record Candidate Decision

**As a recruiter, I want to record a shortlist or reject decision for a candidate, so that human hiring decisions are explicitly distinguished from automated screening results.**

- **AC-1:** Given a current result in scored state, when I confirm shortlist, then shortlisted status and decision time are stored under BR-DEC-01.
- **AC-2:** Given a current result in scored state, when I confirm reject, then rejected status and decision time are stored under BR-DEC-01.
- **AC-3:** Given a candidate who failed mandatory eligibility, when I select shortlist, then the failed criteria are shown and confirmation is required; canceling leaves status unchanged, while confirming retains the mandatory result under BR-DEC-02.
- **AC-4:** Given a candidate who passed mandatory eligibility or has a high score, when I confirm reject, then the decision is stored; the system does not substitute the score for my decision under BR-ELG-02 and BR-DEC-02.
- **AC-5:** Given a save failure or stale displayed data, when I record a decision, then the interface does not show it as saved; stale/conflicting changes are rejected without overwrite under BR-DEC-03, BR-DEC-04, and Q06.

- **AC-6:** Given an already shortlisted/rejected current result, when a different decision or undo is requested, then it is rejected under BR-DEC-06. A current-version identical retry preserves decision_at and result_version.

### US-14 — Adjust and Version Criteria

**As a recruiter, I want to save adjusted criteria as a new revision, so that I can test changed requirements while preserving the basis of earlier runs.**

- **AC-1:** Given an approved criteria set, when I change weights, thresholds, or mandatory/preferred status and approve a valid set, then a new revision is created while prior revisions and results remain unchanged under BR-CRI-04.
- **AC-2:** Given data invalid under BR-CRI-01, BR-CRI-02, or BR-CRI-03, or a revision changed since I opened it, when I approve, then the corresponding error is shown and a newer revision is not overwritten.
- **AC-3:** Given that only an experience or education weight changes, when I prepare to rescore, then the policy v1 limitation states that this change does not alter the score. Saving criteria does not automatically publish a new ranking run.

### US-15 — Rescore the Existing CV Set

**As a recruiter, I want to rescore a source run's CV set against new criteria, so that I can assess the change while retaining a trustworthy current ranking during processing.**

- **AC-1:** Given published R1 and a newly approved revision, when I rescore, then R2 evaluates the exact successful CV snapshots from R1 without reinterpreting the source or adding new/failed CVs, under BR-RSC-01 and Q02.
- **AC-2:** Given R2 is running or any required source CV fails scoring, when I view the current ranking, then complete R1 remains visible and R2 does not replace it. The system switches completely to R2 only after every required CV succeeds.
- **AC-3:** Given successful publication of R2, when I open it, then every R2 decision begins as scored while R1 decisions remain available in history. Repeated actions and recovery follow US-07 and US-08.

### US-16 — View Screening History

**As a recruiter, I want to reopen each published screening run, so that I can explain its result using the criteria and CV data available at that time.**

- **AC-1:** Given multiple published runs, when I select one, then I see its run identifier, criteria revision, results, and run-specific decisions.
- **AC-2:** Given current criteria or CVs have changed, when I open an older run, then its score, evidence, and snapshots remain unchanged and are not rebuilt from current data.
- **AC-3:** Given a run that is no longer current, when I attempt to record a decision, then it is rejected under BR-DEC-03; viewing history does not trigger rescoring.

### US-17 — Compare Screening Runs

**As a recruiter, I want to compare two runs for the same position, so that I understand how criteria changes affected scores, ranks, and mandatory eligibility.**

- **AC-1:** Given two published runs for one position, when I compare them, then results align to the correct CV snapshots and show score, rank, mandatory eligibility, and deltas without merging CV versions merely because they belong to the same candidate.
- **AC-2:** Given only one run or runs from different positions, when I request comparison, then the system reports insufficient data or rejects the cross-position comparison.
- **AC-3:** Given a CV that exists in only one run, when I compare, then it is explicitly absent from the other run; the system does not fabricate a zero score or rank and does not modify either run or its decisions.

## 4. Cross-cutting rules

[Business Rules](business-rules.md) defines stable rules grouped by Criteria, CV/Evidence, Eligibility/Scoring/Ranking, Screening Runs, Decisions, and Rescore/History. Stories repeat only behavior directly accepted by the recruiter; shared formulas and invariants are referenced by BR ID.

## 5. Minimum acceptance data

These are fixtures to create during test implementation, **not existing CV files or completed tests**. Use synthetic data; random prototype scores are not expected results.

| ID | Data | Expected result / story |
|---|---|---|
| AT-01 | One fully matched skill with weight 60; experience weight 40, two-year requirement, exactly 24 non-overlapping months; no education | Skill 100; experience 80; total 92.941176… → 92.94; contributions 64.71 + 28.23. US-10 |
| AT-02 | Two skills weighted 60/40; first is mandatory and partial, second is full | Skill and total = 70; mandatory false; remains scored. US-09, US-10 |
| AT-03 | Experience only, weight 100, `min_years=2`; separate snapshots with 12, 24, 30, and 36 months | Scores 40, 80, 100, 100; if mandatory, only the 12-month case fails. US-09, US-10 |
| AT-04 | Education only, weight 100, bachelor required; CVs state master, college, vocational, or unclear | Scores 100, 50, 0, 0; among these cases only master passes if mandatory. US-09, US-10 |
| AT-05 | 42 CVs: 41 valid and one corrupt file | 41 continue; one separate technical failure that is not counted as failed mandatory eligibility. US-06, US-08 |
| AT-06 | A and B pass with displayed score 80.00 and A's stable ID precedes B's; C fails mandatory with score 99 | Order A, B, C. US-11 |
| AT-07 | R1 has two successful CVs and one shortlist decision; R2 fails while rescoring one CV | R1 remains current; after a fully successful rescore the new run starts scored and R1 retains its shortlist history. US-15, US-16; BR-RSC-02, BR-RSC-03 |
| AT-08 | One result is open in two sessions; the first session saves a decision | The second session's stale update is rejected without overwrite. US-13; BR-DEC-03, BR-DEC-04 |
| AT-09 | CV variants mention alias ReactJS with evidence of use, list it only, omit it, or contain a fabricated AI quote | Respectively full, partial, missing; the fabricated quote is rejected and produces no score. US-02, US-06, US-09 |
| AT-10 | Employment periods `[2022-01, 2023-01)` and `[2022-07, 2023-07)` | Combined duration is 18 months = 1.5 years, not 24 months. US-06, US-10; date normalization follows D-03 |

## 6. Quality requirements and shared acceptance

[Non-functional Requirements](non-functional-requirements.md) retains arc42 IDs Q01–Q11 and groups them under Auditability, Reliability, Performance, Accessibility, Recoverability, and Security. Transactions, leases, queues, retries, polling, and HTTP status codes belong in architecture/API documentation rather than user-story acceptance criteria.

## 7. Refinement order and Definition of Ready

Proposed order: US-01/03/04 → US-02/05/06 → US-07–12 → US-13 → US-14–16 → US-17. US-09 and US-10 can be implemented against synthetic snapshots before AI integration. Do not split delivery into “controller story” or “database story”; those are technical tasks within a user story.

US-02 remains **Must** because F01 in arc42 currently defines criteria suggestion as an in-scope capability. Changing it to Should would change Product Scope and requires a corresponding PO-approved update to arc42.

### Accepted decisions and delivery readiness

See [D-01–D-05](decisions.md) for accepted behavior and provisional story estimates, and [Extraction contract](extraction-contract.md) for the GPT-4o mini adapter.

| ID | Decision status | Affects |
|---|---|---|
| D-01 | Accepted: OpenAI GPT-4o mini; extraction-v1 contract and synthetic gold cases. PDF/DOCX corpus expansion and live evaluation remain implementation work | US-02, US-06; split by format if too large for one sprint |
| D-02 | Accepted: scoped duplicate reuse; explicit recruiter confirmation before attaching a different-content CV version; no automatic name/email merge | US-05; same-position identical-content behavior is already defined |
| D-03 | Accepted: months-v1, frozen UTC as_of_date, ambiguous dates as missing evidence; maximum 10,485,760 bytes | US-04, US-06, US-10 |
| D-04 | Provisional estimates and slices recorded in decisions.md; owner/capacity and sprint-fit confirmation remain pending after OpenAPI | US-06, US-08, US-15 |
| D-05 | Accepted: scored to shortlisted/rejected only; no undo/switch; current-version identical retries may return existing state | US-13 |

**Proposed Definition of Ready:** value and scope are shared; AC and fixtures are clear; dependency outcomes/contracts are available; applicable accepted decisions have implementation-ready contracts; and the delivery team has estimated and confirmed sprint fit. The backlog is ready for discussion and design, but not every story is automatically ready for implementation.

**Proposed Definition of Done for each story:** relevant AC and Q requirements pass suitable tests; integration failures are handled; documentation and traceability remain aligned; and mocks are not presented as evidence that AI/backend integration works. This document completes the requirements portion only; API, data diagrams, and test code belong to later parts.
