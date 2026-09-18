import { queryRanking, type DecisionDeps } from "../../../../../../domain/decisions/index.ts";
import {
  positionRepository,
  criteriaRepository,
  resumeRepository,
  runRepository,
  screeningRepository,
} from "../../../../../../infrastructure/db/repositories/index.ts";
import { mapDomainError, okJson } from "../../../../../../lib/http/errors.ts";
import { parseJsonBody, parsePathId } from "../../../../../../lib/http/validate.ts";
import { rankingQuerySchema } from "../../../../../../lib/http/schemas/index.ts";

const deps: DecisionDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  resumeRepo: resumeRepository,
  runRepo: runRepository,
  screeningRepo: screeningRepository,
};

export async function POST(req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;

  const body = await parseJsonBody(req, rankingQuerySchema);
  if ("error" in body) return body.error;

  try {
    const result = await queryRanking(deps, jobId.data, {
      run_id: body.data.run_id,
      decision_epoch: body.data.decision_epoch,
      offset: body.data.offset,
      limit: body.data.limit,
    });
    return okJson(200, result);
  } catch (err) {
    return mapDomainError(err);
  }
}
