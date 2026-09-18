import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetTables } from "../../src/infrastructure/db/store.ts";
import { createJob, type PositionDeps } from "../../src/domain/position/index.ts";
import { positionRepository } from "../../src/infrastructure/db/repositories/position.repository.ts";
import { criteriaRepository } from "../../src/infrastructure/db/repositories/criteria.repository.ts";
import { resumeRepository } from "../../src/infrastructure/db/repositories/resume.repository.ts";
import { runRepository } from "../../src/infrastructure/db/repositories/run.repository.ts";
import { GET, PUT } from "../../src/app/api/jobs/[job_id]/criteria-draft/route.ts";

beforeEach(() => {
  resetTables();
});

function makePositionDeps(): PositionDeps {
  return { positionRepo: positionRepository, criteriaRepo: criteriaRepository, resumeRepo: resumeRepository, runRepo: runRepository };
}

function putReq(jobId: string, body: unknown, idempotencyKey = "draft-key"): Request {
  return new Request(`http://localhost/api/jobs/${jobId}/criteria-draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

function ctxFor(jobId: string) {
  return { params: Promise.resolve({ job_id: jobId }) };
}

const draftBody = {
  expected_draft_version: 0,
  expected_revision: 0,
  expected_job_version: 1,
  criteria: [
    {
      criterion_key: "skill-1",
      kind: "skill",
      label: "TypeScript",
      req_type: "mandatory",
      weight: "100",
      source: "manual",
    },
  ],
};

test("GET criteria-draft returns draft_not_found before any draft has been saved", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const res = await GET(new Request("http://localhost/x"), ctxFor(job.id));
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "draft_not_found");
});

test("PUT criteria-draft rejects a stale expected_job_version with stale_job", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });
  const res = await PUT(putReq(job.id, { ...draftBody, expected_job_version: 999 }), ctxFor(job.id));
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "stale_job");
});

test("PUT criteria-draft saves a valid draft, then rejects a stale expected_draft_version on the next save", async () => {
  const job = await createJob(makePositionDeps(), { title: "A", level: null, jd_raw_text: "jd" });

  const first = await PUT(putReq(job.id, draftBody, "draft-key-1"), ctxFor(job.id));
  assert.equal(first.status, 200);
  const firstBody = (await first.json()) as { version: number };
  assert.equal(firstBody.version, 1);

  const getRes = await GET(new Request("http://localhost/x"), ctxFor(job.id));
  assert.equal(getRes.status, 200);

  const stale = await PUT(putReq(job.id, draftBody, "draft-key-2"), ctxFor(job.id));
  assert.equal(stale.status, 409);
  const staleBody = (await stale.json()) as { code: string };
  assert.equal(staleBody.code, "stale_draft");

  const second = await PUT(putReq(job.id, { ...draftBody, expected_draft_version: 1 }, "draft-key-3"), ctxFor(job.id));
  assert.equal(second.status, 200);
});
