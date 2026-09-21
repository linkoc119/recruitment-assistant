# UI Traceability

Version 1.0 · 2026-09-15

This matrix connects every INVEST user story to its use case, user flow, and target screen. Detailed business-rule and quality mappings remain authoritative in the [requirements traceability matrix](../requirements/traceability.md).

## Story coverage

| Feature | Story | Use case | User flow | Primary screen | Supporting screen/result |
|---|---|---|---|---|---|
| F01 | US-01 — Create Position and JD | UC-01 | UF-01 | SCR-02 | SCR-01 |
| F01 | US-02 — Suggest Criteria from the JD | UC-02 | UF-01 | SCR-03 | SCR-02 |
| F01 | US-03 — Review and Approve Criteria | UC-03 | UF-01 | SCR-03 | SCR-04 becomes available after approval |
| F02 | US-04 — Upload a CV Batch | UC-04 | UF-02 | SCR-04 | Ready CVs become selectable for a run in SCR-04 |
| F02 | US-05 — Detect Duplicate Files and CV Versions | UC-04 | UF-02 | SCR-04 | File-level resolution state |
| F02 | US-06 — Parse a CV with Evidence | UC-05 | UF-02 | SCR-04 | SCR-07 evidence after evaluation |
| F03 | US-07 — Start a Screening Run | UC-06 | UF-03 | SCR-04 | SCR-05 follows the created run; SCR-03/09 start a rescore |
| F03 | US-08 — Track Screening Progress | UC-07 | UF-03 | SCR-05 | SCR-08 historical terminal state |
| F03 | US-09 — Evaluate Mandatory Criteria | UC-08 | UF-03 | SCR-06 | SCR-07 criterion explanation |
| F03 | US-10 — Calculate Scores and Contributions | UC-08 | UF-03 | SCR-06 | SCR-07 score breakdown |
| F03 | US-11 — View Ranking | UC-09 | UF-03 | SCR-06 | SCR-07 candidate drill-down |
| F04 | US-12 — Inspect Candidate Evidence | UC-10 | UF-04 | SCR-07 | CV source preview |
| F05 | US-13 — Record Candidate Decision | UC-11, UC-12 | UF-04 | SCR-07 | SCR-06 decision summary |
| F06 | US-14 — Adjust and Version Criteria | UC-13 | UF-05 | SCR-09 | SCR-03 shared criterion editor |
| F06 | US-15 — Rescore the Existing CV Set | UC-14 | UF-05 | SCR-03/SCR-09 | SCR-05 follows the run; SCR-08 run history |
| F06 | US-16 — View Screening History | UC-15 | UF-06 | SCR-08 | SCR-07 historical result |
| F06 | US-17 — Compare Screening Runs | UC-16 | UF-06 | SCR-10 | SCR-08 run selection |

## Screen coverage

| Screen | User goal | Input | Successful outcome |
|---|---|---|---|
| SCR-01 | Find or create a position | Position collection | Position selected or creation started |
| SCR-02 | Define a position and its JD | Position/JD draft | Stored position with original JD |
| SCR-03 | Produce an approved criteria revision | JD and criteria draft | Approved revision 1 |
| SCR-04 | Prepare a reliable CV set | Uploaded files | CVs ready for screening with item-level status |
| SCR-05 | Monitor a run that already exists | A created run | Terminal run and published result when valid |
| SCR-06 | Review the current ranked outcome | Published run | Candidate selected for evidence review |
| SCR-07 | Verify one result and record judgment | Run result and CV evidence | Evidence understood and optional human decision stored |
| SCR-08 | Audit run history | Position runs | Historical run/result opened or runs selected for comparison |
| SCR-09 | Define a new criteria revision | Approved base revision | New approved revision ready for rescore |
| SCR-10 | Understand differences between runs | Two comparable runs | Changed criteria and outcomes explained |

## Flow-to-screen coverage

| Flow | Start | Core path | End |
|---|---|---|---|
| UF-01 — Position, JD, and criteria approval | SCR-01 | SCR-02 → SCR-03 | SCR-04 |
| UF-02 — CV upload and preparation | SCR-04 | File validation → duplicate/version resolution → parsing | A selectable set of ready CVs in SCR-04 |
| UF-03 — Initial screening and publication | SCR-04 | Select and start → SCR-05 progress → publication | SCR-06 |
| UF-04 — Evidence review and decision | SCR-06 | SCR-07 evidence and decision | SCR-06 with updated decision |
| UF-05 — Criteria revision and rescore | SCR-06 or SCR-08 | SCR-09 → SCR-05 | SCR-06 or SCR-08 |
| UF-06 — History and comparison | SCR-08 | Historical SCR-07 or SCR-10 | SCR-08 |

## Coverage conclusions

- All 17 in-scope user stories have a target screen and a user flow.
- All 16 use cases are represented; UC-11 and UC-12 share the decision UI in SCR-07.
- Every target screen has an entry source, a successful outcome, and a detailed specification.
- Future-work capabilities have no target screen and therefore create no accidental implementation commitment.
- The current prototype route mapping is documented separately in [Screen Hierarchy](screen-hierarchy.md#6-relationship-to-the-current-prototype).

Back to the [UI/UX index](README.md).
