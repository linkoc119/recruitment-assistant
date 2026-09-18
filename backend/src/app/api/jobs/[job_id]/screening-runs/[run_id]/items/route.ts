import { listRunItems, type RunDeps } from "../../../../../../../domain/runs/index.ts";
import {
  positionRepository,
  criteriaRepository,
  resumeRepository,
  runRepository,
  screeningRepository,
  skillRepository,
} from "../../../../../../../infrastructure/db/repositories/index.ts";
import { idempotencyStore } from "../../../../../../../infrastructure/idempotency/index.ts";
import { mapDomainError, okJson } from "../../../../../../../lib/http/errors.ts";
import { parsePathId, parseQuery } from "../../../../../../../lib/http/validate.ts";
import { listRunItemsQuerySchema } from "../../../../../../../lib/http/schemas/index.ts";

const deps: RunDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  resumeRepo: resumeRepository,
  runRepo: runRepository,
  screeningRepo: screeningRepository,
  skillRepo: skillRepository,
  idempotencyStore,
};

export async function GET(req: Request, ctx: { params: Promise<{ job_id: string; run_id: string }> }) {
  const { job_id, run_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;
  const runId = parsePathId(run_id, "run_id");
  if ("error" in runId) return runId.error;

  const query = parseQuery(new URL(req.url), listRunItemsQuerySchema);
  if ("error" in query) return query.error;

  try {
    const result = await listRunItems(deps, { jobId: jobId.data, runId: runId.data }, query.data);
    return okJson(200, result);
  } catch (err) {
    return mapDomainError(err);
  }
}
