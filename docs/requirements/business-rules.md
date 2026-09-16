# Business Rules — CV screening and ranking

Version 1.0 · 2026-09-15 · Proposed policy derived from [arc42 §8](../architecture/arc42.md#8-cross-cutting-concepts).

These rules apply across user stories. They describe business invariants and observable consistency; implementation mechanisms such as transactions, leases, queues, hashes and API status codes remain in the architecture and API design.

## Criteria

| ID | Rule | Source |
|---|---|---|
| BR-CRI-01 | An approved criteria set contains at least one criterion. Every weight is positive and the decimal total is exactly 100. A draft may contain weight 0 but cannot be approved in that state. | arc42 §8.3 |
| BR-CRI-02 | Criterion kind is skill, experience or education. Policy v1 permits at most one experience and one education criterion; experience requires `min_years > 0`, and education requires a degree level. | arc42 §8.3 |
| BR-CRI-03 | Two skill criteria cannot resolve to the same canonical skill. If the JD has no education requirement, the system does not invent one. | arc42 §8.3 |
| BR-CRI-04 | Approving an initial set creates revision 1. Approving later changes creates revision N+1 and never alters a previously approved revision. | F01, F06, ADR-04 |
| BR-CRI-05 | In policy v1, weight distributes points within the skill group. Experience and education weights do not change the group coefficients; the interface must not present weight as maximum contribution. | arc42 §8.3, ADR-07 |

## CV, identity and evidence

| ID | Rule | Source |
|---|---|---|
| BR-CV-01 | Uploading identical file content to the same position does not add the same CV to that position's screening set twice. | F02 |
| BR-CV-02 | Different CV content accepted for an identified candidate is a new version. Existing screening history continues to reference the version used at that time. | F02, ADR-04 |
| BR-CV-03 | A matching name alone is insufficient to merge two candidate identities. Ambiguous identity requires recruiter review under decision D-02. | F02, D-02 |
| BR-EVD-01 | Extracted facts and quotes are accepted only when they can be mapped to the correct JD/CV source snapshot. Invalid or fabricated evidence is rejected. | arc42 §8.4 |
| BR-EVD-02 | A full skill match requires a canonical name or alias plus evidence of use. Listing without sufficient evidence of use is partial; no valid evidence is missing. Missing evidence must not be phrased as proof that the candidate lacks an ability. | arc42 §8.4 |
| BR-EVD-03 | A technical read/extraction failure is separate from missing evidence and from failing a mandatory criterion. It must not create a zero score or a rejection decision. | F02, Q03 |

## Eligibility, scoring and ranking

| ID | Rule | Source |
|---|---|---|
| BR-ELG-01 | Mandatory eligibility passes only when every mandatory criterion has sufficient evidence and meets its threshold. Partial skill, below-threshold experience and unclear education fail their mandatory criterion. | arc42 §8.3 |
| BR-ELG-02 | Mandatory eligibility, score and human decision are separate results. A high score can coexist with failed mandatory eligibility; failed eligibility never automatically means rejected. | F03, F05 |
| BR-SCR-01 | Skill = `100 × Σ(weight × match) / Σ(skill weight)`, where match is 1, 0.5 or 0. Experience = `80 × min(years/min_years, 1.25)`. Education = 100 when meeting/exceeding the requirement, 50 one level below, otherwise 0. | arc42 §8.3 |
| BR-SCR-02 | Base group coefficients are skill 0.55, experience 0.30 and education 0.15. An absent group is removed and remaining coefficients are normalized to sum to 1. Semantic score is not applied in policy v1. | arc42 §8.3 |
| BR-SCR-03 | Employment duration uses non-overlapping months divided by 12. Ambiguous periods are missing evidence; values such as “5.3” are not interpreted as 5 years 3 months. Degree order is vocational → college → bachelor → master → doctorate for the proposed technical lookup. | arc42 §8.3 |
| BR-SCR-04 | Store calculations at full precision and display two decimals. Allocate a 0.01 display remainder by largest fractional remainder, breaking a tie by criterion ID, so displayed contributions sum to displayed total. | arc42 §8.3 |
| BR-RNK-01 | Rank by mandatory eligibility descending, displayed total score descending and `resume_id` ascending. Age, gender and data outside the JD are not tie-breakers. | arc42 §8.3 |

## Screening runs and publication

| ID | Rule | Source |
|---|---|---|
| BR-RUN-01 | Every run uses immutable snapshots of its approved criteria revision, selected CV versions and scoring policy. Later edits do not change a finished run. | F03, ADR-04 |
| BR-RUN-02 | A position has at most one active screening run. Repeating the same start action does not create another logical run. | Q05 |
| BR-RUN-03 | A published ranking contains results from exactly one run. A failed publication leaves the previously published run unchanged. | Q04, ADR-04 |
| BR-RUN-04 | A first run may publish successful CVs and list technical failures separately. If no CV succeeds, no new ranking is published. | F03, Q03 |

## Human decisions

| ID | Rule | Source |
|---|---|---|
| BR-DEC-01 | Shortlist/reject belongs to one screening result and is a recruiter decision. It does not alter score, mandatory eligibility or evidence. | F05, arc42 §8.5 |
| BR-DEC-02 | A recruiter may shortlist a candidate who failed mandatory eligibility after seeing the failed criteria and confirming. A recruiter may reject a candidate who passed or has a high score. | F05, SEQ-02 |
| BR-DEC-03 | A decision can be recorded only against the currently published run and current result version. A decision based on stale data is rejected without writing it to another run. | Q06, arc42 §8.5 |
| BR-DEC-04 | Concurrent decision changes must not silently overwrite one another. Repeating the same decision against the current result may return the existing state. | arc42 §8.5 |
| BR-DEC-06 | In v1, only scored → shortlisted/rejected is allowed. No undo or switch is allowed; a current-version identical retry may return the existing state without changing its timestamp/version. | D-05 |
| BR-DEC-05 | Decisions remain readable in their original run. A newly published run starts each result in `scored`; decisions are not carried forward automatically. | ADR-06 |

## Rescoring and history

| ID | Rule | Source |
|---|---|---|
| BR-RSC-01 | Criteria-only rescoring uses exactly the successful CV snapshots of its source run and one newly approved criteria revision under the same scoring policy. It does not add a new CV version or a CV that failed in the source run. | F06, SEQ-03 |
| BR-RSC-02 | A rescoring run replaces the published run only when every CV in the required source set succeeds. Otherwise the previous published run remains current. | F06, Q04 |
| BR-RSC-03 | Historical criteria, CV snapshots, scores, eligibility, evidence and decisions are read from the selected run; history is never rebuilt from current data. | F04, F06 |
| BR-RSC-04 | Two runs can be compared only within the same position. Results align by resume/CV snapshot identity; absence from one run is shown as absent, never as a fabricated score or rank. | F06 |

Back to [requirements and user stories](README.md).
