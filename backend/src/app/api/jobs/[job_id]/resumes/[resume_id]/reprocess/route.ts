import { reprocessResume } from "../../../../../../../domain/candidates/index.ts";
import { serviceDeps } from "../../../../../../../lib/http/service-deps.ts";
import { mapDomainError, okJson } from "../../../../../../../lib/http/errors.ts";
import { parsePathId, requireIdempotencyKey } from "../../../../../../../lib/http/validate.ts";
import { withIdempotency } from "../../../../../../../lib/http/idempotent.ts";

export async function POST(req: Request, ctx: { params: Promise<{ job_id: string; resume_id: string }> }) {
  const params = await ctx.params;
  const job_id = parsePathId(params.job_id, "job_id");
  if ("error" in job_id) return job_id.error;
  const resume_id = parsePathId(params.resume_id, "resume_id");
  if ("error" in resume_id) return resume_id.error;
  const key = requireIdempotencyKey(req);
  if ("error" in key) return key.error;
  try {
    return await withIdempotency(key.data, { operation: "reprocessResume", jobId: job_id.data, resumeId: resume_id.data }, 202, () => reprocessResume(serviceDeps, job_id.data, resume_id.data));
  } catch (error) { return mapDomainError(error); }
}
