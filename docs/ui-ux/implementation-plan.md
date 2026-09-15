# Implementation Plan

Version 1.0 · 2026-09-15

This plan sequences the frontend rebuild described by this document set. It does not add screens, states, or rules; it only decides in what order the specified behavior can be built and when each screen may be called complete.

## 1. Why three phases

No screen in this set is achievable with presentation code alone. SCR-01 already requires stored positions at US-01.AC-1, and every later screen depends on persisted criteria revisions, CV records, or run snapshots. A screen rendered from fixtures is a presentation deliverable, never a completed screen.

The phases therefore separate three different kinds of work rather than three groups of screens:

| Phase | Deliverable | Completion signal |
|---|---|---|
| 1 — Frontend presentation | Routes, layout, components, responsive behavior, and every specified state rendered from fixtures | The full state matrix renders, not only the success path |
| 2 — API contracts | Request/response shapes and concurrency semantics for position, criteria, CV, run, ranking, evidence, and decision | Every field the UI must display or send has a defined source |
| 3 — Functional integration | Fixtures replaced by backend state; acceptance criteria verified | Story acceptance criteria and Q01–Q11 pass against real state |

## 2. Phase 1 — Frontend presentation

### Scope

- Bind every canonical route through the hash rule in [Screen Hierarchy §2.1](screen-hierarchy.md#21-frontend-route-binding).
- Build the application shell, workspace navigation, and breadcrumbs from [Interaction Rules §2](interaction-rules.md#2-application-shell-and-navigation).
- Build the shared criterion editor once and reuse it in SCR-03 and SCR-09.
- Implement the default-landing rule from [Screen Hierarchy §5](screen-hierarchy.md#5-guard-and-fallback-rules).

### Two rules that decide whether phase 3 is a swap or a rewrite

**Shape fixtures like the proposed API responses, not like render arguments.** If a fixture is flattened for convenience, replacing it later forces the render layer to be rewritten rather than reconnected. Fixture files should be the working draft that phase 2 formalizes.

**Never fabricate a value the specification forbids.** Skeleton loaders must not display invented numbers, and semantic score stays absent or explicitly `Not applied` under BR-SCR-02. A fixture that shows a plausible score where the product has none will survive into review as if it were real.

### Definition of done

Phase 1 is complete for a screen when every state in [Interaction Rules §11](interaction-rules.md#11-empty-loading-error-and-stale-states) that applies to it renders: empty, loading, error, partial, stale, and unavailable. This is where most of the specification's content lives and where the current prototype is thinnest, so a happy-path-only screen is not done.

Keyboard operability, focus management, and the non-color status distinctions required by Q08 are phase 1 work, not integration work. They are cheaper to build in than to retrofit.

## 3. Phase 2 — API contracts

One contract per resource: position, criteria revision, CV record and version, screening run, published ranking, evidence, and candidate decision.

### Two fields that shape the interface and must be decided here

| Field | Why it cannot wait | Source |
|---|---|---|
| Result version or etag | SCR-07 must reject a decision made from stale data and offer the current result. Without a version on the result, that path cannot be implemented at all — only faked. | BR-DEC-03, BR-DEC-04, Q06 |
| Run idempotency key | Whether the client generates the key or the server returns the existing run decides the double-submit behavior in [Interaction Rules §5.4](interaction-rules.md#54-duplicate-submission-prevention). | BR-RUN-02, Q05 |

### Further contract constraints already fixed by this document set

- Run status uses exactly the five states in [Information Architecture §5](information-architecture.md#5-status-vocabulary). The contract must not introduce a sixth state or a cancel transition.
- The position contract returns lifecycle status as `draft`, `open`, or `closed` for display and filtering. V1 defines no lifecycle-transition endpoint or frontend control.
- A ranking response contains results from exactly one run (BR-RUN-03), so pagination must carry the run identity.
- Error payloads must supply what [Interaction Rules §4.3](interaction-rules.md#43-error-messages) needs — what failed, why, and the recruiter's next action — without stack traces, prompts, or infrastructure detail (Q10).
- Evidence responses must identify the CV version and source location, and an unmappable quote must be returned as invalid rather than as evidence (BR-EVD-01).
- API and frontend contracts must keep raw CV content and contact details out of URLs, client telemetry, notifications, client errors, and persistent browser storage. A resource requested under the wrong position context must not expose data from the other position (Q11); authentication and RBAC remain outside v1.

## 4. Phase 3 — Functional integration

Replace fixtures with backend state one resource at a time, then verify behavior that cannot be demonstrated before integration:

| Verification | Requirement |
|---|---|
| Repeated start actions produce one logical run | US-07.AC-3, BR-RUN-02, Q05 |
| Reload during a run resumes the same run | US-08.AC-1 |
| One technical failure does not stop the remaining CVs and is reported separately from failed eligibility | US-08.AC-2, BR-EVD-03, Q03 |
| A ranking response never mixes two runs | US-11.AC-2, BR-RUN-03, Q04 |
| A stale decision is rejected without writing to another run | US-13.AC-5, BR-DEC-03, Q06 |
| A failed rescore leaves the previous published ranking current | US-15.AC-2, BR-RSC-02 |
| A historical run is read from its own snapshots | US-16.AC-2, BR-RSC-03 |

## 5. Screen dependency summary

Every row requires backend capability. The last column states only what can be demonstrated from fixtures during phase 1.

| Screen | Backend capability required | Presentable from fixtures in phase 1 |
|---|---|---|
| SCR-01 | Position storage and listing | Layout, list/empty/loading/error states, readiness-driven row action |
| SCR-02 | Position and JD persistence | Form, validation, unsaved-change dialog |
| SCR-03 | Criteria suggestion and revision approval | Criterion editor, weight-total validation, draft and failure states |
| SCR-04 | Upload, format validation, duplicate detection, parsing | Upload area, file table, per-file status and filters |
| SCR-05 | Run lifecycle, snapshots, idempotency | Readiness card, progress layout, terminal-state presentation |
| SCR-06 | Published ranking from one consistent run | Ranking table, eligibility grouping, filters, states |
| SCR-07 | Evidence retrieval, decision write, concurrency | Two-pane layout, criterion rows, confirmation dialogs |
| SCR-08 | Immutable run history | Run table, status distinctions, comparison selection |
| SCR-09 | Revision creation from a base revision | Change summary and before/after presentation |
| SCR-10 | Two comparable published runs | Comparison header, change summary, aligned table |

Back to the [UI/UX index](README.md).
