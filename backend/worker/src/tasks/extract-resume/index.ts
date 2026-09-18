import { randomUUID } from "node:crypto";
import { extractResume, type CandidateDeps } from "@app/backend/domain/candidates";
import {
  positionRepository,
  resumeRepository,
  extractionRepository,
} from "@app/backend/infrastructure/db/repositories";
import { fileStore } from "@app/backend/infrastructure/files";
import { aiExtractionService } from "@app/backend/infrastructure/ai";

const deps: CandidateDeps = {
  positionRepo: positionRepository,
  resumeRepo: resumeRepository,
  extractionRepo: extractionRepository,
  fileStore,
  ai: aiExtractionService,
};

/**
 * Claims one due `resume_extraction_jobs` row and runs it to completion
 * (succeeded/failed/requeued — see `domain/candidates.extractResume`).
 * Returns `false` if the job was no longer claimable (already taken, or not due).
 */
export async function runExtractResumeTask(job: { id: string; job_id: string; resume_id: string }): Promise<boolean> {
  const owner = randomUUID();
  const claimed = await extractionRepository.claim(job.id, owner);
  if (!claimed) return false;

  await extractResume(
    deps,
    { extractionJobId: job.id, jobId: job.job_id, resumeId: job.resume_id },
    { owner, leaseToken: claimed.lease_token },
  );
  return true;
}
