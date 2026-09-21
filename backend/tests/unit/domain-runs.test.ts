import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resetTables, tables } from "../../src/infrastructure/db/store.ts";
import { positionRepository, PositionRepository } from "../../src/infrastructure/db/repositories/position.repository.ts";
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


/**
 * The API requires an explicit, nonempty selection for an initial run
 * (API README section 4.3), so tests must name the CVs they screen. These
 * fixtures screen everything parsed unless a test says otherwise.
 */
async function parsedResumeIds(jobId: string): Promise<string[]> {
  return (await resumeRepository.list(jobId, (r) => r.status === "parsed")).map((r) => r.id);
}

/** Approves one more revision of the same criterion, so a rescore has something newer to run. */
async function approveNextSkillRevision(jobId: string, skillId: string, currentRevision: number): Promise<number> {
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
  await saveDraft(deps, jobId, {
    expected_draft_version: 0,
    expected_revision: currentRevision,
    expected_job_version: 1,
    criteria: [criterion],
  });
  const revision = await approve(deps, jobId, {
    expected_draft_version: 1,
    expected_revision: currentRevision,
    expected_job_version: 1,
  });
  return revision.revision;
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
  const run = await startRun(deps, job.id, { mode: "initial", criteria_revision: revision, resume_ids: parsedIds }, "idem-1");
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
  const run = await startRun(deps, job.id, { mode: "initial", criteria_revision: revision, resume_ids: [candidateA, candidateB, candidateC] }, "idem-1");
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
  const baseRun = await startRun(deps, job.id, { mode: "initial", criteria_revision: revision, resume_ids: [resumeA, resumeB] }, "idem-initial");
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

  const nextRevision = await approveNextSkillRevision(job.id, skill.id, revision);
  const rescoreRun = await startRun(deps, job.id, { mode: "rescore", criteria_revision: nextRevision, base_run_id: baseRun.id }, "idem-rescore");
  const rescoreClaimed = await runRepository.claim(rescoreRun.id, "worker-2");
  assert.ok(rescoreClaimed);
  await executeRun(deps, { jobId: job.id, runId: rescoreRun.id }, { owner: "worker-2", leaseToken: rescoreClaimed!.lease_token });
  await publishRun(deps, { jobId: job.id, runId: rescoreRun.id }, { owner: "worker-2", leaseToken: rescoreClaimed!.lease_token });

  const rescoreDto = await getRun(deps, job.id, rescoreRun.id);
  assert.equal(rescoreDto.status, "failed");
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
  const baseRun = await startRun(deps, job.id, { mode: "initial", criteria_revision: revision, resume_ids: [resumeId] }, "idem-initial");
  const baseClaimed = await runRepository.claim(baseRun.id, "worker-1");
  await executeRun(deps, { jobId: job.id, runId: baseRun.id }, { owner: "worker-1", leaseToken: baseClaimed!.lease_token });
  await publishRun(deps, { jobId: job.id, runId: baseRun.id }, { owner: "worker-1", leaseToken: baseClaimed!.lease_token });

  const callsBeforeRescore = { ...ai.callCounts };

  const nextRevision = await approveNextSkillRevision(job.id, skill.id, revision);
  const rescoreRun = await startRun(deps, job.id, { mode: "rescore", criteria_revision: nextRevision, base_run_id: baseRun.id }, "idem-rescore");
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
  const resumeId = await createParsedResume(job.id, "evidenced_use");

  const deps = makeRunDeps();
  const selection = { mode: "initial" as const, criteria_revision: revision, resume_ids: [resumeId] };
  const first = await startRun(deps, job.id, selection, "idem-1");
  const second = await startRun(deps, job.id, selection, "idem-1");
  assert.equal(first.id, second.id);

  const activeRuns = await runRepository.list(job.id, (r) => r.status === "queued" || r.status === "running");
  assert.equal(activeRuns.length, 1);
});

test("initial partial failure publishes successful results, excluding technical failures", async () => {
  const job = await createJob(makePositionDeps(), { title: "Partial", level: null, jd_raw_text: "TypeScript" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  const good = await createParsedResume(job.id, "evidenced_use");
  const broken = await createParsedResume(job.id, "evidenced_use");
  const deps = makeRunDeps();
  const run = await startRun(deps, job.id, { mode: "initial", criteria_revision: revision, resume_ids: [good, broken] }, "partial");
  const snapshot = await resumeRepository.getLatestSnapshot(broken);
  tables.resume_snapshots.delete(snapshot!.id);
  const claim = await runRepository.claim(run.id, "worker");
  const ctx = { jobId: job.id, runId: run.id }, lease = { owner: "worker", leaseToken: claim!.lease_token };
  await executeRun(deps, ctx, lease);
  await publishRun(deps, ctx, lease);
  const result = await getRun(deps, job.id, run.id);
  assert.equal(result.status, "completed_with_errors");
  assert.equal(result.is_current, true);
  assert.equal(result.counts.failed, 1);
  const rows = await screeningRepository.listForRun(run.id);
  assert.deepEqual(rows.map(r => r.resume_id), [good]);
  assert.equal(rows[0].rank_in_job, 1);
});

test("experience and education results retain evidence from their frozen snapshot", async () => {
  const job = await createJob(makePositionDeps(), { title: "Evidence", level: null, jd_raw_text: "Two years and bachelor" });
  const criteria: CriterionInputDto[] = [
    { criterion_key: "exp", kind: "experience", label: "Experience", req_type: "mandatory", weight: "50", min_years: "2", min_degree: null, skill_id: null, source: "manual", jd_evidence: [] },
    { criterion_key: "edu", kind: "education", label: "Education", req_type: "mandatory", weight: "50", min_degree: "bachelor", min_years: null, skill_id: null, source: "manual", jd_evidence: [] },
  ];
  await saveDraft(makeCriteriaDeps(), job.id, { expected_draft_version: 0, expected_revision: 0, expected_job_version: 1, criteria });
  await approve(makeCriteriaDeps(), job.id, { expected_draft_version: 1, expected_revision: 0, expected_job_version: 1 });
  const resumeId = await createParsedResume(job.id, "none");
  const snapshot = (await resumeRepository.getLatestSnapshot(resumeId))!;
  const evidence = { source: "cv" as const, source_id: snapshot.id, segment_id: "s1", quote: "2020-2022 bachelor", start_offset: 0, end_offset: 18, page: null, paragraph: 1 };
  tables.resume_snapshots.set(snapshot.id, { ...snapshot, raw_text: evidence.quote, extraction: { ...snapshot.extraction, supported_months: 24,
    employment: [{ start_raw: "2020-01", end_raw: "2022-01", ongoing: false, start_month: "2020-01", end_month_exclusive: "2022-01", evidence: [evidence] }],
    education: [{ degree_raw: "bachelor", degree_level: "bachelor", evidence: [evidence] }],
  } });
  const deps = makeRunDeps();
  const run = await startRun(deps, job.id, { mode: "initial", criteria_revision: 1, resume_ids: [resumeId] }, "evidence");
  const claim = (await runRepository.claim(run.id, "worker"))!;
  await executeRun(deps, { jobId: job.id, runId: run.id }, { owner: "worker", leaseToken: claim.lease_token });
  const screening = (await screeningRepository.listForRun(run.id))[0];
  const details = await screeningRepository.listDetails(screening.id);
  assert.equal(details.length, 2);
  for (const detail of details) assert.deepEqual(detail.evidence, [evidence]);
});

// --------------------------------------------- start preconditions (API section 4.3/4.5)

/** Publishes an initial run over every parsed CV and returns its id. */
async function publishInitial(deps: RunDeps, jobId: string, revision: number, key: string): Promise<string> {
  const run = await startRun(deps, jobId, { mode: "initial", criteria_revision: revision, resume_ids: await parsedResumeIds(jobId) }, key);
  const claimed = (await runRepository.claim(run.id, "worker-1"))!;
  const lease = { owner: "worker-1", leaseToken: claimed.lease_token };
  await executeRun(deps, { jobId, runId: run.id }, lease);
  await publishRun(deps, { jobId, runId: run.id }, lease);
  return run.id;
}

test("an initial run without resume_ids is rejected instead of silently screening every parsed CV", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");

  const deps = makeRunDeps();
  await assert.rejects(
    () => startRun(deps, job.id, { mode: "initial", criteria_revision: revision }, "idem-no-selection"),
    (err: unknown) => (err as { code?: string }).code === "invalid_run_selection",
  );
  assert.equal((await runRepository.list(job.id)).length, 0, "a rejected command must create no run");
});

test("an initial run on a parse-failed CV is rejected as an invalid selection", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  const parsed = await createParsedResume(job.id, "evidenced_use");
  const broken = await createParsedResume(job.id, "evidenced_use");
  await resumeRepository.setStatus(broken, "parse_failed", "extraction_failed");

  const deps = makeRunDeps();
  await assert.rejects(
    () => startRun(deps, job.id, { mode: "initial", criteria_revision: revision, resume_ids: [parsed, broken] }, "idem-broken"),
    (err: unknown) => (err as { code?: string }).code === "invalid_run_selection",
  );
});

test("a run on an approved but superseded criteria revision is rejected as stale_criteria", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  const resumeId = await createParsedResume(job.id, "evidenced_use");
  const newer = await approveNextSkillRevision(job.id, skill.id, revision);
  assert.equal(newer, revision + 1);

  const deps = makeRunDeps();
  await assert.rejects(
    () => startRun(deps, job.id, { mode: "initial", criteria_revision: revision, resume_ids: [resumeId] }, "idem-stale"),
    (err: unknown) => (err as { code?: string }).code === "stale_criteria",
  );
  // The latest revision is accepted.
  const run = await startRun(deps, job.id, { mode: "initial", criteria_revision: newer, resume_ids: [resumeId] }, "idem-latest");
  assert.equal(run.status, "queued");
});

test("a rescore whose base run is not the published one is rejected as run_not_current", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");

  const deps = makeRunDeps();
  const firstPublished = await publishInitial(deps, job.id, revision, "idem-first");
  const secondRevision = await approveNextSkillRevision(job.id, skill.id, revision);
  const secondPublished = await publishInitial(deps, job.id, secondRevision, "idem-second");
  assert.notEqual(firstPublished, secondPublished);
  assert.equal((await positionRepository.get(job.id))?.published_run_id, secondPublished);

  const thirdRevision = await approveNextSkillRevision(job.id, skill.id, secondRevision);
  await assert.rejects(
    () => startRun(deps, job.id, { mode: "rescore", criteria_revision: thirdRevision, base_run_id: firstPublished }, "idem-old-base"),
    (err: unknown) => (err as { code?: string }).code === "run_not_current",
  );
});

test("a rescore that reuses the published run's own criteria revision is rejected", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");

  const deps = makeRunDeps();
  const published = await publishInitial(deps, job.id, revision, "idem-base");

  // Same revision as the published run: nothing has changed, so there is nothing to rescore.
  await assert.rejects(
    () => startRun(deps, job.id, { mode: "rescore", criteria_revision: revision, base_run_id: published }, "idem-same-rev"),
    (err: unknown) => (err as { code?: string }).code === "invalid_run_selection",
  );

  // A newly approved revision is accepted against the same base run.
  const newer = await approveNextSkillRevision(job.id, skill.id, revision);
  const rescore = await startRun(deps, job.id, { mode: "rescore", criteria_revision: newer, base_run_id: published }, "idem-newer-rev");
  assert.equal(rescore.mode, "rescore");
});

test("a rescore validates the publication committed under the job lock, not the copy read before it", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");

  const deps = makeRunDeps();
  const firstPublished = await publishInitial(deps, job.id, revision, "race-first");
  const secondRevision = await approveNextSkillRevision(job.id, skill.id, revision);
  const secondPublished = await publishInitial(deps, job.id, secondRevision, "race-second");
  const thirdRevision = await approveNextSkillRevision(job.id, skill.id, secondRevision);
  assert.equal((await positionRepository.get(job.id))?.published_run_id, secondPublished);

  /*
   * startRun reads the job once before taking the job lock and once inside it.
   * This repository models a publication that commits in that gap: the first
   * read still sees the first run as published, every later read sees the
   * second. Validating against the pre-lock copy would accept a rescore of a
   * run that is no longer current.
   */
  let reads = 0;
  const racingPositionRepo: PositionRepository = Object.create(positionRepository);
  racingPositionRepo.get = async (id: string) => {
    const live = await positionRepository.get(id);
    return reads++ === 0 && live ? { ...live, published_run_id: firstPublished } : live;
  };

  await assert.rejects(
    () =>
      startRun(
        { ...deps, positionRepo: racingPositionRepo },
        job.id,
        { mode: "rescore", criteria_revision: thirdRevision, base_run_id: firstPublished },
        "race-rescore",
      ),
    (err: unknown) => (err as { code?: string }).code === "run_not_current",
  );
  assert.ok(reads >= 2, "the guard must re-read the job inside the transaction");
  assert.equal((await runRepository.list(job.id)).length, 2, "the rejected rescore must create no run");
});
