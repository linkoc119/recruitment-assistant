import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetTables, tables } from "../../src/infrastructure/db/store.ts";
import { positionRepository } from "../../src/infrastructure/db/repositories/position.repository.ts";
import { criteriaRepository } from "../../src/infrastructure/db/repositories/criteria.repository.ts";
import { resumeRepository } from "../../src/infrastructure/db/repositories/resume.repository.ts";
import { runRepository } from "../../src/infrastructure/db/repositories/run.repository.ts";
import { extractionRepository } from "../../src/infrastructure/db/repositories/extraction.repository.ts";
import { InMemoryFileStore } from "../../src/infrastructure/files/index.ts";
import { MockAiExtractionService, type AiExtractionService } from "../../src/infrastructure/ai/index.ts";
import { createJob, type PositionDeps } from "../../src/domain/position/index.ts";
import {
  uploadBatch,
  ensureExtraction,
  extractResume,
  listResumes,
  getResume,
  type CandidateDeps,
  type UploadFile,
  type UploadManifestItem,
} from "../../src/domain/candidates/index.ts";
import { DomainError } from "../../src/domain/errors.ts";

function makeDeps(ai: AiExtractionService = new MockAiExtractionService()): CandidateDeps {
  return {
    positionRepo: positionRepository,
    resumeRepo: resumeRepository,
    extractionRepo: extractionRepository,
    fileStore: new InMemoryFileStore(),
    ai,
  };
}

function makePositionDeps(): PositionDeps {
  return { positionRepo: positionRepository, criteriaRepo: criteriaRepository, resumeRepo: resumeRepository, runRepo: runRepository };
}

function pdf(text: string): UploadFile {
  return { buffer: new TextEncoder().encode(text), original_name: "cv.pdf", media_type: "application/pdf" };
}

beforeEach(() => {
  resetTables();
});

test("uploadBatch accepts a new candidate and enqueues an extraction job", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const manifest: UploadManifestItem[] = [{ client_file_id: "f1", file_index: 0, identity_mode: "new_candidate" }];
  const result = await uploadBatch(deps, job.id, { files: [pdf("Candidate A resume, TypeScript developer.")], manifest });

  assert.equal(result.accepted_count, 1);
  assert.equal(result.items[0].outcome, "accepted");
  assert.equal(result.items[0].status, "uploaded");
  const resumeId = result.items[0].resume_id as string;
  const activeJob = await deps.extractionRepo.findActiveForResume(resumeId);
  assert.ok(activeJob);
  assert.equal(activeJob?.status, "queued");
});

test("uploadBatch marks a byte-identical second file in the same job as duplicate (BR-CV-01)", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const file = pdf("Same content for both uploads.");
  const manifest: UploadManifestItem[] = [
    { client_file_id: "f1", file_index: 0, identity_mode: "new_candidate" },
    { client_file_id: "f2", file_index: 1, identity_mode: "new_candidate" },
  ];
  const result = await uploadBatch(deps, job.id, { files: [file, file], manifest });

  assert.equal(result.accepted_count, 1);
  assert.equal(result.duplicate_count, 1);
  assert.equal(result.items[1].outcome, "duplicate");
  assert.equal(result.items[1].resume_id, result.items[0].resume_id);
});

test("uploadBatch rejects an unsupported media type", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const manifest: UploadManifestItem[] = [{ client_file_id: "f1", file_index: 0, identity_mode: "new_candidate" }];
  const file: UploadFile = { buffer: new TextEncoder().encode("plain text"), original_name: "cv.txt", media_type: "text/plain" };
  const result = await uploadBatch(deps, job.id, { files: [file], manifest });

  assert.equal(result.rejected_count, 1);
  assert.equal(result.items[0].outcome, "rejected");
  assert.equal(result.items[0].error_code, "unsupported_media_type");
});

test("uploadBatch rejects new_version without candidate_id/identity_confirmed (BR-CV-02)", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const manifest: UploadManifestItem[] = [{ client_file_id: "f1", file_index: 0, identity_mode: "new_version" }];
  const result = await uploadBatch(deps, job.id, { files: [pdf("some cv text")], manifest });

  assert.equal(result.rejected_count, 1);
  assert.equal(result.items[0].error_code, "invalid_manifest");
});

test("uploadBatch new_version with confirmed identity creates the next version for the same candidate", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const first = await uploadBatch(deps, job.id, {
    files: [pdf("v1 content")],
    manifest: [{ client_file_id: "f1", file_index: 0, identity_mode: "new_candidate" }],
  });
  const resume1 = await resumeRepository.getResume(first.items[0].resume_id as string);
  assert.ok(resume1);

  const second = await uploadBatch(deps, job.id, {
    files: [pdf("v2 content, different from v1")],
    manifest: [{ client_file_id: "f2", file_index: 0, identity_mode: "new_version", candidate_id: resume1!.candidate_id, identity_confirmed: true }],
  });
  assert.equal(second.items[0].outcome, "new_version");
  const resume2 = await resumeRepository.getResume(second.items[0].resume_id as string);
  assert.equal(resume2?.version, 2);
  assert.equal(resume2?.candidate_id, resume1!.candidate_id);
});

test("ensureExtraction reuses the active job instead of enqueueing a second one", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const candidate = await resumeRepository.createCandidate({ full_name: null, email: null, phone: null });
  const resume = await resumeRepository.createResumeVersion({
    candidateId: candidate.id,
    version: 1,
    fileName: "cv.pdf",
    objectKey: "mem://x",
    fileHash: "hash-x",
    mediaType: "application/pdf",
    sizeBytes: 10,
  });
  await resumeRepository.link(job.id, resume.id);

  const first = await ensureExtraction(deps, { jobId: job.id, resumeId: resume.id });
  const second = await ensureExtraction(deps, { jobId: job.id, resumeId: resume.id });
  assert.equal(first.id, second.id);
});

test("extractResume commits a snapshot, skill facts and marks the resume parsed", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const uploaded = await uploadBatch(deps, job.id, {
    files: [pdf("TypeScript engineer. Worked 2022-01 to 2023-01 using TypeScript daily.")],
    manifest: [{ client_file_id: "f1", file_index: 0, identity_mode: "new_candidate" }],
  });
  const resumeId = uploaded.items[0].resume_id as string;

  const extractionJob = await deps.extractionRepo.findActiveForResume(resumeId);
  assert.ok(extractionJob);
  const claimed = await extractionRepository.claim(extractionJob!.id, "worker-1");
  assert.ok(claimed);

  const snapshot = await extractResume(
    deps,
    { extractionJobId: extractionJob!.id, jobId: job.id, resumeId },
    { owner: "worker-1", leaseToken: claimed!.lease_token },
  );
  assert.ok(snapshot);
  assert.equal(snapshot!.extraction.employment.length, 1);
  assert.equal(snapshot!.extraction.employment[0].start_month, "2022-01");
  // end_raw "2023-01" is the last inclusive month worked, so the exclusive bound shifts forward one month.
  assert.equal(snapshot!.extraction.employment[0].end_month_exclusive, "2023-02");
  assert.equal(snapshot!.extraction.supported_months, 13);

  const resume = await resumeRepository.getResume(resumeId);
  assert.equal(resume?.status, "parsed");

  const finishedJob = await extractionRepository.findScoped(job.id, extractionJob!.id);
  assert.equal(finishedJob?.status, "succeeded");
});

test("extractResume marks the resume parse_failed once MAX_ATTEMPTS is exhausted", async () => {
  const failingAi: AiExtractionService = {
    extractJd: async () => ({ schema_version: "extraction-v1", criteria: [] }),
    extractCv: async () => {
      throw new Error("boom");
    },
  };
  const deps = makeDeps(failingAi);
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const candidate = await resumeRepository.createCandidate({ full_name: null, email: null, phone: null });
  const resume = await resumeRepository.createResumeVersion({
    candidateId: candidate.id,
    version: 1,
    fileName: "cv.pdf",
    objectKey: (await deps.fileStore.put(new TextEncoder().encode("content"), "application/pdf")).object_key,
    fileHash: "hash-y",
    mediaType: "application/pdf",
    sizeBytes: 10,
  });
  await resumeRepository.link(job.id, resume.id);
  const extractionJob = await ensureExtraction(deps, { jobId: job.id, resumeId: resume.id });

  for (let attempt = 1; attempt <= 3; attempt++) {
    const current = tables.resume_extraction_jobs.get(extractionJob.id)!;
    tables.resume_extraction_jobs.set(extractionJob.id, { ...current, available_at: new Date(Date.now() - 1000).toISOString() });
    const claimed = await extractionRepository.claim(extractionJob.id, "worker-1");
    assert.ok(claimed, `attempt ${attempt} should be claimable`);
    await extractResume(
      deps,
      { extractionJobId: extractionJob.id, jobId: job.id, resumeId: resume.id },
      { owner: "worker-1", leaseToken: claimed!.lease_token },
    );
  }

  const finalResume = await resumeRepository.getResume(resume.id);
  assert.equal(finalResume?.status, "parse_failed");
  const finalJob = await extractionRepository.findScoped(job.id, extractionJob.id);
  assert.equal(finalJob?.status, "failed");
});

test("getResume throws resource_not_found for a resume not linked to the job", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  await assert.rejects(() => getResume(deps, job.id, "999"), (err: unknown) => err instanceof DomainError && err.code === "resource_not_found");
});

test("listResumes paginates resumes for a job", async () => {
  const deps = makeDeps();
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  await uploadBatch(deps, job.id, {
    files: [pdf("cv one"), pdf("cv two")],
    manifest: [
      { client_file_id: "f1", file_index: 0, identity_mode: "new_candidate" },
      { client_file_id: "f2", file_index: 1, identity_mode: "new_candidate" },
    ],
  });
  const page = await listResumes(deps, job.id, { offset: 0, limit: 1 });
  assert.equal(page.items.length, 1);
  assert.equal(page.page.total, 2);
});
