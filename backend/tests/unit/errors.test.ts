import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apiError,
  domainError,
  domainErrorStatus,
  notImplemented,
  okJson,
  mapDomainError,
  type ApiErrorBody,
} from "../../src/lib/http/errors.ts";

test("unexpected HTTP failures return a safe envelope and correlated log without source data", async t => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  for (const error of [new Error("PRIVATE_CV private@example.invalid"), { code: "PRIVATE_TOKEN", message: "PRIVATE_CV" }]) {
    const response = mapDomainError(error);
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.code, "internal_error");
    assert.equal(body.retryable, true);
    assert.deepEqual(logs.at(-1), [{ event: "http_request_failed", code: "internal_error", request_id: body.request_id }]);
    assert.doesNotMatch(JSON.stringify([logs, body]), /PRIVATE|private@|stack/);
  }
});

test("apiError builds a JSON response with the given status", () => {
  const res = apiError(404, "resource_not_found", "Resource not found");
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.ok(res.headers.get("X-Request-Id"));
});

test("notImplemented builds a 503 service_unavailable response", () => {
  const res = notImplemented("listJobs");
  assert.equal(res.status, 503);
});

test("notImplemented body carries the service_unavailable code", async () => {
  const res = notImplemented("listRuns");
  const body = (await res.json()) as ApiErrorBody;
  assert.equal(body.code, "service_unavailable");
  assert.equal(body.retryable, true);
});

test("domainErrorStatus maps contract codes to their documented HTTP status", () => {
  assert.equal(domainErrorStatus("stale_job"), 409);
  assert.equal(domainErrorStatus("invalid_run_selection"), 422);
  assert.equal(domainErrorStatus("resource_not_found"), 404);
});

test("domainErrorStatus throws for a code outside the contract vocabulary", () => {
  assert.throws(() => domainErrorStatus("not_a_real_code"));
});

test("domainError builds a Response using the mapped status", () => {
  const res = domainError("stale_draft", "Draft has moved on.");
  assert.equal(res.status, 409);
});

test("okJson sets the mandatory headers on a success response", () => {
  const res = okJson(200, { ok: true });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.ok(res.headers.get("X-Request-Id"));
});
