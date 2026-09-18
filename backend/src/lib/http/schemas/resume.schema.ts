import { z } from "zod";
import { idSchema, limitSchema, offsetSchema } from "./common.schema.ts";

/** openapi.yaml `ResumeStatus`. */
export const resumeStatusSchema = z.enum(["uploaded", "parsing", "parsed", "parse_failed"]);

/**
 * openapi.yaml `UploadManifestItem`. `identity_confirmed` is intentionally
 * NOT in `required` — the contract defaults it to false when omitted.
 */
export const uploadManifestItemSchema = z
  .object({
    client_file_id: z.string().min(1).max(100),
    file_index: z.number().int().min(0),
    identity_mode: z.enum(["new_candidate", "new_version"]),
    candidate_id: idSchema.nullable().optional(),
    identity_confirmed: z.boolean().optional(),
  })
  .strict();
export type UploadManifestItem = z.infer<typeof uploadManifestItemSchema>;

/** The `manifest` multipart part decodes to this array (openapi.yaml `uploadResumeBatch` requestBody). */
export const uploadManifestSchema = z.array(uploadManifestItemSchema).min(1).max(200);
export type UploadManifest = z.infer<typeof uploadManifestSchema>;

/** `GET /jobs/{job_id}/resumes` query parameters. */
export const listResumesQuerySchema = z
  .object({
    offset: offsetSchema,
    limit: limitSchema,
    status: resumeStatusSchema.optional(),
  })
  .strict();
export type ListResumesQuery = z.infer<typeof listResumesQuerySchema>;
