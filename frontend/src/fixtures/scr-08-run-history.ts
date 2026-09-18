import type { components } from "@app/api-types";

type RunList = components["schemas"]["RunList"];

export const runList: RunList = {
  items: [
    {
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
    },
    {
      id: "32",
      job_id: "1",
      round: 2,
      mode: "rescore",
      base_run_id: "31",
      criteria_revision: 2,
      policy_version: "v1",
      status: "completed",
      counts: { total: 42, pending: 0, processing: 0, succeeded: 42, failed: 0 },
      created_at: "2026-09-11T15:20:00Z",
      started_at: "2026-09-11T15:20:05Z",
      finished_at: "2026-09-11T15:25:00Z",
      published_at: null,
      is_current: false,
      error_code: null,
    },
  ],
  page: { offset: 0, limit: 50, total: 2 },
};
