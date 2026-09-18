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
  status: "completed",
  counts: { total: 42, pending: 0, processing: 0, succeeded: 42, failed: 0 },
  created_at: "2026-09-11T14:00:00Z",
  started_at: "2026-09-11T14:00:05Z",
  finished_at: "2026-09-11T14:06:00Z",
  published_at: "2026-09-11T14:06:00Z",
  is_current: true,
  error_code: null,
};

export const runItemList: RunItemList = {
  items: [
    { resume_id: "21", snapshot_id: "31", status: "succeeded", attempts: 1, error_code: null, error_phase: null, result_id: "41" },
    { resume_id: "22", snapshot_id: "32", status: "succeeded", attempts: 1, error_code: null, error_phase: null, result_id: "42" },
    { resume_id: "23", snapshot_id: "33", status: "succeeded", attempts: 1, error_code: null, error_phase: null, result_id: "43" },
    { resume_id: "24", snapshot_id: "34", status: "succeeded", attempts: 1, error_code: null, error_phase: null, result_id: "44" },
    { resume_id: "26", snapshot_id: "36", status: "succeeded", attempts: 1, error_code: null, error_phase: null, result_id: "46" },
  ],
  page: { offset: 0, limit: 50, total: 42 },
};

export const screeningSteps = [
  { step: 1, title: "Structural information extraction (Parsing)", status: "completed" },
  { step: 2, title: "Skills analysis & matching (Skills Match)", status: "completed" },
  { step: 3, title: "Backend experience duration verification", status: "completed" },
  { step: 4, title: "Standard eligibility requirements evaluation", status: "completed" },
  { step: 5, title: "Component scoring & Match Score calculation", status: "completed" },
  { step: 6, title: "Candidate ranking & knockout partitioning", status: "completed" },
];
