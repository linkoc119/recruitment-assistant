import type { components } from "@app/api-types";

type CriteriaDraft = components["schemas"]["CriteriaDraft"];

export const criteriaDraft: CriteriaDraft = {
  id: "1",
  job_id: "1",
  version: 1,
  base_revision: 0,
  job_version: 1,
  jd_snapshot: "Python is required.",
  criteria: [
    {
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
      jd_evidence: [
        {
          source: "jd",
          source_id: "1",
          segment_id: "seg-1",
          quote: "Python is required.",
          start_offset: 0,
          end_offset: 20,
          page: null,
          paragraph: 1,
        },
      ],
    },
  ],
  updated_at: "2026-09-01T09:00:00Z",
};
