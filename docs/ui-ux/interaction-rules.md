# Interaction and UI/UX Rules

Version 1.0 · 2026-09-15

## 1. Purpose

This document defines shared interaction behavior for the target recruitment screening product. It applies to every screen in the position workspace and provides implementation rules for a later frontend redesign.

The rules prioritize traceability, evidence visibility, predictable system feedback, and safe recruiter decisions.

## 2. Application Shell and Navigation

### 2.1 Global shell

The application shell contains:

1. Product identity and a link to the Position List.
2. The active position name and position status when the recruiter is inside a workspace.
3. Position workspace navigation.

Navigation must preserve the active position context. A recruiter must not be silently moved from one position to another.

Position status is read-only in v1. The interface may display `draft`, `open`, or `closed` and filter positions by those stored values, but it must not present an action that changes lifecycle status.

### 2.2 Position workspace navigation

The workspace uses the following stable order:

1. JD & Criteria
2. CVs
3. Screening
4. Ranking
5. Run History

The workspace has no separate overview screen. Opening a position lands on the section that matches its readiness state, as defined by the default-landing rule in the [screen hierarchy](screen-hierarchy.md#5-guard-and-fallback-rules).

The current section must be visually and programmatically identifiable. Unavailable sections remain visible when this helps explain the workflow, but must show why they are unavailable and what action unlocks them.

### 2.3 Breadcrumbs

Screens deeper than one level use breadcrumbs:

`Positions / Position name / Section / Current item`

Breadcrumbs provide navigation only to valid parent levels. They must not replace the page title.

### 2.4 Unsaved changes

If a recruiter has changed a form and attempts to leave, the interface asks whether to discard the unsaved changes. The prompt identifies the affected object, such as a JD draft or criteria revision.

## 3. Page Structure

Every primary screen uses the same information order:

1. Page title and context.
2. Status and important workflow guidance.
3. Primary action.
4. Main content.
5. Secondary information or activity history.

Primary actions appear once in the main page header or at the end of the relevant form. Repeated actions may appear in a sticky footer only on long forms.

## 4. Forms and Validation

### 4.1 Field behavior

Each input has:

- a persistent label;
- an optional concise description when the expected value is not obvious;
- a required indicator where applicable;
- an inline error associated with the input;
- preserved user input after a recoverable validation or server error.

Placeholder text must not be the only label or instruction.

### 4.2 Validation timing

- Validate format after the recruiter leaves a field.
- Validate required fields on submission.
- Validate cross-field business rules before submission and identify every field involved.
- Perform server validation even when client validation has passed.

The interface focuses the first invalid field after a failed submission and provides an error summary for long forms.

### 4.3 Error messages

An error message states:

1. what could not be completed;
2. the reason, when known;
3. the action the recruiter can take.

Example: `The criteria cannot be approved because the total weight is 96, not 100. Adjust the weights by 4, then try again.`

Do not expose stack traces, model prompts, internal identifiers, or infrastructure details.

### 4.4 Destructive actions

Removing a file from an unsubmitted selection, discarding a criteria draft, or replacing a JD requires confirmation when the action would remove stored work or invalidate downstream data. The confirmation names the affected item and explains the direct consequence.

An accepted CV version is not deletable in v1. It belongs to the run history that BR-RSC-03 requires to remain readable, so SCR-04 offers removal only for a file that has not been submitted.

## 5. Asynchronous Operations

### 5.1 Operation states

Screening runs use the run-state vocabulary defined in the [information architecture](information-architecture.md#5-status-vocabulary):

- **Waiting to start** (`queued`): accepted but not started.
- **Screening** (`running`): processing has started.
- **Completed** (`completed`): every required item succeeded.
- **Completed with file errors** (`completed_with_errors`): some initial-run files failed technically; the published ranking covers the successful items.
- **Run failed** (`failed`): no new result became publishable and the previously published ranking is preserved.

Policy v1 does not support cancelling a screening run. Do not present a cancel action for a run.

### 5.2 Progress presentation

Screening progress must come from backend state. It may show:

- processed CV count and total CV count;
- successful, failed, and pending counts;
- current run status;
- start time and last update time.

Do not estimate a completion percentage unless the backend can support a meaningful estimate. When progress cannot be quantified, use an indeterminate progress indicator and a textual status.

### 5.3 Refresh and recovery

The recruiter can leave and return to a running operation without losing it. Refreshing the page restores the latest backend state.

If live updates are interrupted, show the last successful update time and provide a retry action. Do not display a stale result as current without a visible warning.

### 5.4 Duplicate submission prevention

After the system accepts a command, disable repeated submission until a response is received or use an idempotency mechanism. Starting a screening run twice from a double click must not create two runs.

## 6. Notifications and Feedback

### 6.1 Feedback types

- **Inline feedback** for field-level or section-level problems.
- **Banner** for page-level status, stale information, partial failure, or an action required before continuing.
- **Toast** for short confirmation of a completed, reversible action.
- **Dialog** for consequential decisions that require explicit confirmation.

### 6.2 Toast behavior

Toasts must not contain information that is required to complete the workflow. Success toasts may dismiss automatically; error toasts remain until dismissed or until their content is available inline.

### 6.3 Partial failure

Batch actions report a summary and item-level outcome. For example:

`18 CVs processed: 16 succeeded and 2 require attention.`

The recruiter can filter directly to affected items and retry only retryable failures.

## 7. Criteria Editing and Approval

### 7.1 Criteria representation

Each criterion visibly contains:

- stable criterion label;
- kind: skill, experience, or education;
- mandatory or preferred;
- weight;
- kind-specific threshold, such as minimum years for experience or degree level for education;
- source evidence from the JD;
- provenance: AI proposed or recruiter added/edited.

Kind and mandatory/preferred are independent attributes. Mandatory status governs eligibility only and never removes a criterion from scoring.

Weight does not mean the same thing for every kind under policy v1, and the interface must not suggest that it does:

- skill weight distributes points inside the skill group (BR-SCR-01);
- experience and education are combined through fixed group coefficients, so changing their weight does not change the score (BR-CRI-05, BR-SCR-02). The editor states this where those weights are entered;
- weight is never presented as a criterion's maximum contribution (BR-CRI-05).

Every criterion still carries a weight, because BR-CRI-01 requires the approved total to be exactly 100. Mandatory and preferred criteria must use distinct labels and structure, and color alone must not communicate the difference.

### 7.2 AI-generated drafts

AI output is always presented as a draft. The interface must:

- identify that the draft requires recruiter review;
- permit editing, adding, and removing criteria;
- show validation before approval;
- require an explicit approval action;
- retain the approved revision used by each run.

### 7.3 Weight validation

The interface shows the current weight total while criteria are edited. Approval remains unavailable until the total is exactly 100 under BR-CRI-01, and the remaining difference is stated numerically. A draft may hold a weight of 0, but it cannot be approved in that state.

### 7.4 Revision impact

Editing approved criteria creates a new draft revision. Existing published runs remain tied to their original revision. Before rescore, show the number of CVs affected and the source run or CV set that will be evaluated.

## 8. CV Upload and Preparation

### 8.1 File selection

The upload control supports drag and drop and a standard file picker. Before upload, display accepted formats, file-size limits, and any batch limit defined by the product configuration.

### 8.2 File-level status

Each selected file has an independent status and message. A failure in one file must not hide successful files or require the recruiter to repeat the whole batch.

### 8.3 Duplicate handling

Duplicate and new version are outcomes the system determines from file content, not options the recruiter selects:

- identical file content in the same position reuses the existing CV record and is never added to the screening set twice (BR-CV-01). Show the basis for the detection and link to the existing record; never offer to store the same content as a new version;
- different content for an already identified candidate is a new CV version, and the prior version and its run history stay intact (BR-CV-02);
- when the evidence that two records describe the same person is insufficient, report the ambiguity for recruiter review and never merge identities from a matching name alone (BR-CV-03).

The only action offered for a detected duplicate is removing that file from the current selection.

### 8.4 Readiness

The workspace distinguishes:

- uploaded CVs;
- CVs ready for screening;
- CVs requiring attention;
- rejected or unsupported files.

The start-screening action states how many CVs will be included.

## 9. Ranking and Comparison

### 9.1 Ranking table

The default ranking table includes:

- rank;
- candidate identity or available CV identity;
- mandatory eligibility result;
- total score;
- human decision;
- evidence or review indicator.

Technical processing failures are summarized outside the ranking table, and the run completion time belongs to the run header rather than to each row. See [SCR-06](screen-specifications.md#scr-06--published-ranking).

Rank and score must not imply mandatory eligibility. An ineligible candidate remains clearly marked even when a numeric score is available.

### 9.2 Sorting and filtering

The interface identifies the active sort and every active filter. Filters can be cleared individually or together. Empty filtered results explain that the current filters produced no matches.

Sorting must be deterministic. Ties follow the documented tie-breaking rule and expose equal scores rather than suggesting false precision.

### 9.3 Selection

Selecting a row is separate from opening candidate details. In v1 the only multi-row selection is choosing two published runs to compare in SCR-08, and it states which runs are selected.

Bulk shortlist and bulk reject are not part of v1. US-13 records one decision against one result and BR-DEC-03 ties each decision to the current result version, so a bulk decision action has no story, use case, or rule behind it.

### 9.4 Run comparison

Comparison shows both absolute values and changes between runs. Changed eligibility, score, and rank, and a CV present in only one run, must be identifiable without relying only on color. Absence is shown as absence and never as a fabricated zero score or rank (BR-RSC-04). Technical processing differences belong to the run-level summary, not to the candidate comparison row.

The comparison header identifies both run IDs, criteria revisions, and timestamps.

## 10. Evidence and Candidate Review

### 10.1 Evidence-first review

Every criterion assessment links its conclusion to supporting CV evidence when evidence is available. The evidence view includes:

- criterion name and rule;
- assessment outcome;
- score contribution where applicable;
- extracted evidence snippet;
- source location, such as page or section;
- an explicit `No evidence found` state.

### 10.2 Source document coordination

Selecting evidence highlights or navigates to the corresponding place in the CV preview when source location data exists. If exact highlighting is unavailable, the interface shows the best available page or section reference without inventing precision.

### 10.3 Human decisions

Human decisions are displayed separately from model assessments. Recording or changing a decision requires an explicit action and persists the decision independently of future rescoring.

## 11. Empty, Loading, Error, and Stale States

Every data region defines these states:

| State | Required content |
|---|---|
| Empty | What is absent, why it matters, and the valid next action |
| Loading | What is loading; preserve surrounding context where possible |
| Error | What failed, retry guidance, and a support reference when available |
| Partial | Successful and failed portions with item-level recovery |
| Stale | Last updated time and a refresh action |
| Unavailable | The prerequisite that has not been met |

Skeleton loaders should resemble the final layout and must not display fabricated values.

## 12. Accessibility

The frontend implementation must satisfy `Q08` and the following interaction requirements:

- All functions are operable with a keyboard.
- Focus order follows visual and reading order.
- Focus is moved deliberately after dialogs, route changes, and validation errors.
- Dialogs trap focus while open and return focus to their trigger when closed.
- Form labels, errors, status messages, and progress updates have programmatic relationships.
- Status, eligibility, score change, and validation do not rely on color alone.
- Text and meaningful controls meet WCAG 2.1 AA contrast requirements.
- Target sizes and spacing support accurate pointer and touch interaction.
- Motion respects reduced-motion preferences.
- Tables expose headers and provide a usable small-screen alternative.

## 13. Responsive Behavior

The target experience prioritizes desktop recruitment work while preserving core review tasks on smaller screens.

### 13.1 Wide screens

- Use split views for evidence and CV source when space permits.
- Keep ranking columns visible according to recruiter priority.
- Permit contextual side panels without covering the primary task.

### 13.2 Medium screens

- Collapse secondary navigation labels when necessary.
- Move supporting panels into drawers or stacked sections.
- Preserve status, eligibility, score, and primary actions.

### 13.3 Small screens

- Convert wide tables to summary cards or a horizontally scrollable, accessible table.
- Present evidence and CV source sequentially.
- Keep decisions possible, but avoid dense criteria authoring when the available viewport prevents safe review.

Responsive behavior must be based on available content space rather than a specific device name.

## 14. Language and Content

### 14.1 Product vocabulary

Use these terms consistently:

| Preferred term | Meaning |
|---|---|
| Position | The recruitment need that owns a JD, CVs, and runs |
| Job description (JD) | Source content used to propose criteria |
| Criteria revision | A versioned set of mandatory and preferred criteria |
| Screening run | One evaluation of a CV set against an approved criteria revision |
| Eligibility | Outcome of mandatory criteria checks |
| Score | Policy-v1 assessment combining the skill, experience, and education groups through fixed coefficients; mandatory status does not remove a criterion from scoring |
| Evidence | CV content supporting an assessment |
| Human decision | Recruiter judgment recorded separately from system results |

Avoid using `fit`, `recommended`, or similar terms unless the product defines their calculation and limitations.

### 14.2 Action labels

Action labels use a verb and object, such as `Approve criteria`, `Start screening`, or `Compare runs`. Avoid vague labels such as `Continue` when the resulting action is consequential.

### 14.3 Dates and numbers

Display dates and times in the user's configured locale and include the timezone where run timing could be ambiguous. Scores use consistent precision across ranking, details, and comparison.

## 15. Privacy and Security Presentation

The interface supports `Q10` for safe diagnostic logging and `Q11` for UI data exposure:

- Do not expose CV content in URLs, analytics labels, notifications, or client-side error messages.
- Limit previews and exports to the current position context.
- Mask or omit personal data when it is unnecessary for the current task.
- Reject an invalid or cross-position resource context without exposing CV or candidate data from the other position.
- Do not retain uploaded content in browser storage beyond the approved implementation need.

Logging constraints derive from `Q10`. URL, browser-storage, analytics, notification, client-error, and cross-position data-exposure constraints derive from `Q11`. Authentication and RBAC remain outside v1.

## 16. Analytics Events for Product Evaluation

If product analytics is introduced, events should describe workflow actions without CV text or candidate personal data. Suggested events include:

- position created;
- criteria draft generated;
- criteria approved;
- upload batch completed;
- screening run started and completed;
- ranking opened;
- evidence reviewed;
- human decision recorded;
- criteria revision created;
- rescore started;
- runs compared.

Analytics event names and properties require a separate privacy review before implementation.

## 17. Implementation Readiness Checklist

Before a screen is considered ready for frontend implementation, confirm that:

- its purpose and route are defined in the screen hierarchy;
- its inputs, outputs, actions, and states are defined in the screen specification;
- all actions correspond to a use case or navigation need;
- business-rule and quality-requirement references resolve;
- empty, loading, error, partial, and stale states are designed where applicable;
- keyboard and focus behavior is specified;
- asynchronous state comes from a defined backend contract;
- sensitive data is excluded from URLs and diagnostic messages;
- each primary action has a success outcome and a recoverable failure path.

Back to the [UI/UX index](README.md).
