import { startRun, type RunDeps } from "../../../../../domain/runs/index.ts";
import {
  positionRepository,
  criteriaRepository,
  resumeRepository,
  runRepository,
  screeningRepository,
  skillRepository,
} from "../../../../../infrastructure/db/repositories/index.ts";
import { idempotencyStore } from "../../../../../infrastructure/idempotency/index.ts";
import { mapDomainError, notImplemented, okJson } from "../../../../../lib/http/errors.ts";
import { parseJsonBody, parsePathId, requireIdempotencyKey } from "../../../../../lib/http/validate.ts";
import { runInputSchema } from "../../../../../lib/http/schemas/index.ts";

const deps: RunDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  resumeRepo: resumeRepository,
  runRepo: runRepository,
  screeningRepo: screeningRepository,
  skillRepo: skillRepository,
  idempotencyStore,
};

export async function GET() {
  return notImplemented("listRuns");
}

export async function POST(req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;

  const idempotencyKey = requireIdempotencyKey(req);
  if ("error" in idempotencyKey) return idempotencyKey.error;

  const body = await parseJsonBody(req, runInputSchema);
  if ("error" in body) return body.error;

  try {
    const result = await startRun(
      deps,
      jobId.data,
      {
        mode: body.data.mode,
        criteria_revision: body.data.criteria_revision,
        resume_ids: body.data.resume_ids,
        base_run_id: body.data.base_run_id,
      },
      idempotencyKey.data,
    );
    return okJson(202, result);
  } catch (err) {
    return mapDomainError(err);
  }
}
