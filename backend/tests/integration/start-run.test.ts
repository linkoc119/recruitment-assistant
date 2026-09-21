import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resetTables } from "../../src/infrastructure/db/store.ts";
import { positionRepository } from "../../src/infrastructure/db/repositories/position.repository.ts";
import { criteriaRepository } from "../../src/infrastructure/db/repositories/criteria.repository.ts";
import { resumeRepository } from "../../src/infrastructure/db/repositories/resume.repository.ts";
import { runRepository } from "../../src/infrastructure/db/repositories/run.repository.ts";
import { skillRepository } from "../../src/infrastructure/db/repositories/skill.repository.ts";
import { createJob, type PositionDeps } from "../../src/domain/position/index.ts";
import { saveDraft, approve, type CriteriaDeps, type CriterionInputDto } from "../../src/domain/criteria/index.ts";
import { MockAiExtractionService } from "../../src/infrastructure/ai/index.ts";
import { POST } from "../../src/app/api/jobs/[job_id]/screening-runs/route.ts";

beforeEach(() => {
  resetTables();
});

function makePositionDeps(): PositionDeps {
  return { positionRepo: positionRepository, criteriaRepo: criteriaRepository, resumeRepo: resumeRepository, runRepo: runRepository };
}

function makeCriteriaDeps(): CriteriaDeps {
  return { positionRepo: positionRepository, criteriaRepo: criteriaRepository, skillRepo: skillRepository, ai: new MockAiExtractionService() };
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

async function createParsedResume(jobId: string): Promise<string> {
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
    skills: [{ skill_id: null, canonical_name: "TypeScript", raw_text: "TypeScript", usage: "evidenced_use", evidence: [], confidence: null }],
  });
  return resume.id;
}

function postReq(jobId: string, body: unknown, idempotencyKey: string): Request {
  return new Request(`http://localhost/api/jobs/${jobId}/screening-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

function ctxFor(jobId: string) {
  return { params: Promise.resolve({ job_id: jobId }) };
}

test("POST screening-runs rejects mode=initial combined with base_run_id (invalid_run_selection)", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id);

  const res = await POST(
    postReq(job.id, { mode: "initial", criteria_revision: revision, base_run_id: "1" }, "start-run-xor"),
    ctxFor(job.id),
  );
  assert.equal(res.status, 422);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "invalid_run_selection");
});

test("POST screening-runs rejects mode=rescore combined with resume_ids (invalid_run_selection)", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  const resumeId = await createParsedResume(job.id);

  const res = await POST(
    postReq(job.id, { mode: "rescore", criteria_revision: revision, resume_ids: [resumeId] }, "start-run-xor-2"),
    ctxFor(job.id),
  );
  assert.equal(res.status, 422);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "invalid_run_selection");
});

test("POST screening-runs starts a run (202), and a second start while it is active is rejected (active_run)", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  const resumeId = await createParsedResume(job.id);

  const first = await POST(postReq(job.id, { mode: "initial", criteria_revision: revision, resume_ids: [resumeId] }, "start-run-1"), ctxFor(job.id));
  assert.equal(first.status, 202);
  const firstBody = (await first.json()) as { id: string; status: string };
  assert.equal(firstBody.status, "queued");

  const second = await POST(postReq(job.id, { mode: "initial", criteria_revision: revision, resume_ids: [resumeId] }, "start-run-2"), ctxFor(job.id));
  assert.equal(second.status, 409);
  const secondBody = (await second.json()) as { code: string };
  assert.equal(secondBody.code, "active_run");
});

test("POST screening-runs rejects mode=initial without resume_ids (invalid_run_selection)", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id);

  const res = await POST(postReq(job.id, { mode: "initial", criteria_revision: revision }, "start-run-no-ids"), ctxFor(job.id));
  assert.equal(res.status, 422);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "invalid_run_selection");
});

test("POST screening-runs rejects an empty resume_ids array as a schema violation (400)", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const revision = await approveSkillCriteria(job.id, skill.id);
  await createParsedResume(job.id);

  // openapi.yaml RunInput declares `minItems: 1`, so [] never reaches the
  // domain: it is a malformed body, not a cross-field rule violation.
  const res = await POST(postReq(job.id, { mode: "initial", criteria_revision: revision, resume_ids: [] }, "start-run-empty"), ctxFor(job.id));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "invalid_request");
});
