import { test } from "node:test";
import assert from "node:assert/strict";
import { resetTables } from "../../src/infrastructure/db/store.ts";
import { GET } from "../../src/app/api/jobs/route.ts";

test("GET /api/jobs returns the standard envelope on a real, wired route", async () => {
  resetTables();

  const req = new Request("http://localhost/api/jobs");
  const res = await GET(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(typeof res.headers.get("X-Request-Id"), "string");

  const body = (await res.json()) as { items: unknown[]; page: { offset: number; limit: number; total: number } };
  assert.deepEqual(body.items, []);
  assert.deepEqual(body.page, { offset: 0, limit: 50, total: 0 });
});
