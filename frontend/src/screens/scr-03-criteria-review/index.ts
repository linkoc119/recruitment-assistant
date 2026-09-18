import type { ScreenModule } from "../../router/types.js";
import { criteriaDraft } from "../../fixtures/scr-03-criteria-review.js";
import { criteriaRevision } from "../../fixtures/scr-09-criteria-revision.js";
import { jobList } from "../../fixtures/scr-01-position-list.js";
import { esc, safeId, iconWarning } from "../../lib/html.js";

// Merged per docs/ui-ux/ui-improvement-plan.md §5.3: SCR-03 (JD & Criteria
// Review) and SCR-09 (Criteria Revision & Rescore) were two screens editing
// the same criteria list. They are now one "JD & Criteria" workspace with
// three modes keyed off the route, because a single component can't be
// unconditionally editable: revisions are immutable once approved.
//   - no revision param      -> editable current/draft criteria ("Revision 1"),
//                                reached from the sidebar; leads to CV selection.
//   - revision === "new-revision" -> editable, starts from the last approved
//                                weights; leads to rescoring (a new run).
//   - any other revision id  -> read-only snapshot of that approved revision,
//                                reached from History's audit trail links.
type Mode = "draft" | "new-revision" | "historical";
type CriterionItem = (typeof criteriaDraft.criteria)[number];

function resolveMode(revisionParam: string | undefined): Mode {
  if (!revisionParam) return "draft";
  if (revisionParam === "new-revision") return "new-revision";
  return "historical";
}

function cloneCriteria(items: CriterionItem[]): CriterionItem[] {
  return JSON.parse(JSON.stringify(items));
}

export async function mount(container: HTMLElement, params: Record<string, string>): Promise<void> {
  const positionId = safeId(params.position, criteriaDraft.job_id);
  const job = jobList.items.find(j => j.id === positionId) ?? jobList.items[0];
  const mode = resolveMode(params.revision);

  // The JD text itself is never re-snapshotted per revision, so it always
  // comes from the draft, not the (possibly truncated) revision snapshot.
  const jdUpdatedAt = new Date(criteriaDraft.updated_at).toLocaleString("en-US");

  let criteria: CriterionItem[] =
    mode === "draft" ? cloneCriteria(criteriaDraft.criteria) : cloneCriteria(criteriaRevision.criteria);

  function calculateTotal(): number {
    return criteria.reduce((sum, c) => sum + Math.round(parseFloat(c.weight)), 0);
  }

  function renderJdPane(): string {
    return `
      <div class="pane">
        <div class="pane-header">
          <div style="font-size: 11px; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">ORIGINAL JOB DESCRIPTION</div>
          <h2 style="font-size: 18px; font-weight: 700; color: var(--color-text-primary);">${esc(job.title)}</h2>
          <div style="font-size: 12px; color: var(--color-text-muted); margin-top: 2px;">${esc(job.level ?? "—")} · Updated ${esc(jdUpdatedAt)}</div>
        </div>

        <div style="font-size: var(--font-size-sm); line-height: 1.7; color: var(--color-text-secondary); white-space: pre-line;">
          We are seeking a <strong>Senior Backend Developer</strong> to join our core payment platform team, responsible for designing, optimizing, and operating high-throughput distributed microservices.

          <strong>Key Responsibilities & Mandatory Requirements</strong>
          <strong>Proficient in Python</strong> with deep hands-on production experience in <strong>FastAPI</strong>. Solid foundation in <strong>SQL</strong>, relational database schema design, and query performance tuning. Proven ability to design clean, well-documented <strong>REST APIs</strong> for multi-team service integration. Minimum <strong>2 years of professional backend engineering experience</strong>.

          <strong>Preferred Qualifications</strong>
          Experience with application containerization and automated deployments using <strong>Docker</strong>; hands-on experience with AWS cloud infrastructure <strong>(EC2, S3, RDS)</strong>; strong expertise in <strong>PostgreSQL</strong> for high-scale systems; practical experience with <strong>Redis</strong> for caching and background task queues.
        </div>

        ${mode === "draft" ? `
          <div class="callout callout-success">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <div>
              <strong>AI Assistant Note:</strong> Successfully extracted <strong>${criteriaDraft.criteria.length} measurable criteria</strong> from this job description. Review the criteria structure and weights on the right.
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderStaticCriteriaColumn(): string {
    const mandatory = criteria.filter(c => c.req_type === "mandatory");
    const preferred = criteria.filter(c => c.req_type === "preferred");
    const total = calculateTotal();
    return `
      <div class="card" style="margin-bottom: var(--space-4); border: 1.5px solid var(--color-primary-border);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-size: var(--font-size-base); font-weight: 700; color: var(--color-primary-hover);">Mandatory Requirements</div>
          <span class="badge badge-info" style="font-size: 11px;">Knockout Rules</span>
        </div>
        <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: var(--space-3); line-height: 1.4;">
          Missing any criterion in this group will place the candidate below the knockout divider line (unmet mandatory criteria).
        </p>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${mandatory.map(c => `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
              <div style="flex: 1;">
                <div style="font-weight: 600; font-size: var(--font-size-sm); color: var(--color-text-primary);">${esc(c.label)}</div>
                <div style="font-size: 11px; color: var(--color-text-muted);">${c.kind === "experience" ? `Experience · min ${esc(c.min_years)} years` : "Skill"}</div>
              </div>
              <div style="display: flex; align-items: center; gap: 12px; width: 180px;">
                <div class="progress-bar-container" style="height: 6px;">
                  <div class="progress-bar-fill" style="width: ${Math.round(parseFloat(c.weight))}%;"></div>
                </div>
                <span style="font-weight: 700; font-size: 13px; color: var(--color-primary); width: 36px; text-align: right;">${Math.round(parseFloat(c.weight))}%</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="card" style="border: 1px solid var(--color-border);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-size: 14px; font-weight: 700; color: var(--color-text-primary);">Preferred Qualifications</div>
          <span class="badge badge-muted" style="font-size: 11px;">Bonus Points</span>
        </div>
        <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: var(--space-3); line-height: 1.4;">
          Missing preferred items deducts proportional points, but does not knock the candidate out.
        </p>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${preferred.map(c => `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
              <div style="flex: 1;">
                <div style="font-weight: 600; font-size: var(--font-size-sm); color: var(--color-text-primary);">${esc(c.label)}</div>
                <div style="font-size: 11px; color: var(--color-text-muted);">Preferred Skill</div>
              </div>
              <div style="display: flex; align-items: center; gap: 12px; width: 180px;">
                <div class="progress-bar-container" style="height: 6px;">
                  <div class="progress-bar-fill" style="width: ${Math.round(parseFloat(c.weight))}%; background: var(--color-text-muted);"></div>
                </div>
                <span style="font-weight: 700; font-size: 13px; color: var(--color-text-secondary); width: 36px; text-align: right;">${Math.round(parseFloat(c.weight))}%</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--color-canvas); border: 1px solid var(--color-border); border-radius: var(--radius-md); margin-top: var(--space-4);">
        <div style="font-size: 13px; font-weight: 600; color: var(--color-text-secondary);">Total: ${criteria.length} criteria</div>
        <div style="font-size: 14px; font-weight: 700; color: var(--color-success); display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
          Total Weight: ${total} / 100 (Valid)
        </div>
      </div>
    `;
  }

  function renderEditableTable(): string {
    const total = calculateTotal();
    const isBalanced = total === 100;
    return `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 260px;">RECRUITMENT CRITERION</th>
              <th style="width: 200px;">REQUIREMENT TYPE</th>
              <th>SCORE WEIGHT</th>
              <th style="width: 140px;">EXPERIENCE</th>
              <th style="text-align: right; width: 80px;">REMOVE</th>
            </tr>
          </thead>
          <tbody>
            ${criteria.map((c, idx) => {
              const weightVal = Math.round(parseFloat(c.weight));
              return `
                <tr>
                  <td style="font-weight: 600; color: var(--color-text-primary); font-size: 14px;">${esc(c.label)}</td>
                  <td>
                    <select class="form-control select-req-type" data-idx="${idx}" style="padding: 6px 10px; font-size: 13px;">
                      <option value="mandatory" ${c.req_type === "mandatory" ? "selected" : ""}>Mandatory (Knockout)</option>
                      <option value="preferred" ${c.req_type === "preferred" ? "selected" : ""}>Preferred (Bonus)</option>
                    </select>
                  </td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 14px;">
                      <input
                        type="range"
                        min="0"
                        max="40"
                        value="${weightVal}"
                        class="slider-weight"
                        data-idx="${idx}"
                        style="flex: 1; accent-color: var(--color-primary); cursor: pointer;"
                      />
                      <span style="font-weight: 700; font-size: 14px; width: 32px; text-align: right; color: var(--color-primary);">
                        ${weightVal}
                      </span>
                    </div>
                  </td>
                  <td style="font-size: var(--font-size-xs); color: var(--color-text-muted);">
                    ${c.kind === "experience" ? `≥ ${esc(c.min_years)} yrs` : "—"}
                  </td>
                  <td style="text-align: right;">
                    <button class="btn btn-ghost btn-sm btn-remove-criterion" data-idx="${idx}" style="padding: 4px 8px;">
                      Remove
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>

        <div style="padding: 16px 20px; background: var(--color-canvas); border-top: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 20px;">
            <div style="font-size: 14px;">
              Total Weight: <strong style="font-size: 18px; color: ${isBalanced ? "var(--color-success)" : "var(--color-danger)"};">${total}</strong> / 100
            </div>
            ${isBalanced ? "" : `
              <span style="color: var(--color-danger); font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 4px;">
                ${iconWarning()} Adjust weights to equal exactly 100
              </span>
            `}
          </div>

          <div style="display: flex; gap: 10px;">
            <button id="btn-reset" class="btn btn-secondary">Reset Changes</button>
            ${mode === "draft" ? `
              <a href="#/positions/${positionId}/cv-workspace" class="btn btn-primary" style="${isBalanced ? "" : "pointer-events: none; opacity: 0.6;"}">
                Continue to Select CVs (${esc(job.ready_cv_count)} Files) →
              </a>
            ` : `
              <a href="#/positions/${positionId}/comparison" class="btn btn-primary" style="${isBalanced ? "" : "pointer-events: none; opacity: 0.6;"}">
                Rescore ${esc(job.ready_cv_count)} Resumes (Create New Run) →
              </a>
            `}
          </div>
        </div>
      </div>
    `;
  }

  function render(): void {
    const headerTitle =
      mode === "draft" ? "JD & Screening Criteria" :
      mode === "new-revision" ? "JD & Screening Criteria — New Revision" :
      `JD & Screening Criteria — Revision ${esc(criteriaRevision.revision)} (Historical)`;

    const headerDesc =
      mode === "draft" ? `${esc(job.title)} · ${esc(job.level ?? "—")} · ${criteria.length} standardized criteria extracted from JD` :
      mode === "new-revision" ? "Adjust weights or requirement types below, then rescore to create a new run." :
      `Read-only snapshot approved ${esc(new Date(criteriaRevision.approved_at ?? "").toLocaleString("en-US"))}. Historical revisions cannot be edited.`;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${esc(headerTitle)}</h1>
          <p class="page-desc">${headerDesc}</p>
        </div>
        ${mode !== "draft" ? `
          <div class="page-actions">
            <a href="#/positions/${positionId}/criteria" class="btn btn-secondary">← Back to current criteria</a>
          </div>
        ` : ""}
      </div>

      <div class="split-view">
        ${renderJdPane()}
        <div>
          ${mode === "historical" ? renderStaticCriteriaColumn() : renderEditableTable()}
        </div>
      </div>
    `;

    if (mode !== "historical") {
      container.querySelectorAll(".slider-weight").forEach(slider => {
        slider.addEventListener("input", (e) => {
          const target = e.target as HTMLInputElement;
          const idx = parseInt(target.getAttribute("data-idx") || "0", 10);
          criteria[idx].weight = target.value;
          render();
        });
      });

      container.querySelectorAll(".select-req-type").forEach(sel => {
        sel.addEventListener("change", (e) => {
          const target = e.target as HTMLSelectElement;
          const idx = parseInt(target.getAttribute("data-idx") || "0", 10);
          criteria[idx].req_type = target.value as CriterionItem["req_type"];
          render();
        });
      });

      container.querySelectorAll(".btn-remove-criterion").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-idx") || "0", 10);
          criteria.splice(idx, 1);
          render();
        });
      });

      const resetBtn = container.querySelector("#btn-reset");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          criteria = mode === "draft" ? cloneCriteria(criteriaDraft.criteria) : cloneCriteria(criteriaRevision.criteria);
          render();
        });
      }
    }
  }

  render();
}

export function unmount(): void {}

export default { mount, unmount } satisfies ScreenModule;
