import { esc } from "./html.js";

export interface RunReview {
  positionId: string;
  position: string;
  mode: "initial" | "rescore";
  criteriaRevision: number;
  policyVersion: string;
  cvCount: number;
  failedExcluded?: number;
  duplicateExcluded?: number;
  sourceRun?: string;
  sourceRunId?: string;
}

export function runReviewMarkup(review: RunReview): string {
  const base = `#/positions/${encodeURIComponent(review.positionId)}`;
  const criteria = `${base}/criteria/${review.criteriaRevision}`;
  const workspace = `${base}/cv-workspace`;
  const source = review.sourceRunId ? `${base}/screening-runs/${encodeURIComponent(review.sourceRunId)}` : `${base}/runs`;
  const rows = [
    ["Position", review.position, `${base}/edit`],
    ["Run type", review.mode === "initial" ? "Initial screening" : "Criteria rescore", review.mode === "initial" ? workspace : `${base}/criteria/new-revision`],
    ["Criteria revision", `Revision ${review.criteriaRevision}`, criteria],
    ["Scoring policy", review.policyVersion, criteria],
    [review.mode === "initial" ? "CVs included" : "Source CVs", String(review.cvCount), review.mode === "initial" ? workspace : source],
  ];
  if (review.mode === "initial") {
    rows.push(["Failed CVs excluded", String(review.failedExcluded ?? 0), workspace]);
    rows.push(["Duplicate uploads excluded (latest batch)", String(review.duplicateExcluded ?? 0), workspace]);
  } else {
    rows.push(["Source run", review.sourceRun ?? "Unavailable", source]);
  }

  return `<dl class="review-grid">${rows.map(([label, value, href]) => `<div><dt>${esc(label)}</dt><dd><a href="${esc(href)}" aria-label="Review ${esc(label)}: ${esc(value)}">${esc(value)}</a></dd></div>`).join("")}</dl>
    <h3>Before you start</h3>
    <ul class="review-statements">
      <li>Inputs are frozen for this run; later edits do not change its results.</li>
      <li>Initial runs may publish successful CVs while disclosing file failures.</li>
      <li>Rescoring publishes only when the entire source set succeeds; otherwise the current ranking remains published.</li>
      <li>Shortlist and reject decisions from the source run do not carry forward.</li>
    </ul>`;
}
