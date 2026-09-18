import { listPositionCandidates } from "../../../../../domain/candidates/index.ts";
import { serviceDeps } from "../../../../../lib/http/service-deps.ts";
import { mapDomainError, okJson } from "../../../../../lib/http/errors.ts";
import { parsePathId, parseQuery } from "../../../../../lib/http/validate.ts";
import { pageQuerySchema } from "../../../../../lib/http/schemas/history.schema.ts";

export async function GET(req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const params = await ctx.params;
  const job_id = parsePathId(params.job_id, "job_id");
  if ("error" in job_id) return job_id.error;
  const query = parseQuery(new URL(req.url), pageQuerySchema);
  if ("error" in query) return query.error;
  try {
    return okJson(200, await listPositionCandidates(serviceDeps, job_id.data, query.data));
  } catch (error) { return mapDomainError(error); }
}
