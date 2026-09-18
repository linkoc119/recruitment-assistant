import { getRun, type RunDeps } from "../../../../../../domain/runs/index.ts";
import {
  positionRepository,
  criteriaRepository,
  resumeRepository,
  runRepository,
  screeningRepository,
  skillRepository,
} from "../../../../../../infrastructure/db/repositories/index.ts";
import { idempotencyStore } from "../../../../../../infrastructure/idempotency/index.ts";
import { mapDomainError, okJson } from "../../../../../../lib/http/errors.ts";
import { parsePathId } from "../../../../../../lib/http/validate.ts";

const deps: RunDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  resumeRepo: resumeRepository,
  runRepo: runRepository,
  screeningRepo: screeningRepository,
  skillRepo: skillRepository,
  idempotencyStore,
};

export async function GET(_req: Request, ctx: { params: Promise<{ job_id: string; run_id: string }> }) {
  const { job_id, run_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;
  const runId = parsePathId(run_id, "run_id");
  if ("error" in runId) return runId.error;

  try {
    const result = await getRun(deps, jobId.data, runId.data);
    return okJson(200, result);
  } catch (err) {
    return mapDomainError(err);
  }
}
