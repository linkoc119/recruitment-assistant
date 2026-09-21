# Backend runtime decision — Next.js and TypeScript

Version 1.0 · 2026-09-16 · Next.js selected by the project owner; deployment details below are the API design baseline.

## Decision and scope

**Process topology, locked:** the API Route Handler process is separate from the Worker process; they coordinate only through a lease/command table in PostgreSQL, and no message broker is introduced. C2, C3, and the deployment view show two application containers/processes, not one.

Implement the public [OpenAPI 3.0 contract](../api/openapi.yaml) with Next.js App Router Route Handlers and TypeScript on the Node.js runtime. Keep three logical tiers: HTTP handlers/validation, application/domain services, and persistence repositories. AI and document parsing use server-only adapters. This records the selected technology; backend code is not present yet.

Use a self-hosted Node.js server for requests and a separately supervised Node.js worker sharing application services and PostgreSQL. The worker polls durable extraction/run work and claims expiring leases. It survives HTTP request completion and resumes committed work after restart. No new broker is required for this baseline. Never rely on unawaited handler promises or browser state for durable execution. API acceptance occurs only after committing the work.

Next.js supports Route Handlers for backend endpoints; some hosting environments constrain execution lifetime and shared process state. The separate durable worker is this project's design response to Q05. See [Next.js backend guide](https://nextjs.org/docs/app/guides/backend-for-frontend). A Node.js self-hosted deployment supports the full framework and permits explicit proxy configuration; see [self-hosting](https://nextjs.org/docs/app/guides/self-hosting).

A static HTML export alone cannot host this API. The frontend is vanilla TypeScript served as static files; choosing Next.js for the API does not claim a completed React migration. Serve UI and API behind one origin, or configure a restricted development origin explicitly. Today the backend sends no CORS headers, and the frontend dev server supplies the single origin by proxying `/api` to it.

## Operational baseline

- Persist files outside application build/public directories and validate nested position context before delivery.
- Explicitly disable sensitive response caching in handlers and any proxy. Set no-store for errors and files too.
- Stream batch uploads; configure proxy/body limits for the documented maximum. Use a streaming multipart parser rather than buffering a 200-file batch.
- CV parsing/AI and screening run in the worker. JD suggestions are a bounded synchronous call with the existing 30-second per-attempt / three-attempt transient-retry policy. Cap inter-attempt waits at 10 seconds and the overall suggestion operation at 115 seconds; configure the self-hosted proxy above that deadline. On deadline return a safe 503 and preserve manual entry. Do not add infinite provider retries.
- Use PostgreSQL constraints/transactions, decimal arithmetic, durable command replay and snapshot reads as specified in the API guide. API/worker share versioned scoring and extraction policy code.
- Detailed deployment capacity, migrations, package versions and implementation test results remain to be produced.

## Superseded architecture details

C2, C3, and deployment now show the Next.js API and the separate Node.js/TypeScript worker described above; their earlier Python/FastAPI and in-process-worker labels are gone. SEQ-01 now shows the separate worker and durable extraction queue. The older SEQ-02/SEQ-03 views still narrate an in-process pipeline for readability — treat their step order and invariants as authoritative and their process boundaries as superseded by this decision until they are redrawn.

Earlier endpoint sketches are illustrative; [openapi.yaml](../api/openapi.yaml) now defines the canonical position-scoped paths, version fields and errors. In particular, ranking reads use POST with a query body to keep search text out of URLs. No requirement or score policy is replaced by this runtime decision.

[Back to architecture](README.md)

## Durable extraction and scoring storage

[The accepted extraction-job decision](extraction-jobs.md) uses `resume_extraction_jobs` for CV extraction and `screening_runs` / `screening_run_items` for scoring. Workers poll both durable work types without blocking an execution slot while awaiting extraction. One active extraction is shared per immutable resume; each work type has its own fenced lease. Upload/reprocess commit extraction work before acknowledgment; public screening still requires parsed CVs and rescore never enqueues extraction. Production adapters and migrations remain to be implemented.

### Current milestone: in-memory store, single process

Checklist item 7 uses in-memory repositories and mock AI — no PostgreSQL, real AI calls or deployment. `backend/src/instrumentation.ts` initializes the canonical mock skill dictionary and starts `backend/worker/src/runner.ts` in the Next Node process. This follows the [Next.js instrumentation startup hook](https://nextjs.org/docs/15/app/guides/instrumentation). HTTP handlers commit queued work; the independent in-process loop polls every 250 ms and invokes the extraction/screening/rescore tasks. Delayed retries are picked up on later passes; passes do not overlap, task errors are isolated, and the stop function waits for active work.

The mock tables, ID counters, locks, files, AI adapter, idempotency store and runner registration use process-wide state shared across Next bundles and development reloads. Restart the server after editing worker code to reload the running loop. Dedicated worker tests cover claims, lease fencing, retries, rescore and loop lifecycle. `npm run test:http -w @app/backend` verifies the main workflow against a running Next server using real HTTP.

This is an explicit single-process exception for the mock milestone, not the durable two-process topology described above. Starting the worker CLI separately sees an empty store. Process restart loses all mock data and queued work; serverless and multiple API processes are unsupported until shared persistent adapters are implemented. The API includes revision/run history, position-scoped candidate identities, frozen source/file access, run comparison and explicit extraction recovery. The new frontend remains a separate workstream.
