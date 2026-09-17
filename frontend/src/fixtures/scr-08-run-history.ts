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
      counts: { total: 2, pending: 0, processing: 0, succeeded: 2, failed: 0 },
      created_at: "2026-09-16T09:00:00Z",
      started_at: "2026-09-16T09:01:00Z",
      finished_at: "2026-09-16T09:05:00Z",
      published_at: "2026-09-16T09:06:00Z",
      is_current: true,
      error_code: null,
    },
  ],
  page: { offset: 0, limit: 50, total: 1 },
};
