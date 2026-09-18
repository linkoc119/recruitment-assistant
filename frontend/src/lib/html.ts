/**
 * Escape a value for interpolation into an HTML string.
 *
 * Every screen builds its markup with template literals and assigns it via
 * innerHTML. Anything that did not originate in this file must pass through
 * here first. Two sources matter:
 *   - route params, which come from the URL hash and are attacker-supplied;
 *   - candidate data, which is extracted from resumes uploaded by third
 *     parties, so a name or file name is untrusted text.
 */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Route identifiers are opaque ids, never free text. Validating them is
 * stricter than escaping and keeps them safe in a URL as well as in markup.
 */
export function safeId(value: string | undefined, fallback: string): string {
  return value && /^[A-Za-z0-9_-]+$/.test(value) ? value : fallback;
}

/** Only same-app hash routes may be assigned to window.location. */
export function isInternalRoute(href: string): boolean {
  return href.startsWith("#/");
}

/**
 * A `<tr>` spanning `colspan` columns, shown in place of a table's rows when
 * its backing list is empty (§8, item 5.1). `actionHtml`, if given, is
 * trusted markup the caller built (e.g. a "Create..." link) — it is not
 * escaped, unlike `message`.
 */
export function emptyStateRow(colspan: number, message: string, actionHtml = ""): string {
  return `
    <tr>
      <td colspan="${colspan}">
        <div class="empty-state">
          <p>${esc(message)}</p>
          ${actionHtml}
        </div>
      </td>
    </tr>
  `;
}

/**
 * Renders an ISO timestamp as "Sep 11, 2026 at 14:06". Several screens used
 * to spell this out as a literal string alongside the run/job it describes;
 * this keeps the format in one place so it stays derived from fixture data.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} at ${timePart}`;
}

/**
 * Makes every `tr.row-link[data-href]` in `container` navigate on click or
 * Enter, while leaving clicks on a nested link/button/input/select to that
 * control. Shared across screens whose table rows open a per-row detail
 * page (SCR-01, SCR-06, SCR-08) so the affordance — cursor, hover, keyboard
 * activation — stays identical everywhere it is used.
 */
export function wireRowLinks(container: HTMLElement): void {
  container.querySelectorAll<HTMLTableRowElement>("tr.row-link").forEach(row => {
    const href = row.dataset.href;
    if (!href || !isInternalRoute(href)) return;
    row.addEventListener("click", event => {
      if ((event.target as HTMLElement).closest("a, button, input, select")) return;
      window.location.hash = href;
    });
    row.addEventListener("keydown", event => {
      if (event.key === "Enter") window.location.hash = href;
    });
  });
}

/**
 * Inline SVG icons, sized to sit inline with text (badges, buttons, table
 * cells) at a given pixel size. These replace the ✓ ✕ ▲ ▼ ⚠ text-character
 * icons and the 💡 emoji per docs/ui-ux/ui-improvement-plan.md §6 (Phase 3,
 * item 3.3) — one icon system, not a mix of Unicode glyphs and SVG.
 */
function svgIcon(path: string, size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: -2px; flex-shrink: 0;">${path}</svg>`;
}

export function iconCheck(size = 12): string {
  return svgIcon(`<path d="M20 6L9 17l-5-5"></path>`, size);
}

export function iconX(size = 12): string {
  return svgIcon(`<path d="M18 6L6 18M6 6l12 12"></path>`, size);
}

export function iconArrowUp(size = 12): string {
  return svgIcon(`<path d="M12 19V5M5 12l7-7 7 7"></path>`, size);
}

export function iconArrowDown(size = 12): string {
  return svgIcon(`<path d="M12 5v14M19 12l-7 7-7-7"></path>`, size);
}

export function iconWarning(size = 12): string {
  return svgIcon(`<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"></path><path d="M12 9v4M12 17h.01"></path>`, size);
}

export function iconMoreHorizontal(size = 16): string {
  return svgIcon(`<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"></circle>`, size);
}
