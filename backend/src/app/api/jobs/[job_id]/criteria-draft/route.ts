import { getDraft, saveDraft, type CriteriaDeps, type CriterionInputDto } from "../../../../../domain/criteria/index.ts";
import {
  positionRepository,
  criteriaRepository,
  skillRepository,
} from "../../../../../infrastructure/db/repositories/index.ts";
import { aiExtractionService } from "../../../../../infrastructure/ai/index.ts";
import { mapDomainError, okJson } from "../../../../../lib/http/errors.ts";
import { parseJsonBody, parsePathId, requireIdempotencyKey } from "../../../../../lib/http/validate.ts";
import { withIdempotency } from "../../../../../lib/http/idempotent.ts";
import { criteriaDraftInputSchema, type CriterionInput } from "../../../../../lib/http/schemas/index.ts";

const deps: CriteriaDeps = {
  positionRepo: positionRepository,
  criteriaRepo: criteriaRepository,
  skillRepo: skillRepository,
  ai: aiExtractionService,
};

function toCriterionInputDto(c: CriterionInput): CriterionInputDto {
  return {
    criterion_key: c.criterion_key,
    kind: c.kind,
    label: c.label,
    skill_id: c.skill_id ?? null,
    req_type: c.req_type,
    weight: c.weight,
    min_years: c.min_years ?? null,
    min_degree: c.min_degree ?? null,
    source: c.source,
    jd_evidence: c.jd_evidence ?? [],
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;

  try {
    const result = await getDraft(deps, jobId.data);
    return okJson(200, result);
  } catch (err) {
    return mapDomainError(err);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;

  const idempotencyKey = requireIdempotencyKey(req);
  if ("error" in idempotencyKey) return idempotencyKey.error;

  const body = await parseJsonBody(req, criteriaDraftInputSchema);
  if ("error" in body) return body.error;

  try {
    return await withIdempotency(idempotencyKey.data, { jobId: jobId.data, ...body.data }, 200, () =>
      saveDraft(deps, jobId.data, {
        expected_draft_version: body.data.expected_draft_version,
        expected_revision: body.data.expected_revision,
        expected_job_version: body.data.expected_job_version,
        criteria: body.data.criteria.map(toCriterionInputDto),
      }),
    );
  } catch (err) {
    return mapDomainError(err);
  }
}
