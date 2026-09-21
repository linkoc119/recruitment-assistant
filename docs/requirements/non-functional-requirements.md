# Non-functional requirements

Version 1.0 · 2026-09-15 · Proposed acceptance targets. Only Q07 has been measured so far, and only against the in-memory store — see the [Phase 3 verification](../ui-ux/phase-3-verification.md) for what each target does and does not yet cover.

The stable identifiers remain Q01–Q11 from [arc42 §10](../architecture/arc42.md#10-quality-requirements). `NFR-*` labels group them by quality attribute and do not replace their IDs.

| Group | ID | Observable requirement and verification | Stories |
|---|---|---|---|
| NFR-AUD — Auditability | Q01 | Every criterion in the annotated synthetic set has a status/reason and evidence tied to the correct snapshot; inspect 100% of rows. | US-06, US-12, US-16 |
| NFR-AUD — Reproducibility | Q02 | The same input snapshot and policy produce identical scores, eligibility and ordering. | US-09, US-10, US-15 |
| NFR-REL — Reliability | Q03 | With one corrupt PDF among 42 files, the other 41 continue if valid; report the failed file separately from failed eligibility. | US-06, US-08 |
| NFR-REL — Consistency | Q04 | During publication, every ranking response contains all R1 or all R2; a failed publication preserves R1. | US-11, US-15 |
| NFR-REL — Recovery | Q05 | Repeating a screening command and restarting processing still produces one logical run without duplicate item results; verify by interruption and restart. | US-07, US-08 |
| NFR-REL — Concurrency | Q06 | A decision made from stale results is rejected and no decision is written to another/current run; verify with concurrent views. | US-13; BR-DEC-03, BR-DEC-04 |
| NFR-PERF — Performance | Q07 | On the proposed trial machine, 10 users read a ranking of up to 200 results with P95 below 2 seconds over 100 post-warm-up measurements, excluding file and AI processing. | US-11 |
| NFR-UX — Accessibility | Q08 | Status remains understandable without colour and main actions are keyboard-operable; inspect greyscale, labels, focus and tab order. | All interactive stories |
| NFR-REC — Recoverability | Q09 | A restore keeps database, files and manifest consistent, with RPO ≤ 24 hours and RTO ≤ 4 hours; verify by a restore rehearsal. | Stored data across the workflow |
| NFR-SEC — Security/observability | Q10 | Failures are traceable by request/run/item and cause while logs contain no raw CV, contact details or credentials; inspect logs with marked synthetic data. | US-02, US-04, US-06–08, US-15 |
| NFR-SEC — UI data exposure | Q11 | Raw CV content and contact details do not appear in URLs, analytics labels, notifications, client-side error messages, or persistent browser storage; a resource requested under the wrong position context does not expose data from the other position. Verify with marked synthetic data, browser-storage inspection, captured client telemetry, and cross-position context tests. | US-04, US-11, US-12 |

Mechanisms such as database transactions, leases, retry counts, queues, polling, optimistic locking and API status codes are specified in architecture/sequence documents and the [OpenAPI contract](../api/openapi.yaml).

Back to [requirements and user stories](README.md).
