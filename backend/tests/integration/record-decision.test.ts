import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resetTables } from "../../src/infrastructure/db/store.ts";
import { positionRepository } from "../../src/infrastructure/db/repositories/position.repository.ts";
import { criteriaRepository } from "../../src/infrastructure/db/repositories/criteria.repository.ts";
import { resumeRepository } from "../../src/infrastructure/db/repositories/resume.repository.ts";
import { runRepository } from "../../src/infrastructure/db/repositories/run.repository.ts";
import { screeningRepository } from "../../src/infrastructure/db/repositories/screening.repository.ts";
import { skillRepository } from "../../src/infrastructure/db/repositories/skill.repository.ts";
import { InMemoryIdempotencyStore } from "../../src/infrastructure/idempotency/index.ts";
import { MockAiExtractionService } from "../../src/infrastructure/ai/index.ts";
import { createJob, type PositionDeps } from "../../src/domain/position/index.ts";
import { saveDraft, approve, type CriteriaDeps, type CriterionInputDto } from "../../src/domain/criteria/index.ts";
import { startRun, executeRun, publishRun, type RunDeps } from "../../src/domain/runs/index.ts";
import { queryRanking, type DecisionDeps } from "../../src/domain/decisions/index.ts";
import { PATCH } from "../../src/app/api/jobs/[job_id]/screening-runs/[run_id]/results/[result_id]/decision/route.ts";

beforeEach(() => {
  resetTables();
});

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
  // API README section 4.3: an initial run names its CVs. This fixture screens every parsed CV.
  const resumeIds = (await resumeRepository.list(jobId, (r) => r.status === "parsed")).map((r) => r.id);
  const run = await startRun(deps, jobId, { mode: "initial", criteria_revision: revision, resume_ids: resumeIds }, key);
  const claimed = await runRepository.claim(run.id, "worker-1");
  assert.ok(claimed);
  await executeRun(deps, { jobId, runId: run.id }, { owner: "worker-1", leaseToken: claimed!.lease_token });
  await publishRun(deps, { jobId, runId: run.id }, { owner: "worker-1", leaseToken: claimed!.lease_token });
  return run.id;
}

/** Sets up a job with an approved mandatory skill criterion, a parsed resume (given usage), and a published run. Returns ids needed to call the decision route. */
async function setupPublishedResult(usage: "evidenced_use" | "listed_only" | "none") {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id, usage);

  const runDeps = makeRunDeps();
  const runId = await runAndPublish(runDeps, job.id, revision, "idem-1");

  const decisionDeps = makeDecisionDeps();
  const ranking = await queryRanking(decisionDeps, job.id, { offset: 0, limit: 10 });
  const resultId = ranking.items[0].result_id;
  return { jobId: job.id, runId, resultId, passedMandatory: ranking.items[0].passed_mandatory };
}

function patchReq(body: unknown): Request {
  return new Request("http://localhost/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctxFor(jobId: string, runId: string, resultId: string) {
  return { params: Promise.resolve({ job_id: jobId, run_id: runId, result_id: resultId }) };
}

test("PATCH decision shortlists a passing candidate and returns 200 with bumped result_version", async () => {
  const { jobId, runId, resultId } = await setupPublishedResult("evidenced_use");

  const res = await PATCH(
    patchReq({ decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false }),
    ctxFor(jobId, runId, resultId),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(typeof res.headers.get("X-Request-Id"), "string");

  const body = (await res.json()) as { status: string; result_version: number };
  assert.equal(body.status, "shortlisted");
  assert.equal(body.result_version, 2);
});

test("PATCH decision rejects a stale expected_result_version with stale_result", async () => {
  const { jobId, runId, resultId } = await setupPublishedResult("evidenced_use");

  await PATCH(patchReq({ decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false }), ctxFor(jobId, runId, resultId));

  const res = await PATCH(
    patchReq({ decision: "rejected", expected_result_version: 1, confirm_failed_mandatory: false }),
    ctxFor(jobId, runId, resultId),
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "stale_result");
});

test("PATCH decision rejects changing an already-final decision with decision_final", async () => {
  const { jobId, runId, resultId } = await setupPublishedResult("evidenced_use");

  await PATCH(patchReq({ decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false }), ctxFor(jobId, runId, resultId));

  const res = await PATCH(
    patchReq({ decision: "rejected", expected_result_version: 2, confirm_failed_mandatory: false }),
    ctxFor(jobId, runId, resultId),
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "decision_final");
});

test("PATCH decision replaying the exact same decision at the current version is a no-op (200, same version)", async () => {
  const { jobId, runId, resultId } = await setupPublishedResult("evidenced_use");

  const first = await PATCH(patchReq({ decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false }), ctxFor(jobId, runId, resultId));
  const firstBody = (await first.json()) as { result_version: number };
  assert.equal(firstBody.result_version, 2);

  const replay = await PATCH(
    patchReq({ decision: "shortlisted", expected_result_version: 2, confirm_failed_mandatory: false }),
    ctxFor(jobId, runId, resultId),
  );
  assert.equal(replay.status, 200);
  const replayBody = (await replay.json()) as { status: string; result_version: number };
  assert.equal(replayBody.status, "shortlisted");
  assert.equal(replayBody.result_version, 2);
});

test("PATCH decision requires confirm_failed_mandatory to shortlist a candidate who failed mandatory criteria (422 confirmation_required)", async () => {
  const { jobId, runId, resultId, passedMandatory } = await setupPublishedResult("none");
  assert.equal(passedMandatory, false);

  const res = await PATCH(
    patchReq({ decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false }),
    ctxFor(jobId, runId, resultId),
  );
  assert.equal(res.status, 422);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "confirmation_required");

  const confirmed = await PATCH(
    patchReq({ decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: true }),
    ctxFor(jobId, runId, resultId),
  );
  assert.equal(confirmed.status, 200);
  const confirmedBody = (await confirmed.json()) as { status: string };
  assert.equal(confirmedBody.status, "shortlisted");
});

test("PATCH decision returns resource_not_found for an unknown result_id", async () => {
  const { jobId, runId } = await setupPublishedResult("evidenced_use");

  const res = await PATCH(
    patchReq({ decision: "shortlisted", expected_result_version: 1, confirm_failed_mandatory: false }),
    ctxFor(jobId, runId, "999999"),
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "resource_not_found");
});
