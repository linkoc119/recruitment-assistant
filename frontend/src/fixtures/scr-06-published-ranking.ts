import type { components } from "@app/api-types";

type Ranking = components["schemas"]["Ranking"];

export const ranking: Ranking = {
  job_id: "1",
  run_id: "31",
  criteria_revision: 1,
  policy_version: "v1",
  is_current: true,
  decision_epoch: 0,
  active_run_id: null,
  latest_criteria_revision: 1,
  items: [
    {
      result_id: "41",
      resume_id: "21",
      snapshot_id: "31",
      candidate_id: "11",
      candidate_name: "Nguyen Van A",
      file_name: "candidate-a.pdf",
      resume_version: 1,
      rank: 1,
      passed_mandatory: true,
      displayed_total: "92.94",
      status: "scored",
      result_version: 1,
      failed_criteria: [],
      matched_skills: ["Python"],
      missing_skills: [],
    },
  ],
  page: { offset: 0, limit: 50, total: 1 },
  failure_count: 0,
  eligibility_counts: { passed: 1, failed: 0 },
};
