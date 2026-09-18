import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pollOnce, startInProcessWorker } from "../../worker/src/runner.ts";
import { runExtractResumeTask } from "../../worker/src/tasks/extract-resume/index.ts";
import { runScreeningTask } from "../../worker/src/tasks/run-screening/index.ts";
import { rescoreTask } from "../../worker/src/tasks/rescore/index.ts";
import { resetTables, tables } from "../../src/infrastructure/db/store.ts";
import { positionRepository, criteriaRepository, resumeRepository, extractionRepository, runRepository, screeningRepository, skillRepository } from "../../src/infrastructure/db/repositories/index.ts";
import { aiExtractionService } from "../../src/infrastructure/ai/index.ts";
import { fileStore } from "../../src/infrastructure/files/index.ts";
import { idempotencyStore } from "../../src/infrastructure/idempotency/index.ts";
import { createJob } from "../../src/domain/position/index.ts";
import { uploadBatch } from "../../src/domain/candidates/index.ts";
import { saveDraft, approve } from "../../src/domain/criteria/index.ts";
import { startRun } from "../../src/domain/runs/index.ts";

const deps = {
  positionRepo: positionRepository, criteriaRepo: criteriaRepository,
  resumeRepo: resumeRepository, extractionRepo: extractionRepository,
  runRepo: runRepository, screeningRepo: screeningRepository,
  skillRepo: skillRepository, ai: aiExtractionService, fileStore, idempotencyStore,
};
beforeEach(() => resetTables());
async function fixture() {
  const job = await createJob(deps, { title: "Worker", level: null, jd_raw_text: "TypeScript required" });
  const uploaded = await uploadBatch(deps, job.id, {
    files: [{ buffer: new TextEncoder().encode("Built systems using TypeScript."), original_name: "mock.pdf", media_type: "application/pdf" }],
    manifest: [{ client_file_id: "cv", file_index: 0, identity_mode: "new_candidate" }],
  });
  const resumeId = uploaded.items[0].resume_id!;
  const extraction = (await extractionRepository.findActiveForResume(resumeId))!;
  return { job, resumeId, extraction };
}

test("overlapping worker claims extract only once and release the completed lease", async () => {
  const { resumeId, extraction } = await fixture();
  const before = aiExtractionService.callCounts.extractCv;
  const results = await Promise.all([runExtractResumeTask(extraction), runExtractResumeTask(extraction)]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(aiExtractionService.callCounts.extractCv, before + 1);
  assert.equal((await resumeRepository.getResume(resumeId))!.status, "parsed");
  const done = tables.resume_extraction_jobs.get(extraction.id)!;
  assert.equal(done.status, "succeeded");
  assert.equal(done.lease_owner, null);
  assert.equal(tables.resume_snapshots.size, 1);
});

test("expired extraction claim is reclaimed; stale owner cannot complete it", async () => {
  const { extraction } = await fixture();
  const first = (await extractionRepository.claim(extraction.id, "old"))!;
  tables.resume_extraction_jobs.set(first.id, { ...first, lease_expires_at: new Date(0).toISOString() });
  const second = (await extractionRepository.claim(first.id, "new"))!;
  assert.notEqual(first.lease_token, second.lease_token);
  await extractionRepository.markSucceeded(first.id, "old", first.lease_token, "invalid");
  assert.equal(tables.resume_extraction_jobs.get(first.id)!.status, "running");
  assert.equal(tables.resume_extraction_jobs.get(first.id)!.snapshot_id, null);
});

test("poller respects delayed retries and stops extraction after max attempts", async (t) => {
  const { extraction, resumeId } = await fixture();
  t.mock.method(aiExtractionService, "extractCv", async () => { throw new Error("provider offline"); });
  await pollOnce();
  assert.equal(tables.resume_extraction_jobs.get(extraction.id)!.attempts, 1);
  assert.equal(tables.resume_extraction_jobs.get(extraction.id)!.status, "queued");
  await pollOnce();
  assert.equal(tables.resume_extraction_jobs.get(extraction.id)!.attempts, 1);
  for (let attempt = 2; attempt <= 3; attempt++) {
    const current = tables.resume_extraction_jobs.get(extraction.id)!;
    tables.resume_extraction_jobs.set(current.id, { ...current, available_at: new Date(0).toISOString() });
    await pollOnce();
  }
  assert.equal(tables.resume_extraction_jobs.get(extraction.id)!.status, "failed");
  assert.equal((await resumeRepository.getResume(resumeId))!.status, "parse_failed");
  assert.equal(tables.resume_snapshots.size, 0);
});

test("worker initial and rescore tasks publish frozen snapshots without re-extraction", async () => {
  const { job, resumeId } = await fixture();
  await pollOnce();
  const skill = await skillRepository.upsertByName("TypeScript");
  const draft = await saveDraft(deps, job.id, {
    expected_draft_version: 0, expected_revision: 0, expected_job_version: 1,
    criteria: [{ criterion_key: "ts", kind: "skill", label: "TypeScript", req_type: "mandatory", weight: "100", source: "manual", skill_id: skill.id, min_years: null, min_degree: null, jd_evidence: [] }],
  });
  await approve(deps, job.id, { expected_draft_version: draft.version, expected_revision: 0, expected_job_version: 1 });
  const initial = await startRun(deps, job.id, { mode: "initial", criteria_revision: 1, resume_ids: [resumeId] }, randomUUID());
  const outcomes = await Promise.all([runScreeningTask(initial), runScreeningTask(initial)]);
  assert.deepEqual(outcomes.sort(), [false, true]);
  assert.equal(tables.jobs.get(job.id)!.published_run_id, initial.id);
  assert.equal((await screeningRepository.listForRun(initial.id))[0].displayed_total, "100.00");
  const baseItems = await runRepository.listItems(initial.id);
  const calls = aiExtractionService.callCounts.extractCv;
  const rescore = await startRun(deps, job.id, { mode: "rescore", criteria_revision: 1, base_run_id: initial.id }, randomUUID());
  assert.equal(await rescoreTask(rescore), true);
  assert.equal(tables.jobs.get(job.id)!.published_run_id, rescore.id);
  assert.deepEqual((await runRepository.listItems(rescore.id)).map(i => i.snapshot_id), baseItems.map(i => i.snapshot_id));
  assert.equal(aiExtractionService.callCounts.extractCv, calls);
  assert.equal(tables.resume_extraction_jobs.size, 1);
});

test("poller reports a broken task and still processes the following task", async (t) => {
  const { extraction } = await fixture();
  t.mock.method(extractionRepository, "listDue", async () => [{ ...extraction, id: "broken" }, extraction]);
  const claim = extractionRepository.claim.bind(extractionRepository);
  t.mock.method(extractionRepository, "claim", async (id: string, owner: string) => {
    if (id === "broken") throw new Error("claim failed");
    return claim(id, owner);
  });
  const errors: unknown[] = [];
  await pollOnce(error => errors.push(error));
  assert.equal(errors.length, 1);
  assert.equal(tables.resume_extraction_jobs.get(extraction.id)!.status, "succeeded");
});

test("runner starts once, does not overlap passes, and stop waits for active work", async () => {
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let calls = 0;
  const stop = startInProcessWorker({ intervalMs: 1, keepAlive: true, poll: async () => { calls++; entered(); await blocked; } });
  try {
    assert.equal(startInProcessWorker(), stop);
    await started;
    await delay(20);
    assert.equal(calls, 1);
    let stopped = false;
    const stopping = stop().then(() => { stopped = true; });
    await delay(5);
    assert.equal(stopped, false);
    release();
    await stopping;
    await delay(5);
    assert.equal(calls, 1);
  } finally { release(); await stop(); }
});
