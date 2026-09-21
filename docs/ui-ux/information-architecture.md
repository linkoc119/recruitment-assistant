# Information Architecture

Version 1.0 · 2026-09-15

## 1. Recruiter mental model

The recruiter works inside a **position workspace**. A position owns the JD, approved criteria revisions, CV records, screening runs, published ranking, and run-specific decisions.

```text
Position
├── Original JD
├── Criteria
│   ├── Draft suggestion or manual draft
│   └── Approved revisions
├── CV records
│   └── Immutable file versions
└── Screening runs
    ├── Frozen criteria/CV/policy snapshots
    ├── Processing items and technical failures
    ├── Results: eligibility, score, contributions, evidence
    └── Recruiter decisions: scored, shortlisted, rejected
```

This hierarchy prevents four common misunderstandings:

- a candidate is not the same thing as one CV version;
- a failed file is not a candidate who failed mandatory criteria;
- a high score is not mandatory eligibility;
- shortlist/reject is a human decision, not an automated score outcome.

## 2. Core information objects

| Object | Recruiter-facing meaning | Identity/context shown in UI | Relationships |
|---|---|---|---|
| Position | One hiring need | Title, level when available, lifecycle label | Owns JD, criteria, CVs, runs |
| Original JD | Source text for job requirements | Position and last saved time | Produces a draft suggestion; captured in revisions |
| Criteria Draft | Editable, unapproved requirements | Draft status and validation summary | May start from AI suggestion or manual entry |
| Criteria Revision | Recruiter-approved immutable criteria set | Revision number and approval time | Used by one or more runs |
| Candidate | Person represented by one or more CV records | Name plus non-sensitive disambiguating metadata | May have multiple CV versions |
| CV Version | One submitted file snapshot | File name, version, uploaded time, processing status | Included in runs; points to evidence locations |
| Screening Run | One evaluation of frozen inputs | Run label/ID, revision, time, status, counts | Produces item results and may become published |
| Screening Result | Evaluation of one CV in one run | Candidate/CV version, eligibility, score, decision | Contains criterion results and evidence |
| Evidence | Source support for one extracted fact/match | Quote, page/paragraph, source version | Explains a criterion result |
| Candidate Decision | Recruiter disposition for one result | Scored, shortlisted, rejected; decision time | Belongs to one run result only |

## 3. Navigation model

### Global navigation

The main navigation has one product entry: **Positions**. Future modules are not shown as disabled navigation because they are outside the selected product scope.

### Position workspace navigation

After opening a position, persistent local navigation exposes:

1. **JD & Criteria** — source JD, draft, approval, and revisions.
2. **CVs** — upload, processing results, duplicates, and versions.
3. **Screening** — start/rescore runs and monitor progress.
4. **Ranking** — the current published run.
5. **Run History** — immutable historical runs and comparison.

The workspace has no separate overview screen. Readiness and the next useful action are carried by the row action in SCR-01 and by the default-landing rule in the [screen hierarchy](screen-hierarchy.md#5-guard-and-fallback-rules), so no navigation item exists without a screen specification.

Candidate Result is contextual and opens from Ranking or Run History. It is not a global or workspace-level navigation item.

### Navigation context

Every workspace screen shows:

- breadcrumb: `Positions / {Position} / {Section}`;
- position title and lifecycle status;
- current criteria revision where relevant;
- published run label/time where results are shown;
- processing banner when a newer run is active.

Changing the position changes the complete workspace context. No screen may display a breadcrumb for one position while reading another position's sample data.

## 4. Content grouping

| IA area | Information included | Main screens |
|---|---|---|
| Position setup | Position metadata, original JD, readiness | SCR-01, SCR-02, SCR-03 |
| Criteria management | Draft suggestion, manual editing, validation, approval, revision summary | SCR-03, SCR-09 |
| CV preparation | Upload queue, accepted/rejected files, duplicate/version status, parse status | SCR-04 |
| Run start | Input summary and start confirmation | SCR-04 for an initial run, SCR-03/SCR-09 for a rescore |
| Screening execution | Run progress and per-item failures | SCR-05 |
| Result review | Published ranking, eligibility groups, score, evidence, human decision | SCR-06, SCR-07 |
| Change analysis | Criteria revision, rescore status, historical runs, comparison | SCR-08, SCR-09, SCR-10 |

## 5. Status vocabulary

### Position lifecycle

| Internal state | UI label | Meaning/action |
|---|---|---|
| `draft` | Draft | Default for a new position; display and filter only |
| `open` | Open | Stored lifecycle status; display and filter only |
| `closed` | Closed | Stored lifecycle status; display and filter only |

The v1 interface does not provide a lifecycle transition action. It reads the stored status and uses it for display and filtering only.

### CV processing

| Internal state | UI label | Meaning/action |
|---|---|---|
| `uploaded` | Uploaded | Accepted and waiting for parsing |
| `parsing` | Parsing | Extraction is in progress |
| `parsed` | Ready | Valid data/evidence are available for screening |
| `parse_failed` | Parse failed | Technical failure; show cause and available recovery action |
| duplicate outcome | Duplicate file | Existing CV is reused; do not imply a failed candidate |
| new-version outcome | New CV version | Prior version remains available in history |

### Screening run

| Internal state | UI label | Meaning/action |
|---|---|---|
| `queued` | Waiting to start | Run accepted but processing has not started |
| `running` | Screening | Show counts and allow navigation away |
| `completed` | Completed | All required items succeeded |
| `completed_with_errors` | Completed with file errors | Some initial-run files failed; ranking covers successful items |
| `failed` | Run failed | No new result became publishable; preserve current ranking |

### Screening result

Four separate fields are always presented separately:

| Dimension | Values | Presentation rule |
|---|---|---|
| Processing | succeeded / failed | Technical label and error reason |
| Mandatory eligibility | meets / does not meet | Text + icon; failed criteria listed |
| Match score | 0–100 under policy v1 | Number + breakdown; never called probability |
| Recruiter decision | scored / shortlisted / rejected | Human-decision label and timestamp |

## 6. Findability and labels

Use these primary labels consistently:

- “Criteria,” not alternating “requirements,” “rules,” and “filters” in navigation.
- “Mandatory eligibility,” not “pass/fail candidate.”
- “Match score,” with “Score breakdown” for components/contributions.
- “File error” or “Parse failed,” not “candidate failed.”
- “Current published ranking,” not “latest data” when a newer run is still processing.
- “Criteria revision” and “Screening run,” with human-readable time next to technical IDs.
- “Shortlist” and “Reject” under the shared heading “Recruiter decision.”

## 7. Search and filtering

Search is contextual:

- Position List searches positions.
- CV Workspace searches file/candidate identifiers within one position.
- Ranking searches published results within one run.
- Run History filters runs by status/revision/date.

Do not expose a global candidate search because cross-campaign repository search is outside scope. Filters never change the underlying run or score; clearing filters restores the complete available result set.

## 8. Empty, loading, and stale information

Every IA area defines a next useful action:

- no positions → create a position;
- position without approved criteria → enter/review criteria;
- no CVs → upload CVs;
- no run → start screening after prerequisites are ready;
- run in progress → show progress while preserving any existing published ranking;
- no published result → explain whether input is incomplete, processing, or failed;
- stale decision view → block the write and return the recruiter to the current result;
- one historical run → allow history review but explain why comparison requires two runs.

## 9. Future extension points

The IA reserves integration boundaries without adding current screens:

- Position metadata such as work location can later arrive together with a link to a wider ATS job record. Location has no column in the current data model and no user story, so it has no screen field in v1.
- Candidate identity can later belong to a cross-position profile.
- Recruiter decision can later feed interview/offer workflows.
- Workspace access can later be controlled by RBAC.
- File failures can later offer OCR when that capability is approved.

These extensions must not appear as working actions in v1.

Back to the [UI/UX index](README.md).
