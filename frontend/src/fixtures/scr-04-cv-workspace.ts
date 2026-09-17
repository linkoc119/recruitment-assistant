import type { components } from "@app/api-types";

type ResumeList = components["schemas"]["ResumeList"];

export const resumeList: ResumeList = {
  items: [
    {
      id: "21",
      job_id: "1",
      candidate_id: "11",
      version: 1,
      file_name: "candidate-a.pdf",
      media_type: "application/pdf",
      size_bytes: 204800,
      status: "parsed",
      snapshot_id: "31",
      created_at: "2026-09-02T09:00:00Z",
      error_code: null,
      can_screen: true,
    },
  ],
  page: { offset: 0, limit: 50, total: 1 },
};
