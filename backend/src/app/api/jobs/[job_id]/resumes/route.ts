import { listResumes, type CandidateDeps } from "../../../../../domain/candidates/index.ts";
import {
  positionRepository,
  resumeRepository,
  extractionRepository,
} from "../../../../../infrastructure/db/repositories/index.ts";
import { fileStore } from "../../../../../infrastructure/files/index.ts";
import { aiExtractionService } from "../../../../../infrastructure/ai/index.ts";
import { mapDomainError, okJson } from "../../../../../lib/http/errors.ts";
import { parsePathId, parseQuery } from "../../../../../lib/http/validate.ts";
import { listResumesQuerySchema } from "../../../../../lib/http/schemas/index.ts";

const deps: CandidateDeps = {
  positionRepo: positionRepository,
  resumeRepo: resumeRepository,
  extractionRepo: extractionRepository,
  fileStore,
  ai: aiExtractionService,
};

export async function GET(req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;

  const query = parseQuery(new URL(req.url), listResumesQuerySchema);
  if ("error" in query) return query.error;

  try {
    const result = await listResumes(deps, jobId.data, query.data);
    return okJson(200, result);
  } catch (err) {
    return mapDomainError(err);
  }
}
