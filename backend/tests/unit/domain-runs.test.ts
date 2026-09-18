import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resetTables, tables } from "../../src/infrastructure/db/store.ts";
import { positionRepository } from "../../src/infrastructure/db/repositories/position.repository.ts";
import { criteriaRepository } from "../../src/infrastructure/db/repositories/criteria.repository.ts";
import { resumeRepository } from "../../src/infrastructure/db/repositories/resume.repository.ts";
import { runRepository } from "../../src/infrastructure/db/repositories/run.repository.ts";
import { screeningRepository } from "../../src/infrastructure/db/repositories/screening.repository.ts";
import { skillRepository } from "../../src/infrastructure/db/repositories/skill.repository.ts";
import { InMemoryIdempotencyStore } from "../../src/infrastructure/idempotency/index.ts";
import { InMemoryFileStore } from "../../src/infrastructure/files/index.ts";
import { MockAiExtractionService } from "../../src/infrastructure/ai/index.ts";
import { createJob, type PositionDeps } from "../../src/domain/position/index.ts";
import { saveDraft, approve, type CriteriaDeps, type CriterionInputDto } from "../../src/domain/criteria/index.ts";
import { uploadBatch, type CandidateDeps, type UploadFile } from "../../src/domain/candidates/index.ts";
import { startRun, executeRun, publishRun, getRun, listRunItems, type RunDeps } from "../../src/domain/runs/index.ts";

function makePositionDeps(): PositionDeps {
  return { positionRepo: positionRepository, criteriaRepo: criteriaRepository, resumeRepo: resumeRepository, runRepo: runRepository };
}

function makeCriteriaDeps(): CriteriaDeps {
  return { positionRepo: positionRepository, criteriaRepo: criteriaRepository, skillRepo: skillRepository, ai: new MockAiExtractionService() };
}

function makeCandidateDeps(ai = new MockAiExtractionService()): CandidateDeps {
  return { positionRepo: positionRepository, resumeRepo: resumeRepository, extractionRepo: extractionRepo(), fileStore: new InMemoryFileStore(), ai };
}

import { extractionRepository } from "../../src/infrastructure/db/repositories/extraction.repository.ts";
function extractionRepo() {
  return extractionRepository;
}

function makeRunDeps(): RunDeps {
  return {
    positionRepo: positionRepository,
    criteriaRepo: criteriaRepository,
    resumeRepo: resumeRepository,
    runRepo: runRepository,
    screeningRepo: screeningRepository,
    skillRepo: skillRepository,
    idempotencyStore: new InMemoryIdempotencyStore(),
  };
}

beforeEach(() => {
  resetTables();
});

/** Approves a single-skill, mandatory, weight-100 criteria revision and returns its revision number. */
async function approveSkillCriteria(jobId: string, skillId: string): Promise<number> {
  const deps = makeCriteriaDeps();
  const criterion: CriterionInputDto = {
    criterion_key: "skill-1",
    kind: "skill",
    label: "TypeScript",
    skill_id: skillId,
    req_type: "mandatory",
    weight: "100",
    min_years: null,
    min_degree: null,
    source: "manual",
    jd_evidence: [],
  };
  await saveDraft(deps, jobId, { expected_draft_version: 0, expected_revision: 0, expected_job_version: 1, criteria: [criterion] });
  const revision = await approve(deps, jobId, { expected_draft_version: 1, expected_revision: 0, expected_job_version: 1 });
  return revision.revision;
}

/** Directly commits a parsed resume + snapshot, bypassing the AI extraction pipeline (fast fixture builder). */
async function createParsedResume(jobId: string, usage: "evidenced_use" | "listed_only" | "none"): Promise<string> {
  const candidate = await resumeRepository.createCandidate({ full_name: null, email: null, phone: null });
  const resume = await resumeRepository.createResumeVersion({
    candidateId: candidate.id,
    version: 1,
    fileName: "cv.pdf",
    objectKey: `mem://${randomUUID()}`,
    fileHash: `hash-${randomUUID()}`,
    mediaType: "application/pdf",
    sizeBytes: 10,
  });
  await resumeRepository.link(jobId, resume.id);
  await resumeRepository.commitExtraction({
    resumeId: resume.id,
    snapshot: {
      raw_text: "",
      segments: [],
      extraction: {
        schema_version: "extraction-v1",
        normalization_version: "months-v1",
        as_of_date: "2024-01-01",
        supported_months: 0,
        employment: [],
        education: [],
        candidate: { full_name: null, email: null, phone: null },
      },
      parser_version: "text-v1",
      model_version: "mock-v1",
      prompt_version: "prompt-v1",
      schema_version: "extraction-v1",
      dictionary_version: "dict-v1",
    },
    skills:
      usage === "none"
        ? []
        : [{ skill_id: null, canonical_name: "TypeScript", raw_text: "TypeScript", usage, evidence: [], confidence: null }],
  });
  return resume.id;
}

test("AT-05: a resume that never parsed is excluded from the run and not counted as a mandatory failure", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);

  const parsedIds: string[] = [];
  for (let i = 0; i < 41; i++) {
    parsedIds.push(await createParsedResume(job.id, "evidenced_use"));
  }
  // The 42nd resume never made it past extraction — stays "uploaded", not "parsed".
  const corrupt = await resumeRepository.createCandidate({ full_name: null, email: null, phone: null });
  const corruptResume = await resumeRepository.createResumeVersion({
    candidateId: corrupt.id,
    version: 1,
    fileName: "corrupt.pdf",
    objectKey: `mem://${randomUUID()}`,
    fileHash: `hash-${randomUUID()}`,
    mediaType: "application/pdf",
    sizeBytes: 10,
  });
  await resumeRepository.link(job.id, corruptResume.id);
  await resumeRepository.setStatus(corruptResume.id, "parse_failed", "extraction_failed");

  const deps = makeRunDeps();
  const run = await startRun(deps, job.id, { mode: "initial", criteria_revision: revision }, "idem-1");
  assert.equal(run.counts.total, 41);

  const { items } = await listRunItems(deps, { jobId: job.id, runId: run.id }, { offset: 0, limit: 100 });
  assert.ok(!items.some((i) => i.resume_id === corruptResume.id));
  assert.equal(items.length, 41);
  assert.ok(parsedIds.every((id) => items.some((i) => i.resume_id === id)));
});

test("AT-06: ranking sorts passed_mandatory DESC, then displayed_total DESC, then resume_id ASC", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);

  const candidateA = await createParsedResume(job.id, "evidenced_use"); // matched -> passed_mandatory, score 100
  const candidateB = await createParsedResume(job.id, "listed_only"); // partial -> not passed_mandatory, score 50
  const candidateC = await createParsedResume(job.id, "none"); // missing -> not passed_mandatory, score 0

  const deps = makeRunDeps();
  const run = await startRun(deps, job.id, { mode: "initial", criteria_revision: revision }, "idem-1");
  const claimed = await runRepository.claim(run.id, "worker-1");
  assert.ok(claimed);
  await executeRun(deps, { jobId: job.id, runId: run.id }, { owner: "worker-1", leaseToken: claimed!.lease_token });
  await publishRun(deps, { jobId: job.id, runId: run.id }, { owner: "worker-1", leaseToken: claimed!.lease_token });

  const screenings = await screeningRepository.listForRun(run.id);
  const ranked = [...screenings].sort((a, b) => a.rank_in_job - b.rank_in_job);
  assert.deepEqual(
    ranked.map((s) => s.resume_id),
    [candidateA, candidateB, candidateC],
  );
});

test("AT-07: a rescore that does not fully succeed leaves the base run as the published/current one", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);

  const resumeA = await createParsedResume(job.id, "evidenced_use");
  const resumeB = await createParsedResume(job.id, "evidenced_use");

  const deps = makeRunDeps();
  const baseRun = await startRun(deps, job.id, { mode: "initial", criteria_revision: revision }, "idem-initial");
  const baseClaimed = await runRepository.claim(baseRun.id, "worker-1");
  assert.ok(baseClaimed);
  await executeRun(deps, { jobId: job.id, runId: baseRun.id }, { owner: "worker-1", leaseToken: baseClaimed!.lease_token });
  await publishRun(deps, { jobId: job.id, runId: baseRun.id }, { owner: "worker-1", leaseToken: baseClaimed!.lease_token });

  const jobAfterInitial = await positionRepository.get(job.id);
  assert.equal(jobAfterInitial?.published_run_id, baseRun.id);

  // Simulate resumeB's snapshot becoming unavailable before the rescore runs.
  const snapshotB = await resumeRepository.getLatestSnapshot(resumeB);
  assert.ok(snapshotB);
  tables.resume_snapshots.delete(snapshotB!.id);

  const rescoreRun = await startRun(deps, job.id, { mode: "rescore", criteria_revision: revision, base_run_id: baseRun.id }, "idem-rescore");
  const rescoreClaimed = await runRepository.claim(rescoreRun.id, "worker-2");
  assert.ok(rescoreClaimed);
  await executeRun(deps, { jobId: job.id, runId: rescoreRun.id }, { owner: "worker-2", leaseToken: rescoreClaimed!.lease_token });
  await publishRun(deps, { jobId: job.id, runId: rescoreRun.id }, { owner: "worker-2", leaseToken: rescoreClaimed!.lease_token });

  const rescoreDto = await getRun(deps, job.id, rescoreRun.id);
  assert.equal(rescoreDto.status, "completed_with_errors");
  assert.equal(rescoreDto.published_at, null);
  assert.equal(rescoreDto.is_current, false);

  const jobAfterRescore = await positionRepository.get(job.id);
  assert.equal(jobAfterRescore?.published_run_id, baseRun.id, "base run must remain the published/current run");
  void resumeA;
});

test("a rescore reuses frozen snapshots and never calls the mock AI service", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "Must have TypeScript." });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);

  const ai = new MockAiExtractionService();
  const candidateDeps = makeCandidateDeps(ai);
  const file: UploadFile = { buffer: new TextEncoder().encode("TypeScript engineer, used TypeScript daily."), original_name: "cv.pdf", media_type: "application/pdf" };
  const uploaded = await uploadBatch(candidateDeps, job.id, { files: [file], manifest: [{ client_file_id: "f1", file_index: 0, identity_mode: "new_candidate" }] });
  const resumeId = uploaded.items[0].resume_id as string;
  const extractionJob = await candidateDeps.extractionRepo.findActiveForResume(resumeId);
  assert.ok(extractionJob);
  const extractionClaimed = await extractionRepository.claim(extractionJob!.id, "worker-extract");
  assert.ok(extractionClaimed);
  const { extractResume } = await import("../../src/domain/candidates/index.ts");
  await extractResume(candidateDeps, { extractionJobId: extractionJob!.id, jobId: job.id, resumeId }, { owner: "worker-extract", leaseToken: extractionClaimed!.lease_token });
  assert.equal(ai.callCounts.extractCv, 1);

  const deps = makeRunDeps();
  const baseRun = await startRun(deps, job.id, { mode: "initial", criteria_revision: revision }, "idem-initial");
  const baseClaimed = await runRepository.claim(baseRun.id, "worker-1");
  await executeRun(deps, { jobId: job.id, runId: baseRun.id }, { owner: "worker-1", leaseToken: baseClaimed!.lease_token });
  await publishRun(deps, { jobId: job.id, runId: baseRun.id }, { owner: "worker-1", leaseToken: baseClaimed!.lease_token });

  const callsBeforeRescore = { ...ai.callCounts };

  const rescoreRun = await startRun(deps, job.id, { mode: "rescore", criteria_revision: revision, base_run_id: baseRun.id }, "idem-rescore");
  const rescoreClaimed = await runRepository.claim(rescoreRun.id, "worker-2");
  await executeRun(deps, { jobId: job.id, runId: rescoreRun.id }, { owner: "worker-2", leaseToken: rescoreClaimed!.lease_token });
  await publishRun(deps, { jobId: job.id, runId: rescoreRun.id }, { owner: "worker-2", leaseToken: rescoreClaimed!.lease_token });

  assert.deepEqual(ai.callCounts, callsBeforeRescore);
  assert.equal(ai.callCounts.extractCv, 1);
  assert.equal(ai.callCounts.extractJd, 0);

  const jobAfterRescore = await positionRepository.get(job.id);
  assert.equal(jobAfterRescore?.published_run_id, rescoreRun.id);
});

test("startRun replays the same response for a repeated idempotency key with the same payload", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");

  const deps = makeRunDeps();
  const first = await startRun(deps, job.id, { mode: "initial", criteria_revision: revision }, "idem-1");
  const second = await startRun(deps, job.id, { mode: "initial", criteria_revision: revision }, "idem-1");
  assert.equal(first.id, second.id);

  const activeRuns = await runRepository.list(job.id, (r) => r.status === "queued" || r.status === "running");
  assert.equal(activeRuns.length, 1);
});
