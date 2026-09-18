import type { ScreenModule } from "../../router/types.js";
import { resultDetail, rawCandidateResumeText } from "../../fixtures/scr-07-candidate-result.js";
import { esc, safeId } from "../../lib/html.js";

// This is the screen that has to prove the app's central claim: every score
// is explainable. Three blocks used to compete with that job and were cut
// per docs/ui-ux/ui-improvement-plan.md §4 (Phase 1):
//   - "Component Scores" (Skills/Exp/Edu) — the model has no such
//     dimensions, and the three numbers didn't reconcile with the Match
//     Score above or the criteria table below.
//   - the purple "AI Evaluation Summary" — prose commentary on a score,
//     when the product's rule is that AI only extracts and never judges.
//   - "Candidate Profile" — name is already in the header; email/phone
//     move into the header meta line; location/education were never in
//     the data model, so they are dropped rather than re-fabricated.
// What is left: header, criteria-vs-evidence table, and the source resume.
function formatExperience(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} months`;
  if (rest === 0) return `${years} years`;
  return `${years} years ${rest} months`;
}

export async function mount(container: HTMLElement, params: Record<string, string>): Promise<void> {
  const positionId = safeId(params.position, resultDetail.job_id);
  const mandatoryTotal = resultDetail.criteria.filter(c => c.criterion.req_type === "mandatory").length;
  const experienceLabel = resultDetail.experience ? formatExperience(resultDetail.experience.supported_months) : null;
  const score = Math.round(parseFloat(resultDetail.displayed_total));

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <h1 class="page-title" style="margin-bottom: 0;">${esc(resultDetail.candidate.full_name)}</h1>
          ${resultDetail.passed_mandatory ? `<span class="badge badge-success">Met all ${esc(mandatoryTotal)} mandatory requirements</span>` : `<span class="badge badge-danger">Failed mandatory requirements</span>`}
        </div>
        <p class="page-desc">
          ${esc(resultDetail.candidate.email)} · ${esc(resultDetail.candidate.phone)}${experienceLabel ? ` · ${esc(experienceLabel)} experience` : ""}
        </p>
      </div>
      <div class="page-actions">
        <a href="#/positions/${positionId}/ranking" class="btn btn-secondary">← Back to ranking</a>
        <button class="btn btn-outline-danger btn-sm" disabled title="Prototype: rejecting a candidate is not wired to a backend yet">Reject</button>
        <button class="btn btn-primary" disabled title="Prototype: shortlisting a candidate is not wired to a backend yet">Shortlist</button>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--space-5); padding: 16px 24px; display: flex; align-items: center; gap: 16px;">
      <div style="font-size: 11px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Match score</div>
      <span style="font-size: 26px; font-weight: 700; color: var(--color-text-primary);">${score}</span>
      <span style="font-size: 13px; color: var(--color-text-muted);">/ 100 · Rank ${esc(resultDetail.rank)}</span>
      <div class="progress-bar-container" style="width: 160px; height: 5px; margin-left: 4px;">
        <div class="progress-bar-fill" style="width: ${score}%;"></div>
      </div>
    </div>

    <div class="split-view" style="grid-template-columns: 1.15fr 0.85fr; gap: 24px;">
      <div>
        <div class="table-container">
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--color-border-subtle);">
            <h2 style="font-size: 15px; font-weight: 700; color: var(--color-text-primary); margin-bottom: 2px;">Criteria matching breakdown</h2>
            <div style="font-size: 12px; color: var(--color-text-muted);">
              Weight is the maximum score potential; contribution is the points actually awarded.
            </div>
          </div>

          <table class="data-table">
            <thead>
              <tr>
                <th>Criterion</th>
                <th>Type</th>
                <th>Status</th>
                <th style="text-align: center;">Weight</th>
                <th style="text-align: center;">Contribution</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              ${resultDetail.criteria.map(item => `
                <tr>
                  <td style="font-weight: 600; color: var(--color-text-primary);">${esc(item.criterion.label)}</td>
                  <td>
                    <span class="badge ${item.criterion.req_type === "mandatory" ? "badge-info" : "badge-muted"}" style="font-size: 11px;">
                      ${item.criterion.req_type === "mandatory" ? "Mandatory" : "Preferred"}
                    </span>
                  </td>
                  <td>
                    <span class="badge ${item.criterion_passed ? "badge-success" : "badge-danger"}" style="font-size: 11px;">
                      ${item.criterion_passed ? "Matched" : "Missing"}
                    </span>
                  </td>
                  <td style="text-align: center; font-weight: 600;">${Math.round(parseFloat(item.criterion.weight))}</td>
                  <td style="text-align: center; font-weight: 700; color: var(--color-text-primary);">${Math.round(parseFloat(item.displayed_contribution))}</td>
                  <td>
                    ${item.evidence.length > 0 ? `
                      <button class="btn btn-secondary btn-sm btn-show-evidence" data-key="${esc(item.criterion.criterion_key)}" style="font-size: 11px; padding: 3px 8px;">
                        View evidence
                      </button>
                    ` : `
                      <span style="font-size: var(--font-size-xs); color: var(--color-text-muted); font-style: italic;">Not found</span>
                    `}
                  </td>
                </tr>
              `).join("")}
              <tr style="background: var(--color-canvas); font-weight: 700;">
                <td colspan="3">Total</td>
                <td style="text-align: center;">100</td>
                <td style="text-align: center; font-size: 15px;">${score}</td>
                <td style="font-size: 12px; font-weight: 500; color: var(--color-text-muted);">Matches overall Match Score (${score})</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="pane" style="position: sticky; top: 80px; max-height: calc(100vh - 100px); overflow-y: auto;">
        <div class="pane-header" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="font-size: 11px; font-weight: 700; color: var(--color-primary); text-transform: uppercase;">Original resume</span>
          </div>
        </div>

        <div id="cv-raw-text-container" style="font-size: 13px; line-height: 1.8; color: var(--color-text-secondary); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 20px; white-space: pre-wrap; font-family: inherit;">
          ${renderFormattedCV(rawCandidateResumeText)}
        </div>

        <p style="margin-top: 14px; font-size: 12px; color: var(--color-text-muted);">
          "View evidence" locates and highlights the source quote in this resume.
        </p>
      </div>
    </div>
  `;

  // Attach evidence highlight interactive events
  const buttons = container.querySelectorAll(".btn-show-evidence");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-key");
      if (!key) return;

      // Remove existing highlights
      container.querySelectorAll(".evidence-highlight-target").forEach(el => {
        el.classList.remove("evidence-highlight-target");
      });

      // Find the mapped quote span
      const targetSpan = container.querySelector(`[data-evidence-key="${key}"]`);
      if (targetSpan) {
        targetSpan.classList.add("evidence-highlight-target");
        targetSpan.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  });
}

// NOTE: this wraps known evidence quotes in <span data-evidence-key> markers
// via exact-string .replace() against fixture text, so it is safe today.
// It does not yet escape rawCandidateResumeText itself before doing so.
// That is fine while the text is hand-written fixture data, but this
// function must not be reused unmodified once resumes are real uploads —
// escaping the base text first would require re-deriving the quote
// markers against the escaped string. Tracked in
// docs/ui-ux/ui-improvement-plan.md §5.5 as a Phase 3 prerequisite.
function renderFormattedCV(text: string): string {
  // Wrap known quotes into spans with data-evidence-key
  return text
    .replace(
      "Three years developing with Python for core payment platform services, handling transaction processing microservices.",
      `<span data-evidence-key="python">Three years developing with Python for core payment platform services, handling transaction processing microservices.</span>`
    )
    .replace(
      "Built REST APIs with FastAPI for payment infrastructure, serving an average of 1.2 million requests daily.",
      `<span data-evidence-key="fastapi">Built REST APIs with FastAPI for payment infrastructure, serving an average of 1.2 million requests daily.</span>`
    )
    .replace(
      "Designed internal APIs serving three product teams, complete with OpenAPI documentation and contract testing suites.",
      `<span data-evidence-key="rest-api">Designed internal APIs serving three product teams, complete with OpenAPI documentation and contract testing suites.</span>`
    )
    .replace(
      "Optimized SQL queries and indexes, cutting reconciliation report response times by 40%.",
      `<span data-evidence-key="sql">Optimized SQL queries and indexes, cutting reconciliation report response times by 40%.</span>`
    )
    .replace(
      "Utilized PostgreSQL for payment data storage, managing monthly partition schemes for high transaction volumes.",
      `<span data-evidence-key="postgresql">Utilized PostgreSQL for payment data storage, managing monthly partition schemes for high transaction volumes.</span>`
    )
    .replace(
      "Applied Redis for session state caching and asynchronous job queues.",
      `<span data-evidence-key="redis">Applied Redis for session state caching and asynchronous job queues.</span>`
    )
    .replace(
      "Deployed services on EC2 and S3, configured load balancing and automated backup pipelines.",
      `<span data-evidence-key="aws">Deployed services on EC2 and S3, configured load balancing and automated backup pipelines.</span>`
    )
    .replace(
      "Total 5 years 3 months of professional backend engineering experience.",
      `<span data-evidence-key="exp-backend">Total 5 years 3 months of professional backend engineering experience.</span>`
    );
}

export function unmount(): void {}

export default { mount, unmount } satisfies ScreenModule;
