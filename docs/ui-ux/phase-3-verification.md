# Phase 3 integration verification

Updated: 2026-09-21. Scope: the live HTTP API, process-local repositories and mock extraction. This is not certification of production persistence or real PDF/DOCX/AI extraction.

## Acceptance status

**Hệ thống đã được xác nhận và nghiệm thu Phase 3 — hoàn tất trong scope in-memory/mock, ngày 2026-09-21.** The original acceptance was a confirmed user decision. A subsequent technical audit reproduced and fixed worker error-data leakage, mobile layout overflow, modal keyboard focus escape and a saved-draft rescore failure. Per-item review navigation is now implemented. The follow-up evidence below distinguishes automated regression tests from manual browser checks; it does not certify production infrastructure or real extraction.

## Implementation

All ten logical screens now use HTTP data and generated `@app/api-types` models. SCR-03 and SCR-09 share the criteria editor. Runtime screens, router and shell no longer import fixtures; `frontend/src/fixtures/` is kept as reference sample data only and is loaded by nothing at runtime. The frontend server proxies `/api` to the backend, including multipart uploads and original-file downloads.

The client provides abort-on-navigation, loading/error/retry states, in-memory idempotency keys for uncertain retries, explicit approval, an accessible modal rather than a native prompt for candidate decisions (SCR-06, SCR-07) and for replacing criteria with AI suggestions (SCR-03), versioned writes, background polling, pinned historical run links, ranking pagination with decision epochs, and source highlighting using Unicode code-point offsets. CV/contact content is not written to URLs or persistent browser storage.

Two native dialogs remain by design and are not covered by the modal statement above: `canLeave()` in [`frontend/src/lib/screen.ts`](../../frontend/src/lib/screen.ts) uses `window.confirm` before discarding unsaved edits on in-app navigation, and the matching `beforeunload` handler raises the browser's own dialog on reload or close. Neither carries CV content, and `beforeunload` cannot be styled at all, so a custom modal there would leave the two paths inconsistent.

Integration exposed backend gaps fixed in this change: ranking filters now apply before pagination; an initial partial-success run publishes successful results; failed rescores retain the previous publication; decisions and publication share the job lock, with one epoch increment per successful decision; experience/education details carry the evidence from their frozen extraction facts. One further contract fix: ranking and result identity fields (name, email, phone) are now read from the immutable CV snapshot instead of the current candidate record, as the contract requires. They therefore describe the CV as submitted, may differ from present candidate metadata, and may be null.

## Repeatable checks

```sh
npm test -w @app/backend
npm test -w @app/frontend
npm run typecheck --workspaces --if-present
npm run dev -w @app/backend -- --hostname 127.0.0.1 --port 3100
# Separate terminal:
npm run test:http -w @app/backend
npm run bench:ranking -w @app/backend   # Q07; measure against `npm run start`, not `dev`
npm run dev -w @app/frontend
```

Backend: 111 tests. Frontend: 8 tests, including uncertain retries, multipart boundaries, cancellation, pagination, safe stale-error messages, untrusted error metadata, escaped run-review content and workspace links. New backend tests capture worker/poll/HTTP failure logs and reject synthetic private-data markers. All four workspace typechecks and the Next production build pass. The HTTP script creates synthetic data and drives the real in-process worker; no direct store access is used.

Browser verification complements these tests. It is a one-off manual interactive session, not an automated browser regression suite: the steps below can be repeated by hand, but no scripted scenario reproduces them and no assertion fails if the behavior regresses.

Manual browser checks on 2026-09-20 (single session, self-reported): opened a server-backed position/ranking; explicitly shortlisted a failed-mandatory synthetic CV; changed the canonical skill and approved revision 3; started rescore and observed run 3 become current; compared runs 2 and 3; opened the historical result with its retained shortlist and disabled decision buttons. A competing HTTP decision then made an open current result stale: the UI displayed `stale_result` plus request ID, and refresh showed the saved final decision with controls disabled. Candidate detail was visually inspected in the two-pane layout; no console errors were reported in that check.

Manual browser checks on 2026-09-21 created a fresh position and approved criteria, inspected both initial and rescore review cards, cancelled with Escape/Go back, confirmed a 200-CV rescore, reloaded its run-ID route, checked the review at 390 × 844, and verified the full-screen network error followed by a successful Retry after the backend returned. The worker completed all 200 items before reload, so this session proved route recovery to authoritative terminal state but did not visually capture the intermediate `running` state.

`bench:ranking` builds a 200-result published ranking from synthetic CVs and then times only the ranking reads, as Q07 excludes file and AI processing. It must be pointed at a production build (`npm run build` then `npm run start`): under `next dev` the same run showed P95 between 300 ms and 1.2 s with spikes that moved between scenarios, which measures the dev server rather than the read path.

`frontend/tests/fixtures/*.pdf` are deliberately plain-text mock-parser inputs, not genuine PDFs. The initial browser session was blocked by the extension's file-URL permission. After the user enabled it, native selection of `browser-cv.pdf` followed by Upload returned `1 accepted`, then `parsed`. A fresh selection after reload returned `1 duplicate` without another CV. Native upload was repeated successfully after the follow-up fixes.

### Follow-up technical audit (2026-09-21)

- **Review navigation and command scope:** initial and rescore cards link each fact to the position, frozen revision/policy, CV workspace or source run. Clicking the revision opened the approved read-only snapshot; clicking the current CV workspace closed the modal without a command. Saving a rescore draft, reloading, approving and starting now works because the base run is loaded even when a draft exists. During an initial review of three CVs, a fourth CV was uploaded through HTTP; polling saw four, but confirmation created a run with exactly the three reviewed CVs. The initiating button stayed disabled while the dialog was open.
- **Active reload:** the test-only Next entrypoint below held a real worker after its first item became `processing`. Run 3 displayed `running`, `0 / 2`, one processing and one pending item before and after browser reload. Releasing the worker completed the same run and polling opened its published ranking. This is browser reload in the same server process, not restart durability. The normal production entrypoint contains no artificial delay.
- **Accessibility and mobile:** inspected ranking, criteria/revision, CV workspace, progress, candidate detail, history and comparison at 390 × 844. The content uses the viewport width; wide tables scroll in their own keyboard-focusable regions. Tab/Shift+Tab wrap inside review and decision dialogs; Escape closes them and restores the initiating control. Enter opens actions/evidence and Space selects history runs. The progressbar has an accessible value, and unchanged polls preserve focus. A temporary greyscale stylesheet was used to inspect ranking labels, eligibility divider and focus outline, then removed. This checks the stated Q08 interactions; it is not a full WCAG or screen-reader certification.
- **Q10/Q11:** the audit reproduced raw error-message/stack output from a failed worker claim. Worker logs now contain only an event, fixed failure code and task/job/resume/run identifiers. Unexpected HTTP errors return a 500 envelope and log its request ID without the original exception. Regression tests inject CV/contact/token markers into error messages and properties and assert their absence from captured logs and HTTP bodies. Client errors ignore arbitrary error codes and malformed request IDs. Static inspection found no app browser-storage, cookie, analytics or beacon writes; browser warning/error capture was empty during successful flows. Cross-position tests remain passing. No external telemetry collector exists in this scope; browser profile/storage inspection and production/provider telemetry are not claimed.

To reproduce the active-reload check after building the backend:

```sh
cd backend
node scripts/verify-browser-server.mjs  # default 127.0.0.1:3101
# Separate terminal, repository root:
# Set PORT=8081 and API_ORIGIN=http://127.0.0.1:3101 in your shell, then:
npm run dev -w @app/frontend
```

Use synthetic data, prepare an approved position and parsed CVs, type `hold` in the test-server terminal, then start a run through its review card. Reload while the screen says `running`; the run ID and item counts must remain unchanged. Type `release`; polling must show completion. The hold expires after 90 seconds (before the 120-second lease). The entrypoint uses the real Next routes and worker, with a test-only repository boundary pause. `test:http` also passed against this server with no hold enabled. These browser steps remain manual, not an automated browser suite.

## Story coverage

Rows marked *manual browser* rest partly on the one-off session described above, not on an automated check.

| Stories | Integrated behavior and evidence |
|---|---|
| US-01 | Position list/create/edit with optimistic versions; API tests and *manual browser* create |
| US-02–03 | Suggestions, manual criteria, exact weight validation, save and explicit approval; domain tests and *manual browser* |
| US-04–05 | Multipart batches, per-file outcomes, duplicate/new-version identity confirmation; HTTP/domain and client multipart tests. Native picker → upload → parsed and duplicate suppression verified in *manual browser* checks |
| US-06 | Poll parsed/failed state, retry extraction and show original snapshot; mock extraction only |
| US-07–08 | Explicit start, stable retry key, per-item review links, frozen reviewed CV selection, progress and separate technical failures; HTTP/worker tests and *manual browser* checks, including reload with a real worker held in `running` |
| US-09–10 | Server scores, eligibility and contributions; scoring golden cases and *manual browser* rendering |
| US-11 | Pinned ranking, eligibility divider, server filters, epoch pagination; domain tests and *manual browser* ranking |
| US-12–13 | Source quote highlight, download, final decisions and failed-mandatory confirmation; HTTP/domain tests and *manual browser* checks |
| US-14–15 | Explicit revision approval then rescore, frozen CV set and preservation on failure; domain/worker/HTTP tests |
| US-16–17 | Historical run/revision links, read-only results, selected-run comparison by CV/snapshot identity; HTTP tests and *manual browser* checks |

## Q01–Q11 assessment

| ID | Verified here / remaining acceptance |
|---|---|
| Q01 | Source identity, offsets, escaped quotes and immutable result source tested with synthetic data. Full annotated real-document corpus remains pending. |
| Q02 | Deterministic scoring golden cases and frozen-snapshot rescore pass. |
| Q03 | Technical failure isolation and initial partial publication tested. Real corrupt-PDF corpus requires a real parser. |
| Q04 | Responses select one run; failed-rescore preservation tested. Production database publication remains outside this implementation. |
| Q05 | Duplicate-command replay, worker lease/retry/reclaim and route-based reload supported/tested in process. Process restart durability requires persistence. |
| Q06 | Stale versions/current-run checks and concurrent conflicting decisions tested; explicit UI recovery through refresh/current ranking. |
| Q07 | Re-measured on 2026-09-21 with `bench:ranking` against a production build and the in-memory store: 10 concurrent readers, 100 post-warm-up measurements per scenario. P95 was 63.6 ms for the first page of 25, 65.9 ms for one page of 100, and 154.7 ms to read the whole 200-result ranking (two pages, since the contract caps a page at 100) against the 2 s budget. Machine: Ryzen 7 8745H, 16 logical cores, 23.3 GiB, Node 25. This is not acceptance. The trial machine and the production database are both absent, and the in-memory store is not a proxy for either: a real database adds network and query cost but also indexes, caching and different concurrency, so the direction of the change is not established by this run. File parsing and AI extraction are excluded from Q07 by definition, so their absence is part of the question's scope rather than a gap in the measurement. What this run supports is that the read path's own work — sort, filter, paginate and serialise up to 200 results — is far below the budget on this hardware. |
| Q08 | Scoped manual checks cover labels, text statuses/greyscale, Enter/Space actions, modal Tab/Shift+Tab/Escape, focus restoration, polling focus and mobile layout. Follow-up audit details above; not a full assistive-technology certification. |
| Q09 | Backup/restore rehearsal and RPO/RTO require persistent database and file storage; outside current scope. |
| Q10 | Worker/poll and unexpected HTTP errors have safe structured logs with correlation IDs; synthetic leakage regressions pass. Expected processing failures retain item error codes/phases. Production logging configuration remains outside scope. |
| Q11 | Synthetic errors are absent from captured logs/HTTP bodies and client notifications; search stays in request bodies, source renders as text, no app persistent browser-storage/analytics writes were found, and cross-position guards pass. Evidence is application-level, not browser-profile or external-provider telemetry inspection. |

Phase 3 is complete and accepted for the in-memory/mock milestone. Real-document corpus validation, production database and file persistence, backup/restore, and performance on the deployment target belong to subsequent scope; this acceptance does not certify those capabilities.
