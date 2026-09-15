# Requirements traceability

Version 1.0 · 2026-09-15

This matrix connects the requirement levels without forcing every story to invent a business rule or quality target. A dash means the story relies only on its own acceptance criteria at that level.

| Feature | User story | Use case | Business Rules | Quality requirements |
|---|---|---|---|---|
| F01 | US-01 — Create Job & JD | UC-01 | — | Q08 |
| F01 | US-02 — Suggest Criteria from JD | UC-02 | BR-CRI-03, BR-EVD-01 | Q08, Q10 |
| F01 | US-03 — Review & Approve Criteria | UC-03 | BR-CRI-01, BR-CRI-02, BR-CRI-03, BR-CRI-04, BR-CRI-05 | Q08 |
| F02 | US-04 — Upload CV Batch | UC-04 | BR-CV-01, BR-EVD-03 | Q03, Q08, Q10 |
| F02 | US-05 — Detect Duplicate / CV Version | UC-04 | BR-CV-01, BR-CV-02, BR-CV-03 | Q08 |
| F02 | US-06 — Parse CV with Evidence | UC-05 | BR-EVD-01, BR-EVD-02, BR-EVD-03 | Q01, Q03, Q10 |
| F03 | US-07 — Start Screening Run | UC-06 | BR-RUN-01, BR-RUN-02 | Q05, Q08, Q10 |
| F03 | US-08 — Track Screening Progress | UC-07 | BR-EVD-03, BR-RUN-03, BR-RUN-04 | Q03, Q05, Q08, Q10 |
| F03 | US-09 — Evaluate Mandatory Criteria | UC-08 | BR-EVD-02, BR-EVD-03, BR-ELG-01, BR-ELG-02 | Q02 |
| F03 | US-10 — Calculate Score & Contributions | UC-08 | BR-SCR-01, BR-SCR-02, BR-SCR-03, BR-SCR-04 | Q02 |
| F03 | US-11 — View Ranking | UC-09 | BR-RNK-01, BR-RUN-03 | Q04, Q07, Q08 |
| F04 | US-12 — Inspect Candidate Evidence | UC-10 | BR-EVD-01, BR-EVD-02, BR-EVD-03, BR-RSC-03 | Q01, Q08 |
| F05 | US-13 — Record Candidate Decision | UC-11, UC-12 | BR-ELG-02, BR-DEC-01, BR-DEC-02, BR-DEC-03, BR-DEC-04, BR-DEC-05 | Q06, Q08 |
| F06 | US-14 — Adjust & Version Criteria | UC-13 | BR-CRI-01, BR-CRI-02, BR-CRI-03, BR-CRI-04, BR-CRI-05 | Q08 |
| F06 | US-15 — Rescore Existing CV Set | UC-14 | BR-RUN-03, BR-RSC-01, BR-RSC-02 | Q02, Q04, Q10 |
| F06 | US-16 — View Screening History | UC-15 | BR-DEC-05, BR-RSC-03 | Q01, Q08 |
| F06 | US-17 — Compare Screening Runs | UC-16 | BR-RSC-04 | Q08 |

## Coverage checks

- F01–F06 each map to at least one story and one use case.
- US-01–US-17 each map to a feature and use case.
- Every referenced BR is defined in [Business Rules](business-rules.md).
- Every referenced Q ID is defined in [Non-functional requirements](non-functional-requirements.md) and retains the same identifier as arc42 §10.
- US-09 and US-10 remain separate business outcomes while sharing the internal evaluation use case UC-08.
- UC-11 and UC-12 remain separate user actions while sharing the decision capability US-13.

Back to [requirements and user stories](README.md).
