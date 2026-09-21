import type { components } from "@app/api-types";
export type Model<K extends keyof components["schemas"]> = components["schemas"][K];
export class ApiError extends Error {
  constructor(public code: string, public status: number, public requestId = "") { super(code); }
}
export async function request<T>(path: string, options: { method?: string; body?: unknown; key?: string; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.key) headers["Idempotency-Key"] = options.key;
  const multipart = options.body instanceof FormData;
  if (options.body !== undefined && !multipart) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method: options.method ?? "GET", headers, cache: "no-store", signal: options.signal,
      body: options.body === undefined ? undefined : multipart ? options.body as FormData : JSON.stringify(options.body) });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError("network_error", 0);
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new ApiError("invalid_response", response.status); }
  if (!response.ok) {
    const error = body as Partial<Model<"Error">>;
    throw new ApiError(error.code ?? "service_unavailable", response.status, response.headers.get("X-Request-Id") ?? "");
  }
  return body as T;
}
// Per user intent, retry with the same key after an uncertain network outcome.
// Payloads and keys live only in memory; CV/JD/contact data never enter storage.
export function command() {
  let previous = "", key = "";
  return <T>(path: string, body: unknown, signal: AbortSignal, method = "POST", identity?: string) => {
    const fingerprint = identity ?? `${method}:${path}:${JSON.stringify(body)}`;
    if (fingerprint !== previous) { previous = fingerprint; key = crypto.randomUUID(); }
    return request<T>(path, { method, body, key, signal });
  };
}
export async function allPages<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await request<{ items: T[]; page: Model<"Page"> }>(`${path}${path.includes("?") ? "&" : "?"}offset=${offset}&limit=100`, { signal });
    items.push(...page.items);
    if (offset + page.items.length >= page.page.total || !page.items.length) return items;
  }
}
export const jobPath = (id: string) => {
  if (!/^[1-9][0-9]*$/.test(id)) throw new ApiError("invalid_request", 400);
  return `/jobs/${id}`;
};
export const getJob = (id: string, signal: AbortSignal) => request<Model<"Job">>(jobPath(id), { signal });
export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return "Unable to complete this action. Please retry.";
  const messages: Record<string, string> = {
    network_error: "Cannot connect to the server. Check the connection and retry; your input is preserved.",
    resource_not_found: "This resource is unavailable in the selected position.",
    stale_job: "The position changed. Reload before saving; your edits have not been sent again.",
    stale_draft: "Another session changed this draft. Reload and review before saving.",
    stale_criteria: "The approved criteria changed. Reload and review the latest revision.",
    stale_result: "This decision is stale. Reload the result before deciding again.",
    page_changed: "Decisions changed while paging. Refresh the ranking from its first page.",
    run_not_current: "A newer run is published. Open the current ranking before deciding.",
    active_run: "A screening run is already active. Open its progress from Candidates.",
    decision_final: "This result already has a final decision. Reload to see it.",
    source_unavailable: "The source is unavailable. Stored analysis is still readable.",
    invalid_criteria: "Check criteria: positive weights must total 100, skills must be unique, and thresholds must be valid.",
    invalid_run_selection: "Review the selected CVs, approved revision and published base run.",
    request_in_progress: "This request or extraction cannot be started in its current state. Refresh its status.",
    extraction_refused: "This document cannot be reprocessed. Upload a corrected file.",
  };
  const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(error.requestId) ? error.requestId : "";
  return (messages[error.code] ?? "Request failed. Check your input or retry.") + (requestId ? ` Request ID: ${requestId}` : "");
}
