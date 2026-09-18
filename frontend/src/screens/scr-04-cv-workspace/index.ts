import type { ScreenModule } from "../../router/types.js";
import { resumeList, extraCandidateMeta, resumeStatusCounts } from "../../fixtures/scr-04-cv-workspace.js";
import { jobList } from "../../fixtures/scr-01-position-list.js";
import { esc, safeId, iconCheck, iconX, iconWarning, formatDateTime, emptyStateRow } from "../../lib/html.js";

export async function mount(container: HTMLElement, params: Record<string, string>): Promise<void> {
  const positionId = safeId(params.position, resumeList.items[0]?.job_id ?? "1");
  const job = jobList.items.find(j => j.id === positionId);
  const totalFiles = resumeList.page.total;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Candidate CV Workspace</h1>
        <p class="page-desc">${esc(job?.title ?? "Position")} · Upload & manage ${totalFiles} candidate resume files</p>
      </div>
    </div>

    <!-- Upload bar: files are already in, so this stays a slim strip rather than a full dropzone -->
    <div class="card" style="display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; margin-bottom: var(--space-6);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 32px; height: 32px; border-radius: var(--radius-full); background: var(--color-primary-light); color: var(--color-primary); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
        </div>
        <div>
          <div style="font-weight: 600; font-size: var(--font-size-sm); color: var(--color-text-primary);">${totalFiles} files uploaded</div>
          <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">PDF and DOCX, up to 10 MB per file</div>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" disabled title="Prototype: file upload is not wired to a backend yet">Add files</button>
    </div>

    <!-- CV Table List -->
    <div class="table-container">
      <div class="table-toolbar">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 700; font-size: var(--font-size-md); color: var(--color-text-primary);">Selected CVs</span>
          <span class="badge badge-info">${totalFiles} files total</span>
        </div>
        <div class="table-filter-group" id="cv-filter-tabs">
          <button class="table-filter-btn" data-filter="failed">${iconX()} Failed (${resumeStatusCounts.failed})</button>
          <button class="table-filter-btn" data-filter="duplicate">${iconWarning()} Duplicate (${resumeStatusCounts.duplicate})</button>
          <button class="table-filter-btn active" data-filter="all">All (${totalFiles})</button>
          <button class="table-filter-btn" data-filter="parsed">${iconCheck()} Parsed (${resumeStatusCounts.parsed})</button>
          <button class="table-filter-btn" data-filter="parsing">Parsing (${resumeStatusCounts.parsing})</button>
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 50px;">#</th>
            <th>FILE NAME</th>
            <th>CANDIDATE</th>
            <th>UPLOAD TIME</th>
            <th>PARSING STATUS</th>
          </tr>
        </thead>
        <tbody>
          ${resumeList.items.length === 0 ? emptyStateRow(5, "No candidate resumes uploaded yet.") : resumeList.items.map((cv, idx) => {
            const meta = extraCandidateMeta[cv.id] || { candidate_name: "Candidate" };
            return `
              <tr>
                <td style="color: var(--color-text-muted); font-weight: 500;">${idx + 1}</td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <svg width="18" height="18" fill="none" stroke="var(--color-text-muted)" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                    <span style="font-weight: 600; color: var(--color-text-primary);">${esc(cv.file_name)}</span>
                  </div>
                </td>
                <td style="font-weight: 500;">${esc(meta.candidate_name)}</td>
                <td style="color: var(--color-text-muted); font-size: var(--font-size-sm);">${formatDateTime(cv.created_at)}</td>
                <td>
                  ${cv.status === "parsed" && !meta.is_duplicate ? `
                    <span class="badge badge-success">${iconCheck()} Parsed</span>
                  ` : ""}

                  ${cv.status === "parsing" ? `
                    <div>
                      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span class="badge badge-info">Parsing</span>
                        <div class="progress-bar-container" style="width: 100px; height: 6px;">
                          <div class="progress-bar-fill" style="width: ${meta.parse_progress || 64}%;"></div>
                        </div>
                        <span style="font-size: var(--font-size-xs); font-weight: 600; color: var(--color-primary);">${meta.parse_progress || 64}%</span>
                      </div>
                      <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">Extracting skills and structural entity mapping</div>
                    </div>
                  ` : ""}

                  ${meta.is_duplicate ? `
                    <div>
                      <span class="badge badge-warning">${iconWarning()} Duplicate</span>
                      <div style="font-size: var(--font-size-xs); color: var(--color-warning-text); margin-top: 3px;">${esc(meta.duplicate_note)}</div>
                    </div>
                  ` : ""}

                  ${cv.status === "parse_failed" ? `
                    <div>
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="badge badge-danger">${iconX()} Parse Failed</span>
                        <button class="btn btn-ghost btn-sm" style="padding: 2px 8px; font-size: var(--font-size-xs);" disabled title="Prototype: retrying a parse job is not wired to a backend yet">Retry</button>
                      </div>
                      <div style="font-size: var(--font-size-xs); color: var(--color-danger); margin-top: 3px;">${esc(meta.error_message)}</div>
                    </div>
                  ` : ""}
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>

      <div style="padding: 14px 20px; background: var(--color-canvas); border-top: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; font-size: var(--font-size-sm);">
        <div style="color: var(--color-text-secondary); display: flex; gap: 16px;">
          <span><strong>${totalFiles}</strong> CVs ready for screening</span>
          <span style="color: var(--color-warning-text);">• ${resumeStatusCounts.duplicate} duplicate (merged)</span>
          <span style="color: var(--color-danger);">• ${resumeStatusCounts.failed} requires external OCR</span>
        </div>
        <a href="#/positions/${positionId}/screening-runs/31" class="btn btn-primary">Start AI Screening (${totalFiles} CVs) →</a>
      </div>
    </div>
  `;
}

export function unmount(): void {}

export default { mount, unmount } satisfies ScreenModule;
