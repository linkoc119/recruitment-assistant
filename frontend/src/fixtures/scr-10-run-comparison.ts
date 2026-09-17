import type { components } from "@app/api-types";

type Comparison = components["schemas"]["Comparison"];

export const comparison: Comparison = {
  job_id: "1",
  left_run_id: "30",
  right_run_id: "31",
  items: [
    {
      resume_id: "21",
      snapshot_id: "31",
      left: { present: true, result_id: "40", rank: 2, displayed_total: "80.00", passed_mandatory: true, status: "scored" },
      right: { present: true, result_id: "41", rank: 1, displayed_total: "92.94", passed_mandatory: true, status: "scored" },
      score_delta: "12.94",
      rank_delta: 1,
      eligibility_changed: false,
    },
  ],
  changed_criteria: [{ criterion_key: "python", change: "modified", fields: ["weight"] }],
  page: { offset: 0, limit: 50, total: 1 },
};
