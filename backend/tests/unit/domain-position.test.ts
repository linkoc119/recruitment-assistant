import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetTables } from "../../src/infrastructure/db/store.ts";
import { positionRepository } from "../../src/infrastructure/db/repositories/position.repository.ts";
import { criteriaRepository } from "../../src/infrastructure/db/repositories/criteria.repository.ts";
import { resumeRepository } from "../../src/infrastructure/db/repositories/resume.repository.ts";
import { runRepository } from "../../src/infrastructure/db/repositories/run.repository.ts";
import {
  createJob,
  getJob,
  listJobs,
  updateJob,
  computeReadiness,
  type PositionDeps,
} from "../../src/domain/position/index.ts";
import { DomainError } from "../../src/domain/errors.ts";

function makeDeps(): PositionDeps {
  return { positionRepo: positionRepository, criteriaRepo: criteriaRepository, resumeRepo: resumeRepository, runRepo: runRepository };
}

beforeEach(() => {
  resetTables();
});

test("createJob creates a draft job at version 1 with empty readiness", async () => {
  const deps = makeDeps();
  const job = await createJob(deps, { title: "Backend Engineer", level: "senior", jd_raw_text: "Must know TypeScript." });
  assert.equal(job.status, "draft");
  assert.equal(job.version, 1);
  assert.equal(job.readiness.approved_criteria, false);
  assert.equal(job.readiness.ready_cv_count, 0);
  assert.equal(job.readiness.can_start, false);
  assert.deepEqual(job.readiness.blocking_codes, ["criteria_not_approved", "no_ready_cv"]);
});

test("getJob throws resource_not_found for an unknown job", async () => {
  const deps = makeDeps();
  await assert.rejects(() => getJob(deps, "999"), (err: unknown) => err instanceof DomainError && err.code === "resource_not_found");
});

test("listJobs paginates and filters by status", async () => {
  const deps = makeDeps();
  await createJob(deps, { title: "A", level: null, jd_raw_text: "jd" });
  await createJob(deps, { title: "B", level: null, jd_raw_text: "jd" });
  const open = await positionRepository.get("2");
  assert.ok(open);

  const page1 = await listJobs(deps, { offset: 0, limit: 1 });
  assert.equal(page1.items.length, 1);
  assert.equal(page1.page.total, 2);
  assert.equal(page1.items[0].id, "1");

  const filtered = await listJobs(deps, { status: "draft", offset: 0, limit: 10 });
  assert.equal(filtered.items.length, 2);
});

test("updateJob rejects a stale expected_version with stale_job", async () => {
  const deps = makeDeps();
  const job = await createJob(deps, { title: "A", level: null, jd_raw_text: "jd" });
  await assert.rejects(
    () => updateJob(deps, job.id, { expected_version: job.version + 1, title: "B", jd_raw_text: "jd2", level: null }),
    (err: unknown) => (err as { code?: string }).code === "stale_job",
  );
});

test("updateJob succeeds with the correct expected_version and bumps version", async () => {
  const deps = makeDeps();
  const job = await createJob(deps, { title: "A", level: null, jd_raw_text: "jd" });
  const updated = await updateJob(deps, job.id, { expected_version: job.version, title: "A2", jd_raw_text: "jd2", level: "junior" });
  assert.equal(updated.title, "A2");
  assert.equal(updated.version, 2);
});

test("computeReadiness reflects approved criteria, parsed CVs and an active run", async () => {
  const deps = makeDeps();
  const job = await createJob(deps, { title: "A", level: null, jd_raw_text: "jd" });

  let readiness = await computeReadiness(deps, job.id);
  assert.deepEqual(readiness.blocking_codes, ["criteria_not_approved", "no_ready_cv"]);

  const candidate = await resumeRepository.createCandidate({ full_name: null, email: null, phone: null });
  const resume = await resumeRepository.createResumeVersion({
    candidateId: candidate.id,
    version: 1,
    fileName: "cv.pdf",
    objectKey: "mem://1",
    fileHash: "hash1",
    mediaType: "application/pdf",
    sizeBytes: 100,
  });
  await resumeRepository.link(job.id, resume.id);
  await resumeRepository.setStatus(resume.id, "parsed", null);

  readiness = await computeReadiness(deps, job.id);
  assert.equal(readiness.ready_cv_count, 1);
  assert.deepEqual(readiness.blocking_codes, ["criteria_not_approved"]);

  await runRepository.create({
    jobId: job.id,
    mode: "initial",
    baseRunId: null,
    criteriaVersionId: "cv1",
    policyVersion: "policy-v1",
    policySnapshot: { version: "policy-v1", group_weights: { skill: "1", experience: "0", education: "0" }, match_values: { matched: "1", partial: "0.5", missing: "0" }, degree_order: ["vocational", "college", "bachelor", "master", "doctorate"], rounding: "floor2+largest-remainder" },
    idempotencyKey: "k1",
    payloadHash: "h1",
  });

  readiness = await computeReadiness(deps, job.id);
  assert.ok(readiness.active_run_id);
  assert.ok(readiness.blocking_codes.includes("active_run"));
  assert.equal(readiness.can_start, false);
});
