import type { ScreenModule } from "../../router/types.js";
import { jobList, extraPositionMetadata } from "../../fixtures/scr-01-position-list.js";
import { esc, safeId, wireRowLinks, emptyStateRow } from "../../lib/html.js";

export async function mount(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Job Positions & CV Screening</h1>
        <p class="page-desc">Select a job position to review screening criteria and evaluate candidate resumes.</p>
      </div>
      <div class="page-actions">
        <a href="#/positions/new" class="btn btn-primary">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          Create Position
        </a>
      </div>
    </div>

    <div class="table-container">
      <div class="table-toolbar">
        <div class="table-filter-group">
          <div class="topbar-search" style="margin-right: 12px;">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input type="text" id="position-search-input" placeholder="Search by title, location..." style="width: 260px;" />
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text-secondary);">
            <span>Status:</span>
            <select id="status-filter" class="form-control" style="width: 120px; padding: 6px 10px; font-size: 13px;">
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>JOB POSITION</th>
            <th style="text-align: center;">RECEIVED CVS</th>
            <th style="text-align: center;">IN SHORTLIST</th>
            <th>STATUS</th>
            <th>LAST SCREENED</th>
            <th style="text-align: right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${jobList.items.length === 0 ? emptyStateRow(
            6,
            "No job positions yet.",
            '<a href="#/positions/new" class="btn btn-primary btn-sm">Create Position</a>'
          ) : jobList.items.map(job => {
            const meta = extraPositionMetadata[job.id] || { location: "Hanoi", shortlist_count: 0, last_screened: "Not screened yet" };
            const isActive = meta.is_active_screening;
            const hasPublished = Boolean(job.published_run_id);
            const jobId = safeId(job.id, "");
            const rowHref = hasPublished ? `#/positions/${jobId}/ranking` : `#/positions/${jobId}/criteria`;
            return `
              <tr class="row-link" tabindex="0" data-href="${rowHref}">
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <a href="#/positions/${jobId}/ranking" style="font-weight: 600; color: var(--color-text-primary); font-size: 14px;">${esc(job.title)}</a>
                    <span class="badge badge-muted">${esc(job.level || "—")}</span>
                  </div>
                  <div style="font-size: 12px; color: var(--color-text-muted); margin-top: 2px;">
                    ${esc(meta.location)}${isActive ? " · Active screening position" : ""}
                  </div>
                </td>
                <td style="text-align: center; font-weight: 700; font-size: 15px; color: var(--color-text-primary);">${job.ready_cv_count}</td>
                <td style="text-align: center; font-weight: 700; font-size: 15px; color: var(--color-primary);">${meta.shortlist_count}</td>
                <td>
                  <span class="badge ${job.status === "open" ? "badge-success" : "badge-warning"}">
                    ${job.status === "open" ? "Open" : "Draft"}
                  </span>
                </td>
                <td style="color: var(--color-text-muted); font-size: 13px;">${esc(meta.last_screened)}</td>
                <td style="text-align: right;">
                  ${hasPublished
                    ? `<a href="#/positions/${jobId}/ranking" class="btn btn-primary btn-sm">View Results (${esc(job.ready_cv_count)} CVs) →</a>`
                    : `<a href="#/positions/${jobId}/criteria" class="btn btn-secondary btn-sm">Start Screening</a>`
                  }
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  wireRowLinks(container);
}

export function unmount(): void {}

export default { mount, unmount } satisfies ScreenModule;
