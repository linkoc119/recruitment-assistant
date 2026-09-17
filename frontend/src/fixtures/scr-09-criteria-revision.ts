import type { components } from "@app/api-types";

type RevisionList = components["schemas"]["RevisionList"];

export const revisionList: RevisionList = {
  items: [
    {
      id: "1",
      job_id: "1",
      revision: 1,
      jd_snapshot: "Python is required.",
      dictionary_version: "v1",
      approved_at: "2026-09-01T10:00:00Z",
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
          jd_evidence: [],
        },
      ],
    },
  ],
  page: { offset: 0, limit: 50, total: 1 },
};
