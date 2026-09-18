import { z } from "zod";
import { idSchema, offsetSchema, limitSchema } from "./common.schema.ts";
export const pageQuerySchema = z.object({ offset: offsetSchema, limit: limitSchema }).strict();
export const runsQuerySchema = pageQuerySchema.extend({
  published_only: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
});
export const comparisonQuerySchema = pageQuerySchema.extend({ left_run_id: idSchema, right_run_id: idSchema });
