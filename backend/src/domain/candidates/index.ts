/**
 * `domain/candidates` (CLS-02 `ResumeService`). Owns the upload pipeline,
 * extraction orchestration, and the CV read-model.
 *
 * Identity rules (BR-CV-01..03):
 * - Same sha256 in the same position → `duplicate` (not an error).
 * - `new_version` requires `candidate_id` + `identity_confirmed: true`.
 * - Never auto-merge by name/email (BR-CV-03).
 */
import { DomainError, notFound } from "../errors.ts";
import { segmentText } from "../text/index.ts";
import { computeSupportedMonths } from "../scoring/index.ts";
import type { ExtractionRepository } from "../../infrastructure/db/repositories/extraction.repository.ts";
import type { PositionRepository } from "../../infrastructure/db/repositories/position.repository.ts";
import type { ResumeRepository } from "../../infrastructure/db/repositories/resume.repository.ts";
import type { FileStore } from "../../infrastructure/files/index.ts";
import type { AiExtractionService } from "../../infrastructure/ai/index.ts";
import type {
  Candidate,
  ExtractionConfig,
  ParseStatus,
  Resume,
  ResumeExtractionJob,
  ResumeSnapshot,
  Evidence,
  SourceSegment,
} from "../types/index.ts";

export interface CandidateDeps {
  positionRepo: PositionRepository;
  resumeRepo: ResumeRepository;
  extractionRepo: ExtractionRepository;
  fileStore: FileStore;
  ai: AiExtractionService;
}

const MAX_FILE_BYTES = 10_485_760;
const ACCEPTED_MEDIA_TYPES = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

const DEFAULT_CONFIG: Omit<ExtractionConfig, "as_of_date"> = {
  parser_version: "text-v1",
  model_version: "mock-v1",
  prompt_version: "prompt-v1",
  schema_version: "extraction-v1",
  dictionary_version: "dict-v1",
  normalization_version: "months-v1",
};

// ------------------------------------------------------------------- DTOs

export interface CandidateDto {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  latest_resume_id: string | null;
  latest_version: number | null;
}

export interface ResumeDto {
  id: string;
  job_id: string;
  candidate_id: string;
  version: number;
  file_name: string;
  media_type: string;
  size_bytes: number;
  status: ParseStatus;
  snapshot_id: string | null;
  created_at: string;
  error_code: string | null;
  can_screen: boolean;
}

export interface UploadManifestItem {
  client_file_id: string;
  file_index: number;
  identity_mode: "new_candidate" | "new_version";
  candidate_id?: string;
  identity_confirmed?: boolean;
}

export interface UploadFile {
  buffer: Uint8Array;
  original_name: string;
  media_type: string;
}

export interface UploadOutcomeDto {
  client_file_id: string;
  outcome: "accepted" | "new_version" | "duplicate" | "rejected";
  resume_id: string | null;
  status: ParseStatus | null;
  error_code: string | null;
  message: string | null;
}

export interface UploadResponseDto {
  items: UploadOutcomeDto[];
  accepted_count: number;
  duplicate_count: number;
  rejected_count: number;
}

// ----------------------------------------------------------------- assemblers

async function assembleCandidate(resumeRepo: ResumeRepository, candidate: Candidate): Promise<CandidateDto> {
  const latestResume = await resumeRepo.latestVersionForCandidate(candidate.id);
  return {
    id: candidate.id,
    full_name: candidate.full_name,
    email: candidate.email,
    phone: candidate.phone,
    latest_resume_id: latestResume?.id ?? null,
    latest_version: latestResume?.version ?? null,
  };
}

async function assembleResume(resumeRepo: ResumeRepository, jobId: string, resume: Resume): Promise<ResumeDto> {
  const snapshot = await resumeRepo.getLatestSnapshot(resume.id);
  return {
    id: resume.id,
    job_id: jobId,
    candidate_id: resume.candidate_id,
    version: resume.version,
    file_name: resume.file_name,
    media_type: resume.media_type,
    size_bytes: resume.size_bytes,
    status: resume.status,
    snapshot_id: snapshot?.id ?? null,
    created_at: resume.created_at,
    error_code: resume.error_code,
    can_screen: resume.status === "parsed",
  };
}

// ------------------------------------------------------------------ service

export async function listResumes(
  deps: CandidateDeps,
  jobId: string,
  query: { status?: ParseStatus; offset: number; limit: number },
): Promise<{ items: ResumeDto[]; page: { offset: number; limit: number; total: number } }> {
  const job = await deps.positionRepo.get(jobId);
  if (!job) throw notFound("Job");
  const { items, total } = await deps.resumeRepo.listForJob(jobId, query);
  const dtoItems = await Promise.all(items.map((r) => assembleResume(deps.resumeRepo, jobId, r)));
  return { items: dtoItems, page: { offset: query.offset, limit: query.limit, total } };
}

export async function getResume(deps: CandidateDeps, jobId: string, resumeId: string): Promise<ResumeDto> {
  const job = await deps.positionRepo.get(jobId);
  if (!job) throw notFound("Job");
  const resume = await deps.resumeRepo.findScoped(jobId, resumeId);
  if (!resume) throw notFound("Resume");
  return assembleResume(deps.resumeRepo, jobId, resume);
}

export async function uploadBatch(
  deps: CandidateDeps,
  jobId: string,
  input: { files: UploadFile[]; manifest: UploadManifestItem[] },
): Promise<UploadResponseDto> {
  const job = await deps.positionRepo.get(jobId);
  if (!job) throw notFound("Job");

  const outcomes: UploadOutcomeDto[] = [];
  let acceptedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;

  for (const item of input.manifest) {
    const file = input.files[item.file_index];
    if (!file) {
      outcomes.push({ client_file_id: item.client_file_id, outcome: "rejected", resume_id: null, status: null, error_code: "invalid_manifest", message: `file_index ${item.file_index} not present` });
      rejectedCount++;
      continue;
    }

    if (file.buffer.byteLength > MAX_FILE_BYTES) {
      outcomes.push({ client_file_id: item.client_file_id, outcome: "rejected", resume_id: null, status: null, error_code: "request_too_large", message: "File exceeds 10 MB limit." });
      rejectedCount++;
      continue;
    }

    if (!ACCEPTED_MEDIA_TYPES.has(file.media_type)) {
      outcomes.push({ client_file_id: item.client_file_id, outcome: "rejected", resume_id: null, status: null, error_code: "unsupported_media_type", message: `Media type ${file.media_type} is not accepted.` });
      rejectedCount++;
      continue;
    }

    // Store and compute hash first.
    const stored = await deps.fileStore.put(file.buffer, file.media_type);

    // BR-CV-01: dedupe identical file content in the same position.
    const existingByHash = await deps.resumeRepo.findByHashInJob(jobId, stored.sha256);
    if (existingByHash) {
      outcomes.push({ client_file_id: item.client_file_id, outcome: "duplicate", resume_id: existingByHash.id, status: existingByHash.status, error_code: null, message: null });
      duplicateCount++;
      continue;
    }

    if (item.identity_mode === "new_version") {
      if (!item.candidate_id || !item.identity_confirmed) {
        outcomes.push({ client_file_id: item.client_file_id, outcome: "rejected", resume_id: null, status: null, error_code: "invalid_manifest", message: "new_version requires candidate_id and identity_confirmed: true." });
        rejectedCount++;
        continue;
      }
      const candidate = await deps.resumeRepo.getCandidate(item.candidate_id);
      if (!candidate) {
        outcomes.push({ client_file_id: item.client_file_id, outcome: "rejected", resume_id: null, status: null, error_code: "resource_not_found", message: "Candidate not found." });
        rejectedCount++;
        continue;
      }
      const latestResume = await deps.resumeRepo.latestVersionForCandidate(item.candidate_id);
      const newVersion = (latestResume?.version ?? 0) + 1;
      const resume = await deps.resumeRepo.createResumeVersion({
        candidateId: item.candidate_id,
        version: newVersion,
        fileName: file.original_name,
        objectKey: stored.object_key,
        fileHash: stored.sha256,
        mediaType: file.media_type,
        sizeBytes: file.buffer.byteLength,
      });
      await deps.resumeRepo.link(jobId, resume.id);
      await ensureExtraction(deps, { jobId, resumeId: resume.id });
      outcomes.push({ client_file_id: item.client_file_id, outcome: "new_version", resume_id: resume.id, status: resume.status, error_code: null, message: null });
      acceptedCount++;
    } else {
      // new_candidate
      const candidate = await deps.resumeRepo.createCandidate({ full_name: null, email: null, phone: null });
      const resume = await deps.resumeRepo.createResumeVersion({
        candidateId: candidate.id,
        version: 1,
        fileName: file.original_name,
        objectKey: stored.object_key,
        fileHash: stored.sha256,
        mediaType: file.media_type,
        sizeBytes: file.buffer.byteLength,
      });
      await deps.resumeRepo.link(jobId, resume.id);
      await ensureExtraction(deps, { jobId, resumeId: resume.id });
      outcomes.push({ client_file_id: item.client_file_id, outcome: "accepted", resume_id: resume.id, status: resume.status, error_code: null, message: null });
      acceptedCount++;
    }
  }

  return { items: outcomes, accepted_count: acceptedCount, duplicate_count: duplicateCount, rejected_count: rejectedCount };
}

/**
 * Ensures there is an active (queued/running) or already-succeeded extraction
 * job for the resume. Called under a per-resume lock via `withResumeLock`.
 */
export async function ensureExtraction(
  deps: CandidateDeps,
  ctx: { jobId: string; resumeId: string },
): Promise<ResumeExtractionJob> {
  return deps.resumeRepo.withResumeLock(ctx.resumeId, async () => {
    const snapshot = await deps.resumeRepo.getLatestSnapshot(ctx.resumeId);
    if (snapshot) {
      const latest = await deps.extractionRepo.findLatestForResume(ctx.resumeId);
      if (latest) return latest; // Already done.
    }

    const active = await deps.extractionRepo.findActiveForResume(ctx.resumeId);
    if (active) return active;

    const config: ExtractionConfig = {
      ...DEFAULT_CONFIG,
      as_of_date: new Date().toISOString().slice(0, 10),
    };
    return deps.extractionRepo.enqueue({ jobId: ctx.jobId, resumeId: ctx.resumeId, triggerSource: "upload", config });
  });
}

/**
 * Executes an extraction job under its lease. Reads the stored file → parses
 * raw text from it → calls mock AI → normalises employment periods (months-v1)
 * → commits snapshot + skill facts atomically.
 *
 * On permanent failure (MAX_ATTEMPTS reached) the resume is marked `parse_failed`.
 * On transient failure the job is requeued with a 30-second backoff.
 */
export async function extractResume(
  deps: CandidateDeps,
  ctx: { extractionJobId: string; jobId: string; resumeId: string },
  lease: { owner: string; leaseToken: string },
): Promise<ResumeSnapshot | null> {
  const extractionJob = await deps.extractionRepo.findScoped(ctx.jobId, ctx.extractionJobId);
  if (!extractionJob || extractionJob.lease_owner !== lease.owner || extractionJob.lease_token !== lease.leaseToken) {
    return null; // Lease stolen or job gone.
  }

  try {
    const fileBytes = await deps.fileStore.get(
      (await deps.resumeRepo.getResume(ctx.resumeId))?.object_key ?? "",
    );
    // Extract text from the file bytes.
    // For the mock implementation, decode as UTF-8 (real impl would use a PDF/docx parser).
    const rawText = fileBytes ? new TextDecoder("utf-8", { fatal: false }).decode(fileBytes) : "";
    const segments = segmentText(rawText);

    const cvResult = await deps.ai.extractCv({ resumeId: ctx.resumeId, segments });
    validateCvEvidence(ctx.resumeId, segments, cvResult);

    // Normalise employment to months-v1: parse YYYY-MM bounds from raw dates.
    const employmentPeriods = cvResult.employment.map((e) => {
      const startMatch = /(\d{4}-\d{2})/.exec(e.start_raw ?? "");
      const endMatch = e.ongoing ? null : /(\d{4}-\d{2})/.exec(e.end_raw ?? "");
      const endMonth = endMatch ? endMatch[1] : null;
      const startMonth = startMatch ? startMatch[1] : null;
      return {
        start_raw: e.start_raw,
        end_raw: e.end_raw,
        ongoing: e.ongoing,
        start_month: startMonth,
        end_month_exclusive: endMonth ? shiftMonthForward(endMonth) : null,
        evidence: e.evidence,
      };
    });

    const supportedMonths = computeSupportedMonths(employmentPeriods);
    const asOfDate = extractionJob.extraction_config.as_of_date;

    const snapshot = await deps.resumeRepo.commitExtraction({
      resumeId: ctx.resumeId,
      snapshot: {
        raw_text: rawText,
        segments,
        extraction: {
          schema_version: cvResult.schema_version,
          normalization_version: "months-v1",
          as_of_date: asOfDate,
          supported_months: supportedMonths,
          employment: employmentPeriods,
          education: cvResult.education.map((e) => ({
            degree_raw: e.degree_raw,
            degree_level: e.degree_level,
            evidence: e.evidence,
          })),
          candidate: { full_name: null, email: null, phone: null },
        },
        parser_version: extractionJob.extraction_config.parser_version,
        model_version: extractionJob.extraction_config.model_version,
        prompt_version: extractionJob.extraction_config.prompt_version,
        schema_version: extractionJob.extraction_config.schema_version,
        dictionary_version: extractionJob.extraction_config.dictionary_version,
      },
      skills: cvResult.skills.map((s) => ({
        skill_id: null, // skill_id resolved during scoring, not extraction
        canonical_name: s.name,
        raw_text: s.name,
        usage: s.usage,
        evidence: s.evidence,
        confidence: null,
      })),
    });

    await deps.extractionRepo.markSucceeded(ctx.extractionJobId, lease.owner, lease.leaseToken, snapshot.id);
    return snapshot;
  } catch (err) {
    const invalidEvidence = err instanceof DomainError && err.code === "invalid_evidence";
    const isExhausted = invalidEvidence || extractionJob.attempts >= extractionJob.max_attempts;
    if (isExhausted) {
      const code = invalidEvidence ? "invalid_evidence" : "extraction_failed";
      await deps.extractionRepo.markFailed(ctx.extractionJobId, lease.owner, lease.leaseToken, code);
      await deps.resumeRepo.setStatus(ctx.resumeId, "parse_failed", code);
    } else {
      const retryAt = new Date(Date.now() + 30_000).toISOString();
      await deps.extractionRepo.requeue(ctx.extractionJobId, lease.owner, lease.leaseToken, retryAt);
    }
    return null;
  }
}

function validateCvEvidence(
  resumeId: string,
  segments: SourceSegment[],
  result: Awaited<ReturnType<AiExtractionService["extractCv"]>>,
): void {
  const facts = [...result.skills, ...result.employment, ...result.education];
  for (const fact of facts) {
    if (fact.evidence.length === 0) throw new DomainError("invalid_evidence", "Every extracted CV fact must cite source text.");
    for (const evidence of fact.evidence) validateEvidence(resumeId, segments, evidence);
  }
}

function validateEvidence(resumeId: string, segments: SourceSegment[], evidence: Evidence): void {
  const segment = segments.find(item => item.segment_id === evidence.segment_id);
  if (!segment || evidence.source !== "cv" || evidence.source_id !== resumeId ||
      evidence.page !== segment.page || evidence.paragraph !== segment.paragraph) {
    throw new DomainError("invalid_evidence", "CV evidence does not identify its captured source segment.");
  }
  const start = evidence.start_offset - segment.start_offset;
  const end = evidence.end_offset - segment.start_offset;
  const codePoints = Array.from(segment.text);
  if (start < 0 || end <= start || end > codePoints.length || codePoints.slice(start, end).join("") !== evidence.quote) {
    throw new DomainError("invalid_evidence", "CV evidence quote does not match the captured source text.");
  }
}

/**
 * Shifts a `YYYY-MM` string forward by one month (exclusive end of employment).
 * e.g. "2023-01" → "2023-02".
 */
function shiftMonthForward(yyyyMm: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!match) return yyyyMm;
  let year = Number(match[1]);
  let month = Number(match[2]) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

export async function listPositionCandidates(deps: CandidateDeps, jobId: string, query: { offset: number; limit: number }) {
  if (!await deps.positionRepo.get(jobId)) throw notFound("Job");
  const resumes = await deps.resumeRepo.list(jobId);
  const ids = [...new Set(resumes.map(r => r.candidate_id))].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  const items: CandidateDto[] = [];
  for (const id of ids.slice(query.offset, query.offset + query.limit)) {
    const candidate = await deps.resumeRepo.getCandidate(id);
    if (!candidate) throw notFound("Candidate");
    // Never disclose a newer CV which is only attached to another position.
    const latest = resumes.filter(r => r.candidate_id === id).reduce((a, b) => a.version > b.version ? a : b);
    items.push({ id, full_name: candidate.full_name, email: candidate.email, phone: candidate.phone,
      latest_resume_id: latest.id, latest_version: latest.version });
  }
  return { items, page: { ...query, total: ids.length } };
}

export async function reprocessResume(deps: CandidateDeps, jobId: string, resumeId: string): Promise<ResumeDto> {
  if (!await deps.positionRepo.get(jobId)) throw notFound("Job");
  return deps.resumeRepo.withResumeLock(resumeId, async () => {
    const resume = await deps.resumeRepo.findScoped(jobId, resumeId);
    if (!resume) throw notFound("Resume");
    if (resume.status !== "parse_failed" || await deps.resumeRepo.getLatestSnapshot(resumeId) || await deps.extractionRepo.findActiveForResume(resumeId)) {
      throw new DomainError("request_in_progress", "Only a failed resume without a snapshot or active extraction can be reprocessed.");
    }
    if (["corrupt_file", "textless_file", "invalid_file", "empty_text"].includes(resume.error_code ?? "")) {
      throw new DomainError("extraction_refused", "Upload a corrected file instead of retrying this document.");
    }
    await deps.extractionRepo.enqueue({ jobId, resumeId, triggerSource: "reprocess", config: {
      ...DEFAULT_CONFIG, as_of_date: new Date().toISOString().slice(0, 10),
    } });
    await deps.resumeRepo.setStatus(resumeId, "uploaded", null);
    return assembleResume(deps.resumeRepo, jobId, { ...resume, status: "uploaded", error_code: null });
  });
}

export { assembleCandidate };
