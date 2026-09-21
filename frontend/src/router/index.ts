import type { RouteDefinition, RouteParams, ScreenModule } from "./types.js";
import { resolveDefaultLanding } from "./default-landing.js";
import { updateShell } from "../shell/index.js";
import { canLeave } from "../lib/screen.js";

function pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const escaped = path
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{(\w+)\\\}/g, (_match, name: string) => {
      paramNames.push(name);
      return "([^/]+)";
    });
  return { pattern: new RegExp(`^${escaped}$`), paramNames };
}

function route(path: string, load: () => Promise<ScreenModule>): RouteDefinition {
  const { pattern, paramNames } = pathToRegex(path);
  return { pattern, paramNames, load };
}

// screen-hierarchy.md §2.2 — the delivered hash routes, and how they differ
// from the canonical IA paths in §2. This list is the authority for both.
const routes: RouteDefinition[] = [
  route("/positions", () => import("../screens/scr-01-position-list/index.js")),
  route("/positions/new", () => import("../screens/scr-02-position-jd-form/index.js")),
  route("/positions/{position}/edit", () => import("../screens/scr-02-position-jd-form/index.js")),
  route("/positions/{position}/criteria", () => import("../screens/scr-03-criteria-review/index.js")),
  route("/positions/{position}/cv-workspace", () => import("../screens/scr-04-cv-workspace/index.js")),
  route("/positions/{position}/screening-runs/{run}", () => import("../screens/scr-05-screening-run/index.js")),
  route("/positions/{position}/ranking", () => import("../screens/scr-06-published-ranking/index.js")),
  route("/positions/{position}/candidates/{result}", () => import("../screens/scr-07-candidate-result/index.js")),
  route("/positions/{position}/runs", () => import("../screens/scr-08-run-history/index.js")),
  // A dedicated literal route for "new-revision" doesn't capture a
  // `revision` param, so the screen can't tell it apart from a draft — the
  // generic {revision} route below already covers it, since scr-03's
  // resolveMode() checks for the literal string "new-revision".
  route("/positions/{position}/criteria/{revision}", () => import("../screens/scr-03-criteria-review/index.js")),
  route("/positions/{position}/comparison", () => import("../screens/scr-10-run-comparison/index.js")),
];

let current: ScreenModule | null = null;
let generation = 0;
let lastPath = "";

function matchRoute(hashPath: string): { def: RouteDefinition; params: RouteParams } | null {
  for (const def of routes) {
    const match = def.pattern.exec(hashPath);
    if (match) {
      const params: RouteParams = {};
      def.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      return { def, params };
    }
  }
  return null;
}

async function render(hashPath: string): Promise<void> {
  const container = document.getElementById("app");
  if (!container) return;

  if (hashPath === lastPath && current) return;
  if (current && !canLeave()) { window.location.hash = `#${lastPath}`; return; }
  const version = ++generation;
  current?.unmount();
  current = null;
  lastPath = hashPath;
  const defaultLanding = await resolveDefaultLanding();
  if (version !== generation) return;
  const targetPath = hashPath === "/" ? defaultLanding : hashPath;
  const [pathname, search = ""] = targetPath.split("?");
  let matched;
  try { matched = matchRoute(pathname); } catch { matched = null; }
  if (!matched) { container.textContent = "Page not found. Select Job Positions to continue."; return; }
  const query = new URLSearchParams(search);
  for (const key of ["run", "left", "right"]) {
    const value = query.get(key);
    if (value === null) continue;
    if (!/^[1-9][0-9]*$/.test(value)) { container.textContent = "Invalid run reference. Open Run History to select a run."; return; }
    matched.params[key] = value;
  }

  updateShell(pathname);

  const mod = await matched.def.load();
  if (version !== generation) return;
  current = mod;
  await mod.mount(container, matched.params);
}

function currentHashPath(): string {
  const hash = window.location.hash;
  return hash.startsWith("#") ? hash.slice(1) || "/" : "/";
}

export function startRouter(): void {
  window.addEventListener("hashchange", () => {
    void render(currentHashPath());
  });
  void render(currentHashPath());
}
