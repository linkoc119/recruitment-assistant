import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// Run against a local Next server. Creates uniquely keyed mock data; no store
// imports, direct handler calls or manual worker driving are used here.
const base = process.env.API_BASE_URL ?? "http://127.0.0.1:3100";
async function request(path, { method = "GET", body, status = 200, key } = {}) {
  const headers = {};
  if (key) headers["Idempotency-Key"] = key;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}/api${path}`, {
    method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  assert.equal(res.status, status, `${method} ${path}: ${text}`);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.ok(res.headers.get("x-request-id"));
  return JSON.parse(text);
}
const write = (path, body, status = 200, method = "POST", key = randomUUID()) => request(path, { method, body, status, key });
async function until(path, predicate) {
  const deadline = Date.now() + 20_000;
  let value;
  do {
    value = await request(path);
    if (predicate(value)) return value;
    await delay(100);
  } while (Date.now() < deadline);
  assert.fail(`Timed out waiting for ${path}: ${JSON.stringify(value)}`);
}

const home = await fetch(base);
assert.equal(home.status, 200);
assert.match(await home.text(), /Recruitment Assistant API/);
const input = { title: `HTTP check ${randomUUID()}`, jd_raw_text: "TypeScript required", level: null };
const createKey = randomUUID();
const job = await write("/jobs", input, 201, "POST", createKey);
assert.deepEqual(await write("/jobs", input, 201, "POST", createKey), job);
const root = `/jobs/${job.id}`;
assert.equal((await request(root)).id, job.id);
assert.ok((await request("/jobs?limit=100")).page.total >= 1);
const error = await request(`${root}/criteria-draft`, { status: 404 });
assert.equal(error.code, "draft_not_found");
assert.equal(typeof error.retryable, "boolean");
assert.equal(typeof error.request_id, "string");

async function approve(revision, label) {
  const current = await request(root);
  const skills = await request("/skills");
  const skill = skills.items.find(s => s.name === label);
  assert.ok(skill, `Missing canonical skill ${label}`);
  const draft = await write(`${root}/criteria-draft`, {
    expected_draft_version: 0, expected_revision: revision, expected_job_version: current.version,
    criteria: [{ criterion_key: "skill-1", kind: "skill", label, skill_id: skill.id, req_type: "mandatory", weight: "100", source: "manual" }],
  }, 200, "PUT");
  const approved = await write(`${root}/criteria-revisions`, {
    expected_draft_version: draft.version, expected_revision: revision, expected_job_version: current.version,
  }, 201);
  assert.equal(approved.revision, revision + 1);
}
await approve(0, "TypeScript");
const form = new FormData();
// Deliberately text bytes with a PDF MIME label: the accepted mock parser.
const cvTexts = ["Built production services using TypeScript.", "Built services using Python."];
cvTexts.forEach((text, i) => form.append("files", new Blob([text], { type: "application/pdf" }), `cv-${i}.pdf`));
form.append("manifest", JSON.stringify(cvTexts.map((_, i) => ({ client_file_id: `cv-${i}`, file_index: i, identity_mode: "new_candidate" }))));
const uploadKey = randomUUID();
const upload = await write(`${root}/resume-batches`, form, 200, "POST", uploadKey);
assert.equal(upload.accepted_count, 2);
assert.deepEqual(await write(`${root}/resume-batches`, form, 200, "POST", uploadKey), upload);
const resumeIds = upload.items.map(i => i.resume_id);
for (const id of resumeIds) {
  const resume = await until(`${root}/resumes/${id}`, r => r.status === "parsed");
  assert.ok(resume.snapshot_id);
  assert.equal(resume.can_screen, true);
}
assert.equal((await request(`${root}/resumes`)).page.total, 2);
const startBody = { mode: "initial", criteria_revision: 1, resume_ids: resumeIds };
const startKey = randomUUID();
const run = await write(`${root}/screening-runs`, startBody, 202, "POST", startKey);
assert.deepEqual(await write(`${root}/screening-runs`, startBody, 202, "POST", startKey), run);
const runPath = `${root}/screening-runs/${run.id}`;
const complete = await until(runPath, r => r.is_current);
assert.equal(complete.counts.succeeded, 2);
const oldItems = await request(`${runPath}/items`);
const ranking = await write(`${root}/ranking/query`, {});
assert.deepEqual(ranking.eligibility_counts, { passed: 1, failed: 1 });
assert.deepEqual(ranking.items.map(i => i.resume_id), resumeIds);
const first = ranking.items[0];
const resultPath = `${runPath}/results/${first.result_id}`;
const detail = await request(resultPath);
assert.equal(detail.semantic_score, null);
assert.equal(Number(detail.displayed_total), 100);
assert.ok(detail.criteria[0].evidence.some(e => cvTexts[0].includes(e.quote)));
const decision = await write(`${resultPath}/decision`, { decision: "shortlisted", expected_result_version: first.result_version }, 200, "PATCH");
assert.equal(decision.status, "shortlisted");
assert.equal((await write(`${resultPath}/decision`, { decision: "rejected", expected_result_version: first.result_version }, 409, "PATCH")).code, "stale_result");
const failed = ranking.items[1];
assert.equal((await write(`${runPath}/results/${failed.result_id}/decision`, { decision: "shortlisted", expected_result_version: failed.result_version }, 422, "PATCH")).code, "confirmation_required");

await approve(1, "Python");
const rescore = await write(`${root}/screening-runs`, { mode: "rescore", criteria_revision: 2, base_run_id: run.id }, 202);
const rescorePath = `${root}/screening-runs/${rescore.id}`;
await until(rescorePath, r => r.is_current);
const newItems = await request(`${rescorePath}/items`);
assert.deepEqual(newItems.items.map(i => [i.resume_id, i.snapshot_id]), oldItems.items.map(i => [i.resume_id, i.snapshot_id]));
const newRanking = await write(`${root}/ranking/query`, {});
assert.equal(newRanking.run_id, rescore.id);
assert.deepEqual(newRanking.items.map(i => i.resume_id), [...resumeIds].reverse());
const historical = await request(resultPath);
assert.equal(historical.is_current, false);
assert.equal(historical.status, "shortlisted");
assert.equal(historical.criteria_revision, 1);
assert.equal((await write(`${resultPath}/decision`, { decision: "shortlisted", expected_result_version: decision.result_version }, 409, "PATCH")).code, "run_not_current");
console.log(`HTTP workflow passed: job ${job.id}, initial ${run.id}, rescore ${rescore.id}; headers, replay, evidence, decisions and frozen snapshots verified.`);
