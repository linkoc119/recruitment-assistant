import { recordDecision, type DecisionDeps } from "../../../../../../../../../domain/decisions/index.ts";
import {
  positionRepository,
  criteriaRepository,
  resumeRepository,
  runRepository,
  screeningRepository,
} from "../../../../../../../../../infrastructure/db/repositories/index.ts";
import { mapDomainError, okJson } from "../../../../../../../../../lib/http/errors.ts";
import { parseJsonBody, parsePathId } from "../../../../../../../../../lib/http/validate.ts";
import { decisionInputSchema } from "../../../../../../../../../lib/http/schemas/index.ts";

const deps: DecisionDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  resumeRepo: resumeRepository,
  runRepo: runRepository,
  screeningRepo: screeningRepository,
};

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ job_id: string; run_id: string; result_id: string }> },
) {
  const { job_id, run_id, result_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;
  const runId = parsePathId(run_id, "run_id");
  if ("error" in runId) return runId.error;
  const resultId = parsePathId(result_id, "result_id");
  if ("error" in resultId) return resultId.error;

  const body = await parseJsonBody(req, decisionInputSchema);
  if ("error" in body) return body.error;

  try {
    const result = await recordDecision(
      deps,
      { jobId: jobId.data, runId: runId.data, resultId: resultId.data },
      {
        decision: body.data.decision,
        expected_result_version: body.data.expected_result_version,
        confirm_failed_mandatory: body.data.confirm_failed_mandatory,
      },
    );
    return okJson(200, result);
  } catch (err) {
    return mapDomainError(err);
  }
}
