import type { components } from "@app/api-types";

type JobList = components["schemas"]["JobList"];

export const jobList: JobList = {
  items: [
    {
      id: "1",
      title: "Backend Developer",
      level: "Senior",
      status: "open",
      created_at: "2026-09-01T09:00:00Z",
      ready_cv_count: 42,
      published_run_id: "31",
      active_run_id: null,
    },
    {
      id: "2",
      title: "AI Engineer",
      level: "Middle",
      status: "open",
      created_at: "2026-09-05T10:30:00Z",
      ready_cv_count: 24,
      published_run_id: "25",
      active_run_id: null,
    },
    {
      id: "3",
      title: "Data Analyst",
      level: "Junior",
      status: "open",
      created_at: "2026-09-10T08:00:00Z",
      ready_cv_count: 18,
      published_run_id: null,
      active_run_id: null,
    },
  ],
  page: { offset: 0, limit: 50, total: 3 },
};

export const extraPositionMetadata: Record<string, { location: string; shortlist_count: number; last_screened: string; is_active_screening?: boolean }> = {
  "1": { location: "Hanoi", shortlist_count: 8, last_screened: "Sep 11, 2026 at 14:06", is_active_screening: true },
  "2": { location: "Hanoi", shortlist_count: 3, last_screened: "Sep 08, 2026 at 09:15" },
  "3": { location: "Ho Chi Minh City", shortlist_count: 0, last_screened: "Not screened yet" },
};
