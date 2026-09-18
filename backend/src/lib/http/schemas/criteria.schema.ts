import { z } from "zod";
import { decimalSchema, idSchema, versionSchema } from "./common.schema.ts";

export const requirementKindSchema = z.enum(["skill", "experience", "education"]);
export const requirementTypeSchema = z.enum(["mandatory", "preferred"]);
export const degreeLevelSchema = z.enum(["vocational", "college", "bachelor", "master", "doctorate"]);
export const criterionSourceSchema = z.enum(["manual", "ai"]);

/** openapi.yaml `Evidence` — all 8 fields required; `page`/`paragraph` are required-but-nullable. */
export const evidenceSchema = z
  .object({
    source: z.enum(["jd", "cv"]),
    source_id: idSchema,
    segment_id: z.string(),
    quote: z.string().min(1),
    start_offset: z.number().int().min(0),
    end_offset: z.number().int().min(0),
    page: z.number().int().min(1).nullable(),
    paragraph: z.number().int().min(1).nullable(),
  })
  .strict();
export type EvidenceInput = z.infer<typeof evidenceSchema>;

/**
 * openapi.yaml `CriterionInput`. `weight` is a `Decimal` string (pattern
 * `^(0|[1-9][0-9]*)(\.[0-9]+)?$`), not a number — a draft may hold 0; approval
 * requires every weight > 0 and an exact total of 100 (domain-layer check,
 * BR-CRI-01, not shape validation).
 */
export const criterionInputSchema = z
  .object({
    criterion_key: z.string().min(1).max(100),
    kind: requirementKindSchema,
    label: z.string().min(1).max(255),
    skill_id: idSchema.nullable().optional(),
    req_type: requirementTypeSchema,
    weight: decimalSchema,
    min_years: decimalSchema.nullable().optional(),
    min_degree: degreeLevelSchema.nullable().optional(),
    source: criterionSourceSchema,
    jd_evidence: z.array(evidenceSchema).optional(),
  })
  .strict();
export type CriterionInput = z.infer<typeof criterionInputSchema>;

/** openapi.yaml `CriteriaDraftInput` (saveCriteriaDraft body) — all 4 fields required. */
export const criteriaDraftInputSchema = z
  .object({
    expected_draft_version: z.number().int().min(0),
    expected_revision: z.number().int().min(0),
    expected_job_version: versionSchema,
    criteria: z.array(criterionInputSchema),
  })
  .strict();
export type CriteriaDraftInput = z.infer<typeof criteriaDraftInputSchema>;

/** openapi.yaml `ApprovalInput` (approveCriteria body) — carries no criteria; approval freezes the stored draft. */
export const approvalInputSchema = z
  .object({
    expected_draft_version: versionSchema,
    expected_revision: z.number().int().min(0),
    expected_job_version: versionSchema,
  })
  .strict();
export type ApprovalInput = z.infer<typeof approvalInputSchema>;

/** openapi.yaml `SuggestionInput` (suggestCriteria body). */
export const suggestionInputSchema = z.object({ expected_job_version: versionSchema }).strict();
export type SuggestionInput = z.infer<typeof suggestionInputSchema>;
