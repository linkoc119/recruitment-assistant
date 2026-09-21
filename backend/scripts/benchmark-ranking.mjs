import assert from "node:assert/strict";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// Q07: "10 users read a ranking of up to 200 results with P95 below 2 seconds
// over 100 post-warm-up measurements, excluding file and AI processing."
// Setup below performs that excluded upload/extraction work; only the ranking
// reads after warm-up are timed. Needs a started server, like verify-http.
const base = process.env.API_BASE_URL ?? "http://127.0.0.1:3100";
const RESULTS = Number(process.env.BENCH_RESULTS ?? 200);   // ranking size
const USERS = Number(process.env.BENCH_USERS ?? 10);        // concurrent readers
const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 100);   // measurements per scenario
const WARMUP = Number(process.env.BENCH_WARMUP ?? 20);      // discarded operations
const BUDGET_MS = Number(process.env.BENCH_BUDGET_MS ?? 2000);
const MAX_PAGE = 100;                                       // OpenAPI limit maximum

async function call(path, { method = "GET", body, status = 200, key } = {}) {
  const headers = {};
  if (key) headers["Idempotency-Key"] = key;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}/api${path}`, {
    method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  assert.equal(res.status, status, `${method} ${path}: ${text}`);
  return JSON.parse(text);
}
const post = (path, body, status = 200) => call(path, { method: "POST", body, status, key: randomUUID() });
const rank = (root, body) => call(`${root}/ranking/query`, { method: "POST", body });

async function until(label, read, predicate, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await delay(250);
  } while (Date.now() < deadline);
  assert.fail(`Timed out waiting for ${label}: ${JSON.stringify(value).slice(0, 400)}`);
}

// ---------------------------------------------------------------- setup
console.log(`Preparing a published ranking of ${RESULTS} results...`);
const setupStarted = Date.now();
const job = await post("/jobs", { title: `Q07 benchmark ${randomUUID()}`, jd_raw_text: "TypeScript required", level: null }, 201);
const root = `/jobs/${job.id}`;

const skills = await call("/skills?limit=100");
const skill = skills.items.find(s => s.name === "TypeScript");
assert.ok(skill, "Missing canonical skill TypeScript");
const current = await call(root);
const draft = await call(`${root}/criteria-draft`, {
  method: "PUT", key: randomUUID(),
  body: {
    expected_draft_version: 0, expected_revision: 0, expected_job_version: current.version,
    criteria: [{ criterion_key: "skill-1", kind: "skill", label: "TypeScript", skill_id: skill.id, req_type: "mandatory", weight: "100", source: "manual" }],
  },
});
await post(`${root}/criteria-revisions`, {
  expected_draft_version: draft.version, expected_revision: 0, expected_job_version: current.version,
}, 201);

// Deliberately text bytes with a PDF MIME label: the accepted mock parser.
// The year count varies only so each CV is a distinct document with its own
// file hash. It does not vary the score: the single criterion is the TypeScript
// skill, so every candidate scores the same and the ranking falls back to the
// resume_id tiebreak. That is fine here — the measurement is the read path over
// 200 rows, not score diversity.
const form = new FormData();
const manifest = [];
for (let i = 0; i < RESULTS; i++) {
  const text = `Candidate ${i}. Built production services using TypeScript for ${1 + (i % 12)} years.`;
  form.append("files", new Blob([text], { type: "application/pdf" }), `bench-${i}.pdf`);
  manifest.push({ client_file_id: `bench-${i}`, file_index: i, identity_mode: "new_candidate" });
}
form.append("manifest", JSON.stringify(manifest));
const upload = await post(`${root}/resume-batches`, form);
assert.equal(upload.accepted_count, RESULTS, "Every synthetic CV must be accepted");
const resumeIds = upload.items.map(i => i.resume_id);

const listResumes = async () => {
  const items = [];
  for (let offset = 0; offset < RESULTS; offset += MAX_PAGE) {
    items.push(...(await call(`${root}/resumes?offset=${offset}&limit=${MAX_PAGE}`)).items);
  }
  return items;
};
await until("extraction", listResumes, items => items.length === RESULTS && items.every(r => r.status === "parsed"));

const run = await post(`${root}/screening-runs`, { mode: "initial", criteria_revision: 1, resume_ids: resumeIds }, 202);
const finished = await until("screening run", () => call(`${root}/screening-runs/${run.id}`), r => r.is_current);
assert.equal(finished.counts.succeeded, RESULTS, "Every item must score for a representative read");
const setupSeconds = ((Date.now() - setupStarted) / 1000).toFixed(1);

const check = await rank(root, { limit: MAX_PAGE });
assert.equal(check.page.total, RESULTS, "Ranking must hold the full result set");
console.log(`Ready in ${setupSeconds}s: job ${job.id}, run ${run.id}, ${check.page.total} published results.\n`);

// ------------------------------------------------------------ measurement
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

/** Keeps USERS reads in flight until SAMPLES timings are collected. */
async function measure(operation) {
  let warm = WARMUP;
  await Promise.all(Array.from({ length: USERS }, async () => {
    while (warm-- > 0) await operation();
  }));
  const timings = [];
  let issued = SAMPLES;
  await Promise.all(Array.from({ length: USERS }, async () => {
    while (issued-- > 0) {
      const started = performance.now();
      await operation();
      timings.push(performance.now() - started);
    }
  }));
  timings.sort((a, b) => a - b);
  return timings;
}

const scenarios = [
  { name: "First page, limit 25 (SCR-06 default)", requests: 1, run: () => rank(root, { limit: 25 }) },
  { name: `One page, limit ${MAX_PAGE} (contract maximum)`, requests: 1, run: () => rank(root, { limit: MAX_PAGE }) },
  {
    name: `Whole ranking, ${RESULTS} results paged at ${MAX_PAGE}`,
    requests: Math.ceil(RESULTS / MAX_PAGE),
    // Pins run and epoch after the first page, exactly as a paging reader must.
    run: async () => {
      let runId, epoch;
      for (let offset = 0; offset < RESULTS; offset += MAX_PAGE) {
        const page = await rank(root, { offset, limit: MAX_PAGE, ...(runId ? { run_id: runId, decision_epoch: epoch } : {}) });
        runId ??= page.run_id;
        epoch ??= page.decision_epoch;
      }
    },
  },
];

const rows = [];
for (const scenario of scenarios) {
  const timings = await measure(scenario.run);
  const p95 = percentile(timings, 0.95);
  rows.push({
    scenario: scenario.name, requests: scenario.requests,
    p50: percentile(timings, 0.5), p95, p99: percentile(timings, 0.99),
    max: timings[timings.length - 1], pass: p95 < BUDGET_MS,
  });
  console.log(`Measured ${timings.length} reads - ${scenario.name}`);
}

// ---------------------------------------------------------------- report
const ms = value => `${value.toFixed(1)} ms`;
console.log(`
Machine: ${os.cpus()[0]?.model?.trim() ?? "unknown"} - ${os.cpus().length} logical cores - ${(os.totalmem() / 1024 ** 3).toFixed(1)} GiB - ${os.platform()} ${os.release()} - Node ${process.version}
Store:   process-local repositories and mock extraction, not the production database.
Load:    ${USERS} concurrent readers, ${SAMPLES} measurements per scenario after ${WARMUP} discarded warm-up operations.
Budget:  P95 below ${BUDGET_MS} ms.
`);
console.table(rows.map(r => ({
  Scenario: r.scenario, "HTTP calls": r.requests,
  P50: ms(r.p50), P95: ms(r.p95), P99: ms(r.p99), Max: ms(r.max),
  Verdict: r.pass ? "within budget" : "OVER BUDGET",
})));

const failed = rows.filter(r => !r.pass);
console.log(failed.length
  ? `Q07 not met on this machine: ${failed.length} of ${rows.length} scenarios exceeded ${BUDGET_MS} ms at P95.`
  : `Every scenario met P95 below ${BUDGET_MS} ms on this machine, with the in-memory store and mock extraction.`);
console.log("This measures the API read path only. It is not acceptance of Q07 on the trial machine with a production database.");
process.exit(failed.length ? 1 : 0);
