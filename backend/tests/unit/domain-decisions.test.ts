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
import { StaleResultError } from "../../src/infrastructure/db/repositories/screening.repository.ts";
import { InMemoryIdempotencyStore } from "../../src/infrastructure/idempotency/index.ts";
import { MockAiExtractionService } from "../../src/infrastructure/ai/index.ts";
import { createJob, type PositionDeps } from "../../src/domain/position/index.ts";
import { saveDraft, approve, type CriteriaDeps, type CriterionInputDto } from "../../src/domain/criteria/index.ts";
import { startRun, executeRun, publishRun, type RunDeps } from "../../src/domain/runs/index.ts";
import { queryRanking, getResult, recordDecision, type DecisionDeps } from "../../src/domain/decisions/index.ts";
import { DomainError } from "../../src/domain/errors.ts";

function makePositionDeps(): PositionDeps {
  return { positionRepo: positionRepository, criteriaRepo: criteriaRepository, resumeRepo: resumeRepository, runRepo: runRepository };
}

function makeCriteriaDeps(): CriteriaDeps {
  return { positionRepo: positionRepository, criteriaRepo: criteriaRepository, skillRepo: skillRepository, ai: new MockAiExtractionService() };
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

function makeDecisionDeps(): DecisionDeps {
  return {
    positionRepo: positionRepository,
    criteriaRepo: criteriaRepository,
    resumeRepo: resumeRepository,
    runRepo: runRepository,
    screeningRepo: screeningRepository,
  };
}

beforeEach(() => {
  resetTables();
});

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

async function createParsedResume(jobId: string, usage: "evidenced_use" | "listed_only" | "none"): Promise<string> {
  const candidate = await resumeRepository.createCandidate({ full_name: "Candidate", email: null, phone: null });
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

/** startRun + claim + executeRun + publishRun; returns the run id. */
async function runAndPublish(deps: RunDeps, jobId: string, revision: number, key: string): Promise<string> {
  // API README section 4.3: an initial run names its CVs. These fixtures screen every parsed CV.
  const resumeIds = (await resumeRepository.list(jobId, (r) => r.status === "parsed")).map((r) => r.id);
  const run = await startRun(deps, jobId, { mode: "initial", criteria_revision: revision, resume_ids: resumeIds }, key);
  const claimed = await runRepository.claim(run.id, "worker-1");
  assert.ok(claimed);
  await executeRun(deps, { jobId, runId: run.id }, { owner: "worker-1", leaseToken: claimed!.lease_token });
  await publishRun(deps, { jobId, runId: run.id }, { owner: "worker-1", leaseToken: claimed!.lease_token });
  return run.id;
}

test("queryRanking returns an empty result when the job has no published run", async () => {
  const deps = makeDecisionDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const ranking = await queryRanking(deps, job.id, { offset: 0, limit: 10 });
  assert.equal(ranking.run_id, null);
  assert.deepEqual(ranking.items, []);
  assert.equal(ranking.page.total, 0);
});

test("queryRanking throws resource_not_found for an unknown job", async () => {
  const deps = makeDecisionDeps();
  await assert.rejects(() => queryRanking(deps, "999", { offset: 0, limit: 10 }), (err: unknown) => err instanceof DomainError && err.code === "resource_not_found");
});

test("queryRanking sorts passed_mandatory DESC then displayed_total DESC then resume_id ASC, with eligibility counts", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  const matched = await createParsedResume(job.id, "evidenced_use");
  const missing = await createParsedResume(job.id, "none");

  const runDeps = makeRunDeps();
  const runId = await runAndPublish(runDeps, job.id, revision, "idem-1");

  const deps = makeDecisionDeps();
  const ranking = await queryRanking(deps, job.id, { offset: 0, limit: 10 });
  assert.equal(ranking.run_id, runId);
  assert.equal(ranking.is_current, true);
  assert.deepEqual(ranking.items.map((r) => r.resume_id), [matched, missing]);
  assert.equal(ranking.items[0].passed_mandatory, true);
  assert.equal(ranking.items[1].passed_mandatory, false);
  assert.deepEqual(ranking.eligibility_counts, { passed: 1, failed: 1 });
});

test("queryRanking rejects a page beyond the first when the decision_epoch no longer matches (page_changed)", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");

  const runDeps = makeRunDeps();
  const runId = await runAndPublish(runDeps, job.id, revision, "idem-1");

  const deps = makeDecisionDeps();
  await assert.rejects(
    () => queryRanking(deps, job.id, { offset: 1, run_id: runId, decision_epoch: 5, limit: 10 }),
    (err: unknown) => (err as { code?: string }).code === "page_changed",
  );
  // decision_epoch 0 matches the freshly-published run's actual epoch, so the same call succeeds.
  const page = await queryRanking(deps, job.id, { offset: 1, run_id: runId, decision_epoch: 0, limit: 10 });
  assert.equal(page.run_id, runId);
});

test("getResult returns the full detail DTO including per-criterion matches", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  const resumeId = await createParsedResume(job.id, "evidenced_use");

  const runDeps = makeRunDeps();
  const runId = await runAndPublish(runDeps, job.id, revision, "idem-1");

  const deps = makeDecisionDeps();
  const ranking = await queryRanking(deps, job.id, { offset: 0, limit: 10 });
  const resultId = ranking.items[0].result_id;

  const resume = await resumeRepository.getResume(resumeId);
  const candidate = tables.candidates.get(resume!.candidate_id)!;
  tables.candidates.set(candidate.id, { ...candidate, full_name: "Later live name", email: "later@example.test" });
  const detail = await getResult(deps, { jobId: job.id, runId, resultId });
  assert.equal(detail.candidate.full_name, null, "detail uses frozen extraction facts");
  assert.equal(detail.candidate.email, null);
  assert.equal((await queryRanking(deps, job.id, { offset: 0, limit: 10 })).items[0].candidate_name, null);
  assert.equal(detail.resume_id, resumeId);
  assert.equal(detail.passed_mandatory, true);
  assert.equal(detail.can_decide, true);
  assert.equal(detail.criteria.length, 1);
  assert.equal(detail.criteria[0].match_status, "matched");
  assert.equal(detail.criteria[0].criterion_passed, true);
});

test("getResult throws resource_not_found for an unknown result", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");
  const runDeps = makeRunDeps();
  const runId = await runAndPublish(runDeps, job.id, revision, "idem-1");

  const deps = makeDecisionDeps();
  await assert.rejects(
    () => getResult(deps, { jobId: job.id, runId, resultId: "999" }),
    (err: unknown) => err instanceof DomainError && err.code === "resource_not_found",
  );
});

test("recordDecision shortlists a passing candidate and bumps result_version", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");

  const runDeps = makeRunDeps();
  const runId = await runAndPublish(runDeps, job.id, revision, "idem-1");

  const deps = makeDecisionDeps();
  const ranking = await queryRanking(deps, job.id, { offset: 0, limit: 10 });
  const resultId = ranking.items[0].result_id;

  const decision = await recordDecision(deps, { jobId: job.id, runId, resultId }, { decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false });
  assert.equal(decision.status, "shortlisted");
  assert.equal(decision.result_version, 2);
  assert.ok(decision.decision_at);
});

test("recordDecision requires confirm_failed_mandatory to shortlist a candidate who failed mandatory criteria", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "none");

  const runDeps = makeRunDeps();
  const runId = await runAndPublish(runDeps, job.id, revision, "idem-1");

  const deps = makeDecisionDeps();
  const ranking = await queryRanking(deps, job.id, { offset: 0, limit: 10 });
  const resultId = ranking.items[0].result_id;
  assert.equal(ranking.items[0].passed_mandatory, false);

  await assert.rejects(
    () => recordDecision(deps, { jobId: job.id, runId, resultId }, { decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false }),
    (err: unknown) => err instanceof DomainError && err.code === "confirmation_required",
  );

  const decision = await recordDecision(deps, { jobId: job.id, runId, resultId }, { decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: true });
  assert.equal(decision.status, "shortlisted");
});

test("recordDecision refuses to change an already-final decision (decision_final)", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");

  const runDeps = makeRunDeps();
  const runId = await runAndPublish(runDeps, job.id, revision, "idem-1");

  const deps = makeDecisionDeps();
  const ranking = await queryRanking(deps, job.id, { offset: 0, limit: 10 });
  const resultId = ranking.items[0].result_id;

  await recordDecision(deps, { jobId: job.id, runId, resultId }, { decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false });
  await assert.rejects(
    () => recordDecision(deps, { jobId: job.id, runId, resultId }, { decision: "rejected", expected_result_version: 2, confirm_failed_mandatory: false }),
    (err: unknown) => err instanceof DomainError && err.code === "decision_final",
  );
});

test("recordDecision replaying the exact same decision at the current version is a no-op", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");

  const runDeps = makeRunDeps();
  const runId = await runAndPublish(runDeps, job.id, revision, "idem-1");

  const deps = makeDecisionDeps();
  const ranking = await queryRanking(deps, job.id, { offset: 0, limit: 10 });
  const resultId = ranking.items[0].result_id;

  const first = await recordDecision(deps, { jobId: job.id, runId, resultId }, { decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false });
  assert.equal(first.result_version, 2);
  const replay = await recordDecision(deps, { jobId: job.id, runId, resultId }, { decision: "shortlisted", expected_result_version: 2, confirm_failed_mandatory: false });
  assert.equal(replay.result_version, 2);
  assert.equal(replay.status, "shortlisted");
});

test("AT-08: of two concurrent decision sessions reading the same version, the second is rejected as stale_result", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");

  const runDeps = makeRunDeps();
  const runId = await runAndPublish(runDeps, job.id, revision, "idem-1");

  const deps = makeDecisionDeps();
  const ranking = await queryRanking(deps, job.id, { offset: 0, limit: 10 });
  const resultId = ranking.items[0].result_id;

  // Both sessions read the same result_version (1) before either writes.
  const sessionA = recordDecision(deps, { jobId: job.id, runId, resultId }, { decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false });
  const first = await sessionA;
  assert.equal(first.status, "shortlisted");

  await assert.rejects(
    () => recordDecision(deps, { jobId: job.id, runId, resultId }, { decision: "rejected", expected_result_version: 1, confirm_failed_mandatory: false }),
    (err: unknown) => err instanceof StaleResultError,
  );
});

test("recordDecision refuses to act on a run that is not the currently published one (run_not_current)", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  const resumeId = await createParsedResume(job.id, "evidenced_use");

  const runDeps = makeRunDeps();
  await runAndPublish(runDeps, job.id, revision, "idem-1");

  // Start and execute a second initial run for a fresh resume, but never publish it.
  const secondResumeJob = await createJob(makePositionDeps(), { title: "B", level: null, jd_raw_text: "jd" });
  const skill2 = await skillRepository.upsertByName("Go");
  const revision2 = await approveSkillCriteria(secondResumeJob.id, skill2.id);
  await createParsedResume(secondResumeJob.id, "evidenced_use");
  const secondResumeIds = (await resumeRepository.list(secondResumeJob.id, (r) => r.status === "parsed")).map((r) => r.id);
  const run2 = await startRun(runDeps, secondResumeJob.id, { mode: "initial", criteria_revision: revision2, resume_ids: secondResumeIds }, "idem-2");
  const claimed2 = await runRepository.claim(run2.id, "worker-2");
  await executeRun(runDeps, { jobId: secondResumeJob.id, runId: run2.id }, { owner: "worker-2", leaseToken: claimed2!.lease_token });
  // Intentionally not published.

  const deps = makeDecisionDeps();
  const ranking2 = await screeningRepository.listForRun(run2.id);
  assert.equal(ranking2.length, 1);
  const resultId2 = ranking2[0].id;

  await assert.rejects(
    () => recordDecision(deps, { jobId: secondResumeJob.id, runId: run2.id, resultId: resultId2 }, { decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false }),
    (err: unknown) => err instanceof DomainError && err.code === "run_not_current",
  );
  void resumeId;
});

test("ranking filters before pagination and retains original ranks", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");
  const failed = await createParsedResume(job.id, "none");
  await runAndPublish(makeRunDeps(), job.id, revision, "filters");
  const deps = makeDecisionDeps();
  const filtered = await queryRanking(deps, job.id, { offset: 0, limit: 1, passed_mandatory: false, search: "CV.PDF", decision: "scored" });
  assert.equal(filtered.page.total, 1);
  assert.equal(filtered.items[0].resume_id, failed);
  assert.equal(filtered.items[0].rank, 2);
  assert.equal((await queryRanking(deps, job.id, { offset: 0, limit: 1, search: "absent" })).page.total, 0);
  assert.equal((await queryRanking(deps, job.id, { offset: 0, limit: 1, decision: "shortlisted" })).page.total, 0);
});

test("concurrent conflicting decisions produce one write and one epoch increment", async () => {
  const job = await createJob(makePositionDeps(), { title: "Concurrent", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, "evidenced_use");
  const runId = await runAndPublish(makeRunDeps(), job.id, revision, "concurrent");
  const deps = makeDecisionDeps();
  const ranking = await queryRanking(deps, job.id, { offset: 0, limit: 10 });
  const ctx = { jobId: job.id, runId, resultId: ranking.items[0].result_id };
  const outcomes = await Promise.allSettled([
    recordDecision(deps, ctx, { decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false }),
    recordDecision(deps, ctx, { decision: "rejected", expected_result_version: 1, confirm_failed_mandatory: false }),
  ]);
  assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1);
  assert.equal((await queryRanking(deps, job.id, { offset: 0, limit: 10 })).decision_epoch, 1);
  assert.equal((await getResult(deps, ctx)).result_version, 2);
});
