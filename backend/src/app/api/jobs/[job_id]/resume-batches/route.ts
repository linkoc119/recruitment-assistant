import { uploadBatch, type CandidateDeps, type UploadFile, type UploadManifestItem } from "../../../../../domain/candidates/index.ts";
import {
  positionRepository,
  resumeRepository,
  extractionRepository,
} from "../../../../../infrastructure/db/repositories/index.ts";
import { fileStore } from "../../../../../infrastructure/files/index.ts";
import { aiExtractionService } from "../../../../../infrastructure/ai/index.ts";
import { mapDomainError } from "../../../../../lib/http/errors.ts";
import { parseMultipart, parsePathId, requireIdempotencyKey } from "../../../../../lib/http/validate.ts";
import { withIdempotency } from "../../../../../lib/http/idempotent.ts";
import { apiError } from "../../../../../lib/http/errors.ts";
import { uploadManifestSchema } from "../../../../../lib/http/schemas/index.ts";

const deps: CandidateDeps = {
  positionRepo: positionRepository,
  resumeRepo: resumeRepository,
  extractionRepo: extractionRepository,
  fileStore,
  ai: aiExtractionService,
};

function toManifestItem(item: {
  client_file_id: string;
  file_index: number;
  identity_mode: "new_candidate" | "new_version";
  candidate_id?: string | null;
  identity_confirmed?: boolean;
}): UploadManifestItem {
  return {
    client_file_id: item.client_file_id,
    file_index: item.file_index,
    identity_mode: item.identity_mode,
    candidate_id: item.candidate_id ?? undefined,
    identity_confirmed: item.identity_confirmed,
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await ctx.params;
  const jobId = parsePathId(job_id, "job_id");
  if ("error" in jobId) return jobId.error;

  const idempotencyKey = requireIdempotencyKey(req);
  if ("error" in idempotencyKey) return idempotencyKey.error;

  const multipart = await parseMultipart(req);
  if ("error" in multipart) return multipart.error;

  const manifestResult = uploadManifestSchema.safeParse(multipart.data.manifest);
  if (!manifestResult.success) {
    return apiError(400, "invalid_manifest", "manifest failed validation.");
  }

  const files: UploadFile[] = await Promise.all(
    multipart.data.files.map(async (file) => ({
      buffer: new Uint8Array(await file.arrayBuffer()),
      original_name: file.name,
      media_type: file.type,
    })),
  );
  const manifest = manifestResult.data.map(toManifestItem);

  try {
    return await withIdempotency(idempotencyKey.data, { jobId: jobId.data, manifest }, 200, () =>
      uploadBatch(deps, jobId.data, { files, manifest }),
    );
  } catch (err) {
    return mapDomainError(err);
  }
}
