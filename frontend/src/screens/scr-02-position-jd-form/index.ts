import type { ScreenModule } from "../../router/types.js";
import { job } from "../../fixtures/scr-02-position-jd-form.js";
import { esc, safeId } from "../../lib/html.js";

export async function mount(container: HTMLElement, params: Record<string, string>): Promise<void> {
  const isEdit = Boolean(params.position);
  const positionId = safeId(params.position, job.id);
  const currentTitle = isEdit ? job.title : "";
  const currentLevel = isEdit ? job.level : "Senior";
  const currentJd = isEdit ? job.jd_raw_text : "";

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">${isEdit ? "Edit Position & Job Description" : "Create New Job Position"}</h1>
        <p class="page-desc">Enter position metadata and original job description text for AI-assisted criteria extraction.</p>
      </div>
      <div class="page-actions">
        <a href="#/positions" class="btn btn-secondary">Cancel</a>
        <button id="save-btn" class="btn btn-primary">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          Save and Review Criteria →
        </button>
      </div>
    </div>

    <div class="card" style="max-width: 900px;">
      <div class="card-header">
        <h2 class="card-title">Job Position Information</h2>
      </div>

      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-4);">
        <div class="form-group">
          <label class="form-label" for="job-title">Position Title <span style="color: var(--color-danger);">*</span></label>
          <input type="text" id="job-title" class="form-control" placeholder="e.g. Senior Backend Developer" value="${esc(currentTitle)}" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="job-level">Experience Level</label>
          <select id="job-level" class="form-control">
            <option value="Junior" ${currentLevel === "Junior" ? "selected" : ""}>Junior</option>
            <option value="Middle" ${currentLevel === "Middle" ? "selected" : ""}>Middle</option>
            <option value="Senior" ${currentLevel === "Senior" ? "selected" : ""}>Senior</option>
            <option value="Lead" ${currentLevel === "Lead" ? "selected" : ""}>Lead / Principal</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="job-location">Location</label>
        <input type="text" id="job-location" class="form-control" placeholder="e.g. Hanoi / Hybrid" value="Hanoi" />
      </div>

      <div class="form-group" style="margin-top: var(--space-5);">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-2);">
          <label class="form-label" for="job-jd" style="margin-bottom: 0;">Original Job Description (JD) <span style="color: var(--color-danger);">*</span></label>
          <span style="font-size: 12px; color: var(--color-text-muted);">AI will automatically extract measurable screening criteria</span>
        </div>
        <textarea id="job-jd" class="form-control" style="min-height: 280px; font-size: var(--font-size-sm);" placeholder="Paste the complete job description text (Responsibilities, requirements, preferred qualifications...)...">${esc(currentJd)}</textarea>
      </div>

      <div class="callout callout-info">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <div>
          <strong>Notice:</strong> This original JD text will be preserved as immutable source evidence. Future edits create a new draft and will not retroactively alter completed screening runs.
        </div>
      </div>
    </div>
  `;

  const saveBtn = container.querySelector("#save-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      window.location.hash = `#/positions/${positionId}/criteria`;
    });
  }
}

export function unmount(): void {}

export default { mount, unmount } satisfies ScreenModule;
