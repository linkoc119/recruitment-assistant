import { createJob, listJobs, type PositionDeps } from "../../../domain/position/index.ts";
import {
  positionRepository,
  criteriaRepository,
  resumeRepository,
  runRepository,
} from "../../../infrastructure/db/repositories/index.ts";
import { mapDomainError, okJson } from "../../../lib/http/errors.ts";
import { parseJsonBody, parseQuery, requireIdempotencyKey } from "../../../lib/http/validate.ts";
import { withIdempotency } from "../../../lib/http/idempotent.ts";
import { jobInputSchema, listJobsQuerySchema } from "../../../lib/http/schemas/index.ts";

const deps: PositionDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  resumeRepo: resumeRepository,
  runRepo: runRepository,
};

export async function GET(req: Request) {
  const query = parseQuery(new URL(req.url), listJobsQuerySchema);
  if ("error" in query) return query.error;

  try {
    const result = await listJobs(deps, query.data);
    return okJson(200, result);
  } catch (err) {
    return mapDomainError(err);
  }
}

export async function POST(req: Request) {
  const idempotencyKey = requireIdempotencyKey(req);
  if ("error" in idempotencyKey) return idempotencyKey.error;

  const body = await parseJsonBody(req, jobInputSchema);
  if ("error" in body) return body.error;

  try {
    return await withIdempotency(idempotencyKey.data, body.data, 201, () =>
      createJob(deps, { title: body.data.title, jd_raw_text: body.data.jd_raw_text, level: body.data.level ?? null }),
    );
  } catch (err) {
    return mapDomainError(err);
  }
}
