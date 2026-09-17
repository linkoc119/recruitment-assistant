import type { components } from "@app/api-types";

type Run = components["schemas"]["Run"];
type RunItemList = components["schemas"]["RunItemList"];

export const run: Run = {
  id: "31",
  job_id: "1",
  round: 1,
  mode: "initial",
  base_run_id: null,
  criteria_revision: 1,
  policy_version: "v1",
  status: "running",
  counts: { total: 2, pending: 1, processing: 1, succeeded: 0, failed: 0 },
  created_at: "2026-09-16T09:00:00Z",
  started_at: "2026-09-16T09:01:00Z",
  finished_at: null,
  published_at: null,
  is_current: false,
  error_code: null,
};

export const runItemList: RunItemList = {
  items: [
    { resume_id: "21", snapshot_id: "31", status: "processing", attempts: 1, error_code: null, error_phase: null, result_id: null },
    { resume_id: "22", snapshot_id: "32", status: "pending", attempts: 0, error_code: null, error_phase: null, result_id: null },
  ],
  page: { offset: 0, limit: 50, total: 2 },
};
