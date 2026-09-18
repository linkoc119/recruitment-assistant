import { approve, type CriteriaDeps } from "../../../../../domain/criteria/index.ts";
import {
  positionRepository,
  criteriaRepository,
  skillRepository,
} from "../../../../../infrastructure/db/repositories/index.ts";
import { aiExtractionService } from "../../../../../infrastructure/ai/index.ts";
import { mapDomainError, notImplemented } from "../../../../../lib/http/errors.ts";
import { parseJsonBody, parsePathId, requireIdempotencyKey } from "../../../../../lib/http/validate.ts";
import { withIdempotency } from "../../../../../lib/http/idempotent.ts";
import { approvalInputSchema } from "../../../../../lib/http/schemas/index.ts";

const deps: CriteriaDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  skillRepo: skillRepository,
  ai: aiExtractionService,
};

export async function GET() {
  return notImplemented("listCriteriaRevisions");
}

export async function POST(req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;

  const idempotencyKey = requireIdempotencyKey(req);
  if ("error" in idempotencyKey) return idempotencyKey.error;

  const body = await parseJsonBody(req, approvalInputSchema);
  if ("error" in body) return body.error;

  try {
    return await withIdempotency(idempotencyKey.data, { jobId: jobId.data, ...body.data }, 201, () =>
      approve(deps, jobId.data, {
        expected_draft_version: body.data.expected_draft_version,
        expected_revision: body.data.expected_revision,
        expected_job_version: body.data.expected_job_version,
      }),
    );
  } catch (err) {
    return mapDomainError(err);
  }
}
