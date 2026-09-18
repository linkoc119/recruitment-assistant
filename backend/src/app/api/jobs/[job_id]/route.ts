import { getJob, updateJob, type PositionDeps } from "../../../../domain/position/index.ts";
import {
  positionRepository,
  criteriaRepository,
  resumeRepository,
  runRepository,
} from "../../../../infrastructure/db/repositories/index.ts";
import { mapDomainError, okJson } from "../../../../lib/http/errors.ts";
import { parseJsonBody, parsePathId, requireIdempotencyKey } from "../../../../lib/http/validate.ts";
import { withIdempotency } from "../../../../lib/http/idempotent.ts";
import { jobUpdateSchema } from "../../../../lib/http/schemas/index.ts";

const deps: PositionDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  resumeRepo: resumeRepository,
  runRepo: runRepository,
};

export async function GET(_req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;

  try {
    const result = await getJob(deps, jobId.data);
    return okJson(200, result);
  } catch (err) {
    return mapDomainError(err);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;

  const idempotencyKey = requireIdempotencyKey(req);
  if ("error" in idempotencyKey) return idempotencyKey.error;

  const body = await parseJsonBody(req, jobUpdateSchema);
  if ("error" in body) return body.error;

  try {
    return await withIdempotency(idempotencyKey.data, { jobId: jobId.data, ...body.data }, 200, () =>
      updateJob(deps, jobId.data, {
        expected_version: body.data.expected_version,
        title: body.data.title,
        jd_raw_text: body.data.jd_raw_text,
        level: body.data.level ?? null,
      }),
    );
  } catch (err) {
    return mapDomainError(err);
  }
}
