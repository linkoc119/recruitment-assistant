import { getJob, type Model } from "../lib/api.js";
import { esc } from "../lib/html.js";

export interface NavItem {
  id: string;
  label: string;
  // Path after "/positions/{id}", e.g. "/criteria". "" means the item does
  // not live under a position at all (Job Positions itself).
  suffix: string;
  icon: string;
  section?: string;
}

// Five items, matching docs/ui-ux/ui-improvement-plan.md §5.1. Screening
// Progress, Candidate Detail, Criteria Revision and Run Comparison were
// removed: each is a state or an action reached from one of these five,
// never a place to navigate to directly.
const navItems: NavItem[] = [
  {
    id: "positions",
    label: "Job Positions",
    suffix: "",
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>`
  },
  {
    id: "criteria",
    label: "JD & Criteria",
    suffix: "/criteria",
    section: "POSITION WORKSPACE",
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`
  },
  {
    id: "cvs",
    label: "Candidates",
    suffix: "/cv-workspace",
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>`
  },
  {
    id: "ranking",
    label: "Results & Ranking",
    suffix: "/ranking",
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>`
  },
  {
    id: "runs",
    label: "History",
    suffix: "/runs",
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
  }
];

const DEFAULT_POSITION_ID = "";
let selectedJob: Model<"Job"> | undefined;
let requestController: AbortController | undefined;

/**
 * Route params carry the real position id; "/positions" itself has none.
 * The capture is restricted to the same safe id charset the router itself
 * decodes into params (see lib/html.ts safeId) rather than "anything up to
 * the next slash" — this value flows straight into href attributes below.
 */
function resolvePositionId(currentPath: string): string {
  const match = /^\/positions\/([1-9][0-9]*)(?:\/|$)/.exec(currentPath);
  return match ? match[1] : DEFAULT_POSITION_ID;
}

function resolvePositionJob(positionId: string) {
  return selectedJob?.id === positionId ? selectedJob : undefined;
}

export function mountShell(sidebarEl: HTMLElement, topbarEl: HTMLElement): void {
  // Render Sidebar (Vertical Dark Sidebar)
  sidebarEl.innerHTML = `
    <div class="sidebar-brand">
      <div class="sidebar-logo-icon">AI</div>
      <div class="sidebar-brand-text">
        <h1>Recruitment Assistant</h1>
        <p>Hiring • Internal</p>
      </div>
    </div>
    <nav class="sidebar-nav" id="sidebar-nav-container">
      ${renderNavItems("/positions")}
    </nav>
    <div class="sidebar-footer" id="sidebar-footer-container">
      ${renderContextCard(DEFAULT_POSITION_ID)}
    </div>
  `;

  // Render Topbar. No search, notification or user menu here: global search
  // is out of scope (see docs/ui-ux/README.md Excluded), there is no
  // notification system to back the bell, and auth/RBAC is also out of
  // scope, so the account chip named a fixed user with nothing behind it.
  topbarEl.innerHTML = `
    <div class="topbar-breadcrumb" id="topbar-breadcrumb">
      ${getBreadcrumbHtml("/positions")}
    </div>
  `;
}

function renderNavItems(currentPath: string): string {
  const positionId = resolvePositionId(currentPath);
  let html = "";
  let currentSection = "";

  for (const item of navItems) {
    if (!positionId && item.id !== "positions") continue;
    if (item.section && item.section !== currentSection) {
      currentSection = item.section;
      html += `<div class="sidebar-section-label">${item.section}</div>`;
    }

    const href = item.id === "positions" ? "#/positions" : `#/positions/${positionId}${item.suffix}`;
    const isActive = isItemActive(item, currentPath);
    html += `
      <a href="${href}" class="sidebar-nav-item ${isActive ? "active" : ""}" data-id="${item.id}">
        ${item.icon}
        <span>${item.label}</span>
      </a>
    `;
  }
  return html;
}

function isItemActive(item: NavItem, currentPath: string): boolean {
  if (item.id === "positions") {
    return currentPath === "/positions" || currentPath === "/positions/new" || currentPath.endsWith("/edit") || currentPath === "/";
  }
  if (item.id === "criteria") {
    // The revision editor and the read-only historical view both live on
    // this same route family now (§5.3 — JD & Criteria merge).
    return currentPath.includes("/criteria");
  }
  if (item.id === "cvs") {
    // Screening (SCR-05) is a transient state of this same Candidates flow,
    // not a destination of its own, so it keeps this item highlighted.
    return currentPath.includes("/cv-workspace") || currentPath.includes("/screening-runs");
  }
  if (item.id === "ranking") {
    // Candidate Detail (SCR-07) only opens from Ranking or History; while
    // reading one, Ranking is still the meaningful parent context.
    return currentPath.includes("/ranking") || currentPath.includes("/candidates");
  }
  if (item.id === "runs") {
    // Run Comparison (SCR-10) only opens from History, picking two runs.
    return currentPath.includes("/runs") || currentPath.includes("/comparison");
  }
  return false;
}

function renderContextCard(positionId: string): string {
  const job = resolvePositionJob(positionId);
  if (!job) return '<div class="sidebar-context-card">Select a position to open its workspace.</div>';
  return `
    <div class="sidebar-context-card">
      <div class="sidebar-context-badge">Active Position</div>
      <div class="sidebar-context-title">${esc(job.title)} • ${esc(job.level ?? "—")}</div>
      <div class="sidebar-context-sub">${esc(job.readiness.ready_cv_count)} ready CVs</div>
    </div>
  `;
}

export function updateShell(currentPath: string): void {
  const positionId = resolvePositionId(currentPath);
  requestController?.abort();
  requestController = new AbortController();
  selectedJob = undefined;
  if (positionId) {
    const signal = requestController.signal;
    void getJob(positionId, signal).then(job => {
      if (signal.aborted) return;
      selectedJob = job;
      const footer = document.getElementById("sidebar-footer-container");
      if (footer) footer.innerHTML = renderContextCard(positionId);
      const breadcrumb = document.getElementById("topbar-breadcrumb");
      if (breadcrumb) breadcrumb.innerHTML = getBreadcrumbHtml(currentPath);
    }).catch(() => {});
  }

  const container = document.getElementById("sidebar-nav-container");
  if (container) {
    container.innerHTML = renderNavItems(currentPath);
  }

  const footer = document.getElementById("sidebar-footer-container");
  if (footer) {
    footer.innerHTML = renderContextCard(positionId);
  }

  const breadcrumbEl = document.getElementById("topbar-breadcrumb");
  if (breadcrumbEl) {
    breadcrumbEl.innerHTML = getBreadcrumbHtml(currentPath);
  }
}

function getBreadcrumbHtml(path: string): string {
  const positionId = resolvePositionId(path);
  const job = resolvePositionJob(positionId);
  const positionLink = `<a href="#/positions/${positionId}/ranking">${esc(job?.title ?? "Position")}</a>`;

  if (path === "/positions" || path === "/") {
    return `
      <a href="#/positions">Home</a>
      <span class="separator">/</span>
      <span class="current">Job Positions</span>
    `;
  }
  if (path === "/positions/new") {
    return `
      <a href="#/positions">Job Positions</a>
      <span class="separator">/</span>
      <span class="current">Create Position & JD</span>
    `;
  }
  if (path.includes("/criteria/new-revision")) {
    return `
      <a href="#/positions">Job Positions</a>
      <span class="separator">/</span>
      ${positionLink}
      <span class="separator">/</span>
      <span class="current">JD & Criteria — New Revision</span>
    `;
  }
  if (path.includes("/criteria")) {
    return `
      <a href="#/positions">Job Positions</a>
      <span class="separator">/</span>
      ${positionLink}
      <span class="separator">/</span>
      <span class="current">JD & Criteria</span>
    `;
  }
  if (path.includes("/cv-workspace")) {
    return `
      <a href="#/positions">Job Positions</a>
      <span class="separator">/</span>
      ${positionLink}
      <span class="separator">/</span>
      <span class="current">Candidates — CV Workspace</span>
    `;
  }
  if (path.includes("/screening-runs")) {
    return `
      <a href="#/positions">Job Positions</a>
      <span class="separator">/</span>
      ${positionLink}
      <span class="separator">/</span>
      <span class="current">Candidates — Screening in Progress</span>
    `;
  }
  if (path.includes("/candidates")) {
    return `
      <a href="#/positions">Job Positions</a>
      <span class="separator">/</span>
      ${positionLink}
      <span class="separator">/</span>
      <span class="current">Candidate Detail</span>
    `;
  }
  if (path.includes("/runs")) {
    return `
      <a href="#/positions">Job Positions</a>
      <span class="separator">/</span>
      ${positionLink}
      <span class="separator">/</span>
      <span class="current">History</span>
    `;
  }
  if (path.includes("/comparison")) {
    return `
      <a href="#/positions">Job Positions</a>
      <span class="separator">/</span>
      ${positionLink}
      <span class="separator">/</span>
      <a href="#/positions/${positionId}/runs">History</a>
      <span class="separator">/</span>
      <span class="current">Run Comparison</span>
    `;
  }
  return `
    <a href="#/positions">Job Positions</a>
    <span class="separator">/</span>
    <span class="current">${esc(job?.title ?? "Position")} — Screening & Ranking</span>
  `;
}
