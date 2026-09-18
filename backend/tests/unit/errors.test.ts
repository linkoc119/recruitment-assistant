import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apiError,
  domainError,
  domainErrorStatus,
  notImplemented,
  okJson,
  type ApiErrorBody,
} from "../../src/lib/http/errors.ts";

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
