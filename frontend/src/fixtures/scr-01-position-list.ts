import type { components } from "@app/api-types";

type JobList = components["schemas"]["JobList"];

export const jobList: JobList = {
  items: [
    {
      id: "1",
      title: "Backend Developer",
      level: "Mid",
      status: "open",
      created_at: "2026-09-01T09:00:00Z",
      ready_cv_count: 3,
      published_run_id: null,
      active_run_id: null,
    },
    {
      id: "2",
      title: "Frontend Developer",
      level: "Senior",
      status: "draft",
      created_at: "2026-09-10T09:00:00Z",
      ready_cv_count: 0,
      published_run_id: null,
      active_run_id: null,
    },
  ],
  page: { offset: 0, limit: 50, total: 2 },
};
