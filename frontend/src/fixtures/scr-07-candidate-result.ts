import type { components } from "@app/api-types";

type ResultDetail = components["schemas"]["ResultDetail"];
type SourcePreview = components["schemas"]["SourcePreview"];

export const resultDetail: ResultDetail = {
  id: "41",
  job_id: "1",
  run_id: "31",
  resume_id: "21",
  snapshot_id: "31",
  criteria_revision: 1,
  resume_version: 1,
  candidate: { id: "11", full_name: "Nguyen Van A", email: "a@example.com", phone: null },
  policy_version: "v1",
  result_version: 1,
  status: "scored",
  decision_at: null,
  is_current: true,
  can_decide: true,
  rank: 1,
  passed_mandatory: true,
  total_score: "92.94",
  displayed_total: "92.94",
  skill_score: "92.94",
  experience_score: null,
  education_score: null,
  semantic_score: null,
  summary: "Strong Python match.",
  experience: { normalization_version: "months-v1", as_of_date: "2026-09-16", supported_months: 36 },
  criteria: [
    {
      criterion: {
        id: "1",
        criterion_key: "python",
        kind: "skill",
        label: "Python",
        skill_id: "1",
        canonical_skill_name: "Python",
        req_type: "mandatory",
        weight: "100.00",
        min_years: null,
        min_degree: null,
        source: "ai",
        jd_evidence: [],
      },
      match_status: "matched",
      criterion_passed: true,
      reason_code: "matched_skill",
      reason: "Python appears in the CV.",
      score_contribution: "92.94",
      displayed_contribution: "92.94",
      evidence: [],
    },
  ],
};

export const sourcePreview: SourcePreview = {
  resume_id: "21",
  snapshot_id: "31",
  run_id: "31",
  result_id: "41",
  raw_text: "Python is required.",
  segments: [
    { segment_id: "seg-1", page: null, paragraph: 1, start_offset: 0, end_offset: 20, text: "Python is required." },
  ],
};
