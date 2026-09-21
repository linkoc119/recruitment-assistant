# Part 2 — Information Architecture and Screen Design

Version 1.0 · 2026-09-15 · **Target product design. All ten screens are now built and wired to the API; where the delivered routes differ from the canonical paths, the [screen hierarchy](screen-hierarchy.md#22-delivered-routes) records the delivered binding.**

## Purpose

This document set defines how recruiters navigate and use the JD-based CV screening and ranking workflow before the frontend is restructured. It expands the interface where the workflow needs a distinct user goal, while remaining inside F01–F06 and US-01–US-17.

The design is intentionally independent of the original seven-route prototype, which was removed from the repository in commit `9cafcbf` (2026-09-17). Its routes and screens were migration inputs, not constraints on this information architecture.

## Scope

Included:

- create a position and preserve its original JD;
- generate, review, edit, and approve criteria;
- upload CVs and understand duplicates, versions, parsing, and failures;
- start and monitor screening runs;
- view a published ranking and inspect criterion evidence;
- record shortlist/reject decisions;
- create a new criteria revision, rescore, view history, and compare runs.

Excluded:

- authentication, RBAC, multi-tenancy, and account administration;
- candidate portal, interviews, offers, communication, and scheduling;
- analytics dashboards and executive reporting;
- interactive skill-dictionary administration;
- OCR and semantic/embedding search;
- multi-level shortlist approval.

Excluded work may appear only under future extension points. It has no route, navigation item, screen specification, or acceptance commitment in this version.

## Documents

| Document | Purpose |
|---|---|
| [Information Architecture](information-architecture.md) | Content model, navigation model, terminology, findability, and state distinctions |
| [Screen Hierarchy](screen-hierarchy.md) | Target sitemap, screen ownership, routes, entry points, and requirement mapping |
| [User Flows](user-flows.md) | Primary and exception paths across screens |
| [Screen Specifications](screen-specifications.md) | Detailed purpose, content, actions, validation, states, and traceability for every screen |
| [Interaction and UI/UX Rules](interaction-rules.md) | Shared behavior, feedback, accessibility, responsive layout, tables, forms, and dialogs |
| [UI Traceability](traceability.md) | Story-to-flow-to-screen coverage and implementation handoff status |
| [Implementation Plan](implementation-plan.md) | Build sequencing, fixture rules, API-contract decisions, and per-screen backend dependency |
| [UI Improvement Plan](ui-improvement-plan.md) | Phase 1 presentation sub-plan for `frontend/`: ordered design-review fixes (Vietnamese) |
| [Phase 3 Integration Verification](phase-3-verification.md) | Confirmed Phase 3 acceptance for the in-memory/mock scope, recorded test evidence, and subsequent production gates |

## Sources and precedence

1. [Requirements and INVEST backlog](../requirements/README.md) define user value and acceptance criteria.
2. [Business Rules](../requirements/business-rules.md) define cross-cutting invariants.
3. [Non-functional Requirements](../requirements/non-functional-requirements.md) define quality targets Q01–Q11.
4. [Use Cases](../requirements/use-cases.md) define actors, preconditions, outcomes, and alternate flows.
5. [arc42](../architecture/arc42.md) defines policy v1 and proposed system behavior.
6. The removed `index.html` prototype is evidence of an earlier UI concept only; it is no longer in the repository.

When sources conflict, the requirements and arc42 policy take precedence over prototype labels, sample scores, navigation, and mock state.

## Design principles

- Keep the recruiter in control: suggestions remain drafts and scores never become hiring decisions.
- Make every score inspectable from the ranking to the exact source evidence.
- Keep eligibility, score, processing health, and recruiter decision visibly separate.
- Keep one stable published ranking visible while another run is processing.
- Preserve historical context: every run shows its criteria revision and CV snapshots.
- Use progressive disclosure: ranking first, criterion detail on demand, raw CV evidence when requested.
- Communicate errors at the affected item and summarize them at the batch/run level.
- Use plain recruitment language; hide storage, worker, adapter, table, and transaction terminology.

## Deliverable status

The documentation is suitable for product review, wireframing, frontend route planning, and API/data-contract design. The rebuilt frontend now implements all ten screens against the API; which acceptance criteria that does and does not satisfy is recorded in the [Phase 3 verification](phase-3-verification.md). No screen in this set can be completed by presentation code alone — see the [Implementation Plan](implementation-plan.md).
