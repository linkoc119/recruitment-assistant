import type { ZodType, ZodTypeDef } from "zod";
import { apiError, type ApiErrorDetail } from "./errors.ts";

export type ParseResult<T> = { data: T } | { error: Response };

/**
 * `ZodSchema<T>` fixes Input = Output = T, which breaks inference for
 * schemas with `.default()` (e.g. `offsetSchema`): TypeScript unifies T
 * against both the optional Input and the required Output, so it widens
 * back to optional. Leaving Input as `any` here keeps Output (= T) exact.
 */
type Schema<T> = ZodType<T, ZodTypeDef, any>;

const ID_PATTERN = /^[1-9][0-9]*$/;

function issuesToDetails(issues: { path: (string | number)[]; code: string; message: string }[]): ApiErrorDetail[] {
  return issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    code: issue.code,
    message: issue.message,
  }));
}

/** Parses and validates a JSON request body against a zod schema. */
export async function parseJsonBody<T>(req: Request, schema: Schema<T>): Promise<ParseResult<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: apiError(400, "invalid_request", "Request body is not valid JSON.") };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      error: apiError(400, "invalid_request", "Request body failed validation.", false, issuesToDetails(result.error.issues)),
    };
  }
  return { data: result.data };
}

/** Parses and validates the query string of `url` against a zod schema. */
export function parseQuery<T>(url: URL, schema: Schema<T>): ParseResult<T> {
  const raw = Object.fromEntries(url.searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      error: apiError(400, "invalid_request", "Query parameters failed validation.", false, issuesToDetails(result.error.issues)),
    };
  }
  return { data: result.data };
}

/** Path parameter id, e.g. `job_id`. openapi.yaml `Id` schema: `^[1-9][0-9]*$`. */
export function parsePathId(raw: string, field = "id"): ParseResult<string> {
  if (!ID_PATTERN.test(raw)) {
    return {
      error: apiError(400, "invalid_request", `Path parameter "${field}" is not a valid id.`, false, [
        { field, code: "invalid_id", message: `Expected a positive integer id, got "${raw}".` },
      ]),
    };
  }
  return { data: raw };
}

/** `Idempotency-Key` header: required, 8-200 chars (openapi.yaml header definition). */
export function requireIdempotencyKey(req: Request): ParseResult<string> {
  const key = req.headers.get("Idempotency-Key");
  if (!key || key.length < 8 || key.length > 200) {
    return {
      error: apiError(400, "invalid_request", "Idempotency-Key header is required (8-200 characters).", false, [
        { field: "Idempotency-Key", code: "invalid_header", message: "Missing or out of the 8-200 character range." },
      ]),
    };
  }
  return { data: key };
}

export interface MultipartUpload {
  files: File[];
  manifest: unknown;
}

/**
 * Reads a multipart/form-data upload body: 1+ `files` parts plus one
 * `manifest` part containing a JSON-encoded array (openapi.yaml
 * `UploadResumesRequest`; wire format for `manifest` is a documented
 * assumption — see plan's recorded assumptions).
 */
export async function parseMultipart(req: Request): Promise<ParseResult<MultipartUpload>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return { error: apiError(415, "unsupported_media_type", "Expected multipart/form-data.") };
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { error: apiError(400, "invalid_request", "Request body is not valid multipart/form-data.") };
  }

  const files: File[] = [];
  let manifestRaw: string | null = null;
  for (const [key, value] of form.entries()) {
    if (key === "files" && value instanceof File) {
      files.push(value);
    } else if (key === "manifest") {
      manifestRaw = typeof value === "string" ? value : await value.text();
    }
  }

  if (files.length === 0) {
    return {
      error: apiError(400, "invalid_request", "At least one file is required.", false, [
        { field: "files", code: "missing", message: "No files were attached." },
      ]),
    };
  }
  if (manifestRaw === null) {
    return {
      error: apiError(400, "invalid_manifest", "The manifest part is required.", false, [
        { field: "manifest", code: "missing", message: "No manifest part was attached." },
      ]),
    };
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    return { error: apiError(400, "invalid_manifest", "manifest is not valid JSON.") };
  }

  return { data: { files, manifest } };
}
