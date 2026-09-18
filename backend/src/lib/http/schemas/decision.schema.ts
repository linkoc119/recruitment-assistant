import { z } from "zod";
import { idSchema, limitSchema, offsetSchema, versionSchema } from "./common.schema.ts";

/** openapi.yaml `DecisionStatus` — the full ranking-filter vocabulary (`Decision.status` allows only 2 of these). */
export const decisionStatusSchema = z.enum(["scored", "shortlisted", "rejected"]);

/** openapi.yaml `DecisionInput` (recordDecision body). */
export const decisionInputSchema = z
  .object({
    decision: z.enum(["shortlisted", "rejected"]),
    expected_result_version: versionSchema,
    confirm_failed_mandatory: z.boolean().optional().default(false),
  })
  .strict();
export type DecisionInput = z.infer<typeof decisionInputSchema>;

/**
 * openapi.yaml `RankingQuery` (queryRanking body). Body-only per the schema's
 * own description: "Body-only search with run/decision-epoch pagination." —
 * parsed with `parseJsonBody`, never `parseQuery`, and `queryRanking` takes no
 * `Idempotency-Key` (it is a read, not a write).
 */
export const rankingQuerySchema = z
  .object({
    run_id: idSchema.optional(),
    decision_epoch: z.number().int().min(0).optional(),
    offset: offsetSchema,
    limit: limitSchema,
    search: z.string().max(200).optional(),
    passed_mandatory: z.boolean().optional(),
    decision: decisionStatusSchema.optional(),
  })
  .strict();
export type RankingQuery = z.infer<typeof rankingQuerySchema>;
