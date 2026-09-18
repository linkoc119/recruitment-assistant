import type { ScreenModule } from "../../router/types.js";
import { runList } from "../../fixtures/scr-08-run-history.js";
import { jobList } from "../../fixtures/scr-01-position-list.js";
import { esc, safeId, iconCheck, wireRowLinks, emptyStateRow } from "../../lib/html.js";

export async function mount(container: HTMLElement, params: Record<string, string>): Promise<void> {
  const positionId = safeId(params.position, runList.items[0]?.job_id ?? "1");
  const job = jobList.items.find(j => j.id === positionId);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Screening Run History</h1>
        <p class="page-desc">${esc(job?.title ?? "Position")} · Audit immutability across criteria revisions and screening rounds</p>
      </div>
      <div class="page-actions">
        <a href="#/positions/${positionId}/criteria/new-revision" class="btn btn-secondary">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          New Criteria Revision
        </a>
        <a href="#/positions/${positionId}/comparison" class="btn btn-primary" id="btn-compare-runs">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
          <span id="btn-compare-runs-label">Compare 2 Runs →</span>
        </a>
      </div>
    </div>

    <!-- Run Table -->
    <div class="table-container">
      <div class="table-toolbar">
        <div style="font-weight: 700; font-size: 15px; color: var(--color-text-primary);">Screening Runs</div>
        <div style="font-size: 13px; color: var(--color-text-muted);" id="run-select-hint">Select two runs to compare candidate ranking volatility</div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">SELECT</th>
            <th>RUN ID</th>
            <th>ROUND</th>
            <th>RUN TYPE</th>
            <th>CRITERIA REVISION</th>
            <th>COMPLETED AT</th>
            <th>OUTCOME</th>
            <th>STATUS</th>
            <th style="text-align: right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${runList.items.length === 0 ? emptyStateRow(9, "No screening runs yet for this position.") : runList.items.map(r => `
            <tr class="row-link" tabindex="0" data-href="#/positions/${positionId}/ranking">
              <td style="text-align: center;">
                <input type="checkbox" class="run-select-checkbox" data-run-id="${esc(r.id)}" checked style="width: 16px; height: 16px; accent-color: var(--color-primary); cursor: pointer;" />
              </td>
              <td style="font-weight: 700; font-family: monospace; color: var(--color-primary);">RUN-${esc(r.id)}</td>
              <td style="font-weight: 600;">Round ${esc(r.round)}</td>
              <td>
                <span class="badge ${r.mode === "initial" ? "badge-info" : "badge-warning"}">
                  ${r.mode === "initial" ? "Initial Screening" : "Rescore"}
                </span>
              </td>
              <td>
                <a href="#/positions/${positionId}/criteria/${safeId(String(r.criteria_revision), "1")}" style="color: var(--color-primary); font-weight: 600;">
                  Revision ${esc(r.criteria_revision)}
                </a>
              </td>
              <td style="color: var(--color-text-muted); font-size: 13px;">${r.finished_at ? esc(new Date(r.finished_at).toLocaleString("en-US")) : "—"}</td>
              <td>
                <span style="font-weight: 600; color: var(--color-success);">${esc(r.counts.succeeded)} / ${esc(r.counts.total)}</span> resumes scored
              </td>
              <td>
                ${r.is_current ? `
                  <span class="badge badge-success">${iconCheck()} Published</span>
                ` : `
                  <span class="badge badge-muted">Archived</span>
                `}
              </td>
              <td style="text-align: right;">
                <a href="#/positions/${positionId}/ranking" class="btn btn-secondary btn-sm">View Results</a>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  // "Compare 2 runs" only makes sense with exactly 2 selected. Selecting a
  // 3rd is blocked rather than silently swapping one out, since which one
  // to drop is the user's call, not ours.
  const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>(".run-select-checkbox"));
  const compareLink = container.querySelector<HTMLAnchorElement>("#btn-compare-runs");
  const compareLabel = container.querySelector("#btn-compare-runs-label");
  const hint = container.querySelector("#run-select-hint");

  function updateSelectionState(): void {
    const checked = checkboxes.filter(cb => cb.checked);
    checkboxes.forEach(cb => {
      cb.disabled = !cb.checked && checked.length >= 2;
    });
    if (compareLink) {
      const ready = checked.length === 2;
      compareLink.style.pointerEvents = ready ? "" : "none";
      compareLink.style.opacity = ready ? "" : "0.5";
      compareLink.setAttribute("aria-disabled", ready ? "false" : "true");
    }
    if (compareLabel) {
      compareLabel.textContent = checked.length === 2
        ? `Compare 2 Runs (Run ${checked[0].dataset.runId} vs Run ${checked[1].dataset.runId}) →`
        : "Compare 2 Runs →";
    }
    if (hint) {
      hint.textContent = checked.length === 2
        ? "2 runs selected — ready to compare"
        : `Select two runs to compare candidate ranking volatility (${checked.length}/2 selected)`;
    }
  }

  checkboxes.forEach(cb => cb.addEventListener("change", updateSelectionState));
  updateSelectionState();
  wireRowLinks(container);
}

export function unmount(): void {}

export default { mount, unmount } satisfies ScreenModule;
