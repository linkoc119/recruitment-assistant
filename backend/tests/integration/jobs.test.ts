import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetTables } from "../../src/infrastructure/db/store.ts";
import { GET, POST } from "../../src/app/api/jobs/route.ts";

beforeEach(() => {
  resetTables();
});

function postReq(body: unknown, idempotencyKey?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idempotencyKey !== undefined) headers["Idempotency-Key"] = idempotencyKey;
  return new Request("http://localhost/api/jobs", { method: "POST", headers, body: JSON.stringify(body) });
}

test("POST /api/jobs without an Idempotency-Key is rejected", async () => {
  const res = await POST(postReq({ title: "Backend Engineer", jd_raw_text: "jd" }));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "invalid_request");
});

test("POST /api/jobs creates a job and returns the standard envelope", async () => {
  const res = await POST(postReq({ title: "Backend Engineer", jd_raw_text: "jd" }, "create-job-key-1"));
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(typeof res.headers.get("X-Request-Id"), "string");

  const body = (await res.json()) as { id: string; title: string; version: number };
  assert.equal(body.title, "Backend Engineer");
  assert.equal(body.version, 1);
});

test("POST /api/jobs replays the same response for a repeated Idempotency-Key with the same payload", async () => {
  const payload = { title: "Backend Engineer", jd_raw_text: "jd" };
  const first = await POST(postReq(payload, "create-job-key-2"));
  const firstBody = (await first.json()) as { id: string };

  const second = await POST(postReq(payload, "create-job-key-2"));
  assert.equal(second.status, 201);
  const secondBody = (await second.json()) as { id: string };
  assert.equal(secondBody.id, firstBody.id);

  const list = await GET(new Request("http://localhost/api/jobs"));
  const listBody = (await list.json()) as { page: { total: number } };
  assert.equal(listBody.page.total, 1);
});

test("POST /api/jobs rejects a repeated Idempotency-Key with a different payload", async () => {
  await POST(postReq({ title: "Backend Engineer", jd_raw_text: "jd" }, "create-job-key-3"));
  const res = await POST(postReq({ title: "Frontend Engineer", jd_raw_text: "jd" }, "create-job-key-3"));
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "idempotency_mismatch");
});

test("GET /api/jobs paginates with offset/limit", async () => {
  for (let i = 0; i < 3; i++) {
    await POST(postReq({ title: `Job ${i}`, jd_raw_text: "jd" }, `paginate-key-${i}`));
  }

  const page1 = await GET(new Request("http://localhost/api/jobs?offset=0&limit=2"));
  const page1Body = (await page1.json()) as { items: { title: string }[]; page: { offset: number; limit: number; total: number } };
  assert.equal(page1Body.items.length, 2);
  assert.deepEqual(page1Body.page, { offset: 0, limit: 2, total: 3 });

  const page2 = await GET(new Request("http://localhost/api/jobs?offset=2&limit=2"));
  const page2Body = (await page2.json()) as { items: { title: string }[] };
  assert.equal(page2Body.items.length, 1);
});
