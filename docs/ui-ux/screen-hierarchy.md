# Screen Hierarchy

Version 1.0 · 2026-09-15

## 1. Target sitemap

```mermaid
flowchart TD
    S01[SCR-01 Position List]
    S02[SCR-02 Create or Edit Position and JD]
    W[Position Workspace]
    S03[SCR-03 Criteria Review and Approval]
    S04[SCR-04 CV Workspace]
    S05[SCR-05 Screening Run]
    S06[SCR-06 Published Ranking]
    S07[SCR-07 Candidate Result and Evidence]
    S08[SCR-08 Run History]
    S09[SCR-09 Criteria Revision]
    S10[SCR-10 Run Comparison]

    S01 --> S02
    S01 --> W
    S02 --> S03
    W --> S03
    W --> S04
    W --> S05
    W --> S06
    W --> S08
    S06 --> S07
    S08 --> S07
    S08 --> S09
    S08 --> S10
    S09 --> S05
    S05 --> S06
```

The workspace node represents persistent navigation and context, not a separate required route, and it has no screen of its own; see the default-landing rule in section 5. SCR-02 through SCR-10 always belong to one position.

## 2. Screen inventory

Routes are proposed information architecture, not an API contract. Stable screen IDs should be used in designs, tests, and analytics regardless of later route syntax.

| ID | Screen | Proposed route | Parent | Primary stories | Primary use cases |
|---|---|---|---|---|---|
| SCR-01 | Position List | `/positions` | Product | US-01 | UC-01 |
| SCR-02 | Create/Edit Position and JD | `/positions/new`, `/positions/{position}/edit` | Position List | US-01 | UC-01 |
| SCR-03 | Criteria Review and Approval | `/positions/{position}/criteria/draft` | Position Workspace | US-02, US-03 | UC-02, UC-03 |
| SCR-04 | CV Workspace | `/positions/{position}/cvs` | Position Workspace | US-04, US-05, US-06 | UC-04, UC-05 |
| SCR-05 | Screening Run | `/positions/{position}/screening`, `/positions/{position}/runs/{run}` | Position Workspace | US-07, US-08, US-15 | UC-06, UC-07, UC-14 |
| SCR-06 | Published Ranking | `/positions/{position}/ranking` | Position Workspace | US-09, US-10, US-11 | UC-08, UC-09 |
| SCR-07 | Candidate Result and Evidence | `/positions/{position}/runs/{run}/results/{result}` | Ranking or History | US-12, US-13 | UC-10, UC-11, UC-12 |
| SCR-08 | Run History | `/positions/{position}/runs` | Position Workspace | US-16 | UC-15 |
| SCR-09 | Criteria Revision | `/positions/{position}/criteria/revisions/new` | Run History or Criteria | US-14 | UC-13 |
| SCR-10 | Run Comparison | `/positions/{position}/runs/compare` | Run History | US-17 | UC-16 |

### 2.1 Frontend route binding

The routes above are canonical information-architecture paths. The rebuilt frontend is delivered as static files without server rewrites, so it binds each canonical path to a target hash route by prefixing `#`:

| Canonical path | Target hash route |
|---|---|
| `/positions` | `#/positions` |
| `/positions/{position}/criteria/draft` | `#/positions/{position}/criteria/draft` |
| `/positions/{position}/runs/{run}/results/{result}` | `#/positions/{position}/runs/{run}/results/{result}` |

The binding is one rule applied to every row of the inventory, not a second route list to maintain. It is an implementation decision for a static deployment and does not change the information architecture: a later deployment able to rewrite paths may bind the same canonical paths to the History API without changing screen IDs, hierarchy, entry rules, or this document.

### 2.2 Delivered routes

The rebuild is done, and it replaced the prototype's Vietnamese hash routes (section 6), which are no longer in the repository. Six of its routes are shorter than the canonical paths above. Screen IDs and the hierarchy are unchanged, so the difference is route syntax only. Entry rules did move: the default landing order in section 5 was rewritten to match the delivered SCR-01 row action. `frontend/src/router/index.ts` is the authority for what the application actually answers.

| ID | Canonical path | Delivered hash route |
|---|---|---|
| SCR-01 | `/positions` | `#/positions` |
| SCR-02 | `/positions/new`, `/positions/{position}/edit` | unchanged |
| SCR-03 | `/positions/{position}/criteria/draft` | `#/positions/{position}/criteria` |
| SCR-04 | `/positions/{position}/cvs` | `#/positions/{position}/cv-workspace` |
| SCR-05 | `/positions/{position}/screening`, `/positions/{position}/runs/{run}` | `#/positions/{position}/screening-runs/{run}` |
| SCR-06 | `/positions/{position}/ranking` | unchanged |
| SCR-07 | `/positions/{position}/runs/{run}/results/{result}` | `#/positions/{position}/candidates/{result}?run={run}` |
| SCR-08 | `/positions/{position}/runs` | unchanged |
| SCR-09 | `/positions/{position}/criteria/revisions/new` | `#/positions/{position}/criteria/new-revision` |
| SCR-10 | `/positions/{position}/runs/compare` | `#/positions/{position}/comparison` |

SCR-07 is the one difference that is more than spelling: it carries its run context in a `run` query parameter instead of the path, and falls back to the position's published run when that parameter is absent. The context is still explicit in every link that leads there.

## 3. Hierarchy decisions

### Separate position creation from the list

SCR-02 is a real form rather than an alert or inline mock. It provides enough room for the original JD, validation, unsaved-change handling, and a clear transition to criteria extraction/review.

### Keep criteria suggestion and approval together

AI suggestion is a starting state inside SCR-03, not a separate destination. The recruiter can compare proposed criteria with JD evidence, edit them, enter criteria manually after AI failure, and approve revision 1 in one workspace.

### Where a run is started, and where it is watched

SCR-05 is the progress/status view for a run that already exists. It has no readiness summary and no submit step: a run is created before the recruiter ever reaches it, and SCR-05 is opened with that run's ID. An earlier draft of this document combined start and progress on SCR-05; the delivered frontend does not, because the two modes start from different contexts and need different confirmations.

- **Initial** starts on SCR-04, where the CV selection is made — the API requires that selection to be explicit ([API guide](../api/README.md) section 4.3), so the screen that holds the CV list is the only one that can submit it.
- **Rescore** starts on SCR-03 or SCR-09, next to the approved revision being applied, since the server derives the CV set from the published run rather than from anything the recruiter picks.

Both then navigate to SCR-05 for that run.

### Keep candidate detail contextual

SCR-07 always carries position, run, and result context. It is not a primary navigation item and cannot silently fall back to another candidate when a result is unavailable.

### Separate history, revision, and comparison

These are three user goals:

- SCR-08 answers “What happened in each run?”
- SCR-09 answers “What criteria should the next run use?”
- SCR-10 answers “What changed between two published runs?”

They can share layout components but should not be hidden as states of one large page.

## 4. Entry and exit rules

| Screen | Valid entry | Primary exit |
|---|---|---|
| SCR-01 | Product start or back from a workspace | Open/create a position |
| SCR-02 | Create action or edit-position action | Save and continue to SCR-03; cancel to prior context |
| SCR-03 | New/edited JD, workspace Criteria tab, AI failure fallback | Approve and continue to SCR-04; save draft/stay |
| SCR-04 | Approved criteria or workspace CVs tab | Start the run here, then follow it in SCR-05; remain for file recovery |
| SCR-05 | A run that exists: just started from SCR-04 or SCR-03/09, an active-run link, or a direct run link | Published SCR-06; failed run remains inspectable |
| SCR-06 | Workspace Ranking tab or successful publication | SCR-07, SCR-08, or criteria revision |
| SCR-07 | Candidate/result link from SCR-06 or SCR-08 | Back to the exact source run/ranking context |
| SCR-08 | Workspace Run History tab | Historical SCR-07, SCR-09, or SCR-10 |
| SCR-09 | “Create new revision” from criteria/history | Approve and start the rescore here, then follow it in SCR-05; cancel without publication |
| SCR-10 | Compare action after selecting two eligible runs | Open either run/result; return to history |

## 5. Guard and fallback rules

- Opening a position-scoped route without a valid position returns to SCR-01 with a clear not-found message.
- Opening a run/result that belongs to another position is rejected; context is never substituted.
- Leaving SCR-02, SCR-03, or SCR-09 with edits prompts to discard or stay.
- Screens with unmet prerequisites remain readable when useful, but their primary action explains what must be completed.
- SCR-06 continues to show the current published run during a newer active run and links to its SCR-05 progress.
- A stale SCR-07 decision attempt remains on the screen, reports the conflict, and offers to load the current published result.

### Default landing order

Opening a position from SCR-01 lands on the **first** matching destination below. The order is fixed so that a position satisfying more than one condition still has exactly one landing screen:

| Order | Condition | Destination |
|---|---|---|
| 1 | A published run exists | SCR-06, with a banner to SCR-05 when a newer run is also active |
| 2 | An active run exists and nothing is published yet | SCR-05 |
| 3 | An approved criteria revision, with no published and no active run | SCR-04, where the CVs are selected and the first run is started |
| 4 | No approved criteria revision | SCR-03 |

A published run always takes precedence over an active run: the usable published ranking is never replaced by a progress screen, which is the same guarantee the preceding SCR-06 rule makes.

Row 3 does not branch on whether CVs are ready. An earlier version of this table sent “approved criteria + at least one CV ready” to SCR-05, but the delivered row action in [`frontend/src/screens/scr-01-position-list/index.ts`](../../frontend/src/screens/scr-01-position-list/index.ts) goes to SCR-04 in both cases, and that is the behavior of record. It is also the only workable destination: with no run started there is nothing for SCR-05 to report, and an initial run requires an explicit CV selection ([API guide](../api/README.md) section 4.3), which is made on SCR-04. The row action in SCR-01 and this order must always agree; when they diverge, the code is corrected only if it contradicts a rule elsewhere in this document, otherwise this table follows the code.

## 6. Relationship to the current prototype

The prototype's seven screens mapped into this hierarchy as follows. The rebuilt frontend completed that migration, and the prototype was removed from the repository in commit `9cafcbf` (2026-09-17), so this table now records the migration rather than planning it.

| Current route | Target destination |
|---|---|
| `#vi-tri` | SCR-01; creation moves into SCR-02 |
| `#tieu-chi` | SCR-03; original JD editing starts in SCR-02 |
| `#tai-cv` | SCR-04 |
| `#tien-trinh` | SCR-05 |
| `#ket-qua` | SCR-06 |
| `#chi-tiet/:id` | SCR-07 with explicit run/result context |
| `#chinh-tieu-chi` | Split into SCR-08, SCR-09, and SCR-10 |

This mapping guided the frontend rebuild. It did not require preserving the prototype's hash routes or page composition, and the delivered routes are listed in section 2.2.

Back to the [UI/UX index](README.md).
