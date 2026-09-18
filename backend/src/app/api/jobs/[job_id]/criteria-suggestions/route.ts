import { suggest, type CriteriaDeps } from "../../../../../domain/criteria/index.ts";
import {
  positionRepository,
  criteriaRepository,
  skillRepository,
} from "../../../../../infrastructure/db/repositories/index.ts";
import { aiExtractionService } from "../../../../../infrastructure/ai/index.ts";
import { mapDomainError } from "../../../../../lib/http/errors.ts";
import { parseJsonBody, parsePathId, requireIdempotencyKey } from "../../../../../lib/http/validate.ts";
import { withIdempotency } from "../../../../../lib/http/idempotent.ts";
import { suggestionInputSchema } from "../../../../../lib/http/schemas/index.ts";

const deps: CriteriaDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  skillRepo: skillRepository,
  ai: aiExtractionService,
};

export async function POST(req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;

  const idempotencyKey = requireIdempotencyKey(req);
  if ("error" in idempotencyKey) return idempotencyKey.error;

  const body = await parseJsonBody(req, suggestionInputSchema);
  if ("error" in body) return body.error;

  try {
    return await withIdempotency(idempotencyKey.data, { jobId: jobId.data, ...body.data }, 200, () =>
      suggest(deps, jobId.data, { expected_job_version: body.data.expected_job_version }),
    );
  } catch (err) {
    return mapDomainError(err);
  }
}
