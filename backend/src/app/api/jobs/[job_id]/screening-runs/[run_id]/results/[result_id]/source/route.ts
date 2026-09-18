import { getResultSource } from "../../../../../../../../../domain/decisions/history.ts";
import { serviceDeps } from "../../../../../../../../../lib/http/service-deps.ts";
import { mapDomainError, okJson } from "../../../../../../../../../lib/http/errors.ts";
import { parsePathId } from "../../../../../../../../../lib/http/validate.ts";

export async function GET(req: Request, ctx: { params: Promise<{ job_id: string; run_id: string; result_id: string }> }) {
  const params = await ctx.params;
  const job_id = parsePathId(params.job_id, "job_id");
  if ("error" in job_id) return job_id.error;
  const run_id = parsePathId(params.run_id, "run_id");
  if ("error" in run_id) return run_id.error;
  const result_id = parsePathId(params.result_id, "result_id");
  if ("error" in result_id) return result_id.error;
  try {
    return okJson(200, await getResultSource(serviceDeps, { jobId: job_id.data, runId: run_id.data, resultId: result_id.data }));
  } catch (error) { return mapDomainError(error); }
}
