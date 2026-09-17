import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../../src/app/api/jobs/route.ts";

test("GET /api/jobs stub returns a 501 body matching the Error schema shape", async () => {
  const res = await GET();
  assert.equal(res.status, 501);

  const body = (await res.json()) as { code: string; message: string; request_id: string; retryable: boolean };
  assert.equal(body.code, "not_implemented");
  assert.equal(typeof body.request_id, "string");
  assert.equal(body.retryable, false);
});
