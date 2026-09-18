import type { ScreenModule } from "../../router/types.js";
import { comparison, extraComparisonMeta } from "../../fixtures/scr-10-run-comparison.js";
import { jobList } from "../../fixtures/scr-01-position-list.js";
import { runList } from "../../fixtures/scr-08-run-history.js";
import { esc, safeId, iconCheck, iconX, iconArrowUp, iconArrowDown, formatDateTime, emptyStateRow } from "../../lib/html.js";

function runStats(runId: string): { passed: number; failed: number; total: number; passedPct: number; failedPct: number } {
  const s = extraComparisonMeta.run_summary[runId] ?? { passed: 0, failed: 0, total: 0 };
  return {
    ...s,
    passedPct: s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0,
    failedPct: s.total > 0 ? Math.round((s.failed / s.total) * 100) : 0,
  };
}

export async function mount(container: HTMLElement, params: Record<string, string>): Promise<void> {
  const positionId = safeId(params.position, comparison.job_id);
  const job = jobList.items.find(j => j.id === positionId);
  const leftRun = runList.items.find(r => r.id === comparison.left_run_id);
  const rightRun = runList.items.find(r => r.id === comparison.right_run_id);
  const left = runStats(comparison.left_run_id);
  const right = runStats(comparison.right_run_id);
  const dockerDiff = extraComparisonMeta.criteria_diff.find(d => d.criterion_key === "docker");
  const dockerBaseWeight = dockerDiff ? Math.round(parseFloat(dockerDiff.base_weight)) : 0;
  const dockerTargetWeight = dockerDiff ? Math.round(parseFloat(dockerDiff.target_weight)) : 0;
  const dockerBaseLabel = dockerDiff?.base_req_type === "mandatory" ? "Mandatory" : "Preferred";
  const dockerTargetLabel = dockerDiff?.target_req_type === "mandatory" ? "Mandatory" : "Preferred";

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Run Comparison (Run ${esc(comparison.left_run_id)} vs Run ${esc(comparison.right_run_id)})</h1>
        <p class="page-desc">${esc(job?.title ?? "Position")} · Detailed impact analysis of criteria calibration between Run ${esc(comparison.left_run_id)} and Run ${esc(comparison.right_run_id)}</p>
      </div>
      <div class="page-actions">
        <a href="#/positions/${positionId}/runs" class="btn btn-secondary">← Run History</a>
        <button class="btn btn-primary" disabled title="Prototype: publishing a run is not wired to a backend yet">
          Publish Run ${esc(comparison.right_run_id)} as Official
        </button>
      </div>
    </div>

    <!-- Side-by-side Run Summary Cards -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: var(--space-6);">
      <!-- Left run card -->
      <div class="card" style="margin-bottom: 0; border-left: 4px solid var(--color-primary);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="badge badge-info">RUN-${esc(comparison.left_run_id)} (ROUND ${esc(leftRun?.round ?? "?")}) · CURRENT</span>
          ${leftRun?.finished_at ? `<span style="font-size: 12px; color: var(--color-text-muted);">Completed ${formatDateTime(leftRun.finished_at)}</span>` : ""}
        </div>
        <h2 style="font-size: 17px; font-weight: 700; color: var(--color-text-primary); margin-bottom: 12px;">Revision 1: Docker is ${dockerBaseLabel} (${dockerBaseWeight}%)</h2>
        <div style="display: flex; gap: 24px; padding-top: 12px; border-top: 1px solid var(--color-border-subtle); font-size: 13px;">
          <div>Mandatory Passed: <strong style="color: var(--color-success); font-size: 15px;">${left.passed}</strong> candidates (${left.passedPct}%)</div>
          <div>Below Knockout: <strong style="color: var(--color-danger); font-size: 15px;">${left.failed}</strong> candidates (${left.failedPct}%)</div>
        </div>
      </div>

      <!-- Right run card -->
      <div class="card" style="margin-bottom: 0; border-left: 4px solid var(--color-warning); background: var(--color-warning-bg);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="badge badge-warning">RUN-${esc(comparison.right_run_id)} (ROUND ${esc(rightRun?.round ?? "?")}) · EXPERIMENTAL</span>
          ${rightRun?.finished_at ? `<span style="font-size: 12px; color: var(--color-text-muted);">Completed ${formatDateTime(rightRun.finished_at)}</span>` : ""}
        </div>
        <h2 style="font-size: 17px; font-weight: 700; color: var(--color-warning-text); margin-bottom: 12px;">Revision 2: Docker promoted to ${dockerTargetLabel} (${dockerTargetWeight}%)</h2>
        <div style="display: flex; gap: 24px; padding-top: 12px; border-top: 1px solid var(--color-border-subtle); font-size: 13px;">
          <div>Mandatory Passed: <strong style="color: var(--color-success); font-size: 15px;">${right.passed}</strong> candidates (${right.passedPct}%)</div>
          <div>Below Knockout: <strong style="color: var(--color-danger); font-size: 15px;">${right.failed}</strong> candidates (${right.failedPct}%)</div>
        </div>
      </div>
    </div>

    <!-- Impact Metrics Cards: kept to the two that are actual decisions to
         make before publishing (who now fails, who newly passes). Rank
         volatility and criteria-modified count were dropped as redundant —
         the criteria diff table below already lists what changed. -->
    <div class="stat-grid" style="grid-template-columns: repeat(2, 1fr); margin-bottom: var(--space-6);">
      <div class="stat-card">
        <span class="stat-label">Moved to Failed Group</span>
        <div class="stat-value">${extraComparisonMeta.moved_to_failed} <span class="stat-sub">candidates</span></div>
      </div>
      <div class="stat-card">
        <span class="stat-label">Moved to Passed Group</span>
        <div class="stat-value">${extraComparisonMeta.moved_to_passed} <span class="stat-sub">candidates</span></div>
      </div>
    </div>

    <!-- Criteria Diff Table -->
    <div class="card" style="margin-bottom: var(--space-6);">
      <div class="card-header">
        <h2 class="card-title">Criteria Calibration Between Rounds</h2>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>CRITERION</th>
            <th>ROUND ${esc(leftRun?.round ?? "?")} (RUN ${esc(comparison.left_run_id)})</th>
            <th>ROUND ${esc(rightRun?.round ?? "?")} (RUN ${esc(comparison.right_run_id)})</th>
            <th>WEIGHT CHANGE</th>
            <th>BUSINESS IMPACT</th>
          </tr>
        </thead>
        <tbody>
          ${extraComparisonMeta.criteria_diff.map(d => `
            <tr>
              <td style="font-weight: 700; color: var(--color-text-primary);">${esc(d.label)}</td>
              <td>
                <span class="badge ${d.base_req_type === "mandatory" ? "badge-info" : "badge-muted"}">
                  ${d.base_req_type === "mandatory" ? "Mandatory" : "Preferred"} (${esc(d.base_weight)}%)
                </span>
              </td>
              <td>
                <span class="badge ${d.target_req_type === "mandatory" ? "badge-danger" : "badge-muted"}">
                  ${d.target_req_type === "mandatory" ? "Mandatory" : "Preferred"} (${esc(d.target_weight)}%)
                </span>
              </td>
              <td>
                <span style="font-weight: 700; color: ${parseFloat(d.target_weight) > parseFloat(d.base_weight) ? "var(--color-success)" : "var(--color-danger)"};">
                  ${parseFloat(d.target_weight) > parseFloat(d.base_weight) ? "+" : ""}${(parseFloat(d.target_weight) - parseFloat(d.base_weight)).toFixed(0)}%
                </span>
              </td>
              <td style="font-size: 13px;">
                ${d.criterion_key === "docker" ? `<span style="color: var(--color-danger); font-weight: 600;">Candidates lacking Docker are disqualified immediately</span>` : "Weight rebalanced to maintain 100-point total"}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <!-- Candidate Level Comparison Table -->
    <div class="table-container">
      <div class="table-toolbar">
        <div>
          <div style="font-weight: 700; font-size: 15px; color: var(--color-text-primary);">Key Candidate Volatility Breakdown</div>
          <div style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: 2px;">Direct effects observed after promoting Docker to mandatory</div>
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>CANDIDATE</th>
            <th style="text-align: center;">RANK (R1 → R2)</th>
            <th style="text-align: center;">RANK DELTA</th>
            <th style="text-align: center;">SCORE (R1 → R2)</th>
            <th style="text-align: center;">SCORE DELTA</th>
            <th>MANDATORY STATUS</th>
            <th>ROOT CAUSE EXPLANATION</th>
          </tr>
        </thead>
        <tbody>
          ${comparison.items.length === 0 ? emptyStateRow(7, "No significant candidate-level changes between these two runs.") : comparison.items.map(item => {
            const meta = extraComparisonMeta.candidate_names[item.resume_id] || { name: "Candidate", file: "cv.pdf", reason: "Volatility" };
            return `
              <tr>
                <td>
                  <div style="font-weight: 700; color: var(--color-text-primary); font-size: 14px;">${esc(meta.name)}</div>
                  <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">${esc(meta.file)}</div>
                </td>
                <td style="text-align: center; font-weight: 600;">
                  ${esc(item.left.rank)} → <strong style="font-size: 15px; color: ${(item.rank_delta ?? 0) > 0 ? "var(--color-success)" : "var(--color-danger)"};">${esc(item.right.rank)}</strong>
                </td>
                <td style="text-align: center;">
                  <span class="badge ${(item.rank_delta ?? 0) > 0 ? "badge-success" : "badge-danger"}" style="font-size: 12px;">
                    ${(item.rank_delta ?? 0) > 0 ? `${iconArrowUp()} +${item.rank_delta}` : `${iconArrowDown()} ${item.rank_delta}`}
                  </span>
                </td>
                <td style="text-align: center; font-weight: 600;">
                  ${Math.round(parseFloat(item.left.displayed_total || "0"))} → ${Math.round(parseFloat(item.right.displayed_total || "0"))}
                </td>
                <td style="text-align: center;">
                  <strong style="color: ${parseFloat(item.score_delta || "0") > 0 ? "var(--color-success)" : "var(--color-danger)"};">
                    ${parseFloat(item.score_delta || "0") > 0 ? "+" : ""}${Math.round(parseFloat(item.score_delta || "0"))}
                  </strong>
                </td>
                <td>
                  ${item.left.passed_mandatory && !item.right.passed_mandatory ? `
                    <span class="badge badge-danger">Passed → ${iconX()} Knocked Out</span>
                  ` : `
                    <span class="badge badge-success">${iconCheck()} Maintained Passed</span>
                  `}
                </td>
                <td style="font-size: var(--font-size-xs); color: var(--color-text-secondary); max-width: 320px;">
                  ${esc(meta.reason)}
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function unmount(): void {}

export default { mount, unmount } satisfies ScreenModule;

