import { z } from "zod";
import { idSchema, limitSchema, offsetSchema, versionSchema } from "./common.schema.ts";

export const runModeSchema = z.enum(["initial", "rescore"]);
export const runItemStatusSchema = z.enum(["pending", "processing", "succeeded", "failed"]);

/**
 * openapi.yaml `RunInput`. This validates shape/type only. The cross-field
 * rule from the schema description — "Initial mode selects resume_ids;
 * rescore selects base_run_id" — is a business rule: the contract says
 * cross-field violations return 422 `invalid_run_selection`, a domain error
 * code, never the generic 400 `invalid_request` a zod failure here would
 * produce. It is enforced in `domain/runs.ts` `startRun`, next to the other
 * run-creation invariants (active-run lock, resume readiness) that also need
 * repository state and belong together.
 *
 * `resume_ids` uniqueness (`uniqueItems: true`) and its bounds (`minItems: 1`,
 * `maxItems: 200`) ARE pure shape validation, so they stay here. That splits
 * the two near-identical inputs on purpose: `resume_ids: []` violates the
 * declared schema and is 400 `invalid_request`, while an absent `resume_ids`
 * is a valid body that breaks the initial-mode rule and is 422
 * `invalid_run_selection`. API README section 4.3 documents the pair.
 */
export const runInputSchema = z
  .object({
    mode: runModeSchema,
    criteria_revision: versionSchema,
    resume_ids: z.array(idSchema).min(1).max(200).optional(),
    base_run_id: idSchema.optional(),
  })
  .strict()
  .refine((v) => !v.resume_ids || new Set(v.resume_ids).size === v.resume_ids.length, {
    message: "resume_ids must not contain duplicates",
    path: ["resume_ids"],
  });
export type RunInput = z.infer<typeof runInputSchema>;

/** `GET /jobs/{job_id}/screening-runs/{run_id}/items` query parameters. */
export const listRunItemsQuerySchema = z
  .object({
    offset: offsetSchema,
    limit: limitSchema,
    status: runItemStatusSchema.optional(),
  })
  .strict();
export type ListRunItemsQuery = z.infer<typeof listRunItemsQuerySchema>;
