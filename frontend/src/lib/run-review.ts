import { esc } from "./html.js";

export interface RunReview {
  position: string;
  mode: "initial" | "rescore";
  criteriaRevision: number;
  policyVersion: string;
  cvCount: number;
  failedExcluded?: number;
  duplicateExcluded?: number;
  sourceRun?: string;
}

export function runReviewMarkup(review: RunReview): string {
  const rows = [
    ["Position", review.position],
    ["Run type", review.mode === "initial" ? "Initial screening" : "Criteria rescore"],
    ["Criteria revision", `Revision ${review.criteriaRevision}`],
    ["Scoring policy", review.policyVersion],
    [review.mode === "initial" ? "CVs included" : "Source CVs", String(review.cvCount)],
  ];
  if (review.mode === "initial") {
    rows.push(["Failed CVs excluded", String(review.failedExcluded ?? 0)]);
    rows.push(["Duplicate uploads excluded (latest batch)", String(review.duplicateExcluded ?? 0)]);
  } else {
    rows.push(["Source run", review.sourceRun ?? "Unavailable"]);
  }

  return `<dl class="review-grid">${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>
    <h3>Before you start</h3>
    <ul class="review-statements">
      <li>Inputs are frozen for this run; later edits do not change its results.</li>
      <li>Initial runs may publish successful CVs while disclosing file failures.</li>
      <li>Rescoring publishes only when the entire source set succeeds; otherwise the current ranking remains published.</li>
      <li>Shortlist and reject decisions from the source run do not carry forward.</li>
    </ul>`;
}
