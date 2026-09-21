/**
 * HTTP envelope helpers (CLS-02 `HttpEnvelope`).
 *
 * Every response — success, error, or file — carries `Cache-Control: no-store`
 * and `X-Request-Id` (openapi.yaml common headers, applied to every operation).
 */

export interface ApiErrorDetail {
  field: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  request_id: string;
  retryable: boolean;
  details?: ApiErrorDetail[];
}

const STANDARD_HEADERS = (requestId: string): Record<string, string> => ({
  "Cache-Control": "no-store",
  "X-Request-Id": requestId,
});

/** Wraps a successful body with the mandatory response headers. */
export function okJson(status: number, body: unknown): Response {
  const requestId = crypto.randomUUID();
  return Response.json(body, { status, headers: STANDARD_HEADERS(requestId) });
}

export function okFile(file: { content: Uint8Array; mediaType: string; fileName: string }): Response {
  const disposition = file.mediaType === "application/pdf" ? "inline" : "attachment";
  const name = Buffer.from(file.fileName.replace(/[\r\n\x00-\x1f\x7f/\\]/g, "_")).toString("utf8");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(file.content), { status: 200, headers: {
    ...STANDARD_HEADERS(crypto.randomUUID()), "Content-Type": file.mediaType,
    "X-Content-Type-Options": "nosniff", "Content-Disposition": `${disposition}; filename*=UTF-8''${encoded}`,
  } });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  retryable = false,
  details?: ApiErrorDetail[],
): Response {
  const requestId = crypto.randomUUID();
  const body: ApiErrorBody = { code, message, request_id: requestId, retryable };
  if (details && details.length > 0) {
    body.details = details;
  }
  return Response.json(body, { status, headers: STANDARD_HEADERS(requestId) });
}

/**
 * Error-code → HTTP status, transcribed verbatim from docs/api/README.md §2.
 * Codes retried by the client (network/provider/timeout class) are `retryable`.
 */
const ERROR_STATUS: Record<string, number> = {
  invalid_request: 400,
  invalid_manifest: 400,
  resource_not_found: 404,
  draft_not_found: 404,
  stale_job: 409,
  stale_draft: 409,
  stale_criteria: 409,
  active_run: 409,
  stale_result: 409,
  run_not_current: 409,
  decision_final: 409,
  page_changed: 409,
  idempotency_mismatch: 409,
  request_in_progress: 409,
  batch_too_large: 413,
  request_too_large: 413,
  unsupported_media_type: 415,
  invalid_criteria: 422,
  invalid_run_selection: 422,
  confirmation_required: 422,
  invalid_evidence: 422,
  extraction_refused: 422,
  invalid_schema: 422,
  incomplete_output: 422,
  rate_limited: 429,
  internal_error: 500,
  provider_unavailable: 503,
  extraction_timeout: 503,
  service_unavailable: 503,
  source_unavailable: 503,
};

const RETRYABLE_CODES = new Set([
  "rate_limited",
  "provider_unavailable",
  "extraction_timeout",
  "service_unavailable",
  "source_unavailable",
  "internal_error",
  "request_in_progress",
]);

export function domainErrorStatus(code: string): number {
  const status = ERROR_STATUS[code];
  if (status === undefined) {
    throw new Error(`Unknown domain error code: ${code}`);
  }
  return status;
}

/** Builds the standard error Response for a known domain error code. */
export function domainError(code: string, message: string, details?: ApiErrorDetail[]): Response {
  return apiError(domainErrorStatus(code), code, message, RETRYABLE_CODES.has(code), details);
}

/**
 * Placeholder response for operations deferred to a later round. `501` and
 * `not_implemented` are not part of the contract, so this uses the contract's
 * own "temporarily unavailable" vocabulary instead.
 */
export function notImplemented(operationId: string): Response {
  return apiError(
    503,
    "service_unavailable",
    `${operationId} is not implemented in this round.`,
    true,
  );
}

/**
 * Route-handler catch-block helper: maps anything with a string `.code`
 * (a `DomainError`, or a repository's own small error class with the same
 * shape) to its HTTP response. Unexpected failures stay 500, with a safe
 * correlation event instead of letting Next serialize arbitrary error data.
 */
export function mapDomainError(err: unknown): Response {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string" && Object.hasOwn(ERROR_STATUS, (err as { code: string }).code)) {
    const message = "message" in err && typeof (err as { message: unknown }).message === "string" ? (err as { message: string }).message : "";
    return domainError((err as { code: string }).code, message);
  }
  const response = domainError("internal_error", "Unable to complete this request.");
  console.error({ event: "http_request_failed", code: "internal_error", request_id: response.headers.get("X-Request-Id") });
  return response;
}
