import { z } from "zod";
import { limitSchema, nonBlankString, offsetSchema, versionSchema } from "./common.schema.ts";

/** openapi.yaml `JobStatus`. */
export const jobStatusSchema = z.enum(["draft", "open", "closed"]);

/** openapi.yaml `JobInput` (createJob body). */
export const jobInputSchema = z
  .object({
    title: nonBlankString(200),
    jd_raw_text: nonBlankString(),
    level: z.string().max(50).nullable().optional(),
  })
  .strict();
export type JobInput = z.infer<typeof jobInputSchema>;

/** openapi.yaml `JobUpdate` (updateJob body) — a schema distinct from `JobInput`: carries `expected_version`. */
export const jobUpdateSchema = z
  .object({
    expected_version: versionSchema,
    title: nonBlankString(200),
    jd_raw_text: nonBlankString(),
    level: z.string().max(50).nullable().optional(),
  })
  .strict();
export type JobUpdate = z.infer<typeof jobUpdateSchema>;

/** `GET /jobs` query parameters. */
export const listJobsQuerySchema = z
  .object({
    offset: offsetSchema,
    limit: limitSchema,
    status: jobStatusSchema.optional(),
  })
  .strict();
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
