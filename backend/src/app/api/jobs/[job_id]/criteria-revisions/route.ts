import { pageQuerySchema } from "../../../../../lib/http/schemas/history.schema.ts";
import { listRevisions, approve, type CriteriaDeps } from "../../../../../domain/criteria/index.ts";
import {
  positionRepository,
  criteriaRepository,
  skillRepository,
} from "../../../../../infrastructure/db/repositories/index.ts";
import { aiExtractionService } from "../../../../../infrastructure/ai/index.ts";
import { mapDomainError, okJson } from "../../../../../lib/http/errors.ts";
import { parseJsonBody, parseQuery, parsePathId, requireIdempotencyKey } from "../../../../../lib/http/validate.ts";
import { withIdempotency } from "../../../../../lib/http/idempotent.ts";
import { approvalInputSchema } from "../../../../../lib/http/schemas/index.ts";

const deps: CriteriaDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  skillRepo: skillRepository,
  ai: aiExtractionService,
};

export async function GET(req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const jobId = parsePathId((await ctx.params).job_id, "job_id");
  if ("error" in jobId) return jobId.error;
  const query = parseQuery(new URL(req.url), pageQuerySchema);
  if ("error" in query) return query.error;
  try {
    const all = await listRevisions(deps, jobId.data);
    return okJson(200, { items: all.slice(query.data.offset, query.data.offset + query.data.limit), page: { ...query.data, total: all.length } });
  } catch (error) { return mapDomainError(error); }
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
