export interface ApiErrorBody {
  code: string;
  message: string;
  request_id: string;
  retryable: boolean;
}

export function apiError(status: number, code: string, message: string, retryable = false): Response {
  const body: ApiErrorBody = { code, message, request_id: crypto.randomUUID(), retryable };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function notImplemented(operationId: string): Response {
  return apiError(501, "not_implemented", `${operationId} is not implemented yet.`);
}
