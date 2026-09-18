import { getRevision } from "../../../../../../domain/criteria/index.ts";
import { serviceDeps } from "../../../../../../lib/http/service-deps.ts";
import { mapDomainError, okJson } from "../../../../../../lib/http/errors.ts";
import { parsePathId } from "../../../../../../lib/http/validate.ts";

export async function GET(req: Request, ctx: { params: Promise<{ job_id: string; revision: string }> }) {
  const params = await ctx.params;
  const job_id = parsePathId(params.job_id, "job_id");
  if ("error" in job_id) return job_id.error;
  const revision = parsePathId(params.revision, "revision");
  if ("error" in revision) return revision.error;
  try {
    return okJson(200, await getRevision(serviceDeps, job_id.data, Number(revision.data)));
  } catch (error) { return mapDomainError(error); }
}
