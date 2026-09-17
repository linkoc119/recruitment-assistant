import type { components } from "@app/api-types";

type Job = components["schemas"]["Job"];
type SkillList = components["schemas"]["SkillList"];

export const job: Job = {
  id: "1",
  title: "Backend Developer",
  jd_raw_text: "Python is required.",
  level: "Mid",
  status: "open",
  version: 1,
  created_at: "2026-09-01T09:00:00Z",
  updated_at: "2026-09-01T09:00:00Z",
  criteria_revision: null,
  published_run_id: null,
  readiness: {
    approved_criteria: false,
    ready_cv_count: 0,
    active_run_id: null,
    can_start: false,
    blocking_codes: ["criteria_not_approved", "no_ready_cv"],
  },
};

export const skillList: SkillList = {
  items: [{ id: "1", name: "Python", aliases: ["Py"], dictionary_version: "v1" }],
  page: { offset: 0, limit: 50, total: 1 },
};
