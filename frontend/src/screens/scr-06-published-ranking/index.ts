import type { ScreenModule } from "../../router/types.js";
import { ranking, candidateExperienceMeta } from "../../fixtures/scr-06-published-ranking.js";
import { jobList, extraPositionMetadata } from "../../fixtures/scr-01-position-list.js";
import { runList } from "../../fixtures/scr-08-run-history.js";
import { esc, safeId, wireRowLinks, iconMoreHorizontal, formatDateTime, emptyStateRow } from "../../lib/html.js";

type RankingItem = (typeof ranking.items)[number];

// The overflow panel is appended to document.body (a "portal") rather than
// nested inside the row, so .table-container's overflow: hidden — needed
// for its rounded corners — never clips it near the last row.
let openMenu: { panel: HTMLElement; trigger: HTMLElement; close: () => void } | null = null;

function closeOpenMenu(): void {
  if (!openMenu) return;
  openMenu.close();
  openMenu = null;
}

// Colour budget for this screen:
//   neutral - default for every value, including scores and matched skills
//   blue    - the score bar and interactive affordances only
//   green   - exactly one instance (the mandatory-passed summary)
//   red     - blocking facts only: the failed-mandatory count, blocking skill
//             gaps, the knockout label. Never a score, which is a magnitude and
//             not a verdict.
export async function mount(container: HTMLElement, params: Record<string, string>): Promise<void> {
  // From the URL hash, so untrusted. Position ids are opaque, which makes
  // an allowlist stricter and simpler than escaping.
  const positionId = safeId(params.position, ranking.job_id);
  const passing = ranking.items.filter(i => i.passed_mandatory);
  const knockout = ranking.items.filter(i => !i.passed_mandatory);

  const job = jobList.items.find(j => j.id === positionId);
  const meta = extraPositionMetadata[positionId];
  const publishedRun = runList.items.find(r => r.id === ranking.run_id);
  const total = ranking.page.total;
  const passedCount = ranking.eligibility_counts.passed;
  const failedCount = ranking.eligibility_counts.failed;
  const passedPct = total > 0 ? Math.round((passedCount / total) * 100) : 0;
  const failedPct = total > 0 ? Math.round((failedCount / total) * 100) : 0;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Screening Results &amp; Published Ranking</h1>
        <p class="page-desc">
          ${esc(job?.title ?? "Position")}${job?.level ? ` · ${esc(job.level)}` : ""}${meta?.location ? ` · ${esc(meta.location)}` : ""} ·
          ${total} resumes${publishedRun?.published_at ? ` · Published ${formatDateTime(publishedRun.published_at)}` : ""}
        </p>
      </div>
      <div class="page-actions">
        <a href="#/positions/${positionId}/criteria/new-revision" class="btn btn-secondary">Revise criteria &amp; rescore</a>
        <a href="#/positions/${positionId}/runs" class="btn btn-secondary">Run history</a>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <span class="stat-label">Total candidates</span>
        <div class="stat-value">${total} <span class="stat-sub">scored resumes</span></div>
      </div>
      <div class="stat-card">
        <span class="stat-label">Passed mandatory</span>
        <div class="stat-value" style="color: var(--color-success);">${passedCount} <span class="stat-sub">${passedPct}% of ${total}</span></div>
      </div>
      <div class="stat-card">
        <span class="stat-label">Failed mandatory</span>
        <div class="stat-value" style="color: var(--color-danger);">${failedCount} <span class="stat-sub">${failedPct}% of ${total}</span></div>
      </div>
    </div>

    <div class="table-container">
      <div class="table-toolbar">
        <div class="table-filter-group">
          <div class="topbar-search" style="margin-right: var(--space-3);">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input type="text" placeholder="Search candidates, skills..." aria-label="Search candidates" style="width: 220px;" />
          </div>
          <button class="table-filter-btn active">All (${total})</button>
          <button class="table-filter-btn">Passed mandatory (${passedCount})</button>
          <button class="table-filter-btn">Failed mandatory (${failedCount})</button>
          <!-- There is no shortlist fixture data yet — the Shortlist buttons
               below are disabled (§8, item 5.4), so 0 is a true count, not
               a placeholder. -->
          <button class="table-filter-btn">Shortlisted (0)</button>
        </div>

        <label style="display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); color: var(--color-text-secondary);">
          Sort by
          <select class="form-control" style="width: 190px; padding: 6px 10px; font-size: var(--font-size-sm);">
            <option>Match score (high to low)</option>
            <option>Years of experience</option>
          </select>
        </label>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 56px;">Rank</th>
            <th>Candidate</th>
            <th style="width: 120px;">Match score</th>
            <th>Matched &amp; missing skills</th>
            <th style="width: 100px;">Mandatory</th>
            <th style="text-align: right; width: 170px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${ranking.items.length === 0 ? emptyStateRow(6, "No candidates have been scored for this position yet.") : `
            ${passing.map(c => renderRow(c, positionId)).join("")}

            ${passedCount > passing.length ? `
              <tr>
                <td colspan="6" style="background: var(--color-canvas); text-align: center; color: var(--color-text-muted); font-size: var(--font-size-xs); padding: var(--space-3);">
                  ${passedCount - passing.length} more candidates passed mandatory requirements at ranks ${passing.length + 1}-${passedCount}.
                </td>
              </tr>
            ` : ""}

            ${knockout.length > 0 ? `
              <tr class="knockout-row">
                <td colspan="6">
                  <div class="knockout-banner">
                    <strong>Failed mandatory · ${failedCount} candidates</strong>
                    <span>Scores and ranks are preserved and every action stays available. The system ranks, you decide.</span>
                  </div>
                </td>
              </tr>

              ${knockout.map(c => renderRow(c, positionId)).join("")}
            ` : ""}
          `}
        </tbody>
      </table>
    </div>

    <p style="font-size: var(--font-size-xs); color: var(--color-text-muted);">
      Scores are computed deterministically under policy v1. Every criterion links back to verbatim evidence in the original resume.
      <a href="#/positions/${positionId}/criteria" style="color: var(--color-primary); font-weight: 600; margin-left: var(--space-2);">Review criteria</a>
    </p>
  `;

  // The row itself is the affordance for "open this candidate", which removes a
  // third button from every row. Clicks landing on a real control are left to
  // that control.
  wireRowLinks(container);

  container.querySelectorAll<HTMLButtonElement>(".overflow-menu-btn").forEach(trigger => {
    trigger.addEventListener("click", event => {
      event.stopPropagation();
      if (openMenu?.trigger === trigger) {
        closeOpenMenu();
        return;
      }
      closeOpenMenu();
      openMenu = openOverflowMenu(trigger);
    });
  });
}

function openOverflowMenu(trigger: HTMLButtonElement): { panel: HTMLElement; trigger: HTMLElement; close: () => void } {
  const panel = document.createElement("div");
  panel.className = "overflow-menu-panel";
  panel.innerHTML = `<button type="button" class="overflow-menu-item danger" disabled title="Prototype: rejecting a candidate is not wired to a backend yet">Reject candidate</button>`;

  const rect = trigger.getBoundingClientRect();
  panel.style.top = `${rect.bottom + 4}px`;
  panel.style.left = `${rect.right - 140}px`;

  document.body.appendChild(panel);
  trigger.setAttribute("aria-expanded", "true");

  const onOutsideClick = (event: MouseEvent): void => {
    if (event.target === trigger || panel.contains(event.target as Node)) return;
    closeOpenMenu();
  };
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") closeOpenMenu();
  };
  const onScrollOrResize = (): void => closeOpenMenu();

  // Deferred: the triggering click is still bubbling to document when this
  // runs, and an undeferred listener would catch that same click and close
  // the menu the instant it opens.
  setTimeout(() => document.addEventListener("click", onOutsideClick), 0);
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);

  return {
    panel,
    trigger,
    close: () => {
      panel.remove();
      trigger.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onOutsideClick);
      document.removeEventListener("keydown", onKeydown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    },
  };
}

function renderRow(c: RankingItem, positionId: string): string {
  const meta = candidateExperienceMeta[c.result_id] ?? { experience: "—", location: "—" };
  const href = `#/positions/${positionId}/candidates/${safeId(c.result_id, "")}`;
  const score = Math.round(parseFloat(c.displayed_total));

  // A missing skill is rendered in red only when it is the reason the candidate
  // sits below the divider. A missing preferred skill is a neutral fact.
  const blocking = new Set(c.failed_criteria ?? []);
  const blockingGaps = c.missing_skills.filter(s => blocking.has(s));
  const optionalGaps = c.missing_skills.filter(s => !blocking.has(s));

  const matchedChips =
    c.matched_skills.slice(0, 3).map(s => `<span class="badge badge-muted">${esc(s)}</span>`).join("") +
    (c.matched_skills.length > 3 ? `<span class="badge badge-muted">+${c.matched_skills.length - 3}</span>` : "");

  const missingChips =
    blockingGaps.map(s => `<span class="badge badge-danger">${esc(s)}</span>`).join("") +
    optionalGaps.slice(0, 2).map(s => `<span class="badge badge-muted">${esc(s)}</span>`).join("") +
    (optionalGaps.length > 2 ? `<span class="badge badge-muted">+${optionalGaps.length - 2}</span>` : "");

  return `
    <tr class="row-link" tabindex="0" data-href="${href}">
      <td style="font-weight: 600; color: var(--color-text-muted);">${esc(c.rank)}</td>
      <td>
        <a href="${href}" style="font-weight: 600; color: var(--color-text-primary);">${esc(c.candidate_name)}</a>
        <div style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: 2px;">
          ${esc(meta.experience)} · ${esc(meta.location)}
        </div>
      </td>
      <td>
        <div style="font-size: var(--font-size-lg); font-weight: 700; color: var(--color-text-primary);">
          ${score}<span style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-muted);"> / 100</span>
        </div>
        <div class="progress-bar-container" style="height: 3px; width: 88px; margin-top: var(--space-1);">
          <div class="progress-bar-fill" style="width: ${score}%; ${c.passed_mandatory ? "" : "background: var(--color-divider);"}"></div>
        </div>
      </td>
      <td>
        <div class="skill-cell">
          <div class="skill-row"><span class="skill-label">Matched</span>${matchedChips}</div>
          ${missingChips ? `<div class="skill-row"><span class="skill-label">Missing</span>${missingChips}</div>` : ""}
        </div>
      </td>
      <td>
        ${c.passed_mandatory
          ? `<span style="font-size: var(--font-size-sm); color: var(--color-text-muted);">Passed</span>`
          : `<span class="badge badge-danger">Failed</span>`}
      </td>
      <td style="text-align: right;">
        <div style="display: inline-flex; gap: var(--space-2); align-items: center;">
          <button class="btn btn-secondary btn-sm" disabled title="Prototype: shortlisting a candidate is not wired to a backend yet">Shortlist</button>
          <button class="overflow-menu-btn" data-result-id="${esc(c.result_id)}" aria-label="More actions" aria-haspopup="true" aria-expanded="false">
            ${iconMoreHorizontal()}
          </button>
        </div>
      </td>
    </tr>
  `;
}

export function unmount(): void {
  closeOpenMenu();
}

export default { mount, unmount } satisfies ScreenModule;
