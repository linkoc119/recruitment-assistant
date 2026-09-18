import { getResume, type CandidateDeps } from "../../../../../../domain/candidates/index.ts";
import {
  positionRepository,
  resumeRepository,
  extractionRepository,
} from "../../../../../../infrastructure/db/repositories/index.ts";
import { fileStore } from "../../../../../../infrastructure/files/index.ts";
import { aiExtractionService } from "../../../../../../infrastructure/ai/index.ts";
import { mapDomainError, okJson } from "../../../../../../lib/http/errors.ts";
import { parsePathId } from "../../../../../../lib/http/validate.ts";

const deps: CandidateDeps = {
  positionRepo: positionRepository,
  resumeRepo: resumeRepository,
  extractionRepo: extractionRepository,
  fileStore,
  ai: aiExtractionService,
};

export async function GET(_req: Request, ctx: { params: Promise<{ job_id: string; resume_id: string }> }) {
  const { job_id, resume_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;
  const resumeId = parsePathId(resume_id, "resume_id");
  if ("error" in resumeId) return resumeId.error;

  try {
    const result = await getResume(deps, jobId.data, resumeId.data);
    return okJson(200, result);
  } catch (err) {
    return mapDomainError(err);
  }
}
