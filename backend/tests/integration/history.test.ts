import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { serviceDeps } from "../../src/lib/http/service-deps.ts";
import { idempotencyStore } from "../../src/infrastructure/idempotency/index.ts";
import { tables, resetTables } from "../../src/infrastructure/db/store.ts";
import { createJob } from "../../src/domain/position/index.ts";
import { saveDraft, approve } from "../../src/domain/criteria/index.ts";
import { uploadBatch } from "../../src/domain/candidates/index.ts";
import { startRun } from "../../src/domain/runs/index.ts";
import { pollOnce } from "../../worker/src/runner.ts";
import { GET as revisions } from "../../src/app/api/jobs/[job_id]/criteria-revisions/route.ts";
import { GET as revision } from "../../src/app/api/jobs/[job_id]/criteria-revisions/[revision]/route.ts";
import { GET as candidates } from "../../src/app/api/jobs/[job_id]/candidates/route.ts";
import { GET as runs } from "../../src/app/api/jobs/[job_id]/screening-runs/route.ts";
import { GET as source } from "../../src/app/api/jobs/[job_id]/screening-runs/[run_id]/results/[result_id]/source/route.ts";
import { GET as file } from "../../src/app/api/jobs/[job_id]/screening-runs/[run_id]/results/[result_id]/file/route.ts";
import { GET as comparison } from "../../src/app/api/jobs/[job_id]/comparison/route.ts";
import { POST as reprocess } from "../../src/app/api/jobs/[job_id]/resumes/[resume_id]/reprocess/route.ts";
import { GET as detail } from "../../src/app/api/jobs/[job_id]/screening-runs/[run_id]/results/[result_id]/route.ts";

const deps = { ...serviceDeps, idempotencyStore };
const request = (query = "") => new Request(`http://localhost/api/test${query}`);
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
async function json(response: Response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(response.headers.get("x-request-id"));
  if (status >= 400) {
    assert.equal(typeof body.code, "string");
    assert.equal(typeof body.message, "string");
    assert.equal(typeof body.retryable, "boolean");
    assert.equal(body.request_id, response.headers.get("x-request-id"));
  }
  return body;
}
beforeEach(() => resetTables());
async function approveSkill(jobId: string, base: number, label: string) {
  const skill = await deps.skillRepo.upsertByName(label);
  const draft = await saveDraft(deps, jobId, { expected_draft_version: 0, expected_revision: base, expected_job_version: 1,
    criteria: [{ criterion_key: "core", kind: "skill", label, skill_id: skill.id, req_type: "mandatory", weight: "100",
      source: "manual", jd_evidence: [], min_years: null, min_degree: null }] });
  return approve(deps, jobId, { expected_draft_version: draft.version, expected_revision: base, expected_job_version: 1 });
}
async function fixture() {
  const job = await createJob(deps, { title: "History", level: null, jd_raw_text: "Original JD" });
  await approveSkill(job.id, 0, "TypeScript");
  const text = "😀 Built systems using TypeScript.\n\n<script>alert('plain text')</script>";
  const upload = await uploadBatch(deps, job.id, { files: [
    { buffer: new TextEncoder().encode(text), original_name: 'CV tiếng Việt.pdf', media_type: "application/pdf" },
  ], manifest: [{ client_file_id: "a", file_index: 0, identity_mode: "new_candidate" }] });
  const resumeId = upload.items[0].resume_id!;
  await pollOnce();
  const first = await startRun(deps, job.id, { mode: "initial", criteria_revision: 1, resume_ids: [resumeId] }, randomUUID());
  await pollOnce();
  await approveSkill(job.id, 1, "Python");
  const second = await startRun(deps, job.id, { mode: "rescore", criteria_revision: 2, base_run_id: first.id }, randomUUID());
  await pollOnce();
  const result = (await deps.screeningRepo.listForRun(first.id))[0];
  return { job, first, second, result, resumeId, text,
    params: { job_id: job.id, run_id: first.id, result_id: result.id } };
}

test("approved revision history is paginated and reads frozen JD after live edits", async () => {
  const f = await fixture();
  tables.jobs.set(f.job.id, { ...tables.jobs.get(f.job.id)!, jd_raw_text: "Changed JD" });
  const list = await json(await revisions(request("?offset=1&limit=1"), ctx({ job_id: f.job.id })));
  assert.deepEqual(list.page, { offset: 1, limit: 1, total: 2 });
  assert.equal(list.items[0].revision, 2);
  const old = await json(await revision(request(), ctx({ job_id: f.job.id, revision: "1" })));
  assert.equal(old.jd_snapshot, "Original JD");
  assert.equal(old.criteria[0].label, "TypeScript");
  await json(await revision(request(), ctx({ job_id: f.job.id, revision: "3" })), 404);
  await json(await revision(request(), ctx({ job_id: f.job.id, revision: "0" })), 400);
});

test("candidate listing deduplicates versions and hides newer versions from another position", async () => {
  const f = await fixture();
  const resume = (await deps.resumeRepo.getResume(f.resumeId))!;
  const other = await createJob(deps, { title: "Other", level: null, jd_raw_text: "Other" });
  const newer = await deps.resumeRepo.createResumeVersion({ candidateId: resume.candidate_id, version: 2,
    fileName: "private.pdf", objectKey: "private", fileHash: "different", mediaType: "application/pdf", sizeBytes: 10 });
  await deps.resumeRepo.link(other.id, newer.id);
  let list = await json(await candidates(request(), ctx({ job_id: f.job.id })));
  assert.equal(list.items[0].latest_resume_id, resume.id);
  await deps.resumeRepo.link(f.job.id, newer.id);
  list = await json(await candidates(request(), ctx({ job_id: f.job.id })));
  assert.equal(list.page.total, 1);
  assert.equal(list.items[0].latest_version, 2);
  assert.equal((await json(await candidates(request("?offset=1"), ctx({ job_id: f.job.id })))).items.length, 0);
});

test("published_only includes historical publications and excludes queued/failed runs", async () => {
  const f = await fixture();
  const pending = await startRun(deps, f.job.id, { mode: "initial", criteria_revision: 2, resume_ids: [f.resumeId] }, randomUUID());
  const all = await json(await runs(request(), ctx({ job_id: f.job.id })));
  assert.deepEqual(all.items.map((r: { id: string }) => r.id), [pending.id, f.second.id, f.first.id]);
  const published = await json(await runs(request("?published_only=true"), ctx({ job_id: f.job.id })));
  assert.deepEqual(published.items.map((r: { id: string }) => r.id), [f.second.id, f.first.id]);
  assert.equal(published.items[1].is_current, false);
  assert.equal((await json(await runs(request("?published_only=false"), ctx({ job_id: f.job.id })))).page.total, 3);
  await json(await runs(request("?published_only=1"), ctx({ job_id: f.job.id })), 400);
});

test("source uses frozen snapshot, plain text and Unicode code point offsets", async () => {
  const f = await fixture();
  const original = (await deps.resumeRepo.getSnapshot(f.resumeId, f.result.snapshot_id))!;
  tables.resume_snapshots.set("999", { ...original, id: "999", raw_text: "Newer text", created_at: "9999-01-01T00:00:00Z" });
  const preview = await json(await source(request(), ctx(f.params)));
  assert.equal(preview.snapshot_id, f.result.snapshot_id);
  assert.equal(preview.raw_text, f.text);
  for (const segment of preview.segments) assert.equal(Array.from(f.text).slice(segment.start_offset, segment.end_offset).join(""), segment.text);
  const result = await json(await detail(request(), ctx(f.params)));
  const quote = result.criteria[0].evidence[0];
  assert.equal(Array.from(preview.raw_text).slice(quote.start_offset, quote.end_offset).join(""), quote.quote);
  assert.equal(quote.source_id, preview.snapshot_id);
});

test("file response returns exact bytes, safe filename and PDF/DOCX disposition", async () => {
  const f = await fixture();
  let response = await file(request(), ctx(f.params));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), f.text);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(response.headers.get("x-request-id"));
  assert.match(response.headers.get("content-disposition")!, /^inline; filename\*=UTF-8''/);
  const resume = tables.resumes.get(f.resumeId)!;
  tables.resumes.set(resume.id, { ...resume, media_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", file_name: 'bad\r\n"/name.docx' });
  response = await file(request(), ctx(f.params));
  assert.match(response.headers.get("content-disposition")!, /^attachment;/);
  assert.doesNotMatch(response.headers.get("content-disposition")!, /[\r\n]/);
  assert.equal(await response.text(), f.text);
});

test("unavailable original file/source is 503 while stored result remains readable", async () => {
  const f = await fixture();
  tables.resumes.set(f.resumeId, { ...tables.resumes.get(f.resumeId)!, object_key: "missing" });
  assert.equal((await json(await file(request(), ctx(f.params)), 503)).code, "source_unavailable");
  await json(await detail(request(), ctx(f.params)));
  tables.resume_snapshots.delete(f.result.snapshot_id);
  assert.equal((await json(await source(request(), ctx(f.params)), 503)).code, "source_unavailable");
  await json(await detail(request(), ctx(f.params)));
});

test("nested source/file reject wrong position, run, result and unpublished run", async () => {
  const f = await fixture();
  const other = await createJob(deps, { title: "Other", level: null, jd_raw_text: "Other" });
  for (const handler of [source, file]) {
    for (const params of [{ ...f.params, job_id: other.id }, { ...f.params, run_id: f.second.id }, { ...f.params, result_id: "999" }]) {
      assert.equal((await json(await handler(request(), ctx(params)), 404)).code, "resource_not_found");
    }
    await json(await handler(request(), ctx({ ...f.params, run_id: "bad" })), 400);
  }
  tables.screening_runs.set(f.first.id, { ...tables.screening_runs.get(f.first.id)!, published_at: null });
  await json(await source(request(), ctx(f.params)), 404);
  await json(await file(request(), ctx(f.params)), 404);
});

test("comparison returns exact signed deltas, criteria changes and paginated union", async () => {
  const f = await fixture();
  const query = `?left_run_id=${f.first.id}&right_run_id=${f.second.id}`;
  const diff = await json(await comparison(request(query), ctx({ job_id: f.job.id })));
  assert.equal(diff.items[0].score_delta, "-100.00");
  assert.equal(diff.items[0].rank_delta, 0);
  assert.equal(diff.items[0].eligibility_changed, true);
  assert.equal(diff.changed_criteria[0].change, "modified");
  assert.ok(diff.changed_criteria[0].fields.includes("skill_id"));
  assert.ok(!diff.changed_criteria[0].fields.includes("id"));
  const secondRow = (await deps.screeningRepo.listForRun(f.second.id))[0];
  tables.screenings.set(secondRow.id, { ...secondRow, snapshot_id: "999" });
  const split = await json(await comparison(request(query), ctx({ job_id: f.job.id })));
  assert.equal(split.page.total, 2);
  assert.equal(split.items[0].right.present, false);
  assert.equal(split.items[1].left.present, false);
  for (const item of split.items) { assert.equal(item.score_delta, null); assert.equal(item.rank_delta, null); assert.equal(item.eligibility_changed, null); }
  const page = await json(await comparison(request(`${query}&offset=1&limit=1`), ctx({ job_id: f.job.id })));
  assert.deepEqual(page.items, [split.items[1]]);
});

test("comparison validates query, position membership, distinctness and publication", async () => {
  const f = await fixture();
  const scoped = ctx({ job_id: f.job.id });
  await json(await comparison(request(), scoped), 400);
  await json(await comparison(request(`?left_run_id=${f.first.id}&right_run_id=${f.first.id}`), scoped), 422);
  await json(await comparison(request(`?left_run_id=${f.first.id}&right_run_id=999`), scoped), 404);
  tables.screening_runs.set(f.second.id, { ...tables.screening_runs.get(f.second.id)!, published_at: null });
  await json(await comparison(request(`?left_run_id=${f.first.id}&right_run_id=${f.second.id}`), scoped), 422);
});

test("comparison handles hundredth deltas and added/removed criteria without row-ID noise", async () => {
  const f = await fixture();
  const left = (await deps.screeningRepo.listForRun(f.first.id))[0];
  const right = (await deps.screeningRepo.listForRun(f.second.id))[0];
  tables.screenings.set(left.id, { ...left, displayed_total: "70.10", rank_in_job: 3 });
  tables.screenings.set(right.id, { ...right, displayed_total: "70.09", rank_in_job: 1 });
  const rightRun = tables.screening_runs.get(f.second.id)!;
  const requirements = await deps.criteriaRepo.listRequirements(rightRun.criteria_version_id);
  tables.job_requirements.set(requirements[0].id, { ...requirements[0], criterion_key: "replacement" });
  const diff = await json(await comparison(request(`?left_run_id=${f.first.id}&right_run_id=${f.second.id}`), ctx({ job_id: f.job.id })));
  assert.equal(diff.items[0].score_delta, "-0.01");
  assert.equal(diff.items[0].rank_delta, -2);
  assert.deepEqual(diff.changed_criteria.map((c: { criterion_key: string; change: string }) => [c.criterion_key, c.change]), [["core", "removed"], ["replacement", "added"]]);
});

test("history collections validate pagination and never expose another position's data", async () => {
  const f = await fixture();
  const other = await createJob(deps, { title: "Empty", level: null, jd_raw_text: "Empty" });
  for (const handler of [revisions, candidates, runs]) {
    assert.equal((await json(await handler(request(), ctx({ job_id: other.id })))).page.total, 0);
    await json(await handler(request(), ctx({ job_id: "999" })), 404);
    await json(await handler(request("?limit=101"), ctx({ job_id: f.job.id })), 400);
    await json(await handler(request("?offset=-1"), ctx({ job_id: f.job.id })), 400);
    await json(await handler(request("?unexpected=true"), ctx({ job_id: f.job.id })), 400);
  }
  await json(await revision(request(), ctx({ job_id: other.id, revision: "1" })), 404);
  await json(await comparison(request(`?left_run_id=${f.first.id}&right_run_id=${f.second.id}`), ctx({ job_id: other.id })), 404);
});

async function failedFixture() {
  const job = await createJob(deps, { title: "Retry", level: null, jd_raw_text: "JD" });
  const upload = await uploadBatch(deps, job.id, { files: [{ buffer: new TextEncoder().encode("Built using TypeScript"), original_name: "retry.pdf", media_type: "application/pdf" }],
    manifest: [{ client_file_id: "retry", file_index: 0, identity_mode: "new_candidate" }] });
  const resumeId = upload.items[0].resume_id!;
  const extraction = (await deps.extractionRepo.findActiveForResume(resumeId))!;
  tables.resume_extraction_jobs.set(extraction.id, { ...extraction, status: "failed", attempts: 3, error_code: "extraction_failed" });
  await deps.resumeRepo.setStatus(resumeId, "parse_failed", "extraction_failed");
  return { params: { job_id: job.id, resume_id: resumeId }, extraction };
}
const retryRequest = (key = randomUUID()) => new Request("http://localhost/api/reprocess", { method: "POST", headers: { "Idempotency-Key": key } });

test("reprocess enqueues new history, fences concurrent commands and replays after success", async () => {
  const f = await failedFixture();
  const key = randomUUID();
  const responses = await Promise.all([reprocess(retryRequest(key), ctx(f.params)), reprocess(retryRequest(), ctx(f.params))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [202, 409]);
  const accepted = await json(responses[0], 202);
  assert.equal(accepted.status, "uploaded");
  assert.equal(tables.resume_extraction_jobs.size, 2);
  assert.equal(tables.resume_extraction_jobs.get(f.extraction.id)!.status, "failed");
  const active = (await deps.extractionRepo.findActiveForResume(f.params.resume_id))!;
  assert.equal(active.trigger_source, "reprocess");
  assert.equal(active.attempts, 0);
  await pollOnce();
  assert.equal(tables.resumes.get(f.params.resume_id)!.status, "parsed");
  assert.deepEqual(await json(await reprocess(retryRequest(key), ctx(f.params)), 202), accepted);
  await json(await reprocess(retryRequest(), ctx(f.params)), 409);
  assert.equal((await json(await reprocess(retryRequest(key), ctx({ ...f.params, resume_id: "999" })), 409)).code, "idempotency_mismatch");
});

test("reprocess rejects missing key, foreign resume, snapshot-bearing and corrupt files", async () => {
  const f = await failedFixture();
  await json(await reprocess(new Request("http://localhost", { method: "POST" }), ctx(f.params)), 400);
  await json(await reprocess(retryRequest(), ctx({ ...f.params, job_id: "999" })), 404);
  await deps.resumeRepo.setStatus(f.params.resume_id, "parse_failed", "corrupt_file");
  await json(await reprocess(retryRequest(), ctx(f.params)), 422);
  assert.equal(tables.resume_extraction_jobs.size, 1);
  const successful = await fixture();
  await deps.resumeRepo.setStatus(successful.resumeId, "parse_failed", "extraction_failed");
  await json(await reprocess(retryRequest(), ctx({ job_id: successful.job.id, resume_id: successful.resumeId })), 409);
});
