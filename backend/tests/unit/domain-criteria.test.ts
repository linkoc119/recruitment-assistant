import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetTables } from "../../src/infrastructure/db/store.ts";
import { positionRepository } from "../../src/infrastructure/db/repositories/position.repository.ts";
import { criteriaRepository } from "../../src/infrastructure/db/repositories/criteria.repository.ts";
import { resumeRepository } from "../../src/infrastructure/db/repositories/resume.repository.ts";
import { runRepository } from "../../src/infrastructure/db/repositories/run.repository.ts";
import { skillRepository } from "../../src/infrastructure/db/repositories/skill.repository.ts";
import { MockAiExtractionService } from "../../src/infrastructure/ai/index.ts";
import { createJob, type PositionDeps } from "../../src/domain/position/index.ts";
import {
  getDraft,
  saveDraft,
  suggest,
  approve,
  listRevisions,
  type CriteriaDeps,
  type CriterionInputDto,
} from "../../src/domain/criteria/index.ts";
import { DomainError } from "../../src/domain/errors.ts";

function makeDeps(): CriteriaDeps {
  return {
    positionRepo: positionRepository,
    criteriaRepo: criteriaRepository,
    skillRepo: skillRepository,
    ai: new MockAiExtractionService(),
  };
}

function makePositionDeps(): PositionDeps {
  return { positionRepo: positionRepository, criteriaRepo: criteriaRepository, resumeRepo: resumeRepository, runRepo: runRepository };
}

beforeEach(() => {
  resetTables();
});

test("getDraft throws draft_not_found before any draft has been saved", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  await assert.rejects(() => getDraft(deps, job.id), (err: unknown) => err instanceof DomainError && err.code === "draft_not_found");
});

test("saveDraft rejects a stale expected_job_version with stale_job", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  await assert.rejects(
    () => saveDraft(deps, job.id, { expected_draft_version: 0, expected_revision: 0, expected_job_version: job.version + 1, criteria: [] }),
    (err: unknown) => (err as { code?: string }).code === "stale_job",
  );
});

test("saveDraft rejects duplicate skill criteria as invalid_criteria", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const criterion: CriterionInputDto = {
    criterion_key: "ts",
    kind: "skill",
    label: "TypeScript",
    skill_id: skill.id,
    req_type: "mandatory",
    weight: "50",
    min_years: null,
    min_degree: null,
    source: "manual",
    jd_evidence: [],
  };
  await assert.rejects(
    () =>
      saveDraft(deps, job.id, {
        expected_draft_version: 0,
        expected_revision: 0,
        expected_job_version: job.version,
        criteria: [criterion, { ...criterion, criterion_key: "ts2" }],
      }),
    (err: unknown) => err instanceof DomainError && err.code === "invalid_criteria",
  );
});

test("saveDraft persists requirements and resolves canonical_skill_name via skillRepo", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const draft = await saveDraft(deps, job.id, {
    expected_draft_version: 0,
    expected_revision: 0,
    expected_job_version: job.version,
    criteria: [
      {
        criterion_key: "ts",
        kind: "skill",
        label: "TypeScript",
        skill_id: skill.id,
        req_type: "mandatory",
        weight: "100",
        min_years: null,
        min_degree: null,
        source: "manual",
        jd_evidence: [],
      },
    ],
  });
  assert.equal(draft.version, 1);
  assert.equal(draft.criteria.length, 1);
  assert.equal(draft.criteria[0].criterion_key, "ts");
});

test("saveDraft rejects a stale expected_draft_version on the second save with stale_draft", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  await saveDraft(deps, job.id, { expected_draft_version: 0, expected_revision: 0, expected_job_version: job.version, criteria: [] });
  await assert.rejects(
    () => saveDraft(deps, job.id, { expected_draft_version: 0, expected_revision: 0, expected_job_version: job.version, criteria: [] }),
    (err: unknown) => (err as { code?: string }).code === "stale_draft",
  );
});

test("suggest calls the AI service and returns criteria without persisting a draft", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "Must have TypeScript. Required 3 years of experience." });
  const suggestions = await suggest(deps, job.id, { expected_job_version: job.version });
  assert.ok(suggestions.criteria.some((c) => c.kind === "skill" && c.label === "TypeScript"));
  assert.equal((deps.ai as MockAiExtractionService).callCounts.extractJd, 1);
  await assert.rejects(() => getDraft(deps, job.id), (err: unknown) => err instanceof DomainError && err.code === "draft_not_found");
});

test("approve rejects when criteria weights do not sum to exactly 100", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  await saveDraft(deps, job.id, {
    expected_draft_version: 0,
    expected_revision: 0,
    expected_job_version: job.version,
    criteria: [
      {
        criterion_key: "ts",
        kind: "skill",
        label: "TypeScript",
        skill_id: skill.id,
        req_type: "mandatory",
        weight: "60",
        min_years: null,
        min_degree: null,
        source: "manual",
        jd_evidence: [],
      },
    ],
  });
  await assert.rejects(
    () => approve(deps, job.id, { expected_draft_version: 1, expected_revision: 0, expected_job_version: job.version }),
    (err: unknown) => err instanceof DomainError && err.code === "invalid_criteria",
  );
});

test("approve freezes the draft into revision 1, and a later draft/approve cycle becomes revision 2", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const skill = await skillRepository.upsertByName("TypeScript");
  const criterion: CriterionInputDto = {
    criterion_key: "ts",
    kind: "skill",
    label: "TypeScript",
    skill_id: skill.id,
    req_type: "mandatory",
    weight: "100",
    min_years: null,
    min_degree: null,
    source: "manual",
    jd_evidence: [],
  };
  await saveDraft(deps, job.id, { expected_draft_version: 0, expected_revision: 0, expected_job_version: job.version, criteria: [criterion] });
  const revision1 = await approve(deps, job.id, { expected_draft_version: 1, expected_revision: 0, expected_job_version: job.version });
  assert.equal(revision1.revision, 1);
  assert.ok(revision1.approved_at);

  await assert.rejects(() => getDraft(deps, job.id), (err: unknown) => err instanceof DomainError && err.code === "draft_not_found");

  await saveDraft(deps, job.id, { expected_draft_version: 0, expected_revision: 1, expected_job_version: job.version, criteria: [criterion] });
  const revision2 = await approve(deps, job.id, { expected_draft_version: 1, expected_revision: 1, expected_job_version: job.version });
  assert.equal(revision2.revision, 2);

  const revisions = await listRevisions(deps, job.id);
  assert.deepEqual(revisions.map((r) => r.revision), [1, 2]);
});
