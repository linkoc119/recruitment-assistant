import { test } from "node:test";
import assert from "node:assert/strict";
import { apiError, notImplemented } from "../../src/lib/http/errors.ts";

test("apiError builds a JSON response with the given status", () => {
  const res = apiError(404, "not_found", "Resource not found");
  assert.equal(res.status, 404);
});

test("notImplemented builds a 501 response", () => {
  const res = notImplemented("listJobs");
  assert.equal(res.status, 501);
});
