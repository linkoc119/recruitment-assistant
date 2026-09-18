import type { ScreenModule } from "../../router/types.js";
import { run } from "../../fixtures/scr-05-screening-run.js";
import { esc, safeId } from "../../lib/html.js";

// This screen is a transient state of Candidates -> Ranking (see
// docs/ui-ux/ui-improvement-plan.md §5.2), not a destination with its own
// nav item. It answers one question — "is screening done yet" — so it
// keeps only what that question needs: status, count, and the one action
// that follows (go see the ranking). The demo simulate/reset controls, the
// duplicate results summary (already on SCR-06) and the step checklist
// (nobody acts on five ticks) were cut per §4 (Phase 1).
let redirectTimer: ReturnType<typeof setTimeout> | null = null;

export async function mount(container: HTMLElement, params: Record<string, string>): Promise<void> {
  const positionId = safeId(params.position, run.job_id);
  const isDone = run.status === "completed";
  const total = run.counts.total;
  const done = run.counts.succeeded + run.counts.failed;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">AI Screening</h1>
        <p class="page-desc">Round ${esc(run.round)} · Analyzing ${esc(total)} candidate resumes</p>
      </div>
    </div>

    <div class="card" style="max-width: 640px; padding: var(--space-6);">
      <span class="badge ${isDone ? "badge-success" : "badge-info"}">
        ${isDone ? "Completed" : "In progress"}
      </span>

      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: var(--space-4); margin-bottom: 8px;">
        <div style="font-size: 38px; font-weight: 700; color: var(--color-text-primary); letter-spacing: -0.5px;">
          ${esc(done)} <span style="font-size: 20px; font-weight: 500; color: var(--color-text-muted);">/ ${esc(total)} CVs</span>
        </div>
        <div style="font-size: 30px; font-weight: 700; color: var(--color-text-primary);">
          ${percent}%
        </div>
      </div>

      <p style="font-size: 13px; color: var(--color-text-muted); margin-bottom: var(--space-5);">
        ${isDone ? `Every resume is evaluated deterministically against the approved criteria under policy ${esc(run.policy_version)}. Redirecting to results…` : "Extracting resume data and scoring against the approved criteria."}
      </p>

      <div class="progress-bar-container" style="height: 8px;">
        <div class="progress-bar-fill ${isDone ? "fill-success" : ""}" style="width: ${percent}%;"></div>
      </div>

      <div style="margin-top: var(--space-6); padding-top: var(--space-5); border-top: 1px solid var(--color-border);">
        <a href="#/positions/${positionId}/ranking" class="btn btn-primary btn-lg" style="width: 100%; text-align: center;">
          ${isDone ? "View screening results & ranking →" : "View results so far →"}
        </a>
      </div>
    </div>
  `;

  if (isDone) {
    redirectTimer = setTimeout(() => {
      window.location.hash = `#/positions/${positionId}/ranking`;
    }, 1500);
  }
}

export function unmount(): void {
  if (redirectTimer !== null) {
    clearTimeout(redirectTimer);
    redirectTimer = null;
  }
}

export default { mount, unmount } satisfies ScreenModule;
