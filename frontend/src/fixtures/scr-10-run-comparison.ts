import type { components } from "@app/api-types";

type Comparison = components["schemas"]["Comparison"];

export const comparison: Comparison = {
  job_id: "1",
  left_run_id: "31",
  right_run_id: "32",
  items: [
    {
      resume_id: "24",
      snapshot_id: "34",
      left: { present: true, result_id: "44", rank: 4, displayed_total: "71.00", passed_mandatory: true, status: "scored" },
      right: { present: true, result_id: "54", rank: 1, displayed_total: "85.00", passed_mandatory: true, status: "scored" },
      score_delta: "14.00",
      rank_delta: 3,
      eligibility_changed: false,
    },
    {
      resume_id: "27",
      snapshot_id: "37",
      left: { present: true, result_id: "46", rank: 6, displayed_total: "64.00", passed_mandatory: true, status: "scored" },
      right: { present: true, result_id: "56", rank: 2, displayed_total: "78.00", passed_mandatory: true, status: "scored" },
      score_delta: "14.00",
      rank_delta: 4,
      eligibility_changed: false,
    },
    {
      resume_id: "21",
      snapshot_id: "31",
      left: { present: true, result_id: "41", rank: 1, displayed_total: "92.00", passed_mandatory: true, status: "scored" },
      right: { present: true, result_id: "51", rank: 22, displayed_total: "78.00", passed_mandatory: false, status: "scored" },
      score_delta: "-14.00",
      rank_delta: -21,
      eligibility_changed: true,
    },
    {
      resume_id: "22",
      snapshot_id: "32",
      left: { present: true, result_id: "42", rank: 2, displayed_total: "86.00", passed_mandatory: true, status: "scored" },
      right: { present: true, result_id: "52", rank: 23, displayed_total: "72.00", passed_mandatory: false, status: "scored" },
      score_delta: "-14.00",
      rank_delta: -21,
      eligibility_changed: true,
    },
  ],
  changed_criteria: [
    { criterion_key: "docker", change: "modified", fields: ["req_type", "weight"] },
    { criterion_key: "aws", change: "modified", fields: ["weight"] },
    { criterion_key: "postgresql", change: "modified", fields: ["weight"] },
  ],
  page: { offset: 0, limit: 50, total: 4 },
};

export const extraComparisonMeta = {
  // comparison.items above is the "key volatility" sample (4 rows), not the
  // full 42-candidate run, so these run-level and impact totals can't be
  // counted from it and are tracked here — the first thing to replace with
  // a real aggregate once the backend is wired up.
  run_summary: {
    "31": { passed: 31, failed: 11, total: 42 },
    "32": { passed: 13, failed: 29, total: 42 },
  } as Record<string, { passed: number; failed: number; total: number }>,
  moved_to_failed: 18,
  moved_to_passed: 2,
  criteria_diff: [
    {
      criterion_key: "docker",
      label: "Docker",
      base_req_type: "preferred",
      target_req_type: "mandatory",
      base_weight: "8.00",
      target_weight: "14.00",
      change_type: "modified",
    },
    {
      criterion_key: "aws",
      label: "AWS",
      base_req_type: "preferred",
      target_req_type: "preferred",
      base_weight: "6.00",
      target_weight: "2.00",
      change_type: "modified",
    },
    {
      criterion_key: "postgresql",
      label: "PostgreSQL",
      base_req_type: "preferred",
      target_req_type: "preferred",
      base_weight: "3.00",
      target_weight: "1.00",
      change_type: "modified",
    },
  ],
  candidate_names: {
    "24": { name: "Pham Van Nam", file: "pham-van-nam.pdf", reason: "Docker skill earns full 14% new mandatory weight, promoting candidate to rank 1" },
    "27": { name: "Do Quang Huy", file: "do-quang-huy-dev.pdf", reason: "Possesses Docker skill, promoted from rank 6 to 2" },
    "21": { name: "Nguyen Van An", file: "nguyen-van-an-backend.pdf", reason: "Missing Docker (now mandatory), dropped below Knockout Divider" },
    "22": { name: "Tran Minh Binh", file: "tran-minh-binh-cv.pdf", reason: "Missing Docker (now mandatory), dropped below Knockout Divider" },
  } as Record<string, { name: string; file: string; reason: string }>,
};
